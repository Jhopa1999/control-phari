import { OccurrenceStatus } from './occurrence-status';
import { toLocalDate, toUtcDate } from './recurrence';

/**
 * Estado de PRESENTACION de una ocurrencia (rediseno de actividades
 * recurrentes). Es derivado: se calcula en lectura a partir del estado
 * persistido, las fechas y los dias de preparacion de la definicion, sin cron
 * que lo "abra". El frontend solo mapea cada codigo a etiqueta/tono/icono.
 */
export enum OccurrenceDisplayStatus {
  /** Futura: aun no entra en su ventana de preparacion. */
  PROGRAMADA = 'PROGRAMADA',
  /** Ventana abierta, aun no tomada. */
  PENDIENTE = 'PENDIENTE',
  EN_CURSO = 'EN_CURSO',
  /** PENDIENTE/EN_CURSO cuyo dia objetivo es hoy. */
  VENCE_HOY = 'VENCE_HOY',
  /** Dia objetivo pasado sin completar. */
  VENCIDA = 'VENCIDA',
  COMPLETADA = 'COMPLETADA',
  /** Completada despues de su dia objetivo (dia local de completedAt). */
  COMPLETADA_TARDE = 'COMPLETADA_TARDE',
  CANCELADA = 'CANCELADA',
}

/** Resultado del calculo de presentacion de una ocurrencia. */
export interface OccurrenceDisplay {
  readonly displayStatus: OccurrenceDisplayStatus;
  /** Se puede "tomar" ahora (solo PENDIENTE con ventana abierta). */
  readonly canStart: boolean;
  /** Se puede completar ahora (ventana abierta y no terminal). */
  readonly canComplete: boolean;
  /** Dia (medianoche UTC) desde el que se habilita: targetDate - prepDays. */
  readonly opensOn: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dia (medianoche UTC) en que se abre la ventana: targetDate - prepDays. */
export function opensOnFor(targetDate: Date, prepDays: number): Date {
  return new Date(targetDate.getTime() - prepDays * DAY_MS);
}

/**
 * La ventana esta abierta si hoy >= targetDate - prepDays. Todos los valores
 * son dias de calendario (medianoche UTC).
 */
export function isWindowOpen(
  targetDate: Date,
  prepDays: number,
  today: Date,
): boolean {
  return today.getTime() >= opensOnFor(targetDate, prepDays).getTime();
}

/**
 * Calcula el estado de presentacion y las acciones permitidas. `today` es el
 * dia local (medianoche UTC) de la zona configurada y `timeZone` se usa solo
 * para proyectar el instante `completedAt` a su dia local.
 *
 * Reglas:
 * - CANCELADA y COMPLETADA son terminales (sin acciones).
 * - PENDIENTE/EN_CURSO con targetDate < hoy se muestran VENCIDA aunque el
 *   cron nocturno aun no corra. VENCIDA solo se puede completar (no tomar).
 * - PENDIENTE con targetDate = hoy es VENCE_HOY; con ventana abierta es
 *   PENDIENTE; antes de abrir es PROGRAMADA (sin acciones).
 * - EN_CURSO ya fue tomada dentro de su ventana: siempre se puede completar.
 */
export function computeOccurrenceDisplay(
  row: {
    readonly status: string;
    readonly targetDate: Date;
    readonly completedAt: Date | null;
  },
  activity: { readonly prepDays: number },
  today: Date,
  timeZone: string,
): OccurrenceDisplay {
  const opensOn = opensOnFor(row.targetDate, activity.prepDays);
  const done = (
    displayStatus: OccurrenceDisplayStatus,
    canStart: boolean,
    canComplete: boolean,
  ): OccurrenceDisplay => ({ displayStatus, canStart, canComplete, opensOn });

  if (row.status === OccurrenceStatus.CANCELADA) {
    return done(OccurrenceDisplayStatus.CANCELADA, false, false);
  }

  if (row.status === OccurrenceStatus.COMPLETADA) {
    const late =
      row.completedAt !== null &&
      toUtcDate(toLocalDate(row.completedAt, timeZone)).getTime() >
        row.targetDate.getTime();
    return done(
      late
        ? OccurrenceDisplayStatus.COMPLETADA_TARDE
        : OccurrenceDisplayStatus.COMPLETADA,
      false,
      false,
    );
  }

  const target = row.targetDate.getTime();
  const now = today.getTime();

  if (row.status === OccurrenceStatus.VENCIDA || target < now) {
    return done(OccurrenceDisplayStatus.VENCIDA, false, true);
  }

  if (row.status === OccurrenceStatus.EN_CURSO) {
    return done(
      target === now
        ? OccurrenceDisplayStatus.VENCE_HOY
        : OccurrenceDisplayStatus.EN_CURSO,
      false,
      true,
    );
  }

  // PENDIENTE (target >= hoy).
  if (!isWindowOpen(row.targetDate, activity.prepDays, today)) {
    return done(OccurrenceDisplayStatus.PROGRAMADA, false, false);
  }
  return done(
    target === now
      ? OccurrenceDisplayStatus.VENCE_HOY
      : OccurrenceDisplayStatus.PENDIENTE,
    true,
    true,
  );
}
