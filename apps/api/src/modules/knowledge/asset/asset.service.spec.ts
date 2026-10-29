import {
  BadRequestException,
  ConflictException,
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
    assetProcessVisibility: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    request: { findFirst: jest.fn(), findMany: jest.fn() },
    process: { findMany: jest.fn() },
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
    isAdmin: false,
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
    isAdmin: false,
  };
}

function admin(): CurrentActor {
  return {
    userId: 'ua',
    name: 'Admin',
    identifier: 'admin@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set<string>(),
    isJefeArea: false,
    isAdmin: true,
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
    isAdmin: false,
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

/**
 * Fila de activo con la relacion `visibilities` incluida (como la devuelven los
 * queries con ASSET_INCLUDE). `visibilities` es un array de `{ processId }`.
 */
function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    processId: 'p1',
    requestId: null,
    ownerUserId: null,
    name: 'Activo',
    status: 'BORRADOR',
    documentationRef: null,
    generalDescription: null,
    dependencies: null,
    visibilities: [] as { processId: string }[],
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

  describe('alcance (404) y gobernanza (403: solo jefe escribe)', () => {
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

    it('lider editando un activo visible -> 403 (solo el jefe escribe)', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      await expect(
        m.service.update(lider(), 'a1', { name: 'Nuevo' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(m.prismaObj.asset.update).not.toHaveBeenCalled();
    });

    it('lider cambiando estado de un activo visible -> 403', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ status: 'BORRADOR' }),
      );
      await expect(
        m.service.changeStatus(lider(), 'a1', { targetStatus: 'ACTIVO' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(m.prismaObj.asset.update).not.toHaveBeenCalled();
    });

    it('admin creando un activo -> 403 (gobernanza del area, no sistema)', async () => {
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'p1' }]);
      await expect(
        m.service.create(admin(), { processId: 'p1', name: 'Activo' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(m.prismaObj.asset.create).not.toHaveBeenCalled();
    });

    it('jefe cambia estado -> ok y audita UPDATE', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ status: 'BORRADOR' }),
      );
      m.prismaObj.asset.update.mockResolvedValue(assetRow({ status: 'ACTIVO' }));
      const res = await m.service.changeStatus(jefe(), 'a1', {
        targetStatus: 'ACTIVO',
      });
      expect(res.status).toBe('ACTIVO');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'ASSET',
        scopeProcessId: 'p1',
      });
    });

    it('jefe crea en cualquier proceso activo -> ok', async () => {
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'otro' }]);
      m.prismaObj.asset.create.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow({ ...data, visibilities: [] })),
      );
      const res = await m.service.create(jefe(), {
        processId: 'otro',
        name: 'Activo',
      });
      expect(res.processId).toBe('otro');
      expect(res.status).toBe('BORRADOR');
    });
  });

  describe('create: nace BORRADOR, validaciones del body (400)', () => {
    it('processId propietario inexistente/inactivo -> 400 (NIT-5)', async () => {
      // process.findMany devuelve 0 filas para el propietario.
      m.prismaObj.process.findMany.mockResolvedValue([]);
      await expect(
        m.service.create(jefe(), {
          processId: '33333333-3333-3333-3333-333333333333',
          name: 'Activo',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.prismaObj.asset.create).not.toHaveBeenCalled();
    });

    it('visibleProcessIds con un proceso inexistente/inactivo -> 400', async () => {
      // Propietario valido; la segunda llamada (visibles) no encuentra todos.
      m.prismaObj.process.findMany
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([{ id: 'p2' }]); // faltaria p3
      await expect(
        m.service.create(jefe(), {
          processId: 'p1',
          name: 'Activo',
          visibleProcessIds: ['p2', 'p3'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.prismaObj.asset.create).not.toHaveBeenCalled();
    });

    it('ownerUserId inexistente/inactivo -> 400', async () => {
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'p1' }]);
      m.prismaObj.user.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(jefe(), {
          processId: 'p1',
          name: 'Activo',
          ownerUserId: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requestId que no participa de un proceso visible -> 400', async () => {
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'p1' }]);
      m.prismaObj.request.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(jefe(), {
          processId: 'p1',
          name: 'Activo',
          requestId: '22222222-2222-2222-2222-222222222222',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nace BORRADOR y audita CREATE ASSET con scopeProcessId del registro', async () => {
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'p1' }]);
      m.prismaObj.asset.create.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow({ ...data, visibilities: [] })),
      );
      const res = await m.service.create(jefe(), {
        processId: 'p1',
        name: 'Activo',
      });
      expect(res.status).toBe('BORRADOR');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'ASSET',
        scopeProcessId: 'p1',
      });
    });

    it('visibleProcessIds: dedupe y excluye el propietario; inserta el resto', async () => {
      // 1a llamada: valida el propietario [p1]; 2a: valida visibles [p2, p3].
      m.prismaObj.process.findMany
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([{ id: 'p2' }, { id: 'p3' }]);
      m.prismaObj.asset.create.mockImplementation(({ data }: any) =>
        Promise.resolve(
          assetRow({
            ...data,
            // Simula lo que createMany dejaria visible (p2, p3).
            visibilities: [{ processId: 'p2' }, { processId: 'p3' }],
          }),
        ),
      );
      const res = await m.service.create(jefe(), {
        processId: 'p1',
        name: 'Activo',
        // p1 es el propietario (se excluye) y p2 viene duplicado.
        visibleProcessIds: ['p1', 'p2', 'p2', 'p3'],
      });
      // El createMany anidado recibe solo p2/p3 (sin propietario, sin duplicados).
      const createArg = m.prismaObj.asset.create.mock.calls[0][0];
      expect(createArg.data.visibilities.createMany.data).toEqual([
        { processId: 'p2' },
        { processId: 'p3' },
      ]);
      expect(res.visibleProcessIds).toEqual(['p2', 'p3']);
    });

    it('P2002 en create -> 409', async () => {
      const { Prisma } = require('../../../generated/prisma/client');
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'p1' }]);
      m.prismaObj.asset.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        m.service.create(jefe(), { processId: 'p1', name: 'Activo' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('error no-P2002 en create se propaga', async () => {
      const boom = new Error('db down');
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'p1' }]);
      m.prismaObj.asset.create.mockRejectedValue(boom);
      await expect(
        m.service.create(jefe(), { processId: 'p1', name: 'Activo' }),
      ).rejects.toBe(boom);
    });
  });

  describe('changeStatus', () => {
    it('salto invalido (ACTIVO->BORRADOR) -> 400', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ status: 'ACTIVO' }),
      );
      await expect(
        m.service.changeStatus(jefe(), 'a1', { targetStatus: 'BORRADOR' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('jefe actualiza metadatos sin mover estado y audita UPDATE', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.user.findFirst.mockResolvedValue({ id: 'uo' });
      m.prismaObj.request.findFirst.mockResolvedValue({ id: 'r1' });
      m.prismaObj.asset.update.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow({ ...data, visibilities: [] })),
      );
      const res = await m.service.update(jefe(), 'a1', {
        name: 'Renombrado',
        ownerUserId: '11111111-1111-1111-1111-111111111111',
        requestId: '22222222-2222-2222-2222-222222222222',
        generalDescription: 'nueva desc',
        dependencies: 'd',
      });
      expect(res.name).toBe('Renombrado');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'ASSET',
      });
    });

    it('reemplaza visibilidad: deleteMany siempre + createMany si no vacio', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ visibilities: [{ processId: 'p2' }] }),
      );
      m.prismaObj.process.findMany.mockResolvedValue([{ id: 'p3' }]);
      m.prismaObj.asset.update.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow({ ...data, visibilities: [{ processId: 'p3' }] })),
      );
      await m.service.update(jefe(), 'a1', { visibleProcessIds: ['p3'] });
      expect(m.prismaObj.assetProcessVisibility.deleteMany).toHaveBeenCalledWith({
        where: { assetId: 'a1' },
      });
      expect(m.prismaObj.assetProcessVisibility.createMany).toHaveBeenCalledWith({
        data: [{ assetId: 'a1', processId: 'p3' }],
      });
    });

    it('visibleProcessIds = [] -> deleteMany sin createMany (solo propietario)', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ visibilities: [{ processId: 'p2' }] }),
      );
      m.prismaObj.asset.update.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow({ ...data, visibilities: [] })),
      );
      await m.service.update(jefe(), 'a1', { visibleProcessIds: [] });
      expect(m.prismaObj.assetProcessVisibility.deleteMany).toHaveBeenCalledWith({
        where: { assetId: 'a1' },
      });
      expect(m.prismaObj.assetProcessVisibility.createMany).not.toHaveBeenCalled();
    });

    it('visibleProcessIds ausente -> no toca la tabla puente', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ visibilities: [{ processId: 'p2' }] }),
      );
      m.prismaObj.asset.update.mockImplementation(({ data }: any) =>
        Promise.resolve(assetRow({ ...data, visibilities: [{ processId: 'p2' }] })),
      );
      await m.service.update(jefe(), 'a1', { name: 'solo nombre' });
      expect(m.prismaObj.assetProcessVisibility.deleteMany).not.toHaveBeenCalled();
      expect(m.prismaObj.assetProcessVisibility.createMany).not.toHaveBeenCalled();
    });

    it(':id fuera de alcance -> 404', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(null);
      await expect(
        m.service.update(jefe(), 'ajeno', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('owner invalido en update -> 400', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.user.findFirst.mockResolvedValue(null);
      await expect(
        m.service.update(jefe(), 'a1', {
          ownerUserId: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listRequests (historial por activo, FEAT-002)', () => {
    it('activo fuera de alcance -> 404', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(null);
      await expect(
        m.service.listRequests(integrante(), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(m.prismaObj.request.findMany).not.toHaveBeenCalled();
    });

    it('ordenado por registeredAt desc e incluye operationalState', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.request.findMany.mockResolvedValue([
        {
          id: 'r2',
          title: 'Modelo analitico',
          registeredAt: new Date('2025-03-02T00:00:00.000Z'),
          operationalState: 'EN_TRIAGE',
          mainProcessId: 'p1',
        },
        {
          id: 'r1',
          title: 'Creacion de API',
          registeredAt: new Date('2025-03-01T00:00:00.000Z'),
          operationalState: 'BACKLOG_PRIORIZADO',
          mainProcessId: 'p1',
        },
      ]);

      const res = await m.service.listRequests(lider(), 'a1');

      expect(m.prismaObj.request.findMany.mock.calls[0][0].where).toEqual({
        assetId: 'a1',
        deletedAt: null,
      });
      expect(res.map((r) => r.id)).toEqual(['r2', 'r1']);
      expect(res[0].operationalState).toBe('EN_TRIAGE');
    });
  });

  describe('list', () => {
    it('aplica filtros processId/requestId/status y take', async () => {
      m.prismaObj.asset.findMany.mockResolvedValue([assetRow()]);
      const res = await m.service.list(lider(), {
        processId: 'p1',
        requestId: 'r1',
        status: 'BORRADOR',
        take: 5,
      } as any);
      expect(res).toHaveLength(1);
      const call = m.prismaObj.asset.findMany.mock.calls[0][0];
      expect(call.where.AND).toContainEqual({ processId: 'p1' });
      expect(call.where.AND).toContainEqual({ requestId: 'r1' });
      expect(call.where.AND).toContainEqual({ status: 'BORRADOR' });
      expect(call.take).toBe(5);
    });

    it('toResponse expone visibleProcessIds ordenado (solo filas puente)', async () => {
      m.prismaObj.asset.findMany.mockResolvedValue([
        assetRow({ visibilities: [{ processId: 'p3' }, { processId: 'p2' }] }),
      ]);
      const res = await m.service.list(lider(), {} as any);
      expect(res[0].visibleProcessIds).toEqual(['p2', 'p3']);
    });
  });

  describe('get', () => {
    it('devuelve el activo en alcance con visibleProcessIds', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ visibilities: [{ processId: 'p2' }] }),
      );
      const res = await m.service.get(lider(), 'a1');
      expect(res.id).toBe('a1');
      expect(res.visibleProcessIds).toEqual(['p2']);
    });
  });
});
