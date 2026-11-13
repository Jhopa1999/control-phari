import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsMultipleOf } from '../../is-multiple-of';
import { QUARTER_HOURS_MESSAGE } from '../quarter-hours';
import { ActivityResponseDto } from './activity-response.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Tope de sugerencias que se aceptan, descartan o restauran en una sola llamada. */
export const SUGGESTION_BATCH_MAX = 50;

// --- Consulta ------------------------------------------------------------

export class SuggestionsQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Incluye también las sugerencias descartadas (para restaurarlas).',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDismissed?: boolean;
}

// --- Respuesta -----------------------------------------------------------

export class SuggestionMeetingDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Hora de inicio HH:mm.' })
  time!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Hora de fin HH:mm.' })
  endTime!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes!: number | null;

  @ApiProperty({ type: Boolean, description: 'El acta sigue en borrador (no bloquea la sugerencia).' })
  minutesOpen!: boolean;

  @ApiProperty({ type: String, format: 'uuid' })
  processId!: string;

  @ApiProperty({ type: String })
  processName!: string;

  @ApiProperty({ type: Boolean, description: 'El autor es el responsable de la reunión.' })
  responsible!: boolean;
}

export class SuggestionOccurrenceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  activityTitle!: string;

  @ApiProperty({ type: String, description: 'Fecha objetivo (YYYY-MM-DD).' })
  targetDate!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  completedAt!: Date;

  @ApiProperty({ type: String, nullable: true, description: 'Qué se realizó.' })
  completionComment!: string | null;
}

export class SuggestionTaskReasonDto {
  @ApiProperty({ type: String, enum: ['progress', 'status'] })
  field!: string;

  @ApiProperty({ type: String, nullable: true })
  from!: string | null;

  @ApiProperty({ type: String, nullable: true })
  to!: string | null;
}

export class SuggestionTaskDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  requestId!: string;

  @ApiProperty({ type: String })
  requestCode!: string;

  @ApiProperty({ type: String })
  projectTitle!: string;

  @ApiProperty({ type: [SuggestionTaskReasonDto], description: 'Cambios de avance o estado del día.' })
  reasons!: SuggestionTaskReasonDto[];
}

export class SuggestionDto {
  @ApiProperty({ type: String, description: 'Clave opaca del origen (la construye el servidor).' })
  key!: string;

  @ApiProperty({ type: String, enum: ['MEETING', 'OCCURRENCE', 'TASK'] })
  kind!: string;

  @ApiProperty({ type: String, enum: ['REUNION', 'RECURRENTE', 'PLANIFICADA'] })
  classificationCode!: string;

  @ApiProperty({ type: String, enum: ['SUGGESTED', 'DISMISSED'] })
  status!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Texto propuesto para la actividad.' })
  description!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    multipleOf: 0.25,
    description: 'Horas propuestas; null = el usuario debe indicarlas.',
  })
  suggestedHours!: number | null;

  @ApiProperty({ type: Boolean, description: 'Las horas se redondearon al 0,25 más cercano.' })
  hoursAdjusted!: boolean;

  @ApiProperty({ type: Number, nullable: true, description: 'Horas reales antes de redondear (ocurrencia).' })
  originalHours!: number | null;

  @ApiProperty({ type: Boolean, description: 'Hay que indicar las horas al aceptar.' })
  requiresHoursInput!: boolean;

  @ApiPropertyOptional({ type: SuggestionMeetingDto })
  meeting?: SuggestionMeetingDto;

  @ApiPropertyOptional({ type: SuggestionOccurrenceDto })
  occurrence?: SuggestionOccurrenceDto;

  @ApiPropertyOptional({ type: SuggestionTaskDto })
  task?: SuggestionTaskDto;
}

export class DailySuggestionsResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  dailyLogId!: string;

  @ApiProperty({ type: String, description: 'Fecha del diario (YYYY-MM-DD).' })
  date!: string;

  @ApiProperty({ type: Boolean, description: 'El diario está en borrador (se pueden aceptar sugerencias).' })
  editable!: boolean;

  @ApiProperty({ type: Number, description: 'Sugerencias pendientes (sin las descartadas).' })
  pendingCount!: number;

  @ApiProperty({ type: Number })
  dismissedCount!: number;

  @ApiProperty({ type: Number, description: 'Horas del autor en esa fecha (todos sus diarios).' })
  authorDayTotalHours!: number;

  @ApiProperty({ type: Number, description: 'Jornada diaria configurada.' })
  workdayHours!: number;

  @ApiProperty({ type: Boolean, description: 'El total del día supera la jornada (aviso).' })
  overWorkday!: boolean;

  @ApiProperty({ type: [SuggestionDto] })
  items!: SuggestionDto[];
}

// --- Aceptar / descartar / restaurar --------------------------------------

export class AcceptSuggestionItemDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 200, description: 'Clave de la sugerencia.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  key!: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0.25,
    maximum: 24,
    multipleOf: 0.25,
    description: 'Horas (ajuste). Si se omite se usan las sugeridas.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: QUARTER_HOURS_MESSAGE })
  @Min(0.25, { message: QUARTER_HOURS_MESSAGE })
  @Max(24, { message: QUARTER_HOURS_MESSAGE })
  @IsMultipleOf(0.25, { message: QUARTER_HOURS_MESSAGE })
  hours?: number;

  @ApiPropertyOptional({ type: String, maxLength: 2000, description: 'Descripción (si se omite, la propuesta).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AcceptSuggestionsDto {
  @ApiProperty({ type: [AcceptSuggestionItemDto], minItems: 1, maxItems: SUGGESTION_BATCH_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SUGGESTION_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => AcceptSuggestionItemDto)
  items!: AcceptSuggestionItemDto[];
}

export const ACCEPT_FAILURE_CODES = [
  'NO_DISPONIBLE',
  'HORAS_REQUERIDAS',
  'YA_REGISTRADA',
  'NO_ELEGIBLE',
  'HORAS_INVALIDAS',
] as const;

export class AcceptSuggestionFailureDto {
  @ApiProperty({ type: String })
  key!: string;

  @ApiProperty({ type: String, enum: ACCEPT_FAILURE_CODES })
  code!: string;

  @ApiProperty({ type: String })
  message!: string;
}

export class AcceptSuggestionsResultDto {
  @ApiProperty({ type: [ActivityResponseDto], description: 'Actividades creadas.' })
  accepted!: ActivityResponseDto[];

  @ApiProperty({ type: [AcceptSuggestionFailureDto], description: 'Sugerencias que no se pudieron aceptar.' })
  failed!: AcceptSuggestionFailureDto[];
}

export class SuggestionKeysDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: SUGGESTION_BATCH_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SUGGESTION_BATCH_MAX)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  keys!: string[];
}

export class DismissSuggestionsResultDto {
  @ApiProperty({ type: [String] })
  dismissed!: string[];
}

export class RestoreSuggestionsResultDto {
  @ApiProperty({ type: [String] })
  restored!: string[];
}
