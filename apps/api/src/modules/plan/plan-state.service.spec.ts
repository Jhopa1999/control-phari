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
    isAdmin: false,
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
    it('arista de tarea permitida se resuelve', () => {
      expect(
        service.assertTaskTransition(TaskStatus.POR_HACER, TaskStatus.EN_CURSO),
      ).toBe(TaskStatus.EN_CURSO);
    });
    it('estado de origen de tarea invalido -> 500', () => {
      expect(() =>
        service.assertTaskTransition('NO_EXISTE', TaskStatus.EN_CURSO),
      ).toThrow('TaskStatus');
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

    it('Request en alcance pero sin plan -> 404', async () => {
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p1',
        operationalState: 'EN_PLANIFICACION',
      });
      prisma.plan.findFirst.mockResolvedValue(null);
      await expect(
        service.requirePlanInScope(lider(), 'r1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('jefe usa where de alcance vacio', async () => {
      const jefe: CurrentActor = {
        userId: 'uj',
        name: 'Jefa',
        identifier: 'jefe@demo.local',
        grants: [],
        roleCodes: new Set([RoleCode.JEFE_AREA]),
        scopedProcessIds: new Set<string>(),
        isJefeArea: true,
        isAdmin: false,
      };
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p9',
        operationalState: 'EN_PLANIFICACION',
      });
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', requestId: 'r1' });
      await service.requirePlanInScope(jefe, 'r1');
      const where = prisma.request.findFirst.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({});
    });
  });

  describe('requirePlanByIdInScope', () => {
    it('resuelve plan->request y devuelve mainProcessId', async () => {
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', requestId: 'r1' });
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p1',
        operationalState: 'EN_PLANIFICACION',
      });
      const res = await service.requirePlanByIdInScope(lider(), 'plan1');
      expect(res.requestId).toBe('r1');
      expect(res.mainProcessId).toBe('p1');
    });

    it('plan inexistente -> 404', async () => {
      prisma.plan.findFirst.mockResolvedValue(null);
      await expect(
        service.requirePlanByIdInScope(lider(), 'planX'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('request del plan fuera de alcance -> 404', async () => {
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', requestId: 'r1' });
      prisma.request.findFirst.mockResolvedValue(null);
      await expect(
        service.requirePlanByIdInScope(lider(['pX']), 'plan1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('requireTaskInScope', () => {
    it('sube task->phase->plan->request y devuelve tarea sin phase', async () => {
      prisma.task.findFirst.mockResolvedValue({
        id: 't1',
        title: 'Tarea',
        status: 'POR_HACER',
        phase: { planId: 'plan1' },
      });
      prisma.plan.findFirst.mockResolvedValue({ requestId: 'r1' });
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p1',
      });
      const res = await service.requireTaskInScope(lider(), 't1');
      expect(res.planId).toBe('plan1');
      expect(res.requestId).toBe('r1');
      expect((res.task as any).phase).toBeUndefined();
    });

    it('tarea inexistente -> 404', async () => {
      prisma.task.findFirst.mockResolvedValue(null);
      await expect(
        service.requireTaskInScope(lider(), 'tX'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('plan de la tarea inexistente -> 404', async () => {
      prisma.task.findFirst.mockResolvedValue({
        id: 't1',
        phase: { planId: 'plan1' },
      });
      prisma.plan.findFirst.mockResolvedValue(null);
      await expect(
        service.requireTaskInScope(lider(), 't1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('request de la tarea fuera de alcance -> 404', async () => {
      prisma.task.findFirst.mockResolvedValue({
        id: 't1',
        phase: { planId: 'plan1' },
      });
      prisma.plan.findFirst.mockResolvedValue({ requestId: 'r1' });
      prisma.request.findFirst.mockResolvedValue(null);
      await expect(
        service.requireTaskInScope(lider(['pX']), 't1'),
      ).rejects.toBeInstanceOf(NotFoundException);
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
