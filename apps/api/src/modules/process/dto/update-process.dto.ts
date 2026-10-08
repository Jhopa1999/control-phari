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

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para actualizar un Process (design 4.3). `code` y `kind` son estables
 * y NO se pueden editar (si llegan, los rechaza el ValidationPipe).
 */
export class UpdateProcessDto {
  @ApiPropertyOptional({ type: String, description: 'Nombre del proceso.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ type: String, description: 'Marco asociado.', maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  framework?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Estado activo del proceso.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: Number, description: 'Orden de presentacion.', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
