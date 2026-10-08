/**
 * Enum logico de los 5 estados de una tarea del plan (design §1.3; `06`/SCR-09).
 * Es un conjunto cerrado y tipado, como RequestState/RoleCode: gobierna la
 * logica de los gates de ejecucion y nunca es editable por un campo libre. La
 * columna `Task.status` guarda el `code` (texto); solo el helper del modulo plan
 * la escribe.
 */
export enum TaskStatus {
  POR_HACER = 'POR_HACER',
  EN_CURSO = 'EN_CURSO',
  BLOQUEADA = 'BLOQUEADA',
  EN_REVISION = 'EN_REVISION',
  TERMINADA = 'TERMINADA',
}

/** Todos los estados validos, util para validaciones y pruebas. */
export const TASK_STATUSES: readonly TaskStatus[] = Object.values(TaskStatus);

/**
 * Transiciones permitidas de la maquina de estados de tarea (design §1.3, D7).
 * SOLO estas aristas se admiten; lo no listado NO se permite (ConflictException
 * en el helper del service). Las transiciones son una DECISION documentada (`06`
 * marca las transiciones concretas como P), revisable cuando el Site las confirme.
 */
export const TASK_TRANSITIONS: ReadonlyArray<readonly [TaskStatus, TaskStatus]> =
  [
    // Iniciar (gate de predecesoras en el service).
    [TaskStatus.POR_HACER, TaskStatus.EN_CURSO],
    // Marcar bloqueo (sin gate).
    [TaskStatus.POR_HACER, TaskStatus.BLOQUEADA],
    [TaskStatus.EN_CURSO, TaskStatus.BLOQUEADA],
    // Revertir a pendiente (correccion temprana).
    [TaskStatus.EN_CURSO, TaskStatus.POR_HACER],
    // Enviar a revision antes de terminar.
    [TaskStatus.EN_CURSO, TaskStatus.EN_REVISION],
    // Desbloquear (ir a curso re-aplica el gate de predecesoras).
    [TaskStatus.BLOQUEADA, TaskStatus.POR_HACER],
    [TaskStatus.BLOQUEADA, TaskStatus.EN_CURSO],
    // Devolver de revision / bloquear.
    [TaskStatus.EN_REVISION, TaskStatus.EN_CURSO],
    [TaskStatus.EN_REVISION, TaskStatus.BLOQUEADA],
    // Completar tras revision (terminar NO acepta: aceptacion es accion aparte).
    [TaskStatus.EN_REVISION, TaskStatus.TERMINADA],
    // Reabrir para correccion.
    [TaskStatus.TERMINADA, TaskStatus.EN_CURSO],
  ];

/**
 * Indica si `from -> to` es una transicion de tarea permitida (design §1.3). Lo
 * no listado devuelve false (el service traduce a ConflictException 409).
 */
export function isTaskTransitionAllowed(
  from: TaskStatus,
  to: TaskStatus,
): boolean {
  return TASK_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** True si el valor es un miembro del enum TaskStatus. */
export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}
