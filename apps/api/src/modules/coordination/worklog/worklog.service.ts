import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { DailyLogModel } from '../../../generated/prisma/models/DailyLog';
import type { DailyLogActivityModel } from '../../../generated/prisma/models/DailyLogActivity';
import type { WeeklyReportModel } from '../../../generated/prisma/models/WeeklyReport';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
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
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CreateWeeklyReportDto } from './dto/create-weekly-report.dto';
import { UpdateWeeklyReportDto } from './dto/update-weekly-report.dto';
import { ListDailyLogsDto } from './dto/list-daily-logs.dto';
import { ListWeeklyReportsDto } from './dto/list-weekly-reports.dto';
import {
  DailyLogResponseDto,
} from './dto/daily-log-response.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';
import {
  WeeklyConsolidationDto,
  WeeklyReportResponseDto,
} from './dto/weekly-report-response.dto';

/** Diario con sus actividades (para el mapeo de respuesta). */
type DailyLogWithActivities = DailyLogModel & {
  activities: DailyLogActivityModel[];
};

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

  private toActivityResponse(
    row: DailyLogActivityModel,
  ): ActivityResponseDto {
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDailyLogResponse(
    row: DailyLogWithActivities,
  ): DailyLogResponseDto {
    const activities = row.activities.map((a) => this.toActivityResponse(a));
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      processId: row.processId,
      date: dateToString(row.date),
      status: row.status,
      submittedAt: row.submittedAt,
      dayNotes: row.dayNotes,
      totalHours: activities.reduce((sum, a) => sum + a.hours, 0),
      activities,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toWeeklyReportResponse(
    row: WeeklyReportModel,
    consolidation: WeeklyConsolidationDto | null,
  ): WeeklyReportResponseDto {
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      processId: row.processId,
      weekStart: dateToString(row.weekStart),
      status: row.status,
      submittedAt: row.submittedAt,
      results: row.results,
      proposals: row.proposals,
      blockers: row.blockers,
      commitmentsText: row.commitmentsText,
      decisions: row.decisions,
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
      include: { activities: { orderBy: { createdAt: 'asc' } } },
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
      include: { activities: { orderBy: { createdAt: 'asc' } } },
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

  // --- Diarios: CRUD -------------------------------------------------------

  async listDailyLogs(
    actor: CurrentActor,
    filters: ListDailyLogsDto,
  ): Promise<DailyLogResponseDto[]> {
    const where: Prisma.DailyLogWhereInput = {
      AND: [this.scope.dailyLogReadWhere(actor)],
    };
    const and = where.AND as Prisma.DailyLogWhereInput[];
    if (filters.date !== undefined) {
      and.push({ date: dateStringToDate(filters.date) });
    }
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }
    if (filters.authorUserId !== undefined) {
      and.push({ authorUserId: filters.authorUserId });
    }

    const rows = await this.prisma.dailyLog.findMany({
      where,
      include: { activities: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toDailyLogResponse(row));
  }

  async getDailyLog(
    actor: CurrentActor,
    id: string,
  ): Promise<DailyLogResponseDto> {
    const row = await this.requireDailyLogReadable(actor, id);
    return this.toDailyLogResponse(row);
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

      return this.toDailyLogResponse({ ...created, activities: [] });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un diario para esa persona, proceso y fecha.',
        );
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
      include: { activities: { orderBy: { createdAt: 'asc' } } },
    });
    return this.toDailyLogResponse(withActivities as DailyLogWithActivities);
  }

  async removeDailyLog(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireDailyLogWritable(actor, id);

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
        data: { status: DailyLogStatus.ENVIADO, submittedAt: new Date() },
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
      include: { activities: { orderBy: { createdAt: 'asc' } } },
    });
    return this.toDailyLogResponse(withActivities as DailyLogWithActivities);
  }

  // --- Actividades ---------------------------------------------------------

  async addActivity(
    actor: CurrentActor,
    dailyLogId: string,
    dto: CreateActivityDto,
  ): Promise<ActivityResponseDto> {
    const log = await this.requireDailyLogWritable(actor, dailyLogId);

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

    const rows = await this.prisma.weeklyReport.findMany({
      where,
      orderBy: [{ weekStart: 'desc' }, { createdAt: 'desc' }],
    });
    // Los listados omiten la consolidacion (solo en el detalle, §2.5).
    return rows.map((row) => this.toWeeklyReportResponse(row, null));
  }

  async getWeeklyReport(
    actor: CurrentActor,
    id: string,
  ): Promise<WeeklyReportResponseDto> {
    const row = await this.prisma.weeklyReport.findFirst({
      where: { AND: [{ id }, this.scope.weeklyReportReadWhere(actor)] },
    });
    if (!row) {
      throw new NotFoundException(`Semanal "${id}" no encontrado.`);
    }
    const consolidation = await this.consolidate(row);
    return this.toWeeklyReportResponse(row, consolidation);
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

      const consolidation = await this.consolidate(created);
      return this.toWeeklyReportResponse(created, consolidation);
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

    const consolidation = await this.consolidate(updated);
    return this.toWeeklyReportResponse(updated, consolidation);
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
        data: { status: DailyLogStatus.ENVIADO, submittedAt: new Date() },
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

    const consolidation = await this.consolidate(updated);
    return this.toWeeklyReportResponse(updated, consolidation);
  }
}
