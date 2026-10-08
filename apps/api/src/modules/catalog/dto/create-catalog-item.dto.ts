import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
 * Recorta espacios si el valor es string; deja el resto igual para que las
 * validaciones de tipo (@IsString) sigan reportando correctamente.
 */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear un CatalogItem.
 * `active` y `sortOrder` son opcionales: si no se envian, se usan los defaults
 * del modelo (true y 0). Se recorta (trim) antes de validar, de modo que un
 * valor de solo espacios se considere vacio y sea rechazado. El paso a
 * mayusculas de `catalog`/`code` se hace en el service.
 */
export class CreateCatalogItemDto {
  @ApiProperty({
    type: String,
    description: 'Maestra a la que pertenece la opcion (se normaliza a MAYUSCULAS).',
    example: 'PRIORITY',
    maxLength: 100,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  catalog!: string;

  @ApiProperty({
    type: String,
    description: 'Codigo estable de la opcion dentro del catalogo (se normaliza a MAYUSCULAS).',
    example: 'HIGH',
    maxLength: 100,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;

  @ApiProperty({
    type: String,
    description: 'Texto visible al usuario.',
    example: 'Alta',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label!: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Indica si la opcion esta activa. Por defecto true.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: Number,
    description: 'Orden de la opcion dentro del catalogo. Por defecto 0.',
    default: 0,
    minimum: 0,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
