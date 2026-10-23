import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestStateService } from '../request/request-state.service';
import { AreaControlService } from './area-control.service';
import { PortfolioScopeService } from './portfolio-scope.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findMany: jest.fn(), count: jest.fn() },
    task: { findMany: jest.fn() },
    issue: { findMany: jest.fn() },
    auditEvent: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const prisma = prismaObj as unknown as PrismaService;
  const state = {
    currentPriorityEvaluation: jest.fn(),
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

function grantFor(processId: string, roleCode: RoleCode): CurrentActor['grants'][number] {
  return {
    processId,
    processCode: processId.toUpperCase(),
    processName: processId,
    roleCode,
    roleName: roleCode,
  };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => grantFor(p, RoleCode.LIDER_PROCESO)),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isAdmin: false,
  };
}

function mixto(): CurrentActor {
  // Lider en A, integrante en B: ve A y B (union de grants, sin filtrar rol).
  return {
    userId: 'um',
    name: 'Mixto',
    identifier: 'mixto@demo.local',
    grants: [
      grantFor('A', RoleCode.LIDER_PROCESO),
      grantFor('B', RoleCode.INTEGRANTE),
    ],
    roleCodes: new Set([RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(['A', 'B']),
    isJefeArea: false,
    isAdmin: false,
  };
}

const PERIOD = { from: '2025-03-01', to: '2025-04-01' };

describe('AreaControlService', () => {
  let service: AreaControlService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new AreaControlService(m.prisma, m.state, m.scope);
    // Defaults vacios para los indicadores no bajo prueba.
    (m.prismaObj.request as any).findMany.mockResolvedValue([]);
    (m.prismaObj.request as any).count.mockResolvedValue(0);
    (m.prismaObj.task as any).findMany.mockResolvedValue([]);
    (m.prismaObj.issue as any).findMany.mockResolvedValue([]);
    (m.prismaObj.auditEvent as any).findFirst.mockResolvedValue(null);
    (m.prismaObj.auditEvent as any).findMany.mockResolvedValue([]);
  });

  // --- 2.1 Tiempo de evaluacion -------------------------------------------

  describe('tiempo de evaluacion', () => {
    it('mediana sobre decisiones del periodo + pendientes siempre presentes', async () => {
      // Request con triage: 2 dias y 4 dias -> mediana (par) round((2+4)/2)=3.
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([
          {
            registeredAt: new Date('2025-03-01T00:00:00.000Z'),
            triages: [{ decidedAt: new Date('2025-03-03T00:00:00.000Z') }],
          },
          {
            registeredAt: new Date('2025-03-10T00:00:00.000Z'),
            triages: [{ decidedAt: new Date('2025-03-14T00:00:00.000Z') }],
          },
        ])
        .mockResolvedValue([]);
      (m.prismaObj.request as any).count.mockResolvedValueOnce(5);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.evaluationTime.medianDays).toBe(3);
      expect(res.evaluationTime.sampleSize).toBe(2);
      expect(res.evaluationTime.pendingCount).toBe(5);
      expect(res.evaluationTime.status.applicable).toBe(true);
    });

    it('muestra vacia -> No aplica, pero pendingCount se reporta (0 valido)', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      (m.prismaObj.request as any).count.mockResolvedValue(0);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.evaluationTime.medianDays).toBeNull();
      expect(res.evaluationTime.status.applicable).toBe(false);
      expect(res.evaluationTime.status.reason).toBe('Sin casos en el periodo');
      expect(res.evaluationTime.pendingCount).toBe(0);
    });

    it('descarta triage sin decidedAt y triage decidido fuera del periodo', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([
          // Sin decidedAt en el triage -> se salta.
          {
            registeredAt: new Date('2025-03-01T00:00:00.000Z'),
            triages: [{ decidedAt: null }],
          },
          // decidedAt fuera del periodo (antes de from) -> se salta.
          {
            registeredAt: new Date('2025-02-20T00:00:00.000Z'),
            triages: [{ decidedAt: new Date('2025-02-25T00:00:00.000Z') }],
          },
          // Valido dentro del periodo: 2 dias.
          {
            registeredAt: new Date('2025-03-01T00:00:00.000Z'),
            triages: [{ decidedAt: new Date('2025-03-03T00:00:00.000Z') }],
          },
        ])
        .mockResolvedValue([]);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.evaluationTime.sampleSize).toBe(1);
      expect(res.evaluationTime.medianDays).toBe(2);
    });

    it('descarta dias negativos (dato sucio) de la mediana', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([
          {
            registeredAt: new Date('2025-03-10T00:00:00.000Z'),
            triages: [{ decidedAt: new Date('2025-03-05T00:00:00.000Z') }], // -5
          },
          {
            registeredAt: new Date('2025-03-01T00:00:00.000Z'),
            triages: [{ decidedAt: new Date('2025-03-07T00:00:00.000Z') }], // 6
          },
        ])
        .mockResolvedValue([]);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.evaluationTime.sampleSize).toBe(1);
      expect(res.evaluationTime.medianDays).toBe(6);
    });
  });

  // --- 2.2 Cumplimiento de hitos ------------------------------------------

  describe('cumplimiento de hitos', () => {
    it('den=0 -> No aplica (NO 0%)', async () => {
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.milestoneCompliance.due).toBe(0);
      expect(res.milestoneCompliance.percentage).toBeNull();
      expect(res.milestoneCompliance.status.applicable).toBe(false);
      expect(res.milestoneCompliance.status.reason).toBe(
        'Sin hitos con vencimiento en el periodo',
      );
    });

    it('cumplido solo si TERMINADA && accepted && acceptedAt <= endDate', async () => {
      const endDate = new Date('2025-03-20T00:00:00.000Z');
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        // Cumplido a tiempo.
        {
          endDate,
          status: 'TERMINADA',
          accepted: true,
          acceptedAt: new Date('2025-03-18T00:00:00.000Z'),
        },
        // Aceptado tarde (acceptedAt > endDate) -> no cuenta.
        {
          endDate,
          status: 'TERMINADA',
          accepted: true,
          acceptedAt: new Date('2025-03-25T00:00:00.000Z'),
        },
        // No aceptado -> no cuenta.
        {
          endDate,
          status: 'TERMINADA',
          accepted: false,
          acceptedAt: null,
        },
        // No terminada -> no cuenta.
        {
          endDate,
          status: 'EN_CURSO',
          accepted: false,
          acceptedAt: null,
        },
      ]);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.milestoneCompliance.due).toBe(4);
      expect(res.milestoneCompliance.met).toBe(1);
      expect(res.milestoneCompliance.percentage).toBe(25);
      expect(res.milestoneCompliance.status.applicable).toBe(true);
    });
  });

  // --- 2.3 Tiempo de entrega ----------------------------------------------

  describe('tiempo de entrega', () => {
    function closedRequest(overrides: Record<string, unknown> = {}) {
      return {
        id: 'r1',
        initialCommitmentDate: new Date('2025-03-01T00:00:00.000Z'),
        governanceRoute: 'COMPLETA',
        approvals: [],
        triages: [{ sizeCode: 'M' }],
        ...overrides,
      };
    }

    it('solo cerradas, cierre via AuditEvent, mediana + desglose por ruta', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([
          closedRequest({ id: 'r1', governanceRoute: 'COMPLETA' }),
          closedRequest({
            id: 'r2',
            governanceRoute: 'SIMPLIFICADA',
            initialCommitmentDate: new Date('2025-03-05T00:00:00.000Z'),
          }),
        ])
        .mockResolvedValue([]); // blocks (requestScope)
      (m.prismaObj.auditEvent as any).findFirst
        .mockResolvedValueOnce({ createdAt: new Date('2025-03-11T00:00:00.000Z') }) // r1: 10 dias
        .mockResolvedValueOnce({ createdAt: new Date('2025-03-11T00:00:00.000Z') }); // r2: 6 dias

      const res = await service.indicators(jefe(), PERIOD);
      // mediana de [10,6] par -> round((6+10)/2)=8
      expect(res.deliveryTime.medianDays).toBe(8);
      expect(res.deliveryTime.count).toBe(2);
      expect(res.deliveryTime.status.applicable).toBe(true);
      const routeKeys = res.deliveryTime.byRoute.map((g) => g.key).sort();
      expect(routeKeys).toEqual(['COMPLETA', 'SIMPLIFICADA']);
    });

    it('sin cerradas medibles -> No aplica', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([]) // deliveryTime: nada cerrado
        .mockResolvedValue([]);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.deliveryTime.medianDays).toBeNull();
      expect(res.deliveryTime.status.applicable).toBe(false);
      expect(res.deliveryTime.status.reason).toBe('Sin casos en el periodo');
    });

    it('cerrada sin compromiso -> unmeasurableClosed, excluida de la mediana', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([
          closedRequest({ id: 'r1', initialCommitmentDate: null, approvals: [] }),
        ])
        .mockResolvedValue([]);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.deliveryTime.unmeasurableClosed).toBe(1);
      expect(res.deliveryTime.count).toBe(0);
      expect(res.deliveryTime.status.applicable).toBe(false);
    });

    it('cerrada con cierre ANTERIOR al compromiso (dias<0) -> unmeasurableClosed', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([
          closedRequest({
            id: 'r1',
            initialCommitmentDate: new Date('2025-03-20T00:00:00.000Z'),
          }),
        ])
        .mockResolvedValue([]);
      // Cierre ANTES del compromiso: daysBetween < 0 -> no medible.
      (m.prismaObj.auditEvent as any).findFirst.mockResolvedValueOnce({
        createdAt: new Date('2025-03-10T00:00:00.000Z'),
      });

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.deliveryTime.unmeasurableClosed).toBe(1);
      expect(res.deliveryTime.count).toBe(0);
    });

    it('agrupa por ruta/complejidad SIN_RUTA/SIN_COMPLEJIDAD cuando faltan', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([
          closedRequest({
            id: 'r1',
            governanceRoute: null,
            triages: [],
          }),
        ])
        .mockResolvedValue([]);
      (m.prismaObj.auditEvent as any).findFirst.mockResolvedValueOnce({
        createdAt: new Date('2025-03-11T00:00:00.000Z'),
      });

      const res = await service.indicators(jefe(), PERIOD);
      const routeKeys = res.deliveryTime.byRoute.map((g) => g.key);
      const complexityKeys = res.deliveryTime.byComplexity.map((g) => g.key);
      expect(routeKeys).toContain('SIN_RUTA');
      expect(complexityKeys).toContain('SIN_COMPLEJIDAD');
    });

    it('compromiso por Approval COMPROMETIDA cuando no hay initialCommitmentDate', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([
          closedRequest({
            id: 'r1',
            initialCommitmentDate: null,
            approvals: [{ decidedAt: new Date('2025-03-01T00:00:00.000Z') }],
          }),
        ])
        .mockResolvedValue([]);
      (m.prismaObj.auditEvent as any).findFirst.mockResolvedValueOnce({
        createdAt: new Date('2025-03-05T00:00:00.000Z'),
      });

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.deliveryTime.count).toBe(1);
      expect(res.deliveryTime.medianDays).toBe(4);
    });

    it('fallback en memoria cuando el filtro JSON path es rechazado', async () => {
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([closedRequest({ id: 'r1' })])
        .mockResolvedValue([]);
      (m.prismaObj.auditEvent as any).findFirst.mockRejectedValueOnce(
        new Error('json path not supported'),
      );
      (m.prismaObj.auditEvent as any).findMany.mockResolvedValueOnce([
        { createdAt: new Date('2025-03-11T00:00:00.000Z'), after: { operationalState: 'CERRADA' } },
      ]);

      const res = await service.indicators(jefe(), PERIOD);
      expect((m.prismaObj.auditEvent as any).findMany).toHaveBeenCalled();
      expect(res.deliveryTime.count).toBe(1);
      expect(res.deliveryTime.medianDays).toBe(10);
    });
  });

  // --- 2.4 Bloqueos --------------------------------------------------------

  describe('bloqueos', () => {
    it('fusiona Request flag + Issue por causa/origen con dias acumulados', async () => {
      const now = Date.now();
      const fiveDaysAgo = new Date(now - 5 * 86_400_000);
      const threeDaysAgo = new Date(now - 3 * 86_400_000);
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([]) // deliveryTime
        .mockResolvedValueOnce([
          { blockedAt: fiveDaysAgo, blockedReason: 'Espera de datos' },
        ]); // blocks requestScope
      (m.prismaObj.issue as any).findMany.mockResolvedValue([
        { date: threeDaysAgo, title: 'Dependencia externa' },
      ]);

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.blocks.blockedRequests).toBe(1);
      expect(res.blocks.openBlockingIssues).toBe(1);
      expect(res.blocks.status.applicable).toBe(true);
      const req = res.blocks.byCause.find((c) => c.origin === 'REQUEST_FLAG');
      const iss = res.blocks.byCause.find((c) => c.origin === 'ISSUE');
      expect(req).toMatchObject({ cause: 'Espera de datos', count: 1 });
      expect(req!.accumulatedDays).toBeGreaterThanOrEqual(5);
      expect(iss).toMatchObject({ cause: 'Dependencia externa', count: 1 });
      expect(iss!.accumulatedDays).toBeGreaterThanOrEqual(3);
    });

    it('acumula dos Request con la misma causa/origen y blockedAt null aporta 0 dias', async () => {
      const now = Date.now();
      const fiveDaysAgo = new Date(now - 5 * 86_400_000);
      (m.prismaObj.request as any).findMany
        .mockResolvedValueOnce([]) // evaluationTime
        .mockResolvedValueOnce([]) // deliveryTime
        .mockResolvedValueOnce([
          // Misma causa/sin causa: se fusionan en una sola entrada (count 2).
          { blockedAt: fiveDaysAgo, blockedReason: null },
          { blockedAt: null, blockedReason: null },
        ]); // blocks requestScope

      const res = await service.indicators(jefe(), PERIOD);
      expect(res.blocks.blockedRequests).toBe(2);
      const req = res.blocks.byCause.find((c) => c.origin === 'REQUEST_FLAG');
      // Fusionadas: una sola entrada con count 2 y 'Sin causa registrada'.
      expect(req).toMatchObject({ cause: 'Sin causa registrada', count: 2 });
      // La fila con blockedAt null aporta 0; la de 5 dias aporta >=5.
      expect(req!.accumulatedDays).toBeGreaterThanOrEqual(5);
    });

    it('cero bloqueos -> applicable:true con conteos 0 (NO No aplica)', async () => {
      const res = await service.indicators(jefe(), PERIOD);
      expect(res.blocks.blockedRequests).toBe(0);
      expect(res.blocks.openBlockingIssues).toBe(0);
      expect(res.blocks.byCause).toEqual([]);
      expect(res.blocks.status.applicable).toBe(true);
    });

    it('Issue abierta = state NOT IN (COMPLETADO, ARCHIVADO) via record-state', async () => {
      await service.indicators(jefe(), PERIOD);
      const issueWhere = (m.prismaObj.issue as any).findMany.mock.calls[0][0]
        .where.AND;
      expect(issueWhere).toContainEqual({ typeCode: 'BLOQUEO' });
      expect(issueWhere).toContainEqual({
        state: { notIn: ['COMPLETADO', 'ARCHIVADO'] },
      });
    });
  });

  // --- 2.5-2.7 Futuros -----------------------------------------------------

  describe('indicadores de dato futuro', () => {
    it('los 3 futuros -> applicable:false con reason y futureDataNote (NUNCA 0)', async () => {
      const res = await service.indicators(jefe(), PERIOD);
      for (const future of [res.failedChanges, res.recovery, res.adoptionValue]) {
        expect(future.status.applicable).toBe(false);
        expect(future.status.reason).toBeTruthy();
        expect(future.status.futureDataNote).toBeTruthy();
      }
      expect(res.failedChanges.status.reason).toContain('dato futuro');
    });
  });

  // --- Alcance -------------------------------------------------------------

  describe('alcance en el where', () => {
    it('jefe -> requestScope where = {}', async () => {
      await service.indicators(jefe(), PERIOD);
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({});
    });

    it('no-jefe -> mainProcessId in scopedProcessIds (sin filtrar por rol)', async () => {
      await service.indicators(lider(['p1']), PERIOD);
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ mainProcessId: { in: ['p1'] } });
    });

    it('actor mixto (lider A + integrante B) ve A y B (union de grants)', async () => {
      await service.indicators(mixto(), PERIOD);
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.AND[0].mainProcessId.in.sort()).toEqual(['A', 'B']);
    });
  });

  // --- 3. Panorama de demanda ---------------------------------------------

  describe('demandSummary', () => {
    it('byState incluye TODOS los estados (incl. 0) y byPriorityBand separa SIN_PRIORIZAR', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValueOnce([
        {
          id: 'r1',
          operationalState: 'REGISTRADA',
          blockedAt: null,
          blockedResolvedAt: null,
        },
        {
          id: 'r2',
          operationalState: 'CERRADA',
          blockedAt: new Date(),
          blockedResolvedAt: null,
        },
      ]);
      (m.state.currentPriorityEvaluation as jest.Mock)
        .mockResolvedValueOnce(null) // r1 -> SIN_PRIORIZAR
        .mockResolvedValueOnce({ score: 85 }); // r2 -> P1
      (m.state.priorityBand as jest.Mock).mockReturnValue('P1');

      const res = await service.demandSummary(jefe(), PERIOD);
      expect(res.total).toBe(2);
      expect(res.blockedActive).toBe(1);
      // Todos los estados presentes.
      const registrada = res.byState.find((s) => s.state === 'REGISTRADA');
      const enTriage = res.byState.find((s) => s.state === 'EN_TRIAGE');
      expect(registrada!.count).toBe(1);
      expect(enTriage!.count).toBe(0);
      // Bandas: SIN_PRIORIZAR separado de P1.
      const sinPriorizar = res.byPriorityBand.find(
        (b) => b.band === 'SIN_PRIORIZAR',
      );
      const p1 = res.byPriorityBand.find((b) => b.band === 'P1');
      expect(sinPriorizar!.count).toBe(1);
      expect(p1!.count).toBe(1);
    });

    it('Request de proceso ajeno NO aparece: el where usa el alcance del lider', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValueOnce([]);
      await service.demandSummary(lider(['p1']), PERIOD);
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where).toEqual({ mainProcessId: { in: ['p1'] } });
    });
  });
});
