import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from './audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

type AuditDelegateMock = {
  create: jest.Mock;
  findMany: jest.Mock;
};

function createMocks() {
  const auditEvent: AuditDelegateMock = {
    create: jest.fn(),
    findMany: jest.fn(),
  };
  const prisma = { auditEvent } as unknown as PrismaService;
  return { prisma, auditEvent };
}

function actorWith(roles: RoleCode[], scoped: string[]): CurrentActor {
  return {
    userId: 'u1',
    name: 'Actor',
    identifier: 'actor@demo.local',
    grants: [],
    roleCodes: new Set(roles),
    scopedProcessIds: new Set(scoped),
    isJefeArea: roles.includes(RoleCode.JEFE_AREA),
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new AuditService(mocks.prisma);
  });

  describe('record', () => {
    it('inserta con el cliente transaccional y convierte null a Prisma.JsonNull', async () => {
      const tx = { auditEvent: { create: jest.fn() } };
      await service.record(tx as unknown as Prisma.TransactionClient, {
        actorUserId: 'u1',
        action: 'CREATE',
        objectType: 'GRANT',
        objectId: 'g1',
        scopeProcessId: 'p1',
        before: null,
        after: { active: true },
      });

      const data = tx.auditEvent.create.mock.calls[0][0].data;
      expect(data.before).toBe(Prisma.JsonNull);
      expect(data.after).toEqual({ active: true });
      // No se usa el prisma no-transaccional para escribir.
      expect(mocks.auditEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('findMany - alcance por rol', () => {
    it('integrante: solo sus propios eventos (actorUserId)', async () => {
      mocks.auditEvent.findMany.mockResolvedValue([]);
      await service.findMany(actorWith([RoleCode.INTEGRANTE], ['p1']), {});
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.actorUserId).toBe('u1');
      expect(where.scopeProcessId).toBeUndefined();
    });

    it('lider: eventos de sus procesos (scopeProcessId in scopedProcessIds)', async () => {
      mocks.auditEvent.findMany.mockResolvedValue([]);
      await service.findMany(
        actorWith([RoleCode.LIDER_PROCESO], ['p1', 'p2']),
        {},
      );
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.scopeProcessId).toEqual({ in: ['p1', 'p2'] });
      expect(where.actorUserId).toBeUndefined();
    });

    it('jefe: eventos de sus procesos de area', async () => {
      mocks.auditEvent.findMany.mockResolvedValue([]);
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {});
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.scopeProcessId).toEqual({ in: ['p1'] });
    });
  });

  describe('findMany - take y orden', () => {
    it('aplica take por defecto de 500 y orden createdAt desc', async () => {
      mocks.auditEvent.findMany.mockResolvedValue([]);
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {});
      const arg = mocks.auditEvent.findMany.mock.calls[0][0];
      expect(arg.take).toBe(500);
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('acota take a <= 500 aunque pidan mas', async () => {
      mocks.auditEvent.findMany.mockResolvedValue([]);
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {
        take: 999,
      });
      expect(mocks.auditEvent.findMany.mock.calls[0][0].take).toBe(500);
    });

    it('respeta un take menor', async () => {
      mocks.auditEvent.findMany.mockResolvedValue([]);
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {
        take: 10,
      });
      expect(mocks.auditEvent.findMany.mock.calls[0][0].take).toBe(10);
    });

    it('filtra por objectType cuando se indica', async () => {
      mocks.auditEvent.findMany.mockResolvedValue([]);
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {
        objectType: 'GRANT',
      });
      expect(mocks.auditEvent.findMany.mock.calls[0][0].where.objectType).toBe(
        'GRANT',
      );
    });
  });
});
