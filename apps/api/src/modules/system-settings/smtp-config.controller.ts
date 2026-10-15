import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { SmtpConfigService } from './smtp-config.service';
import { SmtpConfigResponseDto } from './dto/smtp-config-response.dto';
import { SmtpTestRequestDto } from './dto/smtp-test-request.dto';
import { SmtpTestResultDto } from './dto/smtp-test-result.dto';
import { UpdateSmtpConfigDto } from './dto/update-smtp-config.dto';
/**
 * Administracion de la configuracion SMTP en runtime (design e). Protegido a
 * nivel de clase por el rol de SISTEMA ADMIN. PATCH (no PUT) por el CORS del
 * backend. El GET nunca devuelve el password.
 */
@ApiTags('admin-smtp')
@Controller('admin/smtp-config')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class SmtpConfigController {
  constructor(private readonly smtpConfigService: SmtpConfigService) {}
  @Get()
  @ApiOperation({
    summary:
      'Estado de la configuracion SMTP (solo ADMIN). Nunca incluye el password; devuelve passwordSet y source.',
  })
  @ApiResponse({ status: 200, description: 'Estado SMTP.', type: SmtpConfigResponseDto })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  getCurrent(): Promise<SmtpConfigResponseDto> {
    return this.smtpConfigService.getCurrent();
  }
  @Patch()
  @ApiOperation({
    summary:
      'Crea o actualiza la configuracion SMTP singleton (solo ADMIN). Reglas de password: ausente conserva, no vacio cifra, "" invalido, clearPassword limpia.',
  })
  @ApiBody({ type: UpdateSmtpConfigDto })
  @ApiResponse({ status: 200, description: 'Configuracion guardada.', type: SmtpConfigResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Datos invalidos o combinacion password/clearPassword no permitida.',
  })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: UpdateSmtpConfigDto,
  ): Promise<SmtpConfigResponseDto> {
    return this.smtpConfigService.update(actor, dto);
  }
  @Post('test')
  @ApiOperation({
    summary:
      'Envia un correo de prueba con la configuracion efectiva (BD>env). Devuelve { ok, message } sin secretos.',
  })
  @ApiBody({ type: SmtpTestRequestDto })
  @ApiResponse({ status: 200, description: 'Resultado de la prueba.', type: SmtpTestResultDto })
  @ApiResponse({ status: 400, description: 'Direccion destino invalida.' })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  test(@Body() dto: SmtpTestRequestDto): Promise<SmtpTestResultDto> {
    return this.smtpConfigService.test(dto);
  }
}
