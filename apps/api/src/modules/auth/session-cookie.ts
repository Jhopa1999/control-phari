/**
 * Cookie de sesion HttpOnly (BL-013) y proteccion CSRF asociada.
 *
 * Funciones puras y sin dependencias: leen/escriben la cookie `portal_session`
 * y deciden sus atributos. La cookie transporta el MISMO JWT que el cuerpo de
 * login devuelve como `accessToken`, de modo que el resolver no cambia.
 */

/** Nombre de la cookie de sesion. */
export const SESSION_COOKIE_NAME = 'portal_session';

/** Cabecera propia que exigen las escrituras autenticadas por cookie (CSRF). */
export const CSRF_HEADER = 'x-portal-csrf';

/** Valor fijo (no secreto) de la cabecera CSRF: lo que protege es que sea personalizada. */
export const CSRF_HEADER_VALUE = '1';

/** Metodos HTTP que modifican estado y por tanto exigen la cabecera CSRF. */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type CookieSecureMode = 'auto' | 'true' | 'false';

/**
 * Lee COOKIE_SECURE. Ausente o desconocido => `auto` (Secure solo si la
 * peticion llego por https). `unknown` permite avisar al arrancar.
 */
export function resolveCookieSecureMode(raw = process.env.COOKIE_SECURE): {
  mode: CookieSecureMode;
  unknown: boolean;
} {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === '' || value === 'auto') {
    return { mode: 'auto', unknown: false };
  }
  if (value === 'true' || value === 'false') {
    return { mode: value, unknown: false };
  }
  return { mode: 'auto', unknown: true };
}

/** Decide el atributo `Secure` segun el modo y el protocolo de la peticion. */
export function isSecureCookie(
  mode: CookieSecureMode,
  requestIsSecure: boolean,
): boolean {
  if (mode === 'true') return true;
  if (mode === 'false') return false;
  return requestIsSecure;
}

/**
 * Extrae el valor de `portal_session` de la cabecera `Cookie`. Nunca lanza:
 * un valor malformado (p. ej. `%` suelto) devuelve `undefined` (=> 401 limpio).
 * Con el nombre repetido se usa la PRIMERA aparicion.
 */
export function readSessionCookie(
  cookieHeader: string | string[] | undefined,
): string | undefined {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const raw = part.slice(separator + 1).trim();
    if (raw === '') return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Indica si el metodo HTTP exige la cabecera CSRF. */
export function requiresCsrf(method: string | undefined): boolean {
  return UNSAFE_METHODS.has((method ?? '').toUpperCase());
}

/** Comprueba la cabecera CSRF propia. */
export function hasCsrfHeader(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const value = headers[CSRF_HEADER];
  const first = Array.isArray(value) ? value[0] : value;
  return first === CSRF_HEADER_VALUE;
}
