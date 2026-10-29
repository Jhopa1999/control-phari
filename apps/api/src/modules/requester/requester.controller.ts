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
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { CreateRequesterDto } from './dto/create-requester.dto';
import { ListRequestersDto } from './dto/list-requesters.dto';
import { RequesterResponseDto } from './dto/requester-response.dto';
import { UpdateRequesterDto } from './dto/update-requester.dto';
import { RequesterService } from './requester.service';

/**
 * Maestro de solicitantes (Administracion). Lectura para cualquier usuario
 * autenticado (alimenta el desplegable de solicitudes); escritura solo ADMIN y
 * JEFE_AREA.
 */
@ApiTags('requesters')
@Controller('requesters')
@UseGuards(CurrentUserGuard, RolesGuard)
export class RequesterController {
  constructor(private readonly requesterService: RequesterService) {}

  @Get()
  @ApiOperation({ summary: 'Lista solicitantes (filtros: active, areaId).' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'areaId', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, type: [RequesterResponseDto] })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual válido.' })
  findMany(@Query() filters: ListRequestersDto) {
    return this.requesterService.findMany(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un solicitante por id.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: RequesterResponseDto })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual válido.' })
  @ApiResponse({ status: 404, description: 'No existe.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.requesterService.findOne(id);
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Crea un solicitante asociado a un área (ADMIN/JEFE_AREA).' })
  @ApiBody({ type: CreateRequesterDto })
  @ApiResponse({ status: 201, type: RequesterResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos o área inexistente/inactiva.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'Solicitante duplicado.' })
  create(@CurrentActor() actor: CurrentActorType, @Body() dto: CreateRequesterDto) {
    return this.requesterService.create(actor, dto);
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Edita o activa/inactiva un solicitante (ADMIN/JEFE_AREA).' })
  @ApiBody({ type: UpdateRequesterDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: RequesterResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'No existe.' })
  @ApiResponse({ status: 409, description: 'Solicitante duplicado.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequesterDto,
  ) {
    return this.requesterService.update(actor, id, dto);
  }
}
