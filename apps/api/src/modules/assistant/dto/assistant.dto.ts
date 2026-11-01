import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MAX_MESSAGE_LENGTH } from '../assistant.constants';

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
    minLength: 1,
    maxLength: MAX_MESSAGE_LENGTH,
    description: 'Mensaje de la persona.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'El mensaje no puede estar vacío.' })
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`,
  })
  message!: string;
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
