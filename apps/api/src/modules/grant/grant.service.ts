import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { GrantModel } from '../../generated/prisma/models/Grant';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CreateGrantDto } from './dto/create-grant.dto';
import { ListGrantsDto } from './dto/list-grants.dto';

@Injectable()
export class GrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lectura filtrada por el alcance del jefe (design 4.2): solo grants de
   * procesos donde el jefe tiene grant. Filtros opcionales userId/processId/active.
   */
  async findMany(
    actor: CurrentActor,
    filters: ListGrantsDto,
  ): Promise<GrantModel[]> {
    const where: Prisma.GrantWhereInput = {
      processId: { in: Array.from(actor.scopedProcessIds) },
    };
    if (filters.userId !== undefined) {
      where.userId = filters.userId;
    }
    if (filters.processId !== undefined) {
      where.processId = filters.processId;
    }
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    return this.prisma.grant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * POST /grants: algoritmo exacto de design 4.2.1.
   */
  async create(actor: CurrentActor, dto: CreateGrantDto): Promise<GrantModel> {
    // 1) roleCode -> Role. `code` es unico; se usa findFirst (el @@unique de un
    //    solo campo con nombre custom no es usable como findUnique en Prisma 7).
    const role = await this.prisma.role.findFirst({
      where: { code: dto.roleCode },
    });
    if (!role) {
      // Fila Role ausente (BD sin seed): fallo de datos del sistema, no de
      // entrada. 500 generico sin exponer detalle Prisma (design 4.4).
      throw new InternalServerErrorException(
        'No se pudo resolver el rol solicitado.',
      );
    }

    // 2) Verificar que existen User y Process.
    const [user, process] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      this.prisma.process.findUnique({ where: { id: dto.processId } }),
    ]);
    if (!user) {
      throw new NotFoundException(`Usuario "${dto.userId}" no encontrado.`);
    }
    if (!process) {
      throw new NotFoundException(`Proceso "${dto.processId}" no encontrado.`);
    }

    // 3) Buscar grant por (userId, roleId, processId).
    const existing = await this.prisma.grant.findUnique({
      where: {
        grant_user_role_process_unique: {
          userId: dto.userId,
          roleId: role.id,
          processId: dto.processId,
        },
      },
    });

    if (existing && existing.active) {
      throw new ConflictException('El grant ya existe y esta activo.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (existing && !existing.active) {
        // Reactivacion: alta logica -> action CREATE (design 4.2.1).
        const reactivated = await tx.grant.update({
          where: { id: existing.id },
          data: { active: true },
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'GRANT',
          objectId: reactivated.id,
          scopeProcessId: reactivated.processId,
          before: { active: false },
          after: { active: true },
        });
        return reactivated;
      }

      const created = await tx.grant.create({
        data: {
          userId: dto.userId,
          roleId: role.id,
          processId: dto.processId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'GRANT',
        objectId: created.id,
        scopeProcessId: created.processId,
        before: null,
        after: this.snapshot(created),
      });
      return created;
    });
  }

  /**
   * DELETE /grants/:id: revoca (soft, active=false) + AuditEvent REVOKE
   * (design 4.2.1). 404 si no existe. Devuelve el grant actualizado (200).
   */
  async revoke(actor: CurrentActor, id: string): Promise<GrantModel> {
    const existing = await this.prisma.grant.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Grant "${id}" no encontrado.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.grant.update({
        where: { id },
        data: { active: false },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'REVOKE',
        objectType: 'GRANT',
        objectId: revoked.id,
        scopeProcessId: revoked.processId,
        before: { active: true },
        after: { active: false },
      });
      return revoked;
    });
  }

  private snapshot(grant: GrantModel): Prisma.InputJsonValue {
    return {
      id: grant.id,
      userId: grant.userId,
      roleId: grant.roleId,
      processId: grant.processId,
      active: grant.active,
    };
  }
}
