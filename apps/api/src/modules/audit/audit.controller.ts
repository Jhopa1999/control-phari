import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditEventResponseDto } from './dto/audit-event-response.dto';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';
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
  @ApiQuery({ name: 'objectType', required: false, enum: ['PROCESS', 'USER', 'GRANT', 'CATALOG_ITEM'] })
  @ApiQuery({ name: 'take', required: false, type: Number, description: 'Maximo de eventos (acotado a 500).' })
  @ApiResponse({ status: 200, description: 'Eventos visibles para el actor.', type: [AuditEventResponseDto] })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  findMany(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListAuditEventsDto,
  ) {
    return this.auditService.findMany(actor, filters);
  }
}
