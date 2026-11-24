import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestState } from '../request-state';
import { RequestStateService } from '../request-state.service';
import { ApprovalService } from './approval.service';
import { withReferenceLookups } from '../../../testing/reference-lookups';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    triage: { findFirst: jest.fn() },
    priorityEvaluation: { findFirst: jest.fn() },
    approval: { findMany: jest.fn(), create: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const state = new RequestStateService(withReferenceLookups(prisma));
  return { prisma, prismaObj, audit, auditRecord, state };
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

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Ana',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(['p1', 'p2']),
    isJefeArea: true,
    isLiderProceso: false,
    isAdmin: false,
  };
}

function makeRequest(state: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    code: 'PRY-0001',
    mainProcessId: 'p1',
    operationalState: state,
    createdByUserId: null,
    ...extra,
  };
}

function mockApproval(
  decision: string,
  resultingState: string,
  reason: string | null = null,
  decidedBy: { id: string; name: string } | null = { id: 'ul', name: 'Beto' },
) {
  return {
    id: 'a1',
    requestId: 'r1',
    decision,
    reason,
    previousState: RequestState.BACKLOG_PRIORIZADO,
    resultingState,
    decidedAt: new Date(),
    decidedByUserId: 'ul',
    decidedBy,
    createdAt: new Date(),
  };
}

describe('ApprovalService', () => {
  let service: ApprovalService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new ApprovalService(m.prisma, m.audit, m.state);
  });

  it('APROBAR desde BACKLOG -> COMPROMETIDA, Approval append-only + audita', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );
    (m.prismaObj.approval as any).create.mockResolvedValue(
      mockApproval('APROBAR', RequestState.COMPROMETIDA),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.COMPROMETIDA),
    );

    const res = await service.create(lider(), 'r1', { decision: 'APROBAR' });

    expect((m.prismaObj.approval as any).create.mock.calls[0][0].data).toMatchObject({
      decision: 'APROBAR',
      previousState: RequestState.BACKLOG_PRIORIZADO,
      resultingState: RequestState.COMPROMETIDA,
    });
    expect(res.resultingState).toBe(RequestState.COMPROMETIDA);
    // Nombre de quien decidio resuelto desde la relacion incluida en la query.
    expect(res.decidedByName).toBe('Beto');
    expect(
      (m.prismaObj.approval as any).create.mock.calls[0][0].include,
    ).toMatchObject({ decidedBy: { select: { id: true, name: true } } });
    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.COMPROMETIDA,
    });
    expect(m.auditRecord).toHaveBeenCalledTimes(2);
    expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'CREATE',
      objectType: 'APPROVAL',
      scopeProcessId: 'p1',
    });
  });

  it('sin relacion decidedBy -> decidedByName null', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );
    (m.prismaObj.approval as any).create.mockResolvedValue(
      mockApproval('APROBAR', RequestState.COMPROMETIDA, null, null),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.COMPROMETIDA),
    );

    const res = await service.create(lider(), 'r1', { decision: 'APROBAR' });
    expect(res.decidedByName).toBeNull();
  });

  it('DEVOLVER con motivo -> EN_TRIAGE (destino determinista, previousState=BACKLOG)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );
    (m.prismaObj.approval as any).create.mockResolvedValue(
      mockApproval('DEVOLVER', RequestState.EN_TRIAGE, 'faltan datos'),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );

    const res = await service.create(lider(), 'r1', {
      decision: 'DEVOLVER',
      reason: 'faltan datos',
    });

    expect(res.resultingState).toBe(RequestState.EN_TRIAGE);
    expect(res.previousState).toBe(RequestState.BACKLOG_PRIORIZADO);
    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.EN_TRIAGE,
    });
  });

  it('DEVOLVER sin motivo -> 400 (no 409), sin mutacion', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );
    await expect(
      service.create(lider(), 'r1', { decision: 'DEVOLVER' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((m.prismaObj.approval as any).create).not.toHaveBeenCalled();
    expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
  });

  it('aprobar fuera de BACKLOG -> 409 sin mutacion', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );
    await expect(
      service.create(lider(), 'r1', { decision: 'APROBAR' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((m.prismaObj.approval as any).create).not.toHaveBeenCalled();
    expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
  });

  it('cola pending-approval filtra por BACKLOG y alcance (no-jefe)', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    await service.pendingApproval(lider(['p1']));
    const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { operationalState: RequestState.BACKLOG_PRIORIZADO },
      { deletedAt: null, OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }] },
    ]);
  });

  it('cola pending-approval sin filtro de alcance para jefe', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    await service.pendingApproval(jefe());
    const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { operationalState: RequestState.BACKLOG_PRIORIZADO },
      { deletedAt: null },
    ]);
  });

  describe('approvedByCreator', () => {
    it('es verdadero en ambos eventos cuando quien aprueba es el creador', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.BACKLOG_PRIORIZADO, { createdByUserId: 'uj' }),
      );
      (m.prismaObj.approval as any).create.mockResolvedValue(
        mockApproval('APROBAR', RequestState.COMPROMETIDA),
      );
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA),
      );
      await service.create(jefe(), 'r1', { decision: 'APROBAR' });
      expect(m.auditRecord.mock.calls[0][1].after.approvedByCreator).toBe(true);
      expect(m.auditRecord.mock.calls[1][1].after.approvedByCreator).toBe(true);
    });

    it('está ausente si aprueba otra persona', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.BACKLOG_PRIORIZADO, { createdByUserId: 'otro' }),
      );
      (m.prismaObj.approval as any).create.mockResolvedValue(
        mockApproval('APROBAR', RequestState.COMPROMETIDA),
      );
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA),
      );
      await service.create(jefe(), 'r1', { decision: 'APROBAR' });
      expect(m.auditRecord.mock.calls[0][1].after).not.toHaveProperty('approvedByCreator');
      expect(m.auditRecord.mock.calls[1][1].after).not.toHaveProperty('approvedByCreator');
    });

    it('está ausente al devolver aunque el creador sea quien decide', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.BACKLOG_PRIORIZADO, { createdByUserId: 'uj' }),
      );
      (m.prismaObj.approval as any).create.mockResolvedValue(
        mockApproval('DEVOLVER', RequestState.EN_TRIAGE, 'x'),
      );
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE),
      );
      await service.create(jefe(), 'r1', { decision: 'DEVOLVER', reason: 'x' });
      expect(m.auditRecord.mock.calls[0][1].after).not.toHaveProperty('approvedByCreator');
    });
  });

  describe('batchApprove', () => {
    it('aprueba las elegibles aunque otras se omitan, en el orden pedido', async () => {
      const find = (m.prismaObj.request as any).findFirst;
      find
        .mockResolvedValueOnce(makeRequest(RequestState.BACKLOG_PRIORIZADO, { id: 'r1', code: 'PRY-0001' }))
        .mockResolvedValueOnce(makeRequest(RequestState.COMPROMETIDA, { id: 'r2', code: 'PRY-0002' }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeRequest(RequestState.BACKLOG_PRIORIZADO, { id: 'r4', code: 'PRY-0004' }));
      (m.prismaObj.approval as any).create.mockResolvedValue(
        mockApproval('APROBAR', RequestState.COMPROMETIDA),
      );
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA),
      );

      const res = await service.batchApprove(jefe(), ['r1', 'r2', 'r3', 'r4']);

      expect(res.results).toEqual([
        { id: 'r1', code: 'PRY-0001', status: 'APROBADA', reason: null },
        { id: 'r2', code: 'PRY-0002', status: 'OMITIDA', reason: 'Ya no está en backlog priorizado.' },
        { id: 'r3', code: null, status: 'OMITIDA', reason: 'No encontrada.' },
        { id: 'r4', code: 'PRY-0004', status: 'APROBADA', reason: null },
      ]);
      expect(res.approved).toBe(2);
      expect(res.skipped).toBe(2);
      expect((m.prismaObj.approval as any).create).toHaveBeenCalledTimes(2);
      expect(m.prismaObj.$transaction).toHaveBeenCalledTimes(2);
      expect(m.auditRecord).toHaveBeenCalledTimes(4);
    });

    it('usa el alcance del actor al buscar cada solicitud', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await service.batchApprove(lider(['p1']), ['r9']);
      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ id: 'r9' });
      expect(where.AND[1]).toEqual({
        deletedAt: null,
        OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }],
      });
    });
  });});
