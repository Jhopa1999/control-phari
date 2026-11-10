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

/** Roles que pueden aprobar (terminar) y reabrir tareas: espejo de `isPlanManager` del backend. */
const APPROVER_ROLES: readonly string[] = ['JEFE_AREA', 'LIDER_PROCESO'];

/**
 * ¿El actor puede aprobar (terminar) y reabrir tareas? Espejo de `isPlanManager`
 * del backend (jefe de área o líder de proceso). Solo guía la interfaz: el
 * servidor decide y responde 403. Con una lista vacía (permisos aún sin cargar)
 * devuelve false: nunca se ofrece «Terminar» de más.
 */
export function canApproveTasks(roleCodes: readonly string[] | null | undefined): boolean {
  if (!roleCodes) return false;
  return roleCodes.some((code) => APPROVER_ROLES.includes(code));
}

/**
 * Transiciones disponibles desde `from`. Para un valor fuera del enum devuelve
 * `[]` (nunca lanza): el control de estado queda entonces sin opciones.
 * Quien no puede aprobar no ve «Terminar» (desde En revisión) ni «Reabrir»
 * (desde Terminada). El parámetro es obligatorio para que ninguna vista lo olvide.
 */
export function nextTaskStatuses(from: TaskStatus, canApprove: boolean): readonly TaskStatus[] {
  const all = TASK_TRANSITIONS[from] ?? [];
  if (canApprove) return all;
  if (from === 'EN_REVISION') return all.filter((to) => to !== 'TERMINADA');
  if (from === 'TERMINADA') return [];
  return all;
}
