import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthResetService } from './auth-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/**
 * Flujos de credencial por correo. Rutas PUBLICAS: NO llevan CurrentUserGuard,
 * porque quien solicita un reset o activa su cuenta aun no tiene identidad
 * resuelta (igual que auth-login.controller).
 *
 * POST /auth/reset-password sirve tanto para reestablecer la contrasena como
 * para activar una cuenta invitada: ambos consumen un AuthToken de un solo uso
 * (purpose PASSWORD_RESET o USER_INVITATION), por lo que /activar-cuenta en el
 * frontend reutiliza este mismo endpoint.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthResetController {
  constructor(private readonly authResetService: AuthResetService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Solicita el reestablecimiento de contrasena. Responde 204 exista o no el usuario (no revela existencia).',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 204, description: 'Solicitud recibida (respuesta identica exista o no el usuario).' })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.authResetService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Define una nueva contrasena consumiendo un token de reset o de activacion de cuenta.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 204, description: 'Contrasena actualizada.' })
  @ApiResponse({ status: 400, description: 'Token invalido o contrasena demasiado corta.' })
  @ApiResponse({ status: 410, description: 'Token caducado o ya utilizado.' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authResetService.resetPassword(dto);
  }
}
