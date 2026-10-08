import { SetMetadata } from '@nestjs/common';
import { RoleCode } from './role-code';

/** Clave de metadata para los roles requeridos por un handler/controller. */
export const ROLES_KEY = 'roles';

/**
 * Declara los roles permitidos para una ruta. El actor cumple si tiene al menos
 * uno de ellos en cualquier grant activo (design 2.3). Sin este decorador, la
 * ruta no exige rol (solo actor valido via CurrentUserGuard).
 */
export const Roles = (...codes: RoleCode[]) => SetMetadata(ROLES_KEY, codes);
