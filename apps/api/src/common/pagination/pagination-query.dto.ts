import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from './pagination';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Sentido del orden de un listado. */
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * Parámetros comunes de los listados paginados. Todos son opcionales: sin
 * `page` ni `pageSize` el listado devuelve hasta
 * `LIST_HARD_CAP` filas como antes.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    description:
      'Número de página (desde 1). Si se envía sin pageSize, el tamaño es 25. Sin page ni pageSize se devuelve el listado completo con un tope de 1000 filas (cabecera X-Truncated).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero.' })
  @Min(1, { message: 'page debe ser 1 o mayor.' })
  @Max(100000)
  page?: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: `Filas por página (1 a ${MAX_PAGE_SIZE}). El total del listado llega en la cabecera X-Total-Count.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize debe ser un entero.' })
  @Min(1, { message: 'pageSize debe ser 1 o mayor.' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize admite como máximo ${MAX_PAGE_SIZE}.` })
  pageSize?: number;

  @ApiPropertyOptional({
    type: String,
    maxLength: 200,
    description:
      'Búsqueda por texto, sin distinguir mayúsculas. Los campos que cubre se indican en cada listado.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    enum: SORT_DIRECTIONS,
    description: 'Sentido del orden (asc o desc). Por defecto, el propio de cada listado.',
  })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS as readonly string[], { message: 'dir debe ser asc o desc.' })
  dir?: SortDirection;
}
