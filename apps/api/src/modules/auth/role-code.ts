/**
 * Catalogo cerrado de los 3 roles del area (design 1.2 / 2.2). El `code` del
 * rol gobierna la autorizacion: es un conjunto cerrado y tipado, no un valor
 * administrable como las maestras de negocio. La tabla `roles` espeja estos
 * mismos codes (sembrados por el seed de FEAT-001).
 */
export enum RoleCode {
  JEFE_AREA = 'JEFE_AREA',
  LIDER_PROCESO = 'LIDER_PROCESO',
  INTEGRANTE = 'INTEGRANTE',
}

/** Todos los codes validos, util para validaciones y pruebas. */
export const ROLE_CODES: readonly RoleCode[] = Object.values(RoleCode);
