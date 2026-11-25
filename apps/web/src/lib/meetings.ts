import {
  api,
  type CoordinationPerson,
  type CreateMeeting,
  type Meeting,
  type MeetingCommitmentsOpen,
  type MeetingCommitmentsOpenQuery,
  type UpdateMeeting,
} from './api-client';
import { readServerPage, type ServerPage } from './pagination';

/**
 * Error de dominio de reuniones con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class MeetingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MeetingError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 403:
      return 'No tienes acceso a esta acción.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'La reunión entra en conflicto con otra existente.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/** Normaliza cualquier fallo (HTTP o de red) a un MeetingError entendible. */
function toMeetingError(status: number | undefined, body?: unknown): MeetingError {
  if (status === undefined) {
    return new MeetingError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  const server = (body as { message?: unknown } | undefined)?.message;
  if (status !== undefined && typeof server === 'string' && server.trim()) {
    return new MeetingError(server, status);
  }
  return new MeetingError(messageForStatus(status), status);
}

/**
 * Texto que devuelve la API (400) cuando un participante no existe o no es del
 * proceso de la reunión. Se reconoce por texto exacto, como el de la persona.
 */
export const PARTICIPANT_NOT_IN_PROCESS_MESSAGE =
  'Un participante no existe o no pertenece al proceso de la reunión.';

/** Mensaje entendible para el 400 de participantes que la API devuelve en crudo. */
export const PARTICIPANT_NOT_IN_PROCESS_COPY =
  'Uno de los participantes no pertenece al proceso. Quítalo e intenta de nuevo.';

/**
 * Candidatos a responsable y participantes de un proceso
 * (GET /coordination/people?processId=). Son las mismas personas que acepta la
 * validación de la API al guardar el acta.
 */
export async function listProcessPeople(processId: string): Promise<CoordinationPerson[]> {
  try {
    const { data, error, response } = await api.GET('/coordination/people', {
      params: { query: { processId } },
    });
    if (error || !data) {
      throw toMeetingError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/** Búsqueda, filtros y página del listado de actas. */
export interface MeetingPageQuery {
  q?: string;
  processId?: string;
  /** true: solo actas abiertas (no cerradas ni archivadas). */
  open?: boolean;
  page: number;
  pageSize: number;
}

/**
 * Una página de actas (GET /meetings con page/pageSize). Busca y filtra el
 * servidor sobre el alcance único; el total llega en X-Total-Count.
 */
export async function listMeetingsPage(
  query: MeetingPageQuery,
  signal?: AbortSignal,
): Promise<ServerPage<Meeting>> {
  try {
    const { data, error, response } = await api.GET('/meetings', {
      params: {
        query: {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.q?.trim() ? { q: query.q.trim() } : {}),
          ...(query.processId ? { processId: query.processId } : {}),
          ...(query.open !== undefined ? { open: query.open } : {}),
        },
      },
      signal,
    });
    if (error || !data) {
      throw toMeetingError(response.status, error);
    }
    return readServerPage(data, response);
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    if (signal?.aborted) throw err;
    throw toMeetingError(undefined);
  }
}

/** Total de actas en alcance (sin búsqueda), para el contador de la pestaña. */
export async function countMeetings(): Promise<number> {
  const page = await listMeetingsPage({ page: 1, pageSize: 1 });
  return page.total;
}

/** Detalle de una reunion con participantes (GET /meetings/:id). */
export async function getMeeting(id: string): Promise<Meeting> {
  try {
    const { data, error, response } = await api.GET('/meetings/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toMeetingError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/** Crea una reunion; estado inicial BORRADOR (POST, 201). */
export async function createMeeting(
  input: CreateMeeting,
): Promise<Meeting> {
  try {
    const { data, error, response } = await api.POST('/meetings', {
      body: input,
    });
    if (error || !data) {
      throw toMeetingError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/** Edita una reunion, incluido el set de participantes (PATCH, 200 + DTO). */
export async function updateMeeting(
  id: string,
  input: UpdateMeeting,
): Promise<Meeting> {
  try {
    const { data, error, response } = await api.PATCH('/meetings/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toMeetingError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/** Borra una reunion en alcance; cascade de participantes (DELETE, 204). */
export async function deleteMeeting(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/meetings/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toMeetingError(response.status, error);
    }
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/** Cierra el acta (POST /meetings/:id/close): ya no se modifica. */
export async function closeMeeting(id: string): Promise<Meeting> {
  try {
    const { data, error, response } = await api.POST('/meetings/{id}/close', {
      params: { path: { id } },
    });
    if (error || !data) throw toMeetingError(response.status, error);
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/** Reabre un acta cerrada (POST /meetings/:id/reopen; líder o jefe). */
export async function reopenMeeting(id: string): Promise<Meeting> {
  try {
    const { data, error, response } = await api.POST('/meetings/{id}/reopen', {
      params: { path: { id } },
    });
    if (error || !data) throw toMeetingError(response.status, error);
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/**
 * «Compromisos abiertos de mis reuniones» (GET /meetings/commitments-open):
 * abiertos de las reuniones donde el actor es responsable, con semáforo de
 * vencimiento. Los filtros los aplica la API.
 */
export async function listOpenCommitmentsOfMyMeetings(
  query: MeetingCommitmentsOpenQuery = {},
): Promise<MeetingCommitmentsOpen> {
  try {
    const { data, error, response } = await api.GET('/meetings/commitments-open', {
      params: { query },
    });
    if (error || !data) throw toMeetingError(response.status, error);
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}
