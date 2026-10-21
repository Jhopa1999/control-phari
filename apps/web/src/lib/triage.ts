import {
  api,
  type AssociateAsset,
  type CreateTriage,
  type Request,
  type Triage,
  type TriageContext,
} from './api-client';

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
      return 'No tienes permiso para esta acción.';
    case 404:
      return 'No existe o está fuera de tu alcance.';
    case 409:
      return 'El triage ya fue resuelto o la solicitud no está en registro.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/**
 * Extrae un mensaje accionable del cuerpo de error de NestJS cuando venga
 * ({ message }); si no, cae al mapeo por status. Permite propagar el mensaje
 * especifico del 400 de responsable no elegible (design §5.2).
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

function toTriageError(
  status: number | undefined,
  body?: unknown,
): TriageError {
  if (status === undefined) {
    return new TriageError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new TriageError(messageFromBody(body) ?? messageForStatus(status), status);
}

/**
 * Contexto de triage de una solicitud (GET /requests/:id/triage): el triage
 * (0 o 1 fila en Fase 2) y los candidatos elegibles como responsable principal.
 */
export async function listTriage(requestId: string): Promise<TriageContext> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{id}/triage',
      { params: { path: { id: requestId } } },
    );
    if (error || !data) {
      throw toTriageError(response.status, error);
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
      throw toTriageError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof TriageError) throw err;
    throw toTriageError(undefined);
  }
}

/**
 * Asocia el activo base de una solicitud (POST /requests/:id/asset): activo
 * existente (assetId) XOR datos de uno nuevo (newAsset). Propaga el mensaje
 * legible del backend en 400/409 (p. ej. estado no asociable o XOR invalido).
 */
export async function associateAsset(
  requestId: string,
  input: AssociateAsset,
): Promise<Request> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/asset',
      { params: { path: { id: requestId } }, body: input },
    );
    if (error || !data) {
      throw toTriageError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof TriageError) throw err;
    throw toTriageError(undefined);
  }
}
