import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PortfolioService } from './portfolio.service';
import { ListPortfolioDto } from './dto/list-portfolio.dto';
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST del portafolio (design §5.3, SCR-07), read-only. Los 3 roles tienen
 * la pantalla; el alcance se aplica en el `where` del service (jefe `{}`; resto
 * `mainProcessId ∈ scopedProcessIds`). Los filtros intersectan el alcance.
 */
@ApiTags('portfolio')
@Controller('portfolio')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  @ApiOperation({ summary: 'Listado del portafolio en alcance (filtros opcionales).' })
  @ApiQuery({ name: 'mainProcessId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'band', required: false, example: 'P1' })
  @ApiResponse({ status: 200, description: 'Iniciativas del portafolio.', type: [PortfolioItemResponseDto] })
  @ApiResponse({ status: 400, description: 'Filtros invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListPortfolioDto,
  ) {
    return this.portfolioService.list(actor, filters);
  }
}
