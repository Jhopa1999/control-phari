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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RecurringActivityService } from './recurring-activity.service';
import { CreateRecurringActivityDto } from './dto/create-recurring-activity.dto';
import { UpdateRecurringActivityDto } from './dto/update-recurring-activity.dto';
import { RecurringActivityResponseDto } from './dto/recurring-activity-response.dto';
import { ComplianceQueryDto } from './dto/compliance-query.dto';
import { ComplianceResponseDto } from './dto/compliance-response.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de actividades recurrentes (design §2). Agrupa el disparo MANUAL de
 * la generacion (FEAT-001, solo ADMIN) y el CRUD de DEFINICIONES (FEAT-002):
 * crear/editar/pausar las lo gestiona JEFE_AREA (acotado a su area por el
 * service) o ADMIN. El controller es delgado y delega 100% en el service. Las
 * OCURRENCIAS viven en un controller propio (occurrence.controller.ts) con
 * rutas /recurring-activities/occurrences que se montan ANTES que :id.
 */
@ApiTags('recurring-activity')
@Controller('recurring-activities')
@UseGuards(CurrentUserGuard, RolesGuard)
export class RecurringActivityController {
  constructor(private readonly service: RecurringActivityService) {}

  @Post('run-generation')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN)
  @ApiOperation({
    summary:
      'Dispara manualmente la generacion de ocurrencias debidas (solo ADMIN).',
  })
  @ApiResponse({ status: 200, description: 'Resultado de la generacion.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  runGeneration() {
    return this.service.generateDueOccurrences();
  }

  @Post()
  @Roles(RoleCode.JEFE_AREA, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Crea una definicion de actividad recurrente.' })
  @ApiBody({ type: CreateRecurringActivityDto })
  @ApiResponse({ status: 201, description: 'Definicion creada.', type: RecurringActivityResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente o fuera de area.' })
  @ApiResponse({ status: 409, description: 'Responsable incoherente o fechas invalidas.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateRecurringActivityDto,
  ) {
    return this.service.createActivity(actor, dto);
  }

  @Get('compliance')
  @Roles(RoleCode.JEFE_AREA, RoleCode.ADMIN)
  @ApiOperation({
    summary:
      'Panel de cumplimiento: agregados a tiempo/destiempo/vencidas por actividad y responsable (jefe/admin).',
  })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Dia objetivo desde (inclusive).' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Dia objetivo hasta (inclusive).' })
  @ApiQuery({ name: 'responsibleUserId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'responsibleAreaId', required: false, type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Agregados de cumplimiento.', type: ComplianceResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  compliance(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: ComplianceQueryDto,
  ) {
    return this.service.getCompliance(actor, query);
  }

  @Get()
  @Roles(RoleCode.JEFE_AREA, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Lista las definiciones gestionables por el actor.' })
  @ApiResponse({ status: 200, description: 'Definiciones.', type: [RecurringActivityResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  findAll(@CurrentActor() actor: CurrentActorType) {
    return this.service.findActivities(actor);
  }

  @Get(':id')
  @Roles(RoleCode.JEFE_AREA, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Detalle de una definicion dentro de alcance.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Definicion.', type: RecurringActivityResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  findOne(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findActivity(actor, id);
  }

  @Patch(':id')
  @Roles(RoleCode.JEFE_AREA, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Edita una definicion (datos, responsable, pausa).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateRecurringActivityDto })
  @ApiResponse({ status: 200, description: 'Definicion actualizada.', type: RecurringActivityResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente o fuera de area.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Responsable incoherente o fechas invalidas.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringActivityDto,
  ) {
    return this.service.updateActivity(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(RoleCode.JEFE_AREA, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Pausa una definicion (soft-delete active=false; no borra).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Definicion pausada.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente o fuera de area.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeActivity(actor, id);
  }
}
