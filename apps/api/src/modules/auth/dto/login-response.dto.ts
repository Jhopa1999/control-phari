import { ApiProperty } from '@nestjs/swagger';

/** Datos minimos del usuario que devuelve el login (sin credenciales). */
export class LoginUserDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id del usuario.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre visible del usuario.', example: 'Ana Jefa' })
  name!: string;

  @ApiProperty({ type: String, description: 'Identificador funcional.', example: 'jefe@demo.local' })
  identifier!: string;
}

/**
 * Respuesta de POST /auth/login. El cliente usa `accessToken` como bearer en el
 * header Authorization de las peticiones protegidas.
 */
export class LoginResponseDto {
  @ApiProperty({ type: String, description: 'JWT firmado para autenticar peticiones.' })
  accessToken!: string;

  @ApiProperty({ type: String, description: 'Vigencia del token (formato de @nestjs/jwt).', example: '8h' })
  expiresIn!: string;

  @ApiProperty({ type: LoginUserDto, description: 'Usuario autenticado.' })
  user!: LoginUserDto;
}
