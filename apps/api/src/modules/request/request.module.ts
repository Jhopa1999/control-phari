import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RequestController } from './request.controller';
import { RequestService } from './request.service';
import { RequestStateService } from './request-state.service';
import { TriageController } from './triage/triage.controller';
import { TriageService } from './triage/triage.service';
import { PriorityController } from './priority/priority.controller';
import { PriorityService } from './priority/priority.service';
import { ApprovalController } from './approval/approval.controller';
import { ApprovalService } from './approval/approval.service';

/**
 * Modulo raiz del flujo de demanda (design §3.2): CRUD de Request + submodulos
 * triage/priority/approval. Comparte RequestStateService (helper de
 * transiciones y lectura de triage/evaluacion vigentes). Importa PrismaModule,
 * AuthModule y AuditModule como los modulos de Fase 1.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, KnowledgeModule],
  // ApprovalController va ANTES que RequestController: su ruta estatica
  // GET /requests/pending-approval debe registrarse antes que la parametrica
  // GET /requests/:id del RequestController (que comparte el prefijo
  // 'requests'); de lo contrario ParseUUIDPipe de :id intercepta
  // 'pending-approval' y responde 400. En NestJS/Express el orden de match
  // sigue el orden de registro de los controllers.
  controllers: [
    ApprovalController,
    RequestController,
    TriageController,
    PriorityController,
  ],
  providers: [
    RequestService,
    RequestStateService,
    TriageService,
    PriorityService,
    ApprovalService,
  ],
  exports: [RequestStateService],
})
export class RequestModule {}
