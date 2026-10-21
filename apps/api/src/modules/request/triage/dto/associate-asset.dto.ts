import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Datos para crear un activo nuevo durante la asociacion en el triage
 * (FEAT-002). Replica los campos opcionales de CreateAssetDto SIN `processId`
 * (lo fija el service con el proceso principal de la solicitud) ni `requestId`
 * (la asociacion la escribe el service sobre la Request, no sobre el Asset).
 */
export class NewAssetInputDto {
  @ApiProperty({ type: String, description: 'Nombre del activo (requerido).', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio.' })
  @MaxLength(300)
  name!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Dueno/responsable (usuario).' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

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

/**
 * Entrada para asociar un activo a una solicitud en el triage (FEAT-002):
 * exactamente UNA de las dos opciones: `assetId` (activo existente, puede ser
 * de otro proceso) XOR `newAsset` (datos para crear uno nuevo bajo el proceso
 * principal). El service valida el XOR (400 si ambas o ninguna).
 */
export class AssociateAssetDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Activo existente a asociar (excluyente con newAsset).',
  })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional({
    type: NewAssetInputDto,
    description: 'Datos de un activo nuevo a crear y asociar (excluyente con assetId).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewAssetInputDto)
  newAsset?: NewAssetInputDto;
}
