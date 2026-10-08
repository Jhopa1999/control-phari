import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';
import { CapacityScopeService } from './capacity-scope.service';

/**
 * Modulo de capacidad (design §3.2): disponibilidad mensual, asignaciones de
 * horas y resumen de carga. Modulo plano (dos entidades que comparten alcance y
 * resumen). Importa PrismaModule, AuthModule y AuditModule como los modulos de
 * Fases 1-3.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [CapacityController],
  providers: [CapacityService, CapacityScopeService],
})
export class CapacityModule {}
