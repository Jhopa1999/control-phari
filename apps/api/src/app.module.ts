import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';

@Module({
  imports: [HealthModule, CatalogModule],
})
export class AppModule {}
