import {
  BadRequestException,
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
  // El proceso principal puede ser null hasta que el triage lo fije; cuando hay
  // plan la solicitud ya avanzó y lo tiene, pero el tipo lo refleja.
  mainProcessId: string | null;
  requestState: string;
}

/** Tarea resuelta en alcance junto al plan/Request de su cadena. */
export interface TaskInScope {
  task: TaskModel;
  planId: string;
  requestId: string;
  mainProcessId: string | null;
  requestState: string;
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
   * `where` de alcance por proceso principal (design §2.8): jefe de área o líder
   * de proceso sin filtro (ven TODAS las solicitudes); el resto (integrante
   * puro) filtra por los procesos con grant activo.
   */
  private requestScopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea || actor.isLiderProceso) {
      return { deletedAt: null };
    }
    return { deletedAt: null, mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /**
   * Ids de los procesos que intervienen en la Request de un plan
   * (RequestParticipant): el principal más los procesos elegidos en el triage.
   * Fuente de verdad del conjunto de procesos cuyos responsables pueden tomar
   * tareas del plan.
   */
  private async participantProcessIds(requestId: string): Promise<string[]> {
    const participants = await this.prisma.requestParticipant.findMany({
      where: { requestId },
      select: { processId: true },
    });
    return participants.map((p) => p.processId);
  }

  /**
   * Candidatos a responsable de tarea del plan (rediseño demanda): personas con
   * grant activo en alguno de los procesos que intervienen en la Request del
   * plan. El alcance del plan ya se resolvió con `requirePlanByIdInScope`.
   * Devuelve id+name ordenado por nombre; conjunto que el front usa para poblar
   * el desplegable y que el backend impone al asignar.
   */
  async responsibleCandidates(
    actor: CurrentActor,
    planId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const { requestId } = await this.requirePlanByIdInScope(actor, planId);
    const processIds = await this.participantProcessIds(requestId);
    if (processIds.length === 0) {
      return [];
    }
    const grants = await this.prisma.grant.findMany({
      where: { active: true, processId: { in: processIds } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = grants.map((g) => g.userId);
    if (userIds.length === 0) {
      return [];
    }
    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Condición dura (rediseño demanda): un usuario solo puede ser responsable de
   * una tarea si tiene grant activo en alguno de los procesos que intervienen en
   * la Request del plan de esa tarea. Fuente de verdad en el backend: el front
   * solo acota el desplegable. 400 con mensaje accionable si no cumple. No valida
   * si `userId` es null/undefined (no se está asignando responsable).
   */
  async assertResponsibleInParticipants(
    requestId: string,
    userId: string | null | undefined,
    currentResponsibleUserId?: string | null,
  ): Promise<void> {
    if (userId === null || userId === undefined) {
      return;
    }
    // Conservar al responsable actual no es una asignación nueva: se permite
    // aunque su proceso ya no intervenga en la solicitud.
    if (currentResponsibleUserId === userId) {
      return;
    }
    const processIds = await this.participantProcessIds(requestId);
    const grant =
      processIds.length === 0
        ? null
        : await this.prisma.grant.findFirst({
            where: { active: true, userId, processId: { in: processIds } },
            select: { id: true },
          });
    if (!grant) {
      throw new BadRequestException(
        'El responsable debe pertenecer a un proceso interviniente de la solicitud.',
      );
    }
  }

  /**
   * Variante masiva para la importación del plan (que reemplaza todas las
   * tareas): cada usuario debe pertenecer a un proceso interviniente de la
   * solicitud, salvo los que ya eran responsables de tareas del plan
   * (`conservedUserIds`), que se conservan. 400 con la lista de identificadores.
   */
  async assertResponsiblesInParticipants(
    requestId: string,
    users: Array<{ id: string; identifier: string }>,
    conservedUserIds: ReadonlySet<string>,
  ): Promise<void> {
    const pending = users.filter((u) => !conservedUserIds.has(u.id));
    if (pending.length === 0) {
      return;
    }
    const processIds = await this.participantProcessIds(requestId);
    const grants =
      processIds.length === 0
        ? []
        : await this.prisma.grant.findMany({
            where: {
              active: true,
              processId: { in: processIds },
              userId: { in: pending.map((u) => u.id) },
            },
            select: { userId: true },
          });
    const allowed = new Set(grants.map((g) => g.userId));
    const rejected = pending.filter((u) => !allowed.has(u.id));
    if (rejected.length > 0) {
      throw new BadRequestException(
        `Responsables que no pertenecen a un proceso interviniente de la solicitud: ${rejected
          .map((u) => u.identifier)
          .join(', ')}.`,
      );
    }
  }

  /**
   * CIE-01: un proyecto cerrado no admite modificaciones ordinarias de su plan,
   * fases, tareas ni dependencias. Solo la reapertura autorizada lo desbloquea.
   */
  assertProjectOpen(requestState: string): void {
    if (requestState === 'CERRADA') {
      throw new ConflictException(
        'El proyecto está cerrado; no se pueden modificar su plan, fases ni tareas. Solicita su reapertura si es necesario.',
      );
    }
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
      select: { id: true, mainProcessId: true, operationalState: true },
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
      requestState: request.operationalState,
    };
  }

  /**
   * Exige que TODAS las predecesoras directas de `taskId` esten TERMINADA
   * (AC-010). La aceptacion ya no es requisito: el estado Terminada basta. Si
   * alguna no cumple, 409 nombrando la primera dependencia que bloquea.
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
      if (p.status !== TaskStatus.TERMINADA) {
        throw new ConflictException(
          `No se puede iniciar: la predecesora "${p.title}" debe estar terminada ` +
            `(estado actual "${p.status}").`,
        );
      }
    }
  }
}
