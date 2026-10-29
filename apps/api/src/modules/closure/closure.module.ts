import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RequestModule } from '../request/request.module';
import { ClosureController } from './closure.controller';
import { ClosureService } from './closure.service';

/** Cierre formal de proyectos (CIE-01). Reusa RequestStateService. */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, RequestModule],
  controllers: [ClosureController],
  providers: [ClosureService],
})
export class ClosureModule {}
