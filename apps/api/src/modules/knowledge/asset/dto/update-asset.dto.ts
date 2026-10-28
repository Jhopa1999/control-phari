import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
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
 * Entrada para editar un activo generico (design §3.4/§e). NO incluye `status`
 * (se mueve solo por POST /assets/:id/status) ni `processId` (el propietario no
 * se reasigna). Semantica PATCH: presente ⇒ debe cumplir el requerido; ausente
 * ⇒ no se toca. Si `name` esta presente, se valida como en creacion. Si
 * `visibleProcessIds` esta presente, REEMPLAZA el conjunto de visibilidad
 * (`[]` ⇒ el activo solo queda visible para su propietario); ausente ⇒ no se
 * toca. `requestId`/`ownerUserId` aceptan `null` para desligar la FK. Solo el
 * jefe de area puede editar (gobernanza).
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
    description: 'Procesos que pueden ver/usar el activo (reemplaza el conjunto; [] = solo propietario).',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  visibleProcessIds?: string[];
}
