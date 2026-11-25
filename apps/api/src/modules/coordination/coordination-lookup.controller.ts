import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeaderResponse, TRUNCATED_HEADER } from '../../common/pagination/pagination';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { CoordinationScopeService } from './coordination-scope.service';
import {
  CoordinationRequestDto,
  ListCoordinationRequestsDto,
} from './dto/coordination-request.dto';

/** Tope de solicitudes que devuelve el selector. */
export const LINKABLE_REQUESTS_LIMIT = 200;

/**
 * Selectores de apoyo de Reuniones y compromisos. El prefijo `coordination/`
 * no colisiona con las rutas paramétricas de actas ni de compromisos.
 */
@ApiTags('coordination')
@Controller('coordination')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class CoordinationLookupController {
  constructor(private readonly scope: CoordinationScopeService) {}

  @Get('requests')
  @ApiOperation({
    summary:
      'Solicitudes y proyectos que quien consulta puede relacionar con un acta o un compromiso (la misma visibilidad que se valida al guardar), con búsqueda q por código o título. Hasta 200; la cabecera X-Truncated avisa si hubo más.',
  })
  @ApiResponse({
    status: 200,
    description: 'Solicitudes relacionables (hasta 200).',
    type: [CoordinationRequestDto],
    headers: {
      [TRUNCATED_HEADER]: {
        description: 'true si había más de 200 coincidencias.',
        schema: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Parámetro inválido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  async requests(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: ListCoordinationRequestsDto,
    @Res({ passthrough: true }) res: HeaderResponse,
  ): Promise<CoordinationRequestDto[]> {
    const result = await this.scope.listLinkableRequests(actor, query.q, LINKABLE_REQUESTS_LIMIT);
    res.setHeader(TRUNCATED_HEADER, result.truncated ? 'true' : 'false');
    return result.rows;
  }
}
