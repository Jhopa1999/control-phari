import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestState } from '../request-state';
import { RequestStateService } from '../request-state.service';
import { ApprovalService } from './approval.service';

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
  const state = new RequestStateService(prisma);
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
  };
}

function makeRequest(state: string) {
  return { id: 'r1', mainProcessId: 'p1', operationalState: state };
}

function mockApproval(decision: string, resultingState: string, reason: string | null = null) {
  return {
    id: 'a1',
    requestId: 'r1',
    decision,
    reason,
    previousState: RequestState.BACKLOG_PRIORIZADO,
    resultingState,
    decidedAt: new Date(),
    decidedByUserId: 'ul',
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
      { mainProcessId: { in: ['p1'] } },
    ]);
  });

  it('cola pending-approval sin filtro de alcance para jefe', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    await service.pendingApproval(jefe());
    const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { operationalState: RequestState.BACKLOG_PRIORIZADO },
      {},
    ]);
  });
});
