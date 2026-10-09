import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Cuerpo de POST /auth/login. El ValidationPipe global (app.config.ts) aplica
 * whitelist + forbidNonWhitelisted, asi que solo se aceptan estos dos campos y
 * ambos deben ser cadenas no vacias.
 */
export class LoginRequestDto {
  @ApiProperty({ type: String, description: 'Identificador funcional del usuario.', example: 'jefe@demo.local' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ type: String, description: 'Contrasena del usuario.', example: 'dev1234' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
