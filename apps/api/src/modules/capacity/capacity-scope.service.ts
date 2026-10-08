import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { CapacityPersonDto } from './dto/capacity-person.dto';

/**
 * Cliente Prisma o transaccional (ambos exponen los delegados que usa el
 * helper). Permite reutilizar el servicio dentro de una `$transaction`.
 */
type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Fuente unica de verdad del alcance POR PERSONA (design §2.6). Todas las
 * lecturas que dependen de "que personas ve el actor" (people, availability,
 * assignments, summary) usan `scopedUserIds`, de modo que la disponibilidad
 * —que no tiene `processId` (D1)— se filtra siempre por el mismo conjunto de
 * `userId`, sin exponer filas fuera de alcance.
 */
@Injectable()
export class CapacityScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve `'ALL'` (sin filtro de `userId`) para el jefe de area, o la lista
   * de `userId` visibles para el resto (design §2.6.1):
   * - jefe -> `'ALL'` (ve el area completa);
   * - integrante -> `{ el mismo }`;
   * - lider -> `{ el mismo } union { personas con grant activo en sus procesos }`.
   */
  async scopedUserIds(
    tx: PrismaLike,
    actor: CurrentActor,
  ): Promise<'ALL' | string[]> {
    if (actor.isJefeArea) {
      return 'ALL';
    }

    const ids = new Set<string>();
    // Cualquier rol con capacity se ve a si mismo.
    ids.add(actor.userId);

    // Lider: ademas, las personas con grant ACTIVO en alguno de sus procesos.
    if (actor.scopedProcessIds.size > 0) {
      const grants = await tx.grant.findMany({
        where: {
          active: true,
          processId: { in: Array.from(actor.scopedProcessIds) },
        },
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const grant of grants) {
        ids.add(grant.userId);
      }
    }

    return Array.from(ids);
  }

  /**
   * Personas visibles por el actor para los selectores de SCR-17 (design §2.6.2,
   * endpoint propio `GET /capacity/people`): integrante -> el; lider -> el +
   * personas de sus procesos; jefe -> `User.active = true`. Devuelve
   * `{ id, name, identifier }` ordenado por nombre.
   */
  async listPeople(actor: CurrentActor): Promise<CapacityPersonDto[]> {
    const scoped = await this.scopedUserIds(this.prisma, actor);

    const where: Prisma.UserWhereInput =
      scoped === 'ALL'
        ? { active: true }
        : { id: { in: scoped } };

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, name: true, identifier: true },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      identifier: user.identifier,
    }));
  }
}
