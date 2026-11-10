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
    requestParticipant: { findMany: jest.fn() },
    grant: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

/** Líder de proceso: ve TODAS las solicitudes (visibilidad abierta, rediseño). */
function liderProceso(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ulp',
    name: 'Lidia',
    identifier: 'liderproc@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isLiderProceso: true,
    isAdmin: false,
  };
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
    isLiderProceso: false,
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
        isLiderProceso: false,
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
      expect(where.AND).toContainEqual({ deletedAt: null });
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
    it('predecesora no TERMINADA -> 409 nombrando la dependencia', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { predecessor: { title: 'Pre A', status: TaskStatus.EN_CURSO, accepted: true } },
      ]);
      await expect(
        service.assertPredecessorsSatisfied('t2'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('predecesora TERMINADA (aceptada o no) -> no lanza', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { predecessor: { title: 'Pre A', status: TaskStatus.TERMINADA, accepted: false } },
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

  describe('visibilidad por rol (requestScopeWhere via requirePlanByIdInScope)', () => {
    it('lider de proceso: resuelve plan de proceso ajeno (sin filtro)', async () => {
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', requestId: 'r1' });
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p9',
        operationalState: 'EN_PLANIFICACION',
      });
      const res = await service.requirePlanByIdInScope(liderProceso(['p1']), 'plan1');
      expect(res.mainProcessId).toBe('p9');
      const where = prisma.request.findFirst.mock.calls[0][0].where;
      // Sin filtro de mainProcessId: solo deletedAt null.
      expect(where.AND).toContainEqual({ deletedAt: null });
    });
  });

  describe('responsibleCandidates (rediseño demanda)', () => {
    it('devuelve personas con grant activo en los procesos intervinientes', async () => {
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', requestId: 'r1' });
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p1',
        operationalState: 'EN_PLANIFICACION',
      });
      prisma.requestParticipant.findMany.mockResolvedValue([
        { processId: 'p1' },
        { processId: 'p2' },
      ]);
      prisma.grant.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', name: 'Ana' },
        { id: 'u2', name: 'Beto' },
      ]);

      const res = await service.responsibleCandidates(lider(), 'plan1');

      expect(prisma.grant.findMany.mock.calls[0][0].where).toMatchObject({
        active: true,
        processId: { in: ['p1', 'p2'] },
      });
      expect(res).toEqual([
        { id: 'u1', name: 'Ana' },
        { id: 'u2', name: 'Beto' },
      ]);
    });

    it('sin procesos intervinientes -> lista vacia', async () => {
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', requestId: 'r1' });
      prisma.request.findFirst.mockResolvedValue({
        id: 'r1',
        mainProcessId: 'p1',
        operationalState: 'EN_PLANIFICACION',
      });
      prisma.requestParticipant.findMany.mockResolvedValue([]);

      const res = await service.responsibleCandidates(lider(), 'plan1');
      expect(res).toEqual([]);
      expect(prisma.grant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('assertResponsibleInParticipants (condicion dura)', () => {
    it('usuario con grant en un proceso interviniente -> no lanza', async () => {
      prisma.requestParticipant.findMany.mockResolvedValue([
        { processId: 'p1' },
        { processId: 'p2' },
      ]);
      prisma.grant.findFirst.mockResolvedValue({ id: 'g1' });
      await expect(
        service.assertResponsibleInParticipants('r1', 'u1'),
      ).resolves.toBeUndefined();
      expect(prisma.grant.findFirst.mock.calls[0][0].where).toMatchObject({
        active: true,
        userId: 'u1',
        processId: { in: ['p1', 'p2'] },
      });
    });

    it('usuario sin grant en ningun proceso interviniente -> 400', async () => {
      prisma.requestParticipant.findMany.mockResolvedValue([{ processId: 'p1' }]);
      prisma.grant.findFirst.mockResolvedValue(null);
      await expect(
        service.assertResponsibleInParticipants('r1', 'ajeno'),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('responsible null/undefined -> no valida', async () => {
      await expect(
        service.assertResponsibleInParticipants('r1', null),
      ).resolves.toBeUndefined();
      await expect(
        service.assertResponsibleInParticipants('r1', undefined),
      ).resolves.toBeUndefined();
      expect(prisma.requestParticipant.findMany).not.toHaveBeenCalled();
    });

    it('participantes múltiples: personas de cualquiera de los procesos marcados habilitan', async () => {
      prisma.requestParticipant.findMany.mockResolvedValue([
        { processId: 'bi' },
        { processId: 'integraciones' },
        { processId: 'ia' },
      ]);
      prisma.grant.findFirst.mockResolvedValue({ id: 'g-ia' });
      await expect(
        service.assertResponsibleInParticipants('r1', 'miembro-ia'),
      ).resolves.toBeUndefined();
      expect(prisma.grant.findFirst.mock.calls[0][0].where.processId).toEqual({
        in: ['bi', 'integraciones', 'ia'],
      });
    });

    it('un proceso no marcado en el triage no habilita a su gente (400)', async () => {
      prisma.requestParticipant.findMany.mockResolvedValue([{ processId: 'bi' }]);
      prisma.grant.findFirst.mockResolvedValue(null);
      await expect(
        service.assertResponsibleInParticipants('r1', 'miembro-ia'),
      ).rejects.toMatchObject({
        status: 400,
        message:
          'El responsable debe pertenecer a un proceso interviniente de la solicitud.',
      });
    });

    it('conservar al responsable actual de un proceso desmarcado no se bloquea', async () => {
      await expect(
        service.assertResponsibleInParticipants('r1', 'miembro-ia', 'miembro-ia'),
      ).resolves.toBeUndefined();
      expect(prisma.requestParticipant.findMany).not.toHaveBeenCalled();
      expect(prisma.grant.findFirst).not.toHaveBeenCalled();
    });

    it('cambiar a OTRA persona fuera de los participantes sí se rechaza aunque haya responsable actual', async () => {
      prisma.requestParticipant.findMany.mockResolvedValue([{ processId: 'bi' }]);
      prisma.grant.findFirst.mockResolvedValue(null);
      await expect(
        service.assertResponsibleInParticipants('r1', 'otra-ia', 'miembro-ia'),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('assertResponsiblesInParticipants (importación)', () => {
    const ana = { id: 'u1', identifier: 'ana@demo.local' };
    const beto = { id: 'u2', identifier: 'beto@demo.local' };

    it('acepta a los de procesos participantes y a los ya responsables del plan', async () => {
      prisma.requestParticipant.findMany.mockResolvedValue([{ processId: 'bi' }]);
      prisma.grant.findMany.mockResolvedValue([{ userId: 'u1' }]);
      await expect(
        service.assertResponsiblesInParticipants('r1', [ana, beto], new Set(['u2'])),
      ).resolves.toBeUndefined();
      expect(prisma.grant.findMany.mock.calls[0][0].where).toMatchObject({
        active: true,
        processId: { in: ['bi'] },
        userId: { in: ['u1'] },
      });
    });

    it('rechaza (400) a quien no es participante ni responsable previo, listando su identificador', async () => {
      prisma.requestParticipant.findMany.mockResolvedValue([{ processId: 'bi' }]);
      prisma.grant.findMany.mockResolvedValue([]);
      await expect(
        service.assertResponsiblesInParticipants('r1', [ana], new Set()),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('sin nada pendiente no consulta', async () => {
      await service.assertResponsiblesInParticipants('r1', [ana], new Set(['u1']));
      expect(prisma.requestParticipant.findMany).not.toHaveBeenCalled();
    });
  });
});
