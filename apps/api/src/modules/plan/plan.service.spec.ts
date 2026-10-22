import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestState } from '../request/request-state';
import { RequestStateService } from '../request/request-state.service';
import { PlanService } from './plan.service';
import { PlanGuideService } from './plan-guide.service';
import { PlanStateService } from './plan-state.service';
import { PlanStatus } from './plan-status';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn(), update: jest.fn() },
    plan: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    planPhase: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    task: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    taskDependency: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const requestState = new RequestStateService(prisma);

  const planState = {
    requirePlanInScope: jest.fn(),
    assertPlanTransition: jest.fn((from: string, to: PlanStatus) =>
      new PlanStateService(prisma).assertPlanTransition(from, to),
    ),
  } as unknown as PlanStateService;

  const guide = { compute: jest.fn() } as unknown as PlanGuideService;

  return { prisma, prismaObj, audit, auditRecord, requestState, planState, guide };
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

function makeRequest(state: string) {
  return { id: 'r1', mainProcessId: 'p1', operationalState: state };
}

function makePlan(
  status: string,
  users: {
    submittedBy?: { id: string; name: string } | null;
    authorizedBy?: { id: string; name: string } | null;
  } = {},
) {
  return {
    id: 'plan1',
    requestId: 'r1',
    periodStart: null,
    periodEnd: null,
    commitmentDate: null,
    risks: null,
    mitigations: null,
    status,
    submittedAt: null,
    submittedByUserId: null,
    submittedBy: users.submittedBy ?? null,
    authorizedAt: null,
    authorizedByUserId: null,
    authorizedBy: users.authorizedBy ?? null,
    returnReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('PlanService', () => {
  let service: PlanService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new PlanService(m.prisma, m.audit, m.requestState, m.planState, m.guide);
  });

  describe('create', () => {
    it('crea el plan desde COMPROMETIDA, lleva Request a EN_PLANIFICACION y audita 2 eventos', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA),
      );
      (m.prismaObj.plan as any).findFirst.mockResolvedValue(null);
      (m.prismaObj.plan as any).create.mockResolvedValue(makePlan(PlanStatus.BORRADOR));
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.EN_PLANIFICACION),
      );

      const res = await service.create(lider(), 'r1', {});

      expect(res.status).toBe(PlanStatus.BORRADOR);
      expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
        operationalState: RequestState.EN_PLANIFICACION,
      });
      expect(m.auditRecord).toHaveBeenCalledTimes(2);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'PLAN',
        scopeProcessId: 'p1',
      });
      expect(m.auditRecord.mock.calls[1][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'REQUEST',
        scopeProcessId: 'p1',
      });
    });

    it('crear sobre Request != COMPROMETIDA -> 409 sin mutacion', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE),
      );
      await expect(service.create(lider(), 'r1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((m.prismaObj.plan as any).create).not.toHaveBeenCalled();
    });

    it('crear cuando ya existe plan -> 409', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA),
      );
      (m.prismaObj.plan as any).findFirst.mockResolvedValue({ id: 'planX' });
      await expect(service.create(lider(), 'r1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((m.prismaObj.plan as any).create).not.toHaveBeenCalled();
    });
  });

  describe('findByRequest', () => {
    it('re-lee el plan con include y resuelve submitted/authorized', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.AUTORIZADO),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_EJECUCION,
      });
      (m.prismaObj.plan as any).findFirst.mockResolvedValue(
        makePlan(PlanStatus.AUTORIZADO, {
          submittedBy: { id: 'u1', name: 'Enviador' },
          authorizedBy: { id: 'u2', name: 'Autorizador' },
        }),
      );

      const res = await service.findByRequest(lider(), 'r1');

      expect(res.submittedByName).toBe('Enviador');
      expect(res.authorizedByName).toBe('Autorizador');
      expect((m.prismaObj.plan as any).findFirst.mock.calls[0][0].include).toMatchObject(
        {
          submittedBy: { select: { id: true, name: true } },
          authorizedBy: { select: { id: true, name: true } },
        },
      );
    });

    it('sin relaciones -> nombres null', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.BORRADOR),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.prismaObj.plan as any).findFirst.mockResolvedValue(
        makePlan(PlanStatus.BORRADOR),
      );

      const res = await service.findByRequest(lider(), 'r1');
      expect(res.submittedByName).toBeNull();
      expect(res.authorizedByName).toBeNull();
    });
  });

  describe('submit (AC-007)', () => {
    it('rechaza 409 cuando la guia tiene pendientes', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.BORRADOR),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.guide.compute as jest.Mock).mockResolvedValue({
        planId: 'plan1',
        canSubmit: false,
        pendings: [{ category: 'datesPhases', code: 'NO_PHASES', message: 'Falta fase.' }],
        futureCategories: [],
      });

      await expect(service.submit(lider(), 'r1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((m.prismaObj.plan as any).update).not.toHaveBeenCalled();
    });

    it('envia (-> EN_AUTORIZACION) cuando canSubmit=true', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.BORRADOR),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.guide.compute as jest.Mock).mockResolvedValue({
        planId: 'plan1',
        canSubmit: true,
        pendings: [],
        futureCategories: [],
      });
      (m.prismaObj.plan as any).update.mockResolvedValue(
        makePlan(PlanStatus.EN_AUTORIZACION, {
          submittedBy: { id: 'ul', name: 'Enviador' },
        }),
      );

      const res = await service.submit(lider(), 'r1');

      expect(res.status).toBe(PlanStatus.EN_AUTORIZACION);
      // Nombre de quien envio resuelto desde la relacion incluida en la query.
      expect(res.submittedByName).toBe('Enviador');
      expect((m.prismaObj.plan as any).update.mock.calls[0][0].include).toMatchObject(
        {
          submittedBy: { select: { id: true, name: true } },
          authorizedBy: { select: { id: true, name: true } },
        },
      );
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'PLAN',
      });
    });
  });

  describe('authorize', () => {
    it('autorizar lleva la Request a EN_EJECUCION y registra UPDATE PLAN + UPDATE REQUEST', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.EN_AUTORIZACION),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.prismaObj.plan as any).update.mockResolvedValue(
        makePlan(PlanStatus.AUTORIZADO, {
          authorizedBy: { id: 'ul', name: 'Autorizador' },
        }),
      );
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.EN_EJECUCION),
      );

      const res = await service.authorize(lider(), 'r1');

      expect(res.status).toBe(PlanStatus.AUTORIZADO);
      // Nombre de quien autorizo resuelto; sin envio -> submittedByName null.
      expect(res.authorizedByName).toBe('Autorizador');
      expect(res.submittedByName).toBeNull();
      expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
        operationalState: RequestState.EN_EJECUCION,
      });
      expect(m.auditRecord).toHaveBeenCalledTimes(2);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({ objectType: 'PLAN' });
      expect(m.auditRecord.mock.calls[1][1]).toMatchObject({ objectType: 'REQUEST' });
    });

    it('autorizar fuera de EN_AUTORIZACION -> 409', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.BORRADOR),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      await expect(service.authorize(lider(), 'r1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('return', () => {
    it('devolver sin motivo -> 400 sin mutacion', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.EN_AUTORIZACION),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      await expect(service.return(lider(), 'r1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect((m.prismaObj.plan as any).update).not.toHaveBeenCalled();
    });

    it('devolver con motivo -> DEVUELTO', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.EN_AUTORIZACION),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.prismaObj.plan as any).update.mockResolvedValue({
        ...makePlan(PlanStatus.DEVUELTO),
        returnReason: 'faltan fechas',
      });

      const res = await service.return(lider(), 'r1', { reason: 'faltan fechas' });
      expect(res.status).toBe(PlanStatus.DEVUELTO);
    });
  });

  describe('exportPlan', () => {
    function stubPlanInScope(status = PlanStatus.BORRADOR) {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(status),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
    }

    it('serializa el documento con kind/formatVersion, refs unicos y dependencias por ref (no UUID), sin tx ni audit', async () => {
      stubPlanInScope();
      (m.prismaObj.planPhase as any).findMany.mockResolvedValue([
        {
          order: 0,
          name: 'Analisis',
          startDate: null,
          endDate: null,
          deliverable: null,
          tasks: [
            {
              id: 'task-A',
              title: 'A',
              isMilestone: false,
              estimateHours: 8,
              startDate: null,
              endDate: null,
              description: null,
              acceptanceCriteria: null,
              frameworkPhaseRequired: null,
              evidenceUrl: null,
            },
            {
              id: 'task-B',
              title: 'B',
              isMilestone: false,
              estimateHours: null,
              startDate: null,
              endDate: null,
              description: null,
              acceptanceCriteria: null,
              frameworkPhaseRequired: null,
              evidenceUrl: null,
            },
          ],
        },
      ]);
      (m.prismaObj.taskDependency as any).findMany.mockResolvedValue([
        { dependentTaskId: 'task-B', predecessorTaskId: 'task-A' },
      ]);

      const doc = await service.exportPlan(lider(), 'r1');

      expect(doc.kind).toBe('control-phari-plan');
      expect(doc.formatVersion).toBe('1.0');
      const refs = doc.phases.flatMap((p) => p.tasks.map((t) => t.ref));
      expect(new Set(refs).size).toBe(refs.length);
      // Dependencia expresada por ref local, no por UUID de BD.
      expect(doc.dependencies).toEqual([
        { dependentRef: 't1', predecessorRef: 't0' },
      ]);
      // Export es solo lectura: ni transaccion ni auditoria.
      expect((m.prismaObj as any).$transaction).not.toHaveBeenCalled();
      expect(m.auditRecord).not.toHaveBeenCalled();
    });
  });

  describe('importPlan', () => {
    function stubPlanInScope(status: PlanStatus) {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(status),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
    }

    function emptyDoc(): any {
      return {
        kind: 'control-phari-plan',
        formatVersion: '1.0',
        plan: {},
        phases: [],
        dependencies: [],
      };
    }

    it('409 cuando el plan esta AUTORIZADO', async () => {
      stubPlanInScope(PlanStatus.AUTORIZADO);
      await expect(
        service.importPlan(lider(), 'r1', emptyDoc()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((m.prismaObj.planPhase as any).deleteMany).not.toHaveBeenCalled();
    });

    it('409 cuando el plan esta EN_AUTORIZACION', async () => {
      stubPlanInScope(PlanStatus.EN_AUTORIZACION);
      await expect(
        service.importPlan(lider(), 'r1', emptyDoc()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('semantica REPLACE: borra deps/tareas/fases antes de crear y escribe cabecera sin campos de flujo', async () => {
      stubPlanInScope(PlanStatus.BORRADOR);
      (m.prismaObj.planPhase as any).create.mockResolvedValue({ id: 'phase-1' });
      (m.prismaObj.task as any).create.mockImplementation(
        ({ data }: { data: { title: string } }) =>
          Promise.resolve({ id: `task-${data.title}` }),
      );

      const doc = emptyDoc();
      doc.plan = { risks: 'r', periodStart: '2025-01-01T00:00:00.000Z' };
      doc.phases = [
        {
          order: 0,
          name: 'Fase',
          tasks: [{ ref: 't0', title: 'A', isMilestone: false }],
        },
      ];

      const res = await service.importPlan(lider(), 'r1', doc);

      // Borrado antes de crear.
      expect((m.prismaObj.taskDependency as any).deleteMany).toHaveBeenCalled();
      expect((m.prismaObj.task as any).deleteMany).toHaveBeenCalled();
      expect((m.prismaObj.planPhase as any).deleteMany).toHaveBeenCalled();

      // Cabecera: solo periodos/risks/mitigations, nunca flujo.
      const updateData = (m.prismaObj.plan as any).update.mock.calls[0][0].data;
      expect(Object.keys(updateData).sort()).toEqual(
        ['commitmentDate', 'mitigations', 'periodEnd', 'periodStart', 'risks'].sort(),
      );
      expect(updateData).not.toHaveProperty('status');
      expect(updateData).not.toHaveProperty('submittedAt');
      expect(updateData).not.toHaveProperty('authorizedAt');
      expect(updateData).not.toHaveProperty('returnReason');

      expect(res.replaced).toBe(true);
      expect(res.phasesCreated).toBe(1);
      expect(res.tasksCreated).toBe(1);
    });

    it('tarea hito invalida (estimateHours > 0) -> 400', async () => {
      stubPlanInScope(PlanStatus.BORRADOR);
      const doc = emptyDoc();
      doc.phases = [
        {
          order: 0,
          name: 'Fase',
          tasks: [{ ref: 't0', title: 'Hito', isMilestone: true, estimateHours: 5 }],
        },
      ];
      await expect(
        service.importPlan(lider(), 'r1', doc),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((m.prismaObj.planPhase as any).deleteMany).not.toHaveBeenCalled();
    });

    it('ciclo en el grafo del documento -> 400', async () => {
      stubPlanInScope(PlanStatus.BORRADOR);
      const doc = emptyDoc();
      doc.phases = [
        {
          order: 0,
          name: 'Fase',
          tasks: [
            { ref: 't0', title: 'A', isMilestone: false },
            { ref: 't1', title: 'B', isMilestone: false },
          ],
        },
      ];
      doc.dependencies = [
        { dependentRef: 't0', predecessorRef: 't1' },
        { dependentRef: 't1', predecessorRef: 't0' },
      ];
      await expect(
        service.importPlan(lider(), 'r1', doc),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('dependencia con ref inexistente -> 400', async () => {
      stubPlanInScope(PlanStatus.BORRADOR);
      const doc = emptyDoc();
      doc.phases = [
        { order: 0, name: 'Fase', tasks: [{ ref: 't0', title: 'A', isMilestone: false }] },
      ];
      doc.dependencies = [{ dependentRef: 't0', predecessorRef: 'tX' }];
      await expect(
        service.importPlan(lider(), 'r1', doc),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('round-trip de dependencias: reconstruye los pares via el mapa de refs y no escribe responsable/proceso', async () => {
      stubPlanInScope(PlanStatus.BORRADOR);
      (m.prismaObj.planPhase as any).create.mockResolvedValue({ id: 'phase-1' });
      (m.prismaObj.task as any).create.mockImplementation(
        ({ data }: { data: { title: string } }) =>
          Promise.resolve({ id: `id-${data.title}` }),
      );

      const doc = emptyDoc();
      doc.phases = [
        {
          order: 0,
          name: 'Fase',
          tasks: [
            { ref: 't0', title: 'A', isMilestone: false },
            { ref: 't1', title: 'B', isMilestone: false },
          ],
        },
      ];
      doc.dependencies = [{ dependentRef: 't1', predecessorRef: 't0' }];

      const res = await service.importPlan(lider(), 'r1', doc);

      // La dependencia se crea resolviendo ref->nuevoTaskId.
      expect((m.prismaObj.taskDependency as any).create).toHaveBeenCalledWith({
        data: { dependentTaskId: 'id-B', predecessorTaskId: 'id-A' },
      });
      // Las tareas se crean sin responsibleUserId/processId.
      const taskData = (m.prismaObj.task as any).create.mock.calls[0][0].data;
      expect(taskData).not.toHaveProperty('responsibleUserId');
      expect(taskData).not.toHaveProperty('processId');
      expect(res.dependenciesCreated).toBe(1);
    });

    it('audita un unico UPDATE PLAN dentro de la transaccion', async () => {
      stubPlanInScope(PlanStatus.BORRADOR);
      (m.prismaObj.planPhase as any).create.mockResolvedValue({ id: 'phase-1' });
      (m.prismaObj.task as any).create.mockResolvedValue({ id: 'task-1' });

      const doc = emptyDoc();
      doc.phases = [
        { order: 0, name: 'Fase', tasks: [{ ref: 't0', title: 'A', isMilestone: false }] },
      ];

      await service.importPlan(lider(), 'r1', doc);

      expect(m.auditRecord).toHaveBeenCalledTimes(1);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'PLAN',
        scopeProcessId: 'p1',
      });
    });
  });
});
