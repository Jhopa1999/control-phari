import { api, type AuditEvent } from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

export type AuditObjectType = 'PROCESS' | 'USER' | 'GRANT' | 'CATALOG_ITEM';

export interface AuditFilters {
  objectType?: AuditObjectType;
  take?: number;
}

/**
 * Eventos de auditoria visibles para el actor (GET /audit-events). El alcance
 * (propio para integrante, por proceso para lider/jefe) lo aplica el backend;
 * el tope de resultados tambien se acota en el servidor (<= 500).
 */
export async function listAuditEvents(
  filters: AuditFilters = {},
): Promise<AuditEvent[]> {
  try {
    const { data, error, response } = await api.GET('/audit-events', {
      params: {
        query: {
          ...(filters.objectType ? { objectType: filters.objectType } : {}),
          ...(filters.take !== undefined ? { take: filters.take } : {}),
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
