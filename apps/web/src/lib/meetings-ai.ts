import {
  api,
  type MeetingAiAvailability,
  type MeetingAiProposal,
} from './api-client';

/** Estado de la ayuda de IA del acta para la interfaz. */
export type MeetingAiUiStatus = 'checking' | 'available' | 'off' | 'unavailable';

/**
 * Error de la ayuda de IA con un aviso ya entendible (título y texto), sin
 * códigos HTTP ni trazas. `retry` indica si tiene sentido ofrecer «Reintentar».
 */
export class MeetingAiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly title: string,
    readonly tone: 'warning' | 'danger',
    readonly retry: boolean,
    /** Si es true, el bloque pasa a «No disponible» el resto de la sesión del diálogo. */
    readonly blocksSession: boolean,
  ) {
    super(message);
    this.name = 'MeetingAiError';
  }
}

function serverMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim() !== '') return message;
  return undefined;
}

/** Aviso por estado HTTP (design Reuniones PR-3, apartado 7). */
export function toMeetingAiError(status: number | undefined, body?: unknown): MeetingAiError {
  const server = serverMessage(body);
  switch (status) {
    case undefined:
      return new MeetingAiError(
        'Revisa tu conexión e inténtalo de nuevo. Tu texto sigue aquí.',
        status,
        'No pudimos comunicarnos con el servidor',
        'warning',
        true,
        false,
      );
    case 400:
      return new MeetingAiError(
        server ??
          'Revisa que las notas tengan contenido y no sean demasiado largas. Si el texto es muy extenso, divídelo por partes.',
        status,
        'No pudimos enviar el texto',
        'warning',
        false,
        false,
      );
    case 401:
      return new MeetingAiError(
        'Vuelve a iniciar sesión. Tu texto de las notas no se guarda en el servidor: cópialo antes de salir.',
        status,
        'Tu sesión terminó',
        'warning',
        false,
        false,
      );
    case 403:
      return new MeetingAiError(
        'No tienes permiso para usar la IA en esta reunión. Puedes escribir el acta a mano.',
        status,
        'No puedes usar la IA aquí',
        'warning',
        false,
        true,
      );
    case 404:
      return new MeetingAiError(
        'El proceso elegido no existe o ya no tienes acceso. Elige otro proceso.',
        status,
        'El proceso ya no está disponible',
        'warning',
        false,
        false,
      );
    case 409:
      return new MeetingAiError(
        'Puede estar apagada o haber agotado su presupuesto mensual. Puedes seguir escribiendo el acta a mano. Si la necesitas, avisa a quien administra el portal.',
        status,
        'La ayuda de IA no está disponible ahora',
        'warning',
        false,
        true,
      );
    case 413:
      return new MeetingAiError(
        'Resume lo esencial o divide las notas en partes y estructura cada una.',
        status,
        'El texto es demasiado largo',
        'warning',
        false,
        false,
      );
    case 422:
      return new MeetingAiError(
        'Inténtalo de nuevo. Si se repite, escribe el acta a mano.',
        status,
        'La IA no devolvió algo que se pueda usar',
        'warning',
        true,
        false,
      );
    case 429:
      return new MeetingAiError(
        'Espera un minuto e inténtalo de nuevo.',
        status,
        'Hay muchas solicitudes de IA',
        'warning',
        true,
        false,
      );
    case 500:
      return new MeetingAiError(
        'Inténtalo de nuevo en unos minutos. Si se repite, avisa a quien administra el portal. Puedes escribir el acta a mano.',
        status,
        'Algo falló de nuestro lado',
        'danger',
        true,
        false,
      );
    case 503:
      return new MeetingAiError(
        'Inténtalo de nuevo en unos minutos. Tu texto sigue aquí.',
        status,
        'La IA no respondió a tiempo',
        'warning',
        true,
        false,
      );
    default:
      return new MeetingAiError(
        'Ocurrió un error inesperado. Inténtalo de nuevo.',
        status,
        'No se pudo estructurar el texto',
        'danger',
        true,
        false,
      );
  }
}

export interface StructureMeetingInput {
  processId: string;
  meetingDate: string;
  text: string;
  participantUserIds: string[];
}

/**
 * Pide la propuesta de acta y compromisos (POST /meetings/ai/structure). No
 * guarda nada: la persona revisa y acepta. `signal` permite cancelar.
 */
export async function structureMeetingNotes(
  input: StructureMeetingInput,
  signal?: AbortSignal,
): Promise<MeetingAiProposal> {
  try {
    const { data, error, response } = await api.POST('/meetings/ai/structure', {
      body: input,
      signal,
    });
    if (error || !data) {
      throw toMeetingAiError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof MeetingAiError) throw err;
    if (signal?.aborted) throw err;
    throw toMeetingAiError(undefined);
  }
}

/**
 * Disponibilidad de la ayuda (GET /meetings/ai/availability). Si falla, se
 * trata como apagada: el acta se escribe sin IA y no se alarma a la persona.
 */
export async function getMeetingAiAvailability(): Promise<MeetingAiAvailability> {
  try {
    const { data } = await api.GET('/meetings/ai/availability');
    return data ?? { status: 'off' };
  } catch {
    return { status: 'off' };
  }
}
