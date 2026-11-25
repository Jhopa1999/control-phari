import {
  ConflictException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../../../database/prisma.service';
import { CurrentActor } from '../../auth/current-actor';
import { extractJsonObject } from '../../ai/ai-json';
import { decryptSecret } from '../../ai/ai-crypto';
import { AiModelCatalogService } from '../../ai/ai-model-catalog.service';
import { AiUsageService } from '../../ai/ai-usage.service';
import {
  MEETINGS_AGENT_CODE,
  MEETINGS_BASE_PROMPT,
  MEETINGS_OUTPUT_CONTRACT,
  composeStructuredPrompt,
} from '../../ai/ai-defaults';
import {
  BEDROCK_CLIENT,
  BedrockClient,
  BedrockTimeoutError,
} from '../../ai/bedrock.client';
import { CoordinationScopeService } from '../coordination-scope.service';
import { DATE_PATTERN, dateStringToDate, dateToString } from '../date';
import {
  MEETING_AI_MAX_INPUT_CHARS,
  MeetingAiAvailabilityDto,
  MeetingAiCommitmentDto,
  MeetingAiStructureResponseDto,
  StructureMeetingAiDto,
} from './dto/meeting-ai.dto';
import { ModelMeetingOutput } from './meeting-ai-output';

/**
 * Topes de la ayuda de IA del acta. Son valores por defecto seguros en código
 * (decisión D8): el prompt, el modelo, la temperatura y el timeout viven en el
 * agente `ACTAS` editable desde Administración.
 */
export { MEETING_AI_MAX_INPUT_CHARS };
export const MEETING_AI_MAX_COMMITMENTS = 20;
/** Personas del proceso que se ofrecen al modelo como candidatas a responsable. */
const MAX_CANDIDATES = 100;
/** Años hacia adelante que se aceptan en la fecha de un compromiso propuesto. */
const MAX_DUE_YEARS_AHEAD = 5;

/** Máximos de los DTO de acta y compromiso: el resultado se puede guardar sin 400. */
const MAX_TITLE = 300;
const MAX_MINUTES_FIELD = 5000;
const MAX_COMMITMENT_TEXT = 2000;
const MAX_QUOTE = 500;
const MAX_ASSIGNEE_TEXT = 120;
const MAX_WARNING = 300;

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Ayuda de IA del acta (Reuniones PR-3). SUGIERE, no persiste: ni el acta ni los
 * compromisos se crean aquí. Sigue el patrón de TriageSuggestionService: alcance,
 * flags global y de agente (409), presupuesto (409), prompt de BD, timeout (503),
 * parseo tolerante, validación (422) y descarte de lo inventado contra el
 * universo del contexto. No guarda el texto ni la respuesta; solo el consumo.
 */
@Injectable()
export class MeetingAiService {
  // @Inject explícitos: el generador de OpenAPI corre con tsx (esbuild), que no
  // emite `design:paramtypes` de forma fiable (ver TriageSuggestionService).
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CoordinationScopeService) private readonly scope: CoordinationScopeService,
    @Inject(BEDROCK_CLIENT) private readonly bedrock: BedrockClient,
    @Inject(AiModelCatalogService) private readonly models: AiModelCatalogService,
    @Inject(AiUsageService) private readonly usage: AiUsageService,
  ) {}

  /** Estado de la ayuda para mostrar, ocultar o desactivar el botón. */
  async availability(): Promise<MeetingAiAvailabilityDto> {
    const [globalRow, agent] = await Promise.all([
      this.prisma.aiGlobalConfig.findFirst(),
      this.prisma.aiAgentConfig.findUnique({ where: { code: MEETINGS_AGENT_CODE } }),
    ]);
    if (!globalRow?.enabled || !agent?.enabled) {
      return { status: 'off', message: 'La ayuda de IA para actas está apagada.' };
    }
    const budget = await this.usage.budgetStatus();
    if (budget.exceeded) {
      return {
        status: 'unavailable',
        message: 'Se alcanzó el presupuesto mensual de IA.',
      };
    }
    return { status: 'available' };
  }

  async structure(
    actor: CurrentActor,
    dto: StructureMeetingAiDto,
  ): Promise<MeetingAiStructureResponseDto> {
    // 1) Alcance: personas del proceso (403 si el actor no pertenece; 400 si no existe).
    const people = await this.scope.listProcessPeople(actor, dto.processId);
    const meetingDate = dateStringToDate(dto.meetingDate);
    const text = dto.text.trim();
    if (text.length > MEETING_AI_MAX_INPUT_CHARS) {
      throw new PayloadTooLargeException(
        `El texto es demasiado largo: el máximo es de ${MEETING_AI_MAX_INPUT_CHARS} caracteres.`,
      );
    }

    // 2) Flags: global primero, luego el agente. Apagado -> 409 sin invocar el modelo.
    const [globalRow, agent] = await Promise.all([
      this.prisma.aiGlobalConfig.findFirst(),
      this.prisma.aiAgentConfig.findUnique({ where: { code: MEETINGS_AGENT_CODE } }),
    ]);
    if (!globalRow?.enabled || !agent?.enabled) {
      throw new ConflictException('La ayuda de IA para actas está desactivada.');
    }
    // 2b) Presupuesto mensual.
    await this.usage.assertWithinBudget();

    // 3) Contexto: personas con alias (participantes primero), sin ids ni correos.
    const participantIds = new Set(dto.participantUserIds ?? []);
    const candidates = [...people]
      .sort((a, b) => Number(participantIds.has(b.id)) - Number(participantIds.has(a.id)))
      .slice(0, MAX_CANDIDATES);
    const byAlias = new Map<number, string>(candidates.map((p, i) => [i + 1, p.id]));
    const context = {
      fechaReunion: dto.meetingDate,
      personas: candidates.map((p, i) => ({
        alias: i + 1,
        nombre: p.name,
        participante: participantIds.has(p.id),
      })),
      notasDeLaReunion: text,
    };
    // Prompt editable + contrato de salida fijo + contexto (ver ai-defaults.ts).
    const prompt = composeStructuredPrompt(
      agent.basePrompt,
      MEETINGS_BASE_PROMPT,
      MEETINGS_OUTPUT_CONTRACT,
      context,
    );

    // 4) Credenciales (access-keys): descifrar justo antes de invocar.
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

    // 5) Invocar con el timeout de BD. Fallo o timeout -> 503 sin detalles.
    let raw: string;
    try {
      const withTemperature = await this.models.supportsTemperature(agent.model);
      const startedAt = Date.now();
      const result = await this.bedrock.converse({
        region: agent.region,
        modelId: agent.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        ...(withTemperature ? { temperature: agent.temperature } : {}),
        maxTokens: agent.maxTokens,
        timeoutMs: agent.timeoutMs,
        ...(credentials ? { credentials } : {}),
      });
      await this.usage.record({
        userId: actor.userId,
        agentCode: MEETINGS_AGENT_CODE,
        modelId: agent.model,
        usage: result.usage,
        durationMs: Date.now() - startedAt,
      });
      raw = result.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (error) {
      if (error instanceof BedrockTimeoutError) {
        throw new ServiceUnavailableException('La IA no respondió a tiempo.');
      }
      throw new ServiceUnavailableException('La IA no está disponible en este momento.');
    }

    // 6) Parseo tolerante y validación (422).
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch {
      throw new UnprocessableEntityException(
        'La IA devolvió una respuesta que no se pudo interpretar.',
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new UnprocessableEntityException(
        'La IA devolvió una respuesta que no se pudo interpretar.',
      );
    }
    const output = plainToInstance(ModelMeetingOutput, parsed, {
      enableImplicitConversion: false,
    });
    if (validateSync(output, { whitelist: true, forbidNonWhitelisted: false }).length > 0) {
      throw new UnprocessableEntityException('La propuesta de la IA no tiene el formato esperado.');
    }

    // 7) Descartar lo inventado, recortar y fijar modelo y agente desde el backend.
    const warnings: string[] = [];
    const clip = (value: string, max: number, label: string): string => {
      if (value.length <= max) return value;
      warnings.push(`Se recortó ${label} al máximo permitido.`);
      return value.slice(0, max).trimEnd();
    };
    const minDue = dto.meetingDate;
    const maxDue = dateToString(
      new Date(
        Date.UTC(
          meetingDate.getUTCFullYear() + MAX_DUE_YEARS_AHEAD,
          meetingDate.getUTCMonth(),
          meetingDate.getUTCDate(),
        ),
      ),
    );

    const modelCommitments = (output.commitments ?? []).filter((c) => clean(c.title) !== '');
    if (modelCommitments.length > MEETING_AI_MAX_COMMITMENTS) {
      warnings.push(
        `La IA propuso más de ${MEETING_AI_MAX_COMMITMENTS} compromisos; se muestran los primeros.`,
      );
    }
    const commitments: MeetingAiCommitmentDto[] = [];
    for (const item of modelCommitments.slice(0, MEETING_AI_MAX_COMMITMENTS)) {
      const title = clip(clean(item.title), MAX_TITLE, 'un título');
      let assignedUserId: string | null = null;
      if (item.assigneeAlias !== undefined && item.assigneeAlias !== null) {
        assignedUserId = byAlias.get(item.assigneeAlias) ?? null;
        if (assignedUserId === null) {
          warnings.push(`Se descartó un responsable no reconocido en «${title}».`);
        }
      }
      let dueDate: string | null = null;
      const rawDue = clean(item.dueDate);
      if (rawDue !== '') {
        dueDate = this.validDueDate(rawDue, minDue, maxDue);
        if (dueDate === null) {
          warnings.push(`Se dejó sin fecha «${title}»: la fecha propuesta no es válida o es anterior a la reunión.`);
        }
      }
      const assigneeText = clean(item.assigneeText);
      const expectedResult = clean(item.expectedResult);
      commitments.push({
        title,
        assignedUserId,
        assigneeText: assigneeText === '' ? null : clip(assigneeText, MAX_ASSIGNEE_TEXT, 'un nombre'),
        dueDate,
        expectedResult:
          expectedResult === '' ? null : clip(expectedResult, MAX_COMMITMENT_TEXT, 'un resultado esperado'),
        sourceQuote: clip(clean(item.sourceQuote), MAX_QUOTE, 'una frase de origen'),
      });
    }

    const modelWarnings = (output.warnings ?? [])
      .map((w) => clean(w).slice(0, MAX_WARNING))
      .filter((w) => w !== '');

    return {
      agenda: clip(clean(output.agenda), MAX_MINUTES_FIELD, 'la agenda'),
      decisions: clip(clean(output.decisions), MAX_MINUTES_FIELD, 'las decisiones'),
      notes: clip(clean(output.notes), MAX_MINUTES_FIELD, 'las observaciones'),
      commitments,
      warnings: [...modelWarnings, ...warnings],
      model: agent.model,
      agentCode: MEETINGS_AGENT_CODE,
    };
  }

  /** Fecha real YYYY-MM-DD dentro de [min, max]; si no, null. */
  private validDueDate(value: string, min: string, max: string): string | null {
    if (!DATE_PATTERN.test(value)) return null;
    try {
      dateStringToDate(value);
    } catch {
      return null;
    }
    return value >= min && value <= max ? value : null;
  }
}
