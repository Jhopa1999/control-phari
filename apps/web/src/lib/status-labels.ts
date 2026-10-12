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
