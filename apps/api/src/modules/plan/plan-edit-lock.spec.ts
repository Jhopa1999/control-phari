import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { DependencyService } from './dependency/dependency.service';
import {
  assertOnlyAdjustableChanges,
  assertPlanAdjustable,
  assertPlanStructureEditable,
  PLAN_AUTORIZADO_MESSAGE,
  PLAN_EN_AUTORIZACION_MESSAGE,
} from './plan-edit-lock';
import { PlanParticipantsService } from './plan-participants.service';
import { PlanStateService } from './plan-state.service';
import { PlanService } from './plan.service';
import { PhaseService } from './phase/phase.service';
import { TaskService } from './task/task.service';

/**
 * Bloqueo de edición del plan según su estado (D5, BL-065). Cada servicio
 * rechaza con 409 antes de tocar la base de datos: el prisma de estas pruebas
 * no tiene métodos, así que cualquier consulta posterior al bloqueo fallaría con
 * otro error distinto de ConflictException.
 */

const actor: CurrentActor = {
  userId: 'ul',
  name: 'Líder',
  identifier: 'lider@demo.local',
  grants: [],
  roleCodes: new Set([RoleCode.LIDER_PROCESO]),
  scopedProcessIds: new Set(['p1']),
  isJefeArea: false,
  isLiderProceso: false,
  isAdmin: false,
};

function planIn(status: string) {
  return {
    plan: { id: 'plan1', status, requestId: 'r1' },
    requestId: 'r1',
    mainProcessId: 'p1',
    requestState: 'EN_PLANIFICACION',
  };
}

function scopedTask(status: string, overrides: Record<string, unknown> = {}) {
  return {
    task: {
      id: 't1',
      phaseId: 'ph1',
      title: 'Tarea',
      responsibleUserId: 'u1',
      processId: null,
      startDate: null,
      endDate: null,
      estimateHours: null,
      isMilestone: false,
      description: null,
      acceptanceCriteria: null,
      frameworkPhaseRequired: null,
      evidenceUrl: null,
      ...overrides,
    },
    planId: 'plan1',
    planStatus: status,
    requestId: 'r1',
    mainProcessId: 'p1',
    requestState: 'EN_EJECUCION',
  };
}

const empty = {} as unknown as PrismaService;
const audit = { record: jest.fn() } as unknown as AuditService;

describe('plan-edit-lock (helpers)', () => {
  it.each(['BORRADOR', 'DEVUELTO'])('estructura editable en %s', (s) => {
    expect(() => assertPlanStructureEditable(s)).not.toThrow();
    expect(() => assertPlanAdjustable(s)).not.toThrow();
  });

  it('EN_AUTORIZACION bloquea estructura y ajustes con mensaje claro', () => {
    expect(() => assertPlanStructureEditable('EN_AUTORIZACION')).toThrow(
      PLAN_EN_AUTORIZACION_MESSAGE,
    );
    expect(() => assertPlanAdjustable('EN_AUTORIZACION')).toThrow(ConflictException);
  });

  it('AUTORIZADO bloquea la estructura pero admite ajustes', () => {
    expect(() => assertPlanStructureEditable('AUTORIZADO')).toThrow(PLAN_AUTORIZADO_MESSAGE);
    expect(() => assertPlanAdjustable('AUTORIZADO')).not.toThrow();
    expect(() => assertOnlyAdjustableChanges(['título'])).toThrow(ConflictException);
    expect(() => assertOnlyAdjustableChanges([])).not.toThrow();
  });

  it('un estado ausente no bloquea', () => {
    expect(() => assertPlanStructureEditable(undefined)).not.toThrow();
  });
});

describe.each(['EN_AUTORIZACION', 'AUTORIZADO'])('Servicios con el plan %s: estructura bloqueada', (status) => {
  const planState = {
    assertProjectOpen: jest.fn(),
    requirePlanInScope: jest.fn().mockResolvedValue(planIn(status)),
    requirePlanByIdInScope: jest.fn().mockResolvedValue(planIn(status)),
    requireTaskInScope: jest.fn().mockResolvedValue(scopedTask(status)),
  } as unknown as PlanStateService;

  it('PATCH plan -> 409', async () => {
    const svc = new PlanService(empty, audit, {} as never, planState, {} as never, {} as never);
    await expect(svc.update(actor, 'r1', { risks: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('importar documento -> 409', async () => {
    const svc = new PlanService(empty, audit, {} as never, planState, {} as never, {} as never);
    await expect(
      svc.importPlan(actor, 'r1', { phases: [], dependencies: [], plan: {} } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('crear, reordenar y borrar fase -> 409', async () => {
    const svc = new PhaseService(empty, audit, planState);
    await expect(svc.create(actor, 'plan1', { name: 'F' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.reorder(actor, 'plan1', { phaseIds: [] })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(svc.remove(actor, 'plan1', 'ph1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('crear y borrar tarea -> 409', async () => {
    const prisma = {
      planPhase: { findFirst: jest.fn().mockResolvedValue({ id: 'ph1', planId: 'plan1' }) },
    } as unknown as PrismaService;
    const svc = new TaskService(prisma, audit, planState, {} as never);
    await expect(svc.create(actor, 'ph1', { title: 'T' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.remove(actor, 't1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('agregar y quitar dependencia -> 409', async () => {
    const svc = new DependencyService(empty, audit, planState);
    await expect(svc.add(actor, 't1', { predecessorTaskId: 't2' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(svc.remove(actor, 't1', 't2')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Editar tarea según el estado del plan', () => {
  function build(status: string, taskOverrides: Record<string, unknown> = {}) {
    const planState = {
      assertProjectOpen: jest.fn(),
      requireTaskInScope: jest.fn().mockResolvedValue(scopedTask(status, taskOverrides)),
      assertResponsibleInParticipants: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlanStateService;
    const row = scopedTask(status, taskOverrides).task;
    const updated = { ...row, responsibleUserId: 'u2', estimateHours: 8 };
    const prismaObj: Record<string, unknown> = {
      task: {
        update: jest.fn().mockResolvedValue(updated),
        findFirst: jest.fn().mockResolvedValue({
          ...updated,
          status: 'POR_HACER',
          progress: 0,
          accepted: false,
          _count: { evidences: 0 },
          dependenciesAsDependent: [],
          phase: {
            name: 'F',
            code: 'PRY-0012-F1',
            plan: { requestId: 'r1', request: { title: 'S', code: 'PRY-0012' } },
          },
        }),
      },
      planPhase: { findFirst: jest.fn().mockResolvedValue({ name: 'F', startDate: null, endDate: null }) },
      taskEvidence: { count: jest.fn().mockResolvedValue(0) },
    };
    prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
    const auditMock = { record: jest.fn() };
    const notifier = { notify: jest.fn() };
    const svc = new TaskService(
      prismaObj as unknown as PrismaService,
      auditMock as unknown as AuditService,
      planState,
      notifier as never,
    );
    return { svc, auditMock, prismaObj };
  }

  it('en autorización: ningún cambio, ni responsable ni horas -> 409', async () => {
    const { svc, prismaObj } = build('EN_AUTORIZACION');
    await expect(
      svc.update(actor, 't1', { responsibleUserId: 'u2', estimateHours: 8 }),
    ).rejects.toThrow(PLAN_EN_AUTORIZACION_MESSAGE);
    expect((prismaObj.task as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('autorizado: cambiar el título -> 409 y no escribe', async () => {
    const { svc, prismaObj } = build('AUTORIZADO');
    await expect(svc.update(actor, 't1', { title: 'Otro nombre' })).rejects.toThrow(
      /solo se pueden ajustar el responsable, las fechas y las horas/,
    );
    expect((prismaObj.task as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('autorizado: reenviar los mismos valores de la ficha no cuenta como cambio', async () => {
    const { svc } = build('AUTORIZADO');
    await expect(
      svc.update(actor, 't1', { title: 'Tarea', description: undefined, responsibleUserId: 'u2' }),
    ).resolves.toBeDefined();
  });

  it('autorizado: responsable y horas se ajustan y quedan auditados', async () => {
    const { svc, auditMock } = build('AUTORIZADO');
    await svc.update(actor, 't1', { responsibleUserId: 'u2', estimateHours: 8 });
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'UPDATE',
        objectType: 'TASK',
        objectId: 't1',
        scopeProcessId: 'p1',
      }),
    );
  });

  it('borrador: edita todo sin restricción', async () => {
    const { svc } = build('BORRADOR');
    await expect(svc.update(actor, 't1', { title: 'Nuevo' })).resolves.toBeDefined();
  });
});

describe('Editar fase según el estado del plan', () => {
  function build(status: string) {
    const phase = { id: 'ph1', planId: 'plan1', name: 'Diseño', deliverable: null, startDate: null, endDate: null };
    const planState = {
      assertProjectOpen: jest.fn(),
      requirePlanByIdInScope: jest.fn().mockResolvedValue(planIn(status)),
    } as unknown as PlanStateService;
    const prismaObj: Record<string, unknown> = {
      planPhase: {
        findFirst: jest.fn().mockResolvedValue(phase),
        update: jest.fn().mockResolvedValue({ ...phase, createdAt: new Date(), updatedAt: new Date() }),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
    const svc = new PhaseService(prismaObj as unknown as PrismaService, { record: jest.fn() } as never, planState);
    return { svc };
  }

  it('en autorización -> 409', async () => {
    const { svc } = build('EN_AUTORIZACION');
    await expect(svc.update(actor, 'plan1', 'ph1', { endDate: '2030-01-01' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('autorizado: renombrar -> 409; ajustar fechas -> permitido', async () => {
    const { svc } = build('AUTORIZADO');
    await expect(svc.update(actor, 'plan1', 'ph1', { name: 'Otro' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      svc.update(actor, 'plan1', 'ph1', { endDate: '2030-01-01' }),
    ).resolves.toBeDefined();
  });
});

describe('Procesos que intervienen según el estado del plan', () => {
  const planState = {
    requirePlanInScope: jest.fn(),
  } as unknown as PlanStateService;

  it('en autorización -> 409', async () => {
    (planState.requirePlanInScope as jest.Mock).mockResolvedValue({
      ...planIn('EN_AUTORIZACION'),
      requestState: 'EN_PLANIFICACION',
    });
    const svc = new PlanParticipantsService(empty, audit, planState);
    await expect(
      svc.update(actor, 'r1', { participantProcessIds: [] }),
    ).rejects.toThrow(PLAN_EN_AUTORIZACION_MESSAGE);
  });
});
