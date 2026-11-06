/**
 * Agrupamiento de «Mi trabajo» por urgencia (solo presentación; la API no lo calcula).
 * Módulo puro (sin imports de la app) para poder probarlo en Node.
 *
 * Todo se compara con números de día enteros (Date.UTC(y, m, d) / 86 400 000):
 * el vencimiento se lee como fecha UTC solo-fecha (igual que `taskDueInfo` y
 * `formatDateOnly`) y «hoy» llega como cadena del calendario LOCAL del usuario,
 * así que ninguna comparación pasa por la zona horaria del proceso.
 */

export type MyWorkGroupKey = 'overdue' | 'today' | 'week' | 'later' | 'noDate' | 'done' | 'closed';

/** Orden fijo de presentación de los grupos. */
export const MY_WORK_GROUP_ORDER: readonly MyWorkGroupKey[] = [
  'overdue',
  'today',
  'week',
  'later',
  'noDate',
  'done',
  'closed',
];

/** Campos mínimos de una tarea de «Mi trabajo» que necesita el agrupamiento. */
export interface MyWorkGroupable {
  taskId: string;
  title: string;
  status: string;
  isMilestone: boolean;
  endDate?: string | null;
  /** Estado operativo de la solicitud; solo se distingue 'CERRADA' (si falta, abierta). */
  requestOperationalState?: string | null;
}

export type MyWorkGroups<T extends MyWorkGroupable = MyWorkGroupable> = Record<MyWorkGroupKey, T[]>;

export interface MyWorkCounts {
  /** No terminadas con vencimiento anterior a hoy. */
  overdue: number;
  /** No terminadas que vencen hoy. */
  today: number;
  /** Estado EN_CURSO (cualquier fecha). */
  inProgress: number;
  /** Estado BLOQUEADA. */
  blocked: number;
}

const DAY_MS = 86_400_000;
const TODAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Número de día UTC de 'YYYY-MM-DD' o ISO; null si no es una fecha. */
function dayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

/** «Hoy» estricto: 'YYYY-MM-DD' y fecha real; si no, RangeError (error de programación). */
function todayNumber(todayLocal: string): number {
  if (typeof todayLocal !== 'string' || !TODAY_PATTERN.test(todayLocal)) {
    throw new RangeError('todayLocal inválido');
  }
  const [y, m, d] = todayLocal.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new RangeError('todayLocal inválido');
  }
  return ms / DAY_MS;
}

/** Día ISO del número de día: lunes = 1 … domingo = 7. */
function isoWeekday(day: number): number {
  const js = new Date(day * DAY_MS).getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

function dayToString(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Domingo de la semana (lunes–domingo) en curso, como 'YYYY-MM-DD'. Si hoy es
 * domingo devuelve hoy. Lanza RangeError si `todayLocal` no es válido.
 */
export function weekEndOf(todayLocal: string): string {
  const today = todayNumber(todayLocal);
  return dayToString(today + (7 - isoWeekday(today)));
}

/** La solicitud de la tarea está cerrada: no admite cambios de estado ni de avance. */
export function isProjectClosed(item: { requestOperationalState?: string | null }): boolean {
  return item.requestOperationalState === 'CERRADA';
}

/** Clasifica una tarea (primera regla que se cumple). `weekEnd` es un número de día. */
function groupKeyOf(
  item: MyWorkGroupable,
  today: number,
  weekEnd: number,
): MyWorkGroupKey {
  if (item.status === 'TERMINADA') return 'done';
  if (isProjectClosed(item)) return 'closed';
  const end = dayNumber(item.endDate);
  if (end === null) return 'noDate';
  if (end < today) return 'overdue';
  if (end === today) return 'today';
  if (end <= weekEnd) return 'week';
  return 'later';
}

/** Rango de «lo iniciado primero»; estados desconocidos al final. */
const STATUS_RANK: Record<string, number> = {
  EN_CURSO: 0,
  EN_REVISION: 1,
  BLOQUEADA: 2,
  POR_HACER: 3,
};

function statusRank(status: string): number {
  return STATUS_RANK[status] ?? 4;
}

function tieBreak(a: MyWorkGroupable, b: MyWorkGroupable): number {
  if (a.isMilestone !== b.isMilestone) return a.isMilestone ? -1 : 1;
  const byTitle = a.title.localeCompare(b.title, 'es');
  if (byTitle !== 0) return byTitle;
  return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
}

/**
 * Orden dentro de un grupo: fecha ascendente (omitida en «Sin fecha»), luego lo
 * iniciado primero, luego hito primero, título y taskId. En «Terminadas» la
 * fecha va descendente (sin fecha al final) y no cuenta el estado.
 */
export function compareWithinGroup(
  key: MyWorkGroupKey,
  a: MyWorkGroupable,
  b: MyWorkGroupable,
): number {
  if (key === 'done' || key === 'closed') {
    const ea = dayNumber(a.endDate);
    const eb = dayNumber(b.endDate);
    if (ea !== eb) {
      if (ea === null) return 1;
      if (eb === null) return -1;
      return eb - ea;
    }
    return tieBreak(a, b);
  }
  if (key !== 'noDate') {
    const ea = dayNumber(a.endDate) ?? 0;
    const eb = dayNumber(b.endDate) ?? 0;
    if (ea !== eb) return ea - eb;
  }
  const byStatus = statusRank(a.status) - statusRank(b.status);
  if (byStatus !== 0) return byStatus;
  return tieBreak(a, b);
}

/**
 * Agrupa por urgencia y ordena cada grupo. `todayLocal` es la fecha local del
 * usuario en 'YYYY-MM-DD'; si no es válida lanza RangeError('todayLocal inválido').
 * Una `endDate` no interpretable no lanza: la tarea cae en «Sin fecha».
 */
export function groupMyWork<T extends MyWorkGroupable>(
  items: readonly T[],
  todayLocal: string,
): MyWorkGroups<T> {
  const today = todayNumber(todayLocal);
  const weekEnd = today + (7 - isoWeekday(today));
  const groups: MyWorkGroups<T> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    noDate: [],
    done: [],
    closed: [],
  };
  for (const item of items) {
    groups[groupKeyOf(item, today, weekEnd)].push(item);
  }
  for (const key of MY_WORK_GROUP_ORDER) {
    groups[key].sort((a, b) => compareWithinGroup(key, a, b));
  }
  return groups;
}

/**
 * Contadores de la cabecera, sobre todas las tareas (sin búsqueda ni filtros).
 * Pueden solaparse: una vencida puede estar en curso.
 */
export function countMyWork(items: readonly MyWorkGroupable[], todayLocal: string): MyWorkCounts {
  const today = todayNumber(todayLocal);
  const counts: MyWorkCounts = { overdue: 0, today: 0, inProgress: 0, blocked: 0 };
  for (const item of items) {
    // Un proyecto cerrado no pide atención: no cuenta en ningún contador.
    if (isProjectClosed(item)) continue;
    if (item.status === 'EN_CURSO') counts.inProgress += 1;
    if (item.status === 'BLOQUEADA') counts.blocked += 1;
    if (item.status === 'TERMINADA') continue;
    const end = dayNumber(item.endDate);
    if (end === null) continue;
    if (end < today) counts.overdue += 1;
    else if (end === today) counts.today += 1;
  }
  return counts;
}
