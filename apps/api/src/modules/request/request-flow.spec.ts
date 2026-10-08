import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestState } from './request-state';
import { RequestStateService } from './request-state.service';
import { TriageService } from './triage/triage.service';
import { PriorityService } from './priority/priority.service';
import { ApprovalService } from './approval/approval.service';
import { CreatePriorityEvaluationDto } from './priority/dto/create-priority-evaluation.dto';

/**
 * Prueba de flujo (design §5): approval-devolver -> re-priorizar -> re-aprobar.
 * Un unico mock mantiene el estado de la Request y el triage vigente para
 * recorrer el camino completo con los tres services reales.
 */
function createFlowMocks(initialState: string) {
  const request = {
    id: 'r1',
    mainProcessId: 'p1',
    operationalState: initialState,
  };
  let currentTriage: { decision: string } | null = null;

  const prismaObj: Record<string, unknown> = {
    request: {
      findFirst: jest.fn(async () => ({ ...request })),
      update: jest.fn(async ({ data }: { data: { operationalState: string } }) => {
        request.operationalState = data.operationalState;
        return { ...request };
      }),
    },
    triage: {
      findFirst: jest.fn(async () => (currentTriage ? { ...currentTriage } : null)),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: { decision: string } }) => {
        currentTriage = { decision: data.decision };
        return {
          id: 't1',
          requestId: 'r1',
          decision: data.decision,
          decidedAt: new Date(),
          decidedByUserId: 'ul',
          createdAt: new Date(),
        };
      }),
    },
    priorityEvaluation: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
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
        score: data.score,
        justification: null,
        evaluatedAt: new Date(),
        evaluatedByUserId: 'ul',
        createdAt: new Date(),
      })),
    },
    approval: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'a1',
        requestId: 'r1',
        decision: data.decision,
        reason: data.reason ?? null,
        previousState: data.previousState,
        resultingState: data.resultingState,
        decidedAt: new Date(),
        decidedByUserId: 'ul',
        createdAt: new Date(),
      })),
    },
    catalogItem: { findFirst: jest.fn(async () => ({ id: 'c1' })) },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const state = new RequestStateService(prisma);
  return {
    request,
    prisma,
    prismaObj,
    audit,
    state,
    triage: new TriageService(prisma, audit, state),
    priority: new PriorityService(prisma, audit, state),
    approval: new ApprovalService(prisma, audit, state),
  };
}

function lider(): CurrentActor {
  return {
    userId: 'ul',
    name: 'Beto',
    identifier: 'lider@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
  };
}

const evalDto: CreatePriorityEvaluationDto = {
  impact: 5,
  alignment: 5,
  riskControl: 5,
  urgency: 5,
  scope: 5,
  dataAvailability: 5,
  feasibility: 5,
  reuse: 5,
};

describe('Flujo de demanda (design §5)', () => {
  it('triage=Continuar -> priorizar -> aprobar lleva a COMPROMETIDA', async () => {
    const f = createFlowMocks(RequestState.REGISTRADA);
    const a = lider();

    await f.triage.create(a, 'r1', { decision: 'CONTINUAR' });
    expect(f.request.operationalState).toBe(RequestState.EN_TRIAGE);

    await f.priority.create(a, 'r1', evalDto);
    expect(f.request.operationalState).toBe(RequestState.BACKLOG_PRIORIZADO);

    await f.approval.create(a, 'r1', { decision: 'APROBAR' });
    expect(f.request.operationalState).toBe(RequestState.COMPROMETIDA);
  });

  it('approval-devolver -> re-priorizar -> re-aprobar (MEDIUM-3)', async () => {
    const f = createFlowMocks(RequestState.REGISTRADA);
    const a = lider();

    await f.triage.create(a, 'r1', { decision: 'CONTINUAR' });
    await f.priority.create(a, 'r1', evalDto);
    expect(f.request.operationalState).toBe(RequestState.BACKLOG_PRIORIZADO);

    // Devolver desde aprobacion -> EN_TRIAGE (triage vigente=Continuar intacto).
    await f.approval.create(a, 'r1', { decision: 'DEVOLVER', reason: 'faltan datos' });
    expect(f.request.operationalState).toBe(RequestState.EN_TRIAGE);

    // Re-triage desde ese EN_TRIAGE -> 409 (el triage no se re-ejecuta).
    await expect(
      f.triage.create(a, 'r1', { decision: 'CONTINUAR' }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Re-priorizar es valido en EN_TRIAGE con triage=Continuar -> BACKLOG.
    await f.priority.create(a, 'r1', evalDto);
    expect(f.request.operationalState).toBe(RequestState.BACKLOG_PRIORIZADO);

    // Re-aprobar -> COMPROMETIDA.
    await f.approval.create(a, 'r1', { decision: 'APROBAR' });
    expect(f.request.operationalState).toBe(RequestState.COMPROMETIDA);
  });

  it('monotonia del compromiso: re-priorizar sobre COMPROMETIDA -> 409 (no revierte)', async () => {
    const f = createFlowMocks(RequestState.REGISTRADA);
    const a = lider();

    await f.triage.create(a, 'r1', { decision: 'CONTINUAR' });
    await f.priority.create(a, 'r1', evalDto);
    await f.approval.create(a, 'r1', { decision: 'APROBAR' });
    expect(f.request.operationalState).toBe(RequestState.COMPROMETIDA);

    await expect(f.priority.create(a, 'r1', evalDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(f.request.operationalState).toBe(RequestState.COMPROMETIDA);
  });
});
