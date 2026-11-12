import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { RequestStateService } from '../request/request-state.service';
import { PortfolioScopeService } from './portfolio-scope.service';
import {
  computeDueAlert,
  computeProgressPercent,
  computeSchedule,
  dueSoonDaysFromEnv,
  type TaskProgressInput,
} from './progress';
import { ListPortfolioDto, NO_PROCESS_SENTINEL } from './dto/list-portfolio.dto';
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';

/** Eco de una fecha como `YYYY-MM-DD` en UTC o null. */
function toIsoDate(date: Date | null): string | null {
  if (date === null) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Listado del portafolio (design §5.3), read-only. Alcance de lectura via
 * `PortfolioScopeService` (delega en el alcance compartido de solicitudes: jefe y líder todas; integrante sus procesos más las que creó).
 * Los filtros INTERSECTAN con el alcance, nunca lo amplian. La banda se resuelve
 * post-query sobre la evaluacion vigente (no es columna); "comprometida" solo
 * por `operationalState` explicito.
 */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: RequestStateService,
    private readonly scope: PortfolioScopeService,
  ) {}

  async list(
    actor: CurrentActor,
    filters: ListPortfolioDto,
  ): Promise<PortfolioItemResponseDto[]> {
    const where: Prisma.RequestWhereInput = {
      AND: [this.scope.requestScope(actor)],
    };
    const and = where.AND as Prisma.RequestWhereInput[];

    // Filtros que INTERSECTAN el alcance (se suman al AND, no lo amplian). OR
    // dentro de cada filtro, AND entre filtros. El centinela SIN_PROCESO se
    // combina en OR con los UUID (mainProcessId IN (uuids) OR IS NULL).
    const processFilter = filters.mainProcessId;
    if (processFilter !== undefined && processFilter.length > 0) {
      const uuids = processFilter.filter((id) => id !== NO_PROCESS_SENTINEL);
      const includeNull = uuids.length !== processFilter.length;
      const branches: Prisma.RequestWhereInput[] = [];
      if (uuids.length > 0) {
        branches.push({ mainProcessId: { in: uuids } });
      }
      if (includeNull) {
        branches.push({ mainProcessId: null });
      }
      and.push(branches.length === 1 ? branches[0] : { OR: branches });
    }
    if (filters.state !== undefined && filters.state.length > 0) {
      and.push({ operationalState: { in: filters.state } });
    }
    const bandFilter =
      filters.band !== undefined && filters.band.length > 0
        ? new Set<string>(filters.band)
        : null;

    const requests = await this.prisma.request.findMany({
      where,
      orderBy: [{ registeredAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        code: true,
        title: true,
        mainProcessId: true,
        operationalState: true,
        governanceRoute: true,
        functionalOwner: true,
        registeredAt: true,
        targetDate: true,
        initialCommitmentDate: true,
        blockedAt: true,
        blockedResolvedAt: true,
        blockedReason: true,
        mainProcess: { select: { code: true, name: true } },
      },
    });

    // Evaluaciones de prioridad vigentes en UNA sola consulta en lote (antes
    // 1+N: un currentPriorityEvaluation por request). Mismo criterio de vigencia
    // que RequestStateService.currentPriorityEvaluation (design §11 D4: la ultima
    // por `evaluatedAt`). Al venir ordenadas desc por `evaluatedAt`, la PRIMERA
    // aparicion por `requestId` es la vigente; se conservan solo esas en el Map.
    const requestIds = requests.map((req) => req.id);
    const evaluations = await this.prisma.priorityEvaluation.findMany({
      where: { requestId: { in: requestIds } },
      orderBy: { evaluatedAt: 'desc' },
    });
    const currentEvaluationByRequest = new Map<string, { score: number }>();
    for (const evaluation of evaluations) {
      if (!currentEvaluationByRequest.has(evaluation.requestId)) {
        currentEvaluationByRequest.set(evaluation.requestId, {
          score: evaluation.score,
        });
      }
    }

    // Avance: tareas de todos los planes en alcance, en una sola consulta.
    const tasks = await this.prisma.task.findMany({
      where: { phase: { plan: { requestId: { in: requestIds } } } },
      select: {
        status: true,
        progress: true,
        endDate: true,
        phase: { select: { plan: { select: { requestId: true } } } },
      },
    });
    const tasksByRequest = new Map<string, TaskProgressInput[]>();
    // Pronóstico de fin: la mayor fecha fin entre las tareas sin terminar.
    const forecastByRequest = new Map<string, Date>();
    for (const task of tasks) {
      const key = task.phase.plan.requestId;
      const list = tasksByRequest.get(key) ?? [];
      list.push({ status: task.status, progress: task.progress });
      tasksByRequest.set(key, list);
      if (task.status !== 'TERMINADA' && task.endDate !== null) {
        const current = forecastByRequest.get(key);
        if (current === undefined || task.endDate > current) {
          forecastByRequest.set(key, task.endDate);
        }
      }
    }

    // Plan por solicitud: define si ya hay compromiso de entrega (plan AUTORIZADO)
    // y cuál es su línea base.
    const plans = await this.prisma.plan.findMany({
      where: { requestId: { in: requestIds } },
      select: {
        requestId: true,
        status: true,
        baselineDate: true,
        commitmentDate: true,
        periodEnd: true,
      },
    });
    const planByRequest = new Map(plans.map((plan) => [plan.requestId, plan]));
    const today = new Date();
    const dueSoonDays = dueSoonDaysFromEnv(process.env.PORTFOLIO_DUE_SOON_DAYS);

    const items: PortfolioItemResponseDto[] = [];
    for (const req of requests) {
      // La fecha objetivo es una expectativa del solicitante; el vencimiento se
      // mide contra el compromiso del plan autorizado y, sin plan, contra ella.
      const plan = planByRequest.get(req.id) ?? null;
      const schedule = computeSchedule({
        targetDate: req.targetDate,
        planAuthorized: plan?.status === 'AUTORIZADO',
        baselineDate:
          plan === null ? null : (plan.baselineDate ?? plan.commitmentDate ?? plan.periodEnd),
        forecastDate: forecastByRequest.get(req.id) ?? null,
      });
      const alert = computeDueAlert(
        schedule.referenceDate,
        req.operationalState,
        today,
        dueSoonDays,
      );
      // Banda post-query sobre la evaluacion vigente: null si SIN_PRIORIZAR; el
      // helper priorityBand nunca devuelve null (solo se llama si hay score).
      const evaluation = currentEvaluationByRequest.get(req.id) ?? null;
      const hasEvaluation = evaluation !== null;
      const priorityBand = hasEvaluation
        ? this.state.priorityBand(evaluation.score)
        : null;
      const priorityLabel = hasEvaluation
        ? this.state.priorityLabel(evaluation.score)
        : null;
      const currentScore = hasEvaluation ? evaluation.score : null;

      // El filtro de banda intersecta el alcance tras resolver la vigente.
      if (bandFilter !== null) {
        const effectiveBand = priorityBand ?? 'SIN_PRIORIZAR';
        if (!bandFilter.has(effectiveBand)) {
          continue;
        }
      }

      items.push({
        id: req.id,
        code: req.code,
        title: req.title,
        mainProcessId: req.mainProcessId,
        mainProcessCode: req.mainProcess?.code ?? null,
        mainProcessName: req.mainProcess?.name ?? null,
        operationalState: req.operationalState,
        priorityBand,
        priorityLabel,
        currentScore,
        governanceRoute: req.governanceRoute,
        responsibleName: req.functionalOwner,
        registeredAt: toIsoDate(req.registeredAt) ?? '',
        targetDate: toIsoDate(req.targetDate),
        initialCommitmentDate: toIsoDate(req.initialCommitmentDate),
        progressPercent: computeProgressPercent(tasksByRequest.get(req.id) ?? []),
        dueStatus: alert.dueStatus,
        daysToTarget: alert.daysToTarget,
        referenceDate: toIsoDate(schedule.referenceDate),
        referenceSource: schedule.referenceSource,
        forecastDate: toIsoDate(schedule.forecastDate),
        requestedGapDays: schedule.requestedGapDays,
        scheduleVarianceDays: schedule.scheduleVarianceDays,
        blocked: req.blockedAt !== null && req.blockedResolvedAt === null,
        blockedReason: req.blockedReason,
      });
    }

    return items;
  }
}
