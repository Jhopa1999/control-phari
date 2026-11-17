import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HeaderResponse, setPaginationHeaders } from '../../../common/pagination/pagination';
import { PAGINATION_RESPONSE_HEADERS } from '../../../common/pagination/pagination-openapi';
import { AssetService } from './asset.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';
import { ChangeAssetStatusDto } from './dto/change-asset-status.dto';
import { AssetResponseDto } from './dto/asset-response.dto';
import { AssetRequestHistoryItemDto } from './dto/asset-request-history-item.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de activos (design §3.2/§c). LECTURA (GET) para los 3 roles con
 * grant (`@Roles` de clase); ADMIN no figura y por tanto no accede al modulo
 * (comportamiento no modificado por este trabajo). ESCRITURA (POST/PATCH/POST
 * status) reservada al jefe de area con `@Roles(JEFE_AREA)` a nivel de handler
 * (ruta primaria de 403); el service la reafirma con `requireAssetGovernor`. El
 * alcance (404 fuera) y la maquina de estado (400 salto invalido) se aplican en
 * el service. Rutas estaticas (`/assets`) preceden a las parametricas.
 */
@ApiTags('assets')
@Controller('assets')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista activos en alcance con filtros opcionales, búsqueda q por nombre, orden sort/dir y paginación page/pageSize (take queda como alias obsoleto). Sin page, pageSize ni take devuelve el listado completo con un tope de 1000 filas. Cada fila trae el nombre y código del proceso, el responsable y la solicitud de origen. La respuesta es siempre un arreglo; el total tras filtros llega en la cabecera X-Total-Count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Activos (la página pedida o hasta 1000 filas).',
    type: [AssetResponseDto],
    headers: PAGINATION_RESPONSE_HEADERS,
  })
  @ApiResponse({ status: 400, description: 'Filtros, orden o paginación inválidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  async list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListAssetsDto,
    @Res({ passthrough: true }) res: HeaderResponse,
  ): Promise<AssetResponseDto[]> {
    const result = await this.assetService.list(actor, filters);
    setPaginationHeaders(res, result);
    return result.rows;
  }

  @Post()
  @Roles(RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Crea un activo (nace BORRADOR). Solo el jefe de area.' })
  @ApiBody({ type: CreateAssetDto })
  @ApiResponse({ status: 201, description: 'Activo creado.', type: AssetResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Solo el jefe de area puede crear.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateAssetDto,
  ) {
    return this.assetService.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un activo.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Activo.', type: AssetResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Activo fuera de alcance.' })
  get(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assetService.get(actor, id);
  }

  @Get(':id/requests')
  @ApiOperation({ summary: 'Historial de solicitudes que tienen este activo como base.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Solicitudes del activo.', type: [AssetRequestHistoryItemDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Activo fuera de alcance.' })
  listRequests(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assetService.listRequests(actor, id);
  }

  @Patch(':id')
  @Roles(RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Edita atributos de un activo (no el estado). Solo el jefe de area.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateAssetDto })
  @ApiResponse({ status: 200, description: 'Activo actualizado.', type: AssetResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Solo el jefe de area puede editar.' })
  @ApiResponse({ status: 404, description: 'Activo fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetService.update(actor, id, dto);
  }

  @Post(':id/status')
  @Roles(RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Cambia el estado de un activo (transicion valida). Solo el jefe de area.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ChangeAssetStatusDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: AssetResponseDto })
  @ApiResponse({ status: 400, description: 'Transicion no permitida.' })
  @ApiResponse({ status: 403, description: 'Solo el jefe de area puede cambiar el estado.' })
  @ApiResponse({ status: 404, description: 'Activo fuera de alcance.' })
  changeStatus(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAssetStatusDto,
  ) {
    return this.assetService.changeStatus(actor, id, dto);
  }
}
