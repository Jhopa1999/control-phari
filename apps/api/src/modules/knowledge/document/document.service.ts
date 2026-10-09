import {
  ConflictException,
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
import { DocStatus } from './doc-status';
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
    if (filters.requestId !== undefined) {
      assetAnd.push({ requestId: filters.requestId });
    }

    const where: Prisma.DocumentWhereInput = { AND: [{ asset: assetWhere }] };
    const and = where.AND as Prisma.DocumentWhereInput[];
    if (filters.assetId !== undefined) {
      and.push({ assetId: filters.assetId });
    }
    if (filters.status !== undefined) {
      and.push({ status: filters.status });
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

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            assetId: dto.assetId,
            title: dto.title,
            status: DocStatus.BORRADOR,
            ...(dto.categoryCode !== undefined ? { categoryCode: dto.categoryCode } : {}),
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

      // Solo se mueve el puntero; Document.status NO se toca (D6).
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id },
        data: { status: nextStatus },
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
