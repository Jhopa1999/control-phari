import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CoordinationScopeService } from './coordination-scope.service';
import { WorkflowStateService } from './workflow-state.service';
import { WorklogController } from './worklog/worklog.controller';
import { WorklogService } from './worklog/worklog.service';
import { IssueController } from './issue/issue.controller';
import { IssueService } from './issue/issue.service';
import { MeetingController } from './meeting/meeting.controller';
import { MeetingService } from './meeting/meeting.service';
import { CommitmentController } from './commitment/commitment.controller';
import { CommitmentService } from './commitment/commitment.service';

/**
 * Modulo raiz de trabajo y coordinacion de Fase 5 (design §D0): cuatro
 * submodulos de SERVICE (worklog/issue/meeting/commitment) que comparten
 * CoordinationScopeService (alcance por rol), WorkflowStateService (maquinas
 * minimas) y el helper de fecha. Importa PrismaModule/AuthModule/AuditModule
 * como los modulos de Fases 1-4.
 *
 * Orden de controllers (regla D0/MEDIUM-2, design §3.2): ninguna ruta estatica
 * comparte nivel con un `:param` de otro controller (prefijos propios por
 * recurso: /coordination/people, /worklog/*, /weekly-reports/*, /issues/*,
 * /meetings/*, /commitments/*). WorklogController (el de mas rutas estaticas) se
 * registra primero por precaucion, replicando plan.module.ts.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [
    WorklogController,
    IssueController,
    MeetingController,
    CommitmentController,
  ],
  providers: [
    CoordinationScopeService,
    WorkflowStateService,
    WorklogService,
    IssueService,
    MeetingService,
    CommitmentService,
  ],
})
export class CoordinationModule {}
