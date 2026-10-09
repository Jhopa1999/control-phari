import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AssetService } from './asset.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';
import { ChangeAssetStatusDto } from './dto/change-asset-status.dto';
import { AssetResponseDto } from './dto/asset-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de activos (design §3.2). Los 3 roles tienen el modulo; el alcance
 * (404 fuera), la autoridad por rol (403) y la maquina de estado (400 salto
 * invalido) se aplican en el service. Rutas estaticas (`/assets`) preceden a
 * las parametricas (`/assets/:id`, `/assets/:id/status`).
 */
@ApiTags('assets')
@Controller('assets')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Get()
  @ApiOperation({ summary: 'Lista activos en alcance (filtros opcionales).' })
  @ApiResponse({ status: 200, description: 'Activos.', type: [AssetResponseDto] })
  @ApiResponse({ status: 400, description: 'Filtros invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListAssetsDto,
  ) {
    return this.assetService.list(actor, filters);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un activo (nace BORRADOR; integrante solo propone).' })
  @ApiBody({ type: CreateAssetDto })
  @ApiResponse({ status: 201, description: 'Activo creado.', type: AssetResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Proceso fuera de alcance.' })
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

  @Patch(':id')
  @ApiOperation({ summary: 'Edita atributos de un activo (no el estado).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateAssetDto })
  @ApiResponse({ status: 200, description: 'Activo actualizado.', type: AssetResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Activo fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetService.update(actor, id, dto);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Cambia el estado de un activo (transicion valida).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ChangeAssetStatusDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: AssetResponseDto })
  @ApiResponse({ status: 400, description: 'Transicion no permitida.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Activo fuera de alcance.' })
  changeStatus(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAssetStatusDto,
  ) {
    return this.assetService.changeStatus(actor, id, dto);
  }
}
