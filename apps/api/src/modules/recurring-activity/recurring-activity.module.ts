import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RecurringActivityController } from './recurring-activity.controller';
import { RecurringActivityService } from './recurring-activity.service';
import { RecurringActivitySchedulerService } from './recurring-activity.scheduler.service';

/**
 * Modulo de actividades recurrentes (FEAT-001, design §2). Importa PrismaModule
 * (acceso a datos), AuthModule (guards CurrentUserGuard/RolesGuard del endpoint
 * ADMIN) y AuditModule (preparado para las fases 2/3 que auditaran las
 * mutaciones de definiciones y ocurrencias). ScheduleModule.forRoot() se
 * registra UNA sola vez en AppModule; aqui solo vive el scheduler service que
 * usa SchedulerRegistry.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [RecurringActivityController],
  providers: [RecurringActivityService, RecurringActivitySchedulerService],
  exports: [RecurringActivityService],
})
export class RecurringActivityModule {}
