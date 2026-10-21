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

/**
 * Extrae un mensaje accionable del cuerpo de error de NestJS ({ message }); si
 * no, cae al mapeo por status. Permite propagar el 409 legible del gate de
 * activo base ('Asocia un activo a la solicitud en el triage antes de
 * priorizarla.') en lugar del mensaje genérico (FEAT-003).
 */
function messageFromBody(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim() !== '') return message;
  if (Array.isArray(message)) {
    const first = message.find((m) => typeof m === 'string' && m.trim() !== '');
    if (typeof first === 'string') return first;
  }
  return undefined;
}

function toPriorityError(
  status: number | undefined,
  body?: unknown,
): PriorityError {
  if (status === undefined) {
    return new PriorityError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new PriorityError(messageFromBody(body) ?? messageForStatus(status), status);
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
      throw toPriorityError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof PriorityError) throw err;
    throw toPriorityError(undefined);
  }
}
