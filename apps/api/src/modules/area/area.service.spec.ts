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
  const prismaObj: Record<string, unknown> = { area };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  return { prisma, area, audit, auditRecord };
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

function admin(): CurrentActor {
  return {
    userId: 'ua',
    name: 'Admin',
    identifier: 'admin@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
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

    it('traduce P2002 a ConflictException', async () => {
      mocks.area.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(admin(), { code: 'ANALITICA', name: 'Analitica' }),
      ).rejects.toBeInstanceOf(ConflictException);
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
      mocks.area.findUnique.mockResolvedValue(existing);
      mocks.area.update.mockResolvedValue(updated);

      await service.update(admin(), 'a1', { name: 'Analitica v2' });

      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited.action).toBe('UPDATE');
      expect(audited.objectType).toBe('AREA');
      expect(audited.scopeProcessId).toBeNull();
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
