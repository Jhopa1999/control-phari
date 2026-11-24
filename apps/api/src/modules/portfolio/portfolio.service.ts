import { Injectable, NotFoundException } from '@nestjs/common';
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
import {
  PageResult,
  buildPageResult,
  resolvePage,
  sliceWindow,
} from '../../common/pagination/pagination';
import {
  buildRequestWhere,
  orderByIds,
  pageRequestIds,
} from '../request/request-list-query';
import { ListPortfolioDto, type PortfolioAlert } from './dto/list-portfolio.dto';
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import { PortfolioSummaryQueryDto } from './dto/portfolio-summary-query.dto';
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary-response.dto';
import { PortfolioExecutionResponseDto } from './dto/portfolio-execution-response.dto';

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

/** true si la fila cae en la alerta de la franja (única regla, usada por listado y contadores). */
export function matchesAlert(
  item: Pick<PortfolioItemResponseDto, 'dueStatus' | 'scheduleVarianceDays' | 'blocked'>,
  alert: PortfolioAlert,
): boolean {
  switch (alert) {
    case 'VENCIDA':
      return item.dueStatus === 'VENCIDO';
    case 'PROXIMA':
      return item.dueStatus === 'PROXIMO_A_VENCER';
    case 'CON_DESVIACION':
      return item.scheduleVarianceDays !== null && item.scheduleVarianceDays > 0;
    case 'BLOQUEADA':
      return item.blocked;
  }
}

/** Estado de una fase derivado de sus tareas (la fase no guarda estado propio). */
function phaseStatus(tasks: Array<{ status: string }>): string {
  if (tasks.length === 0) {
    return 'SIN_TAREAS';
  }
  if (tasks.every((task) => task.status === 'TERMINADA')) {
    return 'TERMINADA';
  }
  if (tasks.every((task) => task.status === 'POR_HACER')) {
    return 'POR_HACER';
  }
  return 'EN_CURSO';
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

  /**
   * Página del portafolio. Mismo alcance, filtros, orden y paginación que
   * Solicitudes (`request-list-query.ts`); `q` busca en código y título. La
   * banda se resuelve sobre la evaluación vigente antes de paginar, así el
   * total ya la descuenta.
   */
  async list(
    actor: CurrentActor,
    filters: ListPortfolioDto,
  ): Promise<PageResult<PortfolioItemResponseDto>> {
    const window = resolvePage(filters);
    // Los filtros INTERSECTAN el alcance (AND), nunca lo amplían.
    const where = buildRequestWhere(this.scope.requestScope(actor), filters, {
      searchRequester: false,
    });
    if (filters.alert !== undefined) {
      // La alerta depende de fechas y tareas (no es columna): se resuelve en
      // memoria sobre el alcance filtrado (tope 1000) antes de paginar, así el
      // total ya la descuenta. Se conserva el orden pedido.
      const all = await this.scopedItems(where, filters);
      const matching = all.items.filter((item) =>
        matchesAlert(item, filters.alert as PortfolioAlert),
      );
      return buildPageResult(
        sliceWindow(matching, window),
        matching.length,
        window,
      );
    }
    const { ids, total } = await pageRequestIds(
      this.prisma,
      where,
      filters,
      window,
      (score) => this.state.priorityBand(score),
    );
    const items = await this.itemsFor(ids);
    return buildPageResult(items, total, window);
  }

  /**
   * Contadores de la franja: las filas del alcance filtrado (mismo `where` y
   * banda que el listado, sin `alert` ni paginación, tope 1000) y cuántas caen en
   * cada alerta. Reutiliza `itemsFor`, de modo que cada cifra coincide con el
   * total de `list` con el filtro `alert` correspondiente.
   */
  async summary(
    actor: CurrentActor,
    filters: PortfolioSummaryQueryDto,
  ): Promise<PortfolioSummaryResponseDto> {
    const where = buildRequestWhere(this.scope.requestScope(actor), filters, {
      searchRequester: false,
    });
    const { items, truncated } = await this.scopedItems(where, filters);
    return {
      total: items.length,
      overdue: items.filter((item) => matchesAlert(item, 'VENCIDA')).length,
      dueSoon: items.filter((item) => matchesAlert(item, 'PROXIMA')).length,
      withVariance: items.filter((item) => matchesAlert(item, 'CON_DESVIACION')).length,
      blocked: items.filter((item) => matchesAlert(item, 'BLOQUEADA')).length,
      truncated,
    };
  }

  /**
   * Ejecución de solo lectura de una iniciativa: plan, línea base, pronóstico,
   * desviación, avance y fases con tareas. Alcance único de solicitudes: 404
   * idéntico si no existe o está fuera de alcance.
   */
  async execution(
    actor: CurrentActor,
    id: string,
  ): Promise<PortfolioExecutionResponseDto> {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id }, this.scope.requestScope(actor)] },
      select: { id: true, code: true, targetDate: true },
    });
    if (request === null) {
      throw new NotFoundException('No se encontró la solicitud.');
    }
    // Un plan por solicitud (único `plan_request_unique`).
    const plan = await this.prisma.plan.findFirst({
      where: { requestId: request.id },
      select: {
        status: true,
        baselineDate: true,
        commitmentDate: true,
        periodEnd: true,
        phases: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            order: true,
            startDate: true,
            endDate: true,
            tasks: {
              orderBy: [{ code: 'asc' }],
              select: {
                id: true,
                code: true,
                title: true,
                status: true,
                progress: true,
                startDate: true,
                endDate: true,
                responsible: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (plan === null) {
      return {
        requestId: request.id,
        requestCode: request.code,
        hasPlan: false,
        planStatus: null,
        baselineDate: null,
        forecastDate: null,
        scheduleVarianceDays: null,
        progressPercent: null,
        phases: [],
      };
    }
    const allTasks = plan.phases.flatMap((phase) => phase.tasks);
    let forecast: Date | null = null;
    for (const task of allTasks) {
      if (task.status !== 'TERMINADA' && task.endDate !== null) {
        if (forecast === null || task.endDate > forecast) {
          forecast = task.endDate;
        }
      }
    }
    const authorized = plan.status === 'AUTORIZADO';
    const schedule = computeSchedule({
      targetDate: request.targetDate,
      planAuthorized: authorized,
      baselineDate: plan.baselineDate ?? plan.commitmentDate ?? plan.periodEnd,
      forecastDate: forecast,
    });
    return {
      requestId: request.id,
      requestCode: request.code,
      hasPlan: true,
      planStatus: plan.status,
      baselineDate:
        schedule.referenceSource === 'PLAN' ? toIsoDate(schedule.referenceDate) : null,
      forecastDate: toIsoDate(schedule.forecastDate),
      scheduleVarianceDays: schedule.scheduleVarianceDays,
      progressPercent: computeProgressPercent(allTasks),
      phases: plan.phases.map((phase) => ({
        id: phase.id,
        code: phase.code,
        name: phase.name,
        order: phase.order,
        startDate: toIsoDate(phase.startDate),
        endDate: toIsoDate(phase.endDate),
        status: phaseStatus(phase.tasks),
        progressPercent: computeProgressPercent(phase.tasks),
        tasksTotal: phase.tasks.length,
        tasksDone: phase.tasks.filter((task) => task.status === 'TERMINADA').length,
        tasks: phase.tasks.map((task) => ({
          id: task.id,
          code: task.code,
          title: task.title,
          status: task.status,
          progress: task.progress,
          startDate: toIsoDate(task.startDate),
          endDate: toIsoDate(task.endDate),
          responsibleName: task.responsible?.name ?? null,
        })),
      })),
    };
  }

  /** Filas (hasta 1000) del alcance filtrado, en el orden y con la banda pedidos. */
  private async scopedItems(
    where: Prisma.RequestWhereInput,
    criteria: Pick<ListPortfolioDto, 'band' | 'sort' | 'dir'>,
  ): Promise<{ items: PortfolioItemResponseDto[]; truncated: boolean }> {
    const { ids, total } = await pageRequestIds(
      this.prisma,
      where,
      criteria,
      resolvePage({}),
      (score) => this.state.priorityBand(score),
    );
    return { items: await this.itemsFor(ids), truncated: total > ids.length };
  }

  /** Arma las filas del portafolio de los ids dados, en ese orden. */
  private async itemsFor(ids: string[]): Promise<PortfolioItemResponseDto[]> {
    if (ids.length === 0) {
      return [];
    }
    const loaded = await this.prisma.request.findMany({
      where: { id: { in: ids } },
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
    const requests = orderByIds(ids, loaded);

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
