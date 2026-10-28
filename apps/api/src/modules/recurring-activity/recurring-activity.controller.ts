import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RecurringActivityService } from './recurring-activity.service';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de actividades recurrentes (FEAT-001, design §2). Fase 1 expone solo
 * el disparo MANUAL de la generacion de ocurrencias, reservado a ADMIN: sirve
 * para operar/depurar el motor sin esperar al cron. El controller es delgado y
 * delega 100% en el service (misma logica que usa el scheduler).
 */
@ApiTags('recurring-activities')
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
}
