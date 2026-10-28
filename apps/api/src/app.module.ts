import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerModuleOptions } from './observability/logger.config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AreaModule } from './modules/area/area.module';
import { ProcessModule } from './modules/process/process.module';
import { UserModule } from './modules/user/user.module';
import { GrantModule } from './modules/grant/grant.module';
import { RequestModule } from './modules/request/request.module';
import { PlanModule } from './modules/plan/plan.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { CoordinationModule } from './modules/coordination/coordination.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { AiModule } from './modules/ai/ai.module';
import { RecurringActivityModule } from './modules/recurring-activity/recurring-activity.module';

@Module({
  imports: [
    LoggerModule.forRoot(buildLoggerModuleOptions()),
    // Motor in-process de tiempo (unico mecanismo de scheduling, sin colas).
    // generate-openapi.ts crea la app sin init(), asi que esto no monta crons
    // al generar OpenAPI.
    ScheduleModule.forRoot(),
    HealthModule,
    AuthModule,
    AuditModule,
    CatalogModule,
    AreaModule,
    ProcessModule,
    UserModule,
    GrantModule,
    RequestModule,
    PlanModule,
    CapacityModule,
    CoordinationModule,
    KnowledgeModule,
    GovernanceModule,
    PortfolioModule,
    SystemSettingsModule,
    AiModule,
    RecurringActivityModule,
  ],
})
export class AppModule {}
