import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';

/**
 * Query de listado de diarios (design §3). Filtros opcionales que se intersectan
 * con el `where` de alcance (nunca lo amplian).
 */
export class ListDailyLogsDto {
  @ApiPropertyOptional({ type: String, description: 'Filtra por dia (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por autor.' })
  @IsOptional()
  @IsUUID()
  authorUserId?: string;

  @ApiPropertyOptional({ type: String, description: 'Desde este dia inclusive (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  from?: string;

  @ApiPropertyOptional({ type: String, description: 'Hasta este dia inclusive (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  to?: string;

  @ApiPropertyOptional({ type: String, enum: ['BORRADOR', 'ENVIADO', 'REVISADO'], description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(['BORRADOR', 'ENVIADO', 'REVISADO'])
  status?: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['PLANIFICADA', 'SOPORTE', 'INTERNA', 'EXTRAORDINARIA'],
    description: 'Solo diarios con al menos una actividad de esta clasificacion.',
  })
  @IsOptional()
  @IsIn(['PLANIFICADA', 'SOPORTE', 'INTERNA', 'EXTRAORDINARIA'])
  classificationCode?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description: 'Texto a buscar en las notas del dia, el autor y la descripcion o el resultado de las actividades.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ type: String, enum: ['date_desc', 'date_asc'], description: 'Orden por fecha (por defecto, la mas reciente primero).' })
  @IsOptional()
  @IsIn(['date_desc', 'date_asc'])
  sort?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, description: 'Pagina (1-based). Por defecto 1.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, description: 'Tamano de pagina (maximo 100). Por defecto 25.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  pageSize?: number;
}
