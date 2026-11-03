/**
 * Rangos de fechas de los filtros de la bitácora. Módulo puro (sin imports) para
 * que e2e/web-lib.spec.ts lo cargue en Node. Los atajos se guardan en la URL (no
 * las fechas): un enlace guardado como «esta semana» sigue siéndolo mañana.
 */

export type RangePreset =
  | 'hoy'
  | 'semana'
  | 'semana-pasada'
  | 'mes'
  | '30-dias'
  | 'todo'
  | 'personalizado';

export const RANGE_PRESETS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'semana-pasada', label: 'Semana pasada' },
  { value: 'mes', label: 'Este mes' },
  { value: '30-dias', label: 'Últimos 30 días' },
  { value: 'todo', label: 'Todo el historial' },
  { value: 'personalizado', label: 'Personalizado' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** «Hoy» como fecha de calendario local, expresada en UTC (mismo criterio que localDateInputValue). */
function todayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Lunes (ISO) de la semana de una fecha UTC. */
function mondayOf(date: Date): Date {
  const weekday = (date.getUTCDay() + 6) % 7; // lunes = 0
  return new Date(date.getTime() - weekday * DAY_MS);
}

export interface DateRange {
  from?: string;
  to?: string;
}

/** Desde/hasta (inclusivos) de un atajo; «todo» y «personalizado» no fijan nada. */
export function rangeForPreset(preset: RangePreset, now: Date = new Date()): DateRange {
  const today = todayUtc(now);
  switch (preset) {
    case 'hoy':
      return { from: iso(today), to: iso(today) };
    case 'semana': {
      const monday = mondayOf(today);
      return { from: iso(monday), to: iso(new Date(monday.getTime() + 6 * DAY_MS)) };
    }
    case 'semana-pasada': {
      const monday = new Date(mondayOf(today).getTime() - 7 * DAY_MS);
      return { from: iso(monday), to: iso(new Date(monday.getTime() + 6 * DAY_MS)) };
    }
    case 'mes':
      return {
        from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
        to: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))),
      };
    case '30-dias':
      return { from: iso(new Date(today.getTime() - 29 * DAY_MS)), to: iso(today) };
    default:
      return {};
  }
}

export function isRangePreset(value: string | null | undefined): value is RangePreset {
  return RANGE_PRESETS.some((p) => p.value === value);
}
