import {
  Body,
  Controller,
  Get,
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
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ReturnPlanDto } from './dto/return-plan.dto';
import { SubmitPlanDto, AuthorizePlanDto } from './dto/submit-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { PlanGuideDto } from './dto/plan-guide.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST del plan (design §3.3). Rol JEFE_AREA/LIDER_PROCESO (capacidad
 * `plan` para gestion/enviar; `review` para autorizar/devolver, verificado por
 * el mismo conjunto de roles de MODULE_MATRIX). Alcance por mainProcessId en el
 * service.
 */
@ApiTags('plan')
@Controller('requests')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post(':requestId/plan')
  @ApiOperation({ summary: 'Crea el plan de una solicitud comprometida (-> En planificacion).' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: CreatePlanDto })
  @ApiResponse({ status: 201, description: 'Plan creado.', type: PlanResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La solicitud no esta comprometida o ya tiene plan.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CreatePlanDto,
  ) {
    return this.planService.create(actor, requestId, dto);
  }

  @Get(':requestId/plan')
  @ApiOperation({ summary: 'Devuelve el plan de una solicitud.' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Plan de la solicitud.', type: PlanResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan inexistente o fuera de alcance.' })
  findByRequest(
    @CurrentActor() actor: CurrentActorType,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.planService.findByRequest(actor, requestId);
  }

  @Patch(':requestId/plan')
  @ApiOperation({ summary: 'Edita datos del plan (no cambia el estado).' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: UpdatePlanDto })
  @ApiResponse({ status: 200, description: 'Plan actualizado.', type: PlanResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan inexistente o fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.planService.update(actor, requestId, dto);
  }

  @Get(':requestId/plan/guide')
  @ApiOperation({ summary: 'Guia de pendientes del plan (gate de envio).' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Guia de pendientes.', type: PlanGuideDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan inexistente o fuera de alcance.' })
  getGuide(
    @CurrentActor() actor: CurrentActorType,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.planService.getGuide(actor, requestId);
  }

  @Post(':requestId/plan/submit')
  @ApiOperation({ summary: 'Envia el plan a autorizacion (409 si hay pendientes).' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: SubmitPlanDto, required: false })
  @ApiResponse({ status: 200, description: 'Plan enviado.', type: PlanResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Plan inexistente o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Guia con pendientes o transicion no permitida.' })
  submit(
    @CurrentActor() actor: CurrentActorType,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.planService.submit(actor, requestId);
  }

  @Post(':requestId/plan/authorize')
  @ApiOperation({ summary: 'Autoriza el plan (-> Autorizado; Request -> En ejecucion).' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: AuthorizePlanDto, required: false })
  @ApiResponse({ status: 200, description: 'Plan autorizado.', type: PlanResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (sin review).' })
  @ApiResponse({ status: 404, description: 'Plan inexistente o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El plan no esta en autorizacion.' })
  authorize(
    @CurrentActor() actor: CurrentActorType,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.planService.authorize(actor, requestId);
  }

  @Post(':requestId/plan/return')
  @ApiOperation({ summary: 'Devuelve el plan con motivo (-> Devuelto).' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: ReturnPlanDto })
  @ApiResponse({ status: 200, description: 'Plan devuelto.', type: PlanResponseDto })
  @ApiResponse({ status: 400, description: 'Falta el motivo.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (sin review).' })
  @ApiResponse({ status: 404, description: 'Plan inexistente o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El plan no esta en autorizacion.' })
  return(
    @CurrentActor() actor: CurrentActorType,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ReturnPlanDto,
  ) {
    return this.planService.return(actor, requestId, dto);
  }
}
