import { diffTaskSnapshots } from '../../plan/task/task-history';
import { roundToQuarter } from './quarter-hours';

/**
 * Funciones puras de las sugerencias de tiempo de la Bitácora (testeables sin
 * base de datos): horas de una reunión u ocurrencia y «tarea trabajada ese día».
 */

/** Horas de una reunión según su duración (minutos múltiplo de 15 -> paso 0,25 exacto). */
export function meetingHours(durationMinutes: number | null): number | null {
  if (durationMinutes === null || durationMinutes === undefined || durationMinutes <= 0) {
    return null;
  }
  return roundToQuarter(durationMinutes / 60);
}

/** Horas de una ocurrencia completada, redondeadas al 0,25 más cercano. */
export function occurrenceHours(actualHours: number): {
  hours: number;
  adjusted: boolean;
} {
  const hours = roundToQuarter(actualHours);
  return { hours, adjusted: Math.abs(hours - actualHours) > 1e-9 };
}

export interface TaskReason {
  field: 'progress' | 'status';
  from: string | null;
  to: string | null;
}

const WORK_FIELDS = new Set(['progress', 'status']);

/**
 * Cambios de avance o estado entre dos snapshots de auditoría de una tarea
 * (reutiliza `diffTaskSnapshots`). Otros campos (título, fechas, aceptación,
 * evidencias) no cuentan como trabajo del día.
 */
export function taskWorkReasons(before: unknown, after: unknown): TaskReason[] {
  return diffTaskSnapshots(before, after, (_field, value) => value)
    .filter((c) => WORK_FIELDS.has(c.field))
    .map((c) => ({ field: c.field as TaskReason['field'], from: c.from, to: c.to }));
}

/**
 * Une los cambios de una misma tarea en el día (eventos en orden cronológico):
 * por campo, el «desde» del primero y el «hasta» del último. Si el campo volvió a
 * su valor inicial no se informa.
 */
export function mergeTaskReasons(events: TaskReason[][]): TaskReason[] {
  const byField = new Map<string, TaskReason>();
  for (const reasons of events) {
    for (const r of reasons) {
      const prev = byField.get(r.field);
      byField.set(r.field, prev ? { ...prev, to: r.to } : { ...r });
    }
  }
  return [...byField.values()].filter((r) => r.from !== r.to);
}
