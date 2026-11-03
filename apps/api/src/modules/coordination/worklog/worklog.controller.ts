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
import { WorklogService } from './worklog.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
import { UpdateDailyLogDto } from './dto/update-daily-log.dto';
import { ReturnWorklogDto } from './dto/return-worklog.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CreateWeeklyReportDto } from './dto/create-weekly-report.dto';
import { UpdateWeeklyReportDto } from './dto/update-weekly-report.dto';
import { ListDailyLogsDto } from './dto/list-daily-logs.dto';
import { ListWeeklyReportsDto } from './dto/list-weekly-reports.dto';
import { DailyLogResponseDto } from './dto/daily-log-response.dto';
import {
  DailyLogSummaryDto,
  PaginatedDailyLogsResponseDto,
} from './dto/daily-log-summary.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { WeeklyReportResponseDto } from './dto/weekly-report-response.dto';
import { CoordinationPersonDto } from '../dto/coordination-person.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de la bitacora de trabajo (design §3): diarios + actividades +
 * semanales + personas en alcance. Los 3 roles tienen el modulo; la diferencia
 * de que ve/toca cada uno se aplica por ALCANCE en el service (404 fuera / 409
 * duplicado / 400 validacion). Las rutas estaticas (`/worklog/daily`,
 * `/weekly-reports`, `/coordination/people`) no colisionan con las parametricas
 * `:id`, que cuelgan de prefijos propios (design §3.2 MEDIUM-2).
 */
@ApiTags('worklog')
@Controller()
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class WorklogController {
  constructor(
    private readonly worklogService: WorklogService,
    private readonly scopeService: CoordinationScopeService,
  ) {}

  // --- Personas en alcance (selectores) -----------------------------------

  @Get('coordination/people')
  @ApiOperation({ summary: 'Personas en alcance para los selectores de Fase 5.' })
  @ApiResponse({ status: 200, description: 'Personas visibles.', type: [CoordinationPersonDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  people(@CurrentActor() actor: CurrentActorType) {
    return this.scopeService.listPeople(actor);
  }

  // --- Diarios -------------------------------------------------------------

  @Get('worklog/daily')
  @ApiOperation({
    summary:
      'Lista paginada de diarios en alcance, con filtros (fechas, persona, proceso, estado, clasificacion, texto).',
  })
  @ApiResponse({ status: 200, description: 'Pagina de diarios.', type: PaginatedDailyLogsResponseDto })
  @ApiResponse({ status: 400, description: 'Filtros invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  listDailyLogs(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListDailyLogsDto,
  ) {
    return this.worklogService.listDailyLogs(actor, filters);
  }

  // Ruta estatica ANTES de `worklog/daily/:id` para que no se confunda con un id.
  @Get('worklog/daily/summary')
  @ApiOperation({
    summary:
      'Resumen de los diarios en alcance que cumplen el filtro: totales por estado, horas, clasificacion y persona.',
  })
  @ApiResponse({ status: 200, description: 'Resumen.', type: DailyLogSummaryDto })
  @ApiResponse({ status: 400, description: 'Filtros invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  summarizeDailyLogs(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListDailyLogsDto,
  ) {
    return this.worklogService.summarizeDailyLogs(actor, filters);
  }

  @Post('worklog/daily')
  @ApiOperation({ summary: 'Crea la cabecera de un diario (autor = actor).' })
  @ApiBody({ type: CreateDailyLogDto })
  @ApiResponse({ status: 201, description: 'Diario creado.', type: DailyLogResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Proceso fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Ya existe un diario para persona/proceso/fecha.' })
  createDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateDailyLogDto,
  ) {
    return this.worklogService.createDailyLog(actor, dto);
  }

  @Get('worklog/daily/:id')
  @ApiOperation({ summary: 'Detalle de un diario con sus actividades.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Diario.', type: DailyLogResponseDto })
  @ApiResponse({ status: 404, description: 'Diario fuera de alcance.' })
  getDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.getDailyLog(actor, id);
  }

  @Patch('worklog/daily/:id')
  @ApiOperation({ summary: 'Edita la cabecera (notas) de un diario propio.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateDailyLogDto })
  @ApiResponse({ status: 200, description: 'Diario actualizado.', type: DailyLogResponseDto })
  @ApiResponse({ status: 404, description: 'Diario fuera de alcance.' })
  updateDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDailyLogDto,
  ) {
    return this.worklogService.updateDailyLog(actor, id, dto);
  }

  @Delete('worklog/daily/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra un diario propio (cascade de actividades).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Diario borrado.' })
  @ApiResponse({ status: 404, description: 'Diario fuera de alcance.' })
  removeDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.removeDailyLog(actor, id);
  }

  @Post('worklog/daily/:id/submit')
  @ApiOperation({ summary: 'Envia un diario a revision (BORRADOR -> ENVIADO).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Diario enviado.', type: DailyLogResponseDto })
  @ApiResponse({ status: 404, description: 'Diario fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El diario ya fue enviado.' })
  submitDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.submitDailyLog(actor, id);
  }

  @Post('worklog/daily/:id/recall')
  @ApiOperation({ summary: 'El autor retira el envío de un diario (ENVIADO -> BORRADOR).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Diario de nuevo en borrador.', type: DailyLogResponseDto })
  @ApiResponse({ status: 404, description: 'Diario fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'No está enviado, ya fue revisado o su semanal ya se envió.' })
  recallDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.recallDailyLog(actor, id);
  }

  @Post('worklog/daily/:id/review')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca un diario enviado como revisado (jefe o líder del proceso, nunca el autor).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Diario revisado.', type: DailyLogResponseDto })
  @ApiResponse({ status: 403, description: 'No puede revisar este diario.' })
  @ApiResponse({ status: 404, description: 'Diario fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El diario no está enviado.' })
  reviewDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.reviewDailyLog(actor, id);
  }

  @Post('worklog/daily/:id/return')
  @HttpCode(200)
  @ApiOperation({ summary: 'Devuelve un diario enviado a borrador con un motivo; avisa al autor.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ReturnWorklogDto })
  @ApiResponse({ status: 200, description: 'Diario devuelto.', type: DailyLogResponseDto })
  @ApiResponse({ status: 400, description: 'Motivo inválido.' })
  @ApiResponse({ status: 403, description: 'No puede devolver este diario.' })
  @ApiResponse({ status: 404, description: 'Diario fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'No está enviado o su semanal ya se envió.' })
  returnDailyLog(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnWorklogDto,
  ) {
    return this.worklogService.returnDailyLog(actor, id, dto);
  }

  @Post('worklog/daily/:id/activities')
  @ApiOperation({ summary: 'Agrega una actividad al diario (valida clasificacion).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateActivityDto })
  @ApiResponse({ status: 201, description: 'Actividad creada.', type: ActivityResponseDto })
  @ApiResponse({ status: 400, description: 'Clasificacion o datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Diario o referencia fuera de alcance.' })
  addActivity(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.worklogService.addActivity(actor, id, dto);
  }

  @Patch('worklog/activities/:id')
  @ApiOperation({ summary: 'Edita una actividad del diario.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateActivityDto })
  @ApiResponse({ status: 200, description: 'Actividad actualizada.', type: ActivityResponseDto })
  @ApiResponse({ status: 400, description: 'Clasificacion o datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Actividad o referencia fuera de alcance.' })
  updateActivity(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.worklogService.updateActivity(actor, id, dto);
  }

  @Delete('worklog/activities/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra una actividad del diario.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Actividad borrada.' })
  @ApiResponse({ status: 404, description: 'Actividad fuera de alcance.' })
  removeActivity(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.removeActivity(actor, id);
  }

  // --- Semanales -----------------------------------------------------------

  @Get('weekly-reports')
  @ApiOperation({ summary: 'Lista semanales en alcance (filtros opcionales).' })
  @ApiResponse({ status: 200, description: 'Semanales.', type: [WeeklyReportResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  listWeeklyReports(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListWeeklyReportsDto,
  ) {
    return this.worklogService.listWeeklyReports(actor, filters);
  }

  @Post('weekly-reports')
  @ApiOperation({ summary: 'Crea un semanal (se ancla al lunes ISO).' })
  @ApiBody({ type: CreateWeeklyReportDto })
  @ApiResponse({ status: 201, description: 'Semanal creado.', type: WeeklyReportResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Proceso fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Ya existe un semanal para persona/proceso/semana.' })
  createWeeklyReport(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateWeeklyReportDto,
  ) {
    return this.worklogService.createWeeklyReport(actor, dto);
  }

  @Get('weekly-reports/:id')
  @ApiOperation({ summary: 'Detalle de un semanal con conteos de consolidacion.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Semanal.', type: WeeklyReportResponseDto })
  @ApiResponse({ status: 404, description: 'Semanal fuera de alcance.' })
  getWeeklyReport(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.getWeeklyReport(actor, id);
  }

  @Patch('weekly-reports/:id')
  @ApiOperation({ summary: 'Edita las secciones de texto de un semanal propio.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateWeeklyReportDto })
  @ApiResponse({ status: 200, description: 'Semanal actualizado.', type: WeeklyReportResponseDto })
  @ApiResponse({ status: 404, description: 'Semanal fuera de alcance.' })
  updateWeeklyReport(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWeeklyReportDto,
  ) {
    return this.worklogService.updateWeeklyReport(actor, id, dto);
  }

  @Post('weekly-reports/:id/submit')
  @ApiOperation({ summary: 'Envia un semanal a revision (BORRADOR -> ENVIADO).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Semanal enviado.', type: WeeklyReportResponseDto })
  @ApiResponse({ status: 404, description: 'Semanal fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El semanal ya fue enviado.' })
  submitWeeklyReport(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.submitWeeklyReport(actor, id);
  }

  @Post('weekly-reports/:id/review')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca un semanal enviado como revisado (jefe o líder del proceso, nunca el autor).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Semanal revisado.', type: WeeklyReportResponseDto })
  @ApiResponse({ status: 403, description: 'No puede revisar este semanal.' })
  @ApiResponse({ status: 404, description: 'Semanal fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El semanal no está enviado.' })
  reviewWeeklyReport(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.worklogService.reviewWeeklyReport(actor, id);
  }

  @Post('weekly-reports/:id/return')
  @HttpCode(200)
  @ApiOperation({ summary: 'Devuelve un semanal enviado a borrador con un motivo; avisa al autor.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ReturnWorklogDto })
  @ApiResponse({ status: 200, description: 'Semanal devuelto.', type: WeeklyReportResponseDto })
  @ApiResponse({ status: 400, description: 'Motivo inválido.' })
  @ApiResponse({ status: 403, description: 'No puede devolver este semanal.' })
  @ApiResponse({ status: 404, description: 'Semanal fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El semanal no está enviado.' })
  returnWeeklyReport(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnWorklogDto,
  ) {
    return this.worklogService.returnWeeklyReport(actor, id, dto);
  }
}
