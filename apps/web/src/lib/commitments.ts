import {
  api,
  type Commitment,
  type CreateCommitment,
  type Transition,
  type UpdateCommitment,
} from './api-client';

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
      return 'Revisa los datos o la transicion solicitada.';
    case 403:
      return 'No tienes acceso a esta accion.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'El compromiso entra en conflicto con otro existente.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

/** Normaliza cualquier fallo (HTTP o de red) a un CommitmentError entendible. */
function toCommitmentError(status: number | undefined): CommitmentError {
  if (status === undefined) {
    return new CommitmentError('No fue posible comunicarse con el servidor.');
  }
  return new CommitmentError(messageForStatus(status), status);
}

/** Compromisos en alcance (GET /commitments). El backend filtra por alcance. */
export async function listCommitments(): Promise<Commitment[]> {
  try {
    const { data, error, response } = await api.GET('/commitments');
    if (error || !data) {
      throw toCommitmentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}

/** Detalle de un compromiso (GET /commitments/:id). */
export async function getCommitment(id: string): Promise<Commitment> {
  try {
    const { data, error, response } = await api.GET('/commitments/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toCommitmentError(response.status);
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
      throw toCommitmentError(response.status);
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
      throw toCommitmentError(response.status);
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
      throw toCommitmentError(response.status);
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
      throw toCommitmentError(response.status);
    }
  } catch (err) {
    if (err instanceof CommitmentError) throw err;
    throw toCommitmentError(undefined);
  }
}
