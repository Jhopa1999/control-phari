import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestStateService } from '../request/request-state.service';
import { PortfolioScopeService } from './portfolio-scope.service';
import { PortfolioService } from './portfolio.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findMany: jest.fn() },
    priorityEvaluation: { findMany: jest.fn() },
    task: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = prismaObj as unknown as PrismaService;
  const state = {
    priorityBand: jest.fn(),
    priorityLabel: jest.fn(),
  } as unknown as RequestStateService;
  const scope = new PortfolioScopeService();
  return { prisma, prismaObj, state, scope };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Jefa',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => ({
      processId: p,
      processCode: p.toUpperCase(),
      processName: p,
      roleCode: RoleCode.LIDER_PROCESO,
      roleName: RoleCode.LIDER_PROCESO,
    })),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isAdmin: false,
  };
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    title: 'Iniciativa',
    mainProcessId: 'p1',
    operationalState: 'REGISTRADA',
    governanceRoute: null,
    functionalOwner: 'Ana',
    registeredAt: new Date('2025-03-01T00:00:00.000Z'),
    targetDate: null,
    initialCommitmentDate: null,
    blockedAt: null,
    blockedResolvedAt: null,
    blockedReason: null,
    mainProcess: { code: 'BI', name: 'Inteligencia de Negocio' },
    ...overrides,
  };
}

describe('PortfolioService', () => {
  let service: PortfolioService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new PortfolioService(m.prisma, m.state, m.scope);
    (m.prismaObj.priorityEvaluation as any).findMany.mockResolvedValue([]);
  });

  it('mapea banda/label desde la evaluacion vigente (P1)', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([requestRow()]);
    (m.prismaObj.priorityEvaluation as any).findMany.mockResolvedValue([
      { requestId: 'r1', score: 85, evaluatedAt: new Date('2025-03-02') },
    ]);
    (m.state.priorityBand as jest.Mock).mockReturnValue('P1');
    (m.state.priorityLabel as jest.Mock).mockReturnValue('P1 · etiqueta');

    const [item] = await service.list(jefe(), {});
    expect(item.priorityBand).toBe('P1');
    expect(item.priorityLabel).toBe('P1 · etiqueta');
    expect(item.currentScore).toBe(85);
    expect(item.mainProcessCode).toBe('BI');
    expect(item.registeredAt).toBe('2025-03-01');
  });

  it('SIN_PRIORIZAR: banda/label/score null cuando no hay evaluacion vigente', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([requestRow()]);
    (m.prismaObj.priorityEvaluation as any).findMany.mockResolvedValue([]);

    const [item] = await service.list(jefe(), {});
    expect(item.priorityBand).toBeNull();
    expect(item.priorityLabel).toBeNull();
    expect(item.currentScore).toBeNull();
    expect(m.state.priorityBand).not.toHaveBeenCalled();
  });

  it('blocked true solo con blockedAt activo y sin resolver', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([
      requestRow({ blockedAt: new Date(), blockedResolvedAt: null, blockedReason: 'X' }),
    ]);
    const [item] = await service.list(jefe(), {});
    expect(item.blocked).toBe(true);
    expect(item.blockedReason).toBe('X');
  });

  it('alcance jefe -> where AND = [{}]; no-jefe -> mainProcessId in scoped', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);

    await service.list(jefe(), {});
    expect((m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND[0]).toEqual({ deletedAt: null });

    await service.list(lider(['p1']), {});
    expect(
      (m.prismaObj.request as any).findMany.mock.calls[1][0].where.AND[0],
    ).toEqual({ deletedAt: null, mainProcessId: { in: ['p1'] } });
  });

  it('filtros intersectan el alcance (no lo amplian)', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    await service.list(lider(['p1']), {
      mainProcessId: 'p1',
      state: 'CERRADA' as any,
    });
    const and = (m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND;
    expect(and[0]).toEqual({ deletedAt: null, mainProcessId: { in: ['p1'] } });
    expect(and).toContainEqual({ mainProcessId: 'p1' });
    expect(and).toContainEqual({ operationalState: 'CERRADA' });
  });

  it('filtro de banda SIN_PRIORIZAR excluye items con evaluacion vigente', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([
      requestRow({ id: 'r1' }),
      requestRow({ id: 'r2' }),
    ]);
    // r1 sin evaluacion -> SIN_PRIORIZAR; r2 con score 85 -> P1.
    (m.prismaObj.priorityEvaluation as any).findMany.mockResolvedValue([
      { requestId: 'r2', score: 85, evaluatedAt: new Date('2025-03-02') },
    ]);
    (m.state.priorityBand as jest.Mock).mockReturnValue('P1');
    (m.state.priorityLabel as jest.Mock).mockReturnValue('P1');

    const items = await service.list(jefe(), { band: 'SIN_PRIORIZAR' });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('r1');
  });

  it('"comprometida" se refleja por operationalState explicito (no se infiere)', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([
      requestRow({ operationalState: 'COMPROMETIDA' }),
    ]);
    const [item] = await service.list(jefe(), {});
    expect(item.operationalState).toBe('COMPROMETIDA');
  });
});
