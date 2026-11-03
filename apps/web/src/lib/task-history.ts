import { formatDateOnly, formatHours, formatPercent } from './format';
import { taskStatusLabel } from './status-labels';

/** Un cambio de campo tal como lo devuelve la API (valores en texto). */
export interface RawTaskChange {
  field: string;
  from: string | null;
  to: string | null;
}

/** Cambio listo para mostrar. `long` = texto largo que conviene plegar. */
export interface DisplayTaskChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
  long: boolean;
}

const LABELS: Record<string, string> = {
  status: 'Estado',
  progress: 'Avance',
  accepted: 'Aceptación',
  title: 'Título',
  phase: 'Fase',
  responsible: 'Responsable',
  isMilestone: 'Hito',
  startDate: 'Inicio',
  endDate: 'Vencimiento',
  estimateHours: 'Esfuerzo',
  description: 'Descripción',
  acceptanceCriteria: 'Criterios de aceptación',
  evidenceUrl: 'Evidencia',
  frameworkPhaseRequired: 'Requiere fase marco',
};

const LONG_FIELDS = new Set(['description', 'acceptanceCriteria', 'evidenceUrl']);

function yesNo(value: string): string {
  return value === 'true' ? 'Sí' : value === 'false' ? 'No' : value;
}

function formatValue(field: string, value: string | null): string | null {
  if (value === null) return null;
  switch (field) {
    case 'status':
      return taskStatusLabel(value);
    case 'progress': {
      const n = Number(value);
      return Number.isFinite(n) ? formatPercent(n) : value;
    }
    case 'accepted':
      return value === 'true' ? 'Aceptada' : value === 'false' ? 'Sin aceptar' : value;
    case 'isMilestone':
    case 'frameworkPhaseRequired':
      return yesNo(value);
    case 'startDate':
    case 'endDate':
      return formatDateOnly(value);
    case 'estimateHours': {
      const n = Number(value);
      return Number.isFinite(n) ? formatHours(n) : value;
    }
    default:
      return value;
  }
}

/** Traduce un cambio de la API a etiqueta y valores legibles (campo desconocido: se muestra tal cual). */
export function describeTaskChange(change: RawTaskChange): DisplayTaskChange {
  return {
    field: change.field,
    label: LABELS[change.field] ?? change.field,
    from: formatValue(change.field, change.from),
    to: formatValue(change.field, change.to),
    long: LONG_FIELDS.has(change.field),
  };
}

const SUMMARIES: Record<string, string> = {
  status: 'cambió el estado',
  progress: 'cambió el avance',
  accepted: 'cambió la aceptación',
  title: 'cambió el título',
  phase: 'cambió la fase',
  responsible: 'cambió el responsable',
  startDate: 'cambió la fecha de inicio',
  endDate: 'cambió el vencimiento',
  estimateHours: 'cambió el esfuerzo',
  description: 'cambió la descripción',
  acceptanceCriteria: 'cambió los criterios de aceptación',
  evidenceUrl: 'cambió la evidencia',
  isMilestone: 'cambió el hito',
  frameworkPhaseRequired: 'cambió la fase marco',
};

/** Resumen de una línea del evento: «creó la tarea», «cambió el estado», «hizo 3 cambios». */
export function summarizeEvent(action: string, changes: RawTaskChange[]): string {
  if (action === 'CREATE') return 'creó la tarea';
  if (changes.length === 1) return SUMMARIES[changes[0].field] ?? 'hizo un cambio';
  return `hizo ${changes.length} cambios`;
}

/** Clave de día local 'YYYY-MM-DD' de una fecha ISO (para agrupar por día). */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Encabezado de día: «Hoy», «Ayer» o «martes, 28 de octubre» (con el año si no es el actual). */
export function dayHeading(dayKey: string, now: Date = new Date()): string {
  const todayKey = localDayKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === todayKey) return 'Hoy';
  if (dayKey === localDayKey(yesterday.toISOString())) return 'Ayer';
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(y !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(date);
}
