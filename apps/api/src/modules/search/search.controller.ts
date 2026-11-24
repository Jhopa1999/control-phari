import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { SearchService } from './search.service';

/**
 * Búsqueda por texto de solicitudes y tareas (solo lectura). Mismo alcance de
 * lectura que `GET /codes/{code}` y `GET /requests`; el texto solo lo intersecta.
 */
@ApiTags('search')
@Controller('search')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({
    summary:
      'Busca solicitudes (código, título y solicitante) y tareas (código y título) por texto, dentro del alcance del actor. Devuelve hasta `limit` resultados por grupo, con la coincidencia exacta de código primero, y `truncated` si hay más.',
  })
  @ApiResponse({ status: 200, description: 'Resultados por grupo.', type: SearchResponseDto })
  @ApiResponse({ status: 400, description: 'Texto de 2 a 80 caracteres o límite de 1 a 20 no válidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  find(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.search.search(actor, query.q, query.limit);
  }
}
