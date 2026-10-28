import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RequestStateService } from '../request/request-state.service';
import { decryptSecret } from './ai-crypto';
import {
  BEDROCK_CLIENT,
  BedrockClient,
  BedrockTimeoutError,
} from './bedrock.client';
import {
  DuplicateCandidateDto,
  TriageSuggestionResponseDto,
} from './dto/triage-suggestion-response.dto';
import type { RequestModel } from '../../generated/prisma/models/Request';

/** Agente de IA que atiende la sugerencia de triage. */
const TRIAGE_AGENT_CODE = 'TRIAGE';

/** Catalogos (maestras) de los cinco codes que la sugerencia puede proponer. */
const TRIAGE_CATALOGS = {
  suggestedRouteCode: 'TRIAGE_ROUTE',
  suggestedDemandTypeCode: 'DEMAND_TYPE',
  suggestedCriticalityCode: 'CRITICALITY',
  suggestedSizeCode: 'TRIAGE_SIZE',
  suggestedDataAvailabilityCode: 'DATA_AVAILABILITY',
} as const;

type SuggestedCodeKey = keyof typeof TRIAGE_CATALOGS;

/**
 * Agente de sugerencia de triage (IA Fase 1, FEAT-001). SUGIERE, no persiste:
 * nunca escribe en BD. Reutiliza RequestStateService.requireInScope (404 fuera
 * de alcance) y degrada con elegancia segun design §7 (apagado -> 409 sin tocar
 * Bedrock; timeout -> 503; salida invalida -> 422; descifrado fallido -> 409).
 * Nunca devuelve 500 con stack ni filtra secretos/prompt/payload.
 */
@Injectable()
export class TriageSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: RequestStateService,
    @Inject(BEDROCK_CLIENT) private readonly bedrock: BedrockClient,
  ) {}

  async suggest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<TriageSuggestionResponseDto> {
    // 1) Alcance: 404 si la solicitud no esta en el alcance del actor.
    const request = await this.state.requireInScope(actor, requestId);

    // 2) Flags en orden: global primero, luego el agente. Apagado -> 409 SIN
    // invocar Bedrock.
    const [globalRow, agent] = await Promise.all([
      this.prisma.aiGlobalConfig.findFirst(),
      this.prisma.aiAgentConfig.findUnique({
        where: { code: TRIAGE_AGENT_CODE },
      }),
    ]);

    if (!globalRow?.enabled || !agent?.enabled) {
      throw new ConflictException('La sugerencia de IA esta desactivada.');
    }

    // 3) Contexto: maestras activas (code/label) + solicitudes en alcance como
    // candidatas a duplicado + ficha de la solicitud. El prompt se arma con el
    // basePrompt de BD.
    const [catalogItems, inScopeRequests] = await Promise.all([
      this.prisma.catalogItem.findMany({
        where: {
          active: true,
          catalog: { in: Object.values(TRIAGE_CATALOGS) },
        },
        select: { catalog: true, code: true, label: true },
        orderBy: [{ catalog: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.loadInScopeRequests(actor, request),
    ]);

    const inScopeIds = new Set(inScopeRequests.map((r) => r.id));
    const prompt = this.buildPrompt(
      agent.basePrompt,
      request,
      catalogItems,
      inScopeRequests,
    );

    // 4) Credenciales: en access-keys, descifrar justo antes de invocar; si
    // falla -> 409 "IA mal configurada".
    let credentials:
      | { accessKeyId: string; secretAccessKey: string }
      | undefined;
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

    // 5) Invocar con el timeout de BD. Timeout -> 503; otro fallo -> 503
    // generico (sin stack).
    let raw: string;
    try {
      raw = await this.bedrock.invoke({
        region: agent.region,
        modelId: agent.model,
        prompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        timeoutMs: agent.timeoutMs,
        ...(credentials ? { credentials } : {}),
      });
    } catch (error) {
      if (error instanceof BedrockTimeoutError) {
        throw new ServiceUnavailableException('La IA no respondio a tiempo.');
      }
      throw new ServiceUnavailableException(
        'La IA no esta disponible en este momento.',
      );
    }

    // 6) Parsear JSON (no-JSON -> 422).
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new UnprocessableEntityException(
        'La IA devolvio una respuesta que no se pudo interpretar.',
      );
    }

    // 7) Validar contra el DTO (invalido -> 422).
    const dto = plainToInstance(TriageSuggestionResponseDto, parsed, {
      enableImplicitConversion: false,
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length > 0) {
      throw new UnprocessableEntityException(
        'La sugerencia de IA no tiene el formato esperado.',
      );
    }

    // El modelo/agente los fija el backend (no se confia en lo que diga la IA).
    dto.model = agent.model;
    dto.agentCode = TRIAGE_AGENT_CODE;

    // 8) Verificar cada suggested*Code contra el catalogo activo; code inventado
    // -> null + nota en missingInformation.
    const activeCodesByCatalog = new Map<string, Set<string>>();
    for (const item of catalogItems) {
      if (!activeCodesByCatalog.has(item.catalog)) {
        activeCodesByCatalog.set(item.catalog, new Set());
      }
      activeCodesByCatalog.get(item.catalog)!.add(item.code);
    }
    const notes: string[] = Array.isArray(dto.missingInformation)
      ? [...dto.missingInformation]
      : [];
    for (const key of Object.keys(TRIAGE_CATALOGS) as SuggestedCodeKey[]) {
      const value = dto[key];
      if (value === null || value === undefined) {
        dto[key] = null;
        continue;
      }
      const catalog = TRIAGE_CATALOGS[key];
      const valid = activeCodesByCatalog.get(catalog)?.has(value) ?? false;
      if (!valid) {
        dto[key] = null;
        notes.push(
          `La IA sugirio un code no valido para ${catalog}; se descarto.`,
        );
      }
    }
    dto.missingInformation = notes;

    // 9) Descartar duplicados cuyo requestId no estaba en el contexto (la IA no
    // puede referenciar solicitudes fuera de alcance).
    dto.possibleDuplicates = (dto.possibleDuplicates ?? []).filter(
      (d: DuplicateCandidateDto) => inScopeIds.has(d.requestId),
    );

    return dto;
  }

  /**
   * Solicitudes en el alcance del actor (excluyendo la actual), como universo
   * cerrado de candidatas a duplicado. Reusa la misma logica de alcance del
   * modulo request: jefe ve toda el area; no-jefe filtra por sus procesos.
   */
  private async loadInScopeRequests(
    actor: CurrentActor,
    current: RequestModel,
  ): Promise<Array<{ id: string; title: string }>> {
    const scope = actor.isJefeArea
      ? {}
      : { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
    return this.prisma.request.findMany({
      where: { AND: [{ id: { not: current.id } }, scope] },
      select: { id: true, title: true },
      orderBy: { registeredAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Arma el prompt enviado a Bedrock: el basePrompt configurable + la ficha de
   * la solicitud + las opciones (code/label) de las cinco maestras + las
   * solicitudes candidatas a duplicado. Todo como contexto estructurado para que
   * la IA solo elija codes provistos y solo referencie requestId del contexto.
   */
  private buildPrompt(
    basePrompt: string,
    request: RequestModel,
    catalogItems: Array<{ catalog: string; code: string; label: string }>,
    inScopeRequests: Array<{ id: string; title: string }>,
  ): string {
    const optionsByCatalog: Record<string, Array<{ code: string; label: string }>> = {};
    for (const item of catalogItems) {
      (optionsByCatalog[item.catalog] ??= []).push({
        code: item.code,
        label: item.label,
      });
    }

    const context = {
      request: {
        id: request.id,
        title: request.title,
        requesterArea: request.requesterArea,
        requesterName: request.requesterName,
        functionalOwner: request.functionalOwner,
        expectedResult: request.expectedResult,
        referenceUrl: request.referenceUrl,
      },
      catalogOptions: optionsByCatalog,
      duplicateCandidates: inScopeRequests,
    };

    return [
      basePrompt,
      '',
      'Contexto (JSON):',
      JSON.stringify(context),
    ].join('\n');
  }
}
