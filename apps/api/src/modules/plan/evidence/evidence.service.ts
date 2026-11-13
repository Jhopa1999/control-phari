import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import {
  ALLOWED_EVIDENCE_TYPES,
  DEFAULT_EVIDENCE_MAX_BYTES,
  evidenceMaxBytes,
  extensionOf,
  sanitizeFileName,
  type UploadedEvidenceFile,
} from '../../storage/evidence-file';
import { StorageService } from '../../storage/storage.service';
import { PlanStateService } from '../plan-state.service';
import { EvidenceDownloadDto, EvidenceResponseDto } from './dto/evidence-response.dto';

/** Reglas de archivo compartidas (ver storage/evidence-file.ts); re-exportadas por compatibilidad. */
export {
  ALLOWED_EVIDENCE_TYPES,
  DEFAULT_EVIDENCE_MAX_BYTES,
  evidenceMaxBytes,
  sanitizeFileName,
};
export type { UploadedEvidenceFile };

/**
 * Evidencias de una tarea (archivos en el bucket maestro S3). Ver: cualquiera
 * con la tarea en alcance. Subir/borrar: jefe o lider del proceso, o el
 * responsable de la tarea (mismo criterio que cambiar su estado). Un proyecto
 * cerrado no admite cambios. Cada cambio queda auditado sobre la tarea.
 */
@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planState: PlanStateService,
    private readonly storage: StorageService,
  ) {}

  private isPlanManager(actor: CurrentActor): boolean {
    return (
      actor.roleCodes.has(RoleCode.JEFE_AREA) ||
      actor.roleCodes.has(RoleCode.LIDER_PROCESO)
    );
  }

  private canChange(actor: CurrentActor, responsibleUserId: string | null): boolean {
    return this.isPlanManager(actor) || responsibleUserId === actor.userId;
  }

  private toResponse(row: {
    id: string;
    taskId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    uploadedByUserId: string;
    createdAt: Date;
    uploadedBy: { name: string };
  }): EvidenceResponseDto {
    return {
      id: row.id,
      taskId: row.taskId,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      uploadedByUserId: row.uploadedByUserId,
      uploadedByName: row.uploadedBy.name,
      createdAt: row.createdAt,
    };
  }

  async list(actor: CurrentActor, taskId: string): Promise<EvidenceResponseDto[]> {
    await this.planState.requireTaskInScope(actor, taskId);
    const rows = await this.prisma.taskEvidence.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true } } },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async upload(
    actor: CurrentActor,
    taskId: string,
    file: UploadedEvidenceFile | undefined,
  ): Promise<EvidenceResponseDto> {
    const { task, mainProcessId, requestState, requestId } =
      await this.planState.requireTaskInScope(actor, taskId);
    this.planState.assertProjectOpen(requestState);
    if (!this.canChange(actor, task.responsibleUserId)) {
      throw new ForbiddenException(
        'Solo el responsable de la tarea o el líder del proceso puede adjuntar evidencias.',
      );
    }

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Selecciona un archivo para adjuntar.');
    }
    const max = evidenceMaxBytes(process.env.EVIDENCE_MAX_BYTES);
    if (file.size > max) {
      throw new BadRequestException(
        `El archivo supera el tamaño máximo permitido (${Math.floor(max / (1024 * 1024))} MB).`,
      );
    }
    const allowedExtensions = ALLOWED_EVIDENCE_TYPES[file.mimetype];
    if (!allowedExtensions || !allowedExtensions.includes(extensionOf(file.originalname))) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Usa PDF, imágenes, texto, Office o ZIP.',
      );
    }

    const id = randomUUID();
    const fileName = sanitizeFileName(file.originalname);
    const storageKey = `proyectos/${requestId}/tareas/${taskId}/evidencias/${id}-${fileName}`;

    await this.storage.put(storageKey, file.buffer, file.mimetype);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.taskEvidence.create({
          data: {
            id,
            taskId,
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
          objectType: 'TASK',
          objectId: taskId,
          scopeProcessId: mainProcessId,
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
    taskId: string,
    evidenceId: string,
  ): Promise<EvidenceDownloadDto> {
    await this.planState.requireTaskInScope(actor, taskId);
    const row = await this.prisma.taskEvidence.findFirst({
      where: { id: evidenceId, taskId },
    });
    if (!row) {
      throw new NotFoundException('La evidencia no existe.');
    }
    return this.storage.presignDownload(row.storageKey, row.fileName, row.contentType);
  }

  async remove(actor: CurrentActor, taskId: string, evidenceId: string): Promise<void> {
    const { task, mainProcessId, requestState } = await this.planState.requireTaskInScope(
      actor,
      taskId,
    );
    this.planState.assertProjectOpen(requestState);
    if (!this.canChange(actor, task.responsibleUserId)) {
      throw new ForbiddenException(
        'Solo el responsable de la tarea o el líder del proceso puede quitar evidencias.',
      );
    }
    const row = await this.prisma.taskEvidence.findFirst({
      where: { id: evidenceId, taskId },
    });
    if (!row) {
      throw new NotFoundException('La evidencia no existe.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.taskEvidence.delete({ where: { id: row.id } });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'TASK',
        objectId: taskId,
        scopeProcessId: mainProcessId,
        before: { evidenceRemoved: { id: row.id, fileName: row.fileName } },
        after: null,
      });
    });
    // Tras confirmar en BD; si S3 falla queda un objeto sin referencia (inocuo).
    await this.storage.remove(row.storageKey).catch(() => undefined);
  }
}
