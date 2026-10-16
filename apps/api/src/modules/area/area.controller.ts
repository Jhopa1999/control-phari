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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { ListAreasDto } from './dto/list-areas.dto';
import { AreaResponseDto } from './dto/area-response.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de Area (p. ej. Analitica). Lectura accesible a todos; escritura
 * solo ADMIN (rol de sistema). Las areas agrupan procesos.
 */
@ApiTags('areas')
@Controller('areas')
@UseGuards(CurrentUserGuard, RolesGuard)
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Get()
  @ApiOperation({ summary: 'Lista areas.' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Listado de areas.', type: [AreaResponseDto] })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  findMany(@Query() filters: ListAreasDto) {
    return this.areaService.findMany(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene un area por id.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Area encontrada.', type: AreaResponseDto })
  @ApiResponse({ status: 404, description: 'No existe.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.areaService.findOne(id);
  }

  @Post()
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Crea un area (solo ADMIN).' })
  @ApiBody({ type: CreateAreaDto })
  @ApiResponse({ status: 201, description: 'Area creada.', type: AreaResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'Ya existe el code.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateAreaDto,
  ) {
    return this.areaService.create(actor, dto);
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Edita name/active/sortOrder (solo ADMIN).' })
  @ApiBody({ type: UpdateAreaDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Area actualizada.', type: AreaResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos o id no UUID.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Area no encontrada.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAreaDto,
  ) {
    return this.areaService.update(actor, id, dto);
  }
}
