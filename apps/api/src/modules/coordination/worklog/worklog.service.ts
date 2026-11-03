import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { DailyLogModel } from '../../../generated/prisma/models/DailyLog';
import type { DailyLogActivityModel } from '../../../generated/prisma/models/DailyLogActivity';
import type { WeeklyReportModel } from '../../../generated/prisma/models/WeeklyReport';
import { AuditService } from '../../audit/audit.service';
import {
  NotificationService,
  NotificationType,
} from '../../notification/notification.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { CoordinationScopeService } from '../coordination-scope.service';
import {
  addDaysUTC,
  dateStringToDate,
  dateToString,
  mondayOf,
} from '../date';
import { CONSOLIDATION_STATES, DailyLogStatus } from '../record-state';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
import { UpdateDailyLogDto } from './dto/update-daily-log.dto';
import { ReturnWorklogDto } from './dto/return-worklog.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CreateWeeklyReportDto } from './dto/create-weekly-report.dto';
import { UpdateWeeklyReportDto } from './dto/update-weekly-report.dto';
import { ListDailyLogsDto } from './dto/list-daily-logs.dto';
import { ListWeeklyReportsDto } from './dto/list-weekly-reports.dto';
import {
  DailyLogSummaryDto,
  PaginatedDailyLogsResponseDto,
} from './dto/daily-log-summary.dto';
import {
  DailyLogActionsDto,
  DailyLogResponseDto,
} from './dto/daily-log-response.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';
import {
  WeeklyConsolidationDto,
  WeeklyReportResponseDto,
} from './dto/weekly-report-response.dto';

/** Actividad con los títulos de lo que referencia (para el mapeo de respuesta). */
type ActivityWithRefs = DailyLogActivityModel & {
  projectRequest?: { title: string } | null;
  task?: { title: string } | null;
  relatedIssue?: { title: string } | null;
};

/** Diario con su autor y sus actividades (para el mapeo de respuesta). */
type DailyLogWithActivities = DailyLogModel & {
  author?: { name: string } | null;
  process?: { name: string } | null;
  reviewer?: { name: string } | null;
  returner?: { name: string } | null;
  activities: ActivityWithRefs[];
};

/** Semanal con autor y revisión (para el mapeo de respuesta). */
type WeeklyReportWithPeople = WeeklyReportModel & {
  author?: { name: string } | null;
  reviewer?: { name: string } | null;
  returner?: { name: string } | null;
};

const WEEKLY_INCLUDE = {
  author: { select: { name: true } },
  reviewer: { select: { name: true } },
  returner: { select: { name: true } },
} satisfies Prisma.WeeklyReportInclude;

/**
 * Relaciones que se cargan siempre con un diario: el nombre del autor y, en cada
 * actividad, el título del proyecto, la tarea y la novedad que referencia. Así la
 * pantalla no tiene que adivinar nombres a partir de ids.
 */
const LOG_INCLUDE = {
  author: { select: { name: true } },
  process: { select: { name: true } },
  reviewer: { select: { name: true } },
  returner: { select: { name: true } },
  activities: {
    orderBy: { createdAt: 'asc' },
    include: {
      projectRequest: { select: { title: true } },
      task: { select: { title: true } },
      relatedIssue: { select: { title: true } },
    },
  },
} satisfies Prisma.DailyLogInclude;

/** Tope de la página de listados (mismo criterio que la auditoría). */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** Al reenviar, se limpia la devolución anterior (el motivo ya fue atendido). */
const CLEAR_RETURN = {
  returnedAt: null,
  returnedByUserId: null,
  returnReason: null,
} as const;

/**
 * Logica de la bitacora de trabajo (design §2.3/§2.4/§2.5): diarios +
 * actividades + semanales. Patron capacity: alcance en el `where` (404 fuera por
 * findFirst), mutacion + AuditEvent en la MISMA `$transaction`, P2002 -> 409.
 * Separacion de conceptos CRITICA (BR-013/023): NO toca Task/Request/Approval/
 * Commitment; las horas son dedicacion. La consolidacion del semanal es lectura
 * pura de los diarios ENVIADO/REVISADO del autor+proceso del semanal objetivo.
 */
@Injectable()
export class WorklogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: CoordinationScopeService,
    private readonly notifications: NotificationService,
  ) {}

  // --- Snapshots de auditoria ---------------------------------------------

  private dailyLogSnapshot(row: DailyLogModel): Prisma.InputJsonValue {
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      processId: row.processId,
      date: dateToString(row.date),
      status: row.status,
      dayNotes: row.dayNotes,
    };
  }

  private activitySnapshot(
    row: DailyLogActivityModel,
  ): Prisma.InputJsonValue {
    return {
      id: row.id,
      dailyLogId: row.dailyLogId,
      classificationCode: row.classificationCode,
      hours: row.hours,
      projectRequestId: row.projectRequestId,
      taskId: row.taskId,
      relatedIssueId: row.relatedIssueId,
      assetRef: row.assetRef,
      requesterRef: row.requesterRef,
      justification: row.justification,
      description: row.description,
      result: row.result,
      activityStatus: row.activityStatus,
      evidenceUrl: row.evidenceUrl,
      nextStep: row.nextStep,
      nextStepDate: row.nextStepDate ? dateToString(row.nextStepDate) : null,
    };
  }

  private weeklyReportSnapshot(
    row: WeeklyReportModel,
  ): Prisma.InputJsonValue {
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      processId: row.processId,
      weekStart: dateToString(row.weekStart),
      status: row.status,
      results: row.results,
      proposals: row.proposals,
      blockers: row.blockers,
      commitmentsText: row.commitmentsText,
      decisions: row.decisions,
    };
  }

  // --- Mapeo a DTOs --------------------------------------------------------

  private toActivityResponse(row: ActivityWithRefs): ActivityResponseDto {
    return {
      id: row.id,
      dailyLogId: row.dailyLogId,
      classificationCode: row.classificationCode,
      hours: row.hours,
      projectRequestId: row.projectRequestId,
      projectRequestTitle: row.projectRequest?.title ?? null,
      taskId: row.taskId,
      taskTitle: row.task?.title ?? null,
      relatedIssueId: row.relatedIssueId,
      relatedIssueTitle: row.relatedIssue?.title ?? null,
      assetRef: row.assetRef,
      requesterRef: row.requesterRef,
      justification: row.justification,
      description: row.description,
      result: row.result,
      activityStatus: row.activityStatus,
      evidenceUrl: row.evidenceUrl,
      nextStep: row.nextStep,
      nextStepDate: row.nextStepDate ? dateToString(row.nextStepDate) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Diario devuelto: borrador con una devolución posterior al último envío. */
  private isReturned(row: DailyLogModel): boolean {
    return (
      row.status === DailyLogStatus.BORRADOR &&
      row.returnedAt !== null &&
      (row.submittedAt === null || row.returnedAt >= row.submittedAt)
    );
  }

  /** Líder del proceso o jefe de área: quienes pueden revisar (nunca el autor). */
  private canReviewRole(actor: CurrentActor, processId: string): boolean {
    return (
      actor.isJefeArea ||
      actor.grants.some(
        (g) =>
          g.roleCode === RoleCode.LIDER_PROCESO && g.processId === processId,
      )
    );
  }

  private dailyLogActions(
    actor: CurrentActor,
    row: DailyLogModel,
  ): DailyLogActionsDto {
    const isAuthor = row.authorUserId === actor.userId;
    const draft = row.status === DailyLogStatus.BORRADOR;
    const sent = row.status === DailyLogStatus.ENVIADO;
    const reviewer = !isAuthor && this.canReviewRole(actor, row.processId);
    return {
      edit: isAuthor && draft,
      delete: isAuthor && draft,
      submit: isAuthor && draft,
      recall: isAuthor && sent,
      review: reviewer && sent,
      return: reviewer && sent,
    };
  }

  private toDailyLogResponse(
    row: DailyLogWithActivities,
    actor: CurrentActor,
  ): DailyLogResponseDto {
    const activities = row.activities.map((a) => this.toActivityResponse(a));
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      authorName: row.author?.name ?? '',
      processId: row.processId,
      processName: row.process?.name ?? '',
      date: dateToString(row.date),
      status: row.status,
      submittedAt: row.submittedAt,
      dayNotes: row.dayNotes,
      totalHours: activities.reduce((sum, a) => sum + a.hours, 0),
      reviewedAt: row.reviewedAt,
      reviewedByName: row.reviewer?.name ?? null,
      returnedAt: row.returnedAt,
      returnedByName: row.returner?.name ?? null,
      returnReason: row.returnReason,
      returned: this.isReturned(row),
      actions: this.dailyLogActions(actor, row),
      activities,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private weeklyActions(
    actor: CurrentActor,
    row: WeeklyReportModel,
  ): DailyLogActionsDto {
    const isAuthor = row.authorUserId === actor.userId;
    const draft = row.status === DailyLogStatus.BORRADOR;
    const sent = row.status === DailyLogStatus.ENVIADO;
    const reviewer = !isAuthor && this.canReviewRole(actor, row.processId);
    return {
      edit: isAuthor && draft,
      delete: false,
      submit: isAuthor && draft,
      recall: false,
      review: reviewer && sent,
      return: reviewer && sent,
    };
  }

  private toWeeklyReportResponse(
    row: WeeklyReportWithPeople,
    consolidation: WeeklyConsolidationDto | null,
    actor: CurrentActor,
  ): WeeklyReportResponseDto {
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      authorName: row.author?.name ?? '',
      processId: row.processId,
      weekStart: dateToString(row.weekStart),
      status: row.status,
      submittedAt: row.submittedAt,
      results: row.results,
      proposals: row.proposals,
      blockers: row.blockers,
      commitmentsText: row.commitmentsText,
      decisions: row.decisions,
      reviewedAt: row.reviewedAt,
      reviewedByName: row.reviewer?.name ?? null,
      returnedAt: row.returnedAt,
      returnedByName: row.returner?.name ?? null,
      returnReason: row.returnReason,
      returned: this.isReturned(row as unknown as DailyLogModel),
      actions: this.weeklyActions(actor, row),
      consolidation,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // --- Validacion de FK en visibilidad (design §1.2/§2.3) -----------------

  /** `projectRequestId` por la visibilidad real de Request (HIGH-2). 404 fuera. */
  private async requireProjectRequestVisible(
    actor: CurrentActor,
    requestId: string,
  ): Promise<void> {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: requestId }, this.scope.requestVisibilityWhere(actor)] },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
  }

  /**
   * `taskId` por traversal `Task -> phase.planId -> Plan.requestId -> Request`
   * (HIGH-1), replicando `requireTaskInScope`: Task NO tiene relacion `request`.
   * 404 en cualquier paso fuera de visibilidad.
   */
  private async requireTaskVisible(
    actor: CurrentActor,
    taskId: string,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      include: { phase: { select: { planId: true } } },
    });
    if (!task) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    const plan = await this.prisma.plan.findFirst({
      where: { id: task.phase.planId },
      select: { requestId: true },
    });
    if (!plan) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    const request = await this.prisma.request.findFirst({
      where: {
        AND: [{ id: plan.requestId }, this.scope.requestVisibilityWhere(actor)],
      },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
  }

  /** `relatedIssueId` por el proceso del diario (MEDIUM-1). 404 fuera. */
  private async requireIssueOfProcess(
    issueId: string,
    processId: string,
  ): Promise<void> {
    const issue = await this.prisma.issue.findFirst({
      where: { id: issueId, processId },
      select: { id: true },
    });
    if (!issue) {
      throw new NotFoundException(`Novedad "${issueId}" no encontrada.`);
    }
  }

  /**
   * Reglas de clasificacion server-side (design §2.3, BR-014/AC-014/015/016) y
   * validacion de FK en visibilidad. `fields` es el estado RESULTANTE de la
   * actividad (merge para PATCH). Fallo de clasificacion -> 400; FK fuera -> 404.
   */
  private async validateActivity(
    actor: CurrentActor,
    processId: string,
    fields: {
      classificationCode: string;
      projectRequestId?: string | null;
      taskId?: string | null;
      relatedIssueId?: string | null;
      assetRef?: string | null;
      requesterRef?: string | null;
      justification?: string | null;
    },
  ): Promise<void> {
    const notEmpty = (v?: string | null): boolean =>
      typeof v === 'string' && v.trim().length > 0;

    switch (fields.classificationCode) {
      case 'PLANIFICADA':
        if (!fields.projectRequestId && !fields.taskId) {
          throw new BadRequestException(
            'Trabajo planificado requiere proyecto o tarea.',
          );
        }
        break;
      case 'SOPORTE':
        if (!notEmpty(fields.assetRef)) {
          throw new BadRequestException('Operación/soporte requiere activo.');
        }
        break;
      case 'EXTRAORDINARIA':
        if (!notEmpty(fields.requesterRef) || !notEmpty(fields.justification)) {
          throw new BadRequestException(
            'Extraordinaria requiere solicitante y justificacion.',
          );
        }
        break;
      case 'INTERNA':
        // Sin referencias obligatorias.
        break;
      default:
        throw new BadRequestException('Clasificacion de actividad invalida.');
    }

    // Visibilidad de FK (solo cuando se informan).
    if (fields.projectRequestId) {
      await this.requireProjectRequestVisible(actor, fields.projectRequestId);
    }
    if (fields.taskId) {
      await this.requireTaskVisible(actor, fields.taskId);
    }
    if (fields.relatedIssueId) {
      await this.requireIssueOfProcess(fields.relatedIssueId, processId);
    }
  }

  // --- Resolucion de alcance ----------------------------------------------

  private async requireDailyLogReadable(
    actor: CurrentActor,
    id: string,
  ): Promise<DailyLogWithActivities> {
    const row = await this.prisma.dailyLog.findFirst({
      where: { AND: [{ id }, this.scope.dailyLogReadWhere(actor)] },
      include: LOG_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Diario "${id}" no encontrado.`);
    }
    return row;
  }

  private async requireDailyLogWritable(
    actor: CurrentActor,
    id: string,
  ): Promise<DailyLogWithActivities> {
    const row = await this.prisma.dailyLog.findFirst({
      where: { AND: [{ id }, this.scope.dailyLogWriteWhere(actor)] },
      include: LOG_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Diario "${id}" no encontrado.`);
    }
    return row;
  }

  /** Resuelve el diario padre de una actividad en alcance de ESCRITURA. */
  private async requireActivityWritable(
    actor: CurrentActor,
    activityId: string,
  ): Promise<{ activity: DailyLogActivityModel; log: DailyLogModel }> {
    const activity = await this.prisma.dailyLogActivity.findFirst({
      where: { id: activityId },
    });
    if (!activity) {
      throw new NotFoundException(`Actividad "${activityId}" no encontrada.`);
    }
    const log = await this.prisma.dailyLog.findFirst({
      where: {
        AND: [{ id: activity.dailyLogId }, this.scope.dailyLogWriteWhere(actor)],
      },
    });
    if (!log) {
      throw new NotFoundException(`Actividad "${activityId}" no encontrada.`);
    }
    return { activity, log };
  }

  /**
   * Un diario solo se modifica mientras es BORRADOR: una vez enviado a revision
   * (o revisado) queda de solo lectura, tal como lo muestra la pantalla. Antes
   * solo lo impedia la interfaz; ahora lo impone el backend (409).
   */
  private assertDailyLogEditable(log: { status: string }): void {
    if (log.status === DailyLogStatus.BORRADOR) return;
    throw new ConflictException(
      log.status === DailyLogStatus.REVISADO
        ? 'El diario ya fue revisado y no se puede modificar.'
        : 'El diario ya fue enviado a revision y no se puede modificar.',
    );
  }

  // --- Diarios: CRUD -------------------------------------------------------

  /**
   * Filtro de diarios: el alcance del actor MAS los filtros de la consulta (los
   * filtros solo estrechan, nunca amplian el alcance).
   */
  private dailyLogFilterWhere(
    actor: CurrentActor,
    filters: ListDailyLogsDto,
  ): Prisma.DailyLogWhereInput {
    const and: Prisma.DailyLogWhereInput[] = [this.scope.dailyLogReadWhere(actor)];
    if (filters.date !== undefined) {
      and.push({ date: dateStringToDate(filters.date) });
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      and.push({
        date: {
          ...(filters.from !== undefined ? { gte: dateStringToDate(filters.from) } : {}),
          ...(filters.to !== undefined ? { lte: dateStringToDate(filters.to) } : {}),
        },
      });
    }
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }
    if (filters.authorUserId !== undefined) {
      and.push({ authorUserId: filters.authorUserId });
    }
    if (filters.status !== undefined) {
      and.push({ status: filters.status });
    }
    if (filters.classificationCode !== undefined) {
      and.push({
        activities: { some: { classificationCode: filters.classificationCode } },
      });
    }
    if (filters.q !== undefined && filters.q !== '') {
      const contains = { contains: filters.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { dayNotes: contains },
          { author: { name: contains } },
          {
            activities: {
              some: {
                OR: [
                  { description: contains },
                  { result: contains },
                  { assetRef: contains },
                  { requesterRef: contains },
                ],
              },
            },
          },
        ],
      });
    }
    return { AND: and };
  }

  async listDailyLogs(
    actor: CurrentActor,
    filters: ListDailyLogsDto,
  ): Promise<PaginatedDailyLogsResponseDto> {
    const where = this.dailyLogFilterWhere(actor, filters);
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const direction = filters.sort === 'date_asc' ? 'asc' : 'desc';

    const [rows, total] = await Promise.all([
      this.prisma.dailyLog.findMany({
        where,
        include: LOG_INCLUDE,
        orderBy: [{ date: direction }, { createdAt: direction }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dailyLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toDailyLogResponse(row, actor)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  /**
   * Resumen de TODOS los diarios en alcance que cumplen el filtro (no solo la
   * pagina visible): totales por estado, actividades y horas, distribucion por
   * clasificacion y resumen por persona. Alimenta la tira de indicadores.
   */
  async summarizeDailyLogs(
    actor: CurrentActor,
    filters: ListDailyLogsDto,
  ): Promise<DailyLogSummaryDto> {
    const rows = await this.prisma.dailyLog.findMany({
      where: this.dailyLogFilterWhere(actor, filters),
      select: {
        authorUserId: true,
        status: true,
        submittedAt: true,
        returnedAt: true,
        author: { select: { name: true } },
        activities: { select: { classificationCode: true, hours: true } },
      },
    });

    const byClass = new Map<string, { activityCount: number; hours: number }>();
    const byPerson = new Map<
      string,
      { name: string; logCount: number; hours: number; pendingReviewCount: number }
    >();
    let draftCount = 0;
    let returnedCount = 0;
    let sentCount = 0;
    let reviewedCount = 0;
    let activityCount = 0;
    let totalHours = 0;

    for (const row of rows) {
      if (row.status === DailyLogStatus.BORRADOR) {
        draftCount += 1;
        if (this.isReturned(row as unknown as DailyLogModel)) returnedCount += 1;
      }
      else if (row.status === DailyLogStatus.ENVIADO) sentCount += 1;
      else if (row.status === DailyLogStatus.REVISADO) reviewedCount += 1;

      const person = byPerson.get(row.authorUserId) ?? {
        name: row.author?.name ?? '',
        logCount: 0,
        hours: 0,
        pendingReviewCount: 0,
      };
      person.logCount += 1;
      if (row.status === DailyLogStatus.ENVIADO) person.pendingReviewCount += 1;

      for (const activity of row.activities) {
        activityCount += 1;
        totalHours += activity.hours;
        person.hours += activity.hours;
        const entry = byClass.get(activity.classificationCode) ?? {
          activityCount: 0,
          hours: 0,
        };
        entry.activityCount += 1;
        entry.hours += activity.hours;
        byClass.set(activity.classificationCode, entry);
      }
      byPerson.set(row.authorUserId, person);
    }

    return {
      total: rows.length,
      draftCount,
      returnedCount,
      sentCount,
      reviewedCount,
      activityCount,
      totalHours,
      byClassification: [...byClass.entries()]
        .map(([classificationCode, v]) => ({ classificationCode, ...v }))
        .sort((a, b) => b.hours - a.hours),
      byPerson: [...byPerson.entries()]
        .map(([userId, v]) => ({ userId, ...v }))
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es')),
    };
  }

  async getDailyLog(
    actor: CurrentActor,
    id: string,
  ): Promise<DailyLogResponseDto> {
    const row = await this.requireDailyLogReadable(actor, id);
    return this.toDailyLogResponse(row, actor);
  }

  async createDailyLog(
    actor: CurrentActor,
    dto: CreateDailyLogDto,
  ): Promise<DailyLogResponseDto> {
    const date = dateStringToDate(dto.date);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.dailyLog.create({
          data: {
            authorUserId: actor.userId,
            processId: dto.processId,
            date,
            ...(dto.dayNotes !== undefined ? { dayNotes: dto.dayNotes } : {}),
          },
          include: {
            author: { select: { name: true } },
            process: { select: { name: true } },
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'DAILY_LOG',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: null,
          after: this.dailyLogSnapshot(row),
        });

        return row;
      });

      return this.toDailyLogResponse({ ...created, activities: [] }, actor);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.dailyLog.findFirst({
          where: {
            authorUserId: actor.userId,
            processId: dto.processId,
            date,
          },
          select: { id: true },
        });
        throw new ConflictException({
          message: 'Ya existe un diario para esa persona, proceso y fecha.',
          existingId: existing?.id ?? null,
        });
      }
      throw error;
    }
  }

  async updateDailyLog(
    actor: CurrentActor,
    id: string,
    dto: UpdateDailyLogDto,
  ): Promise<DailyLogResponseDto> {
    const existing = await this.requireDailyLogWritable(actor, id);
    this.assertDailyLogEditable(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyLog.update({
        where: { id },
        data: {
          ...(dto.dayNotes !== undefined ? { dayNotes: dto.dayNotes } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DAILY_LOG',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.dailyLogSnapshot(existing),
        after: this.dailyLogSnapshot(row),
      });

      return row;
    });

    const withActivities = await this.prisma.dailyLog.findFirst({
      where: { id: updated.id },
      include: LOG_INCLUDE,
    });
    return this.toDailyLogResponse(
      withActivities as DailyLogWithActivities,
      actor,
    );
  }

  async removeDailyLog(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireDailyLogWritable(actor, id);
    this.assertDailyLogEditable(existing);

    await this.prisma.$transaction(async (tx) => {
      // Cascade de actividades por el schema (onDelete: Cascade).
      await tx.dailyLog.delete({ where: { id } });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'DAILY_LOG',
        objectId: existing.id,
        scopeProcessId: existing.processId,
        before: this.dailyLogSnapshot(existing),
        after: null,
      });
    });
  }

  /**
   * Enviar a revision (`BORRADOR -> ENVIADO`, design §2.4/§4). Solo cambia
   * `status`/`submittedAt`; NO toca Task/Request/Approval/Commitment (BR-023).
   * Segundo submit sobre un diario ya ENVIADO -> 409.
   */
  async submitDailyLog(
    actor: CurrentActor,
    id: string,
  ): Promise<DailyLogResponseDto> {
    const existing = await this.requireDailyLogWritable(actor, id);
    if (existing.status !== DailyLogStatus.BORRADOR) {
      throw new ConflictException(
        `El diario ya fue enviado (estado "${existing.status}").`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyLog.update({
        where: { id },
        data: {
          status: DailyLogStatus.ENVIADO,
          submittedAt: new Date(),
          ...CLEAR_RETURN,
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DAILY_LOG',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.dailyLogSnapshot(existing),
        after: this.dailyLogSnapshot(row),
      });

      return row;
    });

    const withActivities = await this.prisma.dailyLog.findFirst({
      where: { id: updated.id },
      include: LOG_INCLUDE,
    });
    return this.toDailyLogResponse(
      withActivities as DailyLogWithActivities,
      actor,
    );
  }

  // --- Actividades ---------------------------------------------------------

  async addActivity(
    actor: CurrentActor,
    dailyLogId: string,
    dto: CreateActivityDto,
  ): Promise<ActivityResponseDto> {
    const log = await this.requireDailyLogWritable(actor, dailyLogId);
    this.assertDailyLogEditable(log);

    await this.validateActivity(actor, log.processId, {
      classificationCode: dto.classificationCode,
      projectRequestId: dto.projectRequestId,
      taskId: dto.taskId,
      relatedIssueId: dto.relatedIssueId,
      assetRef: dto.assetRef,
      requesterRef: dto.requesterRef,
      justification: dto.justification,
    });

    const nextStepDate =
      dto.nextStepDate !== undefined
        ? dateStringToDate(dto.nextStepDate)
        : undefined;

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyLogActivity.create({
        data: {
          dailyLogId: log.id,
          classificationCode: dto.classificationCode,
          // hours opcional -> columna @default(0) (Finding 4).
          ...(dto.hours !== undefined ? { hours: dto.hours } : {}),
          ...(dto.projectRequestId !== undefined
            ? { projectRequestId: dto.projectRequestId }
            : {}),
          ...(dto.taskId !== undefined ? { taskId: dto.taskId } : {}),
          ...(dto.relatedIssueId !== undefined
            ? { relatedIssueId: dto.relatedIssueId }
            : {}),
          ...(dto.assetRef !== undefined ? { assetRef: dto.assetRef } : {}),
          ...(dto.requesterRef !== undefined
            ? { requesterRef: dto.requesterRef }
            : {}),
          ...(dto.justification !== undefined
            ? { justification: dto.justification }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.result !== undefined ? { result: dto.result } : {}),
          ...(dto.activityStatus !== undefined
            ? { activityStatus: dto.activityStatus }
            : {}),
          ...(dto.evidenceUrl !== undefined
            ? { evidenceUrl: dto.evidenceUrl }
            : {}),
          ...(dto.nextStep !== undefined ? { nextStep: dto.nextStep } : {}),
          ...(nextStepDate !== undefined ? { nextStepDate } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'DAILY_LOG_ACTIVITY',
        objectId: row.id,
        scopeProcessId: log.processId,
        before: null,
        after: this.activitySnapshot(row),
      });

      return row;
    });

    return this.toActivityResponse(created);
  }

  async updateActivity(
    actor: CurrentActor,
    activityId: string,
    dto: UpdateActivityDto,
  ): Promise<ActivityResponseDto> {
    const { activity, log } = await this.requireActivityWritable(
      actor,
      activityId,
    );
    this.assertDailyLogEditable(log);

    // Estado resultante (merge) para revalidar clasificacion/FK (§2.3).
    const merged = {
      classificationCode:
        dto.classificationCode ?? activity.classificationCode,
      projectRequestId:
        dto.projectRequestId !== undefined
          ? dto.projectRequestId
          : activity.projectRequestId,
      taskId: dto.taskId !== undefined ? dto.taskId : activity.taskId,
      relatedIssueId:
        dto.relatedIssueId !== undefined
          ? dto.relatedIssueId
          : activity.relatedIssueId,
      assetRef: dto.assetRef !== undefined ? dto.assetRef : activity.assetRef,
      requesterRef:
        dto.requesterRef !== undefined
          ? dto.requesterRef
          : activity.requesterRef,
      justification:
        dto.justification !== undefined
          ? dto.justification
          : activity.justification,
    };
    await this.validateActivity(actor, log.processId, merged);

    const nextStepDate =
      dto.nextStepDate !== undefined
        ? dateStringToDate(dto.nextStepDate)
        : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyLogActivity.update({
        where: { id: activityId },
        data: {
          ...(dto.classificationCode !== undefined
            ? { classificationCode: dto.classificationCode }
            : {}),
          ...(dto.hours !== undefined ? { hours: dto.hours } : {}),
          ...(dto.projectRequestId !== undefined
            ? { projectRequestId: dto.projectRequestId }
            : {}),
          ...(dto.taskId !== undefined ? { taskId: dto.taskId } : {}),
          ...(dto.relatedIssueId !== undefined
            ? { relatedIssueId: dto.relatedIssueId }
            : {}),
          ...(dto.assetRef !== undefined ? { assetRef: dto.assetRef } : {}),
          ...(dto.requesterRef !== undefined
            ? { requesterRef: dto.requesterRef }
            : {}),
          ...(dto.justification !== undefined
            ? { justification: dto.justification }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.result !== undefined ? { result: dto.result } : {}),
          ...(dto.activityStatus !== undefined
            ? { activityStatus: dto.activityStatus }
            : {}),
          ...(dto.evidenceUrl !== undefined
            ? { evidenceUrl: dto.evidenceUrl }
            : {}),
          ...(dto.nextStep !== undefined ? { nextStep: dto.nextStep } : {}),
          ...(nextStepDate !== undefined ? { nextStepDate } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DAILY_LOG_ACTIVITY',
        objectId: row.id,
        scopeProcessId: log.processId,
        before: this.activitySnapshot(activity),
        after: this.activitySnapshot(row),
      });

      return row;
    });

    return this.toActivityResponse(updated);
  }

  async removeActivity(actor: CurrentActor, activityId: string): Promise<void> {
    const { activity, log } = await this.requireActivityWritable(
      actor,
      activityId,
    );
    this.assertDailyLogEditable(log);

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyLogActivity.delete({ where: { id: activityId } });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'DAILY_LOG_ACTIVITY',
        objectId: activity.id,
        scopeProcessId: log.processId,
        before: this.activitySnapshot(activity),
        after: null,
      });
    });
  }

  // --- Semanales -----------------------------------------------------------

  async listWeeklyReports(
    actor: CurrentActor,
    filters: ListWeeklyReportsDto,
  ): Promise<WeeklyReportResponseDto[]> {
    const where: Prisma.WeeklyReportWhereInput = {
      AND: [this.scope.weeklyReportReadWhere(actor)],
    };
    const and = where.AND as Prisma.WeeklyReportWhereInput[];
    if (filters.weekStart !== undefined) {
      and.push({ weekStart: mondayOf(dateStringToDate(filters.weekStart)) });
    }
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }
    if (filters.authorUserId !== undefined) {
      and.push({ authorUserId: filters.authorUserId });
    }
    if (filters.status !== undefined) {
      and.push({ status: filters.status });
    }

    const rows = await this.prisma.weeklyReport.findMany({
      where,
      include: WEEKLY_INCLUDE,
      orderBy: [{ weekStart: 'desc' }, { createdAt: 'desc' }],
    });
    // Los listados omiten la consolidacion (solo en el detalle, §2.5).
    return rows.map((row) => this.toWeeklyReportResponse(row, null, actor));
  }

  async getWeeklyReport(
    actor: CurrentActor,
    id: string,
  ): Promise<WeeklyReportResponseDto> {
    const row = await this.prisma.weeklyReport.findFirst({
      where: { AND: [{ id }, this.scope.weeklyReportReadWhere(actor)] },
      include: WEEKLY_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Semanal "${id}" no encontrado.`);
    }
    const consolidation = await this.consolidate(row);
    return this.toWeeklyReportResponse(row, consolidation, actor);
  }

  /**
   * Consolidacion por lectura (design §2.5/AC-017): agrega los diarios cuyo
   * `authorUserId` y `processId` son los del WeeklyReport OBJETIVO (no los del
   * actor), con `status in {ENVIADO, REVISADO}` y `date` en
   * `[weekStart, weekStart+6]` UTC. Si no hay elegibles -> conteos en cero y
   * `hasBacking=false`.
   */
  private async consolidate(
    report: WeeklyReportModel,
  ): Promise<WeeklyConsolidationDto> {
    const weekEnd = addDaysUTC(report.weekStart, 6);
    const logs = await this.prisma.dailyLog.findMany({
      where: {
        authorUserId: report.authorUserId,
        processId: report.processId,
        status: { in: [...CONSOLIDATION_STATES] },
        date: { gte: report.weekStart, lte: weekEnd },
      },
      include: { activities: true },
    });

    let activityCount = 0;
    let totalHours = 0;
    let extraordinaryCount = 0;
    for (const log of logs) {
      for (const activity of log.activities) {
        activityCount += 1;
        totalHours += activity.hours;
        if (activity.classificationCode === 'EXTRAORDINARIA') {
          extraordinaryCount += 1;
        }
      }
    }

    return {
      dailyLogCount: logs.length,
      activityCount,
      totalHours,
      extraordinaryCount,
      hasBacking: logs.length > 0,
    };
  }

  async createWeeklyReport(
    actor: CurrentActor,
    dto: CreateWeeklyReportDto,
  ): Promise<WeeklyReportResponseDto> {
    // Normaliza SIEMPRE al lunes ISO (nunca 400 por no-lunes, Finding 3).
    const weekStart = mondayOf(dateStringToDate(dto.weekStart));

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.weeklyReport.create({
          data: {
            authorUserId: actor.userId,
            processId: dto.processId,
            weekStart,
            ...(dto.results !== undefined ? { results: dto.results } : {}),
            ...(dto.proposals !== undefined
              ? { proposals: dto.proposals }
              : {}),
            ...(dto.blockers !== undefined ? { blockers: dto.blockers } : {}),
            ...(dto.commitmentsText !== undefined
              ? { commitmentsText: dto.commitmentsText }
              : {}),
            ...(dto.decisions !== undefined
              ? { decisions: dto.decisions }
              : {}),
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'WEEKLY_REPORT',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: null,
          after: this.weeklyReportSnapshot(row),
        });

        return row;
      });

      return await this.weeklyResponse(created.id, actor);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un semanal para esa persona, proceso y semana.',
        );
      }
      throw error;
    }
  }

  private async requireWeeklyReportWritable(
    actor: CurrentActor,
    id: string,
  ): Promise<WeeklyReportModel> {
    const row = await this.prisma.weeklyReport.findFirst({
      where: { AND: [{ id }, this.scope.weeklyReportWriteWhere(actor)] },
    });
    if (!row) {
      throw new NotFoundException(`Semanal "${id}" no encontrado.`);
    }
    return row;
  }

  async updateWeeklyReport(
    actor: CurrentActor,
    id: string,
    dto: UpdateWeeklyReportDto,
  ): Promise<WeeklyReportResponseDto> {
    const existing = await this.requireWeeklyReportWritable(actor, id);
    if (existing.status !== DailyLogStatus.BORRADOR) {
      throw new ConflictException(
        existing.status === DailyLogStatus.REVISADO
          ? 'El semanal ya fue revisado y no se puede modificar.'
          : 'El semanal ya fue enviado a revision y no se puede modificar.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.weeklyReport.update({
        where: { id },
        data: {
          ...(dto.results !== undefined ? { results: dto.results } : {}),
          ...(dto.proposals !== undefined ? { proposals: dto.proposals } : {}),
          ...(dto.blockers !== undefined ? { blockers: dto.blockers } : {}),
          ...(dto.commitmentsText !== undefined
            ? { commitmentsText: dto.commitmentsText }
            : {}),
          ...(dto.decisions !== undefined ? { decisions: dto.decisions } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'WEEKLY_REPORT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.weeklyReportSnapshot(existing),
        after: this.weeklyReportSnapshot(row),
      });

      return row;
    });

    return this.weeklyResponse(updated.id, actor);
  }

  /**
   * Enviar semanal a revision (`BORRADOR -> ENVIADO`, design §2.4). Solo cambia
   * `status`/`submittedAt`; `proposals`/`commitmentsText` NO crean Commitment ni
   * mutan prioridad (AC-018). Segundo submit -> 409.
   */
  async submitWeeklyReport(
    actor: CurrentActor,
    id: string,
  ): Promise<WeeklyReportResponseDto> {
    const existing = await this.requireWeeklyReportWritable(actor, id);
    if (existing.status !== DailyLogStatus.BORRADOR) {
      throw new ConflictException(
        `El semanal ya fue enviado (estado "${existing.status}").`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.weeklyReport.update({
        where: { id },
        data: {
          status: DailyLogStatus.ENVIADO,
          submittedAt: new Date(),
          ...CLEAR_RETURN,
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'WEEKLY_REPORT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.weeklyReportSnapshot(existing),
        after: this.weeklyReportSnapshot(row),
      });

      return row;
    });

    return this.weeklyResponse(updated.id, actor);
  }

  // --- Revisión y devolución ----------------------------------------------

  /** Respuesta completa de un semanal (autor, revisión y consolidación). */
  private async weeklyResponse(
    id: string,
    actor: CurrentActor,
  ): Promise<WeeklyReportResponseDto> {
    const row = await this.prisma.weeklyReport.findFirstOrThrow({
      where: { id },
      include: WEEKLY_INCLUDE,
    });
    return this.toWeeklyReportResponse(
      row,
      await this.consolidate(row),
      actor,
    );
  }

  /**
   * Quien puede revisar o devolver: el jefe de área, o el líder del proceso del
   * registro. Nunca el propio autor (nadie se revisa a sí mismo). Fuera de
   * alcance de lectura ya se respondió 404; aquí un 403 si ve pero no revisa.
   */
  private assertCanReview(
    actor: CurrentActor,
    authorUserId: string,
    processId: string,
  ): void {
    const isLeaderOfProcess = actor.grants.some(
      (g) => g.roleCode === RoleCode.LIDER_PROCESO && g.processId === processId,
    );
    if (authorUserId === actor.userId || !(actor.isJefeArea || isLeaderOfProcess)) {
      throw new ForbiddenException(
        'Solo el jefe de área o el líder del proceso (distinto del autor) puede revisar o devolver.',
      );
    }
  }

  private async notifyAuthor(
    actor: CurrentActor,
    authorUserId: string,
    type: NotificationType,
    title: string,
    message: string,
    link: string,
  ): Promise<void> {
    await this.notifications.notify({
      userIds: [authorUserId],
      excludeUserId: actor.userId,
      type,
      title,
      message,
      link,
    });
  }

  async reviewDailyLog(
    actor: CurrentActor,
    id: string,
  ): Promise<DailyLogResponseDto> {
    const existing = await this.requireDailyLogReadable(actor, id);
    this.assertCanReview(actor, existing.authorUserId, existing.processId);
    if (existing.status !== DailyLogStatus.ENVIADO) {
      throw new ConflictException(
        'Solo se puede marcar como revisado un diario enviado.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyLog.update({
        where: { id },
        data: {
          status: DailyLogStatus.REVISADO,
          reviewedAt: new Date(),
          reviewedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DAILY_LOG',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.dailyLogSnapshot(existing),
        after: this.dailyLogSnapshot(row),
      });
    });

    const fresh = await this.requireDailyLogReadable(actor, id);
    return this.toDailyLogResponse(fresh, actor);
  }

  /**
   * Devolver o retirar un diario cambiaría el consolidado de un semanal que ya
   * lo usó como respaldo: primero hay que devolver ese semanal.
   */
  private async assertWeeklyNotConsolidated(log: DailyLogModel): Promise<void> {
    const weekly = await this.prisma.weeklyReport.findFirst({
      where: {
        authorUserId: log.authorUserId,
        processId: log.processId,
        weekStart: mondayOf(log.date),
        status: { in: [...CONSOLIDATION_STATES] },
      },
      select: { id: true },
    });
    if (weekly) {
      throw new ConflictException(
        'Primero devuelve el reporte semanal de esa semana.',
      );
    }
  }

  /** El autor retira un envío por error (ENVIADO a BORRADOR). */
  async recallDailyLog(
    actor: CurrentActor,
    id: string,
  ): Promise<DailyLogResponseDto> {
    const existing = await this.requireDailyLogWritable(actor, id);
    if (existing.status !== DailyLogStatus.ENVIADO) {
      throw new ConflictException(
        'Solo se puede retirar el envío de un diario enviado y aún no revisado.',
      );
    }
    await this.assertWeeklyNotConsolidated(existing);

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyLog.update({
        where: { id },
        data: { status: DailyLogStatus.BORRADOR },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DAILY_LOG',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.dailyLogSnapshot(existing),
        after: this.dailyLogSnapshot(row),
      });
    });
    return this.toDailyLogResponse(await this.requireDailyLogReadable(actor, id), actor);
  }

  async returnDailyLog(
    actor: CurrentActor,
    id: string,
    dto: ReturnWorklogDto,
  ): Promise<DailyLogResponseDto> {
    const existing = await this.requireDailyLogReadable(actor, id);
    this.assertCanReview(actor, existing.authorUserId, existing.processId);
    if (existing.status !== DailyLogStatus.ENVIADO) {
      throw new ConflictException(
        'Solo se puede devolver un diario enviado y aún no revisado.',
      );
    }
    await this.assertWeeklyNotConsolidated(existing);

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyLog.update({
        where: { id },
        data: {
          status: DailyLogStatus.BORRADOR,
          reviewedAt: null,
          reviewedByUserId: null,
          returnedAt: new Date(),
          returnedByUserId: actor.userId,
          returnReason: dto.reason,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DAILY_LOG',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.dailyLogSnapshot(existing),
        after: this.dailyLogSnapshot(row),
      });
    });

    const fresh = await this.requireDailyLogReadable(actor, id);
    await this.notifyAuthor(
      actor,
      fresh.authorUserId,
      NotificationType.WORKLOG_RETURNED,
      'Tu bitácora fue devuelta',
      `Bitácora del ${dateToString(fresh.date)}: ${dto.reason}`,
      `/seguimiento/bitacora?diario=${fresh.id}`,
    );
    return this.toDailyLogResponse(fresh, actor);
  }

  async reviewWeeklyReport(
    actor: CurrentActor,
    id: string,
  ): Promise<WeeklyReportResponseDto> {
    const existing = await this.prisma.weeklyReport.findFirst({
      where: { AND: [{ id }, this.scope.weeklyReportReadWhere(actor)] },
    });
    if (!existing) {
      throw new NotFoundException(`Semanal "${id}" no encontrado.`);
    }
    this.assertCanReview(actor, existing.authorUserId, existing.processId);
    if (existing.status !== DailyLogStatus.ENVIADO) {
      throw new ConflictException(
        'Solo se puede marcar como revisado un semanal enviado.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.weeklyReport.update({
        where: { id },
        data: {
          status: DailyLogStatus.REVISADO,
          reviewedAt: new Date(),
          reviewedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'WEEKLY_REPORT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.weeklyReportSnapshot(existing),
        after: this.weeklyReportSnapshot(row),
      });
    });

    return this.weeklyResponse(id, actor);
  }

  async returnWeeklyReport(
    actor: CurrentActor,
    id: string,
    dto: ReturnWorklogDto,
  ): Promise<WeeklyReportResponseDto> {
    const existing = await this.prisma.weeklyReport.findFirst({
      where: { AND: [{ id }, this.scope.weeklyReportReadWhere(actor)] },
    });
    if (!existing) {
      throw new NotFoundException(`Semanal "${id}" no encontrado.`);
    }
    this.assertCanReview(actor, existing.authorUserId, existing.processId);
    if (existing.status !== DailyLogStatus.ENVIADO) {
      throw new ConflictException(
        'Solo se puede devolver un semanal enviado y aún no revisado.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.weeklyReport.update({
        where: { id },
        data: {
          status: DailyLogStatus.BORRADOR,
          reviewedAt: null,
          reviewedByUserId: null,
          returnedAt: new Date(),
          returnedByUserId: actor.userId,
          returnReason: dto.reason,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'WEEKLY_REPORT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.weeklyReportSnapshot(existing),
        after: this.weeklyReportSnapshot(row),
      });
    });

    await this.notifyAuthor(
      actor,
      existing.authorUserId,
      NotificationType.WORKLOG_RETURNED,
      'Tu reporte semanal fue devuelto',
      `Semana del ${dateToString(existing.weekStart)}: ${dto.reason}`,
      `/seguimiento/semanal?reporte=${existing.id}`,
    );
    return this.weeklyResponse(id, actor);
  }
}
