import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { AiModelCatalogService } from './ai-model-catalog.service';
import { DEFAULT_MODEL_CATALOG } from './bedrock-model-catalog';

/**
 * Catalogo de modelos en BD: siembra idempotente que no pisa al admin,
 * validacion de modelo permitido (habilitado) y capacidades (temperature).
 */
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

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    modelId: 'us.anthropic.test',
    label: 'Test',
    tier: 'other',
    enabled: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsDocuments: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe('AiModelCatalogService', () => {
  function makeDeps(existing: Record<string, unknown> | null = null) {
    const tx = {
      aiModel: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
          row({ id: 'new', ...data }),
        ),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
          row({ ...existing, ...data }),
        ),
      },
    };
    const prisma = {
      aiModel: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue(existing ? [existing] : []),
        upsert: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    } as unknown as PrismaService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new AiModelCatalogService(prisma, audit), prisma, audit, tx };
  }

  it('ensureDefaults siembra cada modelo con update vacio (no pisa al admin)', async () => {
    const { service, prisma } = makeDeps();
    await service.ensureDefaults();
    const upsert = prisma.aiModel.upsert as jest.Mock;
    expect(upsert).toHaveBeenCalledTimes(DEFAULT_MODEL_CATALOG.length);
    for (const call of upsert.mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });

  it('onModuleInit no impide arrancar si la base falla', async () => {
    const { service, prisma } = makeDeps();
    (prisma.aiModel.upsert as jest.Mock).mockRejectedValue(new Error('sin tabla'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('assertAllowed acepta un modelo habilitado', async () => {
    const { service } = makeDeps(row());
    await expect(service.assertAllowed('us.anthropic.test')).resolves.toBeUndefined();
  });

  it('assertAllowed rechaza un modelo inexistente con 400', async () => {
    const { service } = makeDeps(null);
    await expect(service.assertAllowed('nope')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assertAllowed rechaza un modelo deshabilitado con 400', async () => {
    const { service } = makeDeps(row({ enabled: false }));
    await expect(service.assertAllowed('us.anthropic.test')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('supportsTemperature: respeta la capacidad y asume true si el modelo es desconocido', async () => {
    expect(await makeDeps(row({ supportsTemperature: false })).service.supportsTemperature('x')).toBe(false);
    expect(await makeDeps(row()).service.supportsTemperature('x')).toBe(true);
    expect(await makeDeps(null).service.supportsTemperature('x')).toBe(true);
  });

  it('create rechaza un id duplicado con 409', async () => {
    const { service } = makeDeps(row());
    await expect(
      service.create(adminActor(), { modelId: 'us.anthropic.test', label: 'Otro' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create da de alta, audita y devuelve la entrada', async () => {
    const { service, audit } = makeDeps(null);
    const res = await service.create(adminActor(), {
      modelId: 'us.anthropic.nuevo',
      label: 'Nuevo',
      supportsTemperature: false,
    });
    expect(res.id).toBe('us.anthropic.nuevo');
    expect(res.supportsTemperature).toBe(false);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('update de un modelo inexistente => 404', async () => {
    const { service } = makeDeps(null);
    await expect(
      service.update(adminActor(), 'nope', { enabled: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update aplica solo los campos enviados y audita', async () => {
    const { service, tx, audit } = makeDeps(row());
    const res = await service.update(adminActor(), 'us.anthropic.test', {
      enabled: false,
    });
    expect(res.enabled).toBe(false);
    expect(tx.aiModel.update.mock.calls[0][0].data).toEqual({ enabled: false });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
