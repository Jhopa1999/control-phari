import {
  api,
  type CoordinationPerson,
  type CreateActivity,
  type CreateDailyLog,
  type CreateWeeklyReport,
  type DailyLog,
  type DailyLogActivity,
  type DailyLogsQuery,
  type DailyLogSummary,
  type PaginatedDailyLogs,
  type UpdateActivity,
  type UpdateDailyLog,
  type UpdateWeeklyReport,
  type WeeklyReportsQuery,
  type WeeklyReport,
} from './api-client';

/**
 * Error de dominio de bitacora con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class WorklogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'WorklogError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 403:
      return 'No tienes acceso a esta acción.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'Ya hay un registro para esa persona, proceso y fecha.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/** Mensaje en español del servidor (400/403/409), si lo trae como texto. */
function serverMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const message = (error as { message?: unknown }).message;
  const text = Array.isArray(message) ? message[0] : message;
  return typeof text === 'string' && /[áéíóúñ ]/i.test(text) ? text : undefined;
}

/** Normaliza cualquier fallo (HTTP o de red) a un WorklogError entendible. */
function toWorklogError(status: number | undefined, error?: unknown): WorklogError {
  const fromServer = status === 400 || status === 403 || status === 409 ? serverMessage(error) : undefined;
  if (fromServer) return new WorklogError(fromServer, status);
  if (status === undefined) {
    return new WorklogError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new WorklogError(messageForStatus(status), status);
}

/**
 * Personas en alcance para los selectores de Fase 5 (GET /coordination/people).
 */
export async function listCoordinationPeople(): Promise<CoordinationPerson[]> {
  try {
    const { data, error, response } = await api.GET('/coordination/people');
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

// --- Diarios (DailyLog) ---

/**
 * Diarios en alcance, paginados (GET /worklog/daily). El backend aplica el
 * alcance por rol y los filtros antes de paginar.
 */
export async function listDailyLogs(
  query: DailyLogsQuery = {},
): Promise<PaginatedDailyLogs> {
  try {
    const { data, error, response } = await api.GET('/worklog/daily', {
      params: { query },
    });
    if (error || !data) {
      throw toWorklogError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Resumen de los diarios que cumplen el filtro (GET /worklog/daily/summary). */
export async function summarizeDailyLogs(
  query: DailyLogsQuery = {},
): Promise<DailyLogSummary> {
  try {
    const { data, error, response } = await api.GET('/worklog/daily/summary', {
      params: { query },
    });
    if (error || !data) {
      throw toWorklogError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

async function transition(
  path: '/worklog/daily/{id}/recall' | '/worklog/daily/{id}/review',
  id: string,
): Promise<DailyLog> {
  try {
    const { data, error, response } = await api.POST(path, {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toWorklogError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** El autor retira su envío (ENVIADO a BORRADOR). */
export function recallDailyLog(id: string): Promise<DailyLog> {
  return transition('/worklog/daily/{id}/recall', id);
}

/** Jefe o líder marca el diario como revisado. */
export function reviewDailyLog(id: string): Promise<DailyLog> {
  return transition('/worklog/daily/{id}/review', id);
}

/** Devuelve el diario a borrador con un motivo (lo ve el autor). */
export async function returnDailyLog(
  id: string,
  reason: string,
): Promise<DailyLog> {
  try {
    const { data, error, response } = await api.POST(
      '/worklog/daily/{id}/return',
      { params: { path: { id } }, body: { reason } },
    );
    if (error || !data) {
      throw toWorklogError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Detalle de un diario con sus actividades (GET /worklog/daily/:id). */
export async function getDailyLog(id: string): Promise<DailyLog> {
  try {
    const { data, error, response } = await api.GET('/worklog/daily/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Crea la cabecera de un diario (POST, 201). */
export async function createDailyLog(
  input: CreateDailyLog,
): Promise<DailyLog> {
  try {
    const { data, error, response } = await api.POST('/worklog/daily', {
      body: input,
    });
    if (error || !data) {
      throw toWorklogError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Edita la cabecera (notas) de un diario (PATCH, 200 + DTO). */
export async function updateDailyLog(
  id: string,
  input: UpdateDailyLog,
): Promise<DailyLog> {
  try {
    const { data, error, response } = await api.PATCH('/worklog/daily/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Borra un diario propio (DELETE, 204 sin body). */
export async function deleteDailyLog(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/worklog/daily/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toWorklogError(response.status);
    }
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Envia un diario a revision (POST /worklog/daily/:id/submit, 200 + DTO). */
export async function submitDailyLog(id: string): Promise<DailyLog> {
  try {
    const { data, error, response } = await api.POST(
      '/worklog/daily/{id}/submit',
      { params: { path: { id } } },
    );
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

// --- Actividades del diario (DailyLogActivity) ---

/** Agrega una actividad al diario (POST, 201). Valida clasificacion server-side. */
export async function createActivity(
  dailyLogId: string,
  input: CreateActivity,
): Promise<DailyLogActivity> {
  try {
    const { data, error, response } = await api.POST(
      '/worklog/daily/{id}/activities',
      {
        params: { path: { id: dailyLogId } },
        body: input,
      },
    );
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Edita una actividad del diario (PATCH, 200 + DTO). */
export async function updateActivity(
  id: string,
  input: UpdateActivity,
): Promise<DailyLogActivity> {
  try {
    const { data, error, response } = await api.PATCH(
      '/worklog/activities/{id}',
      {
        params: { path: { id } },
        body: input,
      },
    );
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Borra una actividad del diario (DELETE, 204 sin body). */
export async function deleteActivity(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/worklog/activities/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toWorklogError(response.status);
    }
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

// --- Semanales (WeeklyReport) ---

/** Semanales en alcance (GET /weekly-reports). consolidation=null en listados. */
export async function listWeeklyReports(
  query: WeeklyReportsQuery = {},
): Promise<WeeklyReport[]> {
  try {
    const { data, error, response } = await api.GET('/weekly-reports', {
      params: { query },
    });
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Detalle de un semanal con conteos de consolidacion (GET /weekly-reports/:id). */
export async function getWeeklyReport(id: string): Promise<WeeklyReport> {
  try {
    const { data, error, response } = await api.GET('/weekly-reports/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Crea un semanal; el backend lo ancla al lunes ISO (POST, 201). */
export async function createWeeklyReport(
  input: CreateWeeklyReport,
): Promise<WeeklyReport> {
  try {
    const { data, error, response } = await api.POST('/weekly-reports', {
      body: input,
    });
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Edita las secciones de texto de un semanal propio (PATCH, 200 + DTO). */
export async function updateWeeklyReport(
  id: string,
  input: UpdateWeeklyReport,
): Promise<WeeklyReport> {
  try {
    const { data, error, response } = await api.PATCH('/weekly-reports/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Envia un semanal a revision (POST /weekly-reports/:id/submit, 200 + DTO). */
export async function submitWeeklyReport(id: string): Promise<WeeklyReport> {
  try {
    const { data, error, response } = await api.POST(
      '/weekly-reports/{id}/submit',
      { params: { path: { id } } },
    );
    if (error || !data) {
      throw toWorklogError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

async function weeklyTransition(
  path: '/weekly-reports/{id}/review',
  id: string,
): Promise<WeeklyReport> {
  try {
    const { data, error, response } = await api.POST(path, {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toWorklogError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}

/** Jefe o líder marca el semanal como revisado. */
export function reviewWeeklyReport(id: string): Promise<WeeklyReport> {
  return weeklyTransition('/weekly-reports/{id}/review', id);
}

/** Devuelve el semanal a borrador con un motivo (lo ve el autor). */
export async function returnWeeklyReport(
  id: string,
  reason: string,
): Promise<WeeklyReport> {
  try {
    const { data, error, response } = await api.POST(
      '/weekly-reports/{id}/return',
      { params: { path: { id } }, body: { reason } },
    );
    if (error || !data) {
      throw toWorklogError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof WorklogError) throw err;
    throw toWorklogError(undefined);
  }
}
