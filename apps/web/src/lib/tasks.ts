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

import { taskStatusLabel } from './status-labels';

/** Lookups que la vista resuelve y pasa al export de CSV (design §7.2). */
export interface TaskCsvLookups {
  /** Nombre de la fase a partir de task.phaseId; '—' si no se resuelve. */
  phaseName: (phaseId: string) => string | null | undefined;
  /** Nombre del responsable a partir del userId; '—' si no se resuelve. */
  personName: (userId: string) => string | null | undefined;
  /** Formateo de fecha coherente con la tabla (la vista pasa formatDateOnly). */
  formatDate: (value: string | null) => string;
}

/** Entrecomilla y duplica comillas si el campo lleva , " o salto de línea. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Exporta las tareas visibles como CSV con BOM UTF-8 (design §7.2). Es una foto
 * de la vista para trabajo humano e incluye el responsable (nombre resuelto en
 * el frontend); no debe alinearse con el documento JSON de import/export.
 * Reutiliza datos ya presentes en la vista; sin backend ni dependencias.
 * Dispara la descarga `tareas-<requestId>.csv` con el patrón Blob + <a download>.
 */
export function downloadTasksCsv(
  requestId: string,
  rows: Task[],
  lookups: TaskCsvLookups,
): void {
  const headers = [
    'Fase',
    'Título',
    'Responsable',
    'Inicio',
    'Fin',
    'Estimación (h)',
    'Estado',
    'Hito',
  ];
  const lines = rows.map((task) => {
    const phase = lookups.phaseName(task.phaseId) ?? '—';
    const responsible =
      task.responsibleUserId === null
        ? 'Sin asignar'
        : (lookups.personName(task.responsibleUserId) ?? '—');
    const estimate =
      task.isMilestone || task.estimateHours === null
        ? ''
        : String(task.estimateHours);
    const cells = [
      phase,
      task.title,
      responsible,
      lookups.formatDate(task.startDate),
      lookups.formatDate(task.endDate),
      estimate,
      taskStatusLabel(task.status),
      task.isMilestone ? 'Sí' : 'No',
    ];
    return cells.map(csvField).join(',');
  });
  const content = `\uFEFF${[headers.join(','), ...lines].join('\r\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tareas-${requestId}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// Etiquetas y orden de TaskStatus: viven en el módulo puro status-labels.ts
// (design §7.9.2) y se reexportan aquí para que los consumidores no cambien.
export {
  TASK_STATUS_LABELS,
  taskStatusLabel,
  TASK_STATUSES,
} from './status-labels';
