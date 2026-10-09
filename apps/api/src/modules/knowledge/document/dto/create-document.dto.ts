import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear un documento (design §3.4). Nace en estado BORRADOR; se
 * crea la version 1 con `content`. `title`/`content` requeridos no vacios tras
 * trim; `content` con tope de 200.000 caracteres (vacio o excedido ⇒ 400).
 */
export class CreateDocumentDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Activo del documento (requerido).' })
  @IsUUID()
  assetId!: string;

  @ApiProperty({ type: String, description: 'Titulo del documento (requerido).', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'El titulo es obligatorio.' })
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ type: String, description: 'Categoria (maestra DOC_CATEGORY).' })
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @ApiProperty({ type: String, description: 'Contenido Markdown de la version 1.', maxLength: 200000 })
  @IsString()
  @MinLength(1, { message: 'El contenido es obligatorio.' })
  @MaxLength(200000, { message: 'El contenido supera el limite de 200.000 caracteres.' })
  content!: string;
}
