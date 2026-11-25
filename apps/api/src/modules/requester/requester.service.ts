import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CreateRequesterDto } from './dto/create-requester.dto';
import { ListRequestersDto } from './dto/list-requesters.dto';
import { RequesterResponseDto } from './dto/requester-response.dto';
import { UpdateRequesterDto } from './dto/update-requester.dto';

type RequesterWithArea = Prisma.RequesterGetPayload<{
  include: { area: { select: { name: true; active: true } } };
}>;

const AREA_INCLUDE = { area: { select: { name: true, active: true } } } as const;

/** Clave de unicidad: sin tildes, sin mayusculas y con espacios colapsados. */
export function requesterNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Maestro de solicitantes (SOL-02). Cada solicitante pertenece obligatoriamente
 * a un area activa del maestro de areas; el nombre no puede repetirse dentro
 * de la misma area (D23). El mismo nombre en areas distintas esta permitido.
 */
@Injectable()
export class RequesterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toResponse(r: RequesterWithArea): RequesterResponseDto {
    return {
      id: r.id,
      name: r.name,
      areaId: r.areaId,
      areaName: r.area.name,
      active: r.active,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private snapshot(r: {
    id: string;
    name: string;
    areaId: string;
    active: boolean;
  }): Prisma.InputJsonValue {
    return { id: r.id, name: r.name, areaId: r.areaId, active: r.active };
  }

  private async requireActiveArea(areaId: string): Promise<void> {
    const area = await this.prisma.area.findFirst({
      where: { id: areaId },
      select: { active: true },
    });
    if (!area) {
      throw new BadRequestException('El área seleccionada no existe.');
    }
    if (!area.active) {
      throw new BadRequestException('El área seleccionada está inactiva.');
    }
  }

  private async assertNoDuplicate(
    nameKey: string,
    areaId: string,
    exceptId?: string,
  ): Promise<void> {
    const dup = await this.prisma.requester.findFirst({
      where: { nameKey, areaId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException('Ya existe un solicitante con ese nombre en esa área.');
    }
  }

  async findMany(filters: ListRequestersDto): Promise<RequesterResponseDto[]> {
    const rows = await this.prisma.requester.findMany({
      where: {
        ...(filters.active !== undefined ? { active: filters.active } : {}),
        ...(filters.areaId !== undefined ? { areaId: filters.areaId } : {}),
      },
      include: AREA_INCLUDE,
      orderBy: [{ name: 'asc' }],
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findOne(id: string): Promise<RequesterResponseDto> {
    const row = await this.prisma.requester.findFirst({
      where: { id },
      include: AREA_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Solicitante no encontrado.');
    }
    return this.toResponse(row);
  }

  async create(
    actor: CurrentActor,
    dto: CreateRequesterDto,
  ): Promise<RequesterResponseDto> {
    const nameKey = requesterNameKey(dto.name);
    if (!nameKey) {
      throw new BadRequestException('El nombre del solicitante es obligatorio.');
    }
    await this.requireActiveArea(dto.areaId);
    await this.assertNoDuplicate(nameKey, dto.areaId);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.requester.create({
          data: { name: dto.name.trim(), nameKey, areaId: dto.areaId },
          include: AREA_INCLUDE,
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'REQUESTER',
          objectId: row.id,
          scopeProcessId: null,
          before: null,
          after: this.snapshot(row),
        });
        return row;
      });
      return this.toResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe un solicitante con ese nombre en esa área.');
      }
      throw error;
    }
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateRequesterDto,
  ): Promise<RequesterResponseDto> {
    const existing = await this.prisma.requester.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Solicitante no encontrado.');
    }

    const data: Prisma.RequesterUncheckedUpdateInput = {};
    let nameKey = existing.nameKey;
    if (dto.name !== undefined) {
      nameKey = requesterNameKey(dto.name);
      if (!nameKey) {
        throw new BadRequestException('El nombre del solicitante es obligatorio.');
      }
      data.name = dto.name.trim();
      data.nameKey = nameKey;
    }
    const areaChanges = dto.areaId !== undefined && dto.areaId !== existing.areaId;
    const areaId = areaChanges ? (dto.areaId as string) : existing.areaId;
    if (areaChanges) {
      await this.requireActiveArea(areaId);
      data.areaId = areaId;
    }
    // La unicidad es por nombre y area: se evalua si cambia cualquiera de los dos.
    if (data.nameKey !== undefined || areaChanges) {
      await this.assertNoDuplicate(nameKey, areaId, id);
    }
    if (dto.active !== undefined) data.active = dto.active;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.requester.update({
          where: { id },
          data,
          include: AREA_INCLUDE,
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'REQUESTER',
          objectId: id,
          scopeProcessId: null,
          before: this.snapshot(existing),
          after: this.snapshot(row),
        });
        return row;
      });
      return this.toResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe un solicitante con ese nombre en esa área.');
      }
      throw error;
    }
  }
}
