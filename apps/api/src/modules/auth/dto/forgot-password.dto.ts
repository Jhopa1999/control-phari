import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Cuerpo de POST /auth/forgot-password. `identifier` es el identificador
 * funcional del usuario (mismo campo que login). El endpoint responde 204
 * identico exista o no el usuario, asi que el DTO solo valida forma, no
 * existencia.
 */
export class ForgotPasswordDto {
  @ApiProperty({
    type: String,
    description: 'Identificador funcional del usuario (p. ej. email corporativo).',
    example: 'persona@demo.local',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier!: string;
}
