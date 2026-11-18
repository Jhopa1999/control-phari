import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { RESET_PASSWORD_MIN_LENGTH } from '../password-policy';

/** Cuerpo de POST /auth/change-password. */
export class ChangePasswordDto {
  @ApiProperty({
    type: String,
    description: 'Contraseña actual de la persona.',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  currentPassword!: string;

  @ApiProperty({
    type: String,
    description:
      'Contraseña nueva (mínimo 8 caracteres, o PASSWORD_MIN_LENGTH si es mayor) y distinta de la actual.',
    minLength: RESET_PASSWORD_MIN_LENGTH,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(RESET_PASSWORD_MIN_LENGTH)
  @MaxLength(255)
  newPassword!: string;
}
