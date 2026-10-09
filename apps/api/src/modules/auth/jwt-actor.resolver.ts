import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { ActorResolver } from './actor-resolver';
import { CurrentActor } from './current-actor';
import { loadActorByIdentifier } from './load-actor';

/** Prefijo del esquema Bearer en el header Authorization. */
const BEARER_PREFIX = 'Bearer ';

/** Claims que este resolver consume del JWT. `sub` = identifier del usuario. */
interface JwtPayload {
  sub?: string;
}

/**
 * Resuelve el actor en modo de autenticacion real (AUTH_MODE=jwt). Recibe el
 * header `Authorization` completo, extrae y verifica el bearer token (firma +
 * expiracion) con el secreto configurado en JwtModule y, con el claim `sub`,
 * reutiliza `loadActorByIdentifier` (la MISMA carga/validacion User+grants que
 * dev-header) para construir el CurrentActor. La autorizacion no se duplica:
 * este resolver solo anade la verificacion del token y la extraccion del sub.
 *
 * Devuelve null ante cualquier fallo (token ausente/mal formado/invalido/
 * expirado, sub ausente, usuario inexistente o inactivo); el guard traduce ese
 * null a 401. No propaga excepciones de verificacion.
 */
@Injectable()
export class JwtActorResolver implements ActorResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async resolve(rawIdentity: string | undefined): Promise<CurrentActor | null> {
    const header = rawIdentity?.trim();
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) {
      return null;
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      // Firma invalida, token expirado o mal formado: identidad no valida.
      return null;
    }

    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
      return null;
    }

    return loadActorByIdentifier(this.prisma, payload.sub);
  }
}
