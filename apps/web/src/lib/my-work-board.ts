/**
 * Reparto de «Mi trabajo» en columnas por estado (tablero). Solo presentación;
 * módulo puro (sin imports de la app) para poder probarlo en Node.
 */
import { compareWithinGroup, isProjectClosed, type MyWorkGroupable } from './my-work-groups';

/** Orden fijo de las columnas del tablero. */
export const BOARD_STATUSES = [
  'POR_HACER',
  'EN_CURSO',
  'EN_REVISION',
  'BLOQUEADA',
  'TERMINADA',
] as const;

/** Tarjetas visibles por columna antes de «Ver las N restantes». */
export const BOARD_LIMIT = 20;
/** Terminadas: las más recientes. */
export const BOARD_DONE_LIMIT = 10;
/** Clave de la columna extra para estados fuera del enum (nunca se pierde una tarea). */
export const BOARD_OTHER_KEY = 'OTROS';

export interface BoardColumn<T> {
  /** Código de estado, o `OTROS` en la columna de estados desconocidos. */
  key: string;
  items: T[];
  /** Cuántas tarjetas se muestran antes de plegar el resto. */
  limit: number;
}

function dateOf(item: MyWorkGroupable): number | null {
  if (!item.endDate) return null;
  const t = new Date(item.endDate).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Proyecto abierto primero; luego fecha ascendente (sin fecha al final), estado, hito, título. */
function compareOpen(a: MyWorkGroupable, b: MyWorkGroupable): number {
  const da = dateOf(a);
  const db = dateOf(b);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }
  return compareWithinGroup('noDate', a, b);
}

function compareInColumn(status: string, a: MyWorkGroupable, b: MyWorkGroupable): number {
  const ca = isProjectClosed(a);
  const cb = isProjectClosed(b);
  if (ca !== cb) return ca ? 1 : -1;
  return status === 'TERMINADA' ? compareWithinGroup('done', a, b) : compareOpen(a, b);
}

/**
 * Reparte las tareas en las cinco columnas (más «Otros estados» solo si hay alguna)
 * y ordena cada una. No recorta: el recorte lo hace la vista con `limit`.
 */
export function boardColumns<T extends MyWorkGroupable>(items: readonly T[]): BoardColumn<T>[] {
  const known = new Set<string>(BOARD_STATUSES);
  const columns: BoardColumn<T>[] = BOARD_STATUSES.map((status) => ({
    key: status,
    items: items.filter((i) => i.status === status),
    limit: status === 'TERMINADA' ? BOARD_DONE_LIMIT : BOARD_LIMIT,
  }));
  for (const column of columns) {
    column.items.sort((a, b) => compareInColumn(column.key, a, b));
  }
  const others = items.filter((i) => !known.has(i.status));
  if (others.length > 0) {
    others.sort((a, b) => compareInColumn(BOARD_OTHER_KEY, a, b));
    columns.push({ key: BOARD_OTHER_KEY, items: others, limit: BOARD_LIMIT });
  }
  return columns;
}
