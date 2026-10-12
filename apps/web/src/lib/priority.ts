import {
  api,
  type CreatePriorityEvaluation,
  type PriorityEvaluation,
} from './api-client';

/**
 * Error de dominio del modulo de priorizacion, con mensaje entendible.
 * Mismo criterio que lib/catalog.ts.
 */
export class PriorityError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PriorityError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 403:
      return 'No tienes permiso para esta acción.';
    case 404:
      return 'No existe o está fuera de tu alcance.';
    case 409:
      return 'La priorización requiere un triage con decisión Continuar.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

function toPriorityError(status: number | undefined): PriorityError {
  if (status === undefined) {
    return new PriorityError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new PriorityError(messageForStatus(status), status);
}

/** Historico de evaluaciones (GET /requests/:id/priority). La vigente es la ultima. */
export async function listPriorityEvaluations(
  requestId: string,
): Promise<PriorityEvaluation[]> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{id}/priority',
      { params: { path: { id: requestId } } },
    );
    if (error || !data) {
      throw toPriorityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PriorityError) throw err;
    throw toPriorityError(undefined);
  }
}

/**
 * Guarda una evaluacion de prioridad (POST /requests/:id/priority).
 * El score lo calcula el backend; el cliente NO lo envia.
 */
export async function createPriorityEvaluation(
  requestId: string,
  input: CreatePriorityEvaluation,
): Promise<PriorityEvaluation> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/priority',
      { params: { path: { id: requestId } }, body: input },
    );
    if (error || !data) {
      throw toPriorityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PriorityError) throw err;
    throw toPriorityError(undefined);
  }
}
