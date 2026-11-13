import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';
import { ACTIVITY_CLASS_CODES } from '../../catalog-codes';
import { RECORD_STATES } from '../../record-state';
import { IsMultipleOf } from '../../is-multiple-of';
import { QUARTER_HOURS_MESSAGE } from '../quarter-hours';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para agregar una actividad a un diario (design §3.4). `hours` es
 * OPCIONAL (columna `@default(0)`, Finding 4); si se informa, entero `>= 0`. Las
 * reglas condicionales por clasificacion (AC-014/015/016) y la visibilidad de
 * la elegibilidad de projectRequestId/taskId (alcance 404; estado, proceso del
 * diario, responsable y coherencia 400) se validan en el service (§2.3), no solo aqui.
 * 
elatedIssueId ya no existe: el ValidationPipe global (forbidNonWhitelisted)
 * lo rechaza con 400. `evidenceUrl` es texto libre `<= 2000` SIN
 * `@IsUrl` (MEDIUM-3/§11 D3).
 */
export class CreateActivityDto {
  @ApiProperty({
    enum: ACTIVITY_CLASS_CODES,
    description: 'Clasificacion de la actividad (maestra ACTIVITY_CLASS).',
    example: 'PLANIFICADA',
  })
  @IsIn(ACTIVITY_CLASS_CODES, { message: 'Clasificacion de actividad invalida.' })
  classificationCode!: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Horas de dedicacion (0,25 a 24 en pasos de 0,25). No afecta el avance de la tarea (BR-013).',
    minimum: 0.25,
    maximum: 24,
    multipleOf: 0.25,
    example: 4,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: QUARTER_HOURS_MESSAGE })
  @Min(0.25, { message: QUARTER_HOURS_MESSAGE })
  @Max(24, { message: QUARTER_HOURS_MESSAGE })
  @IsMultipleOf(0.25, { message: QUARTER_HOURS_MESSAGE })
  hours?: number;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: '"Proyecto" (Request) planificado.' })
  @IsOptional()
  @IsUUID()
  projectRequestId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Tarea planificada.' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({ type: String, description: 'Activo (texto, para soporte).', maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  assetRef?: string;

  @ApiPropertyOptional({ type: String, description: 'Solicitante (texto, para extraordinaria).', maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  requesterRef?: string;

  @ApiPropertyOptional({ type: String, description: 'Justificacion (texto, para extraordinaria).', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  justification?: string;

  @ApiPropertyOptional({ type: String, description: 'Descripcion del trabajo.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: String, description: 'Resultado.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  result?: string;

  @ApiPropertyOptional({ type: String, description: 'Siguiente paso.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  nextStep?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Fecha del siguiente paso en formato YYYY-MM-DD.',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  nextStepDate?: string;

  @ApiPropertyOptional({ type: String, description: 'Evidencia como texto libre (URL u otra).', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  evidenceUrl?: string;

  @ApiPropertyOptional({
    enum: RECORD_STATES,
    description: 'Estado de la actividad (opcional, maestra RECORD_STATE).',
  })
  @IsOptional()
  @IsIn(RECORD_STATES, { message: 'Estado de actividad invalido.' })
  activityStatus?: string;
}
