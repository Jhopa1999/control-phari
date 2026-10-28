import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { OccurrenceStatus } from '../occurrence-status';

/** Alcance de la consulta de ocurrencias. */
export const OCCURRENCE_SCOPES = ['mine', 'all'] as const;
export type OccurrenceScope = (typeof OCCURRENCE_SCOPES)[number];

/**
 * Filtros y paginacion de GET /recurring-activities/occurrences (FEAT-002).
 * `scope` por defecto 'mine' (lo que le toca al actor); 'all' solo lo admiten
 * JEFE_AREA/ADMIN y el service lo acota al area del jefe. Los filtros
 * opcionales INTERSECTAN el alcance, nunca lo amplian. pageSize acotado a 100.
 */
export class ListOccurrencesDto {
  @ApiPropertyOptional({
    enum: OCCURRENCE_SCOPES,
    description: 'Alcance: "mine" (por defecto) o "all" (solo jefe/admin).',
    default: 'mine',
  })
  @IsOptional()
  @IsIn(OCCURRENCE_SCOPES)
  scope?: OccurrenceScope;

  @ApiPropertyOptional({ enum: OccurrenceStatus, description: 'Filtra por estado de la ocurrencia.' })
  @IsOptional()
  @IsEnum(OccurrenceStatus)
  status?: OccurrenceStatus;

  @ApiPropertyOptional({ enum: Recurrence, description: 'Filtra por cadencia de la definicion.' })
  @IsOptional()
  @IsEnum(Recurrence)
  cadence?: Recurrence;

  @ApiPropertyOptional({ type: String, description: 'Filtra por tipo de actividad (catalogo).' })
  @IsOptional()
  activityType?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Dia objetivo desde (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Dia objetivo hasta (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Filtra por usuario responsable de la definicion (scope=all).',
  })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Filtra por area responsable de la definicion (scope=all).',
  })
  @IsOptional()
  @IsUUID()
  responsibleAreaId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Pagina a devolver (1-based). Por defecto 1.',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Tamano de pagina. Por defecto 25; el servidor lo acota a 100.',
    minimum: 1,
    maximum: 100,
    default: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
