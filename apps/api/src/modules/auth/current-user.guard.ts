import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ACTOR_RESOLVER, ActorResolver } from './actor-resolver';
import { CurrentActor } from './current-actor';
import { isJwtMode } from './dev-actor.resolver';
import { hasCsrfHeader, readSessionCookie, requiresCsrf } from './session-cookie';

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
  method?: string;
  actor?: CurrentActor;
  /** Origen de la identidad: Bearer, cookie de sesion o X-Actor-Id. */
  authSource?: 'bearer' | 'cookie' | 'dev-header';
  /** Bearer <token> normalizado (Bearer o cookie); lo reutiliza el asistente. */
  bearer?: string;
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

    // El guard es el unico punto que conoce el request HTTP: elige que leer
    // segun el modo y pasa el valor al resolver (firma resolve(string)).
    // - modo jwt: Authorization: Bearer si existe (no se cae a la cookie si
    //   es invalido); si no, la cookie portal_session (exige CSRF en
    //   escrituras); si no hay nada, undefined => 401.
    // - cualquier otro modo: X-Actor-Id; la cookie se ignora por completo.
    let rawIdentity: string | undefined;
    if (isJwtMode()) {
      const authorization = headerValue(request.headers[AUTHORIZATION_HEADER]);
      if (authorization !== undefined) {
        rawIdentity = authorization;
        request.authSource = 'bearer';
        request.bearer = authorization;
      } else {
        const cookieToken = readSessionCookie(request.headers.cookie);
        if (cookieToken !== undefined) {
          if (requiresCsrf(request.method) && !hasCsrfHeader(request.headers)) {
            throw new ForbiddenException(
              'Falta la cabecera de proteccion CSRF.',
            );
          }
          rawIdentity = `Bearer ${cookieToken}`;
          request.authSource = 'cookie';
          request.bearer = rawIdentity;
        }
      }
    } else {
      rawIdentity = headerValue(request.headers[ACTOR_HEADER]);
      request.authSource = 'dev-header';
    }
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
