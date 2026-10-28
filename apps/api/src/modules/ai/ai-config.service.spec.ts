import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { AiConfigService } from './ai-config.service';
import { BedrockClient } from './bedrock.client';
import { encryptSecret } from './ai-crypto';
import { UpdateAiGlobalConfigDto } from './dto/update-ai-global-config.dto';

/**
 * Pruebas del servicio de configuracion de IA: reglas deterministas del secret
 * (conservar/reemplazar/limpiar/'' -> 400), que NUNCA se devuelve el secret ni
 * el ciphertext (solo secretSet + accessKeyIdLast4) y la prueba de conexion.
 * Mocks planos de PrismaService (patron smtp-config.service.spec.ts).
 */
const KEY_VAR = 'SETTINGS_ENCRYPTION_KEY';

function adminActor(): CurrentActor {
  return {
    userId: 'admin-1',
    name: 'Alex Admin',
    identifier: 'admin@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isAdmin: true,
  };
}

describe('AiConfigService', () => {
  const originalKey = process.env[KEY_VAR];
  beforeAll(() => {
    process.env[KEY_VAR] = Buffer.alloc(32, 7).toString('base64');
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env[KEY_VAR];
    else process.env[KEY_VAR] = originalKey;
  });

  function makeDeps(opts: {
    global?: Record<string, unknown> | null;
    agent?: Record<string, unknown> | null;
    ping?: () => Promise<void>;
  }) {
    const txClient = {
      aiGlobalConfig: {
        create: jest.fn().mockResolvedValue({ id: 'g-1' }),
        update: jest.fn().mockResolvedValue({ id: 'g-1' }),
      },
      aiAgentConfig: {
        update: jest.fn().mockResolvedValue({ id: 'a-1' }),
      },
    };
    const prisma = {
      aiGlobalConfig: {
        findFirst: jest.fn().mockResolvedValue(opts.global ?? null),
      },
      aiAgentConfig: {
        findMany: jest.fn().mockResolvedValue(opts.agent ? [opts.agent] : []),
        findUnique: jest.fn().mockResolvedValue(opts.agent ?? null),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(txClient),
      ),
    } as unknown as PrismaService;
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const ping = opts.ping ?? jest.fn().mockResolvedValue(undefined);
    const bedrock = {
      invoke: jest.fn().mockResolvedValue('{}'),
      ping: jest.fn(ping),
    } as unknown as BedrockClient;
    const service = new AiConfigService(prisma, audit, bedrock);
    return { service, prisma, audit, bedrock, txClient };
  }

  function baseDto(
    overrides: Partial<UpdateAiGlobalConfigDto> = {},
  ): UpdateAiGlobalConfigDto {
    return { ...overrides } as UpdateAiGlobalConfigDto;
  }

  it('getConfig sin fila global => enabled false, secretSet false, last4 null; nunca expone secret', async () => {
    const { service } = makeDeps({ global: null });
    const res = await service.getConfig();
    expect(res.global.enabled).toBe(false);
    expect(res.global.secretSet).toBe(false);
    expect(res.global.accessKeyIdLast4).toBeNull();
    expect(res.global).not.toHaveProperty('awsSecretAccessKey');
    expect(res.global).not.toHaveProperty('awsSecretAccessKeyCipher');
  });

  it('getConfig con secret guardado => secretSet true y last4, sin exponer el valor', async () => {
    const { service } = makeDeps({
      global: {
        id: 'g-1',
        enabled: true,
        credentialMode: 'access-keys',
        awsAccessKeyId: 'AKIAEXAMPLE1234',
        awsSecretAccessKeyCipher: 'iv.tag.ct',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const res = await service.getConfig();
    expect(res.global.secretSet).toBe(true);
    expect(res.global.accessKeyIdLast4).toBe('1234');
    expect(JSON.stringify(res)).not.toContain('iv.tag.ct');
  });

  it('updateGlobal con secret nuevo => cifra (nunca guarda el claro)', async () => {
    const { service, txClient } = makeDeps({ global: null });
    await service.updateGlobal(
      adminActor(),
      baseDto({ credentialMode: 'access-keys', awsAccessKeyId: 'AKIA', awsSecretAccessKey: 'mi-secreto' }),
    );
    const createArg = (txClient.aiGlobalConfig.create as jest.Mock).mock.calls[0][0];
    expect(typeof createArg.data.awsSecretAccessKeyCipher).toBe('string');
    expect(createArg.data.awsSecretAccessKeyCipher.split('.')).toHaveLength(3);
    expect(createArg.data.awsSecretAccessKeyCipher).not.toContain('mi-secreto');
  });

  it('updateGlobal secret ausente => NO toca el ciphertext', async () => {
    const { service, txClient } = makeDeps({
      global: { id: 'g-1', enabled: true, credentialMode: 'access-keys', awsSecretAccessKeyCipher: 'x.y.z' },
    });
    await service.updateGlobal(adminActor(), baseDto({ enabled: false }));
    const updateArg = (txClient.aiGlobalConfig.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('awsSecretAccessKeyCipher');
  });

  it('updateGlobal clearCredentials:true => limpia ciphertext y access key (null)', async () => {
    const { service, txClient } = makeDeps({
      global: { id: 'g-1', enabled: true, credentialMode: 'access-keys', awsAccessKeyId: 'AKIA', awsSecretAccessKeyCipher: 'x.y.z' },
    });
    await service.updateGlobal(adminActor(), baseDto({ clearCredentials: true }));
    const updateArg = (txClient.aiGlobalConfig.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.awsSecretAccessKeyCipher).toBeNull();
    expect(updateArg.data.awsAccessKeyId).toBeNull();
  });

  it("updateGlobal secret '' => 400", async () => {
    const { service } = makeDeps({ global: null });
    await expect(
      service.updateGlobal(adminActor(), baseDto({ awsSecretAccessKey: '' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateGlobal secret + clearCredentials => 400', async () => {
    const { service } = makeDeps({ global: null });
    await expect(
      service.updateGlobal(
        adminActor(),
        baseDto({ awsSecretAccessKey: 'x', clearCredentials: true }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateAgent con modelo fuera del catalogo => 400', async () => {
    const { service } = makeDeps({
      agent: { id: 'a-1', code: 'TRIAGE', displayName: 'Triage', enabled: false, region: 'us-east-2', model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', basePrompt: 'p', temperature: 0.2, maxTokens: 1024, timeoutMs: 20000 },
    });
    await expect(
      service.updateAgent(adminActor(), 'TRIAGE', { model: 'modelo-invalido' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getAgent inexistente => 404', async () => {
    const { service } = makeDeps({ agent: null });
    await expect(service.getAgent('TRIAGE')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('testAgent en access-keys descifra y hace ping => ok:true, sin filtrar el secret', async () => {
    const cipher = encryptSecret('secreto-aws');
    const { service, bedrock } = makeDeps({
      global: { id: 'g-1', enabled: true, credentialMode: 'access-keys', awsAccessKeyId: 'AKIA1234', awsSecretAccessKeyCipher: cipher },
      agent: { id: 'a-1', code: 'TRIAGE', displayName: 'Triage', enabled: true, region: 'us-east-2', model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', basePrompt: 'p', temperature: 0.2, maxTokens: 1024, timeoutMs: 20000 },
    });
    const res = await service.testAgent('TRIAGE');
    expect(res.ok).toBe(true);
    expect(bedrock.ping).toHaveBeenCalledTimes(1);
    const pingArg = (bedrock.ping as jest.Mock).mock.calls[0][0];
    expect(pingArg.credentials.secretAccessKey).toBe('secreto-aws');
    expect(JSON.stringify(res)).not.toContain('secreto-aws');
  });

  it('testAgent con ping que falla => ok:false, mensaje amable sin stack', async () => {
    const { service } = makeDeps({
      global: { id: 'g-1', enabled: true, credentialMode: 'iam-role' },
      agent: { id: 'a-1', code: 'TRIAGE', displayName: 'Triage', enabled: true, region: 'us-east-2', model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', basePrompt: 'p', temperature: 0.2, maxTokens: 1024, timeoutMs: 20000 },
      ping: jest.fn().mockRejectedValue(new Error('AccessDenied: clave-secreta')),
    });
    const res = await service.testAgent('TRIAGE');
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('clave-secreta');
  });

  it('testAgent en access-keys sin credenciales guardadas => ok:false "IA mal configurada"', async () => {
    const { service, bedrock } = makeDeps({
      global: { id: 'g-1', enabled: true, credentialMode: 'access-keys', awsAccessKeyId: '', awsSecretAccessKeyCipher: '' },
      agent: { id: 'a-1', code: 'TRIAGE', displayName: 'Triage', enabled: true, region: 'us-east-2', model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', basePrompt: 'p', temperature: 0.2, maxTokens: 1024, timeoutMs: 20000 },
    });
    const res = await service.testAgent('TRIAGE');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/mal configurada/i);
    expect(bedrock.ping).not.toHaveBeenCalled();
  });
});
