import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { HelpSearchQueryDto, HelpSearchResponseDto } from './dto/help.dto';
import { HelpService } from './help.service';

/** Cantidad de secciones por defecto. */
const DEFAULT_LIMIT = 4;

/**
 * Ayuda del portal: busca en la documentación de uso. Accesible a cualquier
 * persona autenticada; la documentación no contiene datos de negocio.
 */
@ApiTags('help')
@Controller('help')
@UseGuards(CurrentUserGuard, RolesGuard)
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Get('search')
  @ApiOperation({
    summary:
      'Busca en la documentación de uso del portal (pantallas, roles y permisos, flujo de trabajo) las secciones que responden una pregunta.',
  })
  @ApiResponse({ status: 200, description: 'Secciones relevantes.', type: HelpSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Consulta vacía o demasiado corta.' })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  search(@Query() query: HelpSearchQueryDto): Promise<HelpSearchResponseDto> {
    return this.help.search(query.q, query.limit ?? DEFAULT_LIMIT);
  }
}
