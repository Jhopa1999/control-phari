import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequestStateService } from '../request/request-state.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { TriageSuggestionService } from './triage-suggestion.service';
import { BedrockClient, BedrockTimeoutError } from './bedrock.client';

/**
 * Pruebas del agente de sugerencia de triage: SUGIERE sin persistir y degrada
 * (design §7): apagado -> 409 sin invocar Bedrock; timeout -> 503; salida
 * no-JSON -> 422; JSON que no valida -> 422; code de maestra inventado -> null +
 * nota; requestId de duplicado fuera del contexto -> descartado; caso feliz ->
 * DTO valido y CERO escrituras en BD. BedrockClient es un doble; mocks planos de
 * Prisma.
 */
// UUIDs v4 validos (variante RFC 4122): la validacion @IsUUID del DTO y
// ParseUUIDPipe del controller son estrictos con version/variante.
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const DUP_IN_SCOPE = '22222222-2222-4222-8222-222222222222';
const DUP_OUT_SCOPE = '33333333-3333-4333-8333-333333333333';

function jefeActor(): CurrentActor {
  return {
    userId: 'u-1',
    name: 'Jefa',
    identifier: 'jefa@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

const CATALOG_ITEMS = [
  { catalog: 'TRIAGE_ROUTE', code: 'RUTA_A', label: 'Ruta A' },
  { catalog: 'DEMAND_TYPE', code: 'NUEVO', label: 'Nuevo desarrollo' },
  { catalog: 'CRITICALITY', code: 'ALTA', label: 'Alta' },
  { catalog: 'TRIAGE_SIZE', code: 'M', label: 'Mediano' },
  { catalog: 'DATA_AVAILABILITY', code: 'DISPONIBLE', label: 'Disponible' },
];

function validSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    suggestedRouteCode: 'RUTA_A',
    suggestedDemandTypeCode: 'NUEVO',
    suggestedCriticalityCode: 'ALTA',
    suggestedSizeCode: 'M',
    suggestedDataAvailabilityCode: 'DISPONIBLE',
    tentativePriorityBand: 'P2',
    priorityRationale: 'Impacto medio y datos disponibles.',
    possibleDuplicates: [],
    missingInformation: [],
    model: 'lo-que-sea',
    agentCode: 'lo-que-sea',
    ...overrides,
  };
}

describe('TriageSuggestionService', () => {
  function makeDeps(opts: {
    global?: Record<string, unknown> | null;
    agent?: Record<string, unknown> | null;
    invoke?: () => Promise<string>;
    inScopeDuplicates?: Array<{ id: string; title: string }>;
  }) {
    const requestWrite = jest.fn();
    const prisma = {
      aiGlobalConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            opts.global ?? { id: 'g-1', enabled: true, credentialMode: 'iam-role' },
          ),
      },
      aiAgentConfig: {
        findUnique: jest.fn().mockResolvedValue(
          opts.agent ?? {
            id: 'a-1',
            code: 'TRIAGE',
            enabled: true,
            region: 'us-east-2',
            model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
            basePrompt: 'Sugiere el triage.',
            temperature: 0.2,
            maxTokens: 1024,
            timeoutMs: 20000,
          },
        ),
      },
      catalogItem: {
        findMany: jest.fn().mockResolvedValue(CATALOG_ITEMS),
      },
      request: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.inScopeDuplicates ?? [{ id: DUP_IN_SCOPE, title: 'Solicitud parecida' }],
          ),
        // Si algo intentara escribir, estas serian spiables; no deben llamarse.
        update: requestWrite,
        create: requestWrite,
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const state = {
      requireInScope: jest
        .fn()
        .mockResolvedValue({ id: REQUEST_ID, title: 'Solicitud', mainProcessId: 'p-1' }),
    } as unknown as RequestStateService;

    const invoke = opts.invoke ?? jest.fn().mockResolvedValue(JSON.stringify(validSuggestion()));
    const bedrock = {
      invoke: jest.fn(invoke),
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as BedrockClient;

    const service = new TriageSuggestionService(prisma, state, bedrock);
    return { service, prisma, state, bedrock, requestWrite, requestFindMany: prisma.request.findMany };
  }

  it('IA global apagada => 409 SIN invocar Bedrock', async () => {
    const { service, bedrock } = makeDeps({
      global: { id: 'g-1', enabled: false, credentialMode: 'iam-role' },
    });
    await expect(service.suggest(jefeActor(), REQUEST_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(bedrock.invoke).not.toHaveBeenCalled();
  });

  it('agente apagado => 409 SIN invocar Bedrock', async () => {
    const { service, bedrock } = makeDeps({
      agent: { id: 'a-1', code: 'TRIAGE', enabled: false, region: 'us-east-2', model: 'm', basePrompt: 'p', temperature: 0.2, maxTokens: 1024, timeoutMs: 20000 },
    });
    await expect(service.suggest(jefeActor(), REQUEST_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(bedrock.invoke).not.toHaveBeenCalled();
  });

  it('timeout de Bedrock => 503', async () => {
    const { service } = makeDeps({
      invoke: jest.fn().mockRejectedValue(new BedrockTimeoutError()),
    });
    await expect(service.suggest(jefeActor(), REQUEST_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('salida no-JSON => 422', async () => {
    const { service } = makeDeps({
      invoke: jest.fn().mockResolvedValue('esto no es json'),
    });
    await expect(service.suggest(jefeActor(), REQUEST_ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('JSON que no valida el DTO => 422', async () => {
    const { service } = makeDeps({
      invoke: jest
        .fn()
        .mockResolvedValue(
          JSON.stringify(validSuggestion({ tentativePriorityBand: 'ALTA' })),
        ),
    });
    await expect(service.suggest(jefeActor(), REQUEST_ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('code de maestra inventado => campo null + nota en missingInformation', async () => {
    const { service } = makeDeps({
      invoke: jest
        .fn()
        .mockResolvedValue(
          JSON.stringify(validSuggestion({ suggestedRouteCode: 'CODE_INVENTADO' })),
        ),
    });
    const res = await service.suggest(jefeActor(), REQUEST_ID);
    expect(res.suggestedRouteCode).toBeNull();
    expect(res.missingInformation.some((n) => /TRIAGE_ROUTE/.test(n))).toBe(true);
    // Los demas codes validos se conservan.
    expect(res.suggestedDemandTypeCode).toBe('NUEVO');
  });

  it('requestId de duplicado fuera del contexto => descartado', async () => {
    const { service } = makeDeps({
      inScopeDuplicates: [{ id: DUP_IN_SCOPE, title: 'Parecida' }],
      invoke: jest.fn().mockResolvedValue(
        JSON.stringify(
          validSuggestion({
            possibleDuplicates: [
              { requestId: DUP_IN_SCOPE, title: 'Parecida', confidence: 0.8, reason: 'similar' },
              { requestId: DUP_OUT_SCOPE, title: 'Fuera', confidence: 0.9, reason: 'inventada' },
            ],
          }),
        ),
      ),
    });
    const res = await service.suggest(jefeActor(), REQUEST_ID);
    expect(res.possibleDuplicates).toHaveLength(1);
    expect(res.possibleDuplicates[0].requestId).toBe(DUP_IN_SCOPE);
  });

  it('caso feliz => DTO valido, model/agentCode del backend y CERO escrituras en BD', async () => {
    const { service, requestWrite } = makeDeps({});
    const res = await service.suggest(jefeActor(), REQUEST_ID);
    expect(res.suggestedRouteCode).toBe('RUTA_A');
    expect(res.tentativePriorityBand).toBe('P2');
    expect(res.agentCode).toBe('TRIAGE');
    expect(res.model).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
    // No persiste nada: ninguna escritura de Request ni transacciones de dominio.
    expect(requestWrite).not.toHaveBeenCalled();
  });

  it('access-keys con descifrado fallido => 409 "IA mal configurada"', async () => {
    const { service, bedrock } = makeDeps({
      global: {
        id: 'g-1',
        enabled: true,
        credentialMode: 'access-keys',
        awsAccessKeyId: 'AKIA',
        awsSecretAccessKeyCipher: 'cipher-corrupto',
      },
    });
    await expect(service.suggest(jefeActor(), REQUEST_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(bedrock.invoke).not.toHaveBeenCalled();
  });
});
