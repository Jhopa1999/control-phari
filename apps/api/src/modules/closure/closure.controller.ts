import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { ClosureService } from './closure.service';
import {
  ClosureDecisionDto,
  ClosureStatusDto,
  PendingClosureDto,
  ReopenProjectDto,
} from './dto/closure.dto';

/**
 * Cierre formal de proyectos (CIE-01). Consultar: los 3 roles en su alcance;
 * solicitar: jefe/líder; aprobar, rechazar y reabrir: jefe de área.
 */
@ApiTags('closure')
@Controller()
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class ClosureController {
  constructor(private readonly closure: ClosureService) {}

  @Get('closures/pending')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Cierres de proyecto pendientes de aprobación (alcance del actor).' })
  @ApiResponse({ status: 200, type: [PendingClosureDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  pending(@CurrentActor() actor: CurrentActorType) {
    return this.closure.pendingClosures(actor);
  }

  @Get('requests/:id/closure')
  @ApiOperation({ summary: 'Estado del cierre: validaciones de tareas y documentación, e historial.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ClosureStatusDto })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  status(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.closure.getStatus(actor, id);
  }

  @Post('requests/:id/closure')
  @HttpCode(200)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Solicita el cierre del proyecto (tareas terminadas y documentación aprobada).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ClosureStatusDto })
  @ApiResponse({ status: 409, description: 'No se cumplen las condiciones (se indica el motivo).' })
  request(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.closure.requestClosure(actor, id);
  }

  @Post('requests/:id/closure/decision')
  @HttpCode(200)
  @Roles(RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Aprueba (-> Cerrado) o rechaza la solicitud de cierre (solo JEFE_AREA).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ClosureDecisionDto })
  @ApiResponse({ status: 200, type: ClosureStatusDto })
  @ApiResponse({ status: 400, description: 'Faltan las observaciones del rechazo.' })
  @ApiResponse({ status: 409, description: 'Sin solicitud pendiente o condiciones incumplidas.' })
  decide(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClosureDecisionDto,
  ) {
    return this.closure.decide(actor, id, dto);
  }

  @Post('requests/:id/reopen')
  @HttpCode(200)
  @Roles(RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Reabre un proyecto cerrado (solo JEFE_AREA, con motivo).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ReopenProjectDto })
  @ApiResponse({ status: 200, type: ClosureStatusDto })
  @ApiResponse({ status: 409, description: 'El proyecto no está cerrado.' })
  reopen(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenProjectDto,
  ) {
    return this.closure.reopen(actor, id, dto);
  }
}
