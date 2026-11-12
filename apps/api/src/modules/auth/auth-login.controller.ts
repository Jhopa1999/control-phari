import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthLoginService } from './auth-login.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import {
  CookieRequest,
  CookieResponse,
  SessionCookieService,
} from './session-cookie.service';
import {
  CSRF_HEADER,
  hasCsrfHeader,
  readSessionCookie,
} from './session-cookie';

/** Descripcion de la cabecera Set-Cookie en el contrato. */
export const SET_COOKIE_DESCRIPTION =
  'Cookie de sesión portal_session (HttpOnly, SameSite=Lax, Path=/, Secure según COOKIE_SECURE).';

/**
 * Login de autenticacion real (modo AUTH_MODE=jwt). Ruta PUBLICA: NO lleva
 * CurrentUserGuard, porque es el punto donde el usuario obtiene el token sin
 * tener aun identidad resuelta. En modo dev-header el frontend no la usa (sigue
 * con X-Actor-Id), pero la ruta queda disponible/documentada igual.
 *
 * Ademas del cuerpo (accessToken, para Bearer: MCP, scripts), emite la cookie
 * HttpOnly de sesion que usa el navegador.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthLoginController {
  constructor(
    private readonly authLoginService: AuthLoginService,
    private readonly sessionCookie: SessionCookieService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Autentica por identifier y contraseña, devuelve un JWT y emite la cookie de sesión HttpOnly.',
  })
  @ApiResponse({
    status: 200,
    description: 'Credenciales válidas. Incluye la cabecera Set-Cookie con la sesión.',
    type: LoginResponseDto,
    headers: { 'Set-Cookie': { description: SET_COOKIE_DESCRIPTION, schema: { type: 'string' } } },
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  async login(
    @Body() dto: LoginRequestDto,
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<LoginResponseDto> {
    const session = await this.authLoginService.login(dto);
    this.sessionCookie.issue(req, res, session.accessToken);
    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Cierra la sesión del navegador borrando la cookie de sesión. Idempotente; no revoca tokens Bearer.',
  })
  @ApiHeader({
    name: CSRF_HEADER,
    required: false,
    description: 'Obligatoria (valor 1) cuando la petición trae la cookie de sesión.',
  })
  @ApiResponse({ status: 204, description: 'Cookie de sesión borrada.' })
  @ApiResponse({ status: 403, description: 'Falta la cabecera de protección CSRF con la cookie presente.' })
  logout(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): void {
    if (readSessionCookie(headers.cookie) !== undefined && !hasCsrfHeader(headers)) {
      throw new ForbiddenException('Falta la cabecera de proteccion CSRF.');
    }
    this.sessionCookie.clear(req, res);
  }
}
