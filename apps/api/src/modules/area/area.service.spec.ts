import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AreaService } from './area.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

type AreaDelegateMock = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

function createMocks() {
  const area: AreaDelegateMock = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  // $transaction ejecuta el callback con el propio prisma mock como tx.
  const process = { count: jest.fn().mockResolvedValue(0) };
  const prismaObj: Record<string, unknown> = { area, process };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  return { prisma, area, process, audit, auditRecord };
}

function makeArea(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'a1',
    code: 'ANALITICA',
    name: 'Analitica',
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function withCount(
  area: ReturnType<typeof makeArea>,
  processes: number,
  requesters: number,
) {
  return { ...area, _count: { processes, requesters } };
}

function admin(): CurrentActor {
  return {
    userId: 'ua',
    name: 'Admin',
    identifier: 'admin@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: true,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });
}

describe('AreaService', () => {
  let service: AreaService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new AreaService(mocks.prisma, mocks.audit);
  });

  describe('create', () => {
    it('normaliza code a MAYUSCULAS y audita AREA/CREATE sin proceso', async () => {
      const created = makeArea({ id: 'anew', code: 'NUEVA' });
      mocks.area.create.mockResolvedValue(created);

      await service.create(admin(), { code: 'nueva', name: 'Nueva' });

      expect(mocks.area.create.mock.calls[0][0].data.code).toBe('NUEVA');
      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited).toMatchObject({
        action: 'CREATE',
        objectType: 'AREA',
        objectId: 'anew',
        scopeProcessId: null,
        before: null,
      });
    });

    it('traduce P2002 a ConflictException con el mensaje en español', async () => {
      mocks.area.create.mockRejectedValue(uniqueViolation());
      const llamada = service.create(admin(), { code: 'ANALITICA', name: 'Analitica' });
      await expect(llamada).rejects.toBeInstanceOf(ConflictException);
      await expect(llamada).rejects.toThrow('Ya existe un área con ese código.');
    });

    it('devuelve el área nueva con conteos en cero', async () => {
      mocks.area.create.mockResolvedValue(makeArea({ id: 'anew' }));
      const created = await service.create(admin(), { code: 'N', name: 'N' });
      expect(created).toMatchObject({ processCount: 0, requesterCount: 0 });
    });
  });

  describe('update', () => {
    it('404 si el area no existe (sin tocar update)', async () => {
      mocks.area.findUnique.mockResolvedValue(null);
      await expect(
        service.update(admin(), 'aX', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.area.update).not.toHaveBeenCalled();
    });

    it('audita AREA/UPDATE con before/after', async () => {
      const existing = makeArea();
      const updated = makeArea({ name: 'Analitica v2' });
      mocks.area.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(withCount(updated, 0, 0));
      mocks.area.update.mockResolvedValue(updated);

      await service.update(admin(), 'a1', { name: 'Analitica v2' });

      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited.action).toBe('UPDATE');
      expect(audited.objectType).toBe('AREA');
      expect(audited.scopeProcessId).toBeNull();
    });
  });

  describe('desactivar con procesos activos (D21)', () => {
    it('409 con el recuento si el área activa tiene procesos activos y no escribe', async () => {
      mocks.area.findUnique.mockResolvedValue(makeArea());
      mocks.process.count.mockResolvedValue(3);
      await expect(
        service.update(admin(), 'a1', { active: false }),
      ).rejects.toThrow('No se puede desactivar el área: tiene 3 procesos activos.');
      expect(mocks.area.update).not.toHaveBeenCalled();
      expect(mocks.process.count).toHaveBeenCalledWith({
        where: { areaId: 'a1', active: true },
      });
    });

    it('usa el singular con un solo proceso activo', async () => {
      mocks.area.findUnique.mockResolvedValue(makeArea());
      mocks.process.count.mockResolvedValue(1);
      await expect(
        service.update(admin(), 'a1', { active: false }),
      ).rejects.toThrow('tiene 1 proceso activo.');
    });

    it('el mensaje no incluye ids', async () => {
      mocks.area.findUnique.mockResolvedValue(makeArea({ id: 'uuid-secreto' }));
      mocks.process.count.mockResolvedValue(2);
      await expect(
        service.update(admin(), 'uuid-secreto', { active: false }),
      ).rejects.not.toThrow(/uuid-secreto/);
    });

    it('permite desactivar si no quedan procesos activos', async () => {
      mocks.area.findUnique
        .mockResolvedValueOnce(makeArea())
        .mockResolvedValueOnce(withCount(makeArea({ active: false }), 0, 2));
      mocks.process.count.mockResolvedValue(0);
      mocks.area.update.mockResolvedValue(makeArea({ active: false }));
      const result = await service.update(admin(), 'a1', { active: false });
      expect(result.active).toBe(false);
      expect(mocks.area.update).toHaveBeenCalled();
    });

    it('no cuenta procesos al reactivar un área inactiva', async () => {
      mocks.area.findUnique
        .mockResolvedValueOnce(makeArea({ active: false }))
        .mockResolvedValueOnce(withCount(makeArea(), 0, 0));
      mocks.area.update.mockResolvedValue(makeArea());
      await service.update(admin(), 'a1', { active: true });
      expect(mocks.process.count).not.toHaveBeenCalled();
    });
  });

  describe('conteos por fila', () => {
    it('findMany pide count filtrado a activos y aplana processCount y requesterCount', async () => {
      mocks.area.findMany.mockResolvedValue([withCount(makeArea(), 3, 12)]);
      const rows = await service.findMany({});
      expect(rows[0]).toMatchObject({ processCount: 3, requesterCount: 12 });
      expect(rows[0]).not.toHaveProperty('_count');
      expect(mocks.area.findMany.mock.calls[0][0].include._count.select).toEqual({
        processes: { where: { active: true } },
        requesters: { where: { active: true } },
      });
    });
  });

  describe('findMany', () => {
    it('sin filtro active -> where vacio', async () => {
      mocks.area.findMany.mockResolvedValue([]);
      await service.findMany({});
      const where = mocks.area.findMany.mock.calls[0][0].where;
      expect(where).toEqual({});
    });

    it('filtra por active cuando se indica', async () => {
      mocks.area.findMany.mockResolvedValue([]);
      await service.findMany({ active: true });
      const where = mocks.area.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ active: true });
    });
  });
});
