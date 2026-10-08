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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AcceptTaskDto } from './dto/accept-task.dto';
import { ListPlanTasksDto } from './dto/list-plan-tasks.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { MyWorkItemDto } from './dto/my-work-item.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de tareas (design §3.3). Sin prefijo de controller: las rutas usan
 * paths completos para montar "/my-work" en una ruta PROPIA (no comparte prefijo
 * con "/tasks/:id", §3.2). Rol por endpoint: ver/estado = `task` (3 roles);
 * crear/editar/borrar/aceptar = `plan` (jefe/lider); "mi trabajo" = `assigned`.
 * El permiso fino del integrante sobre su tarea lo aplica el service (§2.7).
 */
@ApiTags('tasks')
@Controller()
@UseGuards(CurrentUserGuard, RolesGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get('my-work')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Tareas asignadas al usuario actual (dentro de alcance).' })
  @ApiResponse({ status: 200, description: 'Mis tareas.', type: [MyWorkItemDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  myWork(@CurrentActor() actor: CurrentActorType) {
    return this.taskService.myWork(actor);
  }

  @Get('plans/:planId/tasks')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Lista las tareas de un plan (filtros opcionales).' })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tareas del plan.', type: [TaskResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan fuera de alcance.' })
  findForPlan(
    @CurrentActor() actor: CurrentActorType,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() filters: ListPlanTasksDto,
  ) {
    return this.taskService.findForPlan(actor, planId, filters);
  }

  @Post('phases/:phaseId/tasks')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Crea una tarea en una fase (regla hito).' })
  @ApiParam({ name: 'phaseId', format: 'uuid' })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({ status: 201, description: 'Tarea creada.', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o regla hito.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Fase/plan fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.create(actor, phaseId, dto);
  }

  @Get('tasks/:id')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Detalle de una tarea con sus predecesoras.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tarea.', type: TaskResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  findOne(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskService.findOne(actor, id);
  }

  @Patch('tasks/:id')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Edita una tarea (no estado/aceptacion; regla hito).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateTaskDto })
  @ApiResponse({ status: 200, description: 'Tarea actualizada.', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o regla hito.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.taskService.update(actor, id, dto);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Borra una tarea (409 si es predecesora de otra).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Tarea borrada.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La tarea es predecesora de otra.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskService.remove(actor, id);
  }

  @Patch('tasks/:id/status')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Cambia el estado de una tarea (gate de predecesoras).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateTaskStatusDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente o tarea ajena (integrante).' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Transicion no permitida o predecesora no satisfecha.' })
  changeStatus(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.taskService.changeStatus(actor, id, dto);
  }

  @Patch('tasks/:id/accept')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Acepta/retira la aceptacion (precondicion TERMINADA).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AcceptTaskDto })
  @ApiResponse({ status: 200, description: 'Aceptacion actualizada.', type: TaskResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La tarea no esta terminada.' })
  accept(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptTaskDto,
  ) {
    return this.taskService.accept(actor, id, dto);
  }
}
