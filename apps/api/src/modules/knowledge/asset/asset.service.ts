import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { AssetModel } from '../../../generated/prisma/models/Asset';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { KnowledgeScopeService } from '../knowledge-scope.service';
import { AssetStateService } from './asset-state.service';
import { AssetStatus } from './asset-status';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';
import { ChangeAssetStatusDto } from './dto/change-asset-status.dto';
import { AssetResponseDto } from './dto/asset-response.dto';
import { AssetRequestHistoryItemDto } from './dto/asset-request-history-item.dto';

/** Mapa codigo de maestra -> familia (catalog) para la validacion del body. */
const CATALOG_FAMILY: Record<string, string> = {
  typeCode: 'ASSET_TYPE',
  technologyCode: 'TECHNOLOGY',
  sourceCode: 'SOURCE',
  frequencyCode: 'FREQUENCY',
};

/**
 * Logica de activos (design §2/§3/§5). Alcance de lectura via
 * KnowledgeScopeService (404 fuera), escritura por rol via
 * `requireAssetWritable` (403), maquina de estado via AssetStateService (salto
 * -> 400). Las FK del body (`ownerUserId`/`requestId`) y los codigos de maestra
 * se validan dentro de la `$transaction` (400 si invalidos). Mutacion +
 * AuditEvent en la misma transaccion (objectType ASSET, scopeProcessId =
 * asset.processId). P2002 -> 409.
 */
@Injectable()
export class AssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: KnowledgeScopeService,
    private readonly state: AssetStateService,
  ) {}

  private snapshot(row: AssetModel): Prisma.InputJsonValue {
    return {
      id: row.id,
      processId: row.processId,
      requestId: row.requestId,
      ownerUserId: row.ownerUserId,
      name: row.name,
      status: row.status,
      typeCode: row.typeCode,
      technologyCode: row.technologyCode,
      sourceCode: row.sourceCode,
      frequencyCode: row.frequencyCode,
      documentationRef: row.documentationRef,
      functionalDescription: row.functionalDescription,
      dependencies: row.dependencies,
    };
  }

  private toResponse(row: AssetModel): AssetResponseDto {
    return {
      id: row.id,
      processId: row.processId,
      requestId: row.requestId,
      ownerUserId: row.ownerUserId,
      name: row.name,
      status: row.status,
      typeCode: row.typeCode,
      technologyCode: row.technologyCode,
      sourceCode: row.sourceCode,
      frequencyCode: row.frequencyCode,
      documentationRef: row.documentationRef,
      functionalDescription: row.functionalDescription,
      dependencies: row.dependencies,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<AssetModel> {
    const row = await this.prisma.asset.findFirst({
      where: { AND: [{ id }, this.scope.assetScopeWhere(actor)] },
    });
    if (!row) {
      throw new NotFoundException(`Activo "${id}" no encontrado.`);
    }
    return row;
  }

  /** Valida un code de maestra contra su familia; code invalido/inactivo -> 400. */
  private async assertCatalogCode(
    tx: Prisma.TransactionClient,
    catalog: string,
    code: string | undefined,
  ): Promise<void> {
    if (code === undefined) {
      return;
    }
    const item = await tx.catalogItem.findFirst({
      where: { catalog, code, active: true },
      select: { id: true },
    });
    if (!item) {
      throw new BadRequestException(`El codigo "${code}" no es valido para ${catalog}.`);
    }
  }

  /** Valida que el owner (usuario) exista y este activo; invalido -> 400. */
  private async assertOwner(
    tx: Prisma.TransactionClient,
    ownerUserId: string,
  ): Promise<void> {
    const user = await tx.user.findFirst({
      where: { id: ownerUserId, active: true },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('El responsable indicado no existe o esta inactivo.');
    }
  }

  /** Valida que la Request exista y participe del proceso del activo; invalido -> 400. */
  private async assertRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
    processId: string,
  ): Promise<void> {
    const request = await tx.request.findFirst({
      where: { id: requestId, participants: { some: { processId } } },
      select: { id: true },
    });
    if (!request) {
      throw new BadRequestException(
        'La solicitud indicada no existe o no pertenece al proceso del activo.',
      );
    }
  }

  private async assertCatalogCodes(
    tx: Prisma.TransactionClient,
    codes: Partial<Record<keyof typeof CATALOG_FAMILY, string | undefined>>,
  ): Promise<void> {
    for (const [field, catalog] of Object.entries(CATALOG_FAMILY)) {
      await this.assertCatalogCode(tx, catalog, codes[field]);
    }
  }

  async list(
    actor: CurrentActor,
    filters: ListAssetsDto,
  ): Promise<AssetResponseDto[]> {
    const where: Prisma.AssetWhereInput = {
      AND: [this.scope.assetScopeWhere(actor)],
    };
    const and = where.AND as Prisma.AssetWhereInput[];
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }
    if (filters.requestId !== undefined) {
      and.push({ requestId: filters.requestId });
    }
    if (filters.status !== undefined) {
      and.push({ status: filters.status });
    }

    const rows = await this.prisma.asset.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      ...(filters.take !== undefined ? { take: filters.take } : {}),
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(actor: CurrentActor, id: string): Promise<AssetResponseDto> {
    const row = await this.requireInScope(actor, id);
    return this.toResponse(row);
  }

  /**
   * Historial de solicitudes que tienen este activo como base (FEAT-002),
   * ordenado de la mas reciente a la mas antigua. 404 si el activo esta fuera
   * del alcance de lectura del actor.
   */
  async listRequests(
    actor: CurrentActor,
    id: string,
  ): Promise<AssetRequestHistoryItemDto[]> {
    await this.requireInScope(actor, id);
    const rows = await this.prisma.request.findMany({
      where: { assetId: id },
      orderBy: [{ registeredAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        registeredAt: true,
        operationalState: true,
        mainProcessId: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      registeredAt: row.registeredAt,
      operationalState: row.operationalState,
      mainProcessId: row.mainProcessId,
    }));
  }

  async create(
    actor: CurrentActor,
    dto: CreateAssetDto,
  ): Promise<AssetResponseDto> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Autorizacion por rol: nace BORRADOR, nextStatus = BORRADOR.
        this.scope.requireAssetWritable(
          actor,
          { processId: dto.processId, status: AssetStatus.BORRADOR },
          AssetStatus.BORRADOR,
        );

        if (dto.ownerUserId !== undefined) {
          await this.assertOwner(tx, dto.ownerUserId);
        }
        if (dto.requestId !== undefined) {
          await this.assertRequest(tx, dto.requestId, dto.processId);
        }
        await this.assertCatalogCodes(tx, {
          typeCode: dto.typeCode,
          technologyCode: dto.technologyCode,
          sourceCode: dto.sourceCode,
          frequencyCode: dto.frequencyCode,
        });

        const row = await tx.asset.create({
          data: {
            processId: dto.processId,
            name: dto.name,
            status: AssetStatus.BORRADOR,
            ...(dto.requestId !== undefined ? { requestId: dto.requestId } : {}),
            ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
            ...(dto.typeCode !== undefined ? { typeCode: dto.typeCode } : {}),
            ...(dto.technologyCode !== undefined ? { technologyCode: dto.technologyCode } : {}),
            ...(dto.sourceCode !== undefined ? { sourceCode: dto.sourceCode } : {}),
            ...(dto.frequencyCode !== undefined ? { frequencyCode: dto.frequencyCode } : {}),
            ...(dto.documentationRef !== undefined ? { documentationRef: dto.documentationRef } : {}),
            ...(dto.functionalDescription !== undefined ? { functionalDescription: dto.functionalDescription } : {}),
            ...(dto.dependencies !== undefined ? { dependencies: dto.dependencies } : {}),
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'ASSET',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: null,
          after: this.snapshot(row),
        });

        return row;
      });

      return this.toResponse(created);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateAssetDto,
  ): Promise<AssetResponseDto> {
    const existing = await this.requireInScope(actor, id);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Editar metadatos no mueve el estado: nextStatus = estado actual.
        this.scope.requireAssetWritable(actor, existing, existing.status);

        if (typeof dto.ownerUserId === 'string') {
          await this.assertOwner(tx, dto.ownerUserId);
        }
        if (typeof dto.requestId === 'string') {
          await this.assertRequest(tx, dto.requestId, existing.processId);
        }
        await this.assertCatalogCodes(tx, {
          typeCode: dto.typeCode,
          technologyCode: dto.technologyCode,
          sourceCode: dto.sourceCode,
          frequencyCode: dto.frequencyCode,
        });

        const row = await tx.asset.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.requestId !== undefined ? { requestId: dto.requestId } : {}),
            ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
            ...(dto.typeCode !== undefined ? { typeCode: dto.typeCode } : {}),
            ...(dto.technologyCode !== undefined ? { technologyCode: dto.technologyCode } : {}),
            ...(dto.sourceCode !== undefined ? { sourceCode: dto.sourceCode } : {}),
            ...(dto.frequencyCode !== undefined ? { frequencyCode: dto.frequencyCode } : {}),
            ...(dto.documentationRef !== undefined ? { documentationRef: dto.documentationRef } : {}),
            ...(dto.functionalDescription !== undefined ? { functionalDescription: dto.functionalDescription } : {}),
            ...(dto.dependencies !== undefined ? { dependencies: dto.dependencies } : {}),
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'ASSET',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: this.snapshot(existing),
          after: this.snapshot(row),
        });

        return row;
      });

      return this.toResponse(updated);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async changeStatus(
    actor: CurrentActor,
    id: string,
    dto: ChangeAssetStatusDto,
  ): Promise<AssetResponseDto> {
    const existing = await this.requireInScope(actor, id);
    const nextStatus = this.state.assertTransition(existing.status, dto.targetStatus);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        this.scope.requireAssetWritable(actor, existing, nextStatus);

        const row = await tx.asset.update({
          where: { id },
          data: { status: nextStatus },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'ASSET',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: this.snapshot(existing),
          after: this.snapshot(row),
        });

        return row;
      });

      return this.toResponse(updated);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** Traduce P2002 -> 409; el resto se propaga tal cual. */
  private mapError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('El activo entra en conflicto con otro registro.');
    }
    return error;
  }
}
