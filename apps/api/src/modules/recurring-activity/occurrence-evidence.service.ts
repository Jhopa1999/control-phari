import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import {
  evidenceMaxBytes,
  sanitizeFileName,
  type UploadedEvidenceFile,
  validateEvidenceFile,
} from '../storage/evidence-file';
import { StorageService } from '../storage/storage.service';
import { EvidenceDownloadDto } from '../plan/evidence/dto/evidence-response.dto';
import { OccurrenceEvidenceResponseDto } from './dto/occurrence-evidence-response.dto';
import { RecurringActivityService } from './recurring-activity.service';

/**
 * Adjuntos (informes, reportes) de una ocurrencia de actividad recurrente. Se
 * suben ANTES de completar; `complete` solo valida que existan cuando la
 * definicion exige evidencia. Ver y descargar: cualquiera con la ocurrencia en
 * alcance. Subir/quitar: solo mientras la ocurrencia esta abierta (ventana
 * abierta, en curso o vencida); 409 si es programada, completada o cancelada.
 * Mismas validaciones de tipo/tamano que las evidencias de tareas.
 */
@Injectable()
export class OccurrenceEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly occurrences: RecurringActivityService,
  ) {}

  private toResponse(row: {
    id: string;
    occurrenceId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    uploadedByUserId: string;
    createdAt: Date;
    uploadedBy: { name: string };
  }): OccurrenceEvidenceResponseDto {
    return {
      id: row.id,
      occurrenceId: row.occurrenceId,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      uploadedByUserId: row.uploadedByUserId,
      uploadedByName: row.uploadedBy.name,
      createdAt: row.createdAt,
    };
  }

  /** Solo se adjunta/quita mientras la ocurrencia admite completarse. */
  private assertOpen(canComplete: boolean): void {
    if (!canComplete) {
      throw new ConflictException(
        'Solo se pueden adjuntar o quitar archivos mientras la actividad esta abierta.',
      );
    }
  }

  async list(
    actor: CurrentActor,
    occurrenceId: string,
  ): Promise<OccurrenceEvidenceResponseDto[]> {
    await this.occurrences.requireOccurrenceInScope(actor, occurrenceId);
    const rows = await this.prisma.recurringOccurrenceEvidence.findMany({
      where: { occurrenceId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true } } },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async upload(
    actor: CurrentActor,
    occurrenceId: string,
    file: UploadedEvidenceFile | undefined,
  ): Promise<OccurrenceEvidenceResponseDto> {
    const occurrence = await this.occurrences.requireOccurrenceInScope(
      actor,
      occurrenceId,
    );
    this.assertOpen(this.occurrences.displayOf(occurrence).canComplete);

    const invalid = validateEvidenceFile(
      file,
      evidenceMaxBytes(process.env.EVIDENCE_MAX_BYTES),
    );
    if (invalid !== null || !file) {
      throw new BadRequestException(invalid ?? 'Selecciona un archivo para adjuntar.');
    }

    const id = randomUUID();
    const storageKey = `actividades-recurrentes/${occurrence.activityId}/${occurrenceId}/${id}-${sanitizeFileName(file.originalname)}`;

    await this.storage.put(storageKey, file.buffer, file.mimetype);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.recurringOccurrenceEvidence.create({
          data: {
            id,
            occurrenceId,
            fileName: file.originalname.slice(-200),
            contentType: file.mimetype,
            sizeBytes: file.size,
            storageKey,
            uploadedByUserId: actor.userId,
          },
          include: { uploadedBy: { select: { name: true } } },
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'RECURRING_ACTIVITY_OCCURRENCE',
          objectId: occurrenceId,
          scopeProcessId: null,
          before: null,
          after: { evidenceAdded: { id, fileName: created.fileName, sizeBytes: file.size } },
        });
        return created;
      });
      return this.toResponse(row);
    } catch (err) {
      // No dejar huerfano el objeto si fallo el registro en BD.
      await this.storage.remove(storageKey).catch(() => undefined);
      throw err;
    }
  }

  async download(
    actor: CurrentActor,
    occurrenceId: string,
    evidenceId: string,
  ): Promise<EvidenceDownloadDto> {
    await this.occurrences.requireOccurrenceInScope(actor, occurrenceId);
    const row = await this.prisma.recurringOccurrenceEvidence.findFirst({
      where: { id: evidenceId, occurrenceId },
    });
    if (!row) {
      throw new NotFoundException('El adjunto no existe.');
    }
    return this.storage.presignDownload(row.storageKey, row.fileName, row.contentType);
  }

  async remove(
    actor: CurrentActor,
    occurrenceId: string,
    evidenceId: string,
  ): Promise<void> {
    const occurrence = await this.occurrences.requireOccurrenceInScope(
      actor,
      occurrenceId,
    );
    this.assertOpen(this.occurrences.displayOf(occurrence).canComplete);
    const row = await this.prisma.recurringOccurrenceEvidence.findFirst({
      where: { id: evidenceId, occurrenceId },
    });
    if (!row) {
      throw new NotFoundException('El adjunto no existe.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.recurringOccurrenceEvidence.delete({ where: { id: row.id } });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'RECURRING_ACTIVITY_OCCURRENCE',
        objectId: occurrenceId,
        scopeProcessId: null,
        before: { evidenceRemoved: { id: row.id, fileName: row.fileName } },
        after: null,
      });
    });
    // Tras confirmar en BD; si S3 falla queda un objeto sin referencia (inocuo).
    await this.storage.remove(row.storageKey).catch(() => undefined);
  }
}
