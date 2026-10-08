import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Entrada para actualizar un User (design 4.3). `identifier` no es editable. */
export class UpdateUserDto {
  @ApiPropertyOptional({ type: String, description: 'Nombre visible.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Estado activo del usuario.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
