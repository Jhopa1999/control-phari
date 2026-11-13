/**
 * Helpers PUROS de presentación de Actividades recurrentes (texto de semana,
 * fechas relativas, diferencia de horas). Sin importaciones con alias `@/` para
 * que e2e/web-lib.spec.ts los cargue en Node. No contienen reglas de negocio:
 * los estados y las ventanas los calcula la API.
 */

const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const MINUS = '\u2212';
const NBSP = '\u00a0';

/** Partes (año, mes 0-11, día) de una fecha de solo-fecha 'YYYY-MM-DD[T…]'. */
function parts(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return { y, m: m - 1, d };
}

/** Días enteros de `from` a `to` (fechas de solo-fecha; positivo = `to` es posterior). */
export function dayDiff(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86_400_000);
}

/**
 * «Semana 46 · 10 al 16 de nov 2026»; si cruza meses, «Semana 5 · 26 ene al 1 feb 2027».
 */
export function weekRangeLabel(week: { number: number; startDate: string; endDate: string }): string {
  const s = parts(week.startDate);
  const e = parts(week.endDate);
  const range =
    s.m === e.m && s.y === e.y
      ? `${s.d} al ${e.d} de ${MONTHS_SHORT[e.m]} ${e.y}`
      : `${s.d} ${MONTHS_SHORT[s.m]} al ${e.d} ${MONTHS_SHORT[e.m]} ${e.y}`;
  return `Semana ${week.number} · ${range}`;
}

/** «Noviembre 2026» a partir del año y el mes (0-11). */
export function monthTitle(year: number, month: number): string {
  const name = MONTHS_LONG[month] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** Texto relativo de una fecha objetivo respecto de hoy: «Hoy», «Mañana», «Hace 3 días», «En 5 días». */
export function relativeDayText(target: string, today: string): string {
  const diff = dayDiff(today, target);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return diff < 0 ? `Hace ${-diff} días` : `En ${diff} días`;
}

/** Horas con signo explícito: «+1,5 h», «−0,5 h», «0 h». Nunca solo color. */
export function signedHours(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return `0${NBSP}h`;
  const digits = Math.abs(rounded).toString().replace('.', ',');
  return `${rounded > 0 ? '+' : MINUS}${digits}${NBSP}h`;
}

/** Diferencia real − estimada para comparar en el detalle. */
export function hoursDifferenceText(actual: number, estimated: number): string {
  return `${signedHours(actual - estimated)} vs. estimado`;
}

/** Fecha corta con día de la semana: «mar 17 nov». */
export function shortDayLabel(value: string): string {
  const { y, m, d } = parts(value);
  const weekdays = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const wd = weekdays[new Date(Date.UTC(y, m, d)).getUTCDay()];
  return `${wd} ${d} ${MONTHS_SHORT[m]}`;
}

/** Suma `days` a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. */
export function addDays(value: string, days: number): string {
  const { y, m, d } = parts(value);
  return new Date(Date.UTC(y, m, d + days)).toISOString().slice(0, 10);
}

/**
 * Semanas (lunes a domingo) visibles de un mes: 'YYYY-MM-DD' de cada día. El
 * rango (primer y último día) es lo que se consulta a la API.
 */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lunes = 0
  const start = new Date(Date.UTC(year, month, 1 - offset));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const lastOffset = 6 - ((last.getUTCDay() + 6) % 7);
  const end = new Date(Date.UTC(year, month + 1, 0 + lastOffset));
  const weeks: string[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Número de semana ISO de una fecha 'YYYY-MM-DD' (solo para el rótulo «S46»). */
export function isoWeekNumber(value: string): number {
  const { y, m, d } = parts(value);
  const date = new Date(Date.UTC(y, m, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}
