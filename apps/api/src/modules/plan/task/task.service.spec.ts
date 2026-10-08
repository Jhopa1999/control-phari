import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { PlanStateService } from '../plan-state.service';
import { TaskStatus } from '../task-status';
import { TaskService } from './task.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    task: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    planPhase: { findFirst: jest.fn() },
    taskDependency: { count: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const planState = {
    requireTaskInScope: jest.fn(),
    requirePlanByIdInScope: jest.fn().mockResolvedValue({
      plan: { id: 'plan1' },
      requestId: 'r1',
      mainProcessId: 'p1',
      requestState: 'EN_EJECUCION',
    }),
    assertTaskTransition: jest.fn((from: string, to: TaskStatus) =>
      new PlanStateService(prisma).assertTaskTransition(from, to),
    ),
    assertPredecessorsSatisfied: jest.fn().mockResolvedValue(undefined),
  } as unknown as PlanStateService;
  return { prisma, prismaObj, audit, planState };
}

function actorWith(role: RoleCode, userId = 'u1'): CurrentActor {
  return {
    userId,
    name: 'X',
    identifier: 'x@demo.local',
    grants: [],
    roleCodes: new Set([role]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: role === RoleCode.JEFE_AREA,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    phaseId: 'ph1',
    processId: null,
    title: 'Tarea',
    responsibleUserId: 'u1',
    startDate: null,
    endDate: null,
    estimateHours: null,
    isMilestone: false,
    description: null,
    acceptanceCriteria: null,
    status: TaskStatus.POR_HACER,
    progress: 0,
    frameworkPhaseRequired: null,
    accepted: false,
    acceptedAt: null,
    acceptedByUserId: null,
    evidenceUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTaskWithDeps(overrides: Record<string, unknown> = {}) {
  return { ...makeTask(overrides), dependenciesAsDependent: [] };
}

describe('TaskService', () => {
  let service: TaskService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new TaskService(m.prisma, m.audit, m.planState);
  });

  describe('create (regla hito, AC-011)', () => {
    it('hito con horas>0 -> 400', async () => {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue({ id: 'ph1', planId: 'plan1' });
      await expect(
        service.create(actorWith(RoleCode.LIDER_PROCESO), 'ph1', {
          title: 'Hito',
          isMilestone: true,
          estimateHours: 5,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((m.prismaObj.task as any).create).not.toHaveBeenCalled();
    });

    it('hito con dos fechas distintas -> 400', async () => {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue({ id: 'ph1', planId: 'plan1' });
      await expect(
        service.create(actorWith(RoleCode.LIDER_PROCESO), 'ph1', {
          title: 'Hito',
          isMilestone: true,
          startDate: '2025-01-01',
          endDate: '2025-01-02',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hito valido (una fecha, 0 horas) -> crea y normaliza', async () => {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue({ id: 'ph1', planId: 'plan1' });
      (m.prismaObj.task as any).create.mockResolvedValue(
        makeTask({ id: 't9', isMilestone: true }),
      );
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ id: 't9', isMilestone: true }),
      );

      await service.create(actorWith(RoleCode.LIDER_PROCESO), 'ph1', {
        title: 'Hito',
        isMilestone: true,
        startDate: '2025-01-05',
      });

      const data = (m.prismaObj.task as any).create.mock.calls[0][0].data;
      expect(data.estimateHours).toBe(0);
      // Una sola fecha informada: se copia a ambas columnas.
      expect(data.startDate).toEqual(data.endDate);
    });
  });

  describe('remove (D15)', () => {
    it('borrar una tarea que es predecesora de otra -> 409', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.taskDependency as any).count.mockResolvedValue(1);

      await expect(
        service.remove(actorWith(RoleCode.LIDER_PROCESO), 't1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((m.prismaObj.task as any).delete).not.toHaveBeenCalled();
    });

    it('borrar una tarea que no es predecesora -> permitido y auditado', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.taskDependency as any).count.mockResolvedValue(0);
      (m.prismaObj.task as any).delete.mockResolvedValue({ id: 't1' });

      await service.remove(actorWith(RoleCode.LIDER_PROCESO), 't1');

      expect((m.prismaObj.task as any).delete).toHaveBeenCalled();
      expect((m.audit.record as jest.Mock).mock.calls[0][1]).toMatchObject({
        action: 'DELETE',
        objectType: 'TASK',
      });
    });
  });

  describe('changeStatus (permisos §2.7 + gate de predecesoras)', () => {
    it('integrante muta tarea ajena -> 403', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ responsibleUserId: 'otro' }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });

      await expect(
        service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
          status: TaskStatus.EN_CURSO,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('integrante muta su propia tarea -> ok (gate de predecesoras verificado)', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ responsibleUserId: 'u1', status: TaskStatus.POR_HACER }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).update.mockResolvedValue(
        makeTask({ status: TaskStatus.EN_CURSO }),
      );
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ status: TaskStatus.EN_CURSO }),
      );

      const res = await service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
        status: TaskStatus.EN_CURSO,
      });

      expect(m.planState.assertPredecessorsSatisfied).toHaveBeenCalledWith('t1');
      expect(res.status).toBe(TaskStatus.EN_CURSO);
    });

    it('transicion no permitida -> 409', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ responsibleUserId: 'u1', status: TaskStatus.POR_HACER }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });

      await expect(
        service.changeStatus(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
          status: TaskStatus.TERMINADA,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('accept (D6b)', () => {
    it('aceptar una tarea no TERMINADA -> 409', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ status: TaskStatus.EN_CURSO }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });

      await expect(
        service.accept(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', { accepted: true }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('aceptar una tarea TERMINADA -> ok y audita', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ status: TaskStatus.TERMINADA }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).update.mockResolvedValue(
        makeTask({ status: TaskStatus.TERMINADA, accepted: true }),
      );
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ status: TaskStatus.TERMINADA, accepted: true }),
      );

      const res = await service.accept(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
        accepted: true,
      });

      expect(res.accepted).toBe(true);
      expect((m.audit.record as jest.Mock).mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'TASK',
      });
    });
  });

  describe('myWork', () => {
    it('filtra por responsibleUserId del actor y alcance de proceso (no-jefe)', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.myWork(actorWith(RoleCode.INTEGRANTE, 'u1'));
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.responsibleUserId).toBe('u1');
      expect(where.phase.plan.request).toEqual({ mainProcessId: { in: ['p1'] } });
    });
  });
});
