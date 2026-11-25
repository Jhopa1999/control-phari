import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MeetingAiService } from './meeting-ai.service';
import {
  MeetingAiAvailabilityDto,
  MeetingAiStructureResponseDto,
  StructureMeetingAiDto,
} from './dto/meeting-ai.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * Ayuda de IA del acta (Reuniones PR-3). Mismos roles que el módulo de
 * reuniones. Solo SUGIERE: no persiste nada. Las rutas `ai/*` tienen dos
 * segmentos y no chocan con `GET /meetings/:id`.
 */
@ApiTags('meetings')
@Controller('meetings/ai')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class MeetingAiController {
  constructor(private readonly service: MeetingAiService) {}

  @Get('availability')
  @ApiOperation({
    summary: 'Indica si la ayuda de IA del acta está disponible (lista, apagada o sin presupuesto).',
  })
  @ApiResponse({ status: 200, description: 'Disponibilidad.', type: MeetingAiAvailabilityDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  availability(): Promise<MeetingAiAvailabilityDto> {
    return this.service.availability();
  }

  @Post('structure')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Propone (no persiste) un acta reestructurada y compromisos a partir de las notas de la reunión, con IA.',
  })
  @ApiBody({ type: StructureMeetingAiDto })
  @ApiResponse({ status: 200, description: 'Propuesta de acta y compromisos.', type: MeetingAiStructureResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos (incluido un texto más largo que el máximo) o proceso inexistente.' })
  @ApiResponse({ status: 403, description: 'El actor no pertenece al proceso indicado.' })
  @ApiResponse({ status: 409, description: 'La IA o el agente de actas están apagados, mal configurados o sin presupuesto.' })
  @ApiResponse({ status: 413, description: 'El texto supera el máximo permitido.' })
  @ApiResponse({ status: 422, description: 'La IA devolvió una salida no interpretable.' })
  @ApiResponse({ status: 503, description: 'La IA no respondió a tiempo o no está disponible.' })
  structure(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: StructureMeetingAiDto,
  ): Promise<MeetingAiStructureResponseDto> {
    return this.service.structure(actor, dto);
  }
}
