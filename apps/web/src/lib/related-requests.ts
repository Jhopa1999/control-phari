import { api, type CoordinationRequest } from './api-client';

/** Solicitudes relacionables con un acta o un compromiso, con la marca de recorte del servidor. */
export interface LinkableRequests {
  rows: CoordinationRequest[];
  /** El servidor cortó el listado en 200: hay que escribir para acotar. */
  truncated: boolean;
}

/**
 * Solicitudes y proyectos que la persona puede relacionar (GET
 * /coordination/requests, la misma visibilidad que valida el servidor al
 * guardar). `q` busca por código o título. Lanza si falla: el formulario lo
 * muestra como aviso y deja guardar sin solicitud.
 */
export async function listLinkableRequests(
  q?: string,
  signal?: AbortSignal,
): Promise<LinkableRequests> {
  const { data, error, response } = await api.GET('/coordination/requests', {
    params: { query: q?.trim() ? { q: q.trim() } : {} },
    signal,
  });
  if (error || !data) {
    throw new Error(`No se pudieron cargar las solicitudes (${response.status}).`);
  }
  return { rows: data, truncated: response.headers.get('X-Truncated') === 'true' };
}
