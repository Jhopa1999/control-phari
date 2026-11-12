import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestStateService } from '../request/request-state.service';
import { RequestScopeService } from '../request/request-scope.service';
import { PortfolioScopeService } from './portfolio-scope.service';
import { PortfolioService } from './portfolio.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findMany: jest.fn() },
    priorityEvaluation: { findMany: jest.fn() },
    task: { findMany: jest.fn().mockResolvedValue([]) },
    plan: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = prismaObj as unknown as PrismaService;
  const state = {
    priorityBand: jest.fn(),
    priorityLabel: jest.fn(),
  } as unknown as RequestStateService;
  const scope = new PortfolioScopeService(new RequestScopeService());
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
    isLiderProceso: false,
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
    isLiderProceso: false,
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
    ).toEqual({ deletedAt: null, OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }] });
    // Lider: todas las solicitudes (mismo alcance que Solicitudes), incluidas las
    // de otros procesos y las sin proceso.
    await service.list({ ...lider(['p1']), isLiderProceso: true }, {});
    expect(
      (m.prismaObj.request as any).findMany.mock.calls[2][0].where.AND[0],
    ).toEqual({ deletedAt: null });
  });

  it('filtros intersectan el alcance (no lo amplian)', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    await service.list(lider(['p1']), {
      mainProcessId: ['p1'],
      state: ['CERRADA'] as any,
    });
    const and = (m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND;
    expect(and[0]).toEqual({ deletedAt: null, OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }] });
    expect(and).toContainEqual({ mainProcessId: { in: ['p1'] } });
    expect(and).toContainEqual({ operationalState: { in: ['CERRADA'] } });
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

    const items = await service.list(jefe(), { band: ['SIN_PRIORIZAR'] });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('r1');
  });

  it('filtro mainProcessId SIN_PROCESO produce where con mainProcessId null', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    await service.list(jefe(), { mainProcessId: ['SIN_PROCESO'] });
    const and = (m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND;
    expect(and).toContainEqual({ mainProcessId: null });
    expect(and).not.toContainEqual({ mainProcessId: ['SIN_PROCESO'] });
  });

  it('filtro mainProcessId con UUID produce where con igualdad por UUID', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    await service.list(jefe(), {
      mainProcessId: ['11111111-1111-1111-1111-111111111111'],
    });
    const and = (m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND;
    expect(and).toContainEqual({
      mainProcessId: { in: ['11111111-1111-1111-1111-111111111111'] },
    });
  });

  describe('vencimiento contra el compromiso del plan', () => {
    const isoDay = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    };
    const taskRow = (endDate: Date, status = 'EN_CURSO') => ({
      status,
      progress: 10,
      endDate,
      phase: { plan: { requestId: 'r1' } },
    });
    const planRow = (overrides: Record<string, unknown> = {}) => ({
      requestId: 'r1',
      status: 'AUTORIZADO',
      baselineDate: isoDay(10),
      commitmentDate: null,
      periodEnd: null,
      ...overrides,
    });

    it('fecha objetivo pasada pero plan autorizado vigente -> no está vencido', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([
        requestRow({ operationalState: 'EN_EJECUCION', targetDate: isoDay(-10) }),
      ]);
      (m.prismaObj.plan as any).findMany.mockResolvedValue([planRow()]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([taskRow(isoDay(10))]);

      const [item] = await service.list(jefe(), {});
      expect(item.dueStatus).toBe('EN_TIEMPO');
      expect(item.daysToTarget).toBe(10);
      expect(item.referenceSource).toBe('PLAN');
      expect(item.requestedGapDays).toBe(20);
      expect(item.scheduleVarianceDays).toBe(0);
    });

    it('superado el compromiso del plan sí queda vencido', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([
        requestRow({ operationalState: 'EN_EJECUCION', targetDate: isoDay(-20) }),
      ]);
      (m.prismaObj.plan as any).findMany.mockResolvedValue([planRow({ baselineDate: isoDay(-2) })]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([taskRow(isoDay(3))]);

      const [item] = await service.list(jefe(), {});
      expect(item.dueStatus).toBe('VENCIDO');
      expect(item.daysToTarget).toBe(-2);
      expect(item.scheduleVarianceDays).toBe(5);
    });

    it('plan sin autorizar: se mide contra la fecha objetivo', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([
        requestRow({ operationalState: 'EN_PLANIFICACION', targetDate: isoDay(-3) }),
      ]);
      (m.prismaObj.plan as any).findMany.mockResolvedValue([
        planRow({ status: 'BORRADOR', baselineDate: null, periodEnd: isoDay(20) }),
      ]);

      const [item] = await service.list(jefe(), {});
      expect(item.dueStatus).toBe('VENCIDO');
      expect(item.referenceSource).toBe('SOLICITUD');
      expect(item.requestedGapDays).toBeNull();
    });

    it('plan autorizado antiguo sin línea base usa compromiso o fin del periodo', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([
        requestRow({ operationalState: 'EN_EJECUCION', targetDate: isoDay(-5) }),
      ]);
      (m.prismaObj.plan as any).findMany.mockResolvedValue([
        planRow({ baselineDate: null, commitmentDate: null, periodEnd: isoDay(8) }),
      ]);

      const [item] = await service.list(jefe(), {});
      expect(item.referenceSource).toBe('PLAN');
      expect(item.daysToTarget).toBe(8);
    });
  });

  it('"comprometida" se refleja por operationalState explicito (no se infiere)', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([
      requestRow({ operationalState: 'COMPROMETIDA' }),
    ]);
    const [item] = await service.list(jefe(), {});
    expect(item.operationalState).toBe('COMPROMETIDA');
  });

  describe('filtros de seleccion multiple', () => {
    const U1 = '11111111-1111-1111-1111-111111111111';
    const U2 = '22222222-2222-2222-2222-222222222222';
    const whereAnd = () =>
      (m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND;

    beforeEach(() => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    });

    it('varios UUID -> mainProcessId IN (uuids)', async () => {
      await service.list(jefe(), { mainProcessId: [U1, U2] });
      expect(whereAnd()).toContainEqual({ mainProcessId: { in: [U1, U2] } });
    });

    it('SIN_PROCESO + UUID -> OR (IN uuids o IS NULL)', async () => {
      await service.list(jefe(), { mainProcessId: [U1, 'SIN_PROCESO', U2] });
      expect(whereAnd()).toContainEqual({
        OR: [{ mainProcessId: { in: [U1, U2] } }, { mainProcessId: null }],
      });
    });

    it('varios estados -> operationalState IN', async () => {
      await service.list(jefe(), { state: ['EN_EJECUCION', 'BLOQUEADA'] as any });
      expect(whereAnd()).toContainEqual({
        operationalState: { in: ['EN_EJECUCION', 'BLOQUEADA'] },
      });
    });

    it('arreglos vacios no restringen', async () => {
      await service.list(jefe(), { mainProcessId: [], state: [], band: [] });
      expect(whereAnd()).toEqual([{ deletedAt: null }]);
    });

    it('filtros multiples intersectan el alcance sin ampliarlo (AND con el alcance)', async () => {
      await service.list(lider(['p1']), {
        mainProcessId: [U1, 'SIN_PROCESO'],
        state: ['CERRADA'] as any,
      });
      const and = whereAnd();
      expect(and[0]).toEqual({ deletedAt: null, OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }] });
      expect(and).toHaveLength(3);
    });

    it('banda multiple: OR entre bandas incluida SIN_PRIORIZAR', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([
        requestRow({ id: 'r1' }),
        requestRow({ id: 'r2' }),
        requestRow({ id: 'r3' }),
      ]);
      (m.prismaObj.priorityEvaluation as any).findMany.mockResolvedValue([
        { requestId: 'r2', score: 85, evaluatedAt: new Date('2025-03-02') },
        { requestId: 'r3', score: 10, evaluatedAt: new Date('2025-03-02') },
      ]);
      (m.state.priorityBand as jest.Mock).mockImplementation((s: number) =>
        s >= 80 ? 'P1' : 'P4',
      );
      (m.state.priorityLabel as jest.Mock).mockReturnValue('x');

      const items = await service.list(jefe(), { band: ['P1', 'SIN_PRIORIZAR'] });
      expect(items.map((i) => i.id).sort()).toEqual(['r1', 'r2']);
    });
  });
});