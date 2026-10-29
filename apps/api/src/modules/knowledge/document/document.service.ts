import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { AssetModel } from '../../../generated/prisma/models/Asset';
import type { DocumentModel } from '../../../generated/prisma/models/Document';
import type { DocumentVersionModel } from '../../../generated/prisma/models/DocumentVersion';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { KnowledgeScopeService } from '../knowledge-scope.service';
import { DocumentStateService } from './document-state.service';
import { CLOSURE_DOC_CATEGORY, DocStatus } from './doc-status';
import {
  NotificationService,
  NotificationType,
} from '../../notification/notification.service';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { CreateDocumentVersionDto } from './dto/create-document-version.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { ChangeDocumentStatusDto } from './dto/change-document-status.dto';
import { DocumentResponseDto } from './dto/document-response.dto';
import { DocumentVersionResponseDto } from './dto/document-version-response.dto';
import { DocumentContentResponseDto } from './dto/document-content-response.dto';

/** Documento con la version vigente embebida (sin contenido). */
type DocumentWithCurrent = DocumentModel & {
  currentVersion:
    | Pick<DocumentVersionModel, 'id' | 'versionNumber' | 'authorUserId' | 'createdAt'>
    | null;
};

/**
 * Logica de documentos y versiones (design §2/§3/§5). Documentos y versiones
 * heredan el alcance del activo (`Document.assetId` -> `Asset.processId`): toda
 * operacion resuelve primero el Asset con el alcance (404 fuera) y luego aplica
 * la autoridad por rol via `requireAssetWritable`. Versionado inmutable: editar
 * = crear una nueva version (AC-020), conservar la previa, mover SOLO el puntero
 * `currentVersionId`; crear version NO mueve `Document.status` (D6). Los
 * listados nunca incluyen el contenido. Mutacion + AuditEvent en la misma
 * transaccion (scopeProcessId = asset.processId).
 */
@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: KnowledgeScopeService,
    private readonly state: DocumentStateService,
    private readonly notifications: NotificationService,
  ) {}

  private documentSnapshot(row: DocumentModel): Prisma.InputJsonValue {
    return {
      id: row.id,
      assetId: row.assetId,
      title: row.title,
      categoryCode: row.categoryCode,
      status: row.status,
      currentVersionId: row.currentVersionId,
    };
  }

  private versionSnapshot(
    row: Pick<DocumentVersionModel, 'id' | 'documentId' | 'versionNumber' | 'authorUserId' | 'content'>,
  ): Prisma.InputJsonValue {
    // El contenido NO se guarda en auditoria (se referencia por id): solo el
    // numero de version y la longitud (design §5).
    return {
      id: row.id,
      documentId: row.documentId,
      versionNumber: row.versionNumber,
      authorUserId: row.authorUserId,
      contentLength: row.content.length,
    };
  }

  private toResponse(row: DocumentWithCurrent): DocumentResponseDto {
    return {
      id: row.id,
      assetId: row.assetId,
      title: row.title,
      categoryCode: row.categoryCode,
      status: row.status,
      requestId: row.requestId,
      submittedAt: row.submittedAt,
      submittedByUserId: row.submittedByUserId,
      reviewedAt: row.reviewedAt,
      reviewedByUserId: row.reviewedByUserId,
      reviewReason: row.reviewReason,
      currentVersion: row.currentVersion
        ? {
            id: row.currentVersion.id,
            versionNumber: row.currentVersion.versionNumber,
            authorUserId: row.currentVersion.authorUserId,
            createdAt: row.currentVersion.createdAt,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private versionToResponse(
    row: DocumentVersionModel,
  ): DocumentVersionResponseDto {
    return {
      id: row.id,
      documentId: row.documentId,
      versionNumber: row.versionNumber,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt,
    };
  }

  /** Resuelve el activo del documento aplicando el alcance de lectura (404 fuera). */
  private async requireAssetInScope(
    actor: CurrentActor,
    assetId: string,
  ): Promise<AssetModel> {
    const asset = await this.prisma.asset.findFirst({
      where: { AND: [{ id: assetId }, this.scope.assetScopeWhere(actor)] },
    });
    if (!asset) {
      throw new NotFoundException(`Activo "${assetId}" no encontrado.`);
    }
    return asset;
  }

  /** Resuelve un documento en alcance (via su activo) con la version vigente. */
  private async requireDocumentInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<{ document: DocumentWithCurrent; asset: AssetModel }> {
    const document = await this.prisma.document.findFirst({
      where: {
        AND: [{ id }, { asset: this.scope.assetScopeWhere(actor) }],
      },
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            authorUserId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!document) {
      throw new NotFoundException(`Documento "${id}" no encontrado.`);
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: document.assetId },
    });
    if (!asset) {
      // El activo siempre existe (FK requerida); defensivo.
      throw new NotFoundException(`Documento "${id}" no encontrado.`);
    }
    return { document, asset };
  }

  async list(
    actor: CurrentActor,
    filters: ListDocumentsDto,
  ): Promise<DocumentResponseDto[]> {
    const assetWhere: Prisma.AssetWhereInput = {
      AND: [this.scope.assetScopeWhere(actor)],
    };
    const assetAnd = assetWhere.AND as Prisma.AssetWhereInput[];
    if (filters.processId !== undefined) {
      assetAnd.push({ processId: filters.processId });
    }


    const where: Prisma.DocumentWhereInput = { AND: [{ asset: assetWhere }] };
    const and = where.AND as Prisma.DocumentWhereInput[];
    if (filters.assetId !== undefined) {
      and.push({ assetId: filters.assetId });
    }
    if (filters.status !== undefined) {
      and.push({ status: filters.status });
    }
    if (filters.requestId !== undefined) {
      // Documentos del proyecto: vinculados directamente o por el activo de origen.
      and.push({
        OR: [{ requestId: filters.requestId }, { asset: { requestId: filters.requestId } }],
      });
    }
    if (filters.categoryCode !== undefined) {
      and.push({ categoryCode: filters.categoryCode });
    }
    if (filters.q !== undefined) {
      and.push({ title: { contains: filters.q, mode: 'insensitive' } });
    }

    const rows = await this.prisma.document.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            authorUserId: true,
            createdAt: true,
          },
        },
      },
      ...(filters.take !== undefined ? { take: filters.take } : {}),
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(actor: CurrentActor, id: string): Promise<DocumentResponseDto> {
    const { document } = await this.requireDocumentInScope(actor, id);
    return this.toResponse(document);
  }

  async createDocument(
    actor: CurrentActor,
    dto: CreateDocumentDto,
  ): Promise<DocumentResponseDto> {
    const asset = await this.requireAssetInScope(actor, dto.assetId);
    // Crear documento no mueve el estado del activo: nextStatus = estado actual.
    this.scope.requireAssetWritable(actor, asset, asset.status);
    if (dto.requestId !== undefined) {
      await this.requireOpenProjectInScope(actor, dto.requestId);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            assetId: dto.assetId,
            title: dto.title,
            status: DocStatus.BORRADOR,
            ...(dto.categoryCode !== undefined ? { categoryCode: dto.categoryCode } : {}),
            ...(dto.requestId !== undefined ? { requestId: dto.requestId } : {}),
          },
        });

        const version = await tx.documentVersion.create({
          data: {
            documentId: document.id,
            versionNumber: 1,
            content: dto.content,
            authorUserId: actor.userId,
          },
        });

        const withPointer = await tx.document.update({
          where: { id: document.id },
          data: { currentVersionId: version.id },
          include: {
            currentVersion: {
              select: {
                id: true,
                versionNumber: true,
                authorUserId: true,
                createdAt: true,
              },
            },
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'DOCUMENT',
          objectId: document.id,
          scopeProcessId: asset.processId,
          before: null,
          after: this.documentSnapshot(withPointer),
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'DOCUMENT_VERSION',
          objectId: version.id,
          scopeProcessId: asset.processId,
          before: null,
          after: this.versionSnapshot(version),
        });

        return withPointer;
      });

      return this.toResponse(created);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async updateDocument(
    actor: CurrentActor,
    id: string,
    dto: UpdateDocumentDto,
  ): Promise<DocumentResponseDto> {
    const { document, asset } = await this.requireDocumentInScope(actor, id);
    this.scope.requireAssetWritable(actor, asset, asset.status);
    await this.assertProjectOpen(document.requestId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.categoryCode !== undefined ? { categoryCode: dto.categoryCode } : {}),
        },
        include: {
          currentVersion: {
            select: {
              id: true,
              versionNumber: true,
              authorUserId: true,
              createdAt: true,
            },
          },
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DOCUMENT',
        objectId: row.id,
        scopeProcessId: asset.processId,
        before: this.documentSnapshot(document),
        after: this.documentSnapshot(row),
      });

      return row;
    });

    return this.toResponse(updated);
  }

  async createVersion(
    actor: CurrentActor,
    id: string,
    dto: CreateDocumentVersionDto,
  ): Promise<DocumentResponseDto> {
    const { document, asset } = await this.requireDocumentInScope(actor, id);
    // Versionar NO mueve el estado del documento (D6): nextStatus = asset.status.
    this.scope.requireAssetWritable(actor, asset, asset.status);
    await this.assertProjectOpen(document.requestId);

    // Un unico reintento server-side ante P2002 recomputando max+1 (finding #7).
    try {
      return await this.appendVersion(actor, document, asset, dto.content);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        try {
          return await this.appendVersion(actor, document, asset, dto.content);
        } catch (retryError) {
          if (this.isUniqueViolation(retryError)) {
            throw new ConflictException(
              'Otra edicion creo una version; recarga el historial.',
            );
          }
          throw retryError;
        }
      }
      throw error;
    }
  }

  /** Crea la siguiente version (max+1), mueve el puntero y audita. */
  private async appendVersion(
    actor: CurrentActor,
    document: DocumentWithCurrent,
    asset: AssetModel,
    content: string,
  ): Promise<DocumentResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const max = await tx.documentVersion.aggregate({
        where: { documentId: document.id },
        _max: { versionNumber: true },
      });
      const nextNumber = (max._max.versionNumber ?? 0) + 1;

      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          versionNumber: nextNumber,
          content,
          authorUserId: actor.userId,
        },
      });

      // Solo se mueve el puntero; Document.status NO se toca (D6). Excepcion: la
      // documentacion de cierre ya enviada o aprobada vuelve a BORRADOR, porque
      // el contenido aprobado debe ser exactamente el revisado.
      const resetsApproval =
        document.categoryCode === CLOSURE_DOC_CATEGORY &&
        (document.status === DocStatus.VIGENTE ||
          document.status === DocStatus.PENDIENTE_APROBACION);
      const withPointer = await tx.document.update({
        where: { id: document.id },
        data: {
          currentVersionId: version.id,
          ...(resetsApproval ? { status: DocStatus.BORRADOR } : {}),
        },
        include: {
          currentVersion: {
            select: {
              id: true,
              versionNumber: true,
              authorUserId: true,
              createdAt: true,
            },
          },
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'DOCUMENT_VERSION',
        objectId: version.id,
        scopeProcessId: asset.processId,
        before: null,
        after: this.versionSnapshot(version),
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DOCUMENT',
        objectId: document.id,
        scopeProcessId: asset.processId,
        before: this.documentSnapshot(document),
        after: this.documentSnapshot(withPointer),
      });

      return this.toResponse(withPointer);
    });
  }

  async listVersions(
    actor: CurrentActor,
    id: string,
  ): Promise<DocumentVersionResponseDto[]> {
    const { document } = await this.requireDocumentInScope(actor, id);
    const rows = await this.prisma.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { versionNumber: 'desc' },
    });
    return rows.map((row) => this.versionToResponse(row));
  }

  async getVersionContent(
    actor: CurrentActor,
    id: string,
    versionId: string,
  ): Promise<DocumentContentResponseDto> {
    const { document } = await this.requireDocumentInScope(actor, id);
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId: document.id },
    });
    if (!version) {
      throw new NotFoundException(`Version "${versionId}" no encontrada.`);
    }
    return {
      documentId: document.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      title: document.title,
      content: version.content,
    };
  }

  async getCurrentContent(
    actor: CurrentActor,
    id: string,
  ): Promise<DocumentContentResponseDto> {
    const { document } = await this.requireDocumentInScope(actor, id);
    if (!document.currentVersionId) {
      throw new NotFoundException(`El documento "${id}" no tiene contenido.`);
    }
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: document.currentVersionId, documentId: document.id },
    });
    if (!version) {
      throw new NotFoundException(`El documento "${id}" no tiene contenido.`);
    }
    return {
      documentId: document.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      title: document.title,
      content: version.content,
    };
  }

  async changeStatus(
    actor: CurrentActor,
    id: string,
    dto: ChangeDocumentStatusDto,
  ): Promise<DocumentResponseDto> {
    const { document, asset } = await this.requireDocumentInScope(actor, id);
    const nextStatus = this.state.assertTransition(document.status, dto.targetStatus);
    // Cambiar estado del documento esta reservado a lider/jefe (design §2.3): el
    // integrante nunca puede, aunque el activo este en BORRADOR.
    this.scope.requireProcessManager(actor, asset);
    await this.assertProjectOpen(document.requestId);

    const fromPending = document.status === DocStatus.PENDIENTE_APROBACION;
    const isDecision =
      fromPending &&
      (nextStatus === DocStatus.VIGENTE || nextStatus === DocStatus.RECHAZADO);
    if (isDecision && !actor.isJefeArea) {
      throw new ForbiddenException(
        'Solo el jefe de área puede aprobar o rechazar documentación.',
      );
    }
    if (nextStatus === DocStatus.RECHAZADO && !dto.reason?.trim()) {
      throw new BadRequestException('Indica el motivo del rechazo.');
    }
    if (
      document.categoryCode === CLOSURE_DOC_CATEGORY &&
      nextStatus === DocStatus.VIGENTE &&
      !fromPending
    ) {
      throw new ConflictException(
        'La documentación de cierre debe enviarse a aprobación; no se puede publicar directamente.',
      );
    }

    const data: Prisma.DocumentUncheckedUpdateInput = { status: nextStatus };
    if (nextStatus === DocStatus.PENDIENTE_APROBACION) {
      data.submittedAt = new Date();
      data.submittedByUserId = actor.userId;
      data.reviewedAt = null;
      data.reviewedByUserId = null;
      data.reviewReason = null;
    }
    if (isDecision) {
      data.reviewedAt = new Date();
      data.reviewedByUserId = actor.userId;
      data.reviewReason = dto.reason?.trim() || null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id },
        data,
        include: {
          currentVersion: {
            select: {
              id: true,
              versionNumber: true,
              authorUserId: true,
              createdAt: true,
            },
          },
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'DOCUMENT',
        objectId: row.id,
        scopeProcessId: asset.processId,
        before: this.documentSnapshot(document),
        after: this.documentSnapshot(row),
      });

      return row;
    });

    await this.notifyStatusChange(actor, updated, asset, nextStatus, isDecision);
    return this.toResponse(updated);
  }

  /** Atajo: enviar a aprobación (BORRADOR/RECHAZADO -> PENDIENTE_APROBACION). */
  submitForApproval(actor: CurrentActor, id: string): Promise<DocumentResponseDto> {
    return this.changeStatus(actor, id, { targetStatus: DocStatus.PENDIENTE_APROBACION });
  }

  /** Aprobar (-> VIGENTE) o rechazar (-> RECHAZADO, motivo obligatorio). Solo jefe. */
  review(
    actor: CurrentActor,
    id: string,
    dto: ReviewDocumentDto,
  ): Promise<DocumentResponseDto> {
    return this.changeStatus(actor, id, {
      targetStatus: dto.decision === 'APROBAR' ? DocStatus.VIGENTE : DocStatus.RECHAZADO,
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
    });
  }

  /** Cola de documentos pendientes de aprobación dentro del alcance (Aprobaciones). */
  async pendingApproval(actor: CurrentActor): Promise<DocumentResponseDto[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        AND: [
          { status: DocStatus.PENDIENTE_APROBACION },
          { asset: this.scope.assetScopeWhere(actor) },
        ],
      },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        currentVersion: {
          select: { id: true, versionNumber: true, authorUserId: true, createdAt: true },
        },
      },
    });
    return rows.map((row) => this.toResponse(row));
  }

  /** Ruta interna del documento en el portal. */
  private documentLink(doc: { id: string; assetId: string }): string {
    return `/activos/documentos?documentId=${encodeURIComponent(doc.id)}`;
  }

  private async notifyStatusChange(
    actor: CurrentActor,
    doc: DocumentModel,
    asset: AssetModel,
    nextStatus: DocStatus,
    isDecision: boolean,
  ): Promise<void> {
    const link = this.documentLink(doc);
    if (nextStatus === DocStatus.PENDIENTE_APROBACION) {
      await this.notifications.notify({
        userIds: await this.notifications.areaHeadsForProcess(asset.processId),
        excludeUserId: actor.userId,
        type: NotificationType.DOCUMENT_PENDING_APPROVAL,
        title: 'Documentación pendiente de aprobación',
        message: `«${doc.title}» espera tu aprobación.`,
        link,
        requestId: doc.requestId,
      });
    } else if (isDecision) {
      const approved = nextStatus === DocStatus.VIGENTE;
      await this.notifications.notify({
        userIds: [doc.submittedByUserId],
        excludeUserId: actor.userId,
        type: approved
          ? NotificationType.DOCUMENT_APPROVED
          : NotificationType.DOCUMENT_REJECTED,
        title: approved ? 'Documentación aprobada' : 'Documentación rechazada',
        message: approved
          ? `«${doc.title}» fue aprobada.`
          : `«${doc.title}» fue rechazada: ${doc.reviewReason ?? ''}`.trim(),
        link,
        requestId: doc.requestId,
      });
    }
  }

  /**
   * El proyecto (solicitud) al que se vincula un documento debe existir, estar
   * en el alcance del actor y no estar cerrado.
   */
  private async requireOpenProjectInScope(
    actor: CurrentActor,
    requestId: string,
  ): Promise<void> {
    const request = await this.prisma.request.findFirst({
      where: {
        id: requestId,
        deletedAt: null,
        ...(actor.isJefeArea
          ? {}
          : { mainProcessId: { in: Array.from(actor.scopedProcessIds) } }),
      },
      select: { operationalState: true },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
    if (request.operationalState === 'CERRADA') {
      throw new ConflictException(
        'El proyecto está cerrado; no admite cambios en su documentación.',
      );
    }
  }

  /** Bloquea cambios ordinarios en documentos de un proyecto cerrado (CIE-01). */
  private async assertProjectOpen(requestId: string | null): Promise<void> {
    if (!requestId) return;
    const request = await this.prisma.request.findFirst({
      where: { id: requestId },
      select: { operationalState: true },
    });
    if (request?.operationalState === 'CERRADA') {
      throw new ConflictException(
        'El proyecto está cerrado; no admite cambios en su documentación.',
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  /** Traduce P2002 -> 409; el resto se propaga tal cual. */
  private mapError(error: unknown): unknown {
    if (this.isUniqueViolation(error)) {
      return new ConflictException('El documento entra en conflicto con otro registro.');
    }
    return error;
  }
}
