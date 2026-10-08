import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { CatalogItemModel } from '../../generated/prisma/models/CatalogItem';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { ListCatalogItemsDto } from './dto/list-catalog-items.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Normaliza un identificador funcional: recorta espacios y pasa a mayusculas.
   * Se aplica a `catalog` y `code`, nunca a `label`.
   */
  private normalizeKey(value: string): string {
    return value.trim().toUpperCase();
  }

  /** Snapshot JSON de un CatalogItem para auditoria (before/after). */
  private snapshot(item: CatalogItemModel): Prisma.InputJsonValue {
    return {
      id: item.id,
      catalog: item.catalog,
      code: item.code,
      label: item.label,
      active: item.active,
      sortOrder: item.sortOrder,
    };
  }

  async create(
    actor: CurrentActor,
    dto: CreateCatalogItemDto,
  ): Promise<CatalogItemModel> {
    const catalog = this.normalizeKey(dto.catalog);
    const code = this.normalizeKey(dto.code);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.catalogItem.create({
          data: {
            catalog,
            code,
            label: dto.label,
            // active y sortOrder usan los defaults del modelo si no se envian.
            ...(dto.active !== undefined ? { active: dto.active } : {}),
            ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'CATALOG_ITEM',
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
        // Violacion del unique (catalog, code): no exponemos el error interno.
        throw new ConflictException(
          `Ya existe un elemento con catalog "${catalog}" y code "${code}".`,
        );
      }
      throw error;
    }
  }

  async findMany(filters: ListCatalogItemsDto): Promise<CatalogItemModel[]> {
    const where: Prisma.CatalogItemWhereInput = {};
    if (filters.catalog !== undefined) {
      where.catalog = this.normalizeKey(filters.catalog);
    }
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    return this.prisma.catalogItem.findMany({
      where,
      orderBy: [{ catalog: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async findOne(id: string): Promise<CatalogItemModel> {
    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`CatalogItem "${id}" no encontrado.`);
    }
    return item;
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemModel> {
    // Garantiza 404 si no existe antes de intentar actualizar.
    const existing = await this.findOne(id);

    // catalog y code son estables: no se actualizan por diseno.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.catalogItem.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'CATALOG_ITEM',
        objectId: updated.id,
        scopeProcessId: null,
        before: this.snapshot(existing),
        after: this.snapshot(updated),
      });

      return updated;
    });
  }
}
