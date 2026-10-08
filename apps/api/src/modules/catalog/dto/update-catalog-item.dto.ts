import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Recorta espacios si el valor es string; deja el resto igual.
 */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para actualizar un CatalogItem.
 * Solo se permiten `label`, `active` y `sortOrder`. `catalog` y `code` son
 * identificadores funcionales estables y NO se pueden modificar via PATCH
 * (si llegan, seran rechazados por el ValidationPipe con forbidNonWhitelisted).
 */
export class UpdateCatalogItemDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Texto visible al usuario.',
    example: 'Alta',
    maxLength: 255,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Indica si la opcion esta activa.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: Number,
    description: 'Orden de la opcion dentro del catalogo.',
    minimum: 0,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
