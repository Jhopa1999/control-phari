import type { UpdateTaskStatus } from './api-client';

/**
 * Etiquetas de estado de tareas y planes (design §7.3 y §7.9.2).
 *
 * Módulo puro: solo `import type` de ./api-client, para que
 * status-presentation.ts no arrastre el cliente de la API y
 * e2e/web-lib.spec.ts lo cargue en Node. lib/tasks.ts y lib/plan.ts los
 * reexportan, así que sus consumidores no cambian sus imports.
 */

/** Etiquetas legibles de TaskStatus (design 1.3). */
export const TASK_STATUS_LABELS: Record<string, string> = {
  POR_HACER: 'Por hacer',
  EN_CURSO: 'En curso',
  BLOQUEADA: 'Bloqueada',
  EN_REVISION: 'En revisión',
  TERMINADA: 'Terminada',
};

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

/** Orden de estados para selects/listados. */
export const TASK_STATUSES: readonly UpdateTaskStatus['status'][] = [
  'POR_HACER',
  'EN_CURSO',
  'BLOQUEADA',
  'EN_REVISION',
  'TERMINADA',
] as const;

/** Etiquetas legibles de PlanStatus (design 1.4). Estado de solo lectura en la UI. */
export const PLAN_STATUS_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_AUTORIZACION: 'En autorización',
  AUTORIZADO: 'Autorizado',
  DEVUELTO: 'Devuelto',
};

export function planStatusLabel(status: string): string {
  return PLAN_STATUS_LABELS[status] ?? status;
}

/** Etiquetas legibles de la cadencia de una actividad recurrente (Recurrence). */
export const RECURRENCE_LABELS: Record<string, string> = {
  SEMANAL: 'Semanal',
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

/** Orden de cadencias para selects. */
export const RECURRENCES: readonly string[] = [
  'SEMANAL',
  'MENSUAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
] as const;

export function recurrenceLabel(cadence: string): string {
  return RECURRENCE_LABELS[cadence] ?? cadence;
}

/** Unidad de la cadencia en singular y plural («semana/semanas»). */
export const RECURRENCE_UNITS: Record<string, { one: string; many: string }> = {
  SEMANAL: { one: 'semana', many: 'semanas' },
  MENSUAL: { one: 'mes', many: 'meses' },
  TRIMESTRAL: { one: 'trimestre', many: 'trimestres' },
  SEMESTRAL: { one: 'semestre', many: 'semestres' },
  ANUAL: { one: 'año', many: 'años' },
};

/** Unidad con el plural según n: (SEMANAL, 2) -> «semanas». */
export function recurrenceUnit(cadence: string, count: number): string {
  const unit = RECURRENCE_UNITS[cadence];
  if (!unit) return cadence;
  return count === 1 ? unit.one : unit.many;
}

/** «Cada semana», «Cada 2 semanas»: nunca «×2». */
export function cadenceText(cadence: string, count: number): string {
  const unit = RECURRENCE_UNITS[cadence];
  if (!unit) return recurrenceLabel(cadence);
  return count <= 1 ? `Cada ${unit.one}` : `Cada ${count} ${unit.many}`;
}

/** Etiqueta del tipo de actividad según el catálogo; si no está, el código. */
export function activityTypeLabel(
  code: string,
  catalog: ReadonlyArray<{ code: string; label: string }>,
): string {
  return catalog.find((item) => item.code === code)?.label ?? code;
}

/** Etiquetas del tipo de responsable (ResponsibleKind). */
export const RESPONSIBLE_KIND_LABELS: Record<string, string> = {
  USER: 'Persona',
  AREA: 'Área',
};

export function responsibleKindLabel(kind: string): string {
  return RESPONSIBLE_KIND_LABELS[kind] ?? kind;
}

/** Orden de estados de ocurrencia para selects/listados. */
export const OCCURRENCE_STATUSES: readonly string[] = [
  'PENDIENTE',
  'EN_CURSO',
  'COMPLETADA',
  'VENCIDA',
] as const;
