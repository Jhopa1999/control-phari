import {
  api,
  type Approval,
  type CreateApproval,
  type Request,
} from './api-client';

/**
 * Error de dominio del modulo de aprobaciones, con mensaje entendible.
 * Mismo criterio que lib/catalog.ts.
 */
export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApprovalError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 403:
      return 'No tienes permiso para esta accion.';
    case 404:
      return 'No existe o esta fuera de tu alcance.';
    case 409:
      return 'La solicitud no esta lista para aprobacion.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

function toApprovalError(status: number | undefined): ApprovalError {
  if (status === undefined) {
    return new ApprovalError('No fue posible comunicarse con el servidor.');
  }
  return new ApprovalError(messageForStatus(status), status);
}

/** Cola de solicitudes pendientes de aprobacion (GET /requests/pending-approval). */
export async function listPendingApproval(): Promise<Request[]> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/pending-approval',
    );
    if (error || !data) {
      throw toApprovalError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApprovalError) throw err;
    throw toApprovalError(undefined);
  }
}

/** Historico de decisiones de compromiso (GET /requests/:id/approval). */
export async function listApprovals(requestId: string): Promise<Approval[]> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{id}/approval',
      { params: { path: { id: requestId } } },
    );
    if (error || !data) {
      throw toApprovalError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApprovalError) throw err;
    throw toApprovalError(undefined);
  }
}

/**
 * Registra una decision de compromiso (POST /requests/:id/approval).
 * APROBAR -> Comprometida; DEVOLVER requiere motivo (ausencia -> 400).
 */
export async function createApproval(
  requestId: string,
  input: CreateApproval,
): Promise<Approval> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/approval',
      { params: { path: { id: requestId } }, body: input },
    );
    if (error || !data) {
      throw toApprovalError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApprovalError) throw err;
    throw toApprovalError(undefined);
  }
}
