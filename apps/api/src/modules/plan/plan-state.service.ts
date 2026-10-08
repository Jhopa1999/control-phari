import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { PlanModel } from '../../generated/prisma/models/Plan';
import type { TaskModel } from '../../generated/prisma/models/Task';
import { CurrentActor } from '../auth/current-actor';
import { assertPlanTransition, PlanStatus } from './plan-status';
import {
  isTaskStatus,
  isTaskTransitionAllowed,
  TaskStatus,
} from './task-status';

/**
 * Plan resuelto en alcance junto a los datos de la Request que gobierna la
 * auditoria y el alcance (mainProcessId / operationalState).
 */
export interface PlanInScope {
  plan: PlanModel;
  requestId: string;
  mainProcessId: string;
  requestState: string;
}

/** Tarea resuelta en alcance junto al plan/Request de su cadena. */
export interface TaskInScope {
  task: TaskModel;
  planId: string;
  requestId: string;
  mainProcessId: string;
}

/**
 * Helper del modulo plan/ (design §3.2, D13): maquinas de estado de tarea/plan y
 * resolucion de alcance por `request.mainProcessId`. Imita scopeWhere/
 * requireInScope de RequestStateService; NO toca `operationalState` (eso lo hace
 * RequestStateService, reusado por los services). No muta por si mismo.
 */
@Injectable()
export class PlanStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `where` de alcance por proceso principal (design §2.8): jefe sin filtro;
   * no-jefe filtra por los procesos con grant activo.
   */
  private requestScopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /** Valida/resuelve una transicion de tarea (design §1.3). */
  assertTaskTransition(from: string, to: TaskStatus): TaskStatus {
    if (!isTaskStatus(from)) {
      throw new InternalServerErrorException(
        `Estado de tarea "${from}" no es un TaskStatus valido.`,
      );
    }
    if (!isTaskTransitionAllowed(from, to)) {
      throw new ConflictException(
        `No se puede pasar la tarea de "${from}" a "${to}".`,
      );
    }
    return to;
  }

  /** Valida/resuelve una transicion de plan (design §1.4). */
  assertPlanTransition(from: string, to: PlanStatus): PlanStatus {
    return assertPlanTransition(from, to);
  }

  /**
   * Resuelve el plan de una Request dentro del alcance del actor (design §2.8).
   * Precaucion Prisma 7 (§1.1): se usa `findFirst({where:{requestId}})`, NO
   * `findUnique`. 404 si la Request esta fuera de alcance o no tiene plan.
   */
  async requirePlanInScope(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PlanInScope> {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: requestId }, this.requestScopeWhere(actor)] },
      select: { id: true, mainProcessId: true, operationalState: true },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
    const plan = await this.prisma.plan.findFirst({ where: { requestId } });
    if (!plan) {
      throw new NotFoundException(
        `La solicitud "${requestId}" no tiene plan.`,
      );
    }
    return {
      plan,
      requestId: request.id,
      mainProcessId: request.mainProcessId,
      requestState: request.operationalState,
    };
  }

  /**
   * Resuelve un plan por su id dentro del alcance (para endpoints de fase/tarea
   * que reciben :planId). Sube plan->request->mainProcessId. 404 fuera de alcance.
   */
  async requirePlanByIdInScope(
    actor: CurrentActor,
    planId: string,
  ): Promise<PlanInScope> {
    const plan = await this.prisma.plan.findFirst({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException(`Plan "${planId}" no encontrado.`);
    }
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: plan.requestId }, this.requestScopeWhere(actor)] },
      select: { id: true, mainProcessId: true, operationalState: true },
    });
    if (!request) {
      // Fuera de alcance: 404 sin confirmar existencia (design §2.8).
      throw new NotFoundException(`Plan "${planId}" no encontrado.`);
    }
    return {
      plan,
      requestId: request.id,
      mainProcessId: request.mainProcessId,
      requestState: request.operationalState,
    };
  }

  /**
   * Resuelve una tarea subiendo task->phase->plan->request.mainProcessId y
   * comprueba alcance (design §2.8). 404 fuera de alcance o inexistente.
   */
  async requireTaskInScope(
    actor: CurrentActor,
    taskId: string,
  ): Promise<TaskInScope> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      include: { phase: { select: { planId: true } } },
    });
    if (!task) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    const planId = task.phase.planId;
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId },
      select: { requestId: true },
    });
    if (!plan) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: plan.requestId }, this.requestScopeWhere(actor)] },
      select: { id: true, mainProcessId: true },
    });
    if (!request) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    // El include tipa `phase`; se devuelve la tarea sin esa relacion embebida.
    const plainTask: Record<string, unknown> = { ...task };
    delete plainTask.phase;
    return {
      task: plainTask as unknown as TaskModel,
      planId,
      requestId: request.id,
      mainProcessId: request.mainProcessId,
    };
  }

  /**
   * Exige que TODAS las predecesoras directas de `taskId` esten TERMINADA Y
   * accepted (design §2.7, AC-010/033). Si alguna no cumple, 409 nombrando la
   * primera dependencia que bloquea.
   */
  async assertPredecessorsSatisfied(taskId: string): Promise<void> {
    const deps = await this.prisma.taskDependency.findMany({
      where: { dependentTaskId: taskId },
      include: {
        predecessor: { select: { title: true, status: true, accepted: true } },
      },
    });
    for (const dep of deps) {
      const p = dep.predecessor;
      if (p.status !== TaskStatus.TERMINADA || !p.accepted) {
        throw new ConflictException(
          `No se puede iniciar: la predecesora "${p.title}" debe estar terminada y aceptada ` +
            `(estado actual "${p.status}", aceptada: ${p.accepted ? 'si' : 'no'}).`,
        );
      }
    }
  }
}
