/**
 * Modo de autenticacion del frontend. El frontend NO conoce el AUTH_MODE del
 * backend: se decide por configuracion publica de build (NEXT_PUBLIC_AUTH_MODE).
 *
 * - 'jwt'        -> login + sesion con Authorization: Bearer, guard de rutas y
 *                   logout. El selector dev del sidebar se oculta.
 * - 'dev-header' -> comportamiento historico: selector dev + cabecera
 *                   X-Actor-Id, sin login ni guard.
 *
 * Debe coincidir con el AUTH_MODE con el que corre la API; es responsabilidad
 * del despliegue (variable de entorno), no una regla de negocio del cliente.
 */
export type AuthMode = 'jwt' | 'dev-header';

/**
 * Resuelve el modo de autenticacion desde la configuracion publica.
 * Solo devuelve 'jwt' si el valor es exactamente 'jwt'; cualquier otro valor o
 * su ausencia cae en 'dev-header' (default seguro que preserva el flujo actual).
 *
 * `process.env.NEXT_PUBLIC_AUTH_MODE` es inlineado por Next en build, por lo que
 * el helper es puro y seguro tanto en SSR como en el navegador.
 */
export function getAuthMode(): AuthMode {
  return process.env.NEXT_PUBLIC_AUTH_MODE === 'jwt' ? 'jwt' : 'dev-header';
}
