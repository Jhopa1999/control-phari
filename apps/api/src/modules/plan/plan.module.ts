import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RequestModule } from '../request/request.module';
import { StorageModule } from '../storage/storage.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanExcelService } from './plan-excel.service';
import { PlanStateService } from './plan-state.service';
import { PlanGuideService } from './plan-guide.service';
import { PhaseController } from './phase/phase.controller';
import { PhaseService } from './phase/phase.service';
import { TaskController } from './task/task.controller';
import { TaskService } from './task/task.service';
import { DependencyController } from './dependency/dependency.controller';
import { DependencyService } from './dependency/dependency.service';
import { EvidenceController } from './evidence/evidence.controller';
import { EvidenceService } from './evidence/evidence.service';

/**
 * Modulo raiz del plan (design §3.2, D13): plan + submodulos phase/task/
 * dependency. Importa RequestModule para reusar RequestStateService (unico
 * escritor de operationalState; no se duplica la maquina de Request).
 *
 * TaskController se registra ANTES que PlanController/DependencyController por
 * precaucion de routing: expone la ruta estatica GET /my-work y la parametrica
 * GET /tasks/:id en una ruta PROPIA que no comparte prefijo con /tasks/:id
 * (design §3.2); el test de modulo fija este contrato.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, RequestModule, StorageModule],
  controllers: [
    TaskController,
    PlanController,
    PhaseController,
    DependencyController,
    EvidenceController,
  ],
  providers: [
    PlanService,
    PlanExcelService,
    PlanStateService,
    PlanGuideService,
    PhaseService,
    TaskService,
    DependencyService,
    EvidenceService,
  ],
})
export class PlanModule {}
