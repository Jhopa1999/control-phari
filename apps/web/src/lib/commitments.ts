import {
  api,
  type Commitment,
  type CommitmentMyWork,
  type CreateCommitment,
  type Transition,
  type UpdateCommitment,
} from './api-client';
import { readServerPage, type ServerPage } from './pagination';

/**
 * Error de dominio de compromisos con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class CommitmentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CommitmentError';
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
      return 'El compromiso entra en conflicto con otro existente.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/** Normaliza cualquier fallo (HTTP o de red) a un CommitmentError entendible. */
function toCommitmentError(status: number | undefined, body?: unknown): CommitmentError {
  if (status === undefined) {
    return new CommitmentError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  const server = (body as { message?: unknown } | undefined)?.message;
  if (status !== undefined && typeof server === 'string' && server.trim()) {
    return new CommitmentError(server, status);
  }
  return new CommitmentError(messageForStatus(status), status);
}

/** Vistas de seguimiento que filtra el servidor. */
export type CommitmentView = 'ABIERTOS' | 'VENCIDOS' | 'TERMINADOS';

/** Búsqueda, filtros y página del listado de compromisos. */
export interface CommitmentPageQuery {
  q?: string;
  view?: CommitmentView;
  /** Asignado o responsable. */
  personId?: string;
  meetingId?: string;
  withoutMeeting?: boolean;
  page: number;
  pageSize: number;
}

/**
 * Una página de compromisos (GET /commitments con page/pageSize). Busca y
 * filtra el servidor sobre el alcance único; el total llega en X-Total-Count.
 */
export async function listCommitmentsPage(
  query: CommitmentPageQuery,
  signal?: AbortSignal,
): Promise<ServerPage<Commitment>> {
  try {
    const { data, error, response } = await api.GET('/commitments', {
      params: {
        query: {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.q?.trim() ? { q: query.q.trim() } : {}),
          ...(query.view ? { view: query.view } : {}),
          ...(query.personId ? { personId: query.personId } : {}),
          ...(query.withoutMeeting
            ? { withoutMeeting: true }
            : query.meetingId
              ? { meetingId: query.meetingId }
              : {}),
        },
      },
      signal,
    });
    if (error || !data) {
      throw toCommitmentError(response.status, error);
    }
    return readServerPage(data, response);
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    if (signal?.aborted) throw err;
    throw toCommitmentError(undefined);
  }
}

/** Total de compromisos abiertos en alcance (sin búsqueda), para el contador de la pestaña. */
export async function countOpenCommitments(): Promise<number> {
  const page = await listCommitmentsPage({ view: 'ABIERTOS', page: 1, pageSize: 1 });
  return page.total;
}

/** Detalle de un compromiso (GET /commitments/:id). */
export async function getCommitment(id: string): Promise<Commitment> {
  try {
    const { data, error, response } = await api.GET('/commitments/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toCommitmentError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}

/** Crea un compromiso; vencimiento requerido (POST, 201). */
export async function createCommitment(
  input: CreateCommitment,
): Promise<Commitment> {
  try {
    const { data, error, response } = await api.POST('/commitments', {
      body: input,
    });
    if (error || !data) {
      throw toCommitmentError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}

/** Edita un compromiso (PATCH, 200 + DTO). */
export async function updateCommitment(
  id: string,
  input: UpdateCommitment,
): Promise<Commitment> {
  try {
    const { data, error, response } = await api.PATCH('/commitments/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toCommitmentError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}

/** Transiciona el estado de un compromiso (POST /commitments/:id/transition). */
export async function transitionCommitment(
  id: string,
  input: Transition,
): Promise<Commitment> {
  try {
    const { data, error, response } = await api.POST(
      '/commitments/{id}/transition',
      {
        params: { path: { id } },
        body: input,
      },
    );
    if (error || !data) {
      throw toCommitmentError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}

/** Borra un compromiso en alcance (DELETE, 204 sin body). */
export async function deleteCommitment(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/commitments/{id}', {
      params: { path: { id } },
    });
    if (error) {
      throw toCommitmentError(response.status, error);
    }
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}

/**
 * Compromisos del actor para Mi trabajo (GET /commitments/my-work): todos
 * los abiertos (con tope de 200). La API decide cuáles son, su orden, el
 * semáforo y si se pueden completar.
 */
export async function loadMyWorkCommitments(): Promise<CommitmentMyWork> {
  try {
    const { data, error, response } = await api.GET('/commitments/my-work');
    if (error || !data) {
      throw toCommitmentError(response.status, error);
    }
    return data;
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}
