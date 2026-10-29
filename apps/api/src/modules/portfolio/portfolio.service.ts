import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { RequestStateService } from '../request/request-state.service';
import { PortfolioScopeService } from './portfolio-scope.service';
import {
  computeDueAlert,
  computeProgressPercent,
  dueSoonDaysFromEnv,
  type TaskProgressInput,
} from './progress';
import { ListPortfolioDto } from './dto/list-portfolio.dto';
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
 * `PortfolioScopeService` (jefe `{}`; resto `mainProcessId ∈ scopedProcessIds`).
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

    // Filtros que INTERSECTAN el alcance (se suman al AND, no lo amplian).
    if (filters.mainProcessId !== undefined) {
      and.push({ mainProcessId: filters.mainProcessId });
    }
    if (filters.state !== undefined) {
      and.push({ operationalState: filters.state });
    }

    const requests = await this.prisma.request.findMany({
      where,
      orderBy: [{ registeredAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
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
        phase: { select: { plan: { select: { requestId: true } } } },
      },
    });
    const tasksByRequest = new Map<string, TaskProgressInput[]>();
    for (const task of tasks) {
      const key = task.phase.plan.requestId;
      const list = tasksByRequest.get(key) ?? [];
      list.push({ status: task.status, progress: task.progress });
      tasksByRequest.set(key, list);
    }
    const today = new Date();
    const dueSoonDays = dueSoonDaysFromEnv(process.env.PORTFOLIO_DUE_SOON_DAYS);

    const items: PortfolioItemResponseDto[] = [];
    for (const req of requests) {
      const alert = computeDueAlert(
        req.targetDate,
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
      if (filters.band !== undefined) {
        const effectiveBand = priorityBand ?? 'SIN_PRIORIZAR';
        if (effectiveBand !== filters.band) {
          continue;
        }
      }

      items.push({
        id: req.id,
        title: req.title,
        mainProcessId: req.mainProcessId,
        mainProcessCode: req.mainProcess.code,
        mainProcessName: req.mainProcess.name,
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
        blocked: req.blockedAt !== null && req.blockedResolvedAt === null,
        blockedReason: req.blockedReason,
      });
    }

    return items;
  }
}
