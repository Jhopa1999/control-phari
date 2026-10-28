import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear un activo generico (design §3.4/§e). Nace en estado
 * BORRADOR (el estado NO va en el DTO). `name` requerido no vacio tras trim.
 * `processId` es el proceso PROPIETARIO (requerido). `visibleProcessIds` define
 * los procesos ADICIONALES que pueden ver/usar el activo (el propietario se
 * considera visible siempre y se excluye del conjunto en el service). Las FK
 * del body (`requestId`/`ownerUserId`) y los procesos de visibilidad se validan
 * en el service dentro de la transaccion (400 si invalidos). Solo el jefe de
 * area puede crear (gobernanza).
 */
export class CreateAssetDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso propietario del activo (requerido).' })
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

  @ApiPropertyOptional({ type: String, description: 'Referencia documental/repositorio.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  documentationRef?: string;

  @ApiPropertyOptional({ type: String, description: 'Descripcion general del activo.', maxLength: 20000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20000)
  generalDescription?: string;

  @ApiPropertyOptional({ type: String, description: 'Dependencias/observaciones.', maxLength: 20000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20000)
  dependencies?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Procesos que pueden ver/usar el activo (ademas del propietario).',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  visibleProcessIds?: string[];
}
