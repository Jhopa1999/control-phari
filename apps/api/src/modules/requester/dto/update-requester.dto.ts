import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Entrada para editar un solicitante (nombre, area o estado activo). */
export class UpdateRequesterDto {
  @ApiPropertyOptional({ type: String, description: 'Nombre del solicitante.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Area del maestro de areas.' })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Activa o inactiva el solicitante.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
