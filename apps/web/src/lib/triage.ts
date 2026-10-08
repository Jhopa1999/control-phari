import { api, type CreateTriage, type Triage } from './api-client';

/**
 * Error de dominio del modulo de triage, con mensaje entendible para el usuario.
 * Mismo criterio que lib/catalog.ts (no expone JSON ni errores de Prisma).
 */
export class TriageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TriageError';
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
      return 'El triage ya fue resuelto o la solicitud no esta en registro.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

function toTriageError(status: number | undefined): TriageError {
  if (status === undefined) {
    return new TriageError('No fue posible comunicarse con el servidor.');
  }
  return new TriageError(messageForStatus(status), status);
}

/** Historico de triage de una solicitud (GET /requests/:id/triage). */
export async function listTriage(requestId: string): Promise<Triage[]> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{id}/triage',
      { params: { path: { id: requestId } } },
    );
    if (error || !data) {
      throw toTriageError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof TriageError) throw err;
    throw toTriageError(undefined);
  }
}

/** Registra el triage de una solicitud (POST /requests/:id/triage). */
export async function createTriage(
  requestId: string,
  input: CreateTriage,
): Promise<Triage> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/triage',
      { params: { path: { id: requestId } }, body: input },
    );
    if (error || !data) {
      throw toTriageError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof TriageError) throw err;
    throw toTriageError(undefined);
  }
}
