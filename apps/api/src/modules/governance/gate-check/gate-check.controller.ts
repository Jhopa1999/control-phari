import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';
import { GateCheckService } from './gate-check.service';
import { AdvanceStageDto } from './dto/advance-stage.dto';
import { ApproveGateDto } from './dto/approve-gate.dto';
import { BlockRequestDto, UnblockRequestDto } from './dto/block-request.dto';
import { CreatePendingItemDto } from './dto/create-pending-item.dto';
import {
  GateCheckResponseDto,
  GatePendingItemResponseDto,
  GovernanceBoardResponseDto,
} from './dto/gate-check-response.dto';
import { ResolvePendingItemDto } from './dto/resolve-pending-item.dto';
import { SetRouteDto } from './dto/set-route.dto';
import { WaiveGateDto } from './dto/waive-gate.dto';

/**
 * API REST del ciclo de control GC1-GC5 (design §3.4). Lectura `frameworks`
 * (3 roles); mutaciones `review` (JEFE_AREA, LIDER_PROCESO). El alcance por
 * proceso lo anade GovernanceScopeService dentro del service. Rutas estaticas de
 * recurso anidado en la Request.
 */
@ApiTags('governance-gates')
@Controller('requests')
@UseGuards(CurrentUserGuard, RolesGuard)
export class GateCheckController {
  constructor(private readonly service: GateCheckService) {}

  @Get(':id/gates')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Tablero de los 5 gates GC1-GC5 de la solicitud.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: GovernanceBoardResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  getForRequest(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getForRequest(actor, id);
  }

  @Post(':id/gates/:gateCode/pending-items')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Registrar un faltante de un gate (que/quien/fecha).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'gateCode', description: 'GC1..GC5' })
  @ApiBody({ type: CreatePendingItemDto })
  @ApiResponse({ status: 201, type: GatePendingItemResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud/gate fuera de alcance.' })
  addPendingItem(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('gateCode') gateCode: string,
    @Body() dto: CreatePendingItemDto,
  ) {
    return this.service.addPendingItem(actor, id, gateCode, dto);
  }

  @Patch(':id/gates/:gateCode/pending-items/:itemId')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Resolver/editar un faltante de un gate.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'gateCode', description: 'GC1..GC5' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiBody({ type: ResolvePendingItemDto })
  @ApiResponse({ status: 200, type: GatePendingItemResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Faltante no encontrado.' })
  resolvePendingItem(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('gateCode') gateCode: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ResolvePendingItemDto,
  ) {
    return this.service.resolvePendingItem(actor, id, gateCode, itemId, dto);
  }

  @Post(':id/gates/GC4/request-validation')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Preparacion GC4: EN_EJECUCION -> EN_VALIDACION.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AdvanceStageDto })
  @ApiResponse({ status: 201, type: GovernanceBoardResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'Estado actual no es el origen esperado.' })
  requestValidation(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: AdvanceStageDto,
  ) {
    return this.service.advanceStage(actor, id, 'request-validation');
  }

  @Post(':id/gates/GC4/mark-ready')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({
    summary: 'Preparacion GC4: EN_VALIDACION -> LISTA_PARA_LIBERAR (recomputa §1.5).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AdvanceStageDto })
  @ApiResponse({ status: 201, type: GovernanceBoardResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'Validacion bloqueante/obligatoria faltante o estado invalido.' })
  markReady(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: AdvanceStageDto,
  ) {
    return this.service.advanceStage(actor, id, 'mark-ready');
  }

  @Post(':id/gates/GC5/confirm-stabilization')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Preparacion GC5: EN_ESTABILIZACION -> OPERATIVA.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AdvanceStageDto })
  @ApiResponse({ status: 201, type: GovernanceBoardResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'Estado actual no es el origen esperado.' })
  confirmStabilization(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: AdvanceStageDto,
  ) {
    return this.service.advanceStage(actor, id, 'confirm-stabilization');
  }

  @Post(':id/gates/:gateCode/approve')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({
    summary: 'Aprobar un gate por la autoridad (solo GC4/GC5; GC1-GC3 => 409).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'gateCode', description: 'GC4 o GC5' })
  @ApiBody({ type: ApproveGateDto })
  @ApiResponse({ status: 201, type: GateCheckResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'GC1-GC3 no aprobable, bloqueo o estado invalido.' })
  approve(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('gateCode') gateCode: string,
    @Body() dto: ApproveGateDto,
  ) {
    return this.service.approve(actor, id, gateCode, dto);
  }

  @Post(':id/gates/:gateCode/waive')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Marcar un gate NO_APLICA (requiere motivo y ruta compatible).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'gateCode', description: 'GC1..GC5' })
  @ApiBody({ type: WaiveGateDto })
  @ApiResponse({ status: 201, type: GateCheckResponseDto })
  @ApiResponse({ status: 400, description: 'Ruta no admite NO_APLICA o falta motivo.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  waive(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('gateCode') gateCode: string,
    @Body() dto: WaiveGateDto,
  ) {
    return this.service.waive(actor, id, gateCode, dto);
  }

  @Post(':id/block')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Bloquear la solicitud (flag transversal; NO cambia el estado).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: BlockRequestDto })
  @ApiResponse({ status: 201, type: GovernanceBoardResponseDto })
  @ApiResponse({ status: 400, description: 'Falta blockReason.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'La solicitud ya esta bloqueada.' })
  block(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockRequestDto,
  ) {
    return this.service.block(actor, id, dto);
  }

  @Post(':id/unblock')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Desbloquear la solicitud (flag transversal; NO cambia el estado).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UnblockRequestDto })
  @ApiResponse({ status: 201, type: GovernanceBoardResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'La solicitud no esta bloqueada.' })
  unblock(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnblockRequestDto,
  ) {
    return this.service.unblock(actor, id, dto);
  }

  @Put(':id/governance-route')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Fijar/cambiar la ruta proporcional (manual, auditada).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: SetRouteDto })
  @ApiResponse({ status: 200, type: GovernanceBoardResponseDto })
  @ApiResponse({ status: 400, description: 'Ruta fuera de catalogo.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  setRoute(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRouteDto,
  ) {
    return this.service.setRoute(actor, id, dto);
  }
}
