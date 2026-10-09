import { PrismaService } from '../../database/prisma.service';
import { ActorGrant, CurrentActor } from './current-actor';
import { RoleCode, ROLE_CODES } from './role-code';

/**
 * Carga el actor (User + grants activos) y lo mapea a CurrentActor. Es la UNICA
 * fuente de la logica de autorizacion (grants/roles/alcance): la reutilizan
 * tanto DevActorResolver (modo dev-header) como JwtActorResolver (modo jwt), de
 * modo que la autorizacion no se duplica entre modos de autenticacion.
 *
 * Devuelve null si no hay identifier, el usuario no existe o esta inactivo; el
 * guard traduce ese null a 401.
 */
export async function loadActorByIdentifier(
  prisma: PrismaService,
  identifier: string | undefined,
): Promise<CurrentActor | null> {
  const normalized = identifier?.trim();
  if (!normalized) {
    return null;
  }

  // `identifier` tiene un unique con nombre custom (`user_identifier_unique`)
  // en schema.prisma. Con Prisma 7 ese unique de un solo campo no es
  // consultable de forma estable por `findUnique` (el motor exige la clave
  // compuesta `user_identifier_unique`, que a su vez el runtime rechaza segun
  // el estado del client generado). Se resuelve por `findFirst`, el mismo
  // patron que ya usa el seed para estas claves naturales con nombre custom.
  const user = await prisma.user.findFirst({
    where: { identifier: normalized },
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

/** Convierte un code de la BD a RoleCode tipado, o null si no pertenece al conjunto. */
function toRoleCode(code: string): RoleCode | null {
  return (ROLE_CODES as readonly string[]).includes(code)
    ? (code as RoleCode)
    : null;
}
