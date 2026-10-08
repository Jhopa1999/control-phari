import { api, type MyPermissions } from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Permisos del actor actual (GET /me/permissions). Requiere un X-Actor-Id
 * valido inyectado por el middleware del cliente.
 */
export async function getMyPermissions(): Promise<MyPermissions> {
  try {
    const { data, error, response } = await api.GET('/me/permissions');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
