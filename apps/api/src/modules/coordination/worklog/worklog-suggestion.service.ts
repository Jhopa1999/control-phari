import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { DailyLogModel } from '../../../generated/prisma/models/DailyLog';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { OccurrenceStatus } from '../../recurring-activity/occurrence-status';
import { addDaysUTC, dateToString } from '../date';
import { localDayOf } from '../local-day';
import { DailyLogStatus } from '../record-state';
import { meetingEndTimeOf, isMinutesClosed } from '../meeting/minutes';
import { CreateActivityDto } from './dto/create-activity.dto';
import {
  AcceptSuggestionsDto,
  AcceptSuggestionsResultDto,
  DailySuggestionsResponseDto,
  DismissSuggestionsResultDto,
  RestoreSuggestionsResultDto,
  SuggestionDto,
} from './dto/suggestions.dto';
import { QUARTER_HOURS_MESSAGE } from './quarter-hours';
import {
  SuggestionKind,
  meetingKey,
  occurrenceKey,
  taskKey,
} from './suggestion-key';
import {
  TaskReason,
  meetingHours,
  mergeTaskReasons,
  occurrenceHours,
  taskWorkReasons,
} from './suggestion-sources';
import { WorklogEligibilityService } from './worklog-eligibility.service';
import {
  ActivitySource,
  SUGGESTION_ACCEPTED,
  SUGGESTION_DISMISSED,
  WorklogService,
} from './worklog.service';

/** Tope de eventos de auditoría de tareas leídos por día (acota la consulta). */
const TASK_EVENTS_LIMIT = 500;

/** Sugerencia calculada con los datos que necesita su vínculo de origen. */
interface ComputedSuggestion {
  dto: SuggestionDto;
  source: ActivitySource;
  /** Orden: mismo proceso que el diario primero, luego por tipo y criterio propio. */
  sortKey: string;
}

/**
 * Sugerencias de tiempo de la Bitácora (requisito A). Para un diario y su autor
 * calcula, para la fecha del diario: reuniones (participante o responsable),
 * ocurrencias de actividades recurrentes que completó ese día (día local) y
 * tareas cuyo avance o estado cambió ese día (historial de auditoría), con la
 * elegibilidad de WorklogEligibilityService. Aceptar crea la actividad por la
 * ruta única de WorklogService (`createActivity`) con su vínculo de origen;
 * descartar deja una marca persistente por autor y origen.
 */
@Injectable()
export class WorklogSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly worklog: WorklogService,
    private readonly eligibility: WorklogEligibilityService,
  ) {}

  // --- Lectura -------------------------------------------------------------

  async list(
    actor: CurrentActor,
    dailyLogId: string,
    includeDismissed = false,
  ): Promise<DailySuggestionsResponseDto> {
    const log = await this.worklog.requireOwnDailyLog(actor, dailyLogId);
    const computed = await this.compute(actor, log);
    const pending = computed.filter((c) => c.dto.status === 'SUGGESTED');
    const dismissed = computed.filter((c) => c.dto.status === 'DISMISSED');
    const [totals, workdayHours] = await Promise.all([
      this.worklog.authorDayTotals([{ authorUserId: log.authorUserId, date: log.date }]),
      this.eligibility.workdayHours(),
    ]);
    const dayTotal = totals.get(`${log.authorUserId}|${dateToString(log.date)}`) ?? 0;
    return {
      dailyLogId: log.id,
      date: dateToString(log.date),
      editable: log.status === DailyLogStatus.BORRADOR,
      pendingCount: pending.length,
      dismissedCount: dismissed.length,
      authorDayTotalHours: dayTotal,
      workdayHours,
      overWorkday: dayTotal > workdayHours,
      items: (includeDismissed ? computed : pending).map((c) => c.dto),
    };
  }

  // --- Aceptar -------------------------------------------------------------

  async accept(
    actor: CurrentActor,
    dailyLogId: string,
    dto: AcceptSuggestionsDto,
  ): Promise<AcceptSuggestionsResultDto> {
    const log = await this.worklog.requireOwnDailyLog(actor, dailyLogId);
    this.worklog.assertDailyLogEditable(log);
    const current = new Map(
      (await this.compute(actor, log))
        .filter((c) => c.dto.status === 'SUGGESTED')
        .map((c) => [c.dto.key, c]),
    );

    const result: AcceptSuggestionsResultDto = { accepted: [], failed: [] };
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      const suggestion = current.get(item.key);
      if (!suggestion) {
        result.failed.push({
          key: item.key,
          code: 'NO_DISPONIBLE',
          message: 'La sugerencia ya no está disponible.',
        });
        continue;
      }
      const hours = item.hours ?? suggestion.dto.suggestedHours;
      if (hours === null || hours === undefined) {
        result.failed.push({
          key: item.key,
          code: 'HORAS_REQUERIDAS',
          message: 'Indica las horas dedicadas para registrar esta sugerencia.',
        });
        continue;
      }
      const activity: CreateActivityDto = {
        classificationCode: suggestion.dto.classificationCode,
        hours,
        ...(suggestion.source.taskId ? { taskId: suggestion.source.taskId } : {}),
      };
      const description = item.description ?? suggestion.dto.description ?? undefined;
      if (description) activity.description = description;

      try {
        result.accepted.push(
          await this.worklog.createActivity(actor, log, activity, suggestion.source),
        );
      } catch (error) {
        result.failed.push({ key: item.key, ...this.failureOf(error) });
      }
    }
    return result;
  }

  /** Traduce el error de un ítem a un fallo funcional (no se registra como error). */
  private failureOf(error: unknown): { code: string; message: string } {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return {
        code: 'YA_REGISTRADA',
        message: 'Esa sugerencia ya está registrada en una bitácora.',
      };
    }
    if (error instanceof BadRequestException && error.message === QUARTER_HOURS_MESSAGE) {
      return { code: 'HORAS_INVALIDAS', message: QUARTER_HOURS_MESSAGE };
    }
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      return { code: 'NO_ELEGIBLE', message: error.message };
    }
    throw error;
  }

  // --- Descartar / restaurar ------------------------------------------------

  async dismiss(
    actor: CurrentActor,
    dailyLogId: string,
    keys: string[],
  ): Promise<DismissSuggestionsResultDto> {
    const log = await this.worklog.requireOwnDailyLog(actor, dailyLogId);
    this.worklog.assertDailyLogEditable(log);
    const unique = [...new Set(keys)];
    const computed = new Map(
      (await this.compute(actor, log)).map((c) => [c.dto.key, c]),
    );
    const accepted = await this.prisma.dailyLogSuggestionLink.findMany({
      where: {
        authorUserId: log.authorUserId,
        sourceKey: { in: unique },
        status: SUGGESTION_ACCEPTED,
      },
      select: { sourceKey: true },
    });
    if (accepted.length > 0) {
      throw new ConflictException('Esa sugerencia ya está registrada en una bitácora.');
    }
    const missing = unique.filter((k) => !computed.has(k));
    if (missing.length > 0) {
      throw new NotFoundException('La sugerencia ya no está disponible.');
    }
    const toCreate = unique
      .map((k) => computed.get(k) as ComputedSuggestion)
      .filter((c) => c.dto.status === 'SUGGESTED');

    if (toCreate.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.dailyLogSuggestionLink.createMany({
          data: toCreate.map((c) => ({
            authorUserId: log.authorUserId,
            sourceKey: c.source.sourceKey,
            kind: c.source.kind,
            status: SUGGESTION_DISMISSED,
            workDate: c.source.workDate,
            meetingId: c.source.meetingId ?? null,
            occurrenceId: c.source.occurrenceId ?? null,
            taskId: c.source.taskId ?? null,
          })),
          skipDuplicates: true,
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'DAILY_LOG_SUGGESTION',
          objectId: log.id,
          scopeProcessId: log.processId,
          before: null,
          after: { status: SUGGESTION_DISMISSED, keys: toCreate.map((c) => c.dto.key) },
        });
      });
    }
    return { dismissed: unique };
  }

  async restore(
    actor: CurrentActor,
    dailyLogId: string,
    keys: string[],
  ): Promise<RestoreSuggestionsResultDto> {
    const log = await this.worklog.requireOwnDailyLog(actor, dailyLogId);
    this.worklog.assertDailyLogEditable(log);
    const unique = [...new Set(keys)];
    const rows = await this.prisma.dailyLogSuggestionLink.findMany({
      where: {
        authorUserId: log.authorUserId,
        sourceKey: { in: unique },
        status: SUGGESTION_DISMISSED,
      },
      select: { id: true, sourceKey: true },
    });
    if (rows.length === 0) return { restored: [] };
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyLogSuggestionLink.deleteMany({
        where: { id: { in: rows.map((r) => r.id) }, status: SUGGESTION_DISMISSED },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'DAILY_LOG_SUGGESTION',
        objectId: log.id,
        scopeProcessId: log.processId,
        before: { status: SUGGESTION_DISMISSED, keys: rows.map((r) => r.sourceKey) },
        after: null,
      });
    });
    return { restored: rows.map((r) => r.sourceKey) };
  }

  // --- Cálculo ---------------------------------------------------------------

  /**
   * Sugerencias vigentes del día del diario (SUGGESTED y DISMISSED). Se excluye
   * todo origen ya ACEPTADO por el autor en cualquiera de sus diarios.
   */
  private async compute(
    actor: CurrentActor,
    log: DailyLogModel,
  ): Promise<ComputedSuggestion[]> {
    const author = log.authorUserId;
    const day = log.date;
    const dayString = dateToString(day);
    // Ventana amplia para instantes (cubre cualquier zona) + filtro por día local.
    const from = addDaysUTC(day, -1);
    const to = addDaysUTC(day, 2);
    const sameDay = (instant: Date): boolean => localDayOf(instant).getTime() === day.getTime();

    const [meetings, occurrences, taskEvents] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          meetingDate: day,
          OR: [{ responsibleUserId: author }, { participants: { some: { userId: author } } }],
        },
        select: {
          id: true,
          title: true,
          state: true,
          meetingTime: true,
          durationMinutes: true,
          processId: true,
          responsibleUserId: true,
          process: { select: { name: true } },
        },
      }),
      this.prisma.recurringActivityOccurrence.findMany({
        where: {
          status: OccurrenceStatus.COMPLETADA,
          completedByUserId: author,
          completedAt: { gte: from, lt: to },
          actualHours: { not: null },
        },
        select: {
          id: true,
          targetDate: true,
          completedAt: true,
          completionComment: true,
          actualHours: true,
          activity: { select: { title: true } },
        },
      }),
      this.prisma.auditEvent.findMany({
        where: {
          objectType: 'TASK',
          action: 'UPDATE',
          actorUserId: author,
          createdAt: { gte: from, lt: to },
        },
        select: { objectId: true, before: true, after: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: TASK_EVENTS_LIMIT,
      }),
    ]);

    const out: ComputedSuggestion[] = [];

    for (const m of meetings) {
      const hours = meetingHours(m.durationMinutes);
      const endTime = meetingEndTimeOf(m.meetingTime, m.durationMinutes);
      out.push({
        sortKey: `${m.processId === log.processId ? 0 : 1}|0|${m.meetingTime ?? '99:99'}|${m.title}`,
        source: this.source('MEETING', meetingKey(m.id), day, { meetingId: m.id }),
        dto: {
          key: meetingKey(m.id),
          kind: 'MEETING',
          classificationCode: 'REUNION',
          status: 'SUGGESTED',
          title: m.title,
          description: m.title,
          suggestedHours: hours,
          hoursAdjusted: false,
          originalHours: null,
          requiresHoursInput: hours === null,
          meeting: {
            id: m.id,
            title: m.title,
            time: m.meetingTime,
            endTime,
            durationMinutes: m.durationMinutes,
            minutesOpen: !isMinutesClosed(m.state),
            processId: m.processId,
            processName: m.process.name,
            responsible: m.responsibleUserId === author,
          },
        },
      });
    }

    for (const o of occurrences) {
      if (!o.completedAt || !sameDay(o.completedAt) || o.actualHours === null) continue;
      const actual = Number(o.actualHours);
      const { hours, adjusted } = occurrenceHours(actual);
      out.push({
        sortKey: `1|1|${o.completedAt.toISOString()}`,
        source: this.source('OCCURRENCE', occurrenceKey(o.id), day, { occurrenceId: o.id }),
        dto: {
          key: occurrenceKey(o.id),
          kind: 'OCCURRENCE',
          classificationCode: 'RECURRENTE',
          status: 'SUGGESTED',
          title: o.activity.title,
          description: o.completionComment?.trim() || o.activity.title,
          suggestedHours: hours,
          hoursAdjusted: adjusted,
          originalHours: actual,
          requiresHoursInput: false,
          occurrence: {
            id: o.id,
            activityTitle: o.activity.title,
            targetDate: dateToString(o.targetDate),
            completedAt: o.completedAt,
            completionComment: o.completionComment,
          },
        },
      });
    }

    out.push(...(await this.taskSuggestions(actor, log, taskEvents.filter((e) => sameDay(e.createdAt)), dayString)));

    // Vínculos del autor: ACEPTADA (en cualquier diario) excluye; DESCARTADA marca.
    const links = out.length
      ? await this.prisma.dailyLogSuggestionLink.findMany({
          where: { authorUserId: author, sourceKey: { in: out.map((c) => c.dto.key) } },
          select: { sourceKey: true, status: true },
        })
      : [];
    const linkStatus = new Map(links.map((l) => [l.sourceKey, l.status]));
    return out
      .filter((c) => linkStatus.get(c.dto.key) !== SUGGESTION_ACCEPTED)
      .map((c) =>
        linkStatus.get(c.dto.key) === SUGGESTION_DISMISSED
          ? { ...c, dto: { ...c.dto, status: 'DISMISSED' } }
          : c,
      )
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  /**
   * Tareas trabajadas el día por el autor: eventos UPDATE de TASK con cambio de
   * avance o estado, elegibles para el diario (misma regla de imputación) y sin
   * una actividad del autor con esa tarea en cualquier diario de esa fecha.
   */
  private async taskSuggestions(
    actor: CurrentActor,
    log: DailyLogModel,
    events: Array<{ objectId: string; before: unknown; after: unknown }>,
    dayString: string,
  ): Promise<ComputedSuggestion[]> {
    const byTask = new Map<string, TaskReason[][]>();
    for (const e of events) {
      const reasons = taskWorkReasons(e.before, e.after);
      if (reasons.length === 0) continue;
      const list = byTask.get(e.objectId) ?? [];
      list.push(reasons);
      byTask.set(e.objectId, list);
    }
    const merged = new Map<string, TaskReason[]>();
    for (const [taskId, list] of byTask) {
      const reasons = mergeTaskReasons(list);
      if (reasons.length > 0) merged.set(taskId, reasons);
    }
    if (merged.size === 0) return [];

    const ids = [...merged.keys()];
    const [eligible, alreadyLogged] = await Promise.all([
      this.eligibility.eligibleTasksForLog(actor, log.processId, log.date, ids),
      this.prisma.dailyLogActivity.findMany({
        where: {
          taskId: { in: ids },
          dailyLog: { authorUserId: log.authorUserId, date: log.date },
        },
        select: { taskId: true },
      }),
    ]);
    const logged = new Set(alreadyLogged.map((a) => a.taskId));

    return eligible
      .filter((t) => !logged.has(t.id))
      .map((t) => {
        const key = taskKey(t.id, dayString);
        return {
          sortKey: `0|2|${t.code}`,
          source: this.source('TASK', key, log.date, { taskId: t.id }),
          dto: {
            key,
            kind: 'TASK',
            classificationCode: 'PLANIFICADA',
            status: 'SUGGESTED',
            title: `${t.code} · ${t.title}`,
            description: null,
            suggestedHours: null,
            hoursAdjusted: false,
            originalHours: null,
            requiresHoursInput: true,
            task: {
              id: t.id,
              code: t.code,
              title: t.title,
              requestId: t.requestId,
              requestCode: t.requestCode,
              projectTitle: t.requestTitle,
              reasons: merged.get(t.id) ?? [],
            },
          },
        };
      });
  }

  private source(
    kind: SuggestionKind,
    sourceKey: string,
    workDate: Date,
    ids: { meetingId?: string; occurrenceId?: string; taskId?: string },
  ): ActivitySource {
    return { kind, sourceKey, workDate, ...ids };
  }
}

