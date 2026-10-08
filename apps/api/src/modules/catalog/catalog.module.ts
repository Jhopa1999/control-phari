import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/**
 * Primera funcionalidad de referencia: maestras/catalogos genericos.
 * Importa PrismaModule explicitamente (PrismaModule no es global), de modo que
 * la dependencia de persistencia queda visible. AuthModule aporta los guards
 * (CurrentUserGuard/RolesGuard) y AuditModule el registro transaccional.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
