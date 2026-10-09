import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para editar metadatos de un documento (design §3.4). NO incluye
 * `content` (eso crea una nueva version via POST /versions), `status` (solo por
 * /status) ni `assetId`. Semantica PATCH: presente ⇒ debe cumplir el
 * requerido; ausente ⇒ no se toca. `categoryCode` acepta `null` para desligar.
 */
export class UpdateDocumentDto {
  @ApiPropertyOptional({ type: String, description: 'Titulo del documento.', maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'El titulo es obligatorio.' })
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Categoria (maestra DOC_CATEGORY; null para desligar).' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  categoryCode?: string | null;
}
