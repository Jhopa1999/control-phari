import {
  api,
  type CreateGrant,
  type CreateUser,
  type Grant,
  type Process,
  type User,
} from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/** Usuarios del area (GET /users). Solo jefe. */
export async function listUsers(): Promise<User[]> {
  try {
    const { data, error, response } = await api.GET('/users');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Crea un usuario (POST /users). identifier duplicado -> 409. */
export async function createUser(input: CreateUser): Promise<User> {
  try {
    const { data, error, response } = await api.POST('/users', { body: input });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

export interface GrantFilters {
  userId?: string;
  processId?: string;
  active?: boolean;
}

/** Grants visibles (GET /grants). Solo jefe; filtra por scope del jefe. */
export async function listGrants(filters: GrantFilters = {}): Promise<Grant[]> {
  try {
    const { data, error, response } = await api.GET('/grants', {
      params: {
        query: {
          ...(filters.userId ? { userId: filters.userId } : {}),
          ...(filters.processId ? { processId: filters.processId } : {}),
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

/** Crea o reactiva un grant (POST /grants). Duplicado activo -> 409. */
export async function createGrant(input: CreateGrant): Promise<Grant> {
  try {
    const { data, error, response } = await api.POST('/grants', {
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

/** Revoca (soft-delete) un grant (DELETE /grants/:id). Devuelve el actualizado. */
export async function revokeGrant(id: string): Promise<Grant> {
  try {
    const { data, error, response } = await api.DELETE('/grants/{id}', {
      params: { path: { id } },
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
 * Reenvía la invitación de activación (POST /users/{id}/invite). Responde 204
 * sin body: el éxito es la ausencia de `error` (no comprobar `!data`, siempre
 * sería undefined). Reenviar invalida el enlace de invitaciones anteriores.
 */
export async function inviteUser(id: string): Promise<void> {
  try {
    const { error, response } = await api.POST('/users/{id}/invite', {
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

/**
 * Procesos accesibles (GET /processes). Se usa para poblar el selector de
 * proceso al crear un grant; el backend filtra por alcance segun el rol.
 */
export async function listProcesses(): Promise<Process[]> {
  try {
    const { data, error, response } = await api.GET('/processes');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
