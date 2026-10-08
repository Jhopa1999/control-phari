import { api, type MyWorkItem } from './api-client';
import { PlanError } from './plan';

function messageForStatus(status: number): string {
  switch (status) {
    case 403:
      return 'No tienes permiso para ver tu trabajo.';
    case 404:
      return 'No existe o esta fuera de tu alcance.';
    default:
      return 'Ocurrio un error al cargar tu trabajo.';
  }
}

function toMyWorkError(status: number | undefined): PlanError {
  if (status === undefined) {
    return new PlanError('No fue posible comunicarse con el servidor.');
  }
  return new PlanError(messageForStatus(status), status);
}

/**
 * Tareas asignadas al actor actual con contexto de plan (GET /my-work).
 * El backend filtra por responsibleUserId=actor dentro de su alcance.
 */
export async function listMyWork(): Promise<MyWorkItem[]> {
  try {
    const { data, error, response } = await api.GET('/my-work');
    if (error || !data) {
      throw toMyWorkError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toMyWorkError(undefined);
  }
}
