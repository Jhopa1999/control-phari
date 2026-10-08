import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { RoleCode } from './role-code';
import { RequestWithActor } from './current-user.guard';

/**
 * Exige que el actor tenga al menos uno de los roles declarados con @Roles
 * (design 2.3). Si no hay roles declarados, deja pasar. Falla -> 403. Debe
 * ejecutarse despues de CurrentUserGuard (que adjunta request.actor).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = request.actor;

    if (!actor) {
      // Sin actor no se puede evaluar rol: se trata como prohibido (el 401 lo
      // produce CurrentUserGuard, que debe ejecutarse antes).
      throw new ForbiddenException('No autorizado.');
    }

    const allowed = requiredRoles.some((role) => actor.roleCodes.has(role));
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes el rol necesario para esta operacion.',
      );
    }

    return true;
  }
}
