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
import { UpdateTaskProgressDto } from './dto/update-task-progress.dto';
import { AcceptTaskDto } from './dto/accept-task.dto';
import { ListPlanTasksDto } from './dto/list-plan-tasks.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { MyWorkItemDto } from './dto/my-work-item.dto';
import { PendingReviewListDto } from './dto/pending-review-task.dto';
import { TaskHistoryEntryDto } from './dto/task-history-entry.dto';
import { ResponsibleCandidateDto } from './dto/responsible-candidate.dto';
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

  // Declarada ANTES de `tasks/:id` para que "pending-review" no se lea como un id.
  @Get('tasks/pending-review')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({
    summary:
      'Cola «Por aprobar»: tareas en revisión dentro del alcance del actor (sin las propias), las que más esperan primero.',
  })
  @ApiResponse({ status: 200, description: 'Tareas por aprobar (hasta 100) y total real.', type: PendingReviewListDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (solo jefe de área y líder de proceso).' })
  pendingReview(@CurrentActor() actor: CurrentActorType) {
    return this.taskService.pendingReview(actor);
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

  @Get('plans/:planId/responsible-candidates')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({
    summary:
      'Candidatos a responsable de tarea: personas con grant activo en los procesos que intervienen en la solicitud del plan.',
  })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Candidatos a responsable.', type: [ResponsibleCandidateDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan fuera de alcance.' })
  responsibleCandidates(
    @CurrentActor() actor: CurrentActorType,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.taskService.responsibleCandidates(actor, planId);
  }

  @Post('phases/:phaseId/tasks')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Crea una tarea en una fase (regla hito).' })
  @ApiParam({ name: 'phaseId', format: 'uuid' })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({ status: 201, description: 'Tarea creada.', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos, regla hito o responsable que no pertenece a un proceso interviniente de la solicitud (el principal o los marcados en el triage).' })
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

  @Get('tasks/:id/history')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Traza de cambios de una tarea (quién, cuándo y qué cambió).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Eventos de la tarea, del más reciente al más antiguo.', type: [TaskHistoryEntryDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  history(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskService.history(actor, id);
  }

  @Patch('tasks/:id')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Edita una tarea (no estado/aceptacion; regla hito).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateTaskDto })
  @ApiResponse({ status: 200, description: 'Tarea actualizada.', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos, regla hito o responsable que no pertenece a un proceso interviniente de la solicitud (el principal o los marcados en el triage).' })
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
  @ApiOperation({
    summary:
      'Cambia el estado de una tarea. Enviar a revisión exige avance 100 % y, si la tarea pide evidencia, nota/enlace o archivo; terminar y reabrir solo los hace un líder de proceso o el jefe de área.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateTaskStatusDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({
    status: 403,
    description:
      'Rol insuficiente, tarea ajena (integrante) o terminar/reabrir sin ser líder de proceso ni jefe de área (mensaje en español).',
  })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  @ApiResponse({
    status: 409,
    description:
      'Transicion no permitida, predecesora no satisfecha o requisitos de envío a revisión sin cumplir (avance < 100 % o falta evidencia; el mensaje dice cuál).',
  })
  changeStatus(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.taskService.changeStatus(actor, id, dto);
  }

  @Patch('tasks/:id/progress')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Actualiza solo el avance (0-100) de una tarea, sin cambiar su estado.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateTaskProgressDto })
  @ApiResponse({ status: 200, description: 'Avance actualizado.', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Avance fuera de 0-100.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente o tarea ajena (integrante).' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La tarea está Por hacer o Terminada.' })
  changeProgress(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskProgressDto,
  ) {
    return this.taskService.changeProgress(actor, id, dto);
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
