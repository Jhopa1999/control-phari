import {
  api,
  type CompleteRecurringOccurrence,
  type CreateRecurringActivity,
  type PaginatedRecurringOccurrences,
  type RecurringActivity,
  type RecurringOccurrence,
  type RecurringOccurrencesQuery,
  type UpdateRecurringActivity,
} from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Capa de consumo de ACTIVIDADES RECURRENTES (FEAT-002). Solo usa el cliente
 * tipado del contrato OpenAPI; apps/web NO toca Prisma ni la BD y NO duplica
 * reglas de negocio: el alcance (mine/all) y los permisos los decide el
 * backend. Los errores se normalizan a ApiError con mensaje entendible, sin
 * stack traces ni JSON crudo.
 */

/** Lista ocurrencias por alcance (GET /recurring-activities/occurrences). */
export async function listOccurrences(
  query: RecurringOccurrencesQuery = {},
): Promise<PaginatedRecurringOccurrences> {
  try {
    const { data, error, response } = await api.GET(
      '/recurring-activities/occurrences',
      { params: { query } },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Detalle de una ocurrencia (GET /recurring-activities/occurrences/:id). */
export async function getOccurrence(id: string): Promise<RecurringOccurrence> {
  try {
    const { data, error, response } = await api.GET(
      '/recurring-activities/occurrences/{id}',
      { params: { path: { id } } },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Toma una ocurrencia (POST .../:id/start): PENDIENTE -> EN_CURSO. */
export async function startOccurrence(
  id: string,
): Promise<RecurringOccurrence> {
  try {
    const { data, error, response } = await api.POST(
      '/recurring-activities/occurrences/{id}/start',
      { params: { path: { id } } },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Completa una ocurrencia (POST .../:id/complete), comentario opcional. */
export async function completeOccurrence(
  id: string,
  body: CompleteRecurringOccurrence = {},
): Promise<RecurringOccurrence> {
  try {
    const { data, error, response } = await api.POST(
      '/recurring-activities/occurrences/{id}/complete',
      { params: { path: { id } }, body },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Lista las definiciones gestionables (GET /recurring-activities). */
export async function listActivities(): Promise<RecurringActivity[]> {
  try {
    const { data, error, response } = await api.GET('/recurring-activities');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Crea una definicion (POST /recurring-activities). */
export async function createActivity(
  input: CreateRecurringActivity,
): Promise<RecurringActivity> {
  try {
    const { data, error, response } = await api.POST('/recurring-activities', {
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

/** Edita una definicion (PATCH /recurring-activities/:id). */
export async function updateActivity(
  id: string,
  input: UpdateRecurringActivity,
): Promise<RecurringActivity> {
  try {
    const { data, error, response } = await api.PATCH(
      '/recurring-activities/{id}',
      { params: { path: { id } }, body: input },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Pausa una definicion (DELETE = soft-delete active=false). */
export async function pauseActivity(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/recurring-activities/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toApiError(response.status);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
