import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestState } from '../request-state';
import { RequestStateService } from '../request-state.service';
import { PriorityService } from './priority.service';
import { CreatePriorityEvaluationDto } from './dto/create-priority-evaluation.dto';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn(), update: jest.fn() },
    triage: { findFirst: jest.fn() },
    priorityEvaluation: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
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
    isAdmin: false,
  };
}

function makeRequest(
  state: string,
  assetId: string | null = 'asset-1',
) {
  return { id: 'r1', mainProcessId: 'p1', operationalState: state, assetId };
}

const dto: CreatePriorityEvaluationDto = {
  impact: 5,
  alignment: 5,
  riskControl: 5,
  urgency: 5,
  scope: 5,
  dataAvailability: 5,
  feasibility: 5,
  reuse: 5,
};

function mockCreatedEvaluation(
  score: number,
  evaluatedBy: { id: string; name: string } | null = { id: 'ul', name: 'Beto' },
) {
  return {
    id: 'e1',
    requestId: 'r1',
    impact: 5,
    alignment: 5,
    riskControl: 5,
    urgency: 5,
    scope: 5,
    dataAvailability: 5,
    feasibility: 5,
    reuse: 5,
    score,
    justification: null,
    evaluatedAt: new Date(),
    evaluatedByUserId: 'ul',
    evaluatedBy,
    createdAt: new Date(),
  };
}

describe('PriorityService', () => {
  let service: PriorityService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new PriorityService(m.prisma, m.audit, m.state, { notify: jest.fn(), areaHeadsForProcess: jest.fn().mockResolvedValue([]), processLeaders: jest.fn().mockResolvedValue([]) } as never);
  });

  it('con triage=Continuar y EN_TRIAGE: calcula score (backend), persiste y pasa a BACKLOG', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
    (m.prismaObj.priorityEvaluation as any).create.mockResolvedValue(
      mockCreatedEvaluation(100),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );

    const res = await service.create(lider(), 'r1', dto);

    // score lo calcula el backend (todos 5 -> 100); no viene del DTO.
    expect((m.prismaObj.priorityEvaluation as any).create.mock.calls[0][0].data.score).toBe(100);
    expect(res.score).toBe(100);
    expect(res.thresholdLabel).toBe(
      'P1 · Primera consideracion para compromiso',
    );
    // Nombre del evaluador resuelto desde la relacion incluida en la query.
    expect(res.evaluatedByName).toBe('Beto');
    expect(
      (m.prismaObj.priorityEvaluation as any).create.mock.calls[0][0].include,
    ).toMatchObject({ evaluatedBy: { select: { id: true, name: true } } });
    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.BACKLOG_PRIORIZADO,
    });
    // CREATE evaluacion + UPDATE request.
    expect(m.auditRecord).toHaveBeenCalledTimes(2);
    expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'CREATE',
      objectType: 'PRIORITY_EVALUATION',
      scopeProcessId: 'p1',
    });
  });

  it('sin relacion evaluatedBy -> evaluatedByName null', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
    (m.prismaObj.priorityEvaluation as any).create.mockResolvedValue(
      mockCreatedEvaluation(100, null),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );

    const res = await service.create(lider(), 'r1', dto);
    expect(res.evaluatedByName).toBeNull();
  });

  it('re-POST sobre BACKLOG mantiene BACKLOG (idempotente en estado)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
    (m.prismaObj.priorityEvaluation as any).create.mockResolvedValue(
      mockCreatedEvaluation(100),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );

    await service.create(lider(), 'r1', dto);
    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.BACKLOG_PRIORIZADO,
    });
  });

  it('sin triage=Continuar -> 409 sin mutacion', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'DEVOLVER' });
    await expect(service.create(lider(), 'r1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((m.prismaObj.priorityEvaluation as any).create).not.toHaveBeenCalled();
    expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
  });

  it('sin triage registrado -> 409', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue(null);
    await expect(service.create(lider(), 'r1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('re-POST sobre COMPROMETIDA -> 409 sin mutacion (HIGH-2, BR-006)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.COMPROMETIDA),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
    await expect(service.create(lider(), 'r1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((m.prismaObj.priorityEvaluation as any).create).not.toHaveBeenCalled();
    expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
  });

  it('POST sobre DEVUELTA/RECHAZADA -> 409', async () => {
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
    for (const st of [RequestState.DEVUELTA, RequestState.RECHAZADA]) {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(makeRequest(st));
      await expect(service.create(lider(), 'r1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    }
  });

  it('sin activo asociado (assetId null) -> 409 sin mutacion (gate FEAT-002)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE, null),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
    await expect(service.create(lider(), 'r1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((m.prismaObj.priorityEvaluation as any).create).not.toHaveBeenCalled();
    expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
  });

  it('con activo asociado (assetId != null) -> prioriza y pasa a BACKLOG', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE, 'asset-1'),
    );
    (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
    (m.prismaObj.priorityEvaluation as any).create.mockResolvedValue(
      mockCreatedEvaluation(100),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.BACKLOG_PRIORIZADO),
    );

    await service.create(lider(), 'r1', dto);
    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.BACKLOG_PRIORIZADO,
    });
  });
});
