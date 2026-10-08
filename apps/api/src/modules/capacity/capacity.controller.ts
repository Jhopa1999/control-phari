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
import { CapacityService } from './capacity.service';
import { CapacityScopeService } from './capacity-scope.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { ListAvailabilityDto } from './dto/list-availability.dto';
import { ListAssignmentsDto } from './dto/list-assignments.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';
import { AssignmentResponseDto } from './dto/assignment-response.dto';
import { CapacityPersonDto } from './dto/capacity-person.dto';
import { CapacitySummaryRowDto } from './dto/capacity-summary-row.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de capacidad (modulo `capacity`, design §3.3). Los 3 roles tienen el
 * modulo (`@Roles` = JEFE_AREA/LIDER_PROCESO/INTEGRANTE); la diferencia de que
 * puede tocar cada uno se aplica por ALCANCE en el service (403 rol / 404
 * alcance / 409 duplicado). Rutas estaticas (summary/people/availability/
 * assignments) no colisionan con las parametricas `:id` que cuelgan de
 * availability/assignments.
 */
@ApiTags('capacity')
@Controller('capacity')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class CapacityController {
  constructor(
    private readonly capacityService: CapacityService,
    private readonly scopeService: CapacityScopeService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen de carga por persona para un mes (en alcance).' })
  @ApiQuery({ name: 'month', required: true, example: '2025-03' })
  @ApiResponse({ status: 200, description: 'Resumen de carga.', type: [CapacitySummaryRowDto] })
  @ApiResponse({ status: 400, description: 'Mes mal formado o ausente.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  summary(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: SummaryQueryDto,
  ) {
    return this.capacityService.summary(actor, query);
  }

  @Get('people')
  @ApiOperation({ summary: 'Personas en alcance para los selectores de SCR-17.' })
  @ApiResponse({ status: 200, description: 'Personas visibles.', type: [CapacityPersonDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  people(@CurrentActor() actor: CurrentActorType) {
    return this.scopeService.listPeople(actor);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Disponibilidades del mes en alcance.' })
  @ApiQuery({ name: 'month', required: true, example: '2025-03' })
  @ApiResponse({ status: 200, description: 'Disponibilidades.', type: [AvailabilityResponseDto] })
  @ApiResponse({ status: 400, description: 'Mes mal formado o ausente.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  listAvailability(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListAvailabilityDto,
  ) {
    return this.capacityService.listAvailability(actor, filters);
  }

  @Post('availability')
  @ApiOperation({ summary: 'Registra disponibilidad de una persona para un mes.' })
  @ApiBody({ type: CreateAvailabilityDto })
  @ApiResponse({ status: 201, description: 'Disponibilidad creada.', type: AvailabilityResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Integrante registrando capacidad ajena.' })
  @ApiResponse({ status: 404, description: 'Persona fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Ya existe disponibilidad para esa persona y mes.' })
  createAvailability(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateAvailabilityDto,
  ) {
    return this.capacityService.createAvailability(actor, dto);
  }

  @Patch('availability/:id')
  @ApiOperation({ summary: 'Edita las horas disponibles de una disponibilidad.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateAvailabilityDto })
  @ApiResponse({ status: 200, description: 'Disponibilidad actualizada.', type: AvailabilityResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o id no UUID.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Disponibilidad fuera de alcance.' })
  updateAvailability(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.capacityService.updateAvailability(actor, id, dto);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Asignaciones del mes en alcance (filtros opcionales).' })
  @ApiQuery({ name: 'month', required: true, example: '2025-03' })
  @ApiQuery({ name: 'processId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'requestId', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Asignaciones.', type: [AssignmentResponseDto] })
  @ApiResponse({ status: 400, description: 'Mes mal formado o ausente.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  listAssignments(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListAssignmentsDto,
  ) {
    return this.capacityService.listAssignments(actor, filters);
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Crea una asignacion de horas (proceso requerido).' })
  @ApiBody({ type: CreateAssignmentDto })
  @ApiResponse({ status: 201, description: 'Asignacion creada.', type: AssignmentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Integrante asignando capacidad ajena.' })
  @ApiResponse({ status: 404, description: 'Proceso/persona/solicitud fuera de alcance.' })
  createAssignment(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.capacityService.createAssignment(actor, dto);
  }

  @Patch('assignments/:id')
  @ApiOperation({ summary: 'Edita una asignacion (proceso/solicitud/horas/descripcion).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateAssignmentDto })
  @ApiResponse({ status: 200, description: 'Asignacion actualizada.', type: AssignmentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o id no UUID.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Asignacion/proceso/solicitud fuera de alcance.' })
  updateAssignment(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.capacityService.updateAssignment(actor, id, dto);
  }

  @Delete('assignments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra una asignacion en alcance (204 sin body).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Asignacion borrada.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Asignacion fuera de alcance.' })
  removeAssignment(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.capacityService.removeAssignment(actor, id);
  }
}
