import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { UserModel } from '../../generated/prisma/models/User';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { toUserResponse } from './user-response.mapper';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private snapshot(user: UserModel): Prisma.InputJsonValue {
    return {
      id: user.id,
      identifier: user.identifier,
      name: user.name,
      active: user.active,
    };
  }

  async findMany(): Promise<UserResponseDto[]> {
    // Plano B: no se filtra por proceso. El jefe gestiona todo el equipo.
    const users = await this.prisma.user.findMany({ orderBy: { name: 'asc' } });
    return users.map(toUserResponse);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { grants: { include: { role: true, process: true } } },
    });
    if (!user) {
      throw new NotFoundException(`Usuario "${id}" no encontrado.`);
    }
    return { ...toUserResponse(user), grants: user.grants };
  }

  async create(
    actor: CurrentActor,
    dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { identifier: dto.identifier, name: dto.name },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'USER',
          objectId: created.id,
          scopeProcessId: null,
          before: null,
          after: this.snapshot(created),
        });

        return toUserResponse(created);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe un usuario con identifier "${dto.identifier}".`,
        );
      }
      throw error;
    }
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Usuario "${id}" no encontrado.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'USER',
        objectId: updated.id,
        scopeProcessId: null,
        before: this.snapshot(existing),
        after: this.snapshot(updated),
      });

      return toUserResponse(updated);
    });
  }
}
