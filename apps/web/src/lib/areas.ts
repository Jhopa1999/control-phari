import {
  api,
  type Area,
  type CreateArea,
  type UpdateArea,
} from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Capa de consumo de Areas (p. ej. Analitica). Solo usa el cliente tipado del
 * contrato OpenAPI; apps/web NO toca Prisma ni la BD. La escritura es de ADMIN
 * (el backend aplica @Roles(ADMIN)); aqui no se duplican reglas de negocio.
 */

export interface AreaFilters {
  active?: boolean;
}

/** Lista areas (GET /areas). Filtro opcional por estado activo. */
export async function listAreas(filters: AreaFilters = {}): Promise<Area[]> {
  try {
    const { data, error, response } = await api.GET('/areas', {
      params: {
        query: {
          ...(filters.active !== undefined ? { active: filters.active } : {}),
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

/** Crea un area (POST /areas). code duplicado -> 409; solo ADMIN. */
export async function createArea(input: CreateArea): Promise<Area> {
  try {
    const { data, error, response } = await api.POST('/areas', { body: input });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Edita name/active/sortOrder de un area (PATCH /areas/:id). Solo ADMIN. */
export async function updateArea(id: string, input: UpdateArea): Promise<Area> {
  try {
    const { data, error, response } = await api.PATCH('/areas/{id}', {
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
