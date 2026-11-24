import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestStateService } from '../request/request-state.service';
import { RequestScopeService } from '../request/request-scope.service';
import { PortfolioScopeService } from './portfolio-scope.service';
import { PortfolioService } from './portfolio.service';

/** Filas de un listado paginado (el servicio devuelve PageResult). */
async function rowsOf<T>(p: Promise<{ rows: T[] }>): Promise<T[]> {
  return (await p).rows;
}

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
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

    const [item] = await rowsOf(service.list(jefe(), {}));
    expect(item.priorityBand).toBe('P1');
    expect(item.priorityLabel).toBe('P1 · etiqueta');
    expect(item.currentScore).toBe(85);
    expect(item.mainProcessCode).toBe('BI');
    expect(item.registeredAt).toBe('2025-03-01');
  });

  it('SIN_PRIORIZAR: banda/label/score null cuando no hay evaluacion vigente', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([requestRow()]);
    (m.prismaObj.priorityEvaluation as any).findMany.mockResolvedValue([]);

    const [item] = await rowsOf(service.list(jefe(), {}));
    expect(item.priorityBand).toBeNull();
    expect(item.priorityLabel).toBeNull();
    expect(item.currentScore).toBeNull();
    expect(m.state.priorityBand).not.toHaveBeenCalled();
  });

  it('blocked true solo con blockedAt activo y sin resolver', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([
      requestRow({ blockedAt: new Date(), blockedResolvedAt: null, blockedReason: 'X' }),
    ]);
    const [item] = await rowsOf(service.list(jefe(), {}));
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

    const items = await rowsOf(service.list(jefe(), { band: ['SIN_PRIORIZAR'] }));
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

      const [item] = await rowsOf(service.list(jefe(), {}));
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

      const [item] = await rowsOf(service.list(jefe(), {}));
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

      const [item] = await rowsOf(service.list(jefe(), {}));
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

      const [item] = await rowsOf(service.list(jefe(), {}));
      expect(item.referenceSource).toBe('PLAN');
      expect(item.daysToTarget).toBe(8);
    });
  });

  it('pagina en servidor: ventana, q en código y título, total del alcance filtrado', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([requestRow({ id: 'r9' })]);
    (m.prismaObj.request as any).count.mockResolvedValue(40);
    const result = await service.list(lider(['p1']), { page: 2, pageSize: 25, q: 'PRY-00' });
    const first = (m.prismaObj.request as any).findMany.mock.calls[0][0];
    expect(first.skip).toBe(25);
    expect(first.take).toBe(25);
    const contains = { contains: 'PRY-00', mode: 'insensitive' };
    // El portafolio no busca por solicitante (solo código y título).
    expect(first.where.AND).toContainEqual({ OR: [{ code: contains }, { title: contains }] });
    expect((m.prismaObj.request as any).count.mock.calls[0][0].where).toEqual(first.where);
    expect(result.total).toBe(40);
    expect(result.rows.map((r) => r.id)).toEqual(['r9']);
  });

  it('sin parámetros conserva la respuesta completa (tope 1000) y orden por registro', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    const result = await service.list(jefe(), {});
    const first = (m.prismaObj.request as any).findMany.mock.calls[0][0];
    expect(first.take).toBe(1000);
    expect(first.orderBy).toEqual([{ registeredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }]);
    expect(result.rows).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  describe('franja de alertas (summary y filtro alert)', () => {
    const day = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    };
    // r1 vencida (+ bloqueada), r2 próxima, r3 en tiempo con desviación, r4 sin alertas.
    beforeEach(() => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([
        requestRow({
          id: 'r1',
          operationalState: 'EN_EJECUCION',
          targetDate: day(-3),
          blockedAt: new Date(),
        }),
        requestRow({ id: 'r2', operationalState: 'EN_EJECUCION', targetDate: day(2) }),
        requestRow({ id: 'r3', operationalState: 'EN_EJECUCION', targetDate: null }),
        requestRow({ id: 'r4', operationalState: 'EN_EJECUCION', targetDate: day(60) }),
      ]);
      (m.prismaObj.plan as any).findMany.mockResolvedValue([
        {
          requestId: 'r3',
          status: 'AUTORIZADO',
          baselineDate: day(30),
          commitmentDate: null,
          periodEnd: null,
        },
      ]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        {
          status: 'EN_CURSO',
          progress: 10,
          endDate: day(35),
          phase: { plan: { requestId: 'r3' } },
        },
      ]);
    });

    it('los contadores coinciden con el total del listado filtrado por cada alerta', async () => {
      const summary = await service.summary(jefe(), {});
      expect(summary).toEqual({
        total: 4,
        overdue: 1,
        dueSoon: 1,
        withVariance: 1,
        blocked: 1,
        truncated: false,
      });
      const pairs = [
        ['VENCIDA', summary.overdue],
        ['PROXIMA', summary.dueSoon],
        ['CON_DESVIACION', summary.withVariance],
        ['BLOQUEADA', summary.blocked],
      ] as const;
      for (const [alert, count] of pairs) {
        const page = await service.list(jefe(), { alert });
        expect(page.total).toBe(count);
        expect(page.rows).toHaveLength(count);
      }
    });

    it('alert devuelve solo las filas de esa alerta y respeta la paginación', async () => {
      const page = await service.list(jefe(), { alert: 'VENCIDA', page: 2, pageSize: 1 });
      expect(page.total).toBe(1);
      expect(page.rows).toEqual([]);
      const first = await service.list(jefe(), { alert: 'VENCIDA', page: 1, pageSize: 1 });
      expect(first.rows.map((r) => r.id)).toEqual(['r1']);
    });

    it('alert se combina con state y band intersectando el alcance', async () => {
      (m.prismaObj.priorityEvaluation as any).findMany.mockResolvedValue([
        { requestId: 'r1', score: 85, evaluatedAt: new Date('2025-03-02') },
      ]);
      (m.state.priorityBand as jest.Mock).mockReturnValue('P1');
      (m.state.priorityLabel as jest.Mock).mockReturnValue('P1');
      const page = await service.list(lider(['p1']), {
        alert: 'BLOQUEADA',
        state: ['EN_EJECUCION'] as any,
        band: ['P1'],
      });
      const and = (m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND;
      expect(and[0]).toEqual({
        deletedAt: null,
        OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }],
      });
      expect(and).toContainEqual({ operationalState: { in: ['EN_EJECUCION'] } });
      expect(page.rows.map((r) => r.id)).toEqual(['r1']);
      expect(page.total).toBe(1);
    });

    it('summary del integrante usa su alcance, no amplía', async () => {
      await service.summary(lider(['p1']), { state: ['EN_EJECUCION'] as any });
      const and = (m.prismaObj.request as any).findMany.mock.calls[0][0].where.AND;
      expect(and[0]).toEqual({
        deletedAt: null,
        OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }],
      });
    });
  });

  describe('execution', () => {
    it('404 único si no existe o está fuera de alcance, con el alcance del actor', async () => {
      (m.prismaObj.request as any).findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.execution(lider(['p1']), 'x')).rejects.toThrow(
        'No se encontró la solicitud.',
      );
      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ id: 'x' });
      expect(where.AND[1]).toEqual({
        deletedAt: null,
        OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }],
      });
    });

    it('sin plan: hasPlan false y fases vacías', async () => {
      (m.prismaObj.request as any).findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'r1', code: 'PRY-0001', targetDate: null });
      (m.prismaObj.plan as any).findFirst = jest.fn().mockResolvedValue(null);
      const result = await service.execution(jefe(), 'r1');
      expect(result).toMatchObject({ hasPlan: false, planStatus: null, phases: [] });
    });

    it('arma fases, tareas, avance, pronóstico y desviación', async () => {
      (m.prismaObj.request as any).findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'r1', code: 'PRY-0001', targetDate: null });
      (m.prismaObj.plan as any).findFirst = jest.fn().mockResolvedValue({
        status: 'AUTORIZADO',
        baselineDate: new Date('2026-06-30T00:00:00Z'),
        commitmentDate: null,
        periodEnd: null,
        phases: [
          {
            id: 'f1',
            code: 'PRY-0001-F1',
            name: 'Descubrimiento',
            order: 1,
            startDate: null,
            endDate: null,
            tasks: [
              {
                id: 't1',
                code: 'PRY-0001-T01',
                title: 'A',
                status: 'TERMINADA',
                progress: 100,
                startDate: null,
                endDate: new Date('2026-06-10T00:00:00Z'),
                responsible: { name: 'Ana' },
              },
            ],
          },
          {
            id: 'f2',
            code: 'PRY-0001-F2',
            name: 'Construcción',
            order: 2,
            startDate: null,
            endDate: null,
            tasks: [
              {
                id: 't2',
                code: 'PRY-0001-T02',
                title: 'B',
                status: 'EN_CURSO',
                progress: 40,
                startDate: null,
                endDate: new Date('2026-07-12T00:00:00Z'),
                responsible: null,
              },
            ],
          },
          { id: 'f3', code: 'PRY-0001-F3', name: 'Cierre', order: 3, startDate: null, endDate: null, tasks: [] },
        ],
      });
      const result = await service.execution(jefe(), 'r1');
      expect(result.baselineDate).toBe('2026-06-30');
      expect(result.forecastDate).toBe('2026-07-12');
      expect(result.scheduleVarianceDays).toBe(12);
      expect(result.progressPercent).toBe(70);
      expect(result.phases.map((p) => p.status)).toEqual(['TERMINADA', 'EN_CURSO', 'SIN_TAREAS']);
      expect(result.phases[1]).toMatchObject({ progressPercent: 40, tasksTotal: 1, tasksDone: 0 });
      expect(result.phases[1].tasks[0]).toMatchObject({
        code: 'PRY-0001-T02',
        responsibleName: null,
      });
      expect(result.phases[0].tasks[0].responsibleName).toBe('Ana');
    });
  });

  it('"comprometida" se refleja por operationalState explicito (no se infiere)', async () => {
    (m.prismaObj.request as any).findMany.mockResolvedValue([
      requestRow({ operationalState: 'COMPROMETIDA' }),
    ]);
    const [item] = await rowsOf(service.list(jefe(), {}));
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

      const items = await rowsOf(service.list(jefe(), { band: ['P1', 'SIN_PRIORIZAR'] }));
      expect(items.map((i) => i.id).sort()).toEqual(['r1', 'r2']);
    });
  });
});