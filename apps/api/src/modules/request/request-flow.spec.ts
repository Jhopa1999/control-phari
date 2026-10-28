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
import { AssetService } from '../knowledge/asset/asset.service';
import { CreatePriorityEvaluationDto } from './priority/dto/create-priority-evaluation.dto';

/**
 * Prueba de flujo (design §5): approval-devolver -> re-priorizar -> re-aprobar.
 * Un unico mock mantiene el estado de la Request y el triage vigente para
 * recorrer el camino completo con los tres services reales.
 */
function createFlowMocks(
  initialState: string,
  initialAssetId: string | null = 'asset-1',
) {
  const request = {
    id: 'r1',
    mainProcessId: 'p1',
    operationalState: initialState,
    assetId: initialAssetId,
  };
  let currentTriage: { decision: string } | null = null;

  const prismaObj: Record<string, unknown> = {
    request: {
      findFirst: jest.fn(async () => ({ ...request })),
      update: jest.fn(
        async ({
          data,
        }: {
          data: { operationalState?: string; assetId?: string | null };
        }) => {
          if (data.operationalState !== undefined) {
            request.operationalState = data.operationalState;
          }
          if (data.assetId !== undefined) {
            request.assetId = data.assetId;
          }
          return { ...request, participants: [] };
        },
      ),
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
  // Activo "existente" para la asociacion. El activo es propietario del proceso
  // principal 'p1', por lo que es visible para la solicitud (refuerzo de
  // visibilidad por mainProcessId en associateAsset).
  const assetService = {
    get: jest.fn(async (_actor: unknown, id: string) => ({
      id,
      processId: 'p1',
      visibleProcessIds: [] as string[],
    })),
  } as unknown as AssetService;
  return {
    request,
    prisma,
    prismaObj,
    audit,
    state,
    assetService,
    triage: new TriageService(prisma, audit, state, assetService),
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
    isAdmin: false,
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

  it('priorizar sin activo asociado -> 409 (gate FEAT-002)', async () => {
    const f = createFlowMocks(RequestState.REGISTRADA, null);
    const a = lider();

    await f.triage.create(a, 'r1', { decision: 'CONTINUAR' });
    expect(f.request.operationalState).toBe(RequestState.EN_TRIAGE);

    await expect(f.priority.create(a, 'r1', evalDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Sigue sin activo y en EN_TRIAGE (gate no muta).
    expect(f.request.assetId).toBeNull();
    expect(f.request.operationalState).toBe(RequestState.EN_TRIAGE);
  });

  it('asociar activo -> habilita priorizar hasta BACKLOG', async () => {
    const f = createFlowMocks(RequestState.REGISTRADA, null);
    const a = lider();

    await f.triage.create(a, 'r1', { decision: 'CONTINUAR' });
    expect(f.request.operationalState).toBe(RequestState.EN_TRIAGE);

    await f.triage.associateAsset(a, 'r1', { assetId: 'asset-x' });
    expect(f.request.assetId).toBe('asset-x');

    await f.priority.create(a, 'r1', evalDto);
    expect(f.request.operationalState).toBe(RequestState.BACKLOG_PRIORIZADO);
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
