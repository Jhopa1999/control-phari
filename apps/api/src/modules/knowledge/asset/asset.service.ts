import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
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

/**
 * Activo generico, compartido y gobernado (design §2/§3/§5/§a-§e). Lectura via
 * KnowledgeScopeService (propietario ∪ visibilidad, 404 fuera). ESCRITURA
 * (crear/editar/cambiar estado) reservada al jefe de area via
 * `requireAssetGovernor` (403). Maquina de estado via AssetStateService (salto
 * -> 400). El jefe define `visibleProcessIds` (tabla puente
 * AssetProcessVisibility); el propietario (`processId`) siempre es visible y se
 * excluye del conjunto. Mutacion + AuditEvent en la misma `$transaction`
 * (objectType ASSET, scopeProcessId = asset.processId). P2002 -> 409.
 */
@Injectable()
export class AssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: KnowledgeScopeService,
    private readonly state: AssetStateService,
  ) {}

  private snapshot(
    row: AssetWithVisibilities,
    visibleProcessIds: string[],
  ): Prisma.InputJsonValue {
    return {
      id: row.id,
      processId: row.processId,
      requestId: row.requestId,
      ownerUserId: row.ownerUserId,
      name: row.name,
      status: row.status,
      documentationRef: row.documentationRef,
      generalDescription: row.generalDescription,
      dependencies: row.dependencies,
      visibleProcessIds: [...visibleProcessIds].sort(),
    };
  }

  private toResponse(row: AssetWithVisibilities): AssetResponseDto {
    return {
      id: row.id,
      processId: row.processId,
      requestId: row.requestId,
      ownerUserId: row.ownerUserId,
      name: row.name,
      status: row.status,
      documentationRef: row.documentationRef,
      generalDescription: row.generalDescription,
      dependencies: row.dependencies,
      visibleProcessIds: row.visibilities.map((v) => v.processId).sort(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<AssetWithVisibilities> {
    const row = await this.prisma.asset.findFirst({
      where: { AND: [{ id }, this.scope.assetScopeWhere(actor)] },
      include: ASSET_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Activo "${id}" no encontrado.`);
    }
    return row;
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

  /**
   * Valida que la Request exista y participe de ALGUNO de los procesos
   * visibles del activo (propietario + visibilidad). Invalido -> 400.
   */
  private async assertRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
    visibleProcessIds: string[],
  ): Promise<void> {
    const request = await tx.request.findFirst({
      where: {
        id: requestId,
        participants: { some: { processId: { in: visibleProcessIds } } },
      },
      select: { id: true },
    });
    if (!request) {
      throw new BadRequestException(
        'La solicitud indicada no existe o no pertenece a un proceso visible del activo.',
      );
    }
  }

  /**
   * Valida que todos los procesos indicados existan y esten activos; alguno
   * invalido/inactivo -> 400. Usado para el `processId` propietario (NIT-5) y
   * para `visibleProcessIds`.
   */
  private async assertActiveProcesses(
    tx: Prisma.TransactionClient,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const found = await tx.process.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'Alguno de los procesos indicados no existe o esta inactivo.',
      );
    }
  }

  /**
   * Normaliza `visibleProcessIds`: dedupe y EXCLUYE el propietario (no es error
   * que el cliente lo envie; el propietario siempre es visible y nunca se
   * materializa como fila puente).
   */
  private normalizeVisible(
    ownerProcessId: string,
    visibleProcessIds: string[] | undefined,
  ): string[] {
    if (visibleProcessIds === undefined) {
      return [];
    }
    return Array.from(new Set(visibleProcessIds)).filter(
      (id) => id !== ownerProcessId,
    );
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
      include: ASSET_INCLUDE,
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
        // Gobernanza: crear un activo es exclusivo del jefe de area.
        this.scope.requireAssetGovernor(actor);

        // NIT-5: el propietario ya no se valida via scope; validarlo aqui.
        await this.assertActiveProcesses(tx, [dto.processId]);

        const visible = this.normalizeVisible(dto.processId, dto.visibleProcessIds);
        await this.assertActiveProcesses(tx, visible);

        if (dto.ownerUserId !== undefined) {
          await this.assertOwner(tx, dto.ownerUserId);
        }
        if (dto.requestId !== undefined) {
          await this.assertRequest(tx, dto.requestId, [dto.processId, ...visible]);
        }

        const row = await tx.asset.create({
          data: {
            processId: dto.processId,
            name: dto.name,
            status: AssetStatus.BORRADOR,
            ...(dto.requestId !== undefined ? { requestId: dto.requestId } : {}),
            ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
            ...(dto.documentationRef !== undefined ? { documentationRef: dto.documentationRef } : {}),
            ...(dto.generalDescription !== undefined ? { generalDescription: dto.generalDescription } : {}),
            ...(dto.dependencies !== undefined ? { dependencies: dto.dependencies } : {}),
            ...(visible.length > 0
              ? { visibilities: { createMany: { data: visible.map((processId) => ({ processId })) } } }
              : {}),
          },
          include: ASSET_INCLUDE,
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'ASSET',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: null,
          after: this.snapshot(row, visible),
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
    const previousVisible = existing.visibilities.map((v) => v.processId);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Gobernanza: editar un activo es exclusivo del jefe de area.
        this.scope.requireAssetGovernor(actor);

        if (typeof dto.ownerUserId === 'string') {
          await this.assertOwner(tx, dto.ownerUserId);
        }

        // Conjunto de visibilidad resultante: si viene definido, reemplaza;
        // si no, se conserva el previo.
        const replaceVisible = dto.visibleProcessIds !== undefined;
        const nextVisible = replaceVisible
          ? this.normalizeVisible(existing.processId, dto.visibleProcessIds)
          : previousVisible;

        if (replaceVisible) {
          await this.assertActiveProcesses(tx, nextVisible);
        }

        if (typeof dto.requestId === 'string') {
          await this.assertRequest(tx, dto.requestId, [
            existing.processId,
            ...nextVisible,
          ]);
        }

        if (replaceVisible) {
          await tx.assetProcessVisibility.deleteMany({ where: { assetId: id } });
          if (nextVisible.length > 0) {
            await tx.assetProcessVisibility.createMany({
              data: nextVisible.map((processId) => ({ assetId: id, processId })),
            });
          }
        }

        const row = await tx.asset.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.requestId !== undefined ? { requestId: dto.requestId } : {}),
            ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
            ...(dto.documentationRef !== undefined ? { documentationRef: dto.documentationRef } : {}),
            ...(dto.generalDescription !== undefined ? { generalDescription: dto.generalDescription } : {}),
            ...(dto.dependencies !== undefined ? { dependencies: dto.dependencies } : {}),
          },
          include: ASSET_INCLUDE,
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'ASSET',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: this.snapshot(existing, previousVisible),
          after: this.snapshot(row, nextVisible),
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
    const visible = existing.visibilities.map((v) => v.processId);
    const nextStatus = this.state.assertTransition(existing.status, dto.targetStatus);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Gobernanza: cambiar el estado de un activo es exclusivo del jefe.
        this.scope.requireAssetGovernor(actor);

        const row = await tx.asset.update({
          where: { id },
          data: { status: nextStatus },
          include: ASSET_INCLUDE,
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'ASSET',
          objectId: row.id,
          scopeProcessId: row.processId,
          before: this.snapshot(existing, visible),
          after: this.snapshot(row, visible),
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

/** Include estandar: trae las filas de visibilidad (solo el processId). */
const ASSET_INCLUDE = {
  visibilities: { select: { processId: true } },
} satisfies Prisma.AssetInclude;

/** Payload de Asset con la relacion de visibilidad (sin `any`, MEDIUM-C). */
type AssetWithVisibilities = Prisma.AssetGetPayload<{
  include: typeof ASSET_INCLUDE;
}>;
