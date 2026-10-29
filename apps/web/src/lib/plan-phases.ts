import {
  api,
  type CreatePhase,
  type PlanPhase,
  type ReorderPhases,
  type UpdatePhase,
} from './api-client';
import { PlanError, serverMessage } from './plan';

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos de la fase.';
    case 403:
      return 'No tienes permiso para esta acción.';
    case 404:
      return 'No existe o está fuera de tu alcance.';
    case 409:
      return 'No se puede modificar esta fase en el estado actual.';
    default:
      return 'Ocurrió un error al procesar la fase.';
  }
}

function toPhaseError(status: number | undefined, body?: unknown): PlanError {
  if (status === undefined) {
    return new PlanError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new PlanError(serverMessage(status, body) ?? messageForStatus(status), status);
}

/** Fases de un plan ordenadas por `order` (GET /plans/:planId/phases). */
export async function listPhases(planId: string): Promise<PlanPhase[]> {
  try {
    const { data, error, response } = await api.GET('/plans/{planId}/phases', {
      params: { path: { planId } },
    });
    if (error || !data) {
      throw toPhaseError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPhaseError(undefined);
  }
}

/** Crea una fase (POST /plans/:planId/phases). order al final si falta. */
export async function createPhase(
  planId: string,
  input: CreatePhase,
): Promise<PlanPhase> {
  try {
    const { data, error, response } = await api.POST('/plans/{planId}/phases', {
      params: { path: { planId } },
      body: input,
    });
    if (error || !data) {
      throw toPhaseError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPhaseError(undefined);
  }
}

/** Edita una fase (PATCH /plans/:planId/phases/:phaseId). */
export async function updatePhase(
  planId: string,
  phaseId: string,
  input: UpdatePhase,
): Promise<PlanPhase> {
  try {
    const { data, error, response } = await api.PATCH(
      '/plans/{planId}/phases/{phaseId}',
      { params: { path: { planId, phaseId } }, body: input },
    );
    if (error || !data) {
      throw toPhaseError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPhaseError(undefined);
  }
}

/**
 * Reordena las fases (PATCH /plans/:planId/phases/reorder). Recibe los ids en
 * el orden deseado. 409 si se intenta mover la fase inicial con tareas (D4).
 */
export async function reorderPhases(
  planId: string,
  input: ReorderPhases,
): Promise<PlanPhase[]> {
  try {
    const { data, error, response } = await api.PATCH(
      '/plans/{planId}/phases/reorder',
      { params: { path: { planId } }, body: input },
    );
    if (error || !data) {
      throw toPhaseError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPhaseError(undefined);
  }
}

/**
 * Elimina una fase (DELETE /plans/:planId/phases/:phaseId). 409 si tiene
 * tareas (D12) o es la fase inicial protegida (AC-009).
 */
export async function deletePhase(
  planId: string,
  phaseId: string,
): Promise<void> {
  try {
    const { error, response } = await api.DELETE(
      '/plans/{planId}/phases/{phaseId}',
      { params: { path: { planId, phaseId } } },
    );
    if (error) {
      throw toPhaseError(response.status, error);
    }
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPhaseError(undefined);
  }
}
