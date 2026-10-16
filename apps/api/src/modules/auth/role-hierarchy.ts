import { CurrentActor } from './current-actor';
import { RoleCode } from './role-code';

/**
 * Jerarquia de creacion/asignacion de roles (design: ADMIN > JEFE_AREA >
 * LIDER_PROCESO > INTEGRANTE). Un actor solo puede asignar roles
 * ESTRICTAMENTE por debajo de su rango maximo: por eso ADMIN->ADMIN = false.
 */
export const ROLE_RANK: Record<RoleCode, number> = {
  [RoleCode.ADMIN]: 4,
  [RoleCode.JEFE_AREA]: 3,
  [RoleCode.LIDER_PROCESO]: 2,
  [RoleCode.INTEGRANTE]: 1,
};

/** Rango maximo del actor sobre todos sus roleCodes (0 si no tiene ninguno). */
export function actorMaxRank(actor: CurrentActor): number {
  let max = 0;
  for (const code of actor.roleCodes) {
    const rank = ROLE_RANK[code];
    if (rank > max) {
      max = rank;
    }
  }
  return max;
}

/**
 * true si el actor puede asignar/crear el rol `target`: su rango maximo debe
 * ser ESTRICTAMENTE mayor que el rango del objetivo (nadie asigna su propio
 * nivel ni uno superior).
 */
export function canAssignRole(actor: CurrentActor, target: RoleCode): boolean {
  return actorMaxRank(actor) > ROLE_RANK[target];
}
