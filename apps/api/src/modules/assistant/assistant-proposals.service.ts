import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import {
  ASSISTANT_TOOL_GATEWAY,
  isProposalTool,
  proposalTitle,
  type AssistantToolGateway,
} from './assistant-tools';
import { ProposalDto, type ProposalStatus } from './dto/assistant.dto';
import type { AiProposalModel } from '../../generated/prisma/models/AiProposal';

/** Una propuesta sin respuesta vence a las 24 horas. */
export const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
/** Una ejecución que lleva más de esto sin terminar se considera interrumpida. */
export const EXECUTION_STALE_MS = 10 * 60 * 1000;
/** Tope de caracteres que se guardan del resultado o del error. */
const MAX_STORED_CHARS = 4000;
const MAX_ERROR_CHARS = 500;

/** Datos para registrar una propuesta nueva. */
export interface NewProposal {
  userId: string;
  conversationId: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Id y título del registro que devolvió la acción (si la respuesta es un objeto JSON). */
export function extractResult(text: string | null): { id: string | null; title: string | null } {
  if (!text) return { id: null, title: null };
  try {
    const parsed = asRecord(JSON.parse(text));
    const id = typeof parsed.id === 'string' ? parsed.id : null;
    const title =
      typeof parsed.title === 'string'
        ? parsed.title
        : typeof parsed.name === 'string'
          ? parsed.name
          : null;
    return { id, title };
  } catch {
    return { id: null, title: null };
  }
}

/**
 * Propuestas de acción del asistente (BL-032 F3). El asistente nunca escribe
 * datos: cada escritura queda como propuesta PENDIENTE y solo se ejecuta cuando
 * la propia persona la confirma. Al confirmar, la misma llamada se hace por el
 * MCP con el token de esa persona, de modo que la API aplica sus permisos y
 * audita la escritura como cualquier otra. Las propuestas son privadas.
 */
@Injectable()
export class AssistantProposalsService {
  private readonly logger = new Logger(AssistantProposalsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ASSISTANT_TOOL_GATEWAY) private readonly gateway: AssistantToolGateway,
  ) {}

  // ------------------------------------------------------------ representación

  /** Estado visible: calcula el vencimiento y las ejecuciones interrumpidas. */
  effectiveStatus(row: AiProposalModel, now: Date = new Date()): ProposalStatus {
    const age = now.getTime() - row.createdAt.getTime();
    if (row.status === 'PENDIENTE' && age > PROPOSAL_TTL_MS) return 'EXPIRADA';
    if (row.status === 'EJECUTANDO') {
      const since = (row.resolvedAt ?? row.createdAt).getTime();
      if (now.getTime() - since > EXECUTION_STALE_MS) return 'FALLIDA';
    }
    return row.status as ProposalStatus;
  }

  toDto(row: AiProposalModel, now: Date = new Date()): ProposalDto {
    const status = this.effectiveStatus(row, now);
    const { id, title } = extractResult(row.resultText);
    let error: string | null = row.errorText;
    if (status === 'EXPIRADA') {
      error = 'La propuesta venció sin respuesta. Pídele al asistente que la vuelva a preparar.';
    } else if (status === 'FALLIDA' && row.status === 'EJECUTANDO') {
      error = 'La ejecución se interrumpió. Revisa en el portal si se aplicó antes de repetirla.';
    }
    return {
      id: row.id,
      toolName: row.toolName,
      title: proposalTitle(row.toolName),
      summary: row.summary,
      args: asRecord(row.args),
      status,
      resultId: id,
      resultTitle: title,
      error: status === 'CONFIRMADA' || status === 'PENDIENTE' || status === 'DESCARTADA' ? null : error,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ------------------------------------------------------------------ registro

  async create(input: NewProposal): Promise<ProposalDto> {
    const row = await this.prisma.aiProposal.create({
      data: {
        conversationId: input.conversationId,
        userId: input.userId,
        toolName: input.toolName,
        summary: input.summary,
        args: input.args as object,
      },
    });
    return this.toDto(row);
  }

  /** Asocia las propuestas de un turno al mensaje del asistente ya guardado. */
  async attachToMessage(ids: ReadonlyArray<string>, messageId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.aiProposal.updateMany({
      where: { id: { in: [...ids] } },
      data: { messageId },
    });
  }

  /** Propuestas de una conversación agrupadas por mensaje. */
  async byMessage(conversationId: string): Promise<Map<string, ProposalDto[]>> {
    const rows = await this.prisma.aiProposal.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map<string, ProposalDto[]>();
    for (const row of rows) {
      if (!row.messageId) continue;
      const list = map.get(row.messageId) ?? [];
      list.push(this.toDto(row));
      map.set(row.messageId, list);
    }
    return map;
  }

  // --------------------------------------------------------------- resolución

  private async requireOwned(actor: CurrentActor, id: string): Promise<AiProposalModel> {
    const row = await this.prisma.aiProposal.findFirst({
      where: { id, userId: actor.userId },
    });
    if (!row) {
      throw new NotFoundException('Propuesta no encontrada.');
    }
    return row;
  }

  private assertPending(row: AiProposalModel): void {
    const status = this.effectiveStatus(row);
    if (status === 'PENDIENTE') return;
    const reason: Record<string, string> = {
      EXPIRADA: 'La propuesta venció. Pídele al asistente que la vuelva a preparar.',
      CONFIRMADA: 'La propuesta ya se confirmó.',
      DESCARTADA: 'La propuesta ya se descartó.',
      EJECUTANDO: 'La propuesta se está ejecutando.',
      FALLIDA: 'La propuesta ya se intentó y falló. Pídele al asistente que la vuelva a preparar.',
    };
    throw new ConflictException(reason[status] ?? 'La propuesta ya no está pendiente.');
  }

  async discard(actor: CurrentActor, id: string): Promise<ProposalDto> {
    const row = await this.requireOwned(actor, id);
    this.assertPending(row);
    const { count } = await this.prisma.aiProposal.updateMany({
      where: { id, userId: actor.userId, status: 'PENDIENTE' },
      data: { status: 'DESCARTADA', resolvedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException('La propuesta ya no está pendiente.');
    }
    return this.toDto(await this.requireOwned(actor, id));
  }

  /**
   * Confirma y ejecuta. La transición PENDIENTE -> EJECUTANDO es atómica: dos
   * confirmaciones simultáneas no ejecutan dos veces. El resultado del MCP (que
   * trae el error de la API en español si fue rechazada) queda en la propuesta.
   */
  async confirm(
    actor: CurrentActor,
    authorization: string | undefined,
    id: string,
  ): Promise<ProposalDto> {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new ConflictException('Para confirmar necesitas iniciar sesión con tu cuenta.');
    }
    const row = await this.requireOwned(actor, id);
    this.assertPending(row);
    if (!isProposalTool(row.toolName)) {
      throw new ConflictException('Esta acción ya no está permitida para el asistente.');
    }
    if (!this.gateway.isConfigured()) {
      throw new ConflictException('El asistente no está configurado en este ambiente.');
    }

    const claimed = await this.prisma.aiProposal.updateMany({
      where: { id, userId: actor.userId, status: 'PENDIENTE' },
      data: { status: 'EJECUTANDO', resolvedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ConflictException('La propuesta ya no está pendiente.');
    }

    let outcome: { status: 'CONFIRMADA' | 'FALLIDA'; resultText: string | null; errorText: string | null };
    let session: Awaited<ReturnType<AssistantToolGateway['open']>> | null = null;
    try {
      session = await this.gateway.open(authorization);
      const result = await session.callTool(row.toolName, asRecord(row.args));
      outcome = result.isError
        ? { status: 'FALLIDA', resultText: null, errorText: result.text.slice(0, MAX_ERROR_CHARS) }
        : { status: 'CONFIRMADA', resultText: result.text.slice(0, MAX_STORED_CHARS), errorText: null };
    } catch (error) {
      this.logger.error(
        `Fallo al ejecutar la propuesta ${id}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
      outcome = {
        status: 'FALLIDA',
        resultText: null,
        errorText: 'No se pudo ejecutar la acción. Inténtalo de nuevo más tarde.',
      };
    } finally {
      if (session) await session.close().catch(() => undefined);
    }

    const updated = await this.prisma.aiProposal.update({
      where: { id },
      data: {
        status: outcome.status,
        resultText: outcome.resultText,
        errorText: outcome.errorText,
        resolvedAt: new Date(),
      },
    });
    return this.toDto(updated);
  }
}
