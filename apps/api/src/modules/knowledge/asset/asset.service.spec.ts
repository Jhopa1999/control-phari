import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { KnowledgeScopeService } from '../knowledge-scope.service';
import { AssetStateService } from './asset-state.service';
import { AssetService } from './asset.service';

function createMocks() {
  const prismaObj: Record<string, any> = {
    asset: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    request: { findFirst: jest.fn() },
    catalogItem: { findFirst: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new KnowledgeScopeService();
  const state = new AssetStateService();
  const service = new AssetService(prisma, audit, scope, state);
  return { prismaObj, auditRecord, service };
}

function integrante(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ui',
    name: 'Integrante',
    identifier: 'integrante@demo.local',
    grants: scoped.map((p) => ({
      processId: p,
      processCode: p,
      processName: p,
      roleCode: RoleCode.INTEGRANTE,
      roleName: 'INTEGRANTE',
    })),
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
  };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => ({
      processId: p,
      processCode: p,
      processName: p,
      roleCode: RoleCode.LIDER_PROCESO,
      roleName: 'LIDER_PROCESO',
    })),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
  };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Jefe',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set<string>(),
    isJefeArea: true,
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    processId: 'p1',
    requestId: null,
    ownerUserId: null,
    name: 'Activo',
    status: 'BORRADOR',
    typeCode: null,
    technologyCode: null,
    sourceCode: null,
    frequencyCode: null,
    documentationRef: null,
    functionalDescription: null,
    dependencies: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AssetService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
  });

  describe('alcance (404) y rol (403)', () => {
    it('integrante fuera de proceso -> 404 (findFirst no encuentra)', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(null);
      await expect(m.service.get(integrante(), 'ajeno')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('integrante cambiando estado -> 403', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      await expect(
        m.service.changeStatus(integrante(), 'a1', { targetStatus: 'ACTIVO' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(m.prismaObj.asset.update).not.toHaveBeenCalled();
    });

    it('integrante editando un activo ya ACTIVO -> 403', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ status: 'ACTIVO' }),
      );
      await expect(
        m.service.update(integrante(), 'a1', { name: 'Nuevo' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lider de su proceso cambia estado -> ok y audita UPDATE', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ status: 'BORRADOR' }),
      );
      m.prismaObj.asset.update.mockResolvedValue(
        assetRow({ status: 'ACTIVO' }),
      );
      const res = await m.service.changeStatus(lider(), 'a1', {
        targetStatus: 'ACTIVO',
      });
      expect(res.status).toBe('ACTIVO');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'ASSET',
        scopeProcessId: 'p1',
      });
    });

    it('jefe crea en cualquier proceso -> ok', async () => {
      m.prismaObj.asset.create.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow(data)),
      );
      const res = await m.service.create(jefe(), {
        processId: 'otro',
        name: 'Activo',
      });
      expect(res.processId).toBe('otro');
      expect(res.status).toBe('BORRADOR');
    });
  });

  describe('create: nace BORRADOR, FK y maestras del body (400)', () => {
    it('ownerUserId inexistente/inactivo -> 400', async () => {
      m.prismaObj.user.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(lider(), {
          processId: 'p1',
          name: 'Activo',
          ownerUserId: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requestId que no participa del proceso -> 400', async () => {
      m.prismaObj.request.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(lider(), {
          processId: 'p1',
          name: 'Activo',
          requestId: '22222222-2222-2222-2222-222222222222',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('codigo de maestra invalido -> 400', async () => {
      m.prismaObj.catalogItem.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(lider(), {
          processId: 'p1',
          name: 'Activo',
          typeCode: 'NO_EXISTE',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nace BORRADOR y audita CREATE ASSET con scopeProcessId del registro', async () => {
      m.prismaObj.catalogItem.findFirst.mockResolvedValue({ id: 'c1' });
      m.prismaObj.asset.create.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow(data)),
      );
      const res = await m.service.create(lider(), {
        processId: 'p1',
        name: 'Activo',
        typeCode: 'TABLERO',
      });
      expect(res.status).toBe('BORRADOR');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'ASSET',
        scopeProcessId: 'p1',
      });
    });
  });

  it('changeStatus con salto invalido (ACTIVO->BORRADOR) -> 400', async () => {
    m.prismaObj.asset.findFirst.mockResolvedValue(
      assetRow({ status: 'ACTIVO' }),
    );
    await expect(
      m.service.changeStatus(lider(), 'a1', { targetStatus: 'BORRADOR' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
