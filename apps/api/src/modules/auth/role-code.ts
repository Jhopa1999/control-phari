/**
 * Catalogo cerrado de roles del portal. Los 3 primeros son roles DE AREA
 * (design 1.2 / 2.2): su `code` gobierna la autorizacion por proceso y la
 * tabla `roles` los espeja (sembrados por el seed de FEAT-001).
 *
 * ADMIN es un rol de SISTEMA/GLOBAL: NO se concede por Grant ni por proceso y
 * NO se siembra como fila en `roles`. Su UNICO origen es la columna booleana
 * `User.isAdmin` (ver load-actor.ts): si el usuario es admin, el actor obtiene
 * `RoleCode.ADMIN` en `roleCodes` sin pasar por un grant. Asi @Roles(ADMIN)
 * funciona igual que los demas roles, pero su alcance es global (no amplia
 * `scopedProcessIds`) e independiente de JEFE_AREA en ambos sentidos.
 */
export enum RoleCode {
  JEFE_AREA = 'JEFE_AREA',
  LIDER_PROCESO = 'LIDER_PROCESO',
  INTEGRANTE = 'INTEGRANTE',
  ADMIN = 'ADMIN',
}
/** Todos los codes validos, util para validaciones y pruebas. */
export const ROLE_CODES: readonly RoleCode[] = Object.values(RoleCode);

/** Convierte un code de la BD a RoleCode tipado, o null si no pertenece al conjunto. */
export function toRoleCode(code: string): RoleCode | null {
  return (ROLE_CODES as readonly string[]).includes(code)
    ? (code as RoleCode)
    : null;
}
