import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
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
import { OccurrenceStatus } from './occurrence-status';
import {
  loadRecurringActivityConfig,
  RecurringActivityConfig,
} from './recurring-activity.config';

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

  constructor(private readonly prisma: PrismaService) {
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
    }

    return {
      activitiesProcessed: activities.length,
      occurrencesCreated,
    };
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
