import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ClosureService } from './closure.service';
import { RequestStateService } from '../request/request-state.service';
import type { CurrentActor } from '../auth/current-actor';
import { withReferenceLookups } from '../../testing/reference-lookups';

function actor(jefe: boolean): CurrentActor {
  return {
    userId: jefe ? 'jefe' : 'lider',
    isJefeArea: jefe,
    isLiderProceso: false,
    isAdmin: false,
    scopedProcessIds: new Set(['p1']),
    roleCodes: new Set(),
    grants: [],
  } as unknown as CurrentActor;
}

interface Setup {
  state?: string;
  planStatus?: string;
  tasksTotal?: number;
  tasksDone?: number;
  docs?: Array<{ status: string }>;
  pending?: boolean;
  /** GC5 existente (null = aun no materializado). */
  gc5?: { id: string; status: string; waiverReason: string | null } | null;
}

function build(s: Setup = {}) {
  const request = {
    id: 'r1',
    title: 'Proyecto',
    mainProcessId: 'p1',
    operationalState: s.state ?? 'EN_EJECUCION',
    closedAt: null,
    closedByUserId: null,
  };
  const pendingRow = {
    id: 'c1',
    requestId: 'r1',
    status: 'PENDIENTE',
    requestedByUserId: 'lider',
    requestedAt: new Date(),
    decidedByUserId: null,
    decidedAt: null,
    decisionReason: null,
  };
  const tx = {
    projectClosure: {
      create: jest.fn().mockResolvedValue(pendingRow),
      update: jest.fn().mockImplementation(({ data }) => ({ ...pendingRow, ...data })),
    },
    request: { update: jest.fn().mockResolvedValue({}) },
    gateCheck: {
      findUnique: jest.fn().mockResolvedValue(s.gc5 ?? null),
      upsert: jest.fn().mockImplementation(({ create, update }) => ({ id: 'g5', ...create, ...update })),
    },
  };
  const prisma = {
    request: { findFirst: jest.fn().mockResolvedValue(request) },
    plan: {
      findFirst: jest.fn().mockResolvedValue({ id: 'plan1', status: s.planStatus ?? 'AUTORIZADO' }),
    },
    task: {
      count: jest
        .fn()
        .mockResolvedValueOnce(s.tasksTotal ?? 3)
        .mockResolvedValueOnce(s.tasksDone ?? 3)
        .mockResolvedValue(s.tasksTotal ?? 3),
    },
    document: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (s.docs ?? [{ status: 'VIGENTE' }]).map((d, i) => ({
            id: `d${i}`,
            title: `Doc ${i}`,
            reviewReason: null,
            ...d,
          })),
        ),
    },
    projectClosure: {
      findFirst: jest.fn().mockResolvedValue(s.pending ? pendingRow : null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const notifications = {
    notify: jest.fn(),
    areaHeadsForProcess: jest.fn().mockResolvedValue(['jefe']),
    processLeaders: jest.fn().mockResolvedValue(['lider']),
  };
  const service = new ClosureService(
    prisma as never,
    audit as never,
    new RequestStateService(withReferenceLookups(prisma as never)),
    notifications as never,
  );
  return { service, prisma, tx, audit, notifications };
}

describe('ClosureService', () => {
  it('bloquea la solicitud de cierre si hay tareas pendientes', async () => {
    const { service, tx } = build({ tasksTotal: 3, tasksDone: 2 });
    await expect(service.requestClosure(actor(false), 'r1')).rejects.toThrow(
      /tarea sin terminar/,
    );
    expect(tx.projectClosure.create).not.toHaveBeenCalled();
  });

  it('bloquea si no hay documentación de cierre o está pendiente de aprobación', async () => {
    await expect(build({ docs: [] }).service.requestClosure(actor(false), 'r1')).rejects.toThrow(
      /No hay documentación de cierre/,
    );
    await expect(
      build({ docs: [{ status: 'PENDIENTE_APROBACION' }] }).service.requestClosure(actor(false), 'r1'),
    ).rejects.toThrow(/pendiente de aprobación/);
  });

  it('crea la solicitud de cierre, audita y notifica a los jefes', async () => {
    const { service, tx, audit, notifications } = build();
    await service.requestClosure(actor(false), 'r1');
    expect(tx.projectClosure.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ objectType: 'PROJECT_CLOSURE', action: 'CREATE' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLOSURE_REQUESTED' }),
    );
  });

  it('no permite una segunda solicitud pendiente', async () => {
    const { service } = build({ pending: true });
    await expect(service.requestClosure(actor(false), 'r1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('solo el jefe decide; aprobar cierra el proyecto con usuario y fecha', async () => {
    await expect(
      build({ pending: true }).service.decide(actor(false), 'r1', { decision: 'APROBAR' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const { service, tx } = build({ pending: true });
    await service.decide(actor(true), 'r1', { decision: 'APROBAR' });
    expect(tx.request.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        operationalState: 'CERRADA',
        closedByUserId: 'jefe',
        closedAt: expect.any(Date),
      }),
    });
  });

  it('rechazar exige observaciones y no cierra el proyecto', async () => {
    await expect(
      build({ pending: true }).service.decide(actor(true), 'r1', { decision: 'RECHAZAR' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { service, tx } = build({ pending: true });
    await service.decide(actor(true), 'r1', { decision: 'RECHAZAR', reason: 'Falta el acta' });
    expect(tx.projectClosure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RECHAZADO', decisionReason: 'Falta el acta' }),
      }),
    );
    expect(tx.request.update).not.toHaveBeenCalled();
  });

  it('la reapertura solo la hace el jefe y vuelve el proyecto a ejecución', async () => {
    await expect(
      build({ state: 'CERRADA' }).service.reopen(actor(false), 'r1', { reason: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { service, tx } = build({ state: 'CERRADA' });
    await service.reopen(actor(true), 'r1', { reason: 'Ajuste pendiente' });
    expect(tx.request.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { operationalState: 'EN_EJECUCION', closedAt: null, closedByUserId: null },
    });
  });
});

describe('ClosureService · GC5 refleja el cierre formal (D10)', () => {
  it('aprobar el cierre deja GC5 CUMPLIDO con quién y cuándo, en la misma transacción y auditado', async () => {
    const { service, tx, audit } = build({ pending: true });
    await service.decide(actor(true), 'r1', { decision: 'APROBAR' });
    expect(tx.gateCheck.upsert).toHaveBeenCalledTimes(1);
    const arg = tx.gateCheck.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      gate_check_request_gate_unique: { requestId: 'r1', gateCode: 'GC5' },
    });
    expect(arg.update).toEqual(
      expect.objectContaining({
        status: 'CUMPLIDO',
        decidedByUserId: 'jefe',
        decidedAt: expect.any(Date),
        waiverReason: null,
      }),
    );
    expect(arg.create).toEqual(
      expect.objectContaining({ requestId: 'r1', gateCode: 'GC5', status: 'CUMPLIDO' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ objectType: 'GATE_CHECK', action: 'UPDATE' }),
    );
  });

  it('un GC5 marcado «No aplica» pasa a CUMPLIDO al aprobar el cierre', async () => {
    const { service, tx } = build({
      pending: true,
      gc5: { id: 'g5', status: 'NO_APLICA', waiverReason: 'x' },
    });
    await service.decide(actor(true), 'r1', { decision: 'APROBAR' });
    expect(tx.gateCheck.upsert.mock.calls[0][0].update.status).toBe('CUMPLIDO');
  });

  it('rechazar el cierre no toca GC5', async () => {
    const { service, tx } = build({ pending: true });
    await service.decide(actor(true), 'r1', { decision: 'RECHAZAR', reason: 'Falta el acta' });
    expect(tx.gateCheck.upsert).not.toHaveBeenCalled();
  });

  it('reabrir no revierte GC5 (queda como historia)', async () => {
    const { service, tx } = build({ state: 'CERRADA' });
    await service.reopen(actor(true), 'r1', { reason: 'Ajuste pendiente' });
    expect(tx.gateCheck.upsert).not.toHaveBeenCalled();
  });
});
