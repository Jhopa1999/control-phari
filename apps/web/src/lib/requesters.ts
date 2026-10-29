import {
  api,
  type CreateRequester,
  type Requester,
  type UpdateRequester,
} from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Capa de consumo del maestro de solicitantes. Solo usa el cliente tipado del
 * contrato OpenAPI. La escritura es de ADMIN/JEFE_AREA (lo aplica el backend).
 */

export interface RequesterFilters {
  active?: boolean;
  areaId?: string;
}

/** Lista solicitantes (GET /requesters). */
export async function listRequesters(filters: RequesterFilters = {}): Promise<Requester[]> {
  try {
    const { data, error, response } = await api.GET('/requesters', {
      params: {
        query: {
          ...(filters.active !== undefined ? { active: filters.active } : {}),
          ...(filters.areaId !== undefined ? { areaId: filters.areaId } : {}),
        },
      },
    });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Crea un solicitante (POST /requesters). Nombre duplicado -> 409. */
export async function createRequester(input: CreateRequester): Promise<Requester> {
  try {
    const { data, error, response } = await api.POST('/requesters', { body: input });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Edita o activa/inactiva un solicitante (PATCH /requesters/:id). */
export async function updateRequester(
  id: string,
  input: UpdateRequester,
): Promise<Requester> {
  try {
    const { data, error, response } = await api.PATCH('/requesters/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
