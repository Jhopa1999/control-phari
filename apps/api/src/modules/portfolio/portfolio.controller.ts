import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeaderResponse, setPaginationHeaders } from '../../common/pagination/pagination';
import { PAGINATION_RESPONSE_HEADERS } from '../../common/pagination/pagination-openapi';
import { PortfolioService } from './portfolio.service';
import { ListPortfolioDto } from './dto/list-portfolio.dto';
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import { PortfolioSummaryQueryDto } from './dto/portfolio-summary-query.dto';
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary-response.dto';
import { PortfolioExecutionResponseDto } from './dto/portfolio-execution-response.dto';
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

  // Declarada antes de cualquier ruta con parámetro.
  @Get('summary')
  @ApiOperation({
    summary:
      'Contadores de la franja del portafolio (vencidas, próximas a vencer, con desviación y bloqueadas) sobre el mismo alcance y filtros que el listado (q, mainProcessId, state, band), sin alert ni paginación. Cada cifra coincide con X-Total-Count de GET /portfolio con el filtro alert correspondiente. Una iniciativa puede contar en varios grupos. Evalúa como máximo 1000 iniciativas.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contadores del alcance filtrado.',
    type: PortfolioSummaryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Filtros inválidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  summary(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: PortfolioSummaryQueryDto,
  ): Promise<PortfolioSummaryResponseDto> {
    return this.portfolioService.summary(actor, filters);
  }

  @Get(':id/execution')
  @ApiOperation({
    summary:
      'Ejecución de una iniciativa en solo lectura: estado del plan, línea base, pronóstico, desviación, avance y fases con sus tareas (código, título, estado, avance, fechas, responsable). Para quien tiene Portafolio, sin exigir el módulo de Planificación. Mismo alcance que Solicitudes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Ejecución de la iniciativa (sin plan: hasPlan false y fases vacías).',
    type: PortfolioExecutionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'El id no es un UUID.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'No existe o está fuera de alcance.' })
  execution(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortfolioExecutionResponseDto> {
    return this.portfolioService.execution(actor, id);
  }
}
