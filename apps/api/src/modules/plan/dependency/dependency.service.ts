import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { TaskDependencyModel } from '../../../generated/prisma/models/TaskDependency';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { PlanStateService } from '../plan-state.service';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { TaskDependencyResponseDto } from './dto/task-dependency-response.dto';
import { reaches } from './cycle';

/**
 * Gestiona las predecesoras de una tarea (design §2.3/§3.3): listar, anadir
 * (validando auto-dependencia, mismo plan, duplicado y ciclos server-side ANTES
 * de persistir) y quitar. Auditoria dentro de la $transaction. Alcance resuelto
 * por PlanStateService (task->phase->plan->request.mainProcessId).
 */
@Injectable()
export class DependencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planState: PlanStateService,
  ) {}

  private snapshot(dep: TaskDependencyModel): Prisma.InputJsonValue {
    return {
      id: dep.id,
      dependentTaskId: dep.dependentTaskId,
      predecessorTaskId: dep.predecessorTaskId,
    };
  }

  async findForTask(
    actor: CurrentActor,
    taskId: string,
  ): Promise<TaskDependencyResponseDto[]> {
    await this.planState.requireTaskInScope(actor, taskId);
    const deps = await this.prisma.taskDependency.findMany({
      where: { dependentTaskId: taskId },
      include: {
        predecessor: { select: { title: true, status: true, accepted: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return deps.map((d) => ({
      id: d.id,
      dependentTaskId: d.dependentTaskId,
      predecessorTaskId: d.predecessorTaskId,
      predecessorTitle: d.predecessor.title,
      predecessorStatus: d.predecessor.status,
      predecessorAccepted: d.predecessor.accepted,
      createdAt: d.createdAt,
    }));
  }

  /**
   * Resuelve el planId de una tarea (via su fase). Devuelve null si no existe.
   */
  private async planIdOfTask(taskId: string): Promise<string | null> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      select: { phase: { select: { planId: true } } },
    });
    return task ? task.phase.planId : null;
  }

  async add(
    actor: CurrentActor,
    dependentTaskId: string,
    dto: AddDependencyDto,
  ): Promise<TaskDependencyResponseDto> {
    const { mainProcessId } = await this.planState.requireTaskInScope(
      actor,
      dependentTaskId,
    );
    const predecessorTaskId = dto.predecessorTaskId;

    // Auto-dependencia -> 400.
    if (dependentTaskId === predecessorTaskId) {
      throw new BadRequestException('Una tarea no puede depender de si misma.');
    }

    // Mismo plan -> 400 si no.
    const dependentPlanId = await this.planIdOfTask(dependentTaskId);
    const predecessorPlanId = await this.planIdOfTask(predecessorTaskId);
    if (predecessorPlanId === null) {
      throw new BadRequestException('La tarea predecesora no existe.');
    }
    if (dependentPlanId !== predecessorPlanId) {
      throw new BadRequestException(
        'Las dependencias solo pueden darse entre tareas del mismo plan.',
      );
    }

    // Duplicado -> 409 (clave compuesta via findUnique, §1.1).
    const duplicate = await this.prisma.taskDependency.findUnique({
      where: {
        task_dependency_unique: { dependentTaskId, predecessorTaskId },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('La dependencia ya existe.');
    }

    // Deteccion de ciclos server-side ANTES de persistir (§2.3): si
    // predecessorTaskId ya alcanza (directa o transitivamente) a dependentTaskId
    // siguiendo las aristas dependent->predecessor, anadir la nueva cerraria un
    // ciclo -> 400.
    await this.assertNoCycle(
      dependentPlanId as string,
      dependentTaskId,
      predecessorTaskId,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const dep = await tx.taskDependency.create({
        data: { dependentTaskId, predecessorTaskId },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'TASK_DEPENDENCY',
        objectId: dep.id,
        scopeProcessId: mainProcessId,
        before: null,
        after: this.snapshot(dep),
      });
      return dep;
    });

    const predecessor = await this.prisma.task.findFirst({
      where: { id: predecessorTaskId },
      select: { title: true, status: true, accepted: true },
    });
    return {
      id: created.id,
      dependentTaskId: created.dependentTaskId,
      predecessorTaskId: created.predecessorTaskId,
      predecessorTitle: predecessor?.title ?? '',
      predecessorStatus: predecessor?.status ?? '',
      predecessorAccepted: predecessor?.accepted ?? false,
      createdAt: created.createdAt,
    };
  }

  async remove(
    actor: CurrentActor,
    dependentTaskId: string,
    predecessorTaskId: string,
  ): Promise<void> {
    const { mainProcessId } = await this.planState.requireTaskInScope(
      actor,
      dependentTaskId,
    );

    const dep = await this.prisma.taskDependency.findUnique({
      where: {
        task_dependency_unique: { dependentTaskId, predecessorTaskId },
      },
    });
    if (!dep) {
      throw new ConflictException('La dependencia no existe.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.taskDependency.delete({ where: { id: dep.id } });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'TASK_DEPENDENCY',
        objectId: dep.id,
        scopeProcessId: mainProcessId,
        before: this.snapshot(dep),
        after: null,
      });
    });
  }

  /**
   * Deteccion de ciclos (design §2.3). Construye el grafo de dependencias del
   * plan (aristas dependent->predecessor) con una sola consulta y hace DFS desde
   * `predecessorTaskId`; si alcanza `dependentTaskId`, la nueva arista cerraria
   * un ciclo -> 400 nombrando las dos tareas. O(V+E) sobre el plan.
   */
  private async assertNoCycle(
    planId: string,
    dependentTaskId: string,
    predecessorTaskId: string,
  ): Promise<void> {
    const rows = await this.prisma.taskDependency.findMany({
      where: { dependent: { phase: { planId } } },
      select: { dependentTaskId: true, predecessorTaskId: true },
    });

    // Aristas dependent->predecessor sobre UUID de BD; delega el DFS en el
    // helper puro compartido (design §6.2). Si `predecessorTaskId` ya alcanza
    // `dependentTaskId`, anadir la arista cerraria un ciclo.
    const edges = rows.map((row) => ({
      dependentRef: row.dependentTaskId,
      predecessorRef: row.predecessorTaskId,
    }));
    if (reaches(edges, predecessorTaskId, dependentTaskId)) {
      throw new BadRequestException(
        `La dependencia crearia un ciclo entre las tareas "${predecessorTaskId}" y "${dependentTaskId}".`,
      );
    }
  }
}
