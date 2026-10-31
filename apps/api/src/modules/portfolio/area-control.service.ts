import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { RecordState } from '../coordination/record-state';
import { REQUEST_STATES } from '../request/request-state';
import { RequestState } from '../request/request-state';
import { RequestStateService } from '../request/request-state.service';
import { PortfolioScopeService } from './portfolio-scope.service';
import { daysBetween, median, percentage } from './indicators';
import { dateToIsoDate, resolvePeriod } from './period';
import { AreaControlQueryDto } from './dto/area-control-query.dto';
import {
  AreaIndicatorsResponseDto,
  AttentionResponseDto,
  BandCountDto,
  BlockCauseDto,
  DeliveryTimeGroupDto,
  DemandSummaryResponseDto,
  FutureIndicatorDto,
} from './dto/area-control-response.dto';

/** Bandas de prioridad del panorama de demanda (incl. SIN_PRIORIZAR). */
const DEMAND_BANDS = ['P1', 'P2', 'P3', 'P4', 'SIN_PRIORIZAR'] as const;

/**
 * Estados "cerrados" (no abiertos) de un Issue bloqueo (design §2.4): un bloqueo
 * esta abierto si su `state` NO esta en estos. Se importan de
 * `coordination/record-state` (RecordState), NO se hardcodea 'TERMINADA' (que no
 * existe en el enum). La columna `state` es texto; se compara por el `code`.
 */
const CLOSED_ISSUE_STATES: string[] = [
  RecordState.COMPLETADO,
  RecordState.ARCHIVADO,
];

/** Etiquetas legibles de ruta de gobierno para el desglose de entrega. */
const ROUTE_LABELS: Record<string, string> = {
  COMPLETA: 'Ruta completa',
  SIMPLIFICADA: 'Ruta simplificada',
  EXPLORACION: 'Ruta de exploracion',
};

/**
 * Indicadores del marco §9 (design §2) y conteos de demanda (design §3),
 * read-only. Replica el patron de alcance de LECTURA via `PortfolioScopeService`
 * (jefe `{}`; resto `mainProcessId ∈ scopedProcessIds`, sin filtrar por rol).
 * Cada indicador sin dato/denominador reporta `applicable:false` con `reason`
 * (y `futureDataNote` en los 3 futuros), nunca `0`; los conteos devuelven el
 * numero real. No escribe en BD ni emite AuditEvent.
 */
@Injectable()
export class AreaControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: RequestStateService,
    private readonly scope: PortfolioScopeService,
  ) {}

  async indicators(
    actor: CurrentActor,
    query: AreaControlQueryDto,
  ): Promise<AreaIndicatorsResponseDto> {
    const period = resolvePeriod(query.from, query.to);
    const requestScope = this.scope.requestScope(actor);

    const [evaluationTime, milestoneCompliance, deliveryTime, blocks] =
      await Promise.all([
        this.evaluationTime(period, requestScope),
        this.milestoneCompliance(actor, period),
        this.deliveryTime(period, requestScope),
        this.blocks(actor),
      ]);

    return {
      periodFrom: dateToIsoDate(period.from),
      periodTo: dateToIsoDate(period.to),
      evaluationTime,
      milestoneCompliance,
      deliveryTime,
      blocks,
      failedChanges: this.futureIndicator(
        'Requiere registrar liberaciones e incidentes/reversiones vinculados (dato futuro)',
        'Falta una entidad "liberacion" con fecha propia y un vinculo tipado incidente/reversion->liberacion para computar el numerador.',
      ),
      recovery: this.futureIndicator(
        'Requiere fecha de restablecimiento y severidad del incidente (dato futuro)',
        'Falta persistir la fecha/hora de restablecimiento y la severidad del incidente para medir la recuperacion por severidad.',
      ),
      adoptionValue: this.futureIndicator(
        'Requiere meta, linea base y medicion de adopcion/valor (dato futuro)',
        'Falta capturar meta, linea base y medicion de valor/adopcion definidas por el dueno funcional.',
      ),
    };
  }

  // --- 2.1 Tiempo de evaluacion -------------------------------------------

  private async evaluationTime(
    period: { from: Date; to: Date },
    requestScope: Prisma.RequestWhereInput,
  ) {
    // Decisiones de triage vigentes con decidedAt en [from, to). El triage es
    // 1:1 efectivo; se toma el mas reciente por Request para la mediana.
    const requestsWithTriage = await this.prisma.request.findMany({
      where: {
        AND: [
          requestScope,
          {
            triages: {
              some: {
                decidedAt: { gte: period.from, lt: period.to },
              },
            },
          },
        ],
      },
      select: {
        registeredAt: true,
        triages: {
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: { decidedAt: true },
        },
      },
    });

    const sample: number[] = [];
    for (const req of requestsWithTriage) {
      const decidedAt = req.triages[0]?.decidedAt;
      if (!decidedAt) {
        continue;
      }
      // Solo decisiones dentro del periodo (el `some` ya lo garantiza para la
      // Request; el triage vigente es el que se decidio en el periodo).
      if (decidedAt < period.from || decidedAt >= period.to) {
        continue;
      }
      const days = daysBetween(req.registeredAt, decidedAt);
      if (days < 0) {
        // Dato sucio: se descarta de la mediana (anomalia, no se incluye).
        continue;
      }
      sample.push(days);
    }

    // Pendientes de decision inicial: sin triage vigente, SIN filtro de periodo.
    const pendingCount = await this.prisma.request.count({
      where: {
        AND: [requestScope, { triages: { none: {} } }],
      },
    });

    const medianDays = median(sample);
    const applicable = medianDays !== null;

    return {
      medianDays,
      pendingCount,
      sampleSize: sample.length,
      status: {
        applicable,
        reason: applicable ? null : 'Sin casos en el periodo',
        futureDataNote: null,
      },
    };
  }

  // --- 2.2 Cumplimiento de hitos ------------------------------------------

  private async milestoneCompliance(
    actor: CurrentActor,
    period: { from: Date; to: Date },
  ) {
    const taskScope = this.scope.taskScope(actor);
    const dueMilestones = await this.prisma.task.findMany({
      where: {
        AND: [
          taskScope,
          { isMilestone: true },
          { endDate: { gte: period.from, lt: period.to } },
        ],
      },
      select: {
        endDate: true,
        status: true,
        accepted: true,
        acceptedAt: true,
      },
    });

    const due = dueMilestones.length;
    let met = 0;
    for (const task of dueMilestones) {
      if (
        task.status === 'TERMINADA' &&
        task.accepted === true &&
        task.acceptedAt !== null &&
        task.endDate !== null &&
        task.acceptedAt <= task.endDate
      ) {
        met += 1;
      }
    }

    const pct = percentage(met, due);
    return {
      percentage: pct.value,
      met,
      due,
      status: {
        applicable: pct.applicable,
        reason: pct.applicable
          ? null
          : 'Sin hitos con vencimiento en el periodo',
        futureDataNote: null,
      },
    };
  }

  // --- 2.3 Tiempo de entrega ----------------------------------------------

  private async deliveryTime(
    period: { from: Date; to: Date },
    requestScope: Prisma.RequestWhereInput,
  ) {
    // Request CERRADA dentro del alcance (el alcance se aplica aqui, NO sobre
    // AuditEvent). Se traen compromiso, ruta y triage vigente (sizeCode).
    const closedRequests = await this.prisma.request.findMany({
      where: {
        AND: [requestScope, { operationalState: 'CERRADA' }],
      },
      select: {
        id: true,
        initialCommitmentDate: true,
        governanceRoute: true,
        approvals: {
          where: { resultingState: 'COMPROMETIDA' },
          orderBy: { decidedAt: 'asc' },
          take: 1,
          select: { decidedAt: true },
        },
        triages: {
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: { sizeCode: true },
        },
      },
    });

    let unmeasurableClosed = 0;
    const globalDays: number[] = [];
    const byRouteDays = new Map<string, number[]>();
    const byComplexityDays = new Map<string, number[]>();

    for (const req of closedRequests) {
      const commitment =
        req.initialCommitmentDate ?? req.approvals[0]?.decidedAt ?? null;
      if (!commitment) {
        unmeasurableClosed += 1;
        continue;
      }

      const closedAt = await this.resolveCloseDate(req.id, period);
      if (!closedAt) {
        // Sin evento de cierre en el periodo: fuera de la muestra del periodo.
        continue;
      }

      const days = daysBetween(commitment, closedAt);
      if (days < 0) {
        unmeasurableClosed += 1;
        continue;
      }

      globalDays.push(days);

      const routeKey = req.governanceRoute ?? 'SIN_RUTA';
      pushToGroup(byRouteDays, routeKey, days);

      const sizeKey = req.triages[0]?.sizeCode ?? 'SIN_COMPLEJIDAD';
      pushToGroup(byComplexityDays, sizeKey, days);
    }

    const medianDays = median(globalDays);
    const applicable = medianDays !== null;

    return {
      medianDays,
      count: globalDays.length,
      unmeasurableClosed,
      byRoute: toGroups(byRouteDays, (key) => ROUTE_LABELS[key] ?? 'Sin ruta'),
      byComplexity: toGroups(byComplexityDays, (key) =>
        key === 'SIN_COMPLEJIDAD' ? 'Sin complejidad' : key,
      ),
      status: {
        applicable,
        reason: applicable ? null : 'Sin casos en el periodo',
        futureDataNote: null,
      },
    };
  }

  /**
   * Fecha de cierre de una Request (design §2.3): el AuditEvent UPDATE/REQUEST
   * mas reciente cuyo `after.operationalState === 'CERRADA'`, dentro del
   * periodo. Usa el filtro JSON por `path`; si el proveedor lo rechaza, cae al
   * fallback en memoria (traer los UPDATE/REQUEST de esa Request y filtrar).
   */
  private async resolveCloseDate(
    requestId: string,
    period: { from: Date; to: Date },
  ): Promise<Date | null> {
    try {
      const event = await this.prisma.auditEvent.findFirst({
        where: {
          objectType: 'REQUEST',
          objectId: requestId,
          action: 'UPDATE',
          after: {
            path: ['operationalState'],
            equals: 'CERRADA',
          },
          createdAt: { gte: period.from, lt: period.to },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      return event?.createdAt ?? null;
    } catch {
      // Fallback en memoria (design §2.3 / context "environment_constraints"):
      // el proveedor rechazo el filtro `path`. Se traen los UPDATE/REQUEST de
      // esta Request en el periodo y se filtra por after.operationalState.
      const events = await this.prisma.auditEvent.findMany({
        where: {
          objectType: 'REQUEST',
          objectId: requestId,
          action: 'UPDATE',
          createdAt: { gte: period.from, lt: period.to },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, after: true },
      });
      for (const event of events) {
        const after = event.after as { operationalState?: unknown } | null;
        if (after && after.operationalState === 'CERRADA') {
          return event.createdAt;
        }
      }
      return null;
    }
  }

  // --- 2.4 Bloqueos --------------------------------------------------------

  private async blocks(actor: CurrentActor) {
    const now = new Date();

    const blockedRequestRows = await this.prisma.request.findMany({
      where: {
        AND: [
          this.scope.requestScope(actor),
          { blockedAt: { not: null } },
          { blockedResolvedAt: null },
        ],
      },
      select: { blockedAt: true, blockedReason: true },
    });

    const openBlockingIssueRows = await this.prisma.issue.findMany({
      where: {
        AND: [
          this.scope.issueScope(actor),
          { typeCode: 'BLOQUEO' },
          { state: { notIn: CLOSED_ISSUE_STATES } },
        ],
      },
      select: { date: true, title: true },
    });

    // Fusion por causa+origen: no se mezcla la semantica de un flag de Request
    // con la de un Issue (origin REQUEST_FLAG | ISSUE).
    const byCauseMap = new Map<string, BlockCauseDto>();
    const accumulate = (
      cause: string,
      origin: 'REQUEST_FLAG' | 'ISSUE',
      days: number,
    ) => {
      const key = `${origin}:${cause}`;
      const current = byCauseMap.get(key);
      if (current) {
        current.count += 1;
        current.accumulatedDays += days;
      } else {
        byCauseMap.set(key, {
          cause,
          origin,
          count: 1,
          accumulatedDays: days,
        });
      }
    };

    for (const req of blockedRequestRows) {
      const cause = req.blockedReason ?? 'Sin causa registrada';
      const days = req.blockedAt ? Math.max(daysBetween(req.blockedAt, now), 0) : 0;
      accumulate(cause, 'REQUEST_FLAG', days);
    }
    for (const issue of openBlockingIssueRows) {
      const cause = issue.title;
      const days = Math.max(daysBetween(issue.date, now), 0);
      accumulate(cause, 'ISSUE', days);
    }

    return {
      blockedRequests: blockedRequestRows.length,
      openBlockingIssues: openBlockingIssueRows.length,
      byCause: Array.from(byCauseMap.values()),
      // Conteo: cero bloqueos es dato legitimo -> applicable SIEMPRE true.
      status: {
        applicable: true,
        reason: null,
        futureDataNote: null,
      },
    };
  }

  // --- 2.5-2.7 Indicadores de dato futuro ---------------------------------

  private futureIndicator(
    reason: string,
    futureDataNote: string,
  ): FutureIndicatorDto {
    return {
      status: {
        applicable: false,
        reason,
        futureDataNote,
      },
    };
  }

  // --- 3. Panorama de demanda ---------------------------------------------

  async demandSummary(
    actor: CurrentActor,
    query: AreaControlQueryDto,
  ): Promise<DemandSummaryResponseDto> {
    // El panorama es un corte "a hoy" del alcance; el periodo se valida (para
    // mantener el contrato comun) pero los conteos son del alcance completo.
    resolvePeriod(query.from, query.to);
    const requestScope = this.scope.requestScope(actor);

    const requests = await this.prisma.request.findMany({
      where: requestScope,
      select: {
        id: true,
        operationalState: true,
        blockedAt: true,
        blockedResolvedAt: true,
      },
    });

    // Conteo por estado: TODOS los RequestState, incl. count=0.
    const stateCounts = new Map<string, number>();
    for (const state of REQUEST_STATES) {
      stateCounts.set(state, 0);
    }
    let blockedActive = 0;
    for (const req of requests) {
      stateCounts.set(
        req.operationalState,
        (stateCounts.get(req.operationalState) ?? 0) + 1,
      );
      if (req.blockedAt !== null && req.blockedResolvedAt === null) {
        blockedActive += 1;
      }
    }

    // Conteo por banda: SIN_PRIORIZAR cuando no hay evaluacion vigente; si hay,
    // priorityBand(score). El helper nunca devuelve null/SIN_PRIORIZAR.
    const bandCounts = new Map<string, number>();
    for (const band of DEMAND_BANDS) {
      bandCounts.set(band, 0);
    }
    for (const req of requests) {
      const evaluation = await this.state.currentPriorityEvaluation(req.id);
      const band =
        evaluation === null
          ? 'SIN_PRIORIZAR'
          : this.state.priorityBand(evaluation.score);
      bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
    }

    const byState = REQUEST_STATES.map((state) => ({
      state,
      count: stateCounts.get(state) ?? 0,
    }));
    const byPriorityBand: BandCountDto[] = DEMAND_BANDS.map((band) => ({
      band,
      count: bandCounts.get(band) ?? 0,
    }));

    return {
      total: requests.length,
      blockedActive,
      byState,
      byPriorityBand,
    };
  }

  // --- 4. Requiere atencion -------------------------------------------------

  /**
   * Conteos accionables del Panel (BL-025), "a hoy" y dentro del alcance del
   * actor. Cada conteo replica el criterio de la mesa a la que enlaza:
   * triage (REGISTRADA), priorizacion (EN_TRIAGE con triage CONTINUAR vigente),
   * aprobacion (BACKLOG_PRIORIZADO) y tareas vencidas.
   */
  async attention(actor: CurrentActor): Promise<AttentionResponseDto> {
    const requestScope = this.scope.requestScope(actor);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [pendingTriage, inTriage, pendingApproval, overdueTasks] =
      await Promise.all([
        this.prisma.request.count({
          where: {
            AND: [requestScope, { operationalState: RequestState.REGISTRADA }],
          },
        }),
        this.prisma.request.findMany({
          where: {
            AND: [requestScope, { operationalState: RequestState.EN_TRIAGE }],
          },
          select: {
            triages: {
              orderBy: { decidedAt: 'desc' },
              take: 1,
              select: { decision: true },
            },
          },
        }),
        this.prisma.request.count({
          where: {
            AND: [
              requestScope,
              { operationalState: RequestState.BACKLOG_PRIORIZADO },
            ],
          },
        }),
        this.prisma.task.count({
          where: {
            AND: [
              this.scope.taskScope(actor),
              { status: { not: 'TERMINADA' } },
              { endDate: { lt: today } },
              {
                phase: {
                  plan: {
                    request: {
                      operationalState: {
                        notIn: [
                          RequestState.CERRADA,
                          RequestState.RETIRADA,
                          RequestState.RECHAZADA,
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
        }),
      ]);

    return {
      pendingTriage,
      readyToPrioritize: inTriage.filter(
        (req) => req.triages[0]?.decision === 'CONTINUAR',
      ).length,
      pendingApproval,
      overdueTasks,
    };
  }
}

/** Acumula un valor en el arreglo de un grupo del mapa (crea si falta). */
function pushToGroup(
  map: Map<string, number[]>,
  key: string,
  value: number,
): void {
  const current = map.get(key);
  if (current) {
    current.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Construye los grupos de desglose (ruta/complejidad) con su mediana y conteo;
 * grupos sin casos no aparecen (el mapa solo tiene claves con datos).
 */
function toGroups(
  map: Map<string, number[]>,
  labelFor: (key: string) => string,
): DeliveryTimeGroupDto[] {
  const groups: DeliveryTimeGroupDto[] = [];
  for (const [key, values] of map.entries()) {
    const medianDays = median(values);
    if (medianDays === null) {
      continue;
    }
    groups.push({
      key,
      label: labelFor(key),
      medianDays,
      count: values.length,
    });
  }
  return groups;
}
