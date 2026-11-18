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

/** Área con sus conteos de procesos activos y solicitantes activos. */
export type AreaWithCounts = AreaModel & {
  processCount: number;
  requesterCount: number;
};

/** Conteos por fila con `count` filtrado (sin cargar las relaciones). */
const COUNTS_INCLUDE = {
  _count: {
    select: {
      processes: { where: { active: true } },
      requesters: { where: { active: true } },
    },
  },
} satisfies Prisma.AreaInclude;

type AreaRowWithCount = AreaModel & {
  _count: { processes: number; requesters: number };
};

@Injectable()
export class AreaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeKey(value: string): string {
    return value.trim().toUpperCase();
  }

  /** Aplana el conteo de Prisma en `processCount` y `requesterCount`. */
  private withCounts(row: AreaRowWithCount): AreaWithCounts {
    const { _count: counts, ...area } = row;
    return {
      ...area,
      processCount: counts.processes,
      requesterCount: counts.requesters,
    };
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

  async findMany(filters: ListAreasDto): Promise<AreaWithCounts[]> {
    const where: Prisma.AreaWhereInput =
      filters.active === undefined ? {} : { active: filters.active };
    const rows = await this.prisma.area.findMany({
      where,
      include: COUNTS_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.withCounts(row));
  }

  async findOne(id: string): Promise<AreaWithCounts> {
    const area = await this.prisma.area.findUnique({
      where: { id },
      include: COUNTS_INCLUDE,
    });
    if (!area) {
      throw new NotFoundException('No se encontró el área.');
    }
    return this.withCounts(area);
  }

  async create(actor: CurrentActor, dto: CreateAreaDto): Promise<AreaWithCounts> {
    const code = this.normalizeKey(dto.code);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.area.create({
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
          objectId: row.id,
          scopeProcessId: null,
          before: null,
          after: this.snapshot(row),
        });
        return row;
      });
      return { ...created, processCount: 0, requesterCount: 0 };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe un área con ese código.');
      }
      throw error;
    }
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateAreaDto,
  ): Promise<AreaWithCounts> {
    const existing = await this.prisma.area.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('No se encontró el área.');
    }
    // Desactivar un área activa con procesos activos se bloquea (409): primero
    // hay que desactivar o reasignar esos procesos. Solo cuentan los activos.
    if (dto.active === false && existing.active) {
      const activeProcesses = await this.prisma.process.count({
        where: { areaId: id, active: true },
      });
      if (activeProcesses > 0) {
        throw new ConflictException(
          `No se puede desactivar el área: tiene ${activeProcesses} ${
            activeProcesses === 1 ? 'proceso activo' : 'procesos activos'
          }.`,
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
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
    });
    return this.findOne(id);
  }
}
