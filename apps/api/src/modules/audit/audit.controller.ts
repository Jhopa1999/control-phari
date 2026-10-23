import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import {
  AUDIT_ACTIONS,
  ListAuditEventsDto,
  OBJECT_TYPES,
} from './dto/list-audit-events.dto';
import { PaginatedAuditEventsResponseDto } from './dto/paginated-audit-events-response.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';

/**
 * Lectura de auditoria con alcance por rol (design 2.4 / 4.2). CurrentUserGuard
 * a nivel de controller: el alcance efectivo lo aplica el service segun el rol.
 */
@ApiTags('audit')
@Controller('audit-events')
@UseGuards(CurrentUserGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Lista eventos de auditoria con alcance por rol.' })
  @ApiQuery({ name: 'objectType', required: false, enum: OBJECT_TYPES })
  @ApiQuery({ name: 'action', required: false, enum: AUDIT_ACTIONS })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Pagina (1-based). Por defecto 1.' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Tamano de pagina (acotado a 100). Por defecto 25.' })
  @ApiResponse({ status: 200, description: 'Pagina de eventos visibles para el actor.', type: PaginatedAuditEventsResponseDto })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  findMany(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListAuditEventsDto,
  ) {
    return this.auditService.findMany(actor, filters);
  }
}
