import {
  api,
  type AcceptTask,
  type CreateTask,
  type ResponsibleCandidate,
  type Task,
  type TaskHistoryEntry,
  type UpdateTask,
  type UpdateTaskStatus,
} from './api-client';
import { PlanError, serverMessage } from './plan';

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos de la tarea.';
    case 403:
      return 'No tienes permiso para esta acción.';
    case 404:
      return 'No existe o está fuera de tu alcance.';
    case 409:
      return 'La tarea no cumple la precondición para esta acción.';
    default:
      return 'Ocurrió un error al procesar la tarea.';
  }
}

/**
 * Mensaje de negocio de un 409 de tarea. El backend lo redacta en español y es
 * accionable («No se puede iniciar: la predecesora "X" debe estar terminada…»,
 * «La tarea aún no empezó: pásala a «En curso»…»), así que se muestra tal cual
 * en lugar del genérico. Solo si llega como texto simple.
 */
function conflictMessage(status: number, body: unknown): string | undefined {
  if (status !== 409 || typeof body !== 'object' || body === null) return undefined;
  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() !== '' ? message : undefined;
}

function toTaskError(status: number | undefined, body?: unknown): PlanError {
  if (status === undefined) {
    return new PlanError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new PlanError(
    serverMessage(status, body) ?? conflictMessage(status, body) ?? messageForStatus(status),
    status,
  );
}

/**
 * Lista todas las tareas de un plan (GET /plans/:planId/tasks). El contrato no
 * expone los filtros (status/phase/mine/q) como parametros de query tipados, de
 * modo que el filtrado fino se aplica en la vista sobre el resultado.
 */
export async function listPlanTasks(planId: string): Promise<Task[]> {
  try {
    const { data, error, response } = await api.GET('/plans/{planId}/tasks', {
      params: { path: { planId } },
    });
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/**
 * Candidatos a responsable de las tareas de un plan
 * (GET /plans/:planId/responsible-candidates): personas con grant activo en los
 * procesos que intervienen en la solicitud (decididos en el triage). Puebla el
 * selector de responsable; el backend impone la misma regla al asignar.
 */
export async function listResponsibleCandidates(
  planId: string,
): Promise<ResponsibleCandidate[]> {
  try {
    const { data, error, response } = await api.GET(
      '/plans/{planId}/responsible-candidates',
      { params: { path: { planId } } },
    );
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/** Detalle de una tarea con sus predecesoras (GET /tasks/:id). */
export async function getTask(id: string): Promise<Task> {
  try {
    const { data, error, response } = await api.GET('/tasks/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/** Crea una tarea en una fase (POST /phases/:phaseId/tasks). Regla hito. */
export async function createTask(
  phaseId: string,
  input: CreateTask,
): Promise<Task> {
  try {
    const { data, error, response } = await api.POST(
      '/phases/{phaseId}/tasks',
      { params: { path: { phaseId } }, body: input },
    );
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/** Edita una tarea (PATCH /tasks/:id). Regla hito (400 si incoherente). */
export async function updateTask(
  id: string,
  input: UpdateTask,
): Promise<Task> {
  try {
    const { data, error, response } = await api.PATCH('/tasks/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/**
 * Elimina una tarea (DELETE /tasks/:id). 409 si es predecesora de otra (D15).
 */
export async function deleteTask(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/tasks/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toTaskError(response.status, error);
    }
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/**
 * Cambia el estado de una tarea (PATCH /tasks/:id/status). Respeta la maquina
 * de estados; 409 al pasar a EN_CURSO si una predecesora bloquea (AC-010).
 */
export async function updateTaskStatus(
  id: string,
  input: UpdateTaskStatus,
): Promise<Task> {
  try {
    const { data, error, response } = await api.PATCH('/tasks/{id}/status', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/**
 * Acepta o retira la aceptacion de una tarea (PATCH /tasks/:id/accept). Solo
 * jefe/lider; precondicion TERMINADA (409 si no).
 */
export async function acceptTask(
  id: string,
  input: AcceptTask,
): Promise<Task> {
  try {
    const { data, error, response } = await api.PATCH('/tasks/{id}/accept', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/**
 * Actualiza solo el avance (0-100) de una tarea, sin cambiar su estado
 * (PATCH /tasks/:id/progress). 409 si la tarea está Por hacer o Terminada.
 */
export async function updateTaskProgress(id: string, progress: number): Promise<Task> {
  try {
    const { data, error, response } = await api.PATCH('/tasks/{id}/progress', {
      params: { path: { id } },
      body: { progress },
    });
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}

/** Traza de cambios de una tarea, de la más reciente a la más antigua (GET /tasks/:id/history). */
export async function getTaskHistory(id: string): Promise<TaskHistoryEntry[]> {
  try {
    const { data, error, response } = await api.GET('/tasks/{id}/history', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toTaskError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toTaskError(undefined);
  }
}
// Etiquetas y orden de TaskStatus: viven en el módulo puro status-labels.ts
// (design §7.9.2) y se reexportan aquí para que los consumidores no cambien.
export {
  TASK_STATUS_LABELS,
  taskStatusLabel,
  TASK_STATUSES,
} from './status-labels';
