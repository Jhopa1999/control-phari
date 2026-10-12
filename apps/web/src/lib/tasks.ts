import {
  api,
  type AcceptTask,
  type CreateTask,
  type Task,
  type UpdateTask,
  type UpdateTaskStatus,
} from './api-client';
import { PlanError } from './plan';

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

function toTaskError(status: number | undefined): PlanError {
  if (status === undefined) {
    return new PlanError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new PlanError(messageForStatus(status), status);
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
      throw toTaskError(response.status);
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
      throw toTaskError(response.status);
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
      throw toTaskError(response.status);
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
      throw toTaskError(response.status);
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
      throw toTaskError(response.status);
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
      throw toTaskError(response.status);
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
      throw toTaskError(response.status);
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
