/**
 * Destino seguro tras iniciar sesión (design §8.7 punto 5).
 *
 * Módulo puro (design §7.9.2): solo importaciones relativas, sin el alias `@/`
 * y sin valores de `./api-client`, para que e2e/web-lib.spec.ts lo cargue en
 * Node. Solo se navega a rutas internas; un `next` inválido se ignora sin
 * mostrar error.
 */

/** Destino por defecto tras iniciar sesión. */
const DEFAULT_POST_LOGIN_PATH = '/inicio';
/** Ruta de login: nunca es destino de `next` (evita bucles). */
const LOGIN_PATH = '/login';
/** Longitud máxima admitida para `next`. */
const MAX_PATH_LENGTH = 2048;
/** Origen ficticio con el que se resuelve la ruta para detectar cambios de origen. */
const PROBE_ORIGIN = 'http://portal.invalid';

/** true si el valor contiene caracteres de control (C0, DEL o C1). */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Devuelve la ruta interna normalizada (pathname + search + hash) o null si el
 * valor está vacío, supera 2048 caracteres, no empieza por '/', empieza por
 * '//' o '/\', contiene caracteres de control, cambia de origen al resolverlo o
 * su pathname es '/login'.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_PATH_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return null;
  }
  if (hasControlCharacters(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN || url.pathname === LOGIN_PATH) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Destino tras iniciar sesión: el `next` válido de la URL o /inicio. */
export function postLoginPath(params: {
  get(name: string): string | null;
}): string {
  return safeInternalPath(params.get('next')) ?? DEFAULT_POST_LOGIN_PATH;
}
