import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';
import { RECORD_STATES } from '../../record-state';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const TIME_PATTERN = /^\d{2}:\d{2}$/;

/**
 * Edicion de una reunion (design §3). `participantUserIds`, si se informa,
 * REEMPLAZA el set de participantes (limitado al alcance en el service).
 * `state` admite PATCH libre dentro de RECORD_STATE (sin grafo; §4 Meeting solo
 * modelada).
 */
export class UpdateMeetingDto {
  @ApiPropertyOptional({ type: String, description: 'Titulo.', maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ enum: RECORD_STATES, description: 'Estado (PATCH libre, sin grafo).' })
  @IsOptional()
  @IsIn(RECORD_STATES, { message: 'Estado invalido.' })
  state?: string;

  @ApiPropertyOptional({ type: String, description: 'Fecha (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  meetingDate?: string;

  @ApiPropertyOptional({ type: String, description: 'Hora HH:mm.', pattern: '^\\d{2}:\\d{2}$' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'La hora debe tener el formato HH:mm.' })
  meetingTime?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Reemplaza participantes (en alcance).' })
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
