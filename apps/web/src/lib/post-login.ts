import { getMyPermissions } from './me';
import { getDefaultHomeHref } from './navigation';
import { safeInternalPath } from './safe-redirect';

/** Destino por defecto cuando los permisos no se pueden consultar. */
const FALLBACK_HOME = '/inicio';

/**
 * Destino tras iniciar sesión: el `next` válido de la URL o, si no hay, la
 * pantalla de inicio que corresponde al rol (el administrador no aterriza en
 * un Panel al que no tiene acceso). Pide los permisos a la API; si fallan,
 * vuelve a `/inicio`, que muestra su propio aviso de acceso.
 */
export async function resolvePostLoginHref(params: {
  get(name: string): string | null;
}): Promise<string> {
  const next = safeInternalPath(params.get('next'));
  if (next) return next;
  try {
    const permissions = await getMyPermissions();
    return getDefaultHomeHref(new Set<string>(permissions.allowedModules));
  } catch {
    return FALLBACK_HOME;
  }
}
