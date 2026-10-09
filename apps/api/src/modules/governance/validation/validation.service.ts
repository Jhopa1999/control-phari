import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { ValidationRecordModel } from '../../../generated/prisma/models/ValidationRecord';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RequestStateService } from '../../request/request-state.service';
import { GovernanceScopeService } from '../governance-scope.service';
import { CreateValidationDto } from './dto/create-validation.dto';
import { ResolveBlockingDto } from './dto/resolve-blocking.dto';
import { ValidationResponseDto } from './dto/validation-response.dto';

/**
 * Registro de validaciones/evidencias (design §3.4, marco §7). Registrar NO
 * aprueba ningun gate ni cambia el estado de la Request (BR-008). La evidencia
 * puede fijar una version concreta del expediente de Fase 6. Resolver un defecto
 * bloqueante levanta el impedimento de GC4 sin aprobar el gate (D-C5). Toda
 * mutacion audita dentro de su $transaction.
 */
@Injectable()
export class ValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GovernanceScopeService,
    private readonly state: RequestStateService,
  ) {}

  private toResponse(record: ValidationRecordModel): ValidationResponseDto {
    return {
      id: record.id,
      requestId: record.requestId,
      gateCheckId: record.gateCheckId,
      validationTypeCode: record.validationTypeCode,
      testCase: record.testCase,
      version: record.version,
      environment: record.environment,
      resultCode: record.resultCode,
      blocking: record.blocking,
      blockingResolved: record.blockingResolved,
      blockingResolvedAt: record.blockingResolvedAt,
      blockingResolvedByUserId: record.blockingResolvedByUserId,
      evidenceRef: record.evidenceRef,
      evidenceDocumentId: record.evidenceDocumentId,
      evidenceDocumentVersionId: record.evidenceDocumentVersionId,
      executedByUserId: record.executedByUserId,
      executedAt: record.executedAt,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** Historial de validaciones de la Request (design §3.4). frameworks. */
  async findForRequest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<ValidationResponseDto[]> {
    await this.scope.requireInScope(actor, requestId);
    const records = await this.prisma.validationRecord.findMany({
      where: { requestId },
      orderBy: { executedAt: 'desc' },
    });
    return records.map((r) => this.toResponse(r));
  }

  /**
   * Registra una validacion (design §3.4, BR-008): NO aprueba gate ni cambia
   * estado. Valida catalogos (400) y la coherencia de la evidencia versionada
   * (400) y su documento (400/404 si fuera de alcance/inexistente).
   */
  async create(
    actor: CurrentActor,
    requestId: string,
    dto: CreateValidationDto,
  ): Promise<ValidationResponseDto> {
    const request = await this.scope.requireInScope(actor, requestId);

    await this.state.assertCatalogCode('VALIDATION_TYPE', dto.validationTypeCode);
    await this.state.assertCatalogCode('VALIDATION_RESULT', dto.resultCode);

    // Evidencia a documento (opcional): debe existir y estar en alcance del actor.
    if (dto.evidenceDocumentId !== undefined) {
      await this.requireDocumentInScope(actor, dto.evidenceDocumentId);
    }

    // Coherencia version <-> documento (D-C2).
    if (dto.evidenceDocumentVersionId !== undefined) {
      const version = await this.prisma.documentVersion.findUnique({
        where: { id: dto.evidenceDocumentVersionId },
        select: { documentId: true },
      });
      if (!version) {
        throw new BadRequestException('La versión de evidencia no existe.');
      }
      if (
        dto.evidenceDocumentId === undefined ||
        version.documentId !== dto.evidenceDocumentId
      ) {
        throw new BadRequestException(
          'La versión no pertenece al documento indicado.',
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.validationRecord.create({
        data: {
          requestId,
          validationTypeCode: dto.validationTypeCode,
          testCase: dto.testCase,
          resultCode: dto.resultCode,
          blocking: dto.blocking ?? false,
          executedByUserId: dto.executedByUserId,
          executedAt: new Date(dto.executedAt),
          ...(dto.version !== undefined ? { version: dto.version } : {}),
          ...(dto.environment !== undefined ? { environment: dto.environment } : {}),
          ...(dto.evidenceRef !== undefined ? { evidenceRef: dto.evidenceRef } : {}),
          ...(dto.evidenceDocumentId !== undefined
            ? { evidenceDocumentId: dto.evidenceDocumentId }
            : {}),
          ...(dto.evidenceDocumentVersionId !== undefined
            ? { evidenceDocumentVersionId: dto.evidenceDocumentVersionId }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'VALIDATION_RECORD',
        objectId: record.id,
        scopeProcessId: request.mainProcessId,
        before: null,
        after: {
          id: record.id,
          requestId: record.requestId,
          validationTypeCode: record.validationTypeCode,
          resultCode: record.resultCode,
          blocking: record.blocking,
        },
      });
      return record;
    });

    return this.toResponse(created);
  }

  /**
   * Resuelve un defecto bloqueante (design §3.4, D-C5): setea blockingResolved/
   * blockingResolvedAt/blockingResolvedByUserId. 404 si el registro no pertenece
   * a la Request; 400 si no es un defecto bloqueante. NO aprueba gate ni cambia
   * estado (BR-008).
   */
  async resolveBlocking(
    actor: CurrentActor,
    requestId: string,
    validationId: string,
    _dto: ResolveBlockingDto,
  ): Promise<ValidationResponseDto> {
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);

    const record = await this.prisma.validationRecord.findFirst({
      where: { id: validationId, requestId },
    });
    if (!record) {
      throw new NotFoundException('Validación no encontrada.');
    }
    if (!record.blocking) {
      throw new BadRequestException(
        'El registro no marca un defecto bloqueante.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.validationRecord.update({
        where: { id: record.id },
        data: {
          blockingResolved: true,
          blockingResolvedAt: new Date(),
          blockingResolvedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'VALIDATION_RECORD',
        objectId: result.id,
        scopeProcessId: request.mainProcessId,
        before: { blockingResolved: record.blockingResolved },
        after: { blockingResolved: result.blockingResolved },
      });
      return result;
    });

    return this.toResponse(updated);
  }

  /**
   * Verifica que el documento de evidencia exista y este en alcance del actor
   * (design §5): el documento cuelga de un Asset con processId. Jefe => sin
   * filtro; resto => processId del activo in scopedProcessIds. 404 inexistente/
   * fuera de alcance (sin confirmar existencia fuera de alcance).
   */
  private async requireDocumentInScope(
    actor: CurrentActor,
    documentId: string,
  ): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { asset: { select: { processId: true } } },
    });
    if (!document) {
      throw new NotFoundException('Documento de evidencia no encontrado.');
    }
    if (actor.isJefeArea) {
      return;
    }
    if (!actor.scopedProcessIds.has(document.asset.processId)) {
      throw new NotFoundException('Documento de evidencia no encontrado.');
    }
  }
}
