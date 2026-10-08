import { RoleCode } from './role-code';

/** Un grant activo del actor: proceso + rol (design 2.2). */
export interface ActorGrant {
  processId: string;
  processCode: string;
  processName: string;
  roleCode: RoleCode;
  roleName: string;
}

/**
 * Contexto del actor resuelto por peticion (design 2.2). Se adjunta a
 * `request.actor` por `CurrentUserGuard` y se inyecta con `@CurrentActor()`.
 */
export interface CurrentActor {
  userId: string;
  name: string;
  identifier: string;
  /** Solo grants activos. */
  grants: ActorGrant[];
  /** Union de roles sobre todos los grants activos. */
  roleCodes: Set<RoleCode>;
  /** Procesos con grant activo (alcance del Plano A). */
  scopedProcessIds: Set<string>;
  /** Tiene algun grant JEFE_AREA. */
  isJefeArea: boolean;
}
