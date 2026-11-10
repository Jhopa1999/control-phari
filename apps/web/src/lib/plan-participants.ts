import { api, type PlanParticipants } from './api-client';

/**
 * Error de la gestión de procesos que intervienen en un plan, con mensaje ya
 * entendible. A diferencia de otros errores del plan, aquí se muestra el texto
 * del backend también en 409 (p. ej. «hay tareas asignadas a su gente»).
 */
export class PlanParticipantsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PlanParticipantsError';
  }
}

function fallback(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los procesos elegidos.';
    case 403:
      return 'Solo el jefe de área puede gestionar los procesos que intervienen.';
    case 404:
      return 'La solicitud o su plan no existe o está fuera de tu alcance.';
    case 409:
      return 'No se pueden cambiar los procesos que intervienen en este momento.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/** Texto simple devuelto por el backend (400/409); si no hay, un mensaje por estado. */
function toError(status: number | undefined, body?: unknown): PlanParticipantsError {
  if (status === undefined) {
    return new PlanParticipantsError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  const message =
    (status === 400 || status === 409) && typeof body === 'object' && body !== null
      ? (body as { message?: unknown }).message
      : undefined;
  return new PlanParticipantsError(
    typeof message === 'string' && message.trim() !== '' ? message : fallback(status),
    status,
  );
}

/** Procesos activos y participantes de la solicitud del plan (solo jefe de área). */
export async function getPlanParticipants(requestId: string): Promise<PlanParticipants> {
  try {
    const { data, error, response } = await api.GET('/requests/{requestId}/plan/participants', {
      params: { path: { requestId } },
    });
    if (error || !data) throw toError(response.status, error);
    return data;
  } catch (err) {
    if (err instanceof PlanParticipantsError) throw err;
    throw toError(undefined);
  }
}

/**
 * Reemplaza los procesos que intervienen además del principal
 * (PUT /requests/:requestId/plan/participants). El backend valida el estado y
 * rechaza quitar procesos con tareas asignadas a su gente.
 */
export async function updatePlanParticipants(
  requestId: string,
  participantProcessIds: string[],
): Promise<PlanParticipants> {
  try {
    const { data, error, response } = await api.PUT('/requests/{requestId}/plan/participants', {
      params: { path: { requestId } },
      body: { participantProcessIds },
    });
    if (error || !data) throw toError(response.status, error);
    return data;
  } catch (err) {
    if (err instanceof PlanParticipantsError) throw err;
    throw toError(undefined);
  }
}
