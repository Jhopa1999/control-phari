import {
  api,
  type AddDependency,
  type TaskDependency,
} from './api-client';
import { PlanError } from './plan';

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'La predecesora no es valida (ciclo, auto-dependencia u otro plan).';
    case 403:
      return 'No tienes permiso para esta accion.';
    case 404:
      return 'No existe o esta fuera de tu alcance.';
    case 409:
      return 'Esa dependencia ya existe.';
    default:
      return 'Ocurrio un error al procesar la dependencia.';
  }
}

function toDependencyError(status: number | undefined): PlanError {
  if (status === undefined) {
    return new PlanError('No fue posible comunicarse con el servidor.');
  }
  return new PlanError(messageForStatus(status), status);
}

/** Predecesoras de una tarea (GET /tasks/:id/dependencies). */
export async function listDependencies(
  taskId: string,
): Promise<TaskDependency[]> {
  try {
    const { data, error, response } = await api.GET(
      '/tasks/{id}/dependencies',
      { params: { path: { id: taskId } } },
    );
    if (error || !data) {
      throw toDependencyError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toDependencyError(undefined);
  }
}

/**
 * Agrega una predecesora (POST /tasks/:id/dependencies). Valida server-side
 * auto-dependencia (400), mismo plan (400), ciclo (400) y duplicado (409).
 */
export async function addDependency(
  taskId: string,
  input: AddDependency,
): Promise<TaskDependency> {
  try {
    const { data, error, response } = await api.POST(
      '/tasks/{id}/dependencies',
      { params: { path: { id: taskId } }, body: input },
    );
    if (error || !data) {
      throw toDependencyError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toDependencyError(undefined);
  }
}

/**
 * Quita una predecesora (DELETE /tasks/:id/dependencies/:predecessorTaskId).
 */
export async function removeDependency(
  taskId: string,
  predecessorTaskId: string,
): Promise<void> {
  try {
    const { error, response } = await api.DELETE(
      '/tasks/{id}/dependencies/{predecessorTaskId}',
      { params: { path: { id: taskId, predecessorTaskId } } },
    );
    if (error) {
      throw toDependencyError(response.status);
    }
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toDependencyError(undefined);
  }
}
