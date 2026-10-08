import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear un User (design 4.3). `identifier` es un identificador
 * funcional (no credencial): se valida como string no vacio, NO como email,
 * para no imponer un formato que el SDD no exige.
 */
export class CreateUserDto {
  @ApiProperty({
    type: String,
    description: 'Identificador funcional unico (p. ej. email corporativo).',
    example: 'persona@demo.local',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier!: string;

  @ApiProperty({
    type: String,
    description: 'Nombre visible.',
    example: 'Persona Demo',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
