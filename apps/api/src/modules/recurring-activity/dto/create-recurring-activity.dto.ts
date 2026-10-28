import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Recurrence } from '../recurrence';
import { ResponsibleKind } from '../responsible-kind';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear una DEFINICION de actividad recurrente (FEAT-002, design
 * §2). `title`, `activityType`, `cadence`, `startDate` y `responsibleKind` son
 * obligatorios. Las reglas cruzadas ("exactamente un responsable",
 * activityType existente/activo en CatalogItem, alcance de area) las aplica el
 * service -> 400/403/404/409. Nunca se expone el modelo Prisma crudo.
 */
export class CreateRecurringActivityDto {
  @ApiProperty({ type: String, description: 'Titulo de la actividad.', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ type: String, description: 'Descripcion/alcance.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({
    type: String,
    description: 'Tipo de actividad (catalogo RECURRING_ACTIVITY_TYPE, p. ej. REPORTE).',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  activityType!: string;

  @ApiProperty({ enum: Recurrence, description: 'Cadencia logica de la recurrencia.' })
  @IsEnum(Recurrence)
  cadence!: Recurrence;

  @ApiPropertyOptional({
    type: Number,
    description: 'Cada cuantos periodos se repite (>= 1). Por defecto 1.',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  intervalCount?: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Primer dia objetivo / ancla de la cadencia (dia de calendario).',
  })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Fin opcional de la recurrencia (inclusive). Null/omitido = sin fin.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Dias de anticipacion propios; si se omite, el motor usa el default de ENV.',
    minimum: 0,
    maximum: 3650,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  anticipationDays?: number;

  @ApiProperty({ enum: ResponsibleKind, description: 'Tipo de responsable: USER o AREA.' })
  @IsEnum(ResponsibleKind)
  responsibleKind!: ResponsibleKind;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Usuario responsable (requerido si responsibleKind=USER).',
  })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Area responsable (requerida si responsibleKind=AREA).',
  })
  @IsOptional()
  @IsUUID()
  responsibleAreaId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Si false, el motor no genera nuevas ocurrencias (pausa sin borrar). Por defecto true.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
