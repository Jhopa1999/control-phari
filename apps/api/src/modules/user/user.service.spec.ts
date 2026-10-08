import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserService } from './user.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

type UserDelegateMock = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

function createMocks() {
  const user: UserDelegateMock = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prismaObj: Record<string, unknown> = { user };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  return { prisma, user, audit, auditRecord };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'u1',
    identifier: 'persona@demo.local',
    name: 'Persona',
    active: true,
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
    scopedProcessIds: new Set(),
    isJefeArea: true,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });
}

describe('UserService', () => {
  let service: UserService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new UserService(mocks.prisma, mocks.audit);
  });

  it('findMany no aplica filtro de proceso (Plano B)', async () => {
    mocks.user.findMany.mockResolvedValue([]);
    await service.findMany();
    const arg = mocks.user.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ name: 'asc' });
  });

  describe('create', () => {
    it('audita CREATE con scopeProcessId null', async () => {
      const created = makeUser({ id: 'unew' });
      mocks.user.create.mockResolvedValue(created);

      await service.create(jefe(), {
        identifier: 'persona@demo.local',
        name: 'Persona',
      });

      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited).toMatchObject({
        action: 'CREATE',
        objectType: 'USER',
        objectId: 'unew',
        scopeProcessId: null,
        before: null,
      });
    });

    it('traduce P2002 (identifier duplicado) a 409', async () => {
      mocks.user.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(jefe(), { identifier: 'dup@demo.local', name: 'X' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('404 si el usuario no existe', async () => {
      mocks.user.findUnique.mockResolvedValue(null);
      await expect(
        service.update(jefe(), 'uX', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.user.update).not.toHaveBeenCalled();
    });

    it('audita UPDATE', async () => {
      mocks.user.findUnique.mockResolvedValue(makeUser());
      mocks.user.update.mockResolvedValue(makeUser({ name: 'Nuevo' }));

      await service.update(jefe(), 'u1', { name: 'Nuevo' });

      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      expect(mocks.auditRecord.mock.calls[0][1].action).toBe('UPDATE');
    });
  });
});
