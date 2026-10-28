import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { RecurringActivityController } from './recurring-activity.controller';
import { OccurrenceController } from './occurrence.controller';
import { RecurringActivityService } from './recurring-activity.service';
import { RecurringActivitySchedulerService } from './recurring-activity.scheduler.service';

/**
 * Modulo de actividades recurrentes (FEAT-001, design §2). Importa PrismaModule
 * (acceso a datos), AuthModule (guards CurrentUserGuard/RolesGuard del endpoint
 * ADMIN) y AuditModule (preparado para las fases 2/3 que auditaran las
 * mutaciones de definiciones y ocurrencias). ScheduleModule.forRoot() se
 * registra UNA sola vez en AppModule; aqui solo vive el scheduler service que
 * usa SchedulerRegistry.
 *
 * ORDEN DE CONTROLLERS (importante): OccurrenceController va PRIMERO. Sus rutas
 * cuelgan de "recurring-activities/occurrences", mientras que
 * RecurringActivityController expone "recurring-activities/:id". El router
 * (Express) resuelve por orden de registro, asi que si el controller con ":id"
 * se registrara antes, "GET /recurring-activities/occurrences" casaria con
 * ":id" (= "occurrences") y nunca llegaria al listado de ocurrencias: un
 * LIDER_PROCESO recibiria 403 (RolesGuard del :id, solo JEFE_AREA/ADMIN) y un
 * jefe/admin un 400 (ParseUUIDPipe). Registrar la ruta estatica mas especifica
 * antes que la parametrizada evita esa colision.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, MailModule],
  controllers: [OccurrenceController, RecurringActivityController],
  providers: [RecurringActivityService, RecurringActivitySchedulerService],
  exports: [RecurringActivityService],
})
export class RecurringActivityModule {}
