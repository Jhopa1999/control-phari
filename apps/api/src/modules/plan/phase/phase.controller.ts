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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PhaseService } from './phase.service';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { ReorderPhasesDto } from './dto/reorder-phases.dto';
import { PlanPhaseResponseDto } from './dto/plan-phase-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de las fases del plan (design §3.3). Rol JEFE_AREA/LIDER_PROCESO
 * (capacidad `plan`); alcance por mainProcessId en el service. La ruta estatica
 * PATCH /plans/:planId/phases/reorder se declara ANTES que la parametrica
 * PATCH /plans/:planId/phases/:phaseId para que no la intercepte ParseUUIDPipe.
 */
@ApiTags('plan-phases')
@Controller('plans/:planId/phases')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class PhaseController {
  constructor(private readonly phaseService: PhaseService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las fases del plan ordenadas.' })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Fases del plan.', type: [PlanPhaseResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan fuera de alcance.' })
  findForPlan(
    @CurrentActor() actor: CurrentActorType,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.phaseService.findForPlan(actor, planId);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una fase (order al final si falta).' })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiBody({ type: CreatePhaseDto })
  @ApiResponse({ status: 201, description: 'Fase creada.', type: PlanPhaseResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: CreatePhaseDto,
  ) {
    return this.phaseService.create(actor, planId, dto);
  }

  // Ruta estatica ANTES que la parametrica :phaseId (comparten prefijo).
  @Patch('reorder')
  @ApiOperation({ summary: 'Reordena las fases (protege la inicial con tareas).' })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiBody({ type: ReorderPhasesDto })
  @ApiResponse({ status: 200, description: 'Fases reordenadas.', type: [PlanPhaseResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Lista invalida o mueve la fase inicial con tareas.' })
  reorder(
    @CurrentActor() actor: CurrentActorType,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: ReorderPhasesDto,
  ) {
    return this.phaseService.reorder(actor, planId, dto);
  }

  @Patch(':phaseId')
  @ApiOperation({ summary: 'Edita nombre/fechas/entregable de una fase.' })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiParam({ name: 'phaseId', format: 'uuid' })
  @ApiBody({ type: UpdatePhaseDto })
  @ApiResponse({ status: 200, description: 'Fase actualizada.', type: PlanPhaseResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La fase no pertenece al plan.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: UpdatePhaseDto,
  ) {
    return this.phaseService.update(actor, planId, phaseId, dto);
  }

  @Delete(':phaseId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra una fase (409 si tiene tareas).' })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiParam({ name: 'phaseId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Fase borrada.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La fase tiene tareas o no pertenece al plan.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
  ) {
    return this.phaseService.remove(actor, planId, phaseId);
  }
}
