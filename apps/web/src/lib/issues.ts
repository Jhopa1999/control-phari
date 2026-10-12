import {
  api,
  type CreateIssue,
  type Issue,
  type Transition,
  type UpdateIssue,
} from './api-client';

/**
 * Error de dominio de novedades con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class IssueError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'IssueError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos o la transición solicitada.';
    case 403:
      return 'No tienes acceso a esta acción.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'La novedad entra en conflicto con otra existente.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/** Normaliza cualquier fallo (HTTP o de red) a un IssueError entendible. */
function toIssueError(status: number | undefined): IssueError {
  if (status === undefined) {
    return new IssueError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new IssueError(messageForStatus(status), status);
}

/** Novedades en alcance (GET /issues). El backend filtra por alcance. */
export async function listIssues(): Promise<Issue[]> {
  try {
    const { data, error, response } = await api.GET('/issues');
    if (error || !data) {
      throw toIssueError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof IssueError) throw err;
    throw toIssueError(undefined);
  }
}

/** Detalle de una novedad (GET /issues/:id). */
export async function getIssue(id: string): Promise<Issue> {
  try {
    const { data, error, response } = await api.GET('/issues/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toIssueError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof IssueError) throw err;
    throw toIssueError(undefined);
  }
}

/** Crea una novedad; tipo por defecto BLOQUEO (POST, 201). */
export async function createIssue(input: CreateIssue): Promise<Issue> {
  try {
    const { data, error, response } = await api.POST('/issues', {
      body: input,
    });
    if (error || !data) {
      throw toIssueError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof IssueError) throw err;
    throw toIssueError(undefined);
  }
}

/** Edita una novedad; un registro por incidente, AC-019 (PATCH, 200 + DTO). */
export async function updateIssue(
  id: string,
  input: UpdateIssue,
): Promise<Issue> {
  try {
    const { data, error, response } = await api.PATCH('/issues/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toIssueError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof IssueError) throw err;
    throw toIssueError(undefined);
  }
}

/** Transiciona el estado de una novedad (POST /issues/:id/transition, 200). */
export async function transitionIssue(
  id: string,
  input: Transition,
): Promise<Issue> {
  try {
    const { data, error, response } = await api.POST(
      '/issues/{id}/transition',
      {
        params: { path: { id } },
        body: input,
      },
    );
    if (error || !data) {
      throw toIssueError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof IssueError) throw err;
    throw toIssueError(undefined);
  }
}

/** Borra una novedad en alcance (DELETE, 204 sin body). */
export async function deleteIssue(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/issues/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toIssueError(response.status);
    }
  } catch (err) {
    if (err instanceof IssueError) throw err;
    throw toIssueError(undefined);
  }
}
