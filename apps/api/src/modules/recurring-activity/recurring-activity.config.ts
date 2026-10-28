/**
 * Configuracion del motor de actividades recurrentes, leida del ENTORNO con
 * defaults seguros (patron mail.config.ts). Ningun valor es secreto: son
 * parametros por-ambiente (zona horaria, ventana de anticipacion, expresiones
 * cron y bandera de activacion). Nunca lanza: si una variable falta o es
 * invalida se aplica el default documentado en .env.example.
 */
export interface RecurringActivityConfig {
  /** Zona horaria del calendario de ocurrencias (receta canonica D13). */
  readonly timezone: string;
  /** Dias de anticipacion por defecto para generar ocurrencias futuras. */
  readonly anticipationDays: number;
  /** Cron de la generacion de ocurrencias (formato @nestjs/schedule). */
  readonly generationCron: string;
  /** Cron del marcado de ocurrencias vencidas. */
  readonly overdueCron: string;
  /** Dias de antelacion al targetDate para enviar el recordatorio por correo. */
  readonly reminderDays: number;
  /** Cron del envio de recordatorios por correo. */
  readonly reminderCron: string;
  /** Si false, los crons del scheduler NO ejecutan trabajo (in-process). */
  readonly schedulerEnabled: boolean;
}

const DEFAULTS = {
  timezone: 'America/Lima',
  anticipationDays: 14,
  generationCron: '0 1 * * *',
  overdueCron: '0 2 * * *',
  reminderDays: 3,
  reminderCron: '0 3 * * *',
  schedulerEnabled: true,
} as const;

/**
 * Lee la configuracion del entorno aplicando defaults. RECURRING_ACTIVITY_
 * _ANTICIPATION_DAYS solo se acepta si es un entero > 0; en otro caso se usa el
 * default (14). RECURRING_ACTIVITY_SCHEDULER_ENABLED es true salvo que se
 * escriba exactamente "false" (case-insensitive). Los cron se toman tal cual si
 * no estan vacios.
 */
export function loadRecurringActivityConfig(): RecurringActivityConfig {
  const timezone = nonEmpty(process.env.RECURRING_ACTIVITY_TIMEZONE) ?? DEFAULTS.timezone;

  const anticipationRaw = nonEmpty(process.env.RECURRING_ACTIVITY_ANTICIPATION_DAYS);
  const anticipationParsed = anticipationRaw ? Number(anticipationRaw) : NaN;
  const anticipationDays =
    Number.isInteger(anticipationParsed) && anticipationParsed > 0
      ? anticipationParsed
      : DEFAULTS.anticipationDays;

  const generationCron =
    nonEmpty(process.env.RECURRING_ACTIVITY_GENERATION_CRON) ?? DEFAULTS.generationCron;
  const overdueCron =
    nonEmpty(process.env.RECURRING_ACTIVITY_OVERDUE_CRON) ?? DEFAULTS.overdueCron;

  const reminderRaw = nonEmpty(process.env.RECURRING_ACTIVITY_REMINDER_DAYS);
  const reminderParsed = reminderRaw ? Number(reminderRaw) : NaN;
  const reminderDays =
    Number.isInteger(reminderParsed) && reminderParsed >= 0
      ? reminderParsed
      : DEFAULTS.reminderDays;

  const reminderCron =
    nonEmpty(process.env.RECURRING_ACTIVITY_REMINDER_CRON) ?? DEFAULTS.reminderCron;

  const enabledRaw = nonEmpty(process.env.RECURRING_ACTIVITY_SCHEDULER_ENABLED);
  const schedulerEnabled = enabledRaw
    ? enabledRaw.toLowerCase() !== 'false'
    : DEFAULTS.schedulerEnabled;

  return {
    timezone,
    anticipationDays,
    generationCron,
    overdueCron,
    reminderDays,
    reminderCron,
    schedulerEnabled,
  };
}

/** Devuelve el valor recortado si no es vacio, o undefined. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '' ? trimmed : undefined;
}
