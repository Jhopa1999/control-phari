import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthLoginService } from './auth-login.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';

/**
 * Login de autenticacion real (modo AUTH_MODE=jwt). Ruta PUBLICA: NO lleva
 * CurrentUserGuard, porque es el punto donde el usuario obtiene el token sin
 * tener aun identidad resuelta. En modo dev-header el frontend no la usa (sigue
 * con X-Actor-Id), pero la ruta queda disponible/documentada igual.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthLoginController {
  constructor(private readonly authLoginService: AuthLoginService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica por identifier y contrasena, devuelve un JWT.' })
  @ApiResponse({ status: 200, description: 'Credenciales validas.', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales invalidas.' })
  login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    return this.authLoginService.login(dto);
  }
}
