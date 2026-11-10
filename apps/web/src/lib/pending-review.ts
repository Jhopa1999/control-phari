import { api, type PendingReviewItem, type PendingReviewList } from './api-client';
import { PlanError } from './plan';

export type { PendingReviewItem, PendingReviewList };
export { LONG_WAIT_DAYS, waitingInfo, type WaitingInfo } from './pending-review-wait';

function messageForStatus(status: number): string {
  switch (status) {
    case 403:
      return 'No tienes permiso para ver las tareas por aprobar.';
    default:
      return 'Ocurrió un error al cargar las tareas por aprobar.';
  }
}

function toPendingReviewError(status: number | undefined, body?: unknown): PlanError {
  if (status === undefined) {
    return new PlanError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  const message = typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined;
  const text =
    status === 403 && typeof message === 'string' && message.trim() !== '' && !/^forbidden/i.test(message)
      ? message
      : messageForStatus(status);
  return new PlanError(text, status);
}

/**
 * Tareas En revisión por aprobar dentro del alcance del actor
 * (GET /tasks/pending-review). Solo jefe de área y líder de proceso.
 */
export async function listPendingReview(): Promise<PendingReviewList> {
  try {
    const { data, error, response } = await api.GET('/tasks/pending-review');
    if (error || !data) {
      throw toPendingReviewError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPendingReviewError(undefined);
  }
}
