import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';
import { IsMultipleOf } from '../../is-multiple-of';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const TIME_PATTERN = /^\d{2}:\d{2}$/;

/**
 * Entrada para crear una reunion (design §3.4). Estado inicial BORRADOR (default
 * de columna). `meetingTime` como texto `HH:mm` (no fija zona). Participantes
 * N:M por `participantUserIds` (limitados al alcance en el service).
 */
export class CreateMeetingDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso de la reunion (requerido).' })
  @IsUUID()
  processId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la reunion (requerido).', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiProperty({
    type: String,
    description: 'Fecha de la reunion en formato YYYY-MM-DD.',
    example: '2025-03-10',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  meetingDate!: string;

  @ApiPropertyOptional({ type: String, description: 'Hora HH:mm (texto).', example: '14:30', pattern: '^\\d{2}:\\d{2}$' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'La hora debe tener el formato HH:mm.' })
  meetingTime?: string;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Duración en minutos (múltiplo de 15, entre 15 y 1440). Opcional en borrador; obligatoria al cerrar el acta.',
    minimum: 15,
    maximum: 1440,
    multipleOf: 15,
    example: 60,
  })
  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero de minutos.' })
  @Min(15, { message: 'La duración mínima es de 15 minutos.' })
  @Max(1440, { message: 'La duración máxima es de 24 horas.' })
  @IsMultipleOf(15, { message: 'La duración debe ir en pasos de 15 minutos.' })
  durationMinutes?: number;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Participantes (en alcance).' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  participantUserIds?: string[];

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Responsable.' })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Solicitud relacionada.' })
  @IsOptional()
  @IsUUID()
  relatedRequestId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: '"Proyecto" (Request) relacionado.' })
  @IsOptional()
  @IsUUID()
  relatedProjectRequestId?: string;

  @ApiPropertyOptional({ type: String, description: 'Agenda/temas.', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  agenda?: string;

  @ApiPropertyOptional({ type: String, description: 'Decisiones/acuerdos.', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  decisions?: string;

  @ApiPropertyOptional({ type: String, description: 'Observaciones.', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
