import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ActorResolver } from './actor-resolver';
import { ActorGrant, CurrentActor } from './current-actor';
import { RoleCode, ROLE_CODES } from './role-code';

/**
 * Modo de autenticacion configurable (design 3.2). Es configuracion, no una
 * constante de negocio: se lee de process.env.AUTH_MODE.
 */
export const DEV_HEADER_AUTH_MODE = 'dev-header';

export function getAuthMode(): string | undefined {
  return process.env.AUTH_MODE;
}

export function isDevHeaderMode(): boolean {
  return getAuthMode() === DEV_HEADER_AUTH_MODE;
}

/**
 * Resuelve el actor desde el header `X-Actor-Id` (design 3.1). Capa de
 * desarrollo explicitamente separada y reemplazable: confiable solo porque en
 * dev no hay frontera de seguridad real.
 */
@Injectable()
export class DevActorResolver implements ActorResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(rawIdentity: string | undefined): Promise<CurrentActor | null> {
    const identifier = rawIdentity?.trim();
    if (!identifier) {
      return null;
    }

    // `identifier` tiene un unique con nombre custom (`user_identifier_unique`)
    // en schema.prisma. Con Prisma 7 ese unique de un solo campo no es
    // consultable de forma estable por `findUnique` (el motor exige la clave
    // compuesta `user_identifier_unique`, que a su vez el runtime rechaza segun
    // el estado del client generado). Se resuelve por `findFirst`, el mismo
    // patron que ya usa el seed para estas claves naturales con nombre custom.
    const user = await this.prisma.user.findFirst({
      where: { identifier },
      include: {
        grants: {
          where: { active: true },
          include: { role: true, process: true },
        },
      },
    });

    if (!user || !user.active) {
      return null;
    }

    const grants: ActorGrant[] = [];
    const roleCodes = new Set<RoleCode>();
    const scopedProcessIds = new Set<string>();

    for (const grant of user.grants) {
      const roleCode = toRoleCode(grant.role.code);
      if (roleCode === null) {
        // Un code de rol fuera del conjunto cerrado es un dato invalido del
        // sistema; se ignora el grant en vez de propagar un valor no tipado.
        continue;
      }
      grants.push({
        processId: grant.processId,
        processCode: grant.process.code,
        processName: grant.process.name,
        roleCode,
        roleName: grant.role.name,
      });
      roleCodes.add(roleCode);
      scopedProcessIds.add(grant.processId);
    }

    return {
      userId: user.id,
      name: user.name,
      identifier: user.identifier,
      grants,
      roleCodes,
      scopedProcessIds,
      isJefeArea: roleCodes.has(RoleCode.JEFE_AREA),
    };
  }
}

/** Convierte un code de la BD a RoleCode tipado, o null si no pertenece al conjunto. */
function toRoleCode(code: string): RoleCode | null {
  return (ROLE_CODES as readonly string[]).includes(code)
    ? (code as RoleCode)
    : null;
}
