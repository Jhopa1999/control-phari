import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { codeSearchConditions, formatTaskCode, reservePlanSequence } from '../visible-code';
import type { TaskModel } from '../../../generated/prisma/models/Task';
import { AuditService } from '../../audit/audit.service';
import { entityRef, withCode } from '../../notification/notification-text';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { PlanStateService } from '../plan-state.service';
import { TaskStatus } from '../task-status';
import { applyMilestoneRule } from './milestone';
import {
  NotificationService,
  NotificationType,
} from '../../notification/notification.service';
import { assertTaskWithinPhase, assertValidRange } from '../date-range';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskProgressDto } from './dto/update-task-progress.dto';
import { AcceptTaskDto } from './dto/accept-task.dto';
import { ListPlanTasksDto } from './dto/list-plan-tasks.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { TaskHistoryEntryDto } from './dto/task-history-entry.dto';
import { collectReferencedIds, diffTaskSnapshots } from './task-history';
import { MyWorkItemDto } from './dto/my-work-item.dto';
import { PendingReviewListDto } from './dto/pending-review-task.dto';
import {
  PENDING_REVIEW_LIMIT,
  hasEvidenceOf,
  isEvidenceRequired,
  pendingReviewWhere,
} from './pending-review';

/**
 * Tarea con sus predecesoras embebidas (para TaskResponseDto).
 */
type TaskWithDeps = TaskModel & {
  responsible: { name: string } | null;
  dependenciesAsDependent: Array<{
    predecessor: { id: string; code: string; title: string; status: string; accepted: boolean };
  }>;
  phase: {
    name: string;
    code: string;
    plan: { requestId: string; request: { title: string; code: string } };
  };
  _count: { evidences: number };
};

/**
 * Relaciones que necesita `toResponse` en una sola consulta (sin N+1):
 * predecesoras directas y fase/solicitud para phaseName, requestId y requestTitle.
 */
const TASK_RESPONSE_INCLUDE = {
  // Nombre real del responsable: se muestra aunque ya no sea elegible para
  // NUEVAS asignaciones (p. ej. su proceso dejó de intervenir en la solicitud).
  responsible: { select: { name: true } },
  dependenciesAsDependent: {
    include: {
      predecessor: { select: { id: true, code: true, title: true, status: true, accepted: true } },
    },
  },
  phase: {
    select: {
      name: true,
      code: true,
      plan: { select: { requestId: true, request: { select: { title: true, code: true } } } },
    },
  },
  // Conteo de archivos de evidencia en la misma consulta (sin N+1).
  _count: { select: { evidences: true } },
} satisfies Prisma.TaskInclude;

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
    private readonly notifications: NotificationService,
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
      code: task.code,
      phaseId: task.phaseId,
      processId: task.processId,
      title: task.title,
      responsibleUserId: task.responsibleUserId,
      responsibleName: task.responsible?.name ?? null,
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
      blockedReason: task.blockedReason,
      evidenceRequired: isEvidenceRequired(task),
      hasEvidence: hasEvidenceOf(task, task._count.evidences),
      phaseName: task.phase.name,
      phaseCode: task.phase.code,
      requestId: task.phase.plan.requestId,
      requestTitle: task.phase.plan.request.title,
      requestCode: task.phase.plan.request.code,
      predecessors: task.dependenciesAsDependent.map((d) => ({
        id: d.predecessor.id,
        code: d.predecessor.code,
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
      startDate: task.startDate,
      endDate: task.endDate,
      estimateHours: task.estimateHours,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      evidenceUrl: task.evidenceUrl,
      frameworkPhaseRequired: task.frameworkPhaseRequired,
      blockedReason: task.blockedReason,
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
      // Coincide con el título o con el ID visible (completo o forma corta T07).
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        ...codeSearchConditions(filters.q),
      ];
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: TASK_RESPONSE_INCLUDE,
    });
    return tasks.map((t) => this.toResponse(t));
  }

  /**
   * Resuelve una tarea por su ID visible (PRY-0012-T07), sin distinguir
   * mayúsculas. Reutiliza `findOne`, así el alcance es idéntico al del detalle
   * por id: si no existe o está fuera de alcance -> 404.
   */
  async findByCode(actor: CurrentActor, code: string): Promise<TaskResponseDto> {
    const normalized = code.trim().toUpperCase();
    const task = await this.prisma.task.findFirst({
      where: { code: normalized },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException(`Tarea "${code}" no encontrada.`);
    }
    return this.findOne(actor, task.id);
  }

  /**
   * Candidatos a responsable de las tareas de un plan: personas con grant activo
   * en alguno de los procesos que intervienen en la Request del plan (decididos
   * en el triage). El front los usa para poblar el desplegable de asignación; el
   * backend impone la misma regla al asignar (fuente de verdad).
   */
  async responsibleCandidates(
    actor: CurrentActor,
    planId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.planState.responsibleCandidates(actor, planId);
  }

  async findOne(actor: CurrentActor, taskId: string): Promise<TaskResponseDto> {
    await this.planState.requireTaskInScope(actor, taskId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      include: TASK_RESPONSE_INCLUDE,
    });
    if (!task) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    return this.toResponse(task);
  }


  /**
   * Traza de cambios de una tarea (de la más reciente a la más antigua), armada
   * con los eventos de auditoría TASK de esa tarea: quién, cuándo y qué campos
   * cambiaron (valor anterior y nuevo). Fase y responsable se devuelven con su
   * nombre. Mismo alcance que el detalle de la tarea.
   */
  async history(actor: CurrentActor, taskId: string): Promise<TaskHistoryEntryDto[]> {
    await this.planState.requireTaskInScope(actor, taskId);

    const events = await this.prisma.auditEvent.findMany({
      where: { objectType: 'TASK', objectId: taskId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, name: true } } },
    });

    const { userIds, phaseIds } = collectReferencedIds(events);
    const [users, phases] = await Promise.all([
      userIds.length > 0
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      phaseIds.length > 0
        ? this.prisma.planPhase.findMany({ where: { id: { in: phaseIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.name]));
    const phaseName = new Map(phases.map((p) => [p.id, p.name]));
    const resolve = (field: string, value: string | null): string | null => {
      if (value === null) return null;
      if (field === 'responsibleUserId') return userName.get(value) ?? 'Usuario desconocido';
      if (field === 'phaseId') return phaseName.get(value) ?? 'Fase eliminada';
      return value;
    };

    return events.map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      action: event.action,
      actorUserId: event.actorUserId,
      actorName: event.actor?.name ?? null,
      changes:
        event.action === 'UPDATE' ? diffTaskSnapshots(event.before, event.after, resolve) : [],
    }));
  }
  async create(
    actor: CurrentActor,
    phaseId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const phase = await this.prisma.planPhase.findFirst({
      where: { id: phaseId },
      select: { id: true, planId: true, name: true, startDate: true, endDate: true },
    });
    if (!phase) {
      throw new NotFoundException(`Fase "${phaseId}" no encontrada.`);
    }
    const { mainProcessId, requestState, requestId } =
      await this.planState.requirePlanByIdInScope(actor, phase.planId);
    this.planState.assertProjectOpen(requestState);

    // Condición dura: el responsable debe pertenecer a un proceso interviniente
    // de la solicitud (RequestParticipant). Fuente de verdad en el backend.
    await this.planState.assertResponsibleInParticipants(
      requestId,
      dto.responsibleUserId,
    );

    const isMilestone = dto.isMilestone ?? false;
    const normalized = applyMilestoneRule({
      isMilestone,
      estimateHours: dto.estimateHours ?? null,
      startDate: dto.startDate !== undefined ? new Date(dto.startDate) : null,
      endDate: dto.endDate !== undefined ? new Date(dto.endDate) : null,
    });
    assertValidRange(normalized.startDate, normalized.endDate, 'tarea');
    assertTaskWithinPhase(
      { start: normalized.startDate, end: normalized.endDate, title: dto.title },
      phase,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      // ID visible: número reservado atómicamente en el contador del plan.
      const { requestCode, first } = await reservePlanSequence(tx, phase.planId, 'task', 1);
      const task = await tx.task.create({
        data: {
          phaseId,
          code: formatTaskCode(requestCode, first),
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

    await this.notifyAssignment(actor, created, requestId);
    return this.findOne(actor, created.id);
  }

  /** ID visible de la solicitud para los textos de notificación (null si falla). */
  private async requestCodeOf(requestId: string): Promise<string | null> {
    try {
      const r = await this.prisma.request.findFirst({
        where: { id: requestId },
        select: { code: true },
      });
      return r?.code ?? null;
    } catch {
      return null;
    }
  }

  /** NOT-01: avisa al responsable cuando se le asigna una tarea. */
  private async notifyAssignment(
    actor: CurrentActor,
    task: { id: string; code?: string; title: string; responsibleUserId: string | null },
    requestId: string,
  ): Promise<void> {
    if (!task.responsibleUserId) return;
    const requestCode = await this.requestCodeOf(requestId);
    await this.notifications.notify({
      userIds: [task.responsibleUserId],
      excludeUserId: actor.userId,
      type: NotificationType.TASK_ASSIGNED,
      title: withCode('Nueva tarea asignada', task.code),
      message: `Se te asignó la tarea ${entityRef(task.code, task.title)}${requestCode ? ` del proyecto ${requestCode}` : ''}.`,
      link: '/mi-trabajo',
      requestId,
    });
  }

  /**
   * NOT-01: cuando la última tarea pendiente del plan queda terminada, avisa a
   * los líderes del proceso y a los jefes del área (puede solicitarse el cierre).
   */
  private async notifyIfPlanCompleted(
    actor: CurrentActor,
    planId: string,
    requestId: string,
    mainProcessId: string | null,
  ): Promise<void> {
    const [total, pending] = await Promise.all([
      this.prisma.task.count({ where: { phase: { planId } } }),
      this.prisma.task.count({
        where: { phase: { planId }, status: { not: TaskStatus.TERMINADA } },
      }),
    ]);
    if (total === 0 || pending > 0) return;
    const request = await this.prisma.request.findFirst({
      where: { id: requestId },
      select: { title: true, code: true },
    });
    const recipients = [
      ...(await this.notifications.processLeaders(mainProcessId)),
      ...(await this.notifications.areaHeadsForProcess(mainProcessId)),
    ];
    await this.notifications.notify({
      userIds: recipients,
      excludeUserId: actor.userId,
      type: NotificationType.PLAN_TASKS_COMPLETED,
      title: withCode('Plan con todas sus tareas completadas', request?.code),
      message: `Todas las tareas de ${entityRef(request?.code, request?.title ?? 'el proyecto')} están terminadas. Ya puede gestionarse su cierre.`,
      link: `/demanda/solicitudes/${encodeURIComponent(requestId)}`,
      requestId,
    });
  }

  async update(
    actor: CurrentActor,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    const { task, mainProcessId, requestState, requestId } =
      await this.planState.requireTaskInScope(actor, taskId);
    this.planState.assertProjectOpen(requestState);

    // Condición dura: si se reasigna responsable, debe pertenecer a un proceso
    // interviniente de la solicitud (RequestParticipant). Fuente de verdad.
    // Conservar al responsable actual no es una asignación nueva: sigue válido
    // aunque su proceso ya no intervenga (se desmarcó en el triage o perdió el grant).
    if (dto.responsibleUserId !== undefined) {
      await this.planState.assertResponsibleInParticipants(
        requestId,
        dto.responsibleUserId,
        task.responsibleUserId,
      );
    }

    const isMilestone = dto.isMilestone ?? task.isMilestone;
    const normalized = applyMilestoneRule({
      isMilestone,
      estimateHours:
        dto.estimateHours !== undefined ? dto.estimateHours : task.estimateHours,
      startDate:
        dto.startDate !== undefined ? new Date(dto.startDate) : task.startDate,
      endDate: dto.endDate !== undefined ? new Date(dto.endDate) : task.endDate,
    });
    assertValidRange(normalized.startDate, normalized.endDate, 'tarea');
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const phase = await this.prisma.planPhase.findFirst({
        where: { id: task.phaseId },
        select: { name: true, startDate: true, endDate: true },
      });
      if (phase) {
        assertTaskWithinPhase(
          {
            start: normalized.startDate,
            end: normalized.endDate,
            title: dto.title ?? task.title,
          },
          phase,
        );
      }
    }

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

    const saved = await this.prisma.$transaction(async (tx) => {
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
      return next;
    });

    if (
      dto.responsibleUserId !== undefined &&
      dto.responsibleUserId !== task.responsibleUserId
    ) {
      await this.notifyAssignment(actor, saved, requestId);
    }
    return this.findOne(actor, task.id);
  }

  async remove(actor: CurrentActor, taskId: string): Promise<void> {
    const { task, mainProcessId, requestState } =
      await this.planState.requireTaskInScope(actor, taskId);
    this.planState.assertProjectOpen(requestState);

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
    const { task, mainProcessId, requestState, requestId, planId } =
      await this.planState.requireTaskInScope(actor, taskId);
    this.planState.assertProjectOpen(requestState);

    // Permiso §2.7/D6: integrante que no es responsable -> 403.
    if (!this.isPlanManager(actor) && task.responsibleUserId !== actor.userId) {
      throw new ForbiddenException(
        'Solo puedes cambiar el estado de tus propias tareas.',
      );
    }

    // El motivo solo tiene sentido al bloquear: fuera de esa transición se
    // rechaza (400) para no ocultar un error del cliente.
    if (dto.blockedReason !== undefined && dto.status !== TaskStatus.BLOQUEADA) {
      throw new BadRequestException(
        'El motivo de bloqueo solo aplica al marcar la tarea como bloqueada.',
      );
    }

    // Regla de cierre (BL-036, Entrega 3): terminar (EN_REVISION -> TERMINADA) y
    // reabrir (TERMINADA -> EN_CURSO) son decisiones de un líder o del jefe de
    // área, incluso sobre la propia tarea. Se evalúa antes que la transición
    // para que el integrante reciba un 403 claro y no un 409 genérico.
    if (!this.isPlanManager(actor)) {
      if (task.status === TaskStatus.EN_REVISION && dto.status === TaskStatus.TERMINADA) {
        throw new ForbiddenException(
          'Solo un líder de proceso o el jefe de área puede terminar una tarea. Envíala a revisión: la aprueba un líder o el jefe de área.',
        );
      }
      if (task.status === TaskStatus.TERMINADA && dto.status === TaskStatus.EN_CURSO) {
        throw new ForbiddenException(
          'Solo un líder de proceso o el jefe de área puede reabrir una tarea terminada.',
        );
      }
    }

    const nextStatus = this.planState.assertTaskTransition(task.status, dto.status);

    // Gate de predecesoras al entrar EN_CURSO (desde POR_HACER o BLOQUEADA).
    if (nextStatus === TaskStatus.EN_CURSO) {
      await this.planState.assertPredecessorsSatisfied(task.id);
    }

    // Requisitos de envío a revisión (todos los roles): avance 100 % y, si la
    // tarea exige evidencia, una nota/enlace o al menos un archivo. Se evalúan
    // con los valores efectivos (los del mismo PATCH o, si no llegan, los guardados).
    if (nextStatus === TaskStatus.EN_REVISION) {
      await this.assertReviewRequirements(task, dto);
    }

    // El motivo vive solo mientras la tarea está BLOQUEADA: se guarda al
    // bloquear (opcional) y se limpia al salir (queda en el historial).
    // `reviewRequestedAt` se fija al entrar a EN_REVISION y se limpia al salir.
    const data: Prisma.TaskUpdateInput = {
      status: nextStatus,
      blockedReason: nextStatus === TaskStatus.BLOQUEADA ? (dto.blockedReason ?? null) : null,
      reviewRequestedAt: nextStatus === TaskStatus.EN_REVISION ? new Date() : null,
    };
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
        before: {
          status: task.status,
          progress: task.progress,
          accepted: task.accepted,
          blockedReason: task.blockedReason,
        },
        after: {
          status: next.status,
          progress: next.progress,
          accepted: next.accepted,
          blockedReason: next.blockedReason,
        },
      });
    });

    if (nextStatus === TaskStatus.TERMINADA && task.status !== TaskStatus.TERMINADA) {
      await this.notifyIfPlanCompleted(actor, planId, requestId, mainProcessId);
    }
    const result = await this.findOne(actor, task.id);
    await this.notifyReviewFlow(actor, task, nextStatus, result.requestTitle, requestId, mainProcessId);
    return result;
  }

  /**
   * Exige, para pasar a EN_REVISION, avance 100 % y la evidencia que la tarea
   * pida. 409 con el detalle de lo que falta (precondición del estado de la tarea).
   */
  private async assertReviewRequirements(
    task: TaskModel,
    dto: UpdateTaskStatusDto,
  ): Promise<void> {
    const progress = dto.progress ?? task.progress;
    const missingProgress = progress < 100;

    let missingEvidence = false;
    if (isEvidenceRequired(task)) {
      const note = dto.evidenceUrl !== undefined ? dto.evidenceUrl : task.evidenceUrl;
      const hasNote = (note ?? '').trim() !== '';
      // Solo se consultan los archivos si la nota no basta (un único count).
      missingEvidence =
        !hasNote && (await this.prisma.taskEvidence.count({ where: { taskId: task.id } })) === 0;
    }

    if (missingProgress && missingEvidence) {
      throw new ConflictException(
        `Para enviar la tarea a revisión falta: avance al 100 % (ahora está en ${progress} %) y evidencia (una nota o enlace, o un archivo).`,
      );
    }
    if (missingProgress) {
      throw new ConflictException(
        `Para enviar la tarea a revisión primero debe estar al 100 % de avance (ahora está en ${progress} %). Registra el avance y vuelve a intentarlo.`,
      );
    }
    if (missingEvidence) {
      throw new ConflictException(
        'Esta tarea exige evidencia para enviarse a revisión: escribe una nota o enlace de evidencia, o sube un archivo.',
      );
    }
  }

  /**
   * Avisos del flujo de revisión (efecto secundario: un fallo nunca revierte el
   * cambio de estado). A líderes/jefes cuando una tarea llega a revisión; al
   * responsable cuando se la aprueban o la devuelven otra persona.
   */
  private async notifyReviewFlow(
    actor: CurrentActor,
    task: TaskModel,
    nextStatus: TaskStatus,
    requestTitle: string,
    requestId: string,
    mainProcessId: string | null,
  ): Promise<void> {
    try {
      const requestCode = await this.requestCodeOf(requestId);
      const taskRef = entityRef(task.code, task.title);
      if (nextStatus === TaskStatus.EN_REVISION) {
        const recipients = [
          ...(await this.notifications.processLeaders(mainProcessId)),
          ...(await this.notifications.areaHeadsForProcess(mainProcessId)),
        ];
        await this.notifications.notify({
          userIds: recipients,
          excludeUserId: actor.userId,
          type: NotificationType.TASK_REVIEW_REQUESTED,
          title: withCode('Tarea por aprobar', task.code),
          message: `${taskRef} de ${entityRef(requestCode, requestTitle)} espera tu aprobación.`,
          link: '/mi-trabajo#por-aprobar',
          requestId,
        });
      } else if (
        task.status === TaskStatus.EN_REVISION &&
        nextStatus === TaskStatus.TERMINADA
      ) {
        await this.notifications.notify({
          userIds: [task.responsibleUserId],
          excludeUserId: actor.userId,
          type: NotificationType.TASK_APPROVED,
          title: withCode('Tarea aprobada', task.code),
          message: `Tu tarea ${taskRef} fue aprobada y quedó terminada.`,
          link: '/mi-trabajo',
          requestId,
        });
      } else if (
        task.status === TaskStatus.EN_REVISION &&
        nextStatus === TaskStatus.EN_CURSO
      ) {
        await this.notifications.notify({
          userIds: [task.responsibleUserId],
          excludeUserId: actor.userId,
          type: NotificationType.TASK_RETURNED,
          title: withCode('Tarea devuelta', task.code),
          message: `${taskRef} volvió a En curso para que la corrijas.`,
          link: '/mi-trabajo',
          requestId,
        });
      }
    } catch {
      // Efecto secundario: nunca revierte la acción de negocio.
    }
  }

  /**
   * Cola «Por aprobar» (BL-036, Entrega 3): tareas EN_REVISION que el actor
   * (jefe o líder) puede aprobar o devolver. Alcance y exclusiones en
   * `pendingReviewWhere` (compartido con el contador del Panel). Orden: las que
   * llevan más tiempo esperando primero; las de `reviewRequestedAt` null (previas
   * al dato) van primero, ordenadas por `updatedAt`. Sin N+1: responsable, fase,
   * solicitud y conteo de archivos vienen en la misma consulta.
   */
  async pendingReview(actor: CurrentActor): Promise<PendingReviewListDto> {
    const where = pendingReviewWhere(actor);
    const [total, tasks] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy: [
          { reviewRequestedAt: { sort: 'asc', nulls: 'first' } },
          { updatedAt: 'asc' },
        ],
        take: PENDING_REVIEW_LIMIT,
        include: {
          responsible: { select: { name: true } },
          phase: {
            select: {
              name: true,
              code: true,
              plan: { select: { requestId: true, request: { select: { title: true, code: true } } } },
            },
          },
          _count: { select: { evidences: true } },
        },
      }),
    ]);

    return {
      total,
      items: tasks.map((task) => ({
        id: task.id,
        code: task.code,
        title: task.title,
        responsibleUserId: task.responsibleUserId,
        responsibleName: task.responsible?.name ?? null,
        requestId: task.phase.plan.requestId,
        requestTitle: task.phase.plan.request.title,
        requestCode: task.phase.plan.request.code,
        phaseName: task.phase.name,
        phaseCode: task.phase.code,
        progress: task.progress,
        evidenceRequired: isEvidenceRequired(task),
        hasEvidence: hasEvidenceOf(task, task._count.evidences),
        endDate: task.endDate,
        isMilestone: task.isMilestone,
        reviewRequestedAt: task.reviewRequestedAt,
        waitingSince: task.reviewRequestedAt ?? task.updatedAt,
        waitingSinceApproximate: task.reviewRequestedAt === null,
      })),
    };
  }

  /**
   * Actualiza solo el avance (0-100) de una tarea, sin cambiar su estado. Mismo
   * permiso que el cambio de estado: jefe/líder, o el integrante responsable.
   * El avance solo se edita mientras la tarea está En curso, Bloqueada o En
   * revisión: en «Por hacer» aún no empezó y en «Terminada» hay que reabrirla.
   */
  async changeProgress(
    actor: CurrentActor,
    taskId: string,
    dto: UpdateTaskProgressDto,
  ): Promise<TaskResponseDto> {
    const { task, mainProcessId, requestState } =
      await this.planState.requireTaskInScope(actor, taskId);
    this.planState.assertProjectOpen(requestState);

    if (!this.isPlanManager(actor) && task.responsibleUserId !== actor.userId) {
      throw new ForbiddenException(
        'Solo puedes cambiar el avance de tus propias tareas.',
      );
    }
    if (
      task.status === TaskStatus.POR_HACER ||
      task.status === TaskStatus.TERMINADA
    ) {
      throw new ConflictException(
        task.status === TaskStatus.POR_HACER
          ? 'La tarea aún no empezó: pásala a «En curso» para registrar su avance.'
          : 'La tarea está terminada: reábrela para cambiar su avance.',
      );
    }
    if (task.progress === dto.progress) {
      return this.findOne(actor, task.id);
    }

    await this.prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: { progress: dto.progress },
      });
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
    const { task, mainProcessId, requestState } =
      await this.planState.requireTaskInScope(actor, taskId);
    this.planState.assertProjectOpen(requestState);

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
      ? { deletedAt: null }
      : { deletedAt: null, mainProcessId: { in: Array.from(actor.scopedProcessIds) } };

    const tasks = await this.prisma.task.findMany({
      where: {
        responsibleUserId: actor.userId,
        phase: { plan: { request: requestWhere } },
      },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        // Conteo de archivos de evidencia en la misma consulta (sin N+1).
        _count: { select: { evidences: true } },
        phase: {
          select: {
            id: true,
            name: true,
            code: true,
            planId: true,
            plan: {
              select: {
                requestId: true,
                commitmentDate: true,
                request: {
                  select: { title: true, code: true, operationalState: true, initialCommitmentDate: true },
                },
              },
            },
          },
        },
      },
    });

    // Predecesoras pendientes de todas las tareas en UNA consulta (sin N+1).
    // Mismo criterio que assertPredecessorsSatisfied: pendiente = no TERMINADA.
    const pendingByTask = new Map<string, Array<{ taskId: string; title: string }>>();
    if (tasks.length > 0) {
      const deps = await this.prisma.taskDependency.findMany({
        where: {
          dependentTaskId: { in: tasks.map((t) => t.id) },
          predecessor: { status: { not: TaskStatus.TERMINADA } },
        },
        select: {
          dependentTaskId: true,
          predecessor: { select: { id: true, title: true } },
        },
      });
      for (const dep of deps) {
        const list = pendingByTask.get(dep.dependentTaskId) ?? [];
        list.push({ taskId: dep.predecessor.id, title: dep.predecessor.title });
        pendingByTask.set(dep.dependentTaskId, list);
      }
      for (const list of pendingByTask.values()) {
        list.sort((a, b) => a.title.localeCompare(b.title, 'es'));
      }
    }

    return tasks.map((task) => ({
      taskId: task.id,
      code: task.code,
      title: task.title,
      status: task.status,
      progress: task.progress,
      isMilestone: task.isMilestone,
      startDate: task.startDate,
      endDate: task.endDate,
      phaseId: task.phase.id,
      phaseName: task.phase.name,
      phaseCode: task.phase.code,
      planId: task.phase.planId,
      requestId: task.phase.plan.requestId,
      requestTitle: task.phase.plan.request.title,
      requestCode: task.phase.plan.request.code,
      pendingPredecessors: pendingByTask.get(task.id) ?? [],
      blockedReason: task.blockedReason,
      evidenceRequired: isEvidenceRequired(task),
      hasEvidence: hasEvidenceOf(task, task._count.evidences),
      requestOperationalState: task.phase.plan.request.operationalState,
      requestCommitmentDate:
        task.phase.plan.commitmentDate ?? task.phase.plan.request.initialCommitmentDate,
    }));
  }
}
