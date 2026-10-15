import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GrantService } from './grant.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

type RoleDelegateMock = { findFirst: jest.Mock };
type UserDelegateMock = { findUnique: jest.Mock };
type ProcessDelegateMock = { findUnique: jest.Mock };
type GrantDelegateMock = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

function createMocks() {
  const role: RoleDelegateMock = { findFirst: jest.fn() };
  const user: UserDelegateMock = { findUnique: jest.fn() };
  const process: ProcessDelegateMock = { findUnique: jest.fn() };
  const grant: GrantDelegateMock = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prismaObj: Record<string, unknown> = { role, user, process, grant };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  return { prisma, role, user, process, grant, audit, auditRecord };
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
    isAdmin: false,
  };
}

function makeGrant(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'g1',
    userId: 'u1',
    roleId: 'r1',
    processId: 'p1',
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const dto = {
  userId: 'u1',
  roleCode: RoleCode.LIDER_PROCESO,
  processId: 'p1',
};

describe('GrantService', () => {
  let service: GrantService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new GrantService(mocks.prisma, mocks.audit);
  });

  describe('findMany', () => {
    it('filtra siempre por scopedProcessIds del jefe', async () => {
      mocks.grant.findMany.mockResolvedValue([]);
      await service.findMany(jefe(), {});
      const where = mocks.grant.findMany.mock.calls[0][0].where;
      expect(where.processId).toEqual({ in: ['p1', 'p2'] });
    });
  });

  describe('create', () => {
    it('roleCode sin fila Role -> 500 generico', async () => {
      mocks.role.findFirst.mockResolvedValue(null);
      await expect(service.create(jefe(), dto)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('user inexistente -> 404', async () => {
      mocks.role.findFirst.mockResolvedValue({ id: 'r1', code: dto.roleCode });
      mocks.user.findUnique.mockResolvedValue(null);
      mocks.process.findUnique.mockResolvedValue({ id: 'p1' });
      await expect(service.create(jefe(), dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('process inexistente -> 404', async () => {
      mocks.role.findFirst.mockResolvedValue({ id: 'r1', code: dto.roleCode });
      mocks.user.findUnique.mockResolvedValue({ id: 'u1' });
      mocks.process.findUnique.mockResolvedValue(null);
      await expect(service.create(jefe(), dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('grant activo duplicado -> 409', async () => {
      mocks.role.findFirst.mockResolvedValue({ id: 'r1', code: dto.roleCode });
      mocks.user.findUnique.mockResolvedValue({ id: 'u1' });
      mocks.process.findUnique.mockResolvedValue({ id: 'p1' });
      mocks.grant.findUnique.mockResolvedValue(makeGrant({ active: true }));
      await expect(service.create(jefe(), dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mocks.grant.update).not.toHaveBeenCalled();
      expect(mocks.grant.create).not.toHaveBeenCalled();
    });

    it('grant inactivo -> reactivacion con AuditEvent action CREATE', async () => {
      mocks.role.findFirst.mockResolvedValue({ id: 'r1', code: dto.roleCode });
      mocks.user.findUnique.mockResolvedValue({ id: 'u1' });
      mocks.process.findUnique.mockResolvedValue({ id: 'p1' });
      mocks.grant.findUnique.mockResolvedValue(makeGrant({ active: false }));
      mocks.grant.update.mockResolvedValue(makeGrant({ active: true }));

      await service.create(jefe(), dto);

      expect(mocks.grant.update).toHaveBeenCalledTimes(1);
      expect(mocks.grant.create).not.toHaveBeenCalled();
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited.action).toBe('CREATE');
      expect(audited.objectType).toBe('GRANT');
      expect(audited.scopeProcessId).toBe('p1');
      expect(audited.before).toEqual({ active: false });
      expect(audited.after).toEqual({ active: true });
    });

    it('grant inexistente -> create con AuditEvent CREATE (before null)', async () => {
      mocks.role.findFirst.mockResolvedValue({ id: 'r1', code: dto.roleCode });
      mocks.user.findUnique.mockResolvedValue({ id: 'u1' });
      mocks.process.findUnique.mockResolvedValue({ id: 'p1' });
      mocks.grant.findUnique.mockResolvedValue(null);
      mocks.grant.create.mockResolvedValue(makeGrant());

      await service.create(jefe(), dto);

      expect(mocks.grant.create).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited.action).toBe('CREATE');
      expect(audited.before).toBeNull();
    });
  });

  describe('revoke', () => {
    it('404 si el grant no existe', async () => {
      mocks.grant.findUnique.mockResolvedValue(null);
      await expect(service.revoke(jefe(), 'gX')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mocks.grant.update).not.toHaveBeenCalled();
    });

    it('revoca (soft) con AuditEvent REVOKE', async () => {
      mocks.grant.findUnique.mockResolvedValue(makeGrant({ active: true }));
      mocks.grant.update.mockResolvedValue(makeGrant({ active: false }));

      await service.revoke(jefe(), 'g1');

      expect(mocks.grant.update.mock.calls[0][0].data).toEqual({
        active: false,
      });
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited.action).toBe('REVOKE');
      expect(audited.before).toEqual({ active: true });
      expect(audited.after).toEqual({ active: false });
    });
  });
});
