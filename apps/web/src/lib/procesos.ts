import {
  api,
  type CreateProcess,
  type Process,
  type UpdateProcess,
} from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Capa de consumo de Procesos (p. ej. BI, Integraciones, IA). Solo usa el
 * cliente tipado del contrato OpenAPI; apps/web NO toca Prisma ni la BD. La
 * escritura es de ADMIN o JEFE_AREA (el backend aplica @Roles); aqui no se
 * duplican reglas de negocio ni de alcance.
 */

export interface ProcessFilters {
  active?: boolean;
}

/** Lista procesos accesibles (GET /processes). Filtro opcional por activo. */
export async function listProcesses(
  filters: ProcessFilters = {},
): Promise<Process[]> {
  try {
    const { data, error, response } = await api.GET('/processes', {
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

/** Crea un proceso (POST /processes). code duplicado -> 409. */
export async function createProcess(input: CreateProcess): Promise<Process> {
  try {
    const { data, error, response } = await api.POST('/processes', {
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

/**
 * Edita name/framework/active/sortOrder de un proceso (PATCH /processes/:id).
 * El area no se mueve desde esta pantalla (UpdateProcessDto no lleva areaId).
 */
export async function updateProcess(
  id: string,
  input: UpdateProcess,
): Promise<Process> {
  try {
    const { data, error, response } = await api.PATCH('/processes/{id}', {
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
