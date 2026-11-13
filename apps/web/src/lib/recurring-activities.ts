import {
  api,
  type CompleteRecurringOccurrence,
  type CreateRecurringActivity,
  type PaginatedRecurringOccurrences,
  type RecurrencePreview,
  type RecurrencePreviewQuery,
  type RecurringActivity,
  type RecurringBoard,
  type RecurringBoardQuery,
  type RecurringCalendarQuery,
  type RecurringEvidenceDownload,
  type RecurringMyWork,
  type RecurringOccurrenceEvidence,
  type RecurringCompliance,
  type RecurringComplianceQuery,
  type RecurringOccurrence,
  type RecurringOccurrencesQuery,
  type UpdateRecurringActivity,
} from './api-client';
import { ApiError, apiErrorFrom, toApiError } from './api-error';

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
      throw apiErrorFrom(response.status, error);
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
      throw apiErrorFrom(response.status, error);
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
      throw apiErrorFrom(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Completa una ocurrencia (POST .../:id/complete): qué se realizó y horas reales. */
export async function completeOccurrence(
  id: string,
  body: CompleteRecurringOccurrence,
): Promise<RecurringOccurrence> {
  try {
    const { data, error, response } = await api.POST(
      '/recurring-activities/occurrences/{id}/complete',
      { params: { path: { id } }, body },
    );
    if (error || !data) {
      throw apiErrorFrom(response.status, error);
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
      throw apiErrorFrom(response.status, error);
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
      throw apiErrorFrom(response.status, error);
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
      throw apiErrorFrom(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Panel de cumplimiento (GET /recurring-activities/compliance, jefe/admin). */
export async function getCompliance(
  query: RecurringComplianceQuery = {},
): Promise<RecurringCompliance> {
  try {
    const { data, error, response } = await api.GET(
      '/recurring-activities/compliance',
      { params: { query } },
    );
    if (error || !data) {
      throw apiErrorFrom(response.status, error);
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
      throw apiErrorFrom(response.status, error);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Reanuda una definicion pausada (POST /recurring-activities/:id/resume). */
export async function resumeActivity(id: string): Promise<RecurringActivity> {
  try {
    const { data, error, response } = await api.POST(
      '/recurring-activities/{id}/resume',
      { params: { path: { id } } },
    );
    if (error || !data) {
      throw apiErrorFrom(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Ejecuta una llamada del cliente tipado y normaliza el fallo a ApiError. */
async function call<T>(
  run: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  try {
    const { data, error, response } = await run();
    if (error || data === undefined) {
      throw apiErrorFrom(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Tablero "Que me toca" (GET .../occurrences/board). completedWeeks: 4, 12 o 0 (todas). */
export function listBoard(query: RecurringBoardQuery = {}): Promise<RecurringBoard> {
  return call(() =>
    api.GET('/recurring-activities/occurrences/board', { params: { query } }),
  );
}

/** Ocurrencias de un rango (GET .../occurrences/calendar), maximo 62 dias. */
export function listCalendar(
  query: RecurringCalendarQuery,
): Promise<RecurringOccurrence[]> {
  return call(() =>
    api.GET('/recurring-activities/occurrences/calendar', { params: { query } }),
  );
}

/** Ocurrencias trabajables del actor para "Mi trabajo" (GET .../occurrences/my-work). */
export function listMyWorkOccurrences(): Promise<RecurringMyWork> {
  return call(() => api.GET('/recurring-activities/occurrences/my-work'));
}

/** Proximas 3 fechas de una cadencia (GET /recurring-activities/preview). */
export function previewDates(
  query: RecurrencePreviewQuery,
): Promise<RecurrencePreview> {
  return call(() =>
    api.GET('/recurring-activities/preview', { params: { query } }),
  );
}

/** Adjuntos de una ocurrencia (GET .../occurrences/:id/evidence). */
export function listEvidence(
  id: string,
): Promise<RecurringOccurrenceEvidence[]> {
  return call(() =>
    api.GET('/recurring-activities/occurrences/{id}/evidence', {
      params: { path: { id } },
    }),
  );
}

/** Sube UN archivo (multipart, campo file) antes de completar. */
export function uploadEvidence(
  id: string,
  file: File,
): Promise<RecurringOccurrenceEvidence> {
  return call(() =>
    api.POST('/recurring-activities/occurrences/{id}/evidence', {
      params: { path: { id } },
      // El contrato tipa el binario como string; el serializador lo envia como File.
      body: { file: file as unknown as string },
      bodySerializer: (body) => {
        const form = new FormData();
        form.append('file', body.file as unknown as File);
        return form;
      },
    }),
  );
}

/** Quita un adjunto (DELETE .../evidence/:evidenceId). */
export async function deleteEvidence(
  id: string,
  evidenceId: string,
): Promise<void> {
  try {
    const { error, response } = await api.DELETE(
      '/recurring-activities/occurrences/{id}/evidence/{evidenceId}',
      { params: { path: { id, evidenceId } } },
    );
    if (error) throw apiErrorFrom(response.status, error);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Pide la URL firmada y abre la descarga en una pestana nueva. */
export async function downloadEvidence(
  id: string,
  evidenceId: string,
): Promise<void> {
  const link: RecurringEvidenceDownload = await call(() =>
    api.GET(
      '/recurring-activities/occurrences/{id}/evidence/{evidenceId}/download',
      { params: { path: { id, evidenceId } } },
    ),
  );
  window.open(link.url, '_blank', 'noopener,noreferrer');
}