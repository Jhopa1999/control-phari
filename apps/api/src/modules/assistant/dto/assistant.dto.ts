import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  MAX_ATTACHMENT_TEXT_CHARS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
} from '../assistant.constants';

/** Mensaje del usuario al asistente. */
export class ChatRequestDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Conversación existente. Si se omite, se crea una nueva.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({
    type: String,
    maxLength: MAX_MESSAGE_LENGTH,
    description:
      'Mensaje de la persona. Puede ir vacío solo si se envían adjuntos (attachmentIds).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`,
  })
  message!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_ATTACHMENTS_PER_MESSAGE,
    description:
      'Adjuntos ya subidos y listos (POST /assistant/attachments) que acompañan al mensaje. Su texto extraído se entrega al asistente como dato no confiable.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS_PER_MESSAGE, {
    message: `Máximo ${MAX_ATTACHMENTS_PER_MESSAGE} archivos por mensaje.`,
  })
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

/** Adjunto del chat: archivo subido cuyo contenido se extrajo como texto. */
export class AttachmentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre original del archivo.' })
  fileName!: string;

  @ApiProperty({ type: String, description: 'Tipo MIME declarado al subirlo.' })
  contentType!: string;

  @ApiProperty({ type: Number, description: 'Tamaño del archivo en bytes.' })
  sizeBytes!: number;

  @ApiProperty({ type: String, enum: ['imagen', 'documento'] })
  kind!: 'imagen' | 'documento';

  @ApiProperty({
    type: String,
    description: 'Texto que el asistente leerá (extraído del archivo; la persona puede editarlo antes de enviar).',
  })
  extractedText!: string;

  @ApiProperty({
    type: Boolean,
    description: 'El texto extraído se recortó por superar el máximo de caracteres.',
  })
  truncated!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** Cambio del texto extraído de un adjunto aún no enviado. */
export class UpdateAttachmentDto {
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: MAX_ATTACHMENT_TEXT_CHARS,
    description: 'Texto que se entregará al asistente.',
  })
  @IsString()
  @MaxLength(MAX_ATTACHMENT_TEXT_CHARS, {
    message: `El texto no puede superar ${MAX_ATTACHMENT_TEXT_CHARS} caracteres.`,
  })
  extractedText!: string;
}

/** Cuerpo multipart de la subida de un adjunto (documentación del contrato). */
export class UploadAttachmentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'Imagen (PNG, JPEG, WebP, GIF) o documento (PDF, Word, Excel, CSV, Markdown, TXT).',
  })
  file!: unknown;
}

/** Límites de los adjuntos, para que la interfaz no los duplique. */
export class AttachmentLimitsDto {
  @ApiProperty({ type: Number, description: 'Archivos por mensaje.' })
  maxFiles!: number;

  @ApiProperty({ type: Number, description: 'Tamaño máximo de una imagen, en bytes.' })
  maxImageBytes!: number;

  @ApiProperty({ type: Number, description: 'Tamaño máximo de un documento (PDF, Word, Excel), en bytes.' })
  maxDocumentBytes!: number;

  @ApiProperty({ type: Number, description: 'Tamaño máximo de un archivo de texto (CSV, Markdown, TXT), en bytes.' })
  maxTextBytes!: number;

  @ApiProperty({ type: Number, description: 'Caracteres máximos del texto extraído de un adjunto.' })
  maxTextChars!: number;

  @ApiProperty({ type: [String], description: 'Extensiones permitidas.' })
  extensions!: string[];
}

/** Disponibilidad del asistente para la persona actual. */
export class AssistantStatusDto {
  @ApiProperty({ type: Boolean, description: 'El asistente puede usarse ahora.' })
  available!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo legible (en español) cuando no está disponible; null si lo está.',
  })
  reason!: string | null;

  @ApiProperty({
    type: AttachmentLimitsDto,
    description: 'Límites de los adjuntos del chat.',
  })
  attachments!: AttachmentLimitsDto;
}

/** Resumen de una conversación para el historial. */
export class ConversationSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, description: 'Título (inicio del primer mensaje).' })
  title!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Última actividad (ISO).' })
  updatedAt!: string;
}

/** Herramienta consultada por el asistente en un turno. */
export class ToolCallDto {
  @ApiProperty({ type: String, description: 'Nombre de la herramienta del MCP.' })
  name!: string;

  @ApiProperty({ type: String, description: 'Etiqueta legible (p. ej. «solicitudes»).' })
  label!: string;

  @ApiProperty({ type: String, enum: ['done', 'error'], description: 'Resultado de la consulta.' })
  status!: 'done' | 'error';
}

/** Mensaje de una conversación. */
export class ConversationMessageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @ApiProperty({ type: String, description: 'Texto del mensaje (Markdown en el asistente).' })
  text!: string;

  @ApiProperty({ type: [ToolCallDto], description: 'Herramientas consultadas en este turno.' })
  tools!: ToolCallDto[];

  @ApiProperty({
    type: [AttachmentDto],
    description: 'Archivos que la persona adjuntó a este mensaje.',
  })
  attachments!: AttachmentDto[];

  @ApiProperty({
    type: () => [ProposalDto],
    description: 'Propuestas de acción hechas en este turno (con su estado actual).',
  })
  proposals!: ProposalDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** Estados de una propuesta de acción. */
export const PROPOSAL_STATUSES = [
  'PENDIENTE',
  'EJECUTANDO',
  'CONFIRMADA',
  'FALLIDA',
  'DESCARTADA',
  'EXPIRADA',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Propuesta de acción del asistente: nada se ejecuta hasta que la persona confirma. */
export class ProposalDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, description: 'Herramienta del MCP que se ejecutará al confirmar.' })
  toolName!: string;

  @ApiProperty({ type: String, description: 'Título de la acción (p. ej. «Crear solicitud»).' })
  title!: string;

  @ApiProperty({ type: String, description: 'Qué hará la acción, en palabras (lo escribe el asistente).' })
  summary!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Argumentos exactos con los que se ejecutará la herramienta.',
  })
  args!: Record<string, unknown>;

  @ApiProperty({ type: String, enum: PROPOSAL_STATUSES })
  status!: ProposalStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Id del registro creado o modificado, si la acción lo devolvió.',
  })
  resultId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Título o nombre del registro resultante, si lo devolvió.',
  })
  resultTitle!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo legible si la acción falló o la propuesta venció.',
  })
  error!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** Conversación completa con sus mensajes. */
export class ConversationDetailDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: [ConversationMessageDto] })
  messages!: ConversationMessageDto[];
}
