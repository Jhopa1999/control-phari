import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProcessService } from './process.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

type ProcessDelegateMock = {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

type AreaDelegateMock = {
  findUnique: jest.Mock;
};

function createMocks() {
  const process: ProcessDelegateMock = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const area: AreaDelegateMock = {
    findUnique: jest.fn(),
  };
  // $transaction ejecuta el callback con el propio prisma mock como tx.
  const assignment = { count: jest.fn().mockResolvedValue(0) };
  const request = { count: jest.fn().mockResolvedValue(0) };
  const task = { count: jest.fn().mockResolvedValue(0) };
  const prismaObj: Record<string, unknown> = {
    process,
    area,
    assignment,
    request,
    task,
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  return { prisma, process, area, assignment, request, task, audit, auditRecord };
}

function makeProcess(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'p1',
    code: 'FIBI',
    name: 'BI',
    framework: 'INS-006',
    kind: 'PROCESS',
    areaId: 'a1',
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Ana Jefa',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(['p1', 'p2']),
    isJefeArea: true,
    isLiderProceso: false,
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
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: true,
  };
}

function noJefe(scoped: string[]): CurrentActor {
  return {
    userId: 'ul',
    name: 'Beto',
    identifier: 'lider@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });
}

describe('ProcessService', () => {
  let service: ProcessService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new ProcessService(mocks.prisma, mocks.audit);
  });

  describe('findMany', () => {
    it('jefe no filtra por proceso (where sin filtro de id)', async () => {
      mocks.process.findMany.mockResolvedValue([]);
      await service.findMany(jefe(), {});
      const where = mocks.process.findMany.mock.calls[0][0].where;
      expect(where.id).toBeUndefined();
    });

    it('no-jefe filtra por scopedProcessIds en el where', async () => {
      mocks.process.findMany.mockResolvedValue([]);
      await service.findMany(noJefe(['p1']), {});
      const where = mocks.process.findMany.mock.calls[0][0].where;
      expect(where.id).toEqual({ in: ['p1'] });
    });

    it('admin no filtra por proceso (ve todos los procesos)', async () => {
      mocks.process.findMany.mockResolvedValue([]);
      await service.findMany(admin(), {});
      const where = mocks.process.findMany.mock.calls[0][0].where;
      expect(where.id).toBeUndefined();
    });

    it('aplica los filtros opcionales active y kind al where', async () => {
      mocks.process.findMany.mockResolvedValue([]);
      await service.findMany(jefe(), { active: false, kind: 'PROCESS' } as any);
      const where = mocks.process.findMany.mock.calls[0][0].where;
      expect(where.active).toBe(false);
      expect(where.kind).toBe('PROCESS');
    });
  });

  describe('findOne', () => {
    it('no-jefe fuera de alcance -> 404 (where incluye scopedProcessIds)', async () => {
      mocks.process.findFirst.mockResolvedValue(null);
      await expect(service.findOne(noJefe(['p1']), 'pX')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const where = mocks.process.findFirst.mock.calls[0][0].where;
      expect(where.AND).toEqual([{ id: 'pX' }, { id: { in: ['p1'] } }]);
    });

    it('jefe obtiene cualquier proceso (where sin filtro de alcance)', async () => {
      mocks.process.findFirst.mockResolvedValue(makeProcess());
      await service.findOne(jefe(), 'p1');
      const where = mocks.process.findFirst.mock.calls[0][0].where;
      expect(where.AND).toEqual([{ id: 'p1' }, {}]);
    });

    it('admin obtiene cualquier proceso (where sin filtro de alcance)', async () => {
      mocks.process.findFirst.mockResolvedValue(makeProcess());
      await service.findOne(admin(), 'p1');
      const where = mocks.process.findFirst.mock.calls[0][0].where;
      expect(where.AND).toEqual([{ id: 'p1' }, {}]);
    });
  });

  describe('create', () => {
    it('normaliza code a MAYUSCULAS, aplica default kind, incluye areaId y audita CREATE', async () => {
      const created = makeProcess({ id: 'pnew', code: 'FINEW', kind: 'PROCESS' });
      mocks.area.findUnique.mockResolvedValue({ id: 'a1' });
      mocks.process.create.mockResolvedValue(created);

      await service.create(jefe(), { code: 'finew', name: 'Nuevo', areaId: 'a1' });

      expect(mocks.process.create.mock.calls[0][0].data.code).toBe('FINEW');
      expect(mocks.process.create.mock.calls[0][0].data.kind).toBe('PROCESS');
      expect(mocks.process.create.mock.calls[0][0].data.areaId).toBe('a1');
      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited).toMatchObject({
        action: 'CREATE',
        objectType: 'PROCESS',
        objectId: 'pnew',
        scopeProcessId: 'pnew',
        before: null,
      });
      expect(audited.after.areaId).toBe('a1');
    });

    it('404 si el areaId no existe (sin crear)', async () => {
      mocks.area.findUnique.mockResolvedValue(null);
      await expect(
        service.create(jefe(), { code: 'FINEW', name: 'Nuevo', areaId: 'aX' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.process.create).not.toHaveBeenCalled();
    });

    it('traduce P2002 a ConflictException', async () => {
      mocks.area.findUnique.mockResolvedValue({ id: 'a1' });
      mocks.process.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(jefe(), { code: 'FIBI', name: 'BI', areaId: 'a1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-lanza un error ajeno a P2002 sin traducirlo a 409', async () => {
      const boom = new Error('fallo de BD');
      mocks.area.findUnique.mockResolvedValue({ id: 'a1' });
      mocks.process.create.mockRejectedValue(boom);
      await expect(
        service.create(jefe(), { code: 'FIBI', name: 'BI', areaId: 'a1' }),
      ).rejects.toBe(boom);
    });
  });

  describe('update', () => {
    it('404 si el proceso no existe (sin tocar update)', async () => {
      mocks.process.findUnique.mockResolvedValue(null);
      await expect(
        service.update(jefe(), 'pX', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.process.update).not.toHaveBeenCalled();
    });

    it('audita UPDATE con before/after', async () => {
      const existing = makeProcess();
      const updated = makeProcess({ name: 'BI v2' });
      mocks.process.findUnique.mockResolvedValue(existing);
      mocks.process.update.mockResolvedValue(updated);

      await service.update(jefe(), 'p1', { name: 'BI v2' });

      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited.action).toBe('UPDATE');
      expect(audited.objectType).toBe('PROCESS');
      expect(audited.scopeProcessId).toBe('p1');
    });
  });

  describe('desactivar con trabajo en curso (D21)', () => {
    async function intentar(
      mocks: ReturnType<typeof createMocks>,
      dto: Record<string, unknown>,
    ) {
      const service = new ProcessService(mocks.prisma, mocks.audit);
      return service.update(jefe(), 'p1', dto);
    }

    it('desactiva sin confirmar cuando no hay asignaciones, solicitudes ni tareas', async () => {
      const mocks = createMocks();
      mocks.process.findUnique.mockResolvedValue(makeProcess());
      mocks.process.update.mockResolvedValue(makeProcess({ active: false }));
      await intentar(mocks, { active: false });
      expect(mocks.process.update).toHaveBeenCalled();
    });

    it('409 con requiresConfirmation y recuentos si hay trabajo en curso, sin escribir', async () => {
      const mocks = createMocks();
      mocks.process.findUnique.mockResolvedValue(makeProcess());
      mocks.assignment.count.mockResolvedValue(2);
      mocks.request.count.mockResolvedValue(1);
      mocks.task.count.mockResolvedValue(5);
      let error: unknown;
      try {
        await intentar(mocks, { active: false });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        requiresConfirmation: true,
        activeAssignments: 2,
        openRequests: 1,
        openTasks: 5,
      });
      expect(mocks.process.update).not.toHaveBeenCalled();
    });

    it('con confirmDeactivation: true desactiva aunque haya trabajo en curso', async () => {
      const mocks = createMocks();
      mocks.process.findUnique.mockResolvedValue(makeProcess());
      mocks.task.count.mockResolvedValue(3);
      mocks.process.update.mockResolvedValue(makeProcess({ active: false }));
      await intentar(mocks, { active: false, confirmDeactivation: true });
      expect(mocks.process.update).toHaveBeenCalled();
      expect(mocks.task.count).not.toHaveBeenCalled();
    });

    it('cuenta con un count por tabla: solicitudes sin cerrar/rechazar/retirar y tareas no terminadas', async () => {
      const mocks = createMocks();
      mocks.process.findUnique.mockResolvedValue(makeProcess());
      mocks.process.update.mockResolvedValue(makeProcess({ active: false }));
      await intentar(mocks, { active: false });
      expect(mocks.request.count).toHaveBeenCalledWith({
        where: {
          mainProcessId: 'p1',
          deletedAt: null,
          operationalState: { notIn: ['CERRADA', 'RECHAZADA', 'RETIRADA'] },
        },
      });
      expect(mocks.task.count).toHaveBeenCalledWith({
        where: { processId: 'p1', status: { not: 'TERMINADA' } },
      });
      const assignmentWhere = mocks.assignment.count.mock.calls[0][0].where;
      expect(assignmentWhere.processId).toBe('p1');
      // Mes actual en UTC: siempre día 1 a las 00:00 UTC.
      const month = assignmentWhere.month.gte as Date;
      expect(month.getUTCDate()).toBe(1);
      expect(month.getUTCHours()).toBe(0);
    });

    it('no pide confirmación al reactivar, al editar ni si el proceso ya estaba inactivo', async () => {
      const mocks = createMocks();
      mocks.process.findUnique.mockResolvedValue(makeProcess({ active: false }));
      mocks.process.update.mockResolvedValue(makeProcess({ active: false }));
      await intentar(mocks, { active: false });
      await intentar(mocks, { name: 'Otro' });
      expect(mocks.task.count).not.toHaveBeenCalled();
    });
  });
});