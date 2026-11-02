import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { ASSISTANT_AGENT_CODE } from '../ai/ai-defaults';
import { AiModelCatalogService } from '../ai/ai-model-catalog.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { BEDROCK_CLIENT, BedrockClient, BedrockTimeoutError } from '../ai/bedrock.client';
import type { ConverseBlock } from '../ai/bedrock-converse';
import type { CurrentActor } from '../auth/current-actor';
import { StorageService } from '../storage/storage.service';
import { resolveAgentCredentials } from './assistant-agent';
import {
  classifyFile,
  clampText,
  converseDocumentName,
  decodeText,
  extractionPrompt,
  matchesSignature,
} from './assistant-attachments';
import {
  MAX_ATTACHMENT_TEXT_CHARS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_UNSENT_ATTACHMENTS,
  UNSENT_ATTACHMENT_TTL_HOURS,
} from './assistant.constants';
import { AttachmentDto } from './dto/assistant.dto';

/** Archivo recibido por multipart (la parte que usa el servicio). */
export interface UploadedAttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Tokens máximos de la respuesta de extracción. */
const EXTRACTION_MAX_TOKENS = 4096;

interface AttachmentRow {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: string;
  storageKey: string;
  extractedText: string;
  truncated: boolean;
  createdAt: Date;
}

function toDto(row: AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    kind: row.kind === 'imagen' ? 'imagen' : 'documento',
    extractedText: row.extractedText,
    truncated: row.truncated,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Adjuntos del chat del asistente (BL-032 F4a). El original se guarda en S3 y el
 * backend extrae su contenido como TEXTO (con visión para imágenes, como
 * documento para PDF/Word/Excel, directamente para CSV/Markdown/TXT): la persona
 * lo ve y puede editarlo antes de enviarlo, y es lo único que recibe el modelo,
 * marcado como dato no confiable. Los adjuntos son privados de quien los sube.
 */
@Injectable()
export class AssistantAttachmentsService {
  private readonly logger = new Logger(AssistantAttachmentsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(BEDROCK_CLIENT) private readonly bedrock: BedrockClient,
    @Inject(AiModelCatalogService) private readonly models: AiModelCatalogService,
    @Inject(AiUsageService) private readonly usage: AiUsageService,
  ) {}

  // ------------------------------------------------------------------- subida

  async upload(
    actor: CurrentActor,
    file: UploadedAttachmentFile | undefined,
  ): Promise<AttachmentDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Selecciona un archivo para adjuntar.');
    }
    const classified = classifyFile(file.originalname, file.size);
    if ('error' in classified) {
      throw new BadRequestException(classified.error);
    }
    if (!matchesSignature(classified.extension, file.buffer)) {
      throw new BadRequestException(
        'El contenido del archivo no corresponde a su tipo. Adjunta el archivo original.',
      );
    }

    const runtime = await this.requireRuntime();
    if (classified.mode !== 'texto') {
      const capabilities = await this.models.inputCapabilities(runtime.agent.model);
      const supported =
        classified.mode === 'imagen' ? capabilities.vision : capabilities.documents;
      if (!supported) {
        throw new ConflictException(
          classified.mode === 'imagen'
            ? 'El modelo del asistente no puede leer imágenes. Pide al administrador que elija otro modelo.'
            : 'El modelo del asistente no puede leer este tipo de documentos. Pide al administrador que elija otro modelo.',
        );
      }
    }

    await this.purgeStale(actor.userId);
    const unsent = await this.prisma.aiAttachment.count({
      where: { userId: actor.userId, messageId: null },
    });
    if (unsent >= MAX_UNSENT_ATTACHMENTS) {
      throw new BadRequestException(
        'Tienes demasiados archivos sin enviar. Quita alguno antes de adjuntar otro.',
      );
    }

    const rawText =
      classified.mode === 'texto'
        ? decodeText(file.buffer)
        : await this.extractWithModel(actor, runtime, classified, file);
    const { text, truncated } = clampText(rawText);
    if (text === '') {
      throw new UnprocessableEntityException(
        `${file.originalname} no tiene contenido legible. El archivo está vacío o no se pudo leer (por ejemplo, está protegido con contraseña).`,
      );
    }

    const id = randomUUID();
    const safeName = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
    const storageKey = `asistente/${actor.userId}/${id}-${safeName}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    try {
      const row = await this.prisma.aiAttachment.create({
        data: {
          id,
          userId: actor.userId,
          fileName: file.originalname.slice(-200),
          contentType: file.mimetype,
          sizeBytes: file.size,
          kind: classified.kind,
          storageKey,
          extractedText: text,
          truncated,
        },
      });
      return toDto(row);
    } catch (error) {
      await this.removeObject(storageKey);
      throw error;
    }
  }

  /** Agente y credenciales del asistente; 409 si no está disponible. */
  private async requireRuntime() {
    const [globalRow, agent] = await Promise.all([
      this.prisma.aiGlobalConfig.findFirst(),
      this.prisma.aiAgentConfig.findUnique({ where: { code: ASSISTANT_AGENT_CODE } }),
    ]);
    if (!globalRow?.enabled || !agent?.enabled) {
      throw new ConflictException('El asistente está desactivado.');
    }
    await this.usage.assertWithinBudget();
    return { agent, credentials: resolveAgentCredentials(globalRow) };
  }

  /** Pide al modelo el contenido del archivo como texto y registra el consumo. */
  private async extractWithModel(
    actor: CurrentActor,
    runtime: Awaited<ReturnType<AssistantAttachmentsService['requireRuntime']>>,
    classified: Exclude<ReturnType<typeof classifyFile>, { error: string }>,
    file: UploadedAttachmentFile,
  ): Promise<string> {
    const { agent, credentials } = runtime;
    const bytes = new Uint8Array(file.buffer);
    const block: ConverseBlock =
      classified.mode === 'imagen'
        ? { type: 'image', format: classified.format as 'png', bytes }
        : {
            type: 'document',
            format: classified.format as 'pdf',
            name: converseDocumentName(file.originalname),
            bytes,
          };
    const startedAt = Date.now();
    try {
      const result = await this.bedrock.converse({
        region: agent.region,
        modelId: agent.model,
        messages: [
          {
            role: 'user',
            content: [block, { type: 'text', text: extractionPrompt(classified.mode) }],
          },
        ],
        maxTokens: EXTRACTION_MAX_TOKENS,
        timeoutMs: agent.timeoutMs,
        ...(credentials ? { credentials } : {}),
      });
      await this.usage.record({
        userId: actor.userId,
        agentCode: ASSISTANT_AGENT_CODE,
        modelId: agent.model,
        usage: result.usage,
        durationMs: Date.now() - startedAt,
      });
      return result.content
        .filter((b): b is Extract<ConverseBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
    } catch (error) {
      this.logger.warn(
        `Fallo al leer un adjunto: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
      if (error instanceof BedrockTimeoutError) {
        throw new BadGatewayException(
          'La lectura del archivo tardó demasiado. Inténtalo de nuevo o adjunta uno más pequeño.',
        );
      }
      throw new BadGatewayException(
        'No pudimos leer el archivo. Inténtalo de nuevo o adjunta otro.',
      );
    }
  }

  // ------------------------------------------------------------ edición y baja

  private async requireOwnedUnsent(actor: CurrentActor, id: string) {
    const row = await this.prisma.aiAttachment.findFirst({
      where: { id, userId: actor.userId },
    });
    if (!row) throw new NotFoundException('Adjunto no encontrado.');
    if (row.messageId !== null) {
      throw new ConflictException('El adjunto ya se envió y no se puede modificar.');
    }
    return row;
  }

  /** Reemplaza el texto que leerá el asistente (la persona corrige la extracción). */
  async updateText(
    actor: CurrentActor,
    id: string,
    extractedText: string,
  ): Promise<AttachmentDto> {
    await this.requireOwnedUnsent(actor, id);
    const text = extractedText.replace(/\r\n/g, '\n').trim();
    if (text === '') {
      throw new BadRequestException('El texto del adjunto no puede quedar vacío.');
    }
    if (text.length > MAX_ATTACHMENT_TEXT_CHARS) {
      throw new BadRequestException(
        `El texto no puede superar ${MAX_ATTACHMENT_TEXT_CHARS} caracteres.`,
      );
    }
    const row = await this.prisma.aiAttachment.update({
      where: { id },
      data: { extractedText: text, truncated: false },
    });
    return toDto(row);
  }

  /** Quita un adjunto aún no enviado (fila y archivo). */
  async remove(actor: CurrentActor, id: string): Promise<void> {
    const row = await this.requireOwnedUnsent(actor, id);
    await this.prisma.aiAttachment.delete({ where: { id } });
    await this.removeObject(row.storageKey);
  }

  // ------------------------------------------------------ envío con el mensaje

  /**
   * Toma los adjuntos del mensaje: deben ser de la persona, estar sin enviar y
   * no pasar de MAX_ATTACHMENTS_PER_MESSAGE. Devuelve los datos para el
   * historial del modelo.
   */
  async requireForSend(actor: CurrentActor, ids: string[]): Promise<AttachmentRow[]> {
    if (ids.length === 0) return [];
    if (ids.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new BadRequestException(
        `Máximo ${MAX_ATTACHMENTS_PER_MESSAGE} archivos por mensaje.`,
      );
    }
    const rows = await this.prisma.aiAttachment.findMany({
      where: { id: { in: ids }, userId: actor.userId, messageId: null },
    });
    if (rows.length !== new Set(ids).size) {
      throw new NotFoundException(
        'Alguno de los adjuntos ya no está disponible. Quítalo y vuelve a adjuntarlo.',
      );
    }
    return rows;
  }

  /** Vincula los adjuntos al mensaje enviado y a su conversación. */
  async attachToMessage(
    ids: string[],
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.aiAttachment.updateMany({
      where: { id: { in: ids }, messageId: null },
      data: { conversationId, messageId },
    });
  }

  /** Adjuntos de una conversación agrupados por mensaje (para el historial). */
  async byMessage(conversationId: string): Promise<Map<string, AttachmentDto[]>> {
    const rows = await this.prisma.aiAttachment.findMany({
      where: { conversationId, messageId: { not: null } },
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map<string, AttachmentDto[]>();
    for (const row of rows) {
      if (!row.messageId) continue;
      const list = map.get(row.messageId) ?? [];
      list.push(toDto(row));
      map.set(row.messageId, list);
    }
    return map;
  }

  // ----------------------------------------------------------------- limpieza

  /** Borra de S3 los archivos de una conversación que se va a eliminar. */
  async removeConversationFiles(conversationId: string): Promise<void> {
    const rows = await this.prisma.aiAttachment.findMany({
      where: { conversationId },
      select: { storageKey: true },
    });
    await Promise.all(rows.map((r) => this.removeObject(r.storageKey)));
  }

  /** Borra los adjuntos subidos y nunca enviados que llevan demasiado tiempo. */
  private async purgeStale(userId: string): Promise<void> {
    const cutoff = new Date(Date.now() - UNSENT_ATTACHMENT_TTL_HOURS * 3_600_000);
    const stale = await this.prisma.aiAttachment.findMany({
      where: { userId, messageId: null, createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
    });
    if (stale.length === 0) return;
    await this.prisma.aiAttachment.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    await Promise.all(stale.map((s) => this.removeObject(s.storageKey)));
  }

  /** Borrado en S3 sin romper el flujo si falla (queda registrado). */
  private async removeObject(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el archivo ${key}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
}
