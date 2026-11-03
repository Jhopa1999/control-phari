/**
 * Vencimiento orientativo de una tarea (solo presentación; la API no lo calcula).
 * Módulo puro (sin imports de la app) para poder probarlo en Node.
 */

export type DueKind = 'none' | 'ok' | 'soon' | 'today' | 'overdue';

export interface DueInfo {
  kind: DueKind;
  /** Días de diferencia absolutos respecto de hoy (0 si hoy o sin fecha). */
  days: number;
}

interface DueTask {
  endDate?: string | null;
  status: string;
}

const DAY_MS = 86_400_000;

/** Convierte 'YYYY-MM-DD' (o un ISO) a un número de día UTC; null si no es fecha. */
function dayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

/**
 * `todayLocal` es la fecha local del usuario en 'YYYY-MM-DD'. Una tarea
 * terminada nunca está vencida. «Pronto» = faltan 1 a 3 días.
 */
export function taskDueInfo(task: DueTask, todayLocal: string): DueInfo {
  if (task.status === 'TERMINADA') return { kind: 'none', days: 0 };
  const end = dayNumber(task.endDate);
  const today = dayNumber(todayLocal);
  if (end === null || today === null) return { kind: 'none', days: 0 };
  const diff = end - today;
  if (diff < 0) return { kind: 'overdue', days: -diff };
  if (diff === 0) return { kind: 'today', days: 0 };
  if (diff <= 3) return { kind: 'soon', days: diff };
  return { kind: 'ok', days: diff };
}

function days(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}

/** Texto del chip de vencimiento; null cuando no hay nada que avisar. */
export function dueLabel(info: DueInfo): string | null {
  switch (info.kind) {
    case 'overdue':
      return `Vencida hace ${days(info.days)}`;
    case 'today':
      return 'Vence hoy';
    case 'soon':
      return `Vence en ${days(info.days)}`;
    default:
      return null;
  }
}
