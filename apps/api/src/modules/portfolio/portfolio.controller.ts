import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeaderResponse, setPaginationHeaders } from '../../common/pagination/pagination';
import { PAGINATION_RESPONSE_HEADERS } from '../../common/pagination/pagination-openapi';
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
 * la pantalla; el alcance se aplica en el `where` del service y es el MISMO de
 * Solicitudes (`RequestScopeService`): jefe y líder ven todas; el integrante, sus
 * procesos más las que creó. Los filtros intersectan el alcance.
 */
@ApiTags('portfolio')
@Controller('portfolio')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listado del portafolio en alcance, el mismo que Solicitudes: jefe y líder ven todas; el integrante, sus procesos más las que creó. Filtros opcionales de selección múltiple (OR dentro de un filtro, AND entre filtros), búsqueda q en código y título, orden sort/dir y paginación page/pageSize. Sin page ni pageSize devuelve el listado completo con un tope de 1000 filas. La respuesta es siempre un arreglo; el total tras filtros llega en la cabecera X-Total-Count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Iniciativas del portafolio (la página pedida o hasta 1000 filas).',
    type: [PortfolioItemResponseDto],
    headers: PAGINATION_RESPONSE_HEADERS,
  })
  @ApiResponse({ status: 400, description: 'Filtros, orden o paginación inválidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  async list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListPortfolioDto,
    @Res({ passthrough: true }) res: HeaderResponse,
  ): Promise<PortfolioItemResponseDto[]> {
    const result = await this.portfolioService.list(actor, filters);
    setPaginationHeaders(res, result);
    return result.rows;
  }
}
