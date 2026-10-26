/**
 * Portador del token Bearer POR PETICIÓN para el transporte HTTP.
 *
 * El MCP en modo HTTP recibe en cada request una cabecera
 * `Authorization: Bearer <token>` que representa la identidad de UNA persona.
 * Ese token NO puede mezclarse entre sesiones ni peticiones concurrentes: no
 * existe estado de token a nivel de proceso en HTTP.
 *
 * El mecanismo es un `AsyncLocalStorage`: cada petición se ejecuta dentro de un
 * frame `httpTokenStore.run({ token }, () => …)`, y el middleware de identidad
 * del api-client lee el token del frame actual (`getCurrentHttpToken`). Como el
 * despacho de mensajes del SDK y el callback de la tool corren dentro de ese
 * mismo frame síncrono, dos peticiones concurrentes de usuarios distintos viven
 * en frames separados y nunca observan el token del otro.
 *
 * NUNCA se registra el valor del token (ni a stdout ni a stderr).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** Estado por petición transportado por el ALS. Solo el token, inmutable. */
export interface HttpRequestState {
  readonly token: string;
}

/** Almacén por petición: cada request HTTP corre dentro de su propio frame. */
export const httpTokenStore = new AsyncLocalStorage<HttpRequestState>();

/** Devuelve el token de la petición actual, o undefined fuera de un frame. */
export function getCurrentHttpToken(): string | undefined {
  return httpTokenStore.getStore()?.token;
}

/**
 * Extrae el token de una cabecera `Authorization: Bearer <token>` bien formada.
 * El esquema es insensible a mayúsculas y se recortan espacios. Devuelve
 * undefined si la cabecera falta, no es `Bearer`, o el token está vacío. Es una
 * función pura: nunca registra el valor.
 */
export function extractBearer(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const trimmed = header.trim();
  const match = /^Bearer[ \t]+(.+)$/i.exec(trimmed);
  if (match === null) return undefined;
  const token = match[1].trim();
  return token.length > 0 ? token : undefined;
}
