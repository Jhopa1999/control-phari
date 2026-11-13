import {
  Body,
  Controller,
  Get,
  HttpCode,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RecurringActivityService } from './recurring-activity.service';
import { OccurrenceEvidenceService } from './occurrence-evidence.service';
import {
  BoardQueryDto,
  CalendarQueryDto,
  MyWorkOccurrencesResponseDto,
  OccurrenceBoardResponseDto,
} from './dto/occurrence-views.dto';
import { OccurrenceEvidenceResponseDto } from './dto/occurrence-evidence-response.dto';
import {
  EvidenceDownloadDto,
  UploadEvidenceDto,
} from '../plan/evidence/dto/evidence-response.dto';
import { evidenceMaxBytes, type UploadedEvidenceFile } from '../storage/evidence-file';
import {
  ListOccurrencesDto,
  OCCURRENCE_SCOPES,
} from './dto/list-occurrences.dto';
import { Recurrence } from './recurrence';
import { OccurrenceStatus } from './occurrence-status';
import { OccurrenceResponseDto } from './dto/occurrence-response.dto';
import { PaginatedOccurrencesResponseDto } from './dto/paginated-occurrences-response.dto';
import { CompleteOccurrenceDto } from './dto/complete-occurrence.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de OCURRENCIAS de actividades recurrentes (design §2, FEAT-002).
 * Base path propio "recurring-activities/occurrences" para que estas rutas se
 * resuelvan sin colisionar con "/recurring-activities/:id" del controller de
 * definiciones. Operacion abierta a los 3 roles de area; el alcance (mine/all)
 * y el permiso fino por area los aplica el service (mine por defecto; all solo
 * jefe/admin).
 */
@ApiTags('recurring-activity')
@Controller('recurring-activities/occurrences')
@UseGuards(CurrentUserGuard, RolesGuard)
export class OccurrenceController {
  constructor(
    private readonly service: RecurringActivityService,
    private readonly evidence: OccurrenceEvidenceService,
  ) {}

  @Get()
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Lista ocurrencias por alcance (mine por defecto; all jefe/admin).' })
  @ApiQuery({ name: 'scope', required: false, enum: OCCURRENCE_SCOPES })
  @ApiQuery({ name: 'status', required: false, enum: OccurrenceStatus })
  @ApiQuery({ name: 'cadence', required: false, enum: Recurrence })
  @ApiQuery({ name: 'activityType', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Dia objetivo desde (inclusive).' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Dia objetivo hasta (inclusive).' })
  @ApiQuery({ name: 'responsibleUserId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'responsibleAreaId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Pagina (1-based). Por defecto 1.' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Tamano de pagina (acotado a 100). Por defecto 25.' })
  @ApiResponse({ status: 200, description: 'Pagina de ocurrencias.', type: PaginatedOccurrencesResponseDto })
  @ApiResponse({ status: 400, description: 'Filtros invalidos.' })
  @ApiResponse({ status: 403, description: 'scope=all sin permiso.' })
  findAll(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListOccurrencesDto,
  ) {
    return this.service.findOccurrences(actor, filters);
  }

  @Get('board')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({
    summary:
      'Tablero de "Que me toca": semana en curso y ocurrencias del actor agrupadas en vencidas, esta semana, proximas y completadas.',
  })
  @ApiQuery({ name: 'completedWeeks', required: false, type: Number, enum: [0, 4, 12], description: 'Semanas de completadas a incluir: 4 (por defecto), 12 o 0 (todas).' })
  @ApiResponse({ status: 200, description: 'Tablero agrupado.', type: OccurrenceBoardResponseDto })
  @ApiResponse({ status: 400, description: 'Filtros invalidos.' })
  board(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: BoardQueryDto,
  ) {
    return this.service.getBoard(actor, query);
  }

  @Get('calendar')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Ocurrencias de un rango de fechas (maximo 62 dias) para la vista de calendario.' })
  @ApiResponse({ status: 200, description: 'Ocurrencias del rango (sin canceladas, hasta 500).', type: [OccurrenceResponseDto] })
  @ApiResponse({ status: 400, description: 'Rango invalido o mayor a 62 dias.' })
  @ApiResponse({ status: 403, description: 'scope=all sin permiso.' })
  calendar(
    @CurrentActor() actor: CurrentActorType,
    @Query() query: CalendarQueryDto,
  ) {
    return this.service.getCalendar(actor, query);
  }

  @Get('my-work')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({
    summary:
      'Ocurrencias del actor que ya se pueden trabajar (ventana abierta, vence hoy, en curso y vencidas) para "Mi trabajo".',
  })
  @ApiResponse({ status: 200, description: 'Ocurrencias trabajables del actor.', type: MyWorkOccurrencesResponseDto })
  myWork(@CurrentActor() actor: CurrentActorType) {
    return this.service.getMyWork(actor);
  }

  @Get(':id')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Detalle de una ocurrencia dentro de alcance.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ocurrencia.', type: OccurrenceResponseDto })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  findOne(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOccurrence(actor, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Toma una ocurrencia (PENDIENTE -> EN_CURSO) y registra quien y cuando.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ocurrencia actualizada.', type: OccurrenceResponseDto })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Transicion no permitida, ventana aun cerrada (el mensaje incluye la fecha de apertura) o ocurrencia vencida.' })
  start(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.startOccurrence(actor, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Completa una ocurrencia indicando que se realizo y las horas reales.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CompleteOccurrenceDto })
  @ApiResponse({ status: 200, description: 'Ocurrencia completada.', type: OccurrenceResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Transicion no permitida, ventana aun cerrada (con fecha de apertura) o falta el adjunto exigido por la definicion.' })
  complete(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteOccurrenceDto,
  ) {
    return this.service.completeOccurrence(actor, id, dto);
  }

  @Get(':id/evidence')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Lista los adjuntos de una ocurrencia.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Adjuntos.', type: [OccurrenceEvidenceResponseDto] })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  listEvidence(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.evidence.list(actor, id);
  }

  @Post(':id/evidence')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Adjunta un archivo (informe, reporte) a una ocurrencia abierta (multipart, un archivo por peticion).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadEvidenceDto })
  @ApiResponse({ status: 201, description: 'Adjunto creado.', type: OccurrenceEvidenceResponseDto })
  @ApiResponse({ status: 400, description: 'Archivo vacio, muy grande o de tipo no permitido.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La ocurrencia no esta abierta (programada, completada o cancelada).' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: evidenceMaxBytes(process.env.EVIDENCE_MAX_BYTES), files: 1 },
    }),
  )
  uploadEvidence(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
  ) {
    return this.evidence.upload(actor, id, file);
  }

  @Get(':id/evidence/:evidenceId/download')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'URL temporal para descargar un adjunto de una ocurrencia.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'evidenceId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'URL prefirmada.', type: EvidenceDownloadDto })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  downloadEvidence(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidence.download(actor, id, evidenceId);
  }

  @Delete(':id/evidence/:evidenceId')
  @HttpCode(204)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Quita un adjunto de una ocurrencia abierta.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'evidenceId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Adjunto eliminado.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La ocurrencia no esta abierta.' })
  removeEvidence(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidence.remove(actor, id, evidenceId);
  }
}
