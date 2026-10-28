import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import {
  isRecurrence,
  nextTargetDatesFrom,
  Recurrence,
  toLocalDate,
  toUtcDate,
} from './recurrence';
// `toLocalDate` se usa SOLO para proyectar el reloj ("ahora") al dia local de
// la zona configurada. Las fechas de calendario ya persistidas (@db.Date,
// medianoche UTC) se leen por su terna UTC para no correr el dia.
import {
  isOccurrenceTransitionAllowed,
  isOccurrenceStatus,
  OccurrenceStatus,
} from './occurrence-status';
import {
  isResponsibleAssignmentValid,
  ResponsibleKind,
} from './responsible-kind';
import {
  loadRecurringActivityConfig,
  RecurringActivityConfig,
} from './recurring-activity.config';
import { CreateRecurringActivityDto } from './dto/create-recurring-activity.dto';
import { UpdateRecurringActivityDto } from './dto/update-recurring-activity.dto';
import { RecurringActivityResponseDto } from './dto/recurring-activity-response.dto';
import { ListOccurrencesDto } from './dto/list-occurrences.dto';
import { OccurrenceResponseDto } from './dto/occurrence-response.dto';
import { PaginatedOccurrencesResponseDto } from './dto/paginated-occurrences-response.dto';
import { CompleteOccurrenceDto } from './dto/complete-occurrence.dto';
import { ComplianceQueryDto } from './dto/compliance-query.dto';
import {
  ComplianceByActivityDto,
  ComplianceByResponsibleDto,
  ComplianceMetricsDto,
  ComplianceResponseDto,
} from './dto/compliance-response.dto';

/** Catalogo del tipo de actividad (sembrado por FEAT-001). */
const ACTIVITY_TYPE_CATALOG = 'RECURRING_ACTIVITY_TYPE';

/** Tamanos de pagina del listado de ocurrencias (igual que auditoria). */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Definicion con el catalogo embebido (no se usa; el service proyecta a DTO). */
type ActivityRow = Prisma.RecurringActivityGetPayload<Record<string, never>>;
type OccurrenceWithActivity = Prisma.RecurringActivityOccurrenceGetPayload<{
  include: { activity: true };
}>;

/** Resultado de una pasada de generacion (para logs y el endpoint manual). */
export interface GenerationResult {
  /** Definiciones activas evaluadas. */
  readonly activitiesProcessed: number;
  /** Ocurrencias efectivamente insertadas (sin contar duplicadas saltadas). */
  readonly occurrencesCreated: number;
}

/** Resultado de una pasada de marcado de vencidas. */
export interface OverdueResult {
  /** Ocurrencias que pasaron a VENCIDA en esta pasada. */
  readonly occurrencesMarkedOverdue: number;
}

/** Resultado de una pasada de envio de recordatorios (FEAT-003). */
export interface ReminderResult {
  /** Ocurrencias para las que se intento el recordatorio en esta pasada. */
  readonly remindersSent: number;
}

/**
 * Logica reutilizable del motor de actividades recurrentes (FEAT-001, design
 * §2). Sin crons ni HTTP aqui: el scheduler (cron) y el controller (endpoint
 * manual ADMIN) delegan en este service. Dos operaciones:
 *
 * - generateDueOccurrences: materializa las ocurrencias futuras de cada
 *   definicion activa dentro de su ventana de anticipacion. Usa createMany con
 *   skipDuplicates sobre el UNICO (activityId, targetDate), de modo que correr
 *   dos veces no duplica (idempotente por el indice unico).
 * - markOverdueOccurrences: pasa a VENCIDA las ocurrencias PENDIENTE/EN_CURSO
 *   cuyo targetDate ya quedo en el pasado. updateMany filtra por estado, asi
 *   que es idempotente: una segunda pasada no reafecta filas (ya no estan en
 *   PENDIENTE/EN_CURSO).
 *
 * El "hoy" se calcula con la MISMA receta canonica del helper (dia local de la
 * zona configurada), para que no se corra por la zona del proceso.
 */
@Injectable()
export class RecurringActivityService {
  private readonly logger = new Logger(RecurringActivityService.name);
  private readonly config: RecurringActivityConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {
    this.config = loadRecurringActivityConfig();
  }

  /** Expone la config resuelta (zona, crons, enabled) al scheduler. */
  getConfig(): RecurringActivityConfig {
    return this.config;
  }

  /**
   * Dia de calendario "hoy" en la zona configurada, como Date a medianoche UTC
   * (@db.Date). `now` es inyectable para pruebas deterministas.
   */
  today(now: Date = new Date()): Date {
    return toUtcDate(toLocalDate(now, this.config.timezone));
  }

  /**
   * Genera las ocurrencias debidas de todas las definiciones activas. Para cada
   * definicion calcula la ventana [hoy, hoy + anticipacion] (acotada por
   * endDate si existe), obtiene las fechas objetivo con la funcion pura y las
   * inserta con createMany skipDuplicates. Idempotente por (activityId,
   * targetDate).
   */
  async generateDueOccurrences(now: Date = new Date()): Promise<GenerationResult> {
    const todayUtc = this.today(now);

    const activities = await this.prisma.recurringActivity.findMany({
      where: { active: true },
    });

    let occurrencesCreated = 0;

    for (const activity of activities) {
      if (!isRecurrence(activity.cadence)) {
        this.logger.warn(
          `Definicion ${activity.id} con cadencia desconocida "${activity.cadence}"; se omite.`,
        );
        continue;
      }

      const anticipationDays =
        activity.anticipationDays ?? this.config.anticipationDays;

      const windowEndCandidate = addDaysUtc(todayUtc, anticipationDays);
      // Acotar la ventana por endDate de la definicion (recurrencia con fin).
      const windowEnd =
        activity.endDate && activity.endDate.getTime() < windowEndCandidate.getTime()
          ? activity.endDate
          : windowEndCandidate;

      const from =
        activity.startDate.getTime() > todayUtc.getTime()
          ? activity.startDate
          : todayUtc;

      const targetDates = nextTargetDatesFrom(
        activity.cadence,
        activity.intervalCount,
        activity.startDate,
        from,
        windowEnd,
      );

      if (targetDates.length === 0) {
        continue;
      }

      // Las ocurrencias YA existentes de este conjunto de fechas (idempotencia):
      // createMany skipDuplicates no dice cuales inserto, asi que calculamos las
      // NUEVAS = targetDates - existentes, para avisar solo de las que nacen.
      const existing = await this.prisma.recurringActivityOccurrence.findMany({
        where: { activityId: activity.id, targetDate: { in: targetDates } },
        select: { targetDate: true },
      });
      const existingKeys = new Set(
        existing.map((o) => o.targetDate.getTime()),
      );
      const newDates = targetDates.filter(
        (d) => !existingKeys.has(d.getTime()),
      );

      const result = await this.prisma.recurringActivityOccurrence.createMany({
        data: targetDates.map((targetDate) => ({
          activityId: activity.id,
          targetDate,
          status: OccurrenceStatus.PENDIENTE,
          periodLabel: periodLabelFor(
            activity.cadence as Recurrence,
            targetDate,
            this.config.timezone,
          ),
        })),
        skipDuplicates: true,
      });

      occurrencesCreated += result.count;

      // Aviso "nueva" por cada ocurrencia recien nacida. El correo NO debe
      // romper la generacion: degrada sin SMTP y cualquier fallo se registra y
      // se ignora (la fila ya quedo creada).
      for (const targetDate of newDates) {
        await this.notifyOccurrence(activity, targetDate, 'nueva');
      }
    }

    return {
      activitiesProcessed: activities.length,
      occurrencesCreated,
    };
  }

  /**
   * Recorre las ocurrencias PENDIENTE/EN_CURSO cuyo dia objetivo esta dentro de
   * la ventana de recordatorio (targetDate - hoy <= reminderDays) y que aun no
   * tienen recordatorio enviado (reminderSentAt null), envia el aviso
   * "recordatorio" y marca reminderSentAt. Idempotente: una segunda pasada no
   * reenvia porque reminderSentAt ya quedo establecido. El correo degrada sin
   * SMTP y nunca aborta el marcado.
   */
  async sendDueReminders(now: Date = new Date()): Promise<ReminderResult> {
    const todayUtc = this.today(now);
    const windowEnd = addDaysUtc(todayUtc, this.config.reminderDays);

    const occurrences = await this.prisma.recurringActivityOccurrence.findMany({
      where: {
        status: {
          in: [OccurrenceStatus.PENDIENTE, OccurrenceStatus.EN_CURSO],
        },
        reminderSentAt: null,
        targetDate: { lte: windowEnd },
        activity: { active: true },
      },
      include: { activity: true },
    });

    let remindersSent = 0;
    for (const occurrence of occurrences) {
      await this.notifyOccurrence(
        occurrence.activity,
        occurrence.targetDate,
        'recordatorio',
      );
      // Marca el recordatorio como enviado aunque el SMTP degrade: el aviso se
      // "intento" y no debe reintentarse en cada pasada (idempotencia por marca).
      await this.prisma.recurringActivityOccurrence.update({
        where: { id: occurrence.id },
        data: { reminderSentAt: now },
      });
      remindersSent += 1;
    }

    return { remindersSent };
  }

  /**
   * Resuelve los destinatarios de una definicion y envia el aviso por correo de
   * una ocurrencia (FEAT-003). Responsable USER -> la persona (identifier es el
   * correo); responsable AREA -> usuarios distintos con grant ACTIVO en algun
   * proceso de ESA area (regla inversa). Degrada sin SMTP y captura cualquier
   * error para no romper la generacion ni el recordatorio.
   */
  private async notifyOccurrence(
    activity: ActivityRow,
    targetDate: Date,
    kind: 'nueva' | 'recordatorio',
  ): Promise<void> {
    try {
      const recipients = await this.resolveRecipients(activity);
      if (recipients.length === 0) {
        return;
      }
      const activityUrl = this.recurringActivitiesUrl();
      const targetDateLabel = targetDate.toISOString().slice(0, 10);
      for (const recipient of recipients) {
        await this.mail.sendRecurringActivityNotice({
          to: recipient.identifier,
          name: recipient.name,
          kind,
          activityTitle: activity.title,
          targetDateLabel,
          activityUrl,
        });
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo enviar el aviso (${kind}) de la actividad ${activity.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Destinatarios de una definicion: la persona responsable (USER) o los
   * usuarios activos del area responsable (AREA, via grants activos en procesos
   * de esa area). Usa el identifier como correo (patron de invitacion).
   */
  private async resolveRecipients(
    activity: ActivityRow,
  ): Promise<Array<{ identifier: string; name: string }>> {
    if (
      activity.responsibleKind === ResponsibleKind.USER &&
      activity.responsibleUserId !== null
    ) {
      const user = await this.prisma.user.findFirst({
        where: { id: activity.responsibleUserId, active: true },
        select: { identifier: true, name: true },
      });
      return user ? [user] : [];
    }
    if (
      activity.responsibleKind === ResponsibleKind.AREA &&
      activity.responsibleAreaId !== null
    ) {
      const grants = await this.prisma.grant.findMany({
        where: {
          active: true,
          process: { areaId: activity.responsibleAreaId },
          user: { active: true },
        },
        select: { user: { select: { id: true, identifier: true, name: true } } },
      });
      const byId = new Map<string, { identifier: string; name: string }>();
      for (const grant of grants) {
        byId.set(grant.user.id, {
          identifier: grant.user.identifier,
          name: grant.user.name,
        });
      }
      return Array.from(byId.values());
    }
    return [];
  }

  /** URL de la seccion de actividades recurrentes del frontend (APP_WEB_URL). */
  private recurringActivitiesUrl(): string {
    const base = (process.env.APP_WEB_URL ?? '').replace(/\/+$/, '');
    return `${base}/actividades-recurrentes`;
  }

  /**
   * Marca VENCIDA toda ocurrencia PENDIENTE o EN_CURSO cuyo targetDate ya quedo
   * estrictamente en el pasado (targetDate < hoy). Idempotente: el filtro por
   * estado impide reafectar las ya marcadas.
   */
  async markOverdueOccurrences(now: Date = new Date()): Promise<OverdueResult> {
    const todayUtc = this.today(now);

    const result = await this.prisma.recurringActivityOccurrence.updateMany({
      where: {
        status: { in: [OccurrenceStatus.PENDIENTE, OccurrenceStatus.EN_CURSO] },
        targetDate: { lt: todayUtc },
      },
      data: { status: OccurrenceStatus.VENCIDA },
    });

    return { occurrencesMarkedOverdue: result.count };
  }

  // =========================================================================
  // FEAT-002: API REST (definiciones + ocurrencias) con autorizacion por
  // alcance. La regla UNICA de pertenencia a area deriva las areas del actor
  // (y las del responsable de una definicion) de los procesos via Grant/Area,
  // sin que el actor exponga areas directamente (design: CurrentActor no las
  // expone).
  // =========================================================================

  /**
   * Conjunto de areas del actor: areas de los procesos donde tiene grant
   * activo (actor.scopedProcessIds -> Process.areaId). Es la regla UNICA de
   * pertenencia a area reutilizada por alcance (scope=mine) y gestion.
   */
  private async actorAreaIds(actor: CurrentActor): Promise<Set<string>> {
    const ids = Array.from(actor.scopedProcessIds);
    if (ids.length === 0) {
      return new Set<string>();
    }
    const processes = await this.prisma.process.findMany({
      where: { id: { in: ids } },
      select: { areaId: true },
    });
    return new Set(processes.map((p) => p.areaId));
  }

  /**
   * Areas de un usuario: areas de los procesos donde el usuario tiene grant
   * ACTIVO (misma consulta que actorAreaIds pero por userId). Se usa para
   * validar que el JEFE_AREA gestione una definicion con responsable USER cuyo
   * usuario pertenezca a su area.
   */
  private async userAreaIds(userId: string): Promise<Set<string>> {
    const grants = await this.prisma.grant.findMany({
      where: { userId, active: true },
      select: { process: { select: { areaId: true } } },
    });
    return new Set(grants.map((g) => g.process.areaId));
  }

  private isManager(actor: CurrentActor): boolean {
    return actor.isAdmin || actor.roleCodes.has(RoleCode.JEFE_AREA);
  }

  /** Proyecta una definicion al contrato HTTP. */
  private toActivityResponse(
    activity: ActivityRow,
  ): RecurringActivityResponseDto {
    return {
      id: activity.id,
      title: activity.title,
      description: activity.description,
      activityType: activity.activityType,
      cadence: activity.cadence,
      intervalCount: activity.intervalCount,
      startDate: activity.startDate,
      endDate: activity.endDate,
      anticipationDays: activity.anticipationDays,
      responsibleKind: activity.responsibleKind,
      responsibleUserId: activity.responsibleUserId,
      responsibleAreaId: activity.responsibleAreaId,
      active: activity.active,
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
    };
  }

  /** Proyecta una ocurrencia (con su definicion) al contrato HTTP. */
  private toOccurrenceResponse(
    row: OccurrenceWithActivity,
  ): OccurrenceResponseDto {
    return {
      id: row.id,
      activityId: row.activityId,
      activityTitle: row.activity.title,
      activityType: row.activity.activityType,
      cadence: row.activity.cadence,
      responsibleKind: row.activity.responsibleKind,
      responsibleUserId: row.activity.responsibleUserId,
      responsibleAreaId: row.activity.responsibleAreaId,
      targetDate: row.targetDate,
      status: row.status,
      periodLabel: row.periodLabel,
      completedAt: row.completedAt,
      completedByUserId: row.completedByUserId,
      completionComment: row.completionComment,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private snapshot(activity: ActivityRow): Prisma.InputJsonValue {
    return {
      id: activity.id,
      title: activity.title,
      activityType: activity.activityType,
      cadence: activity.cadence,
      intervalCount: activity.intervalCount,
      responsibleKind: activity.responsibleKind,
      responsibleUserId: activity.responsibleUserId,
      responsibleAreaId: activity.responsibleAreaId,
      active: activity.active,
    };
  }

  private occurrenceSnapshot(
    row: OccurrenceWithActivity,
  ): Prisma.InputJsonValue {
    return {
      id: row.id,
      activityId: row.activityId,
      status: row.status,
      targetDate: row.targetDate.toISOString(),
      completedByUserId: row.completedByUserId,
    };
  }

  /** Normaliza un ISO date-time al dia de calendario a medianoche UTC (@db.Date). */
  private toCalendarDate(iso: string): Date {
    const d = new Date(iso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /**
   * Valida "exactamente un responsable" y que el activityType exista y este
   * activo en el catalogo. Lanza 409 (responsable incoherente) o 400
   * (activityType invalido).
   */
  private async assertDefinitionData(
    responsibleKind: ResponsibleKind,
    responsibleUserId: string | null,
    responsibleAreaId: string | null,
    activityType: string,
  ): Promise<void> {
    if (
      !isResponsibleAssignmentValid(
        responsibleKind,
        responsibleUserId,
        responsibleAreaId,
      )
    ) {
      throw new ConflictException(
        'Debe asignarse exactamente un responsable (un usuario o un area, segun el tipo).',
      );
    }
    const item = await this.prisma.catalogItem.findFirst({
      where: { catalog: ACTIVITY_TYPE_CATALOG, code: activityType, active: true },
      select: { id: true },
    });
    if (!item) {
      throw new BadRequestException('Revisa los datos ingresados.');
    }
  }

  /**
   * Comprueba que el actor puede GESTIONAR una definicion con el responsable
   * indicado: ADMIN sin restriccion; JEFE_AREA solo si el area objetivo (AREA)
   * o el area del usuario responsable (USER) esta en sus areas, si no 403.
   */
  private async assertCanManageResponsible(
    actor: CurrentActor,
    responsibleKind: ResponsibleKind,
    responsibleUserId: string | null,
    responsibleAreaId: string | null,
  ): Promise<void> {
    if (actor.isAdmin) {
      return;
    }
    const areaIds = await this.actorAreaIds(actor);
    if (responsibleKind === ResponsibleKind.AREA) {
      if (responsibleAreaId !== null && areaIds.has(responsibleAreaId)) {
        return;
      }
    } else if (responsibleUserId !== null) {
      const userAreas = await this.userAreaIds(responsibleUserId);
      for (const area of userAreas) {
        if (areaIds.has(area)) {
          return;
        }
      }
    }
    throw new ForbiddenException(
      'No puedes gestionar actividades recurrentes fuera de tu area.',
    );
  }

  // ----- CRUD de definiciones (gestion: JEFE_AREA acotado / ADMIN) ---------

  async createActivity(
    actor: CurrentActor,
    dto: CreateRecurringActivityDto,
  ): Promise<RecurringActivityResponseDto> {
    const responsibleUserId = dto.responsibleUserId ?? null;
    const responsibleAreaId = dto.responsibleAreaId ?? null;

    await this.assertDefinitionData(
      dto.responsibleKind,
      responsibleUserId,
      responsibleAreaId,
      dto.activityType,
    );
    await this.assertCanManageResponsible(
      actor,
      dto.responsibleKind,
      responsibleUserId,
      responsibleAreaId,
    );

    const startDate = this.toCalendarDate(dto.startDate);
    const endDate = dto.endDate !== undefined ? this.toCalendarDate(dto.endDate) : null;
    if (endDate !== null && endDate.getTime() < startDate.getTime()) {
      throw new ConflictException(
        'La fecha de fin no puede ser anterior a la fecha de inicio.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const activity = await tx.recurringActivity.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          activityType: dto.activityType,
          cadence: dto.cadence,
          intervalCount: dto.intervalCount ?? 1,
          startDate,
          endDate,
          anticipationDays: dto.anticipationDays ?? null,
          responsibleKind: dto.responsibleKind,
          responsibleUserId,
          responsibleAreaId,
          active: dto.active ?? true,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'RECURRING_ACTIVITY',
        objectId: activity.id,
        scopeProcessId: null,
        before: null,
        after: this.snapshot(activity),
      });
      return activity;
    });

    return this.toActivityResponse(created);
  }

  async findActivities(
    actor: CurrentActor,
  ): Promise<RecurringActivityResponseDto[]> {
    const where: Prisma.RecurringActivityWhereInput = {};
    if (!actor.isAdmin) {
      const areaIds = Array.from(await this.actorAreaIds(actor));
      // El jefe gestiona las definiciones de su area: por area responsable o
      // por usuario responsable con grant en un proceso de su area.
      where.OR = [
        { responsibleKind: ResponsibleKind.AREA, responsibleAreaId: { in: areaIds } },
        {
          responsibleKind: ResponsibleKind.USER,
          responsibleUser: {
            grants: { some: { active: true, process: { areaId: { in: areaIds } } } },
          },
        },
      ];
    }
    const activities = await this.prisma.recurringActivity.findMany({
      where,
      orderBy: [{ active: 'desc' }, { title: 'asc' }],
    });
    return activities.map((a) => this.toActivityResponse(a));
  }

  async findActivity(
    actor: CurrentActor,
    id: string,
  ): Promise<RecurringActivityResponseDto> {
    const activity = await this.prisma.recurringActivity.findUnique({
      where: { id },
    });
    if (!activity) {
      throw new NotFoundException('La actividad no existe o esta fuera de tu alcance.');
    }
    if (!actor.isAdmin) {
      await this.assertCanManageResponsible(
        actor,
        activity.responsibleKind as ResponsibleKind,
        activity.responsibleUserId,
        activity.responsibleAreaId,
      ).catch(() => {
        throw new NotFoundException(
          'La actividad no existe o esta fuera de tu alcance.',
        );
      });
    }
    return this.toActivityResponse(activity);
  }

  async updateActivity(
    actor: CurrentActor,
    id: string,
    dto: UpdateRecurringActivityDto,
  ): Promise<RecurringActivityResponseDto> {
    const existing = await this.prisma.recurringActivity.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('La actividad no existe o esta fuera de tu alcance.');
    }

    // Gestion sobre el estado ACTUAL (403/404 fuera de area).
    await this.assertManageOrNotFound(
      actor,
      existing.responsibleKind as ResponsibleKind,
      existing.responsibleUserId,
      existing.responsibleAreaId,
    );

    const responsibleKind = (dto.responsibleKind ?? existing.responsibleKind) as ResponsibleKind;
    const responsibleUserId =
      dto.responsibleUserId !== undefined ? dto.responsibleUserId : existing.responsibleUserId;
    const responsibleAreaId =
      dto.responsibleAreaId !== undefined ? dto.responsibleAreaId : existing.responsibleAreaId;
    const activityType = dto.activityType ?? existing.activityType;

    // Si el responsable cambia, normaliza el par (al cambiar de kind el id
    // opuesto se limpia salvo que el DTO lo defina) y valida.
    const nextUserId =
      responsibleKind === ResponsibleKind.USER ? responsibleUserId : null;
    const nextAreaId =
      responsibleKind === ResponsibleKind.AREA ? responsibleAreaId : null;

    await this.assertDefinitionData(
      responsibleKind,
      nextUserId,
      nextAreaId,
      activityType,
    );
    // Gestion tambien sobre el responsable DESTINO (no mover fuera del area).
    await this.assertCanManageResponsible(
      actor,
      responsibleKind,
      nextUserId,
      nextAreaId,
    );

    const startDate =
      dto.startDate !== undefined ? this.toCalendarDate(dto.startDate) : existing.startDate;
    const endDate =
      dto.endDate !== undefined ? this.toCalendarDate(dto.endDate) : existing.endDate;
    if (endDate !== null && endDate.getTime() < startDate.getTime()) {
      throw new ConflictException(
        'La fecha de fin no puede ser anterior a la fecha de inicio.',
      );
    }

    const data: Prisma.RecurringActivityUpdateInput = {
      responsibleKind,
      activityType,
      cadence: dto.cadence ?? existing.cadence,
      intervalCount: dto.intervalCount ?? existing.intervalCount,
      startDate,
      endDate,
      title: dto.title ?? existing.title,
      // responsable: conectar/desconectar segun kind destino.
      responsibleUser:
        nextUserId !== null
          ? { connect: { id: nextUserId } }
          : { disconnect: true },
      responsibleArea:
        nextAreaId !== null
          ? { connect: { id: nextAreaId } }
          : { disconnect: true },
    };
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.anticipationDays !== undefined) {
      data.anticipationDays = dto.anticipationDays ?? null;
    }
    if (dto.active !== undefined) data.active = dto.active;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.recurringActivity.update({ where: { id }, data });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'RECURRING_ACTIVITY',
        objectId: id,
        scopeProcessId: null,
        before: this.snapshot(existing),
        after: this.snapshot(next),
      });
      return next;
    });

    return this.toActivityResponse(updated);
  }

  /**
   * "Borrado" de una definicion = soft-delete (active=false). NO elimina la
   * fila ni sus ocurrencias: pausa la generacion futura y conserva el historial.
   */
  async removeActivity(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.prisma.recurringActivity.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('La actividad no existe o esta fuera de tu alcance.');
    }
    await this.assertManageOrNotFound(
      actor,
      existing.responsibleKind as ResponsibleKind,
      existing.responsibleUserId,
      existing.responsibleAreaId,
    );

    if (!existing.active) {
      return; // Ya pausada: idempotente.
    }

    await this.prisma.$transaction(async (tx) => {
      const next = await tx.recurringActivity.update({
        where: { id },
        data: { active: false },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'RECURRING_ACTIVITY',
        objectId: id,
        scopeProcessId: null,
        before: this.snapshot(existing),
        after: this.snapshot(next),
      });
    });
  }

  /** Gestion sobre un responsable; 404 (no 403) para no filtrar existencia. */
  private async assertManageOrNotFound(
    actor: CurrentActor,
    responsibleKind: ResponsibleKind,
    responsibleUserId: string | null,
    responsibleAreaId: string | null,
  ): Promise<void> {
    if (actor.isAdmin) {
      return;
    }
    try {
      await this.assertCanManageResponsible(
        actor,
        responsibleKind,
        responsibleUserId,
        responsibleAreaId,
      );
    } catch {
      throw new NotFoundException(
        'La actividad no existe o esta fuera de tu alcance.',
      );
    }
  }

  // ----- Ocurrencias (operacion por los 3 roles; alcance mine/all) ---------

  /**
   * Lista ocurrencias por alcance (design FEAT-002):
   * - scope=mine (default): ocurrencias cuya definicion tiene al actor como
   *   responsable USER, o es AREA de un area del actor.
   * - scope=all: solo JEFE_AREA/ADMIN. ADMIN ve todo; JEFE_AREA acotado a sus
   *   areas (por area responsable o por usuario responsable con grant alli).
   * Los filtros intersectan el alcance. pageSize <= 100.
   */
  async findOccurrences(
    actor: CurrentActor,
    filters: ListOccurrencesDto,
  ): Promise<PaginatedOccurrencesResponseDto> {
    const scope = filters.scope ?? 'mine';
    if (scope === 'all' && !this.isManager(actor)) {
      throw new ForbiddenException(
        'Solo jefe de area o admin pueden ver todas las actividades.',
      );
    }

    const areaIds = Array.from(await this.actorAreaIds(actor));
    const scopeFilter = await this.buildOccurrenceScopeFilter(
      actor,
      scope,
      areaIds,
    );

    const activityConditions: Prisma.RecurringActivityWhereInput[] = [scopeFilter];
    if (filters.cadence !== undefined) {
      activityConditions.push({ cadence: filters.cadence });
    }
    if (filters.activityType !== undefined) {
      activityConditions.push({ activityType: filters.activityType });
    }
    if (filters.responsibleUserId !== undefined) {
      activityConditions.push({ responsibleUserId: filters.responsibleUserId });
    }
    if (filters.responsibleAreaId !== undefined) {
      activityConditions.push({ responsibleAreaId: filters.responsibleAreaId });
    }

    const where: Prisma.RecurringActivityOccurrenceWhereInput = {
      activity: { AND: activityConditions },
    };
    if (filters.status !== undefined) {
      where.status = filters.status;
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      where.targetDate = {};
      if (filters.from !== undefined) {
        where.targetDate.gte = this.toCalendarDate(filters.from);
      }
      if (filters.to !== undefined) {
        where.targetDate.lte = this.toCalendarDate(filters.to);
      }
    }

    const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = filters.page ?? 1;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.recurringActivityOccurrence.findMany({
        where,
        include: { activity: true },
        orderBy: [{ targetDate: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.recurringActivityOccurrence.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toOccurrenceResponse(r)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  private async buildOccurrenceScopeFilter(
    actor: CurrentActor,
    scope: 'mine' | 'all',
    areaIds: string[],
  ): Promise<Prisma.RecurringActivityWhereInput> {
    if (scope === 'mine') {
      // Definicion con el actor como responsable USER, o AREA de su area.
      return {
        OR: [
          { responsibleKind: ResponsibleKind.USER, responsibleUserId: actor.userId },
          { responsibleKind: ResponsibleKind.AREA, responsibleAreaId: { in: areaIds } },
        ],
      };
    }
    // scope=all.
    if (actor.isAdmin) {
      return {};
    }
    // JEFE_AREA: acotado a sus areas (por area responsable o usuario con grant).
    return {
      OR: [
        { responsibleKind: ResponsibleKind.AREA, responsibleAreaId: { in: areaIds } },
        {
          responsibleKind: ResponsibleKind.USER,
          responsibleUser: {
            grants: { some: { active: true, process: { areaId: { in: areaIds } } } },
          },
        },
      ],
    };
  }

  /** Detalle de una ocurrencia dentro del alcance del actor (404 si no). */
  async findOccurrence(
    actor: CurrentActor,
    id: string,
  ): Promise<OccurrenceResponseDto> {
    const row = await this.requireOccurrenceInScope(actor, id);
    return this.toOccurrenceResponse(row);
  }

  /**
   * Inicia (toma) una ocurrencia: PENDIENTE -> EN_CURSO. 409 si la transicion
   * no esta permitida desde el estado actual.
   */
  async startOccurrence(
    actor: CurrentActor,
    id: string,
  ): Promise<OccurrenceResponseDto> {
    const row = await this.requireOccurrenceInScope(actor, id);
    this.assertOccurrenceTransition(row.status, OccurrenceStatus.EN_CURSO);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.recurringActivityOccurrence.update({
        where: { id },
        data: { status: OccurrenceStatus.EN_CURSO },
        include: { activity: true },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'RECURRING_ACTIVITY_OCCURRENCE',
        objectId: id,
        scopeProcessId: null,
        before: this.occurrenceSnapshot(row),
        after: this.occurrenceSnapshot(next),
      });
      return next;
    });
    return this.toOccurrenceResponse(updated);
  }

  /**
   * Completa una ocurrencia (comentario opcional): -> COMPLETADA desde
   * PENDIENTE/EN_CURSO/VENCIDA. Registra completedAt/completedBy. 409 si no se
   * permite la transicion.
   */
  async completeOccurrence(
    actor: CurrentActor,
    id: string,
    dto: CompleteOccurrenceDto,
  ): Promise<OccurrenceResponseDto> {
    const row = await this.requireOccurrenceInScope(actor, id);
    this.assertOccurrenceTransition(row.status, OccurrenceStatus.COMPLETADA);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.recurringActivityOccurrence.update({
        where: { id },
        data: {
          status: OccurrenceStatus.COMPLETADA,
          completedAt: new Date(),
          completedBy: { connect: { id: actor.userId } },
          completionComment: dto.comment ?? null,
        },
        include: { activity: true },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'RECURRING_ACTIVITY_OCCURRENCE',
        objectId: id,
        scopeProcessId: null,
        before: this.occurrenceSnapshot(row),
        after: this.occurrenceSnapshot(next),
      });
      return next;
    });
    return this.toOccurrenceResponse(updated);
  }

  // ----- Panel de cumplimiento (FEAT-003, JEFE_AREA/ADMIN) -----------------

  /**
   * Agrega el cumplimiento de las ocurrencias en una ventana de fechas (design
   * FEAT-003). Solo JEFE_AREA/ADMIN: ADMIN sin restriccion; JEFE_AREA acotado a
   * sus areas (por area responsable o por usuario responsable con grant alli).
   * Clasifica cada ocurrencia en a tiempo / a destiempo / vencida / pendiente y
   * devuelve totales mas desgloses por actividad y por responsable.
   */
  async getCompliance(
    actor: CurrentActor,
    filters: ComplianceQueryDto,
  ): Promise<ComplianceResponseDto> {
    if (!this.isManager(actor)) {
      throw new ForbiddenException(
        'Solo jefe de area o admin pueden ver el panel de cumplimiento.',
      );
    }

    const areaIds = Array.from(await this.actorAreaIds(actor));
    const scopeFilter = await this.buildOccurrenceScopeFilter(
      actor,
      'all',
      areaIds,
    );

    const activityConditions: Prisma.RecurringActivityWhereInput[] = [scopeFilter];
    if (filters.responsibleUserId !== undefined) {
      activityConditions.push({ responsibleUserId: filters.responsibleUserId });
    }
    if (filters.responsibleAreaId !== undefined) {
      activityConditions.push({ responsibleAreaId: filters.responsibleAreaId });
    }

    const where: Prisma.RecurringActivityOccurrenceWhereInput = {
      activity: { AND: activityConditions },
    };
    const fromDate =
      filters.from !== undefined ? this.toCalendarDate(filters.from) : null;
    const toDate =
      filters.to !== undefined ? this.toCalendarDate(filters.to) : null;
    if (fromDate !== null || toDate !== null) {
      where.targetDate = {};
      if (fromDate !== null) where.targetDate.gte = fromDate;
      if (toDate !== null) where.targetDate.lte = toDate;
    }

    const rows = await this.prisma.recurringActivityOccurrence.findMany({
      where,
      include: { activity: true },
    });

    const totals = emptyMetrics();
    const byActivity = new Map<string, ComplianceByActivityDto>();
    const byResponsible = new Map<string, ComplianceByResponsibleDto>();

    for (const row of rows) {
      const bucket = classifyOccurrence(row.status, row.completedAt, row.targetDate);
      addToMetrics(totals, bucket);

      // Agregado por actividad.
      let activityRow = byActivity.get(row.activityId);
      if (!activityRow) {
        activityRow = {
          activityId: row.activityId,
          activityTitle: row.activity.title,
          cadence: row.activity.cadence,
          responsibleKind: row.activity.responsibleKind,
          responsibleUserId: row.activity.responsibleUserId,
          responsibleAreaId: row.activity.responsibleAreaId,
          metrics: emptyMetrics(),
        };
        byActivity.set(row.activityId, activityRow);
      }
      addToMetrics(activityRow.metrics, bucket);

      // Agregado por responsable (clave estable por kind + id).
      const responsibleKey =
        row.activity.responsibleKind === ResponsibleKind.USER
          ? `USER:${row.activity.responsibleUserId ?? ''}`
          : `AREA:${row.activity.responsibleAreaId ?? ''}`;
      let responsibleRow = byResponsible.get(responsibleKey);
      if (!responsibleRow) {
        responsibleRow = {
          responsibleKind: row.activity.responsibleKind,
          responsibleUserId: row.activity.responsibleUserId,
          responsibleAreaId: row.activity.responsibleAreaId,
          metrics: emptyMetrics(),
        };
        byResponsible.set(responsibleKey, responsibleRow);
      }
      addToMetrics(responsibleRow.metrics, bucket);
    }

    return {
      from: fromDate !== null ? fromDate.toISOString() : null,
      to: toDate !== null ? toDate.toISOString() : null,
      totals,
      byActivity: Array.from(byActivity.values()).sort((a, b) =>
        a.activityTitle.localeCompare(b.activityTitle),
      ),
      byResponsible: Array.from(byResponsible.values()),
    };
  }

  /** Valida f->t; 409 ConflictException si no esta permitida. */
  private assertOccurrenceTransition(from: string, to: OccurrenceStatus): void {
    if (!isOccurrenceStatus(from)) {
      // Estado no tipado en BD: fallo de integridad, no del cliente.
      throw new ConflictException('Estado de la ocurrencia no reconocido.');
    }
    if (!isOccurrenceTransitionAllowed(from, to)) {
      throw new ConflictException(
        `No se permite pasar de ${from} a ${to}.`,
      );
    }
  }

  /**
   * Carga una ocurrencia y comprueba que esta en el alcance del actor (es
   * suya: responsable USER o AREA de su area). ADMIN/JEFE_AREA tambien pueden
   * sobre su area. 404 si no existe o esta fuera de alcance.
   */
  private async requireOccurrenceInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<OccurrenceWithActivity> {
    const row = await this.prisma.recurringActivityOccurrence.findUnique({
      where: { id },
      include: { activity: true },
    });
    if (!row) {
      throw new NotFoundException('La ocurrencia no existe o esta fuera de tu alcance.');
    }
    const activity = row.activity;

    if (
      activity.responsibleKind === ResponsibleKind.USER &&
      activity.responsibleUserId === actor.userId
    ) {
      return row;
    }
    if (actor.isAdmin) {
      return row;
    }
    const areaIds = await this.actorAreaIds(actor);
    if (
      activity.responsibleKind === ResponsibleKind.AREA &&
      activity.responsibleAreaId !== null &&
      areaIds.has(activity.responsibleAreaId)
    ) {
      return row;
    }
    // Jefe puede operar ocurrencias de un usuario responsable de su area.
    if (
      activity.responsibleKind === ResponsibleKind.USER &&
      activity.responsibleUserId !== null &&
      actor.roleCodes.has(RoleCode.JEFE_AREA)
    ) {
      const userAreas = await this.userAreaIds(activity.responsibleUserId);
      for (const area of userAreas) {
        if (areaIds.has(area)) {
          return row;
        }
      }
    }
    throw new NotFoundException('La ocurrencia no existe o esta fuera de tu alcance.');
  }
}

/** Bucket de clasificacion de cumplimiento de una ocurrencia. */
type ComplianceBucket = 'onTime' | 'late' | 'overdue' | 'pending';

/** Metricas de cumplimiento en cero. */
function emptyMetrics(): ComplianceMetricsDto {
  return { onTime: 0, late: 0, overdue: 0, pending: 0, total: 0 };
}

/** Suma 1 al bucket correspondiente y al total. */
function addToMetrics(metrics: ComplianceMetricsDto, bucket: ComplianceBucket): void {
  metrics[bucket] += 1;
  metrics.total += 1;
}

/**
 * Clasifica una ocurrencia para el panel de cumplimiento: COMPLETADA a tiempo
 * (completedAt <= targetDate) o a destiempo (completedAt > targetDate), VENCIDA
 * = overdue, y PENDIENTE/EN_CURSO = pending. Las fechas son @db.Date a
 * medianoche UTC; completedAt es un instante: "a tiempo" si el dia de completado
 * no supera el dia objetivo (se compara al final del dia objetivo).
 */
function classifyOccurrence(
  status: string,
  completedAt: Date | null,
  targetDate: Date,
): ComplianceBucket {
  if (status === OccurrenceStatus.COMPLETADA) {
    if (completedAt === null) {
      // Completada sin marca de tiempo: se cuenta como a tiempo (sin evidencia
      // de retraso). No deberia ocurrir (complete siempre setea completedAt).
      return 'onTime';
    }
    // Fin del dia objetivo (23:59:59.999 UTC) como limite de "a tiempo".
    const deadline = targetDate.getTime() + 24 * 60 * 60 * 1000 - 1;
    return completedAt.getTime() <= deadline ? 'onTime' : 'late';
  }
  if (status === OccurrenceStatus.VENCIDA) {
    return 'overdue';
  }
  return 'pending';
}

/** Suma `days` dias a un Date de calendario (medianoche UTC) sin tocar la zona. */
function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Etiqueta legible del periodo de una ocurrencia a partir de su fecha objetivo
 * y la cadencia. Para fechas de calendario se usa el dia local de la zona.
 * Formatos: SEMANAL "YYYY-Www" (semana ISO), MENSUAL "YYYY-MM", TRIMESTRAL
 * "YYYY-Qn", SEMESTRAL "YYYY-Hn", ANUAL "YYYY".
 */
function periodLabelFor(
  cadence: Recurrence,
  targetDate: Date,
  _timeZone: string,
): string {
  // targetDate es un @db.Date (medianoche UTC): su dia es la terna UTC.
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;
  switch (cadence) {
    case Recurrence.SEMANAL:
      return `${isoYearWeek(targetDate)}`;
    case Recurrence.MENSUAL:
      return `${year}-${pad2(month)}`;
    case Recurrence.TRIMESTRAL:
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    case Recurrence.SEMESTRAL:
      return `${year}-H${Math.floor((month - 1) / 6) + 1}`;
    case Recurrence.ANUAL:
      return `${year}`;
    default: {
      const exhaustive: never = cadence;
      throw new Error(`Cadencia no soportada: ${String(exhaustive)}`);
    }
  }
}

/** "YYYY-Www" con semana ISO-8601 (lunes como primer dia) del @db.Date (UTC). */
function isoYearWeek(targetDate: Date): string {
  // targetDate es un @db.Date a medianoche UTC: operamos directamente en UTC.
  const date = new Date(targetDate.getTime());
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // lunes=0..domingo=6
  // Jueves de la semana actual determina el ano ISO.
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDow + 3);
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  return `${isoYear}-W${pad2(week)}`;
}

/** Entero a 2 digitos con cero a la izquierda. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
