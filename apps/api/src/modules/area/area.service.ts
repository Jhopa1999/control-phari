import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { AreaModel } from '../../generated/prisma/models/Area';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CreateAreaDto } from './dto/create-area.dto';
import { ListAreasDto } from './dto/list-areas.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Injectable()
export class AreaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeKey(value: string): string {
    return value.trim().toUpperCase();
  }

  /**
   * Snapshot JSON de un area para auditoria (before/after). Las fechas se
   * serializan a ISO para que sean JSON validos.
   */
  private snapshot(area: AreaModel): Prisma.InputJsonValue {
    return {
      id: area.id,
      code: area.code,
      name: area.name,
      active: area.active,
      sortOrder: area.sortOrder,
    };
  }

  async findMany(filters: ListAreasDto): Promise<AreaModel[]> {
    const where: Prisma.AreaWhereInput =
      filters.active === undefined ? {} : { active: filters.active };

    return this.prisma.area.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string): Promise<AreaModel> {
    const area = await this.prisma.area.findUnique({ where: { id } });
    if (!area) {
      throw new NotFoundException(`Area "${id}" no encontrada.`);
    }
    return area;
  }

  async create(actor: CurrentActor, dto: CreateAreaDto): Promise<AreaModel> {
    const code = this.normalizeKey(dto.code);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.area.create({
          data: {
            code,
            name: dto.name,
            ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'AREA',
          objectId: created.id,
          scopeProcessId: null,
          before: null,
          after: this.snapshot(created),
        });

        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Ya existe un area con code "${code}".`);
      }
      throw error;
    }
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateAreaDto,
  ): Promise<AreaModel> {
    const existing = await this.prisma.area.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Area "${id}" no encontrada.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.area.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'AREA',
        objectId: updated.id,
        scopeProcessId: null,
        before: this.snapshot(existing),
        after: this.snapshot(updated),
      });

      return updated;
    });
  }
}
