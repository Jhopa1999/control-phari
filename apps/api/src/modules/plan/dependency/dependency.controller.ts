import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DependencyService } from './dependency.service';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { TaskDependencyResponseDto } from './dto/task-dependency-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de las predecesoras de una tarea (design §3.3). Rol JEFE_AREA/
 * LIDER_PROCESO (capacidad `plan`); alcance por mainProcessId en el service.
 */
@ApiTags('task-dependencies')
@Controller('tasks/:id/dependencies')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class DependencyController {
  constructor(private readonly dependencyService: DependencyService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las predecesoras de una tarea.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Predecesoras.', type: [TaskDependencyResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  findForTask(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dependencyService.findForTask(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Anade una predecesora (valida auto/mismo-plan/ciclo/duplicado).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AddDependencyDto })
  @ApiResponse({ status: 201, description: 'Dependencia creada.', type: TaskDependencyResponseDto })
  @ApiResponse({ status: 400, description: 'Auto-dependencia, planes distintos o ciclo.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La dependencia ya existe.' })
  add(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDependencyDto,
  ) {
    return this.dependencyService.add(actor, id, dto);
  }

  @Delete(':predecessorTaskId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quita una predecesora de la tarea.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'predecessorTaskId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Dependencia quitada.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La dependencia no existe.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('predecessorTaskId', ParseUUIDPipe) predecessorTaskId: string,
  ) {
    return this.dependencyService.remove(actor, id, predecessorTaskId);
  }
}
