import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AreaControlService } from './area-control.service';
import { AreaControlQueryDto } from './dto/area-control-query.dto';
import {
  AreaIndicatorsResponseDto,
  DemandSummaryResponseDto,
} from './dto/area-control-response.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST del Control del area (design §5.1/§5.2), read-only. La frontera
 * lider/integrante vive en el guard de ruta (§4.1): los indicadores (SCR-01)
 * son jefe/lider (integrante -> 403); el panorama de demanda es de los 3 roles.
 * El alcance se aplica en el `where` del service.
 */
@ApiTags('area-control')
@Controller('area-control')
@UseGuards(CurrentUserGuard, RolesGuard)
export class AreaControlController {
  constructor(private readonly areaControlService: AreaControlService) {}

  @Get('indicators')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Indicadores del marco §9 para el periodo (jefe/lider).' })
  @ApiQuery({ name: 'from', required: false, example: '2025-03-01' })
  @ApiQuery({ name: 'to', required: false, example: '2025-04-01' })
  @ApiResponse({ status: 200, description: 'Indicadores del area.', type: AreaIndicatorsResponseDto })
  @ApiResponse({ status: 400, description: 'Rango de fechas invalido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (integrante).' })
  indicators(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: AreaControlQueryDto,
  ) {
    return this.areaControlService.indicators(actor, query);
  }

  @Get('demand-summary')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Panorama de demanda en alcance (3 roles).' })
  @ApiQuery({ name: 'from', required: false, example: '2025-03-01' })
  @ApiQuery({ name: 'to', required: false, example: '2025-04-01' })
  @ApiResponse({ status: 200, description: 'Panorama de demanda.', type: DemandSummaryResponseDto })
  @ApiResponse({ status: 400, description: 'Rango de fechas invalido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  demandSummary(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: AreaControlQueryDto,
  ) {
    return this.areaControlService.demandSummary(actor, query);
  }
}
