/**
 * Decisión pura del cambio de contraseña obligatorio. Sin alias `@/`, para que
 * e2e/web-lib.spec.ts la cargue en Node. El backend es la autoridad (responde
 * 403 PASSWORD_CHANGE_REQUIRED); esto solo evita mostrar pantallas que fallarían.
 */
import { safeInternalPath } from './safe-redirect';

/** Pantalla de cambio obligatorio (la única accesible mientras esté pendiente). */
export const CHANGE_PASSWORD_ROUTE = '/cambiar-contrasena';

/** Código del 403 con el que la API bloquea a quien debe cambiar la contraseña. */
export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';

/** Evento que emite el cliente al recibir ese 403 (ActorProvider recarga permisos). */
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'portal:password-change-required';

/**
 * Con el cambio pendiente, a dónde ir desde `current` (ruta con búsqueda).
 * `null` si no hay que redirigir (ya está en la pantalla, o no está pendiente).
 * Conserva la ruta de origen en `next` cuando es interna y no es `/inicio`.
 */
export function mustChangePasswordRedirect(
  current: string,
  permissions: { mustChangePassword?: boolean } | null,
): string | null {
  if (permissions?.mustChangePassword !== true) return null;
  const pathname = current.split(/[?#]/)[0];
  if (pathname === CHANGE_PASSWORD_ROUTE) return null;
  const next = pathname === '/inicio' ? null : safeInternalPath(current);
  return next
    ? `${CHANGE_PASSWORD_ROUTE}?next=${encodeURIComponent(next)}`
    : CHANGE_PASSWORD_ROUTE;
}

/** ¿Debe salir de la pantalla de cambio por no tener nada pendiente? */
export function leavesChangePasswordRoute(
  pathname: string,
  permissions: { mustChangePassword?: boolean } | null,
): boolean {
  return (
    pathname === CHANGE_PASSWORD_ROUTE &&
    permissions !== null &&
    permissions.mustChangePassword !== true
  );
}

/** ¿El cuerpo de un 403 trae el código de cambio de contraseña obligatorio? */
export function isPasswordChangeRequiredBody(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === PASSWORD_CHANGE_REQUIRED_CODE
  );
}
