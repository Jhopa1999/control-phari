import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
/**
 * Gestion del rol de SISTEMA ADMIN sobre otros usuarios (design e.4). Solo
 * modifica `users.is_admin`; NO toca grants por proceso. Audita como USER.
 *
 * Guard-rail: no se permite degradar al ULTIMO ADMIN activo, para no dejar al
 * sistema sin ningun administrador que pueda reconfigurarlo.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  /**
   * Lista todos los usuarios con su flag `isAdmin` para que el ADMIN pueda
   * gestionarlos. Ordenado por nombre.
   */
  async listUsers(): Promise<
    Array<{
      id: string;
      identifier: string;
      name: string;
      active: boolean;
      isAdmin: boolean;
    }>
  > {
    const users = await this.prisma.user.findMany({ orderBy: { name: 'asc' } });
    return users.map((u) => ({
      id: u.id,
      identifier: u.identifier,
      name: u.name,
      active: u.active,
      isAdmin: u.isAdmin,
    }));
  }
  /**
   * Marca/desmarca a `userId` como ADMIN. 404 si no existe. 400 si se intenta
   * degradar al unico admin activo. Escribe y audita en una transaccion.
   */
  async setAdminFlag(
    actor: CurrentActor,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Usuario "${userId}" no encontrado.`);
    }
    // Guard-rail del ultimo admin: si se va a degradar (isAdmin=false) y el
    // objetivo es admin activo, verificar que no sea el unico admin activo.
    if (!isAdmin && user.isAdmin && user.active) {
      const activeAdmins = await this.prisma.user.count({
        where: { isAdmin: true, active: true },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException(
          'No puede degradar al ultimo administrador activo del sistema.',
        );
      }
    }
    // Sin cambios efectivos: idempotente, no escribe ni audita de mas.
    if (user.isAdmin === isAdmin) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isAdmin } });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'USER',
        objectId: userId,
        scopeProcessId: null,
        before: null,
        after: null,
      });
    });
  }
}
