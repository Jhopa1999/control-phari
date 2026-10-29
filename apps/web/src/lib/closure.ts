import { api, type ClosureStatus, type PendingClosure } from './api-client';
import { ApiError, apiErrorFrom, toApiError } from './api-error';

export { ApiError };

/** Etiquetas del estado funcional del cierre (derivado en el backend). */
export const CLOSURE_PHASE_LABELS: Record<string, string> = {
  EN_EJECUCION: 'En ejecución',
  PENDIENTE_DOCUMENTACION: 'Pendiente de documentación',
  PENDIENTE_APROBACION_DOCUMENTAL: 'Pendiente de aprobación documental',
  EJECUCION_FINALIZADA: 'Ejecución finalizada',
  PENDIENTE_APROBACION_CIERRE: 'Pendiente de aprobación de cierre',
  CERRADO: 'Cerrado',
  NO_APLICA: 'Aún no está en ejecución',
};

export const CLOSURE_RECORD_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Estado del cierre del proyecto (GET /requests/:id/closure). */
export function getClosureStatus(requestId: string): Promise<ClosureStatus> {
  return wrap(async () => {
    const { data, error, response } = await api.GET('/requests/{id}/closure', {
      params: { path: { id: requestId } },
    });
    if (error || !data) throw apiErrorFrom(response.status, error);
    return data;
  });
}

/** Solicita el cierre (POST /requests/:id/closure). */
export function requestClosure(requestId: string): Promise<ClosureStatus> {
  return wrap(async () => {
    const { data, error, response } = await api.POST('/requests/{id}/closure', {
      params: { path: { id: requestId } },
    });
    if (error || !data) throw apiErrorFrom(response.status, error);
    return data;
  });
}

/** Aprueba o rechaza el cierre (POST /requests/:id/closure/decision, jefe). */
export function decideClosure(
  requestId: string,
  input: { decision: 'APROBAR' | 'RECHAZAR'; reason?: string },
): Promise<ClosureStatus> {
  return wrap(async () => {
    const { data, error, response } = await api.POST('/requests/{id}/closure/decision', {
      params: { path: { id: requestId } },
      body: input,
    });
    if (error || !data) throw apiErrorFrom(response.status, error);
    return data;
  });
}

/** Reabre un proyecto cerrado (POST /requests/:id/reopen, jefe). */
export function reopenProject(requestId: string, reason: string): Promise<ClosureStatus> {
  return wrap(async () => {
    const { data, error, response } = await api.POST('/requests/{id}/reopen', {
      params: { path: { id: requestId } },
      body: { reason },
    });
    if (error || !data) throw apiErrorFrom(response.status, error);
    return data;
  });
}

/** Cierres pendientes de aprobación (GET /closures/pending). */
export function listPendingClosures(): Promise<PendingClosure[]> {
  return wrap(async () => {
    const { data, error, response } = await api.GET('/closures/pending');
    if (error || !data) throw apiErrorFrom(response.status, error);
    return data;
  });
}
