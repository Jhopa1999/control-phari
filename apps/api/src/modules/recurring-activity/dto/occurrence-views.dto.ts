import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Recurrence } from '../recurrence';
import { OCCURRENCE_SCOPES, OccurrenceScope } from './list-occurrences.dto';
import { OccurrenceResponseDto } from './occurrence-response.dto';

/** Semanas de completadas que admite el tablero (0 = todas). */
export const BOARD_COMPLETED_WEEKS = [0, 4, 12] as const;

/** Consulta del tablero "Que me toca" (siempre alcance mine). */
export class BoardQueryDto {
  @ApiPropertyOptional({
    type: Number,
    enum: BOARD_COMPLETED_WEEKS,
    description: 'Semanas de completadas a incluir: 4 (por defecto), 12 o 0 (todas).',
    default: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(BOARD_COMPLETED_WEEKS)
  completedWeeks?: number;
}

/** Semana ISO en curso (zona del config). */
export class BoardWeekDto {
  @ApiProperty({ type: Number, description: 'Anio ISO de la semana.' })
  isoYear!: number;

  @ApiProperty({ type: Number, description: 'Numero de semana ISO (1-53).' })
  number!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Lunes de la semana (dia de calendario).' })
  startDate!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Domingo de la semana (dia de calendario).' })
  endDate!: Date;
}

/** Contadores de la cabecera del tablero. */
export class BoardCountsDto {
  @ApiProperty({ type: Number, description: 'Ocurrencias vencidas.' })
  overdue!: number;

  @ApiProperty({ type: Number, description: 'Ocurrencias que vencen hoy.' })
  dueToday!: number;

  @ApiProperty({ type: Number, description: 'Ocurrencias de la semana en curso (abiertas).' })
  thisWeek!: number;
}

/** Tablero agrupado de las ocurrencias del actor (regla de agrupamiento en backend). */
export class OccurrenceBoardResponseDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'Dia de hoy (zona del config).' })
  today!: Date;

  @ApiProperty({ type: BoardWeekDto, description: 'Semana ISO en curso.' })
  week!: BoardWeekDto;

  @ApiProperty({ type: BoardCountsDto })
  counts!: BoardCountsDto;

  @ApiProperty({ type: Number, description: 'Suma de horas estimadas de las ocurrencias abiertas de la semana.' })
  plannedHoursThisWeek!: number;

  @ApiProperty({ type: [OccurrenceResponseDto], description: 'Vencidas (de la mas antigua a la mas reciente).' })
  overdue!: OccurrenceResponseDto[];

  @ApiProperty({ type: [OccurrenceResponseDto], description: 'Abiertas con dia objetivo en la semana en curso.' })
  thisWeek!: OccurrenceResponseDto[];

  @ApiProperty({ type: [OccurrenceResponseDto], description: 'Abiertas con dia objetivo posterior a la semana en curso.' })
  upcoming!: OccurrenceResponseDto[];

  @ApiProperty({ type: [OccurrenceResponseDto], description: 'Completadas dentro de las semanas pedidas (la mas reciente primero).' })
  completed!: OccurrenceResponseDto[];
}

/** Consulta del calendario: rango de fechas (maximo 62 dias) y alcance. */
export class CalendarQueryDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'Dia objetivo desde (inclusive).' })
  @IsDateString()
  from!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Dia objetivo hasta (inclusive). El rango admite 62 dias como maximo.' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({
    enum: OCCURRENCE_SCOPES,
    description: 'Alcance: "mine" (por defecto) o "all" (solo jefe/admin).',
    default: 'mine',
  })
  @IsOptional()
  @IsIn(OCCURRENCE_SCOPES)
  scope?: OccurrenceScope;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por usuario responsable de la definicion.' })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por area responsable de la definicion.' })
  @IsOptional()
  @IsUUID()
  responsibleAreaId?: string;
}

/** Ocurrencias del actor que ya se pueden trabajar (alimenta "Mi trabajo"). */
export class MyWorkOccurrencesResponseDto {
  @ApiProperty({ type: [OccurrenceResponseDto], description: 'Vencidas, vence hoy, en curso y pendientes con ventana abierta.' })
  items!: OccurrenceResponseDto[];

  @ApiProperty({ type: Number, description: 'Cantidad de elementos.' })
  total!: number;
}

/** Consulta de la vista previa de fechas de una recurrencia. */
export class PreviewQueryDto {
  @ApiProperty({ enum: Recurrence, description: 'Cadencia de la recurrencia.' })
  @IsEnum(Recurrence)
  cadence!: Recurrence;

  @ApiPropertyOptional({ type: Number, description: 'Cada cuantos periodos se repite (>= 1). Por defecto 1.', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  intervalCount?: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Primer dia objetivo / ancla de la cadencia.' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fin opcional de la recurrencia (inclusive).' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Dias de preparacion. Por defecto 2 (SEMANAL) o 5 (resto).',
    minimum: 0,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  prepDays?: number;
}

/** Una fecha de la vista previa. */
export class PreviewDateDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'Dia objetivo.' })
  targetDate!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Dia desde el que se habilita (targetDate - prepDays).' })
  opensOn!: Date;
}

/** Proximas fechas de una recurrencia (vista previa del formulario). */
export class RecurrencePreviewResponseDto {
  @ApiProperty({ type: [PreviewDateDto], description: 'Hasta 3 proximas fechas desde hoy.' })
  dates!: PreviewDateDto[];
}
