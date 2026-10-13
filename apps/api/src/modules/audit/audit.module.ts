import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Modulo de auditoria transversal (design 6). Exporta AuditService para que los
 * servicios de dominio lo invoquen dentro de sus transacciones.
 *
 * AuthModule tambien depende de AuditModule (los flujos de credencial por correo
 * auditan), por lo que la dependencia es mutua: se rompe con forwardRef en ambos
 * sentidos.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
