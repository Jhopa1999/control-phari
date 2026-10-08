import {
  api,
  type CreateRequest,
  type Request,
  type UpdateRequest,
} from './api-client';

/**
 * Error de dominio con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 * Mismo criterio que lib/catalog.ts.
 */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RequestError';
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
      return 'La solicitud no cumple la precondicion de esta fase.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

function toRequestError(status: number | undefined): RequestError {
  if (status === undefined) {
    return new RequestError('No fue posible comunicarse con el servidor.');
  }
  return new RequestError(messageForStatus(status), status);
}

export interface RequestFilters {
  mainProcessId?: string;
  state?: string;
}

/** Lista solicitudes dentro del alcance del actor (GET /requests). */
export async function listRequests(
  filters: RequestFilters = {},
): Promise<Request[]> {
  try {
    const { data, error, response } = await api.GET('/requests', {
      params: {
        query: {
          ...(filters.mainProcessId
            ? { mainProcessId: filters.mainProcessId }
            : {}),
          ...(filters.state ? { state: filters.state } : {}),
        },
      },
    });
    if (error || !data) {
      throw toRequestError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof RequestError) throw err;
    throw toRequestError(undefined);
  }
}

/** Obtiene una solicitud por id (GET /requests/:id). 404 fuera de alcance. */
export async function getRequest(id: string): Promise<Request> {
  try {
    const { data, error, response } = await api.GET('/requests/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toRequestError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof RequestError) throw err;
    throw toRequestError(undefined);
  }
}

/** Crea una solicitud en estado REGISTRADA (POST /requests, BR-001). */
export async function createRequest(input: CreateRequest): Promise<Request> {
  try {
    const { data, error, response } = await api.POST('/requests', {
      body: input,
    });
    if (error || !data) {
      throw toRequestError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof RequestError) throw err;
    throw toRequestError(undefined);
  }
}

/** Edita la ficha (no el estado) y conserva fechas iniciales (PATCH, BR-017). */
export async function updateRequest(
  id: string,
  input: UpdateRequest,
): Promise<Request> {
  try {
    const { data, error, response } = await api.PATCH('/requests/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toRequestError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof RequestError) throw err;
    throw toRequestError(undefined);
  }
}
