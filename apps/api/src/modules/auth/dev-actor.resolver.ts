import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ActorResolver } from './actor-resolver';
import { CurrentActor } from './current-actor';
import { loadActorByIdentifier } from './load-actor';

/**
 * Modo de autenticacion configurable (design 3.2). Es configuracion, no una
 * constante de negocio: se lee de process.env.AUTH_MODE.
 */
export const DEV_HEADER_AUTH_MODE = 'dev-header';

/** Modo de autenticacion real por JWT. */
export const JWT_AUTH_MODE = 'jwt';

export function getAuthMode(): string | undefined {
  return process.env.AUTH_MODE;
}

export function isDevHeaderMode(): boolean {
  return getAuthMode() === DEV_HEADER_AUTH_MODE;
}

export function isJwtMode(): boolean {
  return getAuthMode() === JWT_AUTH_MODE;
}

/**
 * Resuelve el actor desde el header `X-Actor-Id` (design 3.1). Capa de
 * desarrollo explicitamente separada y reemplazable: confiable solo porque en
 * dev no hay frontera de seguridad real. La carga User+grants y el mapeo a
 * CurrentActor viven en `loadActorByIdentifier`, compartidos con el resolver
 * JWT para no duplicar la logica de autorizacion.
 */
@Injectable()
export class DevActorResolver implements ActorResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(rawIdentity: string | undefined): Promise<CurrentActor | null> {
    return loadActorByIdentifier(this.prisma, rawIdentity);
  }
}
