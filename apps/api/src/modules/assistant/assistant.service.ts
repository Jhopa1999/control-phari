import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { AiModelCatalogService } from '../ai/ai-model-catalog.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { ASSISTANT_AGENT_CODE } from '../ai/ai-defaults';
import { decryptSecret } from '../ai/ai-crypto';
import {
  BEDROCK_CLIENT,
  BedrockClient,
  BedrockTimeoutError,
} from '../ai/bedrock.client';
import type {
  ConverseBlock,
  ConverseMessage,
  ConverseTool,
} from '../ai/bedrock-converse';
import {
  ASSISTANT_TOOL_GATEWAY,
  PROPOSAL_SUMMARY_FIELD,
  asProposalTool,
  missingRequired,
  proposalTitle,
  toolLabel,
  type AssistantTool,
  type AssistantToolGateway,
} from './assistant-tools';
import { AssistantProposalsService } from './assistant-proposals.service';
import {
  AssistantStatusDto,
  ChatRequestDto,
  ConversationDetailDto,
  ConversationSummaryDto,
  ProposalDto,
  ToolCallDto,
} from './dto/assistant.dto';

/** Maximo de rondas modelo -> herramientas en un mismo turno. */
export const MAX_TOOL_STEPS = 8;
/** Maximo de propuestas de accion que el asistente puede hacer en un turno. */
export const MAX_PROPOSALS_PER_TURN = 5;
/** Mensajes previos que se envian al modelo como contexto. */
const HISTORY_LIMIT = 30;
/** Largo maximo del titulo de una conversacion. */
const TITLE_MAX = 60;

/** Evento que el asistente emite hacia la interfaz (SSE). */
export type AssistantEvent =
  | { event: 'conversation'; data: { conversationId: string; title: string } }
  | { event: 'text'; data: { delta: string } }
  | {
      event: 'tool';
      data: {
        id: string;
        name: string;
        label: string;
        status: 'running' | 'done' | 'error';
      };
    }
  | { event: 'proposal'; data: ProposalDto }
  | { event: 'done'; data: { messageId: string } }
  | { event: 'error'; data: { message: string } };

/** Ejecucion de un turno ya validado; emite eventos hasta terminar. */
export type AssistantRun = (
  emit: (event: AssistantEvent) => void,
  signal: AbortSignal,
) => Promise<void>;

/** Titulo de la conversacion a partir del primer mensaje. */
export function titleFrom(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat;
}

/**
 * Convierte el historial guardado en mensajes de Converse: une mensajes
 * consecutivos del mismo rol (Converse exige alternancia) y descarta los
 * `assistant` iniciales (la conversacion debe empezar por el usuario).
 */
export function toConverseHistory(
  rows: ReadonlyArray<{ role: string; text: string }>,
): ConverseMessage[] {
  const out: ConverseMessage[] = [];
  for (const row of rows) {
    if (row.role !== 'user' && row.role !== 'assistant') continue;
    if (out.length === 0 && row.role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === row.role) {
      last.content.push({ type: 'text', text: row.text });
    } else {
      out.push({ role: row.role, content: [{ type: 'text', text: row.text }] });
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Asistente conversacional del portal (BL-032 F2). Bucle de agente sobre Bedrock
 * Converse cuya UNICA fuente de datos son las herramientas de SOLO LECTURA del
 * MCP, ejecutadas con el token de la persona (hereda su alcance y permisos).
 * Esta fase no escribe datos. El consumo se registra y el presupuesto mensual se
 * respeta. Las conversaciones son privadas de su dueño.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BEDROCK_CLIENT) private readonly bedrock: BedrockClient,
    @Inject(AiModelCatalogService) private readonly models: AiModelCatalogService,
    @Inject(AiUsageService) private readonly usage: AiUsageService,
    @Inject(ASSISTANT_TOOL_GATEWAY) private readonly gateway: AssistantToolGateway,
    @Inject(AssistantProposalsService)
    private readonly proposals: AssistantProposalsService,
  ) {}

  // ------------------------------------------------------------ disponibilidad

  /** Motivo por el que el asistente no esta disponible, o null si lo esta. */
  private async unavailableReason(): Promise<string | null> {
    if (!this.gateway.isConfigured()) {
      return 'El asistente no está configurado en este ambiente.';
    }
    const [globalRow, agent] = await Promise.all([
      this.prisma.aiGlobalConfig.findFirst(),
      this.prisma.aiAgentConfig.findUnique({ where: { code: ASSISTANT_AGENT_CODE } }),
    ]);
    if (!globalRow?.enabled || !agent?.enabled) {
      return 'El asistente está desactivado.';
    }
    const budget = await this.usage.budgetStatus();
    if (budget.exceeded) {
      return 'Se alcanzó el presupuesto mensual de IA.';
    }
    return null;
  }

  async getStatus(): Promise<AssistantStatusDto> {
    const reason = await this.unavailableReason();
    return { available: reason === null, reason };
  }

  // ------------------------------------------------------------- conversaciones

  async listConversations(actor: CurrentActor): Promise<ConversationSummaryDto[]> {
    const rows = await this.prisma.aiConversation.findMany({
      where: { userId: actor.userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async requireOwned(actor: CurrentActor, id: string) {
    const row = await this.prisma.aiConversation.findFirst({
      where: { id, userId: actor.userId },
    });
    if (!row) {
      throw new NotFoundException('Conversación no encontrada.');
    }
    return row;
  }

  async getConversation(
    actor: CurrentActor,
    id: string,
  ): Promise<ConversationDetailDto> {
    const conversation = await this.requireOwned(actor, id);
    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const proposalsByMessage = await this.proposals.byMessage(id);
    return {
      id: conversation.id,
      title: conversation.title,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role === 'assistant' ? 'assistant' : 'user',
        text: m.text,
        tools: Array.isArray(m.tools) ? (m.tools as unknown as ToolCallDto[]) : [],
        proposals: proposalsByMessage.get(m.id) ?? [],
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async removeConversation(actor: CurrentActor, id: string): Promise<void> {
    const conversation = await this.requireOwned(actor, id);
    await this.prisma.aiConversation.delete({ where: { id: conversation.id } });
  }

  // --------------------------------------------------------------------- chat

  /**
   * Valida y prepara un turno: identidad, disponibilidad, presupuesto y
   * conversacion. Lanza HTTP 409/404 ANTES de abrir el flujo SSE. Devuelve la
   * ejecucion que emite los eventos.
   */
  async prepareChat(
    actor: CurrentActor,
    authorization: string | undefined,
    dto: ChatRequestDto,
  ): Promise<AssistantRun> {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new ConflictException(
        'El asistente requiere iniciar sesión con tu cuenta.',
      );
    }
    const reason = await this.unavailableReason();
    if (reason) {
      throw new ConflictException(reason);
    }

    const [globalRow, agent] = await Promise.all([
      this.prisma.aiGlobalConfig.findFirst(),
      this.prisma.aiAgentConfig.findUnique({ where: { code: ASSISTANT_AGENT_CODE } }),
    ]);
    if (!globalRow || !agent) {
      throw new ConflictException('El asistente está desactivado.');
    }

    let credentials: { accessKeyId: string; secretAccessKey: string } | undefined;
    if ((globalRow.credentialMode ?? 'iam-role') === 'access-keys') {
      const accessKeyId = globalRow.awsAccessKeyId ?? '';
      const cipher = globalRow.awsSecretAccessKeyCipher ?? '';
      if (accessKeyId.trim() === '' || cipher.trim() === '') {
        throw new ConflictException('IA mal configurada');
      }
      try {
        credentials = { accessKeyId, secretAccessKey: decryptSecret(cipher) };
      } catch {
        throw new ConflictException('IA mal configurada');
      }
    }

    const conversation = dto.conversationId
      ? await this.requireOwned(actor, dto.conversationId)
      : await this.prisma.aiConversation.create({
          data: { userId: actor.userId, title: titleFrom(dto.message) },
        });

    await this.prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: 'user', text: dto.message },
    });

    return (emit, signal) =>
      this.run({
        actor,
        authorization,
        conversationId: conversation.id,
        title: conversation.title,
        agent,
        credentials,
        emit,
        signal,
      });
  }

  private systemPrompt(
    basePrompt: string,
    actor: CurrentActor,
    hasHelp: boolean,
    hasProposals: boolean,
  ): string {
    const roles = [...actor.roleCodes].join(', ') || 'sin rol';
    return [
      basePrompt,
      '',
      'Contexto de esta conversación:',
      `- Fecha actual: ${new Date().toISOString().slice(0, 10)}`,
      `- Persona: ${actor.name}`,
      `- Roles: ${roles}`,
      ...(hasHelp
        ? [
            '',
            'Para dudas sobre cómo usar el portal (pantallas, roles, flujo de trabajo) usa la herramienta help.search y responde con lo que devuelva, indicando la sección; si no aparece, di que no está documentado.',
          ]
        : []),
      ...(hasProposals
        ? [
            '',
            'Las herramientas que crean o modifican datos NO se ejecutan: registran una propuesta que la persona confirma o descarta en una tarjeta. Antes de proponer, reúne los datos con las herramientas de lectura y confirma con la persona lo que no sepas; usa nombres, no identificadores, en el resumen. Tras proponer, resume lo propuesto y pídele que la confirme. No repitas una propuesta ya hecha ni propongas decisiones (aprobar, autorizar, borrar).',
          ]
        : []),
    ].join('\n');
  }

  private async run(ctx: {
    actor: CurrentActor;
    authorization: string;
    conversationId: string;
    title: string;
    agent: {
      region: string;
      model: string;
      basePrompt: string;
      temperature: number;
      maxTokens: number;
      timeoutMs: number;
    };
    credentials?: { accessKeyId: string; secretAccessKey: string };
    emit: (event: AssistantEvent) => void;
    signal: AbortSignal;
  }): Promise<void> {
    const { actor, agent, emit, signal } = ctx;
    emit({
      event: 'conversation',
      data: { conversationId: ctx.conversationId, title: ctx.title },
    });

    let fullText = '';
    const toolSummaries: ToolCallDto[] = [];
    const proposalIds: string[] = [];
    let session: Awaited<ReturnType<AssistantToolGateway['open']>> | null = null;

    try {
      session = await this.gateway.open(ctx.authorization);
      const available: AssistantTool[] = await session.listTools();
      const byName = new Map(available.map((t) => [t.name, t]));
      const allowed = new Set(byName.keys());
      // El modelo ve las de lectura tal cual y las de escritura como PROPUESTA.
      const tools: ConverseTool[] = available.map((t) => (t.readOnly ? t : asProposalTool(t)));
      const hasProposals = available.some((t) => !t.readOnly);

      const recent = await this.prisma.aiMessage.findMany({
        where: { conversationId: ctx.conversationId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
      });
      const messages = toConverseHistory(recent.reverse());
      const system = this.systemPrompt(
        agent.basePrompt,
        actor,
        allowed.has('help.search'),
        hasProposals,
      );
      const withTemperature = await this.models.supportsTemperature(agent.model);

      for (let step = 0; step < MAX_TOOL_STEPS && !signal.aborted; step++) {
        let stepText = '';
        const toolUses: Array<{ toolUseId: string; name: string; input: unknown }> = [];
        let stopReason = 'other';
        const startedAt = Date.now();

        for await (const ev of this.bedrock.converseStream({
          region: agent.region,
          modelId: agent.model,
          system,
          messages,
          tools,
          ...(withTemperature ? { temperature: agent.temperature } : {}),
          maxTokens: agent.maxTokens,
          timeoutMs: agent.timeoutMs,
          ...(ctx.credentials ? { credentials: ctx.credentials } : {}),
        })) {
          if (signal.aborted) break;
          if (ev.type === 'text') {
            // Separa con un parrafo el texto de rondas distintas.
            const delta = stepText === '' && fullText !== '' ? `\n\n${ev.text}` : ev.text;
            stepText += ev.text;
            fullText += delta;
            emit({ event: 'text', data: { delta } });
          } else if (ev.type === 'toolUse') {
            toolUses.push(ev);
          } else {
            stopReason = ev.stopReason;
            await this.usage.record({
              userId: actor.userId,
              agentCode: ASSISTANT_AGENT_CODE,
              modelId: agent.model,
              usage: ev.usage,
              durationMs: Date.now() - startedAt,
            });
          }
        }
        if (signal.aborted) break;

        if (stopReason !== 'tool_use' || toolUses.length === 0) {
          if (stopReason === 'max_tokens') {
            const note = '\n\n_La respuesta se cortó por su longitud. Pídeme que continúe._';
            fullText += note;
            emit({ event: 'text', data: { delta: note } });
          }
          break;
        }

        const assistantBlocks: ConverseBlock[] = [
          ...(stepText ? [{ type: 'text' as const, text: stepText }] : []),
          ...toolUses.map((t) => ({ type: 'toolUse' as const, ...t })),
        ];
        messages.push({ role: 'assistant', content: assistantBlocks });

        const results: ConverseBlock[] = [];
        for (const use of toolUses) {
          const found = byName.get(use.name);
          if (found && !found.readOnly) {
            // Escritura: nunca se ejecuta desde el modelo; se registra una propuesta.
            const outcome = await this.proposeAction(ctx, found, use.input, proposalIds, emit);
            results.push({
              type: 'toolResult',
              toolUseId: use.toolUseId,
              text: outcome.text,
              isError: outcome.isError,
            });
            continue;
          }
          const label = toolLabel(use.name);
          emit({
            event: 'tool',
            data: { id: use.toolUseId, name: use.name, label, status: 'running' },
          });
          let text: string;
          let isError: boolean;
          if (!allowed.has(use.name)) {
            text = 'Herramienta no disponible para el asistente.';
            isError = true;
          } else {
            try {
              const result = await session.callTool(use.name, asRecord(use.input));
              text = result.text;
              isError = result.isError;
            } catch {
              text = 'La consulta falló. Inténtalo de nuevo o indica que no pudiste obtener el dato.';
              isError = true;
            }
          }
          const status = isError ? 'error' : 'done';
          toolSummaries.push({ name: use.name, label, status });
          emit({
            event: 'tool',
            data: { id: use.toolUseId, name: use.name, label, status },
          });
          results.push({ type: 'toolResult', toolUseId: use.toolUseId, text, isError });
        }
        messages.push({ role: 'user', content: results });

        if (step === MAX_TOOL_STEPS - 1) {
          const note =
            '\n\n_Alcancé el límite de consultas de este turno. Pídeme que continúe si falta algo._';
          fullText += note;
          emit({ event: 'text', data: { delta: note } });
        }
      }

      const messageId = await this.saveAssistantMessage(
        ctx.conversationId,
        fullText,
        toolSummaries,
      );
      await this.proposals.attachToMessage(proposalIds, messageId);
      if (!signal.aborted) {
        emit({ event: 'done', data: { messageId } });
      }
    } catch (error) {
      this.logger.error(
        `Fallo del asistente: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
      // Conserva lo ya generado para que la conversacion no pierda el turno.
      if (fullText.trim() !== '' || proposalIds.length > 0) {
        const savedId = await this.saveAssistantMessage(
          ctx.conversationId,
          fullText,
          toolSummaries,
        ).catch(() => undefined);
        if (savedId) {
          await this.proposals.attachToMessage(proposalIds, savedId).catch(() => undefined);
        }
      }
      emit({
        event: 'error',
        data: {
          message:
            error instanceof BedrockTimeoutError
              ? 'El asistente no respondió a tiempo. Inténtalo de nuevo.'
              : 'El asistente no pudo completar la respuesta. Inténtalo de nuevo.',
        },
      });
    } finally {
      if (session) {
        await session.close().catch(() => undefined);
      }
    }
  }

  /**
   * Una herramienta de escritura pedida por el modelo NO se ejecuta: se valida
   * lo mínimo (resumen para la persona y campos obligatorios), se registra una
   * propuesta PENDIENTE y se avisa a la interfaz para que muestre la tarjeta.
   * Lo que se devuelve al modelo es un texto que le indica que espere la
   * confirmación de la persona.
   */
  private async proposeAction(
    ctx: { actor: CurrentActor; conversationId: string },
    tool: AssistantTool,
    input: unknown,
    proposalIds: string[],
    emit: (event: AssistantEvent) => void,
  ): Promise<{ text: string; isError: boolean }> {
    const fail = (text: string): { text: string; isError: boolean } => ({ text, isError: true });
    const { [PROPOSAL_SUMMARY_FIELD]: summaryRaw, ...args } = asRecord(input);
    const summary = typeof summaryRaw === 'string' ? summaryRaw.trim() : '';
    if (summary === '') {
      return fail(
        `Falta ${PROPOSAL_SUMMARY_FIELD}: describe en una frase, con nombres, qué hará esta acción.`,
      );
    }
    if (proposalIds.length >= MAX_PROPOSALS_PER_TURN) {
      return fail(
        'Ya hiciste el máximo de propuestas de este turno. Pídele a la persona que confirme o descarte las anteriores antes de preparar más.',
      );
    }
    const missing = missingRequired(tool.inputSchema, args);
    if (missing.length > 0) {
      return fail(
        `Faltan datos obligatorios: ${missing.join(', ')}. Pregúntaselos a la persona o consúltalos con las herramientas de lectura antes de proponer.`,
      );
    }
    const proposal = await this.proposals.create({
      userId: ctx.actor.userId,
      conversationId: ctx.conversationId,
      toolName: tool.name,
      summary: summary.slice(0, 500),
      args,
    });
    proposalIds.push(proposal.id);
    emit({ event: 'proposal', data: proposal });
    return {
      text:
        `Propuesta «${proposalTitle(tool.name)}» registrada (id ${proposal.id}). NO se ejecutó: ` +
        'la persona debe confirmarla o descartarla en la tarjeta que ve en pantalla. ' +
        'Resume brevemente lo propuesto y pídele que la confirme.',
      isError: false,
    };
  }

  /** Guarda el turno del asistente y actualiza la conversacion. */
  private async saveAssistantMessage(
    conversationId: string,
    text: string,
    tools: ToolCallDto[],
  ): Promise<string> {
    const message = await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        text: text.trim() === '' ? '(Sin respuesta)' : text,
        tools: tools.length > 0 ? (tools as unknown as object) : undefined,
      },
    });
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return message.id;
  }
}
