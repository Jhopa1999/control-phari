import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RequestModule } from '../request/request.module';
import { GovernanceScopeService } from './governance-scope.service';
import { GovernanceStateService } from './governance-state.service';
import { GateCheckController } from './gate-check/gate-check.controller';
import { GateCheckService } from './gate-check/gate-check.service';
import { ValidationController } from './validation/validation.controller';
import { ValidationService } from './validation/validation.service';

/**
 * Modulo del gobierno de la demanda (Fase 7, design §3.1). Importa RequestModule
 * para reutilizar RequestStateService (unico escritor de operationalState) y
 * AuditModule para la auditoria transaccional. GateCheckController se registra
 * ANTES que ValidationController: ambas comparten el prefijo 'requests' y las
 * rutas estaticas (gates/validations) no colisionan con las parametricas de
 * otros controllers por el orden de registro en AppModule.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, RequestModule],
  controllers: [GateCheckController, ValidationController],
  providers: [
    GovernanceScopeService,
    GovernanceStateService,
    GateCheckService,
    ValidationService,
  ],
})
export class GovernanceModule {}
