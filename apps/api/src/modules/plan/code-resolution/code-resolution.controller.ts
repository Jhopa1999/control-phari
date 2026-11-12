import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';
import { CodeResolutionService } from './code-resolution.service';
import { CodeResolutionDto, PhaseByCodeDto } from './dto/code-resolution.dto';

/**
 * Resolución de IDs visibles (solo lectura). Mismo alcance que el detalle por
 * id de la solicitud; 404 único para inexistente y fuera de alcance. La forma
 * corta (T07, F2) no se acepta: sin proyecto en contexto sería ambigua.
 */
@ApiTags('codes')
@Controller()
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class CodeResolutionController {
  constructor(private readonly codeResolution: CodeResolutionService) {}

  @Get('codes/:code')
  @ApiOperation({
    summary:
      'Resuelve un ID visible (PRY-0012, PRY-0012-F2 o PRY-0012-T07, sin distinguir mayúsculas) y devuelve su tipo, id, título y datos para navegar.',
  })
  @ApiParam({ name: 'code', example: 'PRY-0012-T07', description: 'ID visible en su forma completa.' })
  @ApiResponse({ status: 200, description: 'Elemento encontrado.', type: CodeResolutionDto })
  @ApiResponse({ status: 400, description: 'Formato de código no válido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'El código no existe o está fuera de alcance.' })
  resolve(@CurrentActor() actor: CurrentActorType, @Param('code') code: string) {
    return this.codeResolution.resolve(actor, code);
  }

  @Get('plan-phases/by-code/:code')
  @ApiOperation({
    summary:
      'Detalle de una fase a partir de su ID visible (p. ej. PRY-0012-F2), sin distinguir mayúsculas. Mismo alcance que la solicitud del plan.',
  })
  @ApiParam({ name: 'code', example: 'PRY-0012-F2', description: 'ID visible de la fase.' })
  @ApiResponse({ status: 200, description: 'Fase encontrada.', type: PhaseByCodeDto })
  @ApiResponse({ status: 400, description: 'El código no tiene formato de fase.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Fase inexistente o fuera de alcance.' })
  findPhaseByCode(@CurrentActor() actor: CurrentActorType, @Param('code') code: string) {
    return this.codeResolution.findPhaseByCode(actor, code);
  }
}
