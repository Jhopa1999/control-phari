import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ProcessModule } from './modules/process/process.module';
import { UserModule } from './modules/user/user.module';
import { GrantModule } from './modules/grant/grant.module';
import { RequestModule } from './modules/request/request.module';
import { PlanModule } from './modules/plan/plan.module';

@Module({
  imports: [
    HealthModule,
    AuthModule,
    AuditModule,
    CatalogModule,
    ProcessModule,
    UserModule,
    GrantModule,
    RequestModule,
    PlanModule,
  ],
})
export class AppModule {}
