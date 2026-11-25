import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
      'Contraseña nueva, distinta de la actual. El servicio aplica la política vigente (GET /auth/password-policy): longitud mínima y no ser una contraseña común.',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newPassword!: string;
}
