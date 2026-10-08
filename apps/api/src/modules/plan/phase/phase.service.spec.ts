import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { PlanStateService } from '../plan-state.service';
import { PhaseService } from './phase.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    planPhase: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    task: { count: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const planState = {
    requirePlanByIdInScope: jest.fn().mockResolvedValue({
      plan: { id: 'plan1' },
      requestId: 'r1',
      mainProcessId: 'p1',
      requestState: 'EN_PLANIFICACION',
    }),
  } as unknown as PlanStateService;
  return { prisma, prismaObj, audit, planState };
}

function lider(): CurrentActor {
  return {
    userId: 'ul',
    name: 'Beto',
    identifier: 'lider@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
  };
}

describe('PhaseService', () => {
  let service: PhaseService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new PhaseService(m.prisma, m.audit, m.planState);
  });

  describe('remove (AC-009 / D12)', () => {
    it('borrar una fase con tareas -> 409', async () => {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue({
        id: 'ph1',
        planId: 'plan1',
        order: 0,
      });
      (m.prismaObj.task as any).count.mockResolvedValue(2);

      await expect(service.remove(lider(), 'plan1', 'ph1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((m.prismaObj.planPhase as any).delete).not.toHaveBeenCalled();
    });

    it('borrar una fase sin tareas -> permitido y auditado', async () => {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue({
        id: 'ph1',
        planId: 'plan1',
        name: 'F',
        order: 1,
      });
      (m.prismaObj.task as any).count.mockResolvedValue(0);
      (m.prismaObj.planPhase as any).delete.mockResolvedValue({ id: 'ph1' });

      await service.remove(lider(), 'plan1', 'ph1');

      expect((m.prismaObj.planPhase as any).delete).toHaveBeenCalled();
      expect((m.audit.record as jest.Mock).mock.calls[0][1]).toMatchObject({
        action: 'DELETE',
        objectType: 'PLAN_PHASE',
        scopeProcessId: 'p1',
      });
    });
  });

  describe('reorder (AC-009 / D4)', () => {
    it('mover la fase inicial con tareas -> 409', async () => {
      (m.prismaObj.planPhase as any).findMany.mockResolvedValue([
        { id: 'ph1', order: 0, _count: { tasks: 3 } },
        { id: 'ph2', order: 1, _count: { tasks: 0 } },
      ]);

      await expect(
        service.reorder(lider(), 'plan1', { phaseIds: ['ph2', 'ph1'] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lista que no coincide con las fases del plan -> 409', async () => {
      (m.prismaObj.planPhase as any).findMany.mockResolvedValue([
        { id: 'ph1', order: 0, _count: { tasks: 0 } },
        { id: 'ph2', order: 1, _count: { tasks: 0 } },
      ]);

      await expect(
        service.reorder(lider(), 'plan1', { phaseIds: ['ph1'] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reordena cuando la inicial sin tareas se mueve -> ok y audita UPDATE PLAN', async () => {
      (m.prismaObj.planPhase as any).findMany
        .mockResolvedValueOnce([
          { id: 'ph1', order: 0, _count: { tasks: 0 } },
          { id: 'ph2', order: 1, _count: { tasks: 0 } },
        ])
        .mockResolvedValueOnce([
          { id: 'ph2', planId: 'plan1', name: 'B', startDate: null, endDate: null, deliverable: null, order: 0, createdAt: new Date(), updatedAt: new Date() },
          { id: 'ph1', planId: 'plan1', name: 'A', startDate: null, endDate: null, deliverable: null, order: 1, createdAt: new Date(), updatedAt: new Date() },
        ]);
      (m.prismaObj.planPhase as any).update.mockResolvedValue({});

      const res = await service.reorder(lider(), 'plan1', { phaseIds: ['ph2', 'ph1'] });

      expect(res.map((p) => p.id)).toEqual(['ph2', 'ph1']);
      expect((m.audit.record as jest.Mock).mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'PLAN',
      });
    });
  });
});
