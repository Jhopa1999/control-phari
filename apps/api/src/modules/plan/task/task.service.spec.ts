import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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
    assertProjectOpen: jest.fn(),
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
    isAdmin: false,
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
    service = new TaskService(m.prisma, m.audit, m.planState, { notify: jest.fn(), areaHeadsForProcess: jest.fn().mockResolvedValue([]), processLeaders: jest.fn().mockResolvedValue([]) } as never);
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

  describe('findForPlan (filtros §3.4)', () => {
    it('sin filtros -> where base solo por plan', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.findForPlan(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 'plan1', {});
      expect(m.planState.requirePlanByIdInScope).toHaveBeenCalledWith(
        expect.anything(),
        'plan1',
      );
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where).toEqual({ phase: { planId: 'plan1' } });
    });

    it('aplica phaseId, status, mine="true" y q al where', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.findForPlan(actorWith(RoleCode.INTEGRANTE, 'u1'), 'plan1', {
        phaseId: 'ph9',
        status: TaskStatus.EN_CURSO,
        mine: 'true',
        q: 'auditoria',
      });
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.phaseId).toBe('ph9');
      expect(where.status).toBe(TaskStatus.EN_CURSO);
      expect(where.responsibleUserId).toBe('u1');
      expect(where.title).toEqual({ contains: 'auditoria', mode: 'insensitive' });
    });

    it('q vacio y mine distinto de "true" no agregan filtros', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.findForPlan(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 'plan1', {
        mine: 'false',
        q: '',
      });
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.responsibleUserId).toBeUndefined();
      expect(where.title).toBeUndefined();
    });

    it('mapea las tareas a respuesta con predecesoras', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        {
          ...makeTask({ id: 'tA' }),
          dependenciesAsDependent: [
            {
              predecessor: { id: 'tB', title: 'Previa', status: 'TERMINADA', accepted: true },
            },
          ],
        },
      ]);
      const res = await service.findForPlan(
        actorWith(RoleCode.LIDER_PROCESO, 'ul'),
        'plan1',
        {},
      );
      expect(res).toHaveLength(1);
      expect(res[0].predecessors).toEqual([
        { id: 'tB', title: 'Previa', status: 'TERMINADA', accepted: true },
      ]);
    });
  });

  describe('findOne', () => {
    it('task fuera de existencia tras scope -> 404', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('task existente -> respuesta mapeada', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ id: 't1' }),
      );

      const res = await service.findOne(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1');
      expect(res.id).toBe('t1');
      expect(res.predecessors).toEqual([]);
    });
  });

  describe('create (fase inexistente)', () => {
    it('fase no encontrada -> 404 sin tocar planState ni crear', async () => {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue(null);
      await expect(
        service.create(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 'phX', {
          title: 'T',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(m.planState.requirePlanByIdInScope).not.toHaveBeenCalled();
      expect((m.prismaObj.task as any).create).not.toHaveBeenCalled();
    });
  });

  describe('update (§2.4 regla hito + connect + auditoria)', () => {
    function scopeTask(task: Record<string, unknown>) {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task,
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
    }

    it('cambia responsable y proceso via connect; audita UPDATE', async () => {
      scopeTask(makeTask({ id: 't1' }));
      (m.prismaObj.task as any).update.mockResolvedValue(makeTask({ id: 't1' }));
      (m.prismaObj.task as any).findFirst.mockResolvedValue(makeTaskWithDeps({ id: 't1' }));

      await service.update(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
        title: 'Renombrada',
        responsibleUserId: 'u2',
        processId: 'p2',
        description: 'desc',
        acceptanceCriteria: 'AC',
        frameworkPhaseRequired: 'PLANIFICACION',
        evidenceUrl: 'https://ev',
      });

      const data = (m.prismaObj.task as any).update.mock.calls[0][0].data;
      expect(data.title).toBe('Renombrada');
      expect(data.responsible).toEqual({ connect: { id: 'u2' } });
      expect(data.process).toEqual({ connect: { id: 'p2' } });
      expect(data.description).toBe('desc');
      expect(data.acceptanceCriteria).toBe('AC');
      expect(data.frameworkPhaseRequired).toBe('PLANIFICACION');
      expect(data.evidenceUrl).toBe('https://ev');
      // No se tocaron campos de la regla hito.
      expect(data.estimateHours).toBeUndefined();
      expect(data.startDate).toBeUndefined();
      expect(data.endDate).toBeUndefined();
      expect((m.audit.record as jest.Mock).mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'TASK',
        objectId: 't1',
        scopeProcessId: 'p1',
      });
    });

    it('convertir en hito con horas>0 -> 400', async () => {
      scopeTask(makeTask({ id: 't1', isMilestone: false, estimateHours: null }));
      await expect(
        service.update(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
          isMilestone: true,
          estimateHours: 8,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
    });

    it('convertir en hito valido -> normaliza estimateHours a 0 y copia fecha', async () => {
      scopeTask(makeTask({ id: 't1', isMilestone: false, estimateHours: null }));
      (m.prismaObj.task as any).update.mockResolvedValue(makeTask({ id: 't1', isMilestone: true }));
      (m.prismaObj.task as any).findFirst.mockResolvedValue(makeTaskWithDeps({ id: 't1' }));

      await service.update(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
        isMilestone: true,
        estimateHours: 0,
        startDate: '2025-02-10',
      });

      const data = (m.prismaObj.task as any).update.mock.calls[0][0].data;
      expect(data.isMilestone).toBe(true);
      expect(data.estimateHours).toBe(0);
      expect(data.startDate).toEqual(data.endDate);
    });

    it('actualizar solo fechas recalcula columnas sin tocar isMilestone', async () => {
      scopeTask(makeTask({ id: 't1', isMilestone: false, estimateHours: 3 }));
      (m.prismaObj.task as any).update.mockResolvedValue(makeTask({ id: 't1' }));
      (m.prismaObj.task as any).findFirst.mockResolvedValue(makeTaskWithDeps({ id: 't1' }));

      await service.update(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
        startDate: '2025-03-01',
        endDate: '2025-03-05',
      });

      const data = (m.prismaObj.task as any).update.mock.calls[0][0].data;
      expect(data.isMilestone).toBeUndefined();
      expect(data.estimateHours).toBe(3);
      expect(data.startDate).toEqual(new Date('2025-03-01'));
      expect(data.endDate).toEqual(new Date('2025-03-05'));
    });
  });

  describe('myWork', () => {
    it('filtra por responsibleUserId del actor y alcance de proceso (no-jefe)', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.myWork(actorWith(RoleCode.INTEGRANTE, 'u1'));
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.responsibleUserId).toBe('u1');
      expect(where.phase.plan.request).toEqual({ deletedAt: null, mainProcessId: { in: ['p1'] } });
    });

    it('jefe de area: sin filtro de alcance (request where {}) y mapea items', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        {
          ...makeTask({ id: 'tW' }),
          phase: {
            id: 'ph1',
            name: 'Fase 1',
            planId: 'plan1',
            plan: { requestId: 'r1', request: { title: 'Sol' } },
          },
        },
      ]);
      const res = await service.myWork(actorWith(RoleCode.JEFE_AREA, 'uj'));
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.responsibleUserId).toBe('uj');
      expect(where.phase.plan.request).toEqual({ deletedAt: null });
      expect(res[0]).toMatchObject({
        taskId: 'tW',
        phaseName: 'Fase 1',
        requestId: 'r1',
        requestTitle: 'Sol',
      });
    });
  });

  describe('changeStatus (progress y evidenceUrl opcionales)', () => {
    it('propaga progress y evidenceUrl al update', async () => {
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

      await service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
        status: TaskStatus.EN_CURSO,
        progress: 40,
        evidenceUrl: 'https://ev',
      });

      const data = (m.prismaObj.task as any).update.mock.calls[0][0].data;
      expect(data.progress).toBe(40);
      expect(data.evidenceUrl).toBe('https://ev');
    });
  });

  describe('accept (retirar aceptacion)', () => {
    it('accepted=false -> disconnect de acceptedBy y audita', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ status: TaskStatus.TERMINADA, accepted: true }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).update.mockResolvedValue(
        makeTask({ status: TaskStatus.TERMINADA, accepted: false }),
      );
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ status: TaskStatus.TERMINADA, accepted: false }),
      );

      await service.accept(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
        accepted: false,
      });

      const data = (m.prismaObj.task as any).update.mock.calls[0][0].data;
      expect(data.accepted).toBe(false);
      expect(data.acceptedAt).toBeNull();
      expect(data.acceptedBy).toEqual({ disconnect: true });
    });
  });
});
