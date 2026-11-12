import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CoordinationScopeService } from './coordination-scope.service';
import { WorkflowStateService } from './workflow-state.service';
import { WorklogController } from './worklog/worklog.controller';
import { WorklogService } from './worklog/worklog.service';
import { WorklogEligibilityService } from './worklog/worklog-eligibility.service';
import { RequestModule } from '../request/request.module';
import { MeetingController } from './meeting/meeting.controller';
import { MeetingService } from './meeting/meeting.service';
import { CommitmentController } from './commitment/commitment.controller';
import { CommitmentService } from './commitment/commitment.service';

/**
 * Modulo raiz de trabajo y coordinacion de Fase 5 (design §D0): tres
 * submodulos de SERVICE (worklog/meeting/commitment) que comparten
 * CoordinationScopeService (alcance por rol), WorkflowStateService (maquinas
 * minimas) y el helper de fecha. Importa PrismaModule/AuthModule/AuditModule
 * como los modulos de Fases 1-4.
 *
 * Orden de controllers (regla D0/MEDIUM-2, design §3.2): ninguna ruta estatica
 * comparte nivel con un `:param` de otro controller (prefijos propios por
 * recurso: /coordination/people, /worklog/*, /weekly-reports/*,
 * /meetings/*, /commitments/*). WorklogController (el de mas rutas estaticas) se
 * registra primero por precaucion, replicando plan.module.ts.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, RequestModule],
  controllers: [
    WorklogController,
    MeetingController,
    CommitmentController,
  ],
  providers: [
    CoordinationScopeService,
    WorkflowStateService,
    WorklogService,
    WorklogEligibilityService,
    MeetingService,
    CommitmentService,
  ],
})
export class CoordinationModule {}
