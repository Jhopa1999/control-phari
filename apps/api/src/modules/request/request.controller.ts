import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { RequestService } from './request.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestResponseDto } from './dto/request-response.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de Request (modulo `requests`, design §3.3). Accesible a los 3 roles
 * (sin @Roles extra), con alcance por proceso principal resuelto en el service.
 */
@ApiTags('requests')
@Controller('requests')
@UseGuards(CurrentUserGuard, RolesGuard)
export class RequestController {
  constructor(private readonly requestService: RequestService) {}

  @Get()
  @ApiOperation({ summary: 'Lista solicitudes dentro del alcance del actor.' })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'mainProcessId', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Listado de solicitudes.', type: [RequestResponseDto] })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  findMany(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListRequestsDto,
  ) {
    return this.requestService.findMany(actor, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene una solicitud por id (404 fuera de alcance).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Solicitud encontrada.', type: RequestResponseDto })
  @ApiResponse({ status: 404, description: 'No existe o esta fuera de alcance.' })
  findOne(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requestService.findOne(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una solicitud (estado REGISTRADA; BR-001).' })
  @ApiBody({ type: CreateRequestDto })
  @ApiResponse({ status: 201, description: 'Solicitud creada.', type: RequestResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  @ApiResponse({ status: 404, description: 'Proceso principal fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateRequestDto,
  ) {
    return this.requestService.create(actor, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Elimina lógicamente una solicitud (JEFE_AREA/LIDER_PROCESO en su alcance).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Solicitud eliminada (lógicamente).' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  @ApiResponse({ status: 409, description: 'La solicitud está en ejecución o cerrada.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requestService.remove(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita la ficha (no el estado); conserva fechas iniciales (BR-017).' })
  @ApiBody({ type: UpdateRequestDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Solicitud actualizada.', type: RequestResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos o id no UUID.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.requestService.update(actor, id, dto);
  }
}
