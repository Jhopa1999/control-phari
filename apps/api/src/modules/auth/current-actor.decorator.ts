import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { CurrentActor as CurrentActorType } from './current-actor';
import { RequestWithActor } from './current-user.guard';

/**
 * Inyecta el `request.actor` resuelto por CurrentUserGuard. Si se usa en una
 * ruta sin el guard (error de configuracion), lanza 500 en vez de devolver
 * undefined silenciosamente.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentActorType => {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    if (!request.actor) {
      throw new InternalServerErrorException(
        'CurrentUserGuard no resolvio el actor para esta ruta.',
      );
    }
    return request.actor;
  },
);
