import {
  Body,
  Controller,
  Get,
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
import { PriorityService } from './priority.service';
import { CreatePriorityEvaluationDto } from './dto/create-priority-evaluation.dto';
import { PriorityEvaluationResponseDto } from './dto/priority-evaluation-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de la priorizacion (design §3.3). Rol: JEFE_AREA, LIDER_PROCESO
 * (capacidad `priority`); alcance por proceso principal en el service.
 */
@ApiTags('priority')
@Controller('requests/:id/priority')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class PriorityController {
  constructor(private readonly priorityService: PriorityService) {}

  @Get()
  @ApiOperation({ summary: 'Historico de evaluaciones (vigente = la ultima).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Evaluaciones de la solicitud.', type: [PriorityEvaluationResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  findForRequest(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.priorityService.findForRequest(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Guarda una evaluacion (requiere triage=Continuar y estado valido).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreatePriorityEvaluationDto })
  @ApiResponse({ status: 201, description: 'Evaluacion guardada.', type: PriorityEvaluationResponseDto })
  @ApiResponse({ status: 400, description: 'Criterios fuera de 1-5 u otros datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Sin triage=Continuar o estado no admite priorizar.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePriorityEvaluationDto,
  ) {
    return this.priorityService.create(actor, id, dto);
  }
}
