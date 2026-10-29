import { api, type NotificationList } from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/** Notificaciones del usuario actual con el contador de no leídas (GET /notifications). */
export async function listNotifications(take = 20): Promise<NotificationList> {
  try {
    const { data, error, response } = await api.GET('/notifications', {
      params: { query: { take } },
    });
    if (error || !data) throw toApiError(response.status);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Marca una notificación propia como leída. */
export async function markNotificationRead(id: string): Promise<void> {
  try {
    const { error, response } = await api.POST('/notifications/{id}/read', {
      params: { path: { id } },
    });
    if (error || !response.ok) throw toApiError(response.status);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Marca todas las notificaciones del usuario como leídas. */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    const { error, response } = await api.POST('/notifications/read-all');
    if (error || !response.ok) throw toApiError(response.status);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
