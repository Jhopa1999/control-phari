import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Longitud minima de contrasena validada por el DTO. Es un piso fijo de forma
 * (defensa en la capa de entrada); el service re-chequea PASSWORD_MIN_LENGTH
 * (configurable por ambiente, con default igual a este valor) como fuente de
 * verdad de negocio.
 */
export const RESET_PASSWORD_MIN_LENGTH = 8;

/**
 * Cuerpo de POST /auth/reset-password. Lo usan tanto el reset de contrasena
 * como la activacion de cuenta (ambos consumen un AuthToken de un solo uso).
 * `token` es el valor en claro recibido por correo; `newPassword` es la nueva
 * contrasena en claro (se hashea con bcrypt en el backend).
 */
export class ResetPasswordDto {
  @ApiProperty({
    type: String,
    description: 'Token de un solo uso recibido por correo (reset o activacion).',
    example: 'Zm9vYmFyYmF6cXV4...',
    maxLength: 512,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @ApiProperty({
    type: String,
    description: 'Nueva contrasena en claro (minimo 8 caracteres).',
    example: 'nueva-contrasena-123',
    minLength: RESET_PASSWORD_MIN_LENGTH,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(RESET_PASSWORD_MIN_LENGTH)
  @MaxLength(255)
  newPassword!: string;
}
