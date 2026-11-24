import {
  api,
  type BatchApprovalResult,
  type PendingReviewItem,
  type PendingReviewList,
} from './api-client';
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

/** Tope del lote: coincide con el contrato (BatchApproveTasksDto); el servidor lo valida igual. */
export const MAX_TASK_BATCH = 25;

/**
 * Aprueba tareas en lote (POST /tasks/batch-approve). No es atómico: la respuesta
 * trae un resultado por tarea y el motivo de las omitidas.
 */
export async function batchApproveTasks(taskIds: string[]): Promise<BatchApprovalResult> {
  try {
    const { data, error, response } = await api.POST('/tasks/batch-approve', {
      body: { taskIds },
    });
    if (error || !data) {
      const message =
        typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
      const text =
        response.status === 403 || response.status === 400
          ? typeof message === 'string' && message.trim() !== ''
            ? message
            : 'No se pudo aprobar el lote.'
          : 'Ocurrió un error al aprobar las tareas.';
      throw new PlanError(text, response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPendingReviewError(undefined);
  }
}