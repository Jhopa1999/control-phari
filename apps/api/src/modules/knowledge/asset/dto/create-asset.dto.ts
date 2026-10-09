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
 * Entrada para crear un activo (design §3.4). Nace en estado BORRADOR (el
 * estado NO va en el DTO). `name` requerido no vacio tras trim. Las FK del body
 * (`requestId`/`ownerUserId`) y los codigos de maestra se validan en el service
 * dentro de la transaccion (400 si invalidos).
 */
export class CreateAssetDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del activo (requerido).' })
  @IsUUID()
  processId!: string;

  @ApiProperty({ type: String, description: 'Nombre del activo (requerido).', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio.' })
  @MaxLength(300)
  name!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Solicitud de origen.' })
  @IsOptional()
  @IsUUID()
  requestId?: string;

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
