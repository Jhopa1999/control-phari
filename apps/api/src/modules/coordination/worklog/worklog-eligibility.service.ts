import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestScopeService } from '../../request/request-scope.service';
import { RequestState } from '../../request/request-state';
import { TaskStatus } from '../../plan/task-status';
import { addDaysUTC, dateToString } from '../date';
import {
  WorklogOptionsQueryDto,
  WorklogOptionsResponseDto,
  WorklogProjectOptionDto,
  WorklogTaskOptionDto,
} from './dto/worklog-options.dto';

/**
 * Estados de proyecto (solicitud con plan) en los que se admite imputar trabajo.
 * `BLOQUEADA` no es un estado (es una marca transversal) y no cambia la
 * elegibilidad. CERRADA se admite solo dentro de la ventana de gracia.
 */
export const WORKLOG_ELIGIBLE_STATES: readonly RequestState[] = [
  RequestState.EN_PLANIFICACION,
  RequestState.EN_EJECUCION,
  RequestState.EN_VALIDACION,
  RequestState.LISTA_PARA_LIBERAR,
  RequestState.EN_ESTABILIZACION,
];

/** Maestra (CatalogItem) que guarda el parámetro de la ventana de gracia. */
export const WORKLOG_PARAM_CATALOG = 'WORKLOG_PARAM';
export const CLOSED_GRACE_PARAM_CODE = 'CLOSED_PROJECT_GRACE_DAYS';
/** Valor por defecto si la maestra no existe, está inactiva o su valor no es válido. */
export const DEFAULT_CLOSED_GRACE_DAYS = 7;
const MAX_CLOSED_GRACE_DAYS = 365;

/** Tope de proyectos y de tareas devueltos por `GET /worklog/options`. */
export const WORKLOG_OPTIONS_LIMIT = 200;

const STATE_LABELS: Record<string, string> = {
  REGISTRADA: 'registrado',
  EN_TRIAGE: 'en triage',
  DEVUELTA: 'devuelto',
  RECHAZADA: 'rechazado',
  BACKLOG_PRIORIZADO: 'en backlog priorizado',
  COMPROMETIDA: 'comprometido',
  OPERATIVA: 'operativo',
  RETIRADA: 'retirado',
};

/** Referencia a un proyecto/tarea ya resuelta para validar (lo que cambia). */
export interface ActivityReferences {
  projectRequestId?: string | null;
  taskId?: string | null;
}

/**
 * Regla ÚNICA de qué se puede imputar en un diario. La usan el endpoint de
 * opciones y la validación al guardar una actividad, de modo que la interfaz, el
 * MCP y el asistente no pueden divergir.
 *
 * Proyecto elegible: solicitud en el alcance del actor (RequestScopeService),
 * con plan, en un estado activo (o CERRADA dentro de la ventana de gracia) y
 * cuyo proceso principal o participante es el proceso del diario.
 * Tarea elegible: de un proyecto elegible y, para el integrante, propia.
 * Jefe de área y líder del proceso del diario pueden imputar además tareas ajenas.
 */
@Injectable()
export class WorklogEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestScope: RequestScopeService,
  ) {}

  /** Días de gracia tras el cierre; gestionable desde Maestras (WORKLOG_PARAM). */
  async closedGraceDays(): Promise<number> {
    const item = await this.prisma.catalogItem.findFirst({
      where: {
        catalog: WORKLOG_PARAM_CATALOG,
        code: CLOSED_GRACE_PARAM_CODE,
        active: true,
      },
      select: { label: true },
    });
    const parsed = Number((item?.label ?? '').trim());
    if (
      item &&
      /^\d+$/.test(item.label.trim()) &&
      Number.isInteger(parsed) &&
      parsed <= MAX_CLOSED_GRACE_DAYS
    ) {
      return parsed;
    }
    return DEFAULT_CLOSED_GRACE_DAYS;
  }

  /** El actor puede imputar tareas de otras personas en el diario de `processId`. */
  canImputeOthers(actor: CurrentActor, processId: string): boolean {
    return (
      actor.isJefeArea ||
      actor.grants.some(
        (g) => g.roleCode === RoleCode.LIDER_PROCESO && g.processId === processId,
      )
    );
  }

  /** `where` de proyectos elegibles (alcance + plan + estado/ventana + proceso). */
  projectWhere(
    actor: CurrentActor,
    processId: string,
    date: Date,
    graceDays: number,
  ): Prisma.RequestWhereInput {
    const cutoff = addDaysUTC(date, -graceDays);
    return {
      AND: [
        this.requestScope.requestScope(actor),
        { plan: { isNot: null } },
        {
          OR: [
            { operationalState: { in: [...WORKLOG_ELIGIBLE_STATES] } },
            {
              operationalState: RequestState.CERRADA,
              closedAt: { gte: cutoff },
            },
          ],
        },
        {
          OR: [
            { mainProcessId: processId },
            { participants: { some: { processId } } },
          ],
        },
      ],
    };
  }

  // --- Validación al guardar ----------------------------------------------

  /**
   * Valida las referencias de una actividad PLANIFICADA. `changed` son solo las
   * referencias que el cliente cambia: lo que no cambia se conserva aunque ya no
   * sea elegible (la visibilidad sigue rigiendo en la lectura). Devuelve el
   * proyecto a persistir cuando se deriva de la tarea (D8).
   *
   * Fuera de alcance -> 404; no elegible o incoherente -> 400 con el código visible.
   */
  async validateReferences(
    actor: CurrentActor,
    processId: string,
    date: Date,
    changed: ActivityReferences & { declaredProjectRequestId?: string | null },
    current: ActivityReferences,
  ): Promise<{ derivedProjectRequestId?: string }> {
    const projectChanged = !!changed.projectRequestId;
    const taskChanged = !!changed.taskId;
    if (!projectChanged && !taskChanged) return {};

    const graceDays = await this.closedGraceDays();

    let taskInfo: {
      code: string;
      responsibleUserId: string | null;
      requestId: string;
    } | null = null;
    if (taskChanged) {
      taskInfo = await this.requireTaskInScope(actor, changed.taskId as string);
    }

    // Proyecto efectivo de la actividad tras el cambio.
    const projectId = projectChanged
      ? (changed.projectRequestId as string)
      : taskInfo
        ? taskInfo.requestId
        : (current.projectRequestId ?? null);

    if (projectChanged) {
      await this.assertProjectEligible(
        actor,
        processId,
        date,
        graceDays,
        changed.projectRequestId as string,
      );
    }

    if (taskInfo) {
      // Coherencia tarea-proyecto: si vienen ambos, la tarea es de ese proyecto.
      const declared =
        changed.declaredProjectRequestId ?? changed.projectRequestId ?? null;
      if (declared && declared !== taskInfo.requestId) {
        const [project] = await Promise.all([
          this.prisma.request.findFirst({
            where: { id: declared },
            select: { code: true },
          }),
        ]);
        throw new BadRequestException(
          `La tarea ${taskInfo.code} no pertenece al proyecto ${project?.code ?? declared}.`,
        );
      }
      await this.assertProjectEligible(
        actor,
        processId,
        date,
        graceDays,
        taskInfo.requestId,
      );
      if (
        taskInfo.responsibleUserId !== actor.userId &&
        !this.canImputeOthers(actor, processId)
      ) {
        throw new BadRequestException(
          `La tarea ${taskInfo.code} no está asignada a ti. Solo puedes imputar tus propias tareas.`,
        );
      }
    } else if (projectChanged && current.taskId) {
      // Cambia el proyecto con una tarea conservada: debe seguir siendo de él.
      const task = await this.prisma.task.findFirst({
        where: { id: current.taskId },
        select: { code: true, phase: { select: { plan: { select: { requestId: true } } } } },
      });
      if (task && task.phase.plan.requestId !== projectId) {
        throw new BadRequestException(
          `La tarea ${task.code} no pertenece al proyecto elegido.`,
        );
      }
    }

    if (taskInfo && !projectChanged) {
      return { derivedProjectRequestId: taskInfo.requestId };
    }
    return {};
  }

  private async requireTaskInScope(
    actor: CurrentActor,
    taskId: string,
  ): Promise<{ code: string; responsibleUserId: string | null; requestId: string }> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        phase: { plan: { request: this.requestScope.requestScope(actor) } },
      },
      select: {
        code: true,
        responsibleUserId: true,
        phase: { select: { plan: { select: { requestId: true } } } },
      },
    });
    if (!task) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    return {
      code: task.code,
      responsibleUserId: task.responsibleUserId,
      requestId: task.phase.plan.requestId,
    };
  }

  private async assertProjectEligible(
    actor: CurrentActor,
    processId: string,
    date: Date,
    graceDays: number,
    requestId: string,
  ): Promise<void> {
    const visible = await this.prisma.request.findFirst({
      where: { AND: [{ id: requestId }, this.requestScope.requestScope(actor)] },
      select: {
        code: true,
        operationalState: true,
        closedAt: true,
        mainProcessId: true,
        plan: { select: { id: true } },
        participants: { select: { processId: true } },
      },
    });
    if (!visible) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
    const eligible = await this.prisma.request.findFirst({
      where: {
        AND: [
          { id: requestId },
          this.projectWhere(actor, processId, date, graceDays),
        ],
      },
      select: { id: true },
    });
    if (eligible) return;

    const code = visible.code;
    if (visible.operationalState === RequestState.CERRADA) {
      throw new BadRequestException(
        `El proyecto ${code} está cerrado y ya no admite nuevas actividades.`,
      );
    }
    if (!WORKLOG_ELIGIBLE_STATES.includes(visible.operationalState as RequestState)) {
      const label = STATE_LABELS[visible.operationalState] ?? visible.operationalState;
      throw new BadRequestException(
        `El proyecto ${code} está ${label} y no admite actividades.`,
      );
    }
    if (!visible.plan) {
      throw new BadRequestException(
        `El proyecto ${code} aún no tiene plan y no admite actividades.`,
      );
    }
    throw new BadRequestException(
      `El proyecto ${code} no pertenece al proceso del diario.`,
    );
  }

  // --- Opciones -------------------------------------------------------------

  async listOptions(
    actor: CurrentActor,
    query: WorklogOptionsQueryDto,
  ): Promise<WorklogOptionsResponseDto> {
    const date = query.date
      ? new Date(`${query.date}T00:00:00.000Z`)
      : new Date(`${dateToString(new Date())}T00:00:00.000Z`);
    const graceDays = await this.closedGraceDays();
    const projectWhere = this.projectWhere(actor, query.processId, date, graceDays);
    const others = this.canImputeOthers(actor, query.processId);
    // Jefe: lo decide `scope`; líder del proceso: siempre ve también lo ajeno.
    const showAll = actor.isJefeArea
      ? query.scope === 'all'
      : others;

    const statusFilter: Prisma.TaskWhereInput = query.includeTerminated
      ? {}
      : { status: { not: TaskStatus.TERMINADA } };

    // Proyectos con tareas propias imputables (hasMyTasks).
    const myTasks = await this.prisma.task.findMany({
      where: {
        AND: [
          { responsibleUserId: actor.userId },
          { phase: { plan: { request: projectWhere } } },
          statusFilter,
        ],
      },
      select: { phase: { select: { plan: { select: { requestId: true } } } } },
    });
    const myProjectIds = new Set(myTasks.map((t) => t.phase.plan.requestId));

    const q = query.q?.trim();
    const projectAnd: Prisma.RequestWhereInput[] = [projectWhere];
    if (!showAll) projectAnd.push({ id: { in: Array.from(myProjectIds) } });
    if (q) {
      projectAnd.push({
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const projectRows = await this.prisma.request.findMany({
      where: { AND: projectAnd },
      select: {
        id: true,
        code: true,
        title: true,
        operationalState: true,
        closedAt: true,
      },
      orderBy: { code: 'asc' },
      take: WORKLOG_OPTIONS_LIMIT + 1,
    });

    const taskAnd: Prisma.TaskWhereInput[] = [
      { phase: { plan: { request: projectWhere } } },
      statusFilter,
    ];
    if (!showAll) taskAnd.push({ responsibleUserId: actor.userId });
    if (q) {
      taskAnd.push({
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
          { phase: { name: { contains: q, mode: 'insensitive' } } },
          {
            phase: {
              plan: {
                request: {
                  OR: [
                    { code: { contains: q, mode: 'insensitive' } },
                    { title: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      });
    }
    const taskRows = await this.prisma.task.findMany({
      where: { AND: taskAnd },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        responsibleUserId: true,
        responsible: { select: { name: true } },
        phase: {
          select: {
            name: true,
            order: true,
            plan: {
              select: {
                request: { select: { id: true, code: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: [{ code: 'asc' }],
      take: WORKLOG_OPTIONS_LIMIT + 1,
    });

    const projects: WorklogProjectOptionDto[] = projectRows
      .slice(0, WORKLOG_OPTIONS_LIMIT)
      .map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        state: r.operationalState,
        closedAt: r.operationalState === RequestState.CERRADA ? r.closedAt : null,
        hasMyTasks: myProjectIds.has(r.id),
      }));
    const tasks: WorklogTaskOptionDto[] = taskRows
      .slice(0, WORKLOG_OPTIONS_LIMIT)
      .map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        status: t.status,
        phaseName: t.phase.name,
        requestId: t.phase.plan.request.id,
        requestCode: t.phase.plan.request.code,
        requestTitle: t.phase.plan.request.title,
        isMine: t.responsibleUserId === actor.userId,
        responsibleName: t.responsible?.name ?? null,
      }));

    return {
      projects,
      tasks,
      projectsTruncated: projectRows.length > WORKLOG_OPTIONS_LIMIT,
      tasksTruncated: taskRows.length > WORKLOG_OPTIONS_LIMIT,
    };
  }
}
