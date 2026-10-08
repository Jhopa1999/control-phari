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
import { ApprovalService } from './approval.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ApprovalResponseDto } from './dto/approval-response.dto';
import { RequestResponseDto } from '../dto/request-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de la aprobacion del compromiso (design §3.3). Rol: JEFE_AREA,
 * LIDER_PROCESO (capacidad `review`); alcance por proceso principal en el
 * service. La ruta estatica `pending-approval` se declara antes que `:id/...`.
 */
@ApiTags('approval')
@Controller('requests')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Get('pending-approval')
  @ApiOperation({ summary: 'Cola de solicitudes en backlog priorizado del alcance.' })
  @ApiResponse({ status: 200, description: 'Cola de aprobacion.', type: [RequestResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  pendingApproval(@CurrentActor() actor: CurrentActorType) {
    return this.approvalService.pendingApproval(actor);
  }

  @Get(':id/approval')
  @ApiOperation({ summary: 'Historico de decisiones de compromiso.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Decisiones de la solicitud.', type: [ApprovalResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  findForRequest(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.approvalService.findForRequest(actor, id);
  }

  @Post(':id/approval')
  @ApiOperation({ summary: 'Aprueba (-> Comprometida) o devuelve (-> En triage, motivo req.).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateApprovalDto })
  @ApiResponse({ status: 201, description: 'Decision registrada.', type: ApprovalResponseDto })
  @ApiResponse({ status: 400, description: 'Devolver sin motivo u otros datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (sin review).' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La solicitud no esta en backlog priorizado.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateApprovalDto,
  ) {
    return this.approvalService.create(actor, id, dto);
  }
}
