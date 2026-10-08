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

function createMocks() {
  const process: ProcessDelegateMock = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  // $transaction ejecuta el callback con el propio prisma mock como tx.
  const prismaObj: Record<string, unknown> = { process };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  return { prisma, process, audit, auditRecord };
}

function makeProcess(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'p1',
    code: 'FIBI',
    name: 'BI',
    framework: 'INS-006',
    kind: 'PROCESS',
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
  });

  describe('create', () => {
    it('normaliza code a MAYUSCULAS, aplica default kind y audita CREATE', async () => {
      const created = makeProcess({ id: 'pnew', code: 'FINEW', kind: 'PROCESS' });
      mocks.process.create.mockResolvedValue(created);

      await service.create(jefe(), { code: 'finew', name: 'Nuevo' });

      expect(mocks.process.create.mock.calls[0][0].data.code).toBe('FINEW');
      expect(mocks.process.create.mock.calls[0][0].data.kind).toBe('PROCESS');
      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited).toMatchObject({
        action: 'CREATE',
        objectType: 'PROCESS',
        objectId: 'pnew',
        scopeProcessId: 'pnew',
        before: null,
      });
    });

    it('traduce P2002 a ConflictException', async () => {
      mocks.process.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(jefe(), { code: 'FIBI', name: 'BI' }),
      ).rejects.toBeInstanceOf(ConflictException);
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
});
