import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength, IsOptional } from 'class-validator';

/** Longitud mínima y máxima del texto buscado (tras recortar espacios). */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
/** Resultados por grupo (solicitudes y tareas): defecto y tope. */
export const SEARCH_DEFAULT_LIMIT = 10;
export const SEARCH_MAX_LIMIT = 20;

/** Parámetros de `GET /search`. */
export class SearchQueryDto {
  @ApiProperty({
    type: String,
    minLength: SEARCH_MIN_LENGTH,
    maxLength: SEARCH_MAX_LENGTH,
    example: 'portal',
    description:
      'Texto a buscar (de 2 a 80 caracteres tras recortar espacios). Busca sin distinguir mayúsculas, pero distingue tildes. Solicitudes: código, título y solicitante. Tareas: código y título.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El texto a buscar es obligatorio.' })
  @MinLength(SEARCH_MIN_LENGTH, { message: 'Escribe al menos 2 caracteres para buscar.' })
  @MaxLength(SEARCH_MAX_LENGTH, { message: 'El texto a buscar admite como máximo 80 caracteres.' })
  q!: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: SEARCH_MAX_LIMIT,
    default: SEARCH_DEFAULT_LIMIT,
    description: 'Máximo de resultados por grupo (solicitudes y tareas). Por defecto 10; tope 20.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un entero.' })
  @Min(1, { message: 'El límite mínimo es 1.' })
  @Max(SEARCH_MAX_LIMIT, { message: 'El límite máximo es 20.' })
  limit?: number;
}
