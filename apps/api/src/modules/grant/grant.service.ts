import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { GrantModel } from '../../generated/prisma/models/Grant';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { toRoleCode } from '../auth/role-code';
import { canAssignRole } from '../auth/role-hierarchy';
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
    // ADMIN ve todos los grants (alcance global); el resto solo los de los
    // procesos dentro de su alcance.
    const where: Prisma.GrantWhereInput = actor.isAdmin
      ? {}
      : { processId: { in: Array.from(actor.scopedProcessIds) } };
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
    // 0) Jerarquia de asignacion (FINDING 1): se valida ANTES de resolver el
    //    Role, para que un roleCode no asignable (p. ej. ADMIN) devuelva 403 y
    //    no un 500 por fila Role ausente.
    if (!canAssignRole(actor, dto.roleCode)) {
      throw new ForbiddenException(
        'No puedes asignar un rol igual o superior al tuyo.',
      );
    }

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

    // 2.5) Alcance por proceso: un actor no-admin solo concede grants en
    //      procesos dentro de su alcance. ADMIN esta exento (alcance global).
    if (!actor.isAdmin && !actor.scopedProcessIds.has(dto.processId)) {
      throw new ForbiddenException(
        'No tienes alcance sobre el proceso indicado.',
      );
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
    const existing = await this.prisma.grant.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existing) {
      throw new NotFoundException(`Grant "${id}" no encontrado.`);
    }

    // Jerarquia: solo se revoca un grant cuyo rol este dominado por el actor.
    // Un code de rol fuera del conjunto cerrado (toRoleCode === null) no es
    // asignable/dominable -> 403.
    const targetRole = toRoleCode(existing.role.code);
    if (targetRole === null || !canAssignRole(actor, targetRole)) {
      throw new ForbiddenException(
        'No puedes revocar un grant de un rol igual o superior al tuyo.',
      );
    }

    // Alcance por proceso: el actor no-admin solo revoca dentro de su alcance.
    if (!actor.isAdmin && !actor.scopedProcessIds.has(existing.processId)) {
      throw new ForbiddenException(
        'No tienes alcance sobre el proceso indicado.',
      );
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
