/**
 * Jerarquia de asignacion de roles, SOLO para presentacion (design: ADMIN >
 * JEFE_AREA > LIDER_PROCESO > INTEGRANTE). Espeja apps/api role-hierarchy.ts
 * para ofrecer en la UI unicamente los roles que el actor puede asignar; NO es
 * la autoridad: el backend valida POST /grants y responde 403 ante un intento
 * de asignar un rol igual o superior. No se duplica regla de negocio: es un
 * filtro cosmetico, igual que allowedModules filtra el menu.
 */

/** Roles de area asignables por un grant (ADMIN no se asigna por grant). */
export type AssignableRoleCode = 'JEFE_AREA' | 'LIDER_PROCESO' | 'INTEGRANTE';

/** Codigo de rol efectivo del actor (incluye ADMIN, que no se asigna por grant). */
export type ActorRoleCode = AssignableRoleCode | 'ADMIN';

const ROLE_RANK: Record<ActorRoleCode, number> = {
  ADMIN: 4,
  JEFE_AREA: 3,
  LIDER_PROCESO: 2,
  INTEGRANTE: 1,
};

/** Roles que un grant puede conceder (ADMIN se gestiona aparte, no por grant). */
export const ASSIGNABLE_ROLE_CODES: readonly AssignableRoleCode[] = [
  'JEFE_AREA',
  'LIDER_PROCESO',
  'INTEGRANTE',
];

function isActorRoleCode(value: string): value is ActorRoleCode {
  return value in ROLE_RANK;
}

/** Rango maximo del actor sobre sus roleCodes (0 si no tiene ninguno conocido). */
export function actorMaxRank(roleCodes: readonly string[]): number {
  let max = 0;
  for (const code of roleCodes) {
    if (isActorRoleCode(code)) {
      const rank = ROLE_RANK[code];
      if (rank > max) max = rank;
    }
  }
  return max;
}

/**
 * true si el actor puede asignar el rol `target`: su rango maximo debe ser
 * ESTRICTAMENTE mayor que el del objetivo (nadie asigna su propio nivel ni uno
 * superior). Misma regla que canAssignRole del backend.
 */
export function canAssignRole(
  roleCodes: readonly string[],
  target: AssignableRoleCode,
): boolean {
  return actorMaxRank(roleCodes) > ROLE_RANK[target];
}

/** Roles de area que el actor puede asignar, en orden de rango descendente. */
export function assignableRolesFor(
  roleCodes: readonly string[],
): AssignableRoleCode[] {
  return ASSIGNABLE_ROLE_CODES.filter((code) => canAssignRole(roleCodes, code));
}
