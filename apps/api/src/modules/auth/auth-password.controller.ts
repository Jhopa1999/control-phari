import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AllowPasswordChangePending } from './allow-password-change-pending.decorator';
import { AuthPasswordService } from './auth-password.service';
import { CurrentActor } from './current-actor.decorator';
import { CurrentActor as CurrentActorType } from './current-actor';
import { CurrentUserGuard } from './current-user.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CookieRequest, CookieResponse } from './session-cookie.service';
import { CSRF_HEADER } from './session-cookie';
import { TooManyAttemptsException } from './too-many-attempts.exception';

/**
 * Cambio de contraseña de la sesión actual. Con el indicador
 * `mustChangePassword` activo es, junto con `GET /me/permissions`, la única
 * ruta autenticada permitida (decorador en el método).
 */
@ApiTags('auth')
@Controller('auth')
@UseGuards(CurrentUserGuard)
export class AuthPasswordController {
  constructor(private readonly authPasswordService: AuthPasswordService) {}

  @Post('change-password')
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Cambia la contraseña de la persona autenticada (exige la actual) y limpia la exigencia de cambio obligatorio.',
  })
  @ApiHeader({
    name: CSRF_HEADER,
    required: false,
    description: 'Obligatoria (valor 1) cuando la petición llega por la cookie de sesión.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 204, description: 'Contraseña actualizada.' })
  @ApiResponse({
    status: 400,
    description: 'Contraseña actual incorrecta, nueva demasiado corta o igual a la actual.',
  })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual válido.' })
  @ApiResponse({ status: 403, description: 'Falta la cabecera de protección CSRF.' })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos fallidos. La cabecera Retry-After indica los segundos de espera.',
    headers: {
      'Retry-After': { description: 'Segundos hasta poder reintentar.', schema: { type: 'integer' } },
    },
  })
  async changePassword(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: ChangePasswordDto,
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<void> {
    try {
      await this.authPasswordService.changePassword(actor, dto, req.ip);
    } catch (err) {
      if (err instanceof TooManyAttemptsException) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }
  }
}
