import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { AiConfigService } from './ai-config.service';
import { AiConfigResponseDto } from './dto/ai-config-response.dto';
import { AiGlobalConfigResponseDto } from './dto/ai-global-config-response.dto';
import { AiAgentConfigResponseDto } from './dto/ai-agent-config-response.dto';
import { AiConnectionTestDto } from './dto/ai-connection-test.dto';
import { UpdateAiGlobalConfigDto } from './dto/update-ai-global-config.dto';
import { UpdateAiAgentConfigDto } from './dto/update-ai-agent-config.dto';

/**
 * Administracion de la configuracion de IA en runtime (IA Fase 1, FEAT-001).
 * Protegido a nivel de clase por el rol de SISTEMA ADMIN. PATCH (no PUT), como
 * SmtpConfigController. Ninguna respuesta incluye el secret ni el ciphertext.
 */
@ApiTags('admin-ai')
@Controller('admin/ai')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get('config')
  @ApiOperation({
    summary:
      'Estado de la configuracion de IA (solo ADMIN): global + agentes. Nunca incluye secretos.',
  })
  @ApiResponse({ status: 200, description: 'Estado de IA.', type: AiConfigResponseDto })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  getConfig(): Promise<AiConfigResponseDto> {
    return this.aiConfigService.getConfig();
  }

  @Patch('config')
  @ApiOperation({
    summary:
      'Actualiza la configuracion global de IA (solo ADMIN). Reglas del secret: ausente conserva, no vacio cifra, "" invalido, clearCredentials limpia.',
  })
  @ApiBody({ type: UpdateAiGlobalConfigDto })
  @ApiResponse({ status: 200, description: 'Configuracion global guardada.', type: AiGlobalConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o combinacion secret/clearCredentials no permitida.' })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  updateConfig(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: UpdateAiGlobalConfigDto,
  ): Promise<AiGlobalConfigResponseDto> {
    return this.aiConfigService.updateGlobal(actor, dto);
  }

  @Get('agents/:code')
  @ApiOperation({ summary: 'Configuracion de un agente de IA por code (solo ADMIN).' })
  @ApiParam({ name: 'code', description: 'Code del agente (p. ej. TRIAGE).' })
  @ApiResponse({ status: 200, description: 'Configuracion del agente.', type: AiAgentConfigResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Agente no encontrado.' })
  getAgent(@Param('code') code: string): Promise<AiAgentConfigResponseDto> {
    return this.aiConfigService.getAgent(code);
  }

  @Patch('agents/:code')
  @ApiOperation({
    summary: 'Actualiza un agente de IA (solo ADMIN). Valida el modelo contra el catalogo permitido.',
  })
  @ApiParam({ name: 'code', description: 'Code del agente (p. ej. TRIAGE).' })
  @ApiBody({ type: UpdateAiAgentConfigDto })
  @ApiResponse({ status: 200, description: 'Agente guardado.', type: AiAgentConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o modelo fuera del catalogo.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Agente no encontrado.' })
  updateAgent(
    @CurrentActor() actor: CurrentActorType,
    @Param('code') code: string,
    @Body() dto: UpdateAiAgentConfigDto,
  ): Promise<AiAgentConfigResponseDto> {
    return this.aiConfigService.updateAgent(actor, code, dto);
  }

  @Post('agents/:code/test')
  @ApiOperation({
    summary:
      'Prueba la conexion del agente con Bedrock (solo ADMIN). Devuelve { ok, message } sin secretos ni stack.',
  })
  @ApiParam({ name: 'code', description: 'Code del agente (p. ej. TRIAGE).' })
  @ApiResponse({ status: 201, description: 'Resultado de la prueba.', type: AiConnectionTestDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Agente no encontrado.' })
  testAgent(@Param('code') code: string): Promise<AiConnectionTestDto> {
    return this.aiConfigService.testAgent(code);
  }
}
