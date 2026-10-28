import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
  constructor(private readonly service: RecurringActivityService) {}

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
  @ApiOperation({ summary: 'Toma una ocurrencia (PENDIENTE -> EN_CURSO).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ocurrencia actualizada.', type: OccurrenceResponseDto })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Transicion no permitida.' })
  start(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.startOccurrence(actor, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE, RoleCode.ADMIN)
  @ApiOperation({ summary: 'Completa una ocurrencia (comentario opcional).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CompleteOccurrenceDto })
  @ApiResponse({ status: 200, description: 'Ocurrencia completada.', type: OccurrenceResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Transicion no permitida.' })
  complete(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteOccurrenceDto,
  ) {
    return this.service.completeOccurrence(actor, id, dto);
  }
}
