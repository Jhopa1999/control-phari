import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { PlanStateService } from './plan-state.service';
import { PlanStatus } from './plan-status';
import { TaskStatus } from './task-status';

function createPrismaMock() {
  const prisma = {
    request: { findFirst: jest.fn() },
    plan: { findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
    taskDependency: { findMany: jest.fn() },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

function lider(scoped: string[] = ['p1']): CurrentActor {
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

describe('PlanStateService', () => {
  let service: PlanStateService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PlanStateService(prisma);
  });

  describe('assertTaskTransition / assertPlanTransition', () => {
    it('arista de tarea prohibida -> 409', () => {
      expect(() =>
        service.assertTaskTransition(TaskStatus.POR_HACER, TaskStatus.TERMINADA),
      ).toThrow(ConflictException);
    });
    it('arista de plan permitida pasa', () => {
      expect(
        service.assertPlanTransition(PlanStatus.BORRADOR, PlanStatus.EN_AUTORIZACION),
      ).toBe(PlanStatus.EN_AUTORIZACION);
    });
  });

  describe('requirePlanInScope (precaucion Prisma 7 §1.1)', () => {
    it('resuelve el plan por findFirst({where:{requestId}}), NO findUnique', async () => {
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p1',
        operationalState: 'EN_PLANIFICACION',
      });
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', requestId: 'r1', status: 'BORRADOR' });

      const result = await service.requirePlanInScope(lider(), 'r1');

      expect(prisma.plan.findFirst).toHaveBeenCalledWith({
        where: { requestId: 'r1' },
      });
      expect(result.plan.id).toBe('plan1');
      expect(result.mainProcessId).toBe('p1');
    });

    it('Request fuera de alcance -> 404 (no filtra datos)', async () => {
      prisma.request.findFirst.mockResolvedValue(null);
      await expect(
        service.requirePlanInScope(lider(['pX']), 'r1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      // No llega a consultar el plan si la Request esta fuera de alcance.
      expect(prisma.plan.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('assertPredecessorsSatisfied (AC-010/033)', () => {
    it('predecesora TERMINADA pero no aceptada -> 409 nombrando la dependencia', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { predecessor: { title: 'Pre A', status: TaskStatus.TERMINADA, accepted: false } },
      ]);
      await expect(
        service.assertPredecessorsSatisfied('t2'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('predecesora TERMINADA y aceptada -> no lanza', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { predecessor: { title: 'Pre A', status: TaskStatus.TERMINADA, accepted: true } },
      ]);
      await expect(
        service.assertPredecessorsSatisfied('t2'),
      ).resolves.toBeUndefined();
    });

    it('sin predecesoras -> no lanza', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([]);
      await expect(
        service.assertPredecessorsSatisfied('t2'),
      ).resolves.toBeUndefined();
    });
  });
});
