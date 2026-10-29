/**
 * Calculos puros del portafolio: avance del proyecto y alerta de fecha objetivo.
 * Sin acceso a datos para poder probarlos de forma aislada.
 */

/** Alerta de la fecha objetivo de una iniciativa. */
export type DueStatus =
  | 'SIN_FECHA'
  | 'EN_TIEMPO'
  | 'PROXIMO_A_VENCER'
  | 'VENCIDO'
  | 'NO_APLICA';

/** Estados operativos en los que la fecha objetivo ya no genera alerta. */
const CLOSED_STATES: ReadonlySet<string> = new Set(['CERRADA', 'RECHAZADA', 'RETIRADA']);

/** Dias de anticipacion por defecto para "proximo a vencer". */
export const DEFAULT_DUE_SOON_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Lee `PORTFOLIO_DUE_SOON_DAYS` (entero >= 0); si no es valido, el default. */
export function dueSoonDaysFromEnv(raw: string | undefined): number {
  const parsed = raw?.trim() ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_DUE_SOON_DAYS;
}

export interface TaskProgressInput {
  status: string;
  progress: number;
}

/**
 * Avance del proyecto (0..100): promedio del avance de sus tareas, donde una
 * tarea TERMINADA cuenta 100. `null` si el proyecto no tiene tareas.
 */
export function computeProgressPercent(tasks: TaskProgressInput[]): number | null {
  if (tasks.length === 0) {
    return null;
  }
  const total = tasks.reduce((sum, task) => {
    const value = task.status === 'TERMINADA' ? 100 : task.progress;
    return sum + Math.min(100, Math.max(0, value));
  }, 0);
  return Math.round(total / tasks.length);
}

/** Dias enteros desde `today` (UTC) hasta `target` (`YYYY-MM-DD`); negativo = vencido. */
export function daysUntil(target: Date, today: Date): number {
  const t = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const n = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((t - n) / MS_PER_DAY);
}

export interface DueAlert {
  dueStatus: DueStatus;
  daysToTarget: number | null;
}

/** Alerta segun la fecha objetivo y el estado operativo. */
export function computeDueAlert(
  targetDate: Date | null,
  operationalState: string,
  today: Date,
  dueSoonDays: number,
): DueAlert {
  if (CLOSED_STATES.has(operationalState)) {
    return { dueStatus: 'NO_APLICA', daysToTarget: null };
  }
  if (targetDate === null) {
    return { dueStatus: 'SIN_FECHA', daysToTarget: null };
  }
  const days = daysUntil(targetDate, today);
  if (days < 0) {
    return { dueStatus: 'VENCIDO', daysToTarget: days };
  }
  if (days <= dueSoonDays) {
    return { dueStatus: 'PROXIMO_A_VENCER', daysToTarget: days };
  }
  return { dueStatus: 'EN_TIEMPO', daysToTarget: days };
}
