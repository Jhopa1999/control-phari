import { loadRecurringActivityConfig } from '../recurring-activity/recurring-activity.config';
import { toLocalDate, toUtcDate } from '../recurring-activity/recurrence';

/**
 * Dia local de la aplicacion (zona configurada para el modulo recurrente,
 * `RECURRING_ACTIVITY_TIMEZONE`, por defecto America/Lima). Envuelve la receta
 * D13 de `recurrence.ts` para que Bitacora y Compromisos no repitan la logica.
 * Los dias se devuelven anclados a medianoche UTC (igual que las columnas
 * `@db.Date`), listos para compararse con ellas.
 */
export function appTimeZone(): string {
  return loadRecurringActivityConfig().timezone;
}

/** Dia local (medianoche UTC) del instante dado. */
export function localDayOf(instant: Date, timeZone: string = appTimeZone()): Date {
  return toUtcDate(toLocalDate(instant, timeZone));
}

/** Hoy en la zona de la aplicacion (medianoche UTC). */
export function localToday(now: Date = new Date()): Date {
  return localDayOf(now);
}
