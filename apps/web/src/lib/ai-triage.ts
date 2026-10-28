import { api, type TriageSuggestion } from './api-client';

/**
 * Error de dominio de la sugerencia de IA del triage, con mensaje entendible.
 * Mismo criterio que lib/triage.ts: no expone JSON ni errores internos. La
 * sugerencia nunca persiste nada; estos estados solo informan por que no hay
 * sugerencia disponible, dejando el triage manual intacto.
 */
export class AiTriageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiTriageError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 403:
      return 'No tienes permiso para esta acción.';
    case 404:
      return 'No existe o está fuera de tu alcance.';
    case 409:
      return 'La sugerencia de IA no está disponible ahora.';
    case 422:
      return 'La IA devolvió una respuesta no interpretable.';
    case 503:
      return 'La IA no respondió a tiempo.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/**
 * Extrae un mensaje accionable del cuerpo de error de NestJS cuando venga
 * ({ message }); si no, cae al mapeo por status. Permite propagar el mensaje
 * especifico del backend (p. ej. el detalle de la degradacion).
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

function toAiTriageError(
  status: number | undefined,
  body?: unknown,
): AiTriageError {
  if (status === undefined) {
    return new AiTriageError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new AiTriageError(
    messageFromBody(body) ?? messageForStatus(status),
    status,
  );
}

/**
 * Pide una sugerencia de IA para el triage de una solicitud
 * (POST /requests/{id}/ai/triage-suggestion). No persiste nada: devuelve codes
 * sugeridos, banda de prioridad orientativa, posibles duplicados e informacion
 * faltante para que el humano decida.
 */
export async function requestTriageSuggestion(
  requestId: string,
): Promise<TriageSuggestion> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/ai/triage-suggestion',
      { params: { path: { id: requestId } } },
    );
    if (error || !data) {
      throw toAiTriageError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof AiTriageError) throw err;
    throw toAiTriageError(undefined);
  }
}
