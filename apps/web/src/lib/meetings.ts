import {
  api,
  type CreateMeeting,
  type Meeting,
  type UpdateMeeting,
} from './api-client';

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
      return 'No tienes acceso a esta accion.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'La reunion entra en conflicto con otra existente.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

/** Normaliza cualquier fallo (HTTP o de red) a un MeetingError entendible. */
function toMeetingError(status: number | undefined): MeetingError {
  if (status === undefined) {
    return new MeetingError('No fue posible comunicarse con el servidor.');
  }
  return new MeetingError(messageForStatus(status), status);
}

/** Reuniones en alcance (GET /meetings). El backend filtra por alcance. */
export async function listMeetings(): Promise<Meeting[]> {
  try {
    const { data, error, response } = await api.GET('/meetings');
    if (error || !data) {
      throw toMeetingError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}

/** Detalle de una reunion con participantes (GET /meetings/:id). */
export async function getMeeting(id: string): Promise<Meeting> {
  try {
    const { data, error, response } = await api.GET('/meetings/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toMeetingError(response.status);
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
      throw toMeetingError(response.status);
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
      throw toMeetingError(response.status);
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
      throw toMeetingError(response.status);
    }
  } catch (err) {
    if (err instanceof MeetingError) throw err;
    throw toMeetingError(undefined);
  }
}
