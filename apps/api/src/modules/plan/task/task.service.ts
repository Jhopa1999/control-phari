import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { TaskModel } from '../../../generated/prisma/models/Task';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { PlanStateService } from '../plan-state.service';
import { TaskStatus } from '../task-status';
import { applyMilestoneRule } from './milestone';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AcceptTaskDto } from './dto/accept-task.dto';
import { ListPlanTasksDto } from './dto/list-plan-tasks.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { MyWorkItemDto } from './dto/my-work-item.dto';

/**
 * Tarea con sus predecesoras embebidas (para TaskResponseDto).
 */
type TaskWithDeps = TaskModel & {
  dependenciesAsDependent: Array<{
    predecessor: { id: string; title: string; status: string; accepted: boolean };
  }>;
};

/**
 * CRUD de tareas + cambio de estado + aceptacion + "mi trabajo" (design §2.4/
 * §2.7/§3.3). Regla hito, gate de predecesoras, permiso del integrante sobre su
 * propia tarea, y auditoria dentro de la $transaction.
 */
@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planState: PlanStateService,
  ) {}

  private isPlanManager(actor: CurrentActor): boolean {
    return (
      actor.roleCodes.has(RoleCode.JEFE_AREA) ||
      actor.roleCodes.has(RoleCode.LIDER_PROCESO)
    );
  }

  private toResponse(task: TaskWithDeps): TaskResponseDto {
    return {
      id: task.id,
      phaseId: task.phaseId,
      processId: task.processId,
      title: task.title,
      responsibleUserId: task.responsibleUserId,
      startDate: task.startDate,
      endDate: task.endDate,
      estimateHours: task.estimateHours,
      isMilestone: task.isMilestone,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      status: task.status,
      progress: task.progress,
      frameworkPhaseRequired: task.frameworkPhaseRequired,
      accepted: task.accepted,
      acceptedAt: task.acceptedAt,
      acceptedByUserId: task.acceptedByUserId,
      evidenceUrl: task.evidenceUrl,
      predecessors: task.dependenciesAsDependent.map((d) => ({
        id: d.predecessor.id,
        title: d.predecessor.title,
        status: d.predecessor.status,
        accepted: d.predecessor.accepted,
      })),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private snapshot(task: TaskModel): Prisma.InputJsonValue {
    return {
      id: task.id,
      phaseId: task.phaseId,
      title: task.title,
      status: task.status,
      progress: task.progress,
      accepted: task.accepted,
      responsibleUserId: task.responsibleUserId,
      isMilestone: task.isMilestone,
    };
  }

  async findForPlan(
    actor: CurrentActor,
    planId: string,
    filters: ListPlanTasksDto,
  ): Promise<TaskResponseDto[]> {
    await this.planState.requirePlanByIdInScope(actor, planId);

    const where: Prisma.TaskWhereInput = { phase: { planId } };
    if (filters.phaseId !== undefined) where.phaseId = filters.phaseId;
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.mine === 'true') where.responsibleUserId = actor.userId;
    if (filters.q !== undefined && filters.q !== '') {
      where.title = { contains: filters.q, mode: 'insensitive' };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        dependenciesAsDependent: {
          include: {
            predecessor: { select: { id: true, title: true, status: true, accepted: true } },
          },
        },
      },
    });
    return tasks.map((t) => this.toResponse(t as TaskWithDeps));
  }

  async findOne(actor: CurrentActor, taskId: string): Promise<TaskResponseDto> {
    await this.planState.requireTaskInScope(actor, taskId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      include: {
        dependenciesAsDependent: {
          include: {
            predecessor: { select: { id: true, title: true, status: true, accepted: true } },
          },
        },
      },
    });
    if (!task) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    return this.toResponse(task as TaskWithDeps);
  }

  async create(
    actor: CurrentActor,
    phaseId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const phase = await this.prisma.planPhase.findFirst({
      where: { id: phaseId },
      select: { id: true, planId: true },
    });
    if (!phase) {
      throw new NotFoundException(`Fase "${phaseId}" no encontrada.`);
    }
    const { mainProcessId } = await this.planState.requirePlanByIdInScope(
      actor,
      phase.planId,
    );

    const isMilestone = dto.isMilestone ?? false;
    const normalized = applyMilestoneRule({
      isMilestone,
      estimateHours: dto.estimateHours ?? null,
      startDate: dto.startDate !== undefined ? new Date(dto.startDate) : null,
      endDate: dto.endDate !== undefined ? new Date(dto.endDate) : null,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          phaseId,
          title: dto.title,
          isMilestone,
          ...(dto.responsibleUserId !== undefined ? { responsibleUserId: dto.responsibleUserId } : {}),
          ...(dto.processId !== undefined ? { processId: dto.processId } : {}),
          ...(normalized.startDate !== null ? { startDate: normalized.startDate } : {}),
          ...(normalized.endDate !== null ? { endDate: normalized.endDate } : {}),
          ...(normalized.estimateHours !== null ? { estimateHours: normalized.estimateHours } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.acceptanceCriteria !== undefined ? { acceptanceCriteria: dto.acceptanceCriteria } : {}),
          ...(dto.frameworkPhaseRequired !== undefined ? { frameworkPhaseRequired: dto.frameworkPhaseRequired } : {}),
          ...(dto.evidenceUrl !== undefined ? { evidenceUrl: dto.evidenceUrl } : {}),
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'TASK',
        objectId: task.id,
        scopeProcessId: mainProcessId,
        before: null,
        after: this.snapshot(task),
      });
      return task;
    });

    return this.findOne(actor, created.id);
  }

  async update(
    actor: CurrentActor,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    const { task, mainProcessId } = await this.planState.requireTaskInScope(
      actor,
      taskId,
    );

    const isMilestone = dto.isMilestone ?? task.isMilestone;
    const normalized = applyMilestoneRule({
      isMilestone,
      estimateHours:
        dto.estimateHours !== undefined ? dto.estimateHours : task.estimateHours,
      startDate:
        dto.startDate !== undefined ? new Date(dto.startDate) : task.startDate,
      endDate: dto.endDate !== undefined ? new Date(dto.endDate) : task.endDate,
    });

    const data: Prisma.TaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.responsibleUserId !== undefined) {
      data.responsible = { connect: { id: dto.responsibleUserId } };
    }
    if (dto.processId !== undefined) {
      data.process = { connect: { id: dto.processId } };
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.acceptanceCriteria !== undefined) data.acceptanceCriteria = dto.acceptanceCriteria;
    if (dto.frameworkPhaseRequired !== undefined) data.frameworkPhaseRequired = dto.frameworkPhaseRequired;
    if (dto.evidenceUrl !== undefined) data.evidenceUrl = dto.evidenceUrl;
    // Campos afectados por la regla hito.
    if (dto.isMilestone !== undefined) data.isMilestone = isMilestone;
    if (
      dto.isMilestone !== undefined ||
      dto.estimateHours !== undefined ||
      dto.startDate !== undefined ||
      dto.endDate !== undefined
    ) {
      data.estimateHours = normalized.estimateHours;
      data.startDate = normalized.startDate;
      data.endDate = normalized.endDate;
    }

    await this.prisma.$transaction(async (tx) => {
      const next = await tx.task.update({ where: { id: task.id }, data });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'TASK',
        objectId: task.id,
        scopeProcessId: mainProcessId,
        before: this.snapshot(task),
        after: this.snapshot(next),
      });
    });

    return this.findOne(actor, task.id);
  }

  async remove(actor: CurrentActor, taskId: string): Promise<void> {
    const { task, mainProcessId } = await this.planState.requireTaskInScope(
      actor,
      taskId,
    );

    const asPredecessor = await this.prisma.taskDependency.count({
      where: { predecessorTaskId: task.id },
    });
    if (asPredecessor > 0) {
      // D15: no borrar una tarea que es predecesora de otra (no romper aristas).
      throw new ConflictException(
        'No se puede borrar una tarea que es predecesora de otra; quita primero sus dependencias.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: task.id } });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'TASK',
        objectId: task.id,
        scopeProcessId: mainProcessId,
        before: this.snapshot(task),
        after: null,
      });
    });
  }

  /**
   * Cambia el estado de una tarea (design §2.7). Permiso: `task` (los 3 roles),
   * pero el integrante solo su propia tarea (403 si no). Transicion valida; gate
   * de predecesoras al pasar a EN_CURSO. progress/evidenceUrl opcionales.
   */
  async changeStatus(
    actor: CurrentActor,
    taskId: string,
    dto: UpdateTaskStatusDto,
  ): Promise<TaskResponseDto> {
    const { task, mainProcessId } = await this.planState.requireTaskInScope(
      actor,
      taskId,
    );

    // Permiso §2.7/D6: integrante que no es responsable -> 403.
    if (!this.isPlanManager(actor) && task.responsibleUserId !== actor.userId) {
      throw new ForbiddenException(
        'Solo puedes cambiar el estado de tus propias tareas.',
      );
    }

    const nextStatus = this.planState.assertTaskTransition(task.status, dto.status);

    // Gate de predecesoras al entrar EN_CURSO (desde POR_HACER o BLOQUEADA).
    if (nextStatus === TaskStatus.EN_CURSO) {
      await this.planState.assertPredecessorsSatisfied(task.id);
    }

    const data: Prisma.TaskUpdateInput = { status: nextStatus };
    if (dto.progress !== undefined) data.progress = dto.progress;
    if (dto.evidenceUrl !== undefined) data.evidenceUrl = dto.evidenceUrl;

    await this.prisma.$transaction(async (tx) => {
      const next = await tx.task.update({ where: { id: task.id }, data });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'TASK',
        objectId: task.id,
        scopeProcessId: mainProcessId,
        before: { status: task.status, progress: task.progress, accepted: task.accepted },
        after: { status: next.status, progress: next.progress, accepted: next.accepted },
      });
    });

    return this.findOne(actor, task.id);
  }

  /**
   * Acepta/retira la aceptacion de una tarea (design §2.7, D6b). Rol `plan`
   * (jefe/lider, verificado por el controller); precondicion: TERMINADA -> 409
   * si no. Audita UPDATE TASK.
   */
  async accept(
    actor: CurrentActor,
    taskId: string,
    dto: AcceptTaskDto,
  ): Promise<TaskResponseDto> {
    const { task, mainProcessId } = await this.planState.requireTaskInScope(
      actor,
      taskId,
    );

    if (task.status !== TaskStatus.TERMINADA) {
      throw new ConflictException(
        'Solo se puede aceptar una tarea terminada.',
      );
    }

    const data: Prisma.TaskUpdateInput = dto.accepted
      ? { accepted: true, acceptedAt: new Date(), acceptedBy: { connect: { id: actor.userId } } }
      : { accepted: false, acceptedAt: null, acceptedBy: { disconnect: true } };

    await this.prisma.$transaction(async (tx) => {
      const next = await tx.task.update({ where: { id: task.id }, data });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'TASK',
        objectId: task.id,
        scopeProcessId: mainProcessId,
        before: { status: task.status, progress: task.progress, accepted: task.accepted },
        after: { status: next.status, progress: next.progress, accepted: next.accepted },
      });
    });

    return this.findOne(actor, task.id);
  }

  /**
   * "Mi trabajo" (design §3.3, SCR-02): tareas donde el actor es responsable,
   * dentro de alcance, con contexto de plan/Request/fase. Jefe sin filtro de
   * alcance; no-jefe filtra por scopedProcessIds (mainProcessId de la Request).
   */
  async myWork(actor: CurrentActor): Promise<MyWorkItemDto[]> {
    const requestWhere: Prisma.RequestWhereInput = actor.isJefeArea
      ? {}
      : { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };

    const tasks = await this.prisma.task.findMany({
      where: {
        responsibleUserId: actor.userId,
        phase: { plan: { request: requestWhere } },
      },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        phase: {
          select: {
            id: true,
            name: true,
            planId: true,
            plan: {
              select: { requestId: true, request: { select: { title: true } } },
            },
          },
        },
      },
    });

    return tasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      status: task.status,
      progress: task.progress,
      isMilestone: task.isMilestone,
      startDate: task.startDate,
      endDate: task.endDate,
      phaseId: task.phase.id,
      phaseName: task.phase.name,
      planId: task.phase.planId,
      requestId: task.phase.plan.requestId,
      requestTitle: task.phase.plan.request.title,
    }));
  }
}
