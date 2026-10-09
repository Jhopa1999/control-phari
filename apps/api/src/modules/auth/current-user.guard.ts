import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ACTOR_RESOLVER, ActorResolver } from './actor-resolver';
import { CurrentActor } from './current-actor';
import { isJwtMode } from './dev-actor.resolver';

/** Nombre del header de identidad de desarrollo (design 3.1). */
export const ACTOR_HEADER = 'x-actor-id';

/** Header portador del JWT en modo de autenticacion real. */
export const AUTHORIZATION_HEADER = 'authorization';

/**
 * Forma minima del request HTTP que necesitan los guards/decorators de auth.
 * Se define localmente (no se importa de express) para no acoplar la capa de
 * autorizacion a un tipo que no esta tipado como dependencia del backend.
 */
export interface RequestWithActor {
  headers: Record<string, string | string[] | undefined>;
  actor?: CurrentActor;
}

/**
 * Resuelve la identidad de la peticion a un CurrentActor y lo adjunta a
 * `request.actor` (design 2.3). Si no hay header o el usuario no existe/esta
 * inactivo -> 401. Se aplica por modulo (nunca como APP_GUARD global).
 */
@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(
    @Inject(ACTOR_RESOLVER) private readonly actorResolver: ActorResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();

    // El guard es el unico punto que ya conoce el request HTTP, asi que es
    // quien elige QUE header leer segun el modo y pasa su valor crudo al
    // resolver, manteniendo intacta la firma resolve(string | undefined):
    // - modo jwt: el header `Authorization` completo ("Bearer <token>").
    // - cualquier otro modo (dev-header o sin definir): `X-Actor-Id`, igual que
    //   siempre, por lo que los specs que no definen AUTH_MODE no cambian.
    const rawIdentity = isJwtMode()
      ? headerValue(request.headers[AUTHORIZATION_HEADER])
      : headerValue(request.headers[ACTOR_HEADER]);

    const actor = await this.actorResolver.resolve(rawIdentity);
    if (!actor) {
      throw new UnauthorizedException(
        'No hay un usuario actual valido para la peticion.',
      );
    }

    request.actor = actor;
    return true;
  }
}

/** Normaliza el valor de un header que puede llegar como string o string[]. */
function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
