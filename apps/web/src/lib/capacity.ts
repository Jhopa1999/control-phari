import {
  api,
  type Assignment,
  type Availability,
  type CapacityPerson,
  type CapacitySummaryRow,
  type CreateAssignment,
  type CreateAvailability,
  type UpdateAssignment,
  type UpdateAvailability,
} from './api-client';

/**
 * Error de dominio de capacidad con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class CapacityError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CapacityError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 403:
      return 'No tienes acceso a esta accion.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'Ya hay disponibilidad para esa persona y mes; editala.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

/**
 * Normaliza cualquier fallo (HTTP o de red) a un CapacityError entendible.
 */
function toCapacityError(status: number | undefined): CapacityError {
  if (status === undefined) {
    return new CapacityError('No fue posible comunicarse con el servidor.');
  }
  return new CapacityError(messageForStatus(status), status);
}

/** Resumen de carga por persona para un mes (GET /capacity/summary). */
export async function listCapacitySummary(
  month: string,
): Promise<CapacitySummaryRow[]> {
  try {
    const { data, error, response } = await api.GET('/capacity/summary', {
      params: { query: { month } },
    });
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

/** Personas en alcance para los selectores (GET /capacity/people). */
export async function listCapacityPeople(): Promise<CapacityPerson[]> {
  try {
    const { data, error, response } = await api.GET('/capacity/people');
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

/** Disponibilidades del mes en alcance (GET /capacity/availability). */
export async function listAvailability(
  month: string,
): Promise<Availability[]> {
  try {
    const { data, error, response } = await api.GET('/capacity/availability', {
      params: { query: { month } },
    });
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

/** Registra disponibilidad de una persona para un mes (POST, 201). */
export async function createAvailability(
  input: CreateAvailability,
): Promise<Availability> {
  try {
    const { data, error, response } = await api.POST('/capacity/availability', {
      body: input,
    });
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

/** Edita las horas disponibles de una disponibilidad (PATCH, 200 + DTO). */
export async function updateAvailability(
  id: string,
  input: UpdateAvailability,
): Promise<Availability> {
  try {
    const { data, error, response } = await api.PATCH(
      '/capacity/availability/{id}',
      {
        params: { path: { id } },
        body: input,
      },
    );
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

export interface AssignmentFilters {
  processId?: string;
  userId?: string;
  requestId?: string;
}

/** Asignaciones del mes en alcance con filtros opcionales (GET). */
export async function listAssignments(
  month: string,
  filters: AssignmentFilters = {},
): Promise<Assignment[]> {
  try {
    const { data, error, response } = await api.GET('/capacity/assignments', {
      params: {
        query: {
          month,
          ...(filters.processId ? { processId: filters.processId } : {}),
          ...(filters.userId ? { userId: filters.userId } : {}),
          ...(filters.requestId ? { requestId: filters.requestId } : {}),
        },
      },
    });
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

/** Crea una asignacion de horas, proceso requerido (POST, 201). */
export async function createAssignment(
  input: CreateAssignment,
): Promise<Assignment> {
  try {
    const { data, error, response } = await api.POST('/capacity/assignments', {
      body: input,
    });
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

/** Edita una asignacion (PATCH, 200 + DTO). */
export async function updateAssignment(
  id: string,
  input: UpdateAssignment,
): Promise<Assignment> {
  try {
    const { data, error, response } = await api.PATCH(
      '/capacity/assignments/{id}',
      {
        params: { path: { id } },
        body: input,
      },
    );
    if (error || !data) {
      throw toCapacityError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}

/** Borra una asignacion en alcance (DELETE, 204 sin body). */
export async function deleteAssignment(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/capacity/assignments/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toCapacityError(response.status);
    }
  } catch (err) {
    if (err instanceof CapacityError) throw err;
    throw toCapacityError(undefined);
  }
}
