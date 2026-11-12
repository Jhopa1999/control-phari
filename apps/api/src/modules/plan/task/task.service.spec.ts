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

/** Simula plan.update({ data: { xSeqNext: { increment } } }) con contadores en memoria. */
function planCounterUpdate(start = { phaseSeqNext: 1, taskSeqNext: 1 }) {
  const state = { ...start };
  return async (args: { data: Record<string, { increment: number }> }) => {
    for (const [key, value] of Object.entries(args.data)) {
      state[key as keyof typeof state] += value.increment;
    }
    return { ...state, request: { code: 'PRY-0012' } };
  };
}

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    task: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    taskEvidence: { count: jest.fn().mockResolvedValue(0) },
    planPhase: { findFirst: jest.fn() },
    // Contador atómico del plan (ID visible): simula el increment de Prisma, que
    // devuelve el valor ya incrementado.
    plan: { update: jest.fn(planCounterUpdate()) },
    taskDependency: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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
    assertResponsibleInParticipants: jest.fn().mockResolvedValue(undefined),
    responsibleCandidates: jest.fn().mockResolvedValue([]),
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
    isLiderProceso: false,
    isAdmin: false,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    code: 'PRY-0012-T01',
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
    blockedReason: null,
    reviewRequestedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Conteo de archivos de evidencia que Prisma embebe con `_count`.
    _count: { evidences: 0 },
    ...overrides,
  };
}

function makeTaskWithDeps(overrides: Record<string, unknown> = {}) {
  return {
    ...makeTask(overrides),
    dependenciesAsDependent: [],
    phase: {
      name: 'Fase 1',
      code: 'PRY-0012-F1',
      plan: { requestId: 'r1', request: { title: 'Solicitud 1', code: 'PRY-0012' } },
    },
  };
}

describe('TaskService', () => {
  let service: TaskService;
  let m: ReturnType<typeof createMocks>;
  let notifier: {
    notify: jest.Mock;
    areaHeadsForProcess: jest.Mock;
    processLeaders: jest.Mock;
  };

  beforeEach(() => {
    m = createMocks();
    notifier = {
      notify: jest.fn(),
      areaHeadsForProcess: jest.fn().mockResolvedValue(['jefe1']),
      processLeaders: jest.fn().mockResolvedValue(['lider1']),
    };
    service = new TaskService(m.prisma, m.audit, m.planState, notifier as never);
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
      expect(data.code).toBe('PRY-0012-T01');
      expect(data.estimateHours).toBe(0);
      // Una sola fecha informada: se copia a ambas columnas.
      expect(data.startDate).toEqual(data.endDate);
    });

    it('responsable fuera de los procesos intervinientes -> 400 (condicion dura)', async () => {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue({ id: 'ph1', planId: 'plan1' });
      (m.planState.assertResponsibleInParticipants as jest.Mock).mockRejectedValueOnce(
        new BadRequestException(
          'El responsable debe pertenecer a un proceso interviniente de la solicitud.',
        ),
      );

      await expect(
        service.create(actorWith(RoleCode.LIDER_PROCESO), 'ph1', {
          title: 'Tarea',
          responsibleUserId: 'ajeno',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.planState.assertResponsibleInParticipants).toHaveBeenCalledWith(
        'r1',
        'ajeno',
      );
      expect((m.prismaObj.task as any).create).not.toHaveBeenCalled();
    });
  });

  describe('ID visible de la tarea', () => {
    function prepareCreate() {
      (m.prismaObj.planPhase as any).findFirst.mockResolvedValue({ id: 'ph1', planId: 'plan1' });
      (m.prismaObj.task as any).create.mockImplementation(async ({ data }: any) =>
        makeTask({ id: `id-${data.code}`, code: data.code }),
      );
      (m.prismaObj.task as any).findFirst.mockImplementation(async ({ where }: any) =>
        makeTaskWithDeps({ id: where.id }),
      );
    }

    it('crea tareas con códigos consecutivos PRY-0012-T01, T02... y no acepta code del DTO', async () => {
      prepareCreate();
      const actor = actorWith(RoleCode.LIDER_PROCESO);
      await service.create(actor, 'ph1', { title: 'A' });
      await service.create(actor, 'ph1', { title: 'B' });
      const codes = (m.prismaObj.task as any).create.mock.calls.map((c: any[]) => c[0].data.code);
      expect(codes).toEqual(['PRY-0012-T01', 'PRY-0012-T02']);
    });

    it('creación paralela de varias tareas produce códigos únicos y consecutivos', async () => {
      prepareCreate();
      const actor = actorWith(RoleCode.LIDER_PROCESO);
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => service.create(actor, 'ph1', { title: `T${i}` })),
      );
      const codes = (m.prismaObj.task as any).create.mock.calls
        .map((c: any[]) => c[0].data.code as string)
        .sort();
      expect(new Set(codes).size).toBe(10);
      expect(codes[0]).toBe('PRY-0012-T01');
      expect(codes[9]).toBe('PRY-0012-T10');
    });

    it('el contador se incrementa en una sola sentencia sobre el plan de la fase', async () => {
      prepareCreate();
      await service.create(actorWith(RoleCode.LIDER_PROCESO), 'ph1', { title: 'A' });
      const call = (m.prismaObj.plan as any).update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'plan1' });
      expect(call.data).toEqual({ taskSeqNext: { increment: 1 } });
    });

    it('la lista y el detalle devuelven code, phaseCode y requestCode', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([makeTaskWithDeps({ id: 'tA' })]);
      const [item] = await service.findForPlan(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 'plan1', {});
      expect(item.code).toBe('PRY-0012-T01');
      expect(item.phaseCode).toBe('PRY-0012-F1');
      expect(item.requestCode).toBe('PRY-0012');
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

  describe('findByCode (ID visible)', () => {
    it('normaliza a mayúsculas, resuelve el id y reutiliza el alcance del detalle', async () => {
      (m.prismaObj.task as any).findFirst
        .mockResolvedValueOnce({ id: 't1' })
        .mockResolvedValueOnce(makeTaskWithDeps({ id: 't1' }));
      const res = await service.findByCode(actorWith(RoleCode.LIDER_PROCESO), ' pry-0012-t01 ');
      expect((m.prismaObj.task as any).findFirst.mock.calls[0][0].where).toEqual({ code: 'PRY-0012-T01' });
      expect(m.planState.requireTaskInScope).toHaveBeenCalledWith(expect.anything(), 't1');
      expect(res.code).toBe('PRY-0012-T01');
    });

    it('código inexistente -> 404', async () => {
      (m.prismaObj.task as any).findFirst.mockResolvedValue(null);
      await expect(
        service.findByCode(actorWith(RoleCode.LIDER_PROCESO), 'PRY-9999-T99'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('notificación de asignación con ID visible', () => {
    it('incluye el código de la tarea y de la solicitud en título y mensaje', async () => {
      (m.prismaObj as Record<string, unknown>).request = {
        findFirst: jest.fn().mockResolvedValue({ code: 'PRY-0012' }),
      };
      await (service as unknown as {
        notifyAssignment: (a: CurrentActor, t: unknown, r: string) => Promise<void>;
      }).notifyAssignment(
        actorWith(RoleCode.LIDER_PROCESO, 'ul'),
        { id: 't1', code: 'PRY-0012-T07', title: 'Migrar endpoints', responsibleUserId: 'u1' },
        'r1',
      );
      const call = notifier.notify.mock.calls.find((c) => c[0].type === 'TASK_ASSIGNED');
      expect(call?.[0].title).toBe('Nueva tarea asignada · PRY-0012-T07');
      expect(call?.[0].message).toBe(
        'Se te asignó la tarea PRY-0012-T07 «Migrar endpoints» del proyecto PRY-0012.',
      );
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
      // Busca por título O por ID visible (completo/parcial).
      expect(where.OR).toEqual([
        { title: { contains: 'auditoria', mode: 'insensitive' } },
        { code: { contains: 'auditoria', mode: 'insensitive' } },
      ]);
    });

    it('q con forma corta (t7) o completa (PRY-0012-T07) coincide también con el código', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.findForPlan(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 'plan1', { q: 't7' });
      await service.findForPlan(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 'plan1', {
        q: 'PRY-0012-T07',
      });
      const [short, full] = (m.prismaObj.task as any).findMany.mock.calls.map(
        (c: any[]) => c[0].where.OR,
      );
      expect(short).toContainEqual({ code: { endsWith: '-T07', mode: 'insensitive' } });
      expect(full).toContainEqual({ code: { contains: 'PRY-0012-T07', mode: 'insensitive' } });
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
      expect(where.OR).toBeUndefined();
    });

    it('mapea las tareas a respuesta con predecesoras', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        {
          ...makeTask({ id: 'tA' }),
          phase: { name: 'Fase 1', plan: { requestId: 'r1', request: { title: 'Solicitud 1' } } },
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

    it('incluye phaseName, requestId y requestTitle en una sola consulta (sin N+1)', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        makeTaskWithDeps({ id: 'tA' }),
        makeTaskWithDeps({ id: 'tB' }),
      ]);
      const res = await service.findForPlan(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 'plan1', {});
      expect(res.map((r) => [r.phaseName, r.requestId, r.requestTitle])).toEqual([
        ['Fase 1', 'r1', 'Solicitud 1'],
        ['Fase 1', 'r1', 'Solicitud 1'],
      ]);
      expect((m.prismaObj.task as any).findMany).toHaveBeenCalledTimes(1);
      expect(m.planState.requirePlanByIdInScope).toHaveBeenCalledTimes(1);
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

    it('informa el nombre real del responsable', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ id: 't1', responsible: { name: 'Wilmer Castro' } }),
      );
      const res = await service.findOne(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1');
      expect(res.responsibleName).toBe('Wilmer Castro');
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
      expect(res.responsibleName).toBeNull();
      expect(res).toMatchObject({
        phaseName: 'Fase 1',
        requestId: 'r1',
        requestTitle: 'Solicitud 1',
        blockedReason: null,
      });
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

    it('valida el nuevo responsable pasando el actual, para conservar a quien ya lo era', async () => {
      scopeTask(makeTask({ id: 't1', responsibleUserId: 'u-ia' }));
      (m.prismaObj.task as any).update.mockResolvedValue(makeTask({ id: 't1' }));
      (m.prismaObj.task as any).findFirst.mockResolvedValue(makeTaskWithDeps({ id: 't1' }));
      await service.update(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', {
        responsibleUserId: 'u-ia',
        title: 'Renombrada',
      });
      expect(m.planState.assertResponsibleInParticipants).toHaveBeenCalledWith(
        'r1',
        'u-ia',
        'u-ia',
      );
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
            plan: {
              requestId: 'r1',
              commitmentDate: null,
              request: {
                title: 'Sol',
                operationalState: 'EN_EJECUCION',
                initialCommitmentDate: null,
              },
            },
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
        pendingPredecessors: [],
        blockedReason: null,
        requestOperationalState: 'EN_EJECUCION',
        requestCommitmentDate: null,
      });
    });

    it('enriquece con predecesoras pendientes, motivo, estado y compromiso en consultas por lote', async () => {
      const initial = new Date('2026-03-01T00:00:00Z');
      const planDate = new Date('2026-04-01T00:00:00Z');
      const phase = (commitmentDate: Date | null) => ({
        id: 'ph1',
        name: 'Fase 1',
        planId: 'plan1',
        plan: {
          requestId: 'r1',
          commitmentDate,
          request: { title: 'Sol', operationalState: 'CERRADA', initialCommitmentDate: initial },
        },
      });
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        { ...makeTask({ id: 'tA', status: TaskStatus.BLOQUEADA, blockedReason: 'Falta acceso' }), phase: phase(null) },
        { ...makeTask({ id: 'tB' }), phase: phase(planDate) },
        { ...makeTask({ id: 'tC' }), phase: phase(null) },
      ]);
      (m.prismaObj.taskDependency as any).findMany.mockResolvedValue([
        { dependentTaskId: 'tA', predecessor: { id: 'p2', title: 'Zeta' } },
        { dependentTaskId: 'tA', predecessor: { id: 'p1', title: 'Alfa' } },
      ]);

      const res = await service.myWork(actorWith(RoleCode.JEFE_AREA, 'uj'));

      expect(res[0]).toMatchObject({
        blockedReason: 'Falta acceso',
        requestOperationalState: 'CERRADA',
        requestCommitmentDate: initial,
        pendingPredecessors: [
          { taskId: 'p1', title: 'Alfa' },
          { taskId: 'p2', title: 'Zeta' },
        ],
      });
      expect(res[1].requestCommitmentDate).toBe(planDate);
      expect(res[2].pendingPredecessors).toEqual([]);
      // Una sola consulta de dependencias para todas las tareas, solo pendientes.
      const depCalls = (m.prismaObj.taskDependency as any).findMany.mock.calls;
      expect(depCalls).toHaveLength(1);
      expect(depCalls[0][0].where.dependentTaskId).toEqual({ in: ['tA', 'tB', 'tC'] });
      expect(depCalls[0][0].where.predecessor).toEqual({ status: { not: TaskStatus.TERMINADA } });
    });

    it('sin tareas no consulta dependencias', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.myWork(actorWith(RoleCode.INTEGRANTE, 'u1'));
      expect((m.prismaObj.taskDependency as any).findMany).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus (motivo de bloqueo)', () => {
    function scope(status: string, extra: Record<string, unknown> = {}) {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ responsibleUserId: 'u1', status, ...extra }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).update.mockResolvedValue(makeTask({ status }));
      (m.prismaObj.task as any).findFirst.mockResolvedValue(makeTaskWithDeps({ status }));
    }

    it('al pasar a BLOQUEADA guarda el motivo y lo deja en el historial', async () => {
      scope(TaskStatus.EN_CURSO);
      (m.prismaObj.task as any).update.mockResolvedValue(
        makeTask({ status: TaskStatus.BLOQUEADA, blockedReason: 'Falta acceso' }),
      );
      await service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
        status: TaskStatus.BLOQUEADA,
        blockedReason: 'Falta acceso',
      });
      const data = (m.prismaObj.task as any).update.mock.calls[0][0].data;
      expect(data.blockedReason).toBe('Falta acceso');
      const audit = (m.audit.record as jest.Mock).mock.calls[0][1];
      expect(audit.before.blockedReason).toBeNull();
      expect(audit.after.blockedReason).toBe('Falta acceso');
    });

    it('bloquear sin motivo es válido (opcional en la API): guarda null', async () => {
      scope(TaskStatus.EN_CURSO);
      await service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
        status: TaskStatus.BLOQUEADA,
      });
      expect((m.prismaObj.task as any).update.mock.calls[0][0].data.blockedReason).toBeNull();
    });

    it('al salir de BLOQUEADA limpia el motivo (null)', async () => {
      scope(TaskStatus.BLOQUEADA, { blockedReason: 'Falta acceso' });
      await service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
        status: TaskStatus.EN_CURSO,
      });
      expect((m.prismaObj.task as any).update.mock.calls[0][0].data.blockedReason).toBeNull();
      const audit = (m.audit.record as jest.Mock).mock.calls[0][1];
      expect(audit.before.blockedReason).toBe('Falta acceso');
    });

    it('motivo con un estado distinto de BLOQUEADA -> 400 sin escribir', async () => {
      scope(TaskStatus.POR_HACER);
      await expect(
        service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
          status: TaskStatus.EN_CURSO,
          blockedReason: 'x',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
    });

    it('integrante sobre tarea ajena sigue recibiendo 403 aunque envíe motivo', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask({ responsibleUserId: 'otro', status: TaskStatus.EN_CURSO }),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
      });
      await expect(
        service.changeStatus(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
          status: TaskStatus.BLOQUEADA,
          blockedReason: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
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

  describe('changeProgress (solo avance, sin cambiar el estado)', () => {
    function scope(task: Record<string, unknown>) {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(task),
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: 'EN_EJECUCION',
      });
    }

    it('integrante sobre tarea ajena -> 403', async () => {
      scope({ responsibleUserId: 'otro', status: TaskStatus.EN_CURSO });
      await expect(
        service.changeProgress(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', { progress: 50 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('tarea Por hacer -> 409 sin escribir', async () => {
      scope({ status: TaskStatus.POR_HACER });
      await expect(
        service.changeProgress(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1', { progress: 50 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
    });

    it('tarea Terminada -> 409 sin escribir', async () => {
      scope({ status: TaskStatus.TERMINADA, progress: 100 });
      await expect(
        service.changeProgress(actorWith(RoleCode.JEFE_AREA, 'uj'), 't1', { progress: 60 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
    });

    it('responsable en curso: actualiza el avance, no toca el estado y audita', async () => {
      scope({ responsibleUserId: 'u1', status: TaskStatus.EN_CURSO, progress: 10 });
      (m.prismaObj.task as any).update.mockResolvedValue(
        makeTask({ status: TaskStatus.EN_CURSO, progress: 60 }),
      );
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ status: TaskStatus.EN_CURSO, progress: 60 }),
      );

      const res = await service.changeProgress(actorWith(RoleCode.INTEGRANTE, 'u1'), 't1', {
        progress: 60,
      });

      expect((m.prismaObj.task as any).update.mock.calls[0][0].data).toEqual({ progress: 60 });
      expect((m.audit.record as jest.Mock).mock.calls[0][1]).toMatchObject({
        objectType: 'TASK',
        before: { status: TaskStatus.EN_CURSO, progress: 10 },
        after: { status: TaskStatus.EN_CURSO, progress: 60 },
      });
      expect(res.progress).toBe(60);
    });

    it('mismo valor: no escribe ni audita', async () => {
      scope({ status: TaskStatus.EN_CURSO, progress: 40 });
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ status: TaskStatus.EN_CURSO, progress: 40 }),
      );
      await service.changeProgress(actorWith(RoleCode.JEFE_AREA, 'uj'), 't1', { progress: 40 });
      expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
      expect(m.audit.record).not.toHaveBeenCalled();
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

  describe('regla de cierre (BL-036, Entrega 3)', () => {
    const integrante = () => actorWith(RoleCode.INTEGRANTE, 'u1');
    const lider = () => actorWith(RoleCode.LIDER_PROCESO, 'ul');
    const jefe = () => actorWith(RoleCode.JEFE_AREA, 'uj');

    function scope(overrides: Record<string, unknown> = {}) {
      const task = makeTask({ responsibleUserId: 'u1', status: TaskStatus.EN_CURSO, progress: 100, ...overrides });
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task,
        planId: 'plan1',
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: 'EN_EJECUCION',
      });
      (m.prismaObj.task as any).update.mockResolvedValue(task);
      (m.prismaObj.task as any).findFirst.mockResolvedValue(makeTaskWithDeps({ ...overrides }));
      // El plan aún tiene tareas pendientes: no se dispara el aviso de plan completo.
      (m.prismaObj.task as any).count.mockResolvedValue(1);
      return task;
    }
    const updateData = () => (m.prismaObj.task as any).update.mock.calls[0][0].data;
    const sendToReview = (actor: CurrentActor, extra: Record<string, unknown> = {}) =>
      service.changeStatus(actor, 't1', { status: TaskStatus.EN_REVISION, ...extra });
    const messageOf = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return (e as Error).message;
      }
      return null;
    };

    describe('enviar a revisión: avance', () => {
      it('con avance menor a 100 -> 409 y no escribe', async () => {
        scope({ progress: 90 });
        const p = sendToReview(integrante());
        await expect(p).rejects.toBeInstanceOf(ConflictException);
        await expect(messageOf(sendToReview(integrante()))).resolves.toContain('ahora está en 90 %');
        expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
      });

      it('el avance del mismo PATCH cuenta como efectivo (90 guardado, 100 enviado) -> ok', async () => {
        scope({ progress: 90 });
        await sendToReview(integrante(), { progress: 100 });
        expect(updateData().progress).toBe(100);
        expect(updateData().status).toBe(TaskStatus.EN_REVISION);
      });

      it('el avance del PATCH menor a 100 gana sobre el guardado en 100 -> 409', async () => {
        scope({ progress: 100 });
        await expect(sendToReview(integrante(), { progress: 80 })).rejects.toBeInstanceOf(ConflictException);
      });

      it('aplica también a líder y jefe', async () => {
        scope({ progress: 50, responsibleUserId: 'otro' });
        await expect(sendToReview(lider())).rejects.toBeInstanceOf(ConflictException);
        await expect(sendToReview(jefe())).rejects.toBeInstanceOf(ConflictException);
      });
    });

    describe('enviar a revisión: evidencia', () => {
      const msgEvidencia = 'Esta tarea exige evidencia para enviarse a revisión';

      it('con criterios de aceptación y sin evidencia -> 409', async () => {
        scope({ acceptanceCriteria: 'Debe cuadrar el saldo' });
        await expect(messageOf(sendToReview(integrante()))).resolves.toContain(msgEvidencia);
        expect((m.prismaObj.taskEvidence as any).count).toHaveBeenCalledWith({ where: { taskId: 't1' } });
        expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
      });

      it('con fase de gobierno requerida y sin evidencia -> 409', async () => {
        scope({ frameworkPhaseRequired: 'PLANIFICACION' });
        await expect(messageOf(sendToReview(integrante()))).resolves.toContain(msgEvidencia);
      });

      it('criterios solo con espacios no exigen evidencia', async () => {
        scope({ acceptanceCriteria: '   ' });
        await sendToReview(integrante());
        expect(updateData().status).toBe(TaskStatus.EN_REVISION);
        expect((m.prismaObj.taskEvidence as any).count).not.toHaveBeenCalled();
      });

      it('evidencia por nota enviada en el mismo PATCH -> ok sin consultar archivos', async () => {
        scope({ acceptanceCriteria: 'AC' });
        await sendToReview(integrante(), { evidenceUrl: 'https://ev/acta' });
        expect(updateData().evidenceUrl).toBe('https://ev/acta');
        expect((m.prismaObj.taskEvidence as any).count).not.toHaveBeenCalled();
      });

      it('evidencia por nota ya guardada en la tarea -> ok', async () => {
        scope({ acceptanceCriteria: 'AC', evidenceUrl: 'https://ev/previa' });
        await sendToReview(integrante());
        expect(updateData().status).toBe(TaskStatus.EN_REVISION);
      });

      it('nota enviada vacía no sustituye a la guardada: cuenta como sin nota -> 409', async () => {
        scope({ acceptanceCriteria: 'AC', evidenceUrl: 'https://ev/previa' });
        await expect(sendToReview(integrante(), { evidenceUrl: '   ' })).rejects.toBeInstanceOf(ConflictException);
      });

      it('evidencia por archivo (task_evidences) -> ok', async () => {
        scope({ acceptanceCriteria: 'AC' });
        (m.prismaObj.taskEvidence as any).count.mockResolvedValue(2);
        await sendToReview(integrante());
        expect(updateData().status).toBe(TaskStatus.EN_REVISION);
      });

      it('sin criterios ni fase de gobierno y sin evidencia -> ok', async () => {
        scope();
        await sendToReview(integrante());
        expect(updateData().status).toBe(TaskStatus.EN_REVISION);
      });

      it('faltan avance y evidencia -> un solo 409 que nombra las dos cosas', async () => {
        scope({ progress: 70, acceptanceCriteria: 'AC' });
        const msg = await messageOf(sendToReview(integrante()));
        expect(msg).toContain('falta: avance al 100 % (ahora está en 70 %) y evidencia');
      });
    });

    describe('terminar (EN_REVISION -> TERMINADA)', () => {
      it('integrante responsable -> 403 con mensaje en español', async () => {
        scope({ status: TaskStatus.EN_REVISION });
        const p = service.changeStatus(integrante(), 't1', { status: TaskStatus.TERMINADA });
        await expect(p).rejects.toBeInstanceOf(ForbiddenException);
        const msg = await messageOf(service.changeStatus(integrante(), 't1', { status: TaskStatus.TERMINADA }));
        expect(msg).toContain('Solo un líder de proceso o el jefe de área puede terminar una tarea');
        expect(msg).toContain('la aprueba un líder o el jefe de área');
        expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
      });

      it('líder (no responsable) -> ok', async () => {
        scope({ status: TaskStatus.EN_REVISION });
        await service.changeStatus(lider(), 't1', { status: TaskStatus.TERMINADA });
        expect(updateData().status).toBe(TaskStatus.TERMINADA);
      });

      it('jefe -> ok', async () => {
        scope({ status: TaskStatus.EN_REVISION });
        await service.changeStatus(jefe(), 't1', { status: TaskStatus.TERMINADA });
        expect(updateData().status).toBe(TaskStatus.TERMINADA);
      });

      it('líder que es el responsable -> ok', async () => {
        scope({ status: TaskStatus.EN_REVISION, responsibleUserId: 'ul' });
        await service.changeStatus(lider(), 't1', { status: TaskStatus.TERMINADA });
        expect(updateData().status).toBe(TaskStatus.TERMINADA);
      });

      it('desde EN_CURSO sigue sin ser transición válida (409), también para el líder', async () => {
        scope({ status: TaskStatus.EN_CURSO });
        await expect(
          service.changeStatus(lider(), 't1', { status: TaskStatus.TERMINADA }),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    });

    describe('reabrir (TERMINADA -> EN_CURSO)', () => {
      it('integrante responsable -> 403 con mensaje en español', async () => {
        scope({ status: TaskStatus.TERMINADA });
        const msg = await messageOf(service.changeStatus(integrante(), 't1', { status: TaskStatus.EN_CURSO }));
        expect(msg).toBe('Solo un líder de proceso o el jefe de área puede reabrir una tarea terminada.');
        expect((m.prismaObj.task as any).update).not.toHaveBeenCalled();
      });

      it('líder y jefe -> ok', async () => {
        scope({ status: TaskStatus.TERMINADA });
        await service.changeStatus(lider(), 't1', { status: TaskStatus.EN_CURSO });
        expect(updateData().status).toBe(TaskStatus.EN_CURSO);
        (m.prismaObj.task as any).update.mockClear();
        await service.changeStatus(jefe(), 't1', { status: TaskStatus.EN_CURSO });
        expect(updateData().status).toBe(TaskStatus.EN_CURSO);
      });
    });

    describe('devolver y resto de transiciones: sin cambios', () => {
      it('el responsable integrante devuelve su tarea de EN_REVISION a EN_CURSO', async () => {
        scope({ status: TaskStatus.EN_REVISION });
        await service.changeStatus(integrante(), 't1', { status: TaskStatus.EN_CURSO });
        expect(updateData().status).toBe(TaskStatus.EN_CURSO);
      });

      it('líder devuelve de EN_REVISION a EN_CURSO', async () => {
        scope({ status: TaskStatus.EN_REVISION, responsibleUserId: 'otro' });
        await service.changeStatus(lider(), 't1', { status: TaskStatus.EN_CURSO });
        expect(updateData().status).toBe(TaskStatus.EN_CURSO);
      });

      it('integrante sigue sin poder mutar tareas ajenas (403 existente)', async () => {
        scope({ status: TaskStatus.EN_REVISION, responsibleUserId: 'otro' });
        await expect(
          service.changeStatus(integrante(), 't1', { status: TaskStatus.EN_CURSO }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('bloquear una tarea en revisión no pide requisitos', async () => {
        scope({ status: TaskStatus.EN_REVISION, progress: 20 });
        await service.changeStatus(integrante(), 't1', { status: TaskStatus.BLOQUEADA });
        expect(updateData().status).toBe(TaskStatus.BLOQUEADA);
      });
    });

    describe('reviewRequestedAt', () => {
      it('se fija al pasar a EN_REVISION', async () => {
        scope();
        const before = Date.now();
        await sendToReview(integrante());
        const stamp = updateData().reviewRequestedAt as Date;
        expect(stamp).toBeInstanceOf(Date);
        expect(stamp.getTime()).toBeGreaterThanOrEqual(before);
      });

      it.each([
        [TaskStatus.EN_CURSO, 'devolver'],
        [TaskStatus.BLOQUEADA, 'bloquear'],
      ])('se limpia al salir de EN_REVISION (%s: %s)', async (target) => {
        scope({ status: TaskStatus.EN_REVISION, reviewRequestedAt: new Date() });
        await service.changeStatus(integrante(), 't1', { status: target });
        expect(updateData().reviewRequestedAt).toBeNull();
      });

      it('se limpia al terminar', async () => {
        scope({ status: TaskStatus.EN_REVISION, reviewRequestedAt: new Date() });
        await service.changeStatus(lider(), 't1', { status: TaskStatus.TERMINADA });
        expect(updateData().reviewRequestedAt).toBeNull();
      });
    });

    describe('notificaciones del flujo de revisión', () => {
      it('al llegar a revisión avisa a líderes y jefes (excluye al actor)', async () => {
        scope();
        await sendToReview(integrante());
        const call = notifier.notify.mock.calls.find((c) => c[0].type === 'TASK_REVIEW_REQUESTED');
        expect(call?.[0]).toMatchObject({
          userIds: ['lider1', 'jefe1'],
          excludeUserId: 'u1',
          title: 'Tarea por aprobar · PRY-0012-T01',
          link: '/mi-trabajo#por-aprobar',
        });
        expect(call?.[0].message).toContain('espera tu aprobación');
      });

      it('al aprobar avisa al responsable', async () => {
        scope({ status: TaskStatus.EN_REVISION });
        await service.changeStatus(lider(), 't1', { status: TaskStatus.TERMINADA });
        const call = notifier.notify.mock.calls.find((c) => c[0].type === 'TASK_APPROVED');
        expect(call?.[0]).toMatchObject({ userIds: ['u1'], excludeUserId: 'ul', title: 'Tarea aprobada · PRY-0012-T01' });
      });

      it('al devolver avisa al responsable', async () => {
        scope({ status: TaskStatus.EN_REVISION });
        await service.changeStatus(lider(), 't1', { status: TaskStatus.EN_CURSO });
        const call = notifier.notify.mock.calls.find((c) => c[0].type === 'TASK_RETURNED');
        expect(call?.[0]).toMatchObject({ userIds: ['u1'], excludeUserId: 'ul', title: 'Tarea devuelta · PRY-0012-T01' });
      });

      it('un fallo al notificar no revierte el cambio de estado', async () => {
        scope();
        notifier.processLeaders.mockRejectedValue(new Error('boom'));
        await expect(sendToReview(integrante())).resolves.toMatchObject({ id: 't1' });
      });
    });
  });

  describe('banderas de evidencia (evidenceRequired / hasEvidence)', () => {
    it('findOne: exige evidencia por criterios y la cuenta desde _count (sin consulta extra)', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(), planId: 'plan1', requestId: 'r1', mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).findFirst.mockResolvedValue(
        makeTaskWithDeps({ acceptanceCriteria: 'AC', _count: { evidences: 2 } }),
      );
      const res = await service.findOne(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1');
      expect(res).toMatchObject({ evidenceRequired: true, hasEvidence: true });
      expect((m.prismaObj.taskEvidence as any).count).not.toHaveBeenCalled();
    });

    it('findOne: sin criterios, sin fase de gobierno ni evidencia -> ambas false', async () => {
      (m.planState.requireTaskInScope as jest.Mock).mockResolvedValue({
        task: makeTask(), planId: 'plan1', requestId: 'r1', mainProcessId: 'p1',
      });
      (m.prismaObj.task as any).findFirst.mockResolvedValue(makeTaskWithDeps());
      const res = await service.findOne(actorWith(RoleCode.LIDER_PROCESO, 'ul'), 't1');
      expect(res).toMatchObject({ evidenceRequired: false, hasEvidence: false });
    });

    it('myWork: fase de gobierno exige; la nota guardada cuenta como evidencia; todo en una consulta', async () => {
      const phase = {
        id: 'ph1', name: 'F', planId: 'plan1',
        plan: { requestId: 'r1', commitmentDate: null, request: { title: 'S', operationalState: 'EN_EJECUCION', initialCommitmentDate: null } },
      };
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        { ...makeTask({ id: 'a', frameworkPhaseRequired: 'PLANIFICACION', evidenceUrl: 'nota' }), phase },
        { ...makeTask({ id: 'b', acceptanceCriteria: 'AC' }), phase },
        { ...makeTask({ id: 'c', acceptanceCriteria: 'AC', _count: { evidences: 1 } }), phase },
      ]);
      const res = await service.myWork(actorWith(RoleCode.INTEGRANTE, 'u1'));
      expect(res.map((r) => [r.evidenceRequired, r.hasEvidence])).toEqual([
        [true, true], [true, false], [true, true],
      ]);
      expect((m.prismaObj.task as any).findMany).toHaveBeenCalledTimes(1);
      expect((m.prismaObj.task as any).findMany.mock.calls[0][0].include._count).toEqual({ select: { evidences: true } });
      expect((m.prismaObj.taskEvidence as any).count).not.toHaveBeenCalled();
    });
  });

  describe('pendingReview (cola «Por aprobar»)', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      ...makeTask({ id: 'q1', status: TaskStatus.EN_REVISION, progress: 100, ...overrides }),
      responsible: 'responsible' in overrides ? overrides.responsible : { name: 'Ana' },
      phase: { name: 'Fase 1', plan: { requestId: 'r1', request: { title: 'Solicitud 1' } } },
    });

    it('alcance de líder: procesos de sus grants, solo EN_REVISION, sin CERRADA ni las propias (null sí cuenta)', async () => {
      (m.prismaObj.task as any).count.mockResolvedValue(0);
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.pendingReview(actorWith(RoleCode.LIDER_PROCESO, 'ul'));
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        status: TaskStatus.EN_REVISION,
        phase: {
          plan: {
            request: { deletedAt: null, operationalState: { not: 'CERRADA' }, mainProcessId: { in: ['p1'] } },
          },
        },
        OR: [{ responsibleUserId: null }, { responsibleUserId: { not: 'ul' } }],
      });
      // El total usa exactamente la misma cláusula.
      expect((m.prismaObj.task as any).count.mock.calls[0][0].where).toEqual(where);
    });

    it('jefe: sin filtro de proceso', async () => {
      (m.prismaObj.task as any).count.mockResolvedValue(0);
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      await service.pendingReview(actorWith(RoleCode.JEFE_AREA, 'uj'));
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.phase.plan.request).toEqual({ deletedAt: null, operationalState: { not: 'CERRADA' } });
      expect(where.OR).toContainEqual({ responsibleUserId: { not: 'uj' } });
    });

    it('orden: reviewRequestedAt ascendente con null primero, luego updatedAt; tope 100', async () => {
      (m.prismaObj.task as any).count.mockResolvedValue(130);
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      const res = await service.pendingReview(actorWith(RoleCode.LIDER_PROCESO, 'ul'));
      const args = (m.prismaObj.task as any).findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([{ reviewRequestedAt: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'asc' }]);
      expect(args.take).toBe(100);
      expect(res.total).toBe(130);
    });

    it('mapea ítems: con fecha exacta no es aproximado; sin ella usa updatedAt y lo marca aproximado', async () => {
      const requested = new Date('2026-11-01T10:00:00Z');
      const updated = new Date('2026-10-20T10:00:00Z');
      (m.prismaObj.task as any).count.mockResolvedValue(2);
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        row({ id: 'viejo', reviewRequestedAt: null, updatedAt: updated, acceptanceCriteria: 'AC' }),
        row({ id: 'nuevo', reviewRequestedAt: requested, evidenceUrl: 'nota', acceptanceCriteria: 'AC' }),
      ]);
      const res = await service.pendingReview(actorWith(RoleCode.LIDER_PROCESO, 'ul'));
      expect(res.items[0]).toMatchObject({
        id: 'viejo', responsibleName: 'Ana', requestTitle: 'Solicitud 1', phaseName: 'Fase 1',
        waitingSince: updated, waitingSinceApproximate: true, reviewRequestedAt: null,
        evidenceRequired: true, hasEvidence: false,
      });
      expect(res.items[1]).toMatchObject({
        id: 'nuevo', waitingSince: requested, waitingSinceApproximate: false, hasEvidence: true,
      });
    });

    it('sin N+1: una consulta de lista (responsable, fase y conteo de archivos incluidos) y un count', async () => {
      (m.prismaObj.task as any).count.mockResolvedValue(1);
      (m.prismaObj.task as any).findMany.mockResolvedValue([row({ _count: { evidences: 3 }, acceptanceCriteria: 'AC' })]);
      const res = await service.pendingReview(actorWith(RoleCode.JEFE_AREA, 'uj'));
      expect((m.prismaObj.task as any).findMany).toHaveBeenCalledTimes(1);
      expect((m.prismaObj.task as any).count).toHaveBeenCalledTimes(1);
      expect((m.prismaObj.taskEvidence as any).count).not.toHaveBeenCalled();
      const include = (m.prismaObj.task as any).findMany.mock.calls[0][0].include;
      expect(include._count).toEqual({ select: { evidences: true } });
      expect(res.items[0].hasEvidence).toBe(true);
    });

    it('tarea sin responsable: nombre null', async () => {
      (m.prismaObj.task as any).count.mockResolvedValue(1);
      (m.prismaObj.task as any).findMany.mockResolvedValue([row({ responsibleUserId: null, responsible: null })]);
      const res = await service.pendingReview(actorWith(RoleCode.LIDER_PROCESO, 'ul'));
      expect(res.items[0]).toMatchObject({ responsibleUserId: null, responsibleName: null });
    });
  });
});
