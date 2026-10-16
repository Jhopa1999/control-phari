import type { TaskStatus } from './api-client';

/**
 * Transiciones de tarea permitidas, ESPEJO de la máquina del backend
 * (apps/api/.../plan/task-status.ts, TASK_TRANSITIONS). Solo guía la UI: el
 * control real es server-side (el backend responde 409 ante una transición o
 * precondición no satisfecha —p. ej. una predecesora que bloquea—). No es
 * lógica de negocio; es presentación de las opciones que el usuario puede
 * intentar. Fuente única en el frontend: la usan tanto la ficha de tarea como
 * la edición en línea de planificación, para no duplicar el espejo.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  POR_HACER: ['EN_CURSO', 'BLOQUEADA'],
  EN_CURSO: ['POR_HACER', 'BLOQUEADA', 'EN_REVISION'],
  BLOQUEADA: ['POR_HACER', 'EN_CURSO'],
  EN_REVISION: ['EN_CURSO', 'BLOQUEADA', 'TERMINADA'],
  TERMINADA: ['EN_CURSO'],
};

/**
 * Transiciones disponibles desde `from`. Para un valor fuera del enum devuelve
 * `[]` (nunca lanza): el control de estado queda entonces sin opciones.
 */
export function nextTaskStatuses(from: TaskStatus): readonly TaskStatus[] {
  return TASK_TRANSITIONS[from] ?? [];
}
