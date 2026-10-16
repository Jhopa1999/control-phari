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
import { ProcessService } from './process.service';
import { CreateProcessDto } from './dto/create-process.dto';
import { ListProcessesDto } from './dto/list-processes.dto';
import { ProcessResponseDto } from './dto/process-response.dto';
import { UpdateProcessDto } from './dto/update-process.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de Process (entidad Plano B: administracion de area). Lectura
 * accesible a todos (filtrada por alcance para no-jefe); escritura solo
 * JEFE_AREA (design 2.4 / 4.2).
 */
@ApiTags('processes')
@Controller('processes')
@UseGuards(CurrentUserGuard, RolesGuard)
export class ProcessController {
  constructor(private readonly processService: ProcessService) {}

  @Get()
  @ApiOperation({ summary: 'Lista procesos (jefe: todos; no-jefe: solo su alcance).' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'kind', required: false, enum: ['PROCESS', 'COORDINATION'] })
  @ApiResponse({ status: 200, description: 'Listado de procesos.', type: [ProcessResponseDto] })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  findMany(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListProcessesDto,
  ) {
    return this.processService.findMany(actor, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene un proceso por id (404 si fuera de alcance).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Proceso encontrado.', type: ProcessResponseDto })
  @ApiResponse({ status: 404, description: 'No existe o esta fuera de alcance.' })
  findOne(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.processService.findOne(actor, id);
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Crea un proceso (ADMIN o JEFE_AREA).' })
  @ApiBody({ type: CreateProcessDto })
  @ApiResponse({ status: 201, description: 'Proceso creado.', type: ProcessResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'Ya existe el code.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateProcessDto,
  ) {
    return this.processService.create(actor, dto);
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Edita name/framework/active/sortOrder (ADMIN o JEFE_AREA).' })
  @ApiBody({ type: UpdateProcessDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Proceso actualizado.', type: ProcessResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos o id no UUID.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Proceso no encontrado.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessDto,
  ) {
    return this.processService.update(actor, id, dto);
  }
}
