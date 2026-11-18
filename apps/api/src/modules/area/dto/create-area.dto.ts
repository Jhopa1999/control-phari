import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CodeFormat } from '../../../common/code-format/code-format';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear un Area (p. ej. Analitica). `code` se normaliza a
 * MAYUSCULAS en el service; `name` es el nombre legible.
 */
export class CreateAreaDto {
  @ApiProperty({
    type: String,
    description:
      'Código estable del área. Se normaliza a mayúsculas; solo admite letras mayúsculas, números y guion bajo (máximo 40 caracteres).',
    example: 'ANALITICA',
    maxLength: 40,
    pattern: '^[A-Z0-9_]+$',
  })
  @CodeFormat('code')
  code!: string;

  @ApiProperty({
    type: String,
    description: 'Nombre del area.',
    example: 'Analitica',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Orden de presentacion. Por defecto 0.',
    minimum: 0,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
