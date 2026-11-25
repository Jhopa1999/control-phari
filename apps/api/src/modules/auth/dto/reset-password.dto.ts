import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';


const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;


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
    description: 'Nueva contraseña en claro. El servicio aplica la política vigente (GET /auth/password-policy): longitud mínima y no ser una contraseña común.',
    example: 'nueva-contrasena-123',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newPassword!: string;
}
