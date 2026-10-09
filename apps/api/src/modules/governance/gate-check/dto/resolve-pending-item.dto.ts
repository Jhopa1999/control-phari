import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para resolver/editar un faltante (design §5). Todos los campos son
 * opcionales: `resolved=true` cierra el faltante (fija resolvedAt en el service).
 */
export class ResolvePendingItemDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Marcar como resuelto.' })
  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @ApiPropertyOptional({ type: String, description: 'Nueva descripcion.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Responsable.' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Fecha de revision (ISO).' })
  @IsOptional()
  @IsISO8601()
  reviewDate?: string;
}
