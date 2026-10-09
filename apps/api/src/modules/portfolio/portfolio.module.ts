import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RequestModule } from '../request/request.module';
import { AreaControlController } from './area-control.controller';
import { PortfolioController } from './portfolio.controller';
import { AreaControlService } from './area-control.service';
import { PortfolioService } from './portfolio.service';
import { PortfolioScopeService } from './portfolio-scope.service';

/**
 * Modulo de portafolio y control del area (Fase 8, design §3.2), 100% lectura.
 * Importa RequestModule para reutilizar `RequestStateService` (banda/label/
 * evaluacion vigente). No importa AuditModule: no emite AuditEvent.
 */
@Module({
  imports: [PrismaModule, AuthModule, RequestModule],
  controllers: [AreaControlController, PortfolioController],
  providers: [AreaControlService, PortfolioService, PortfolioScopeService],
})
export class PortfolioModule {}
