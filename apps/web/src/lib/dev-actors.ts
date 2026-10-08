import { api, type DevActor } from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Lista de usuarios activos para poblar el selector de usuario (dev).
 * GET /dev/actors es publico (no requiere actor) y solo responde datos cuando
 * AUTH_MODE=dev-header; fuera de ese modo responde 404 (design 3.4).
 */
export async function listDevActors(): Promise<DevActor[]> {
  try {
    const { data, error, response } = await api.GET('/dev/actors');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
