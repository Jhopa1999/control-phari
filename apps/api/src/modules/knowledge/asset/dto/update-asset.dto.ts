import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para editar un activo (design §3.4). NO incluye `status` (se mueve
 * solo por POST /assets/:id/status) ni `processId` (no se reasigna en Fase 6).
 * Semantica PATCH: presente ⇒ debe cumplir el requerido; ausente ⇒ no se toca.
 * Si `name` esta presente, se valida como en creacion (vacio/espacios ⇒ 400).
 * `requestId`/`ownerUserId` aceptan `null` para desligar la FK.
 */
export class UpdateAssetDto {
  @ApiPropertyOptional({ type: String, description: 'Nombre del activo.', maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio.' })
  @MaxLength(300)
  name?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Solicitud de origen (null para desligar).' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  requestId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Dueno/responsable (null para desligar).' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ownerUserId?: string | null;

  @ApiPropertyOptional({ type: String, description: 'Tipo (maestra ASSET_TYPE).' })
  @IsOptional()
  @IsString()
  typeCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Tecnologia (maestra TECHNOLOGY).' })
  @IsOptional()
  @IsString()
  technologyCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Fuente (maestra SOURCE).' })
  @IsOptional()
  @IsString()
  sourceCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Frecuencia (maestra FREQUENCY).' })
  @IsOptional()
  @IsString()
  frequencyCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Referencia documental/repositorio.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  documentationRef?: string;

  @ApiPropertyOptional({ type: String, description: 'Descripcion funcional.', maxLength: 20000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20000)
  functionalDescription?: string;

  @ApiPropertyOptional({ type: String, description: 'Dependencias/observaciones.', maxLength: 20000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20000)
  dependencies?: string;
}
