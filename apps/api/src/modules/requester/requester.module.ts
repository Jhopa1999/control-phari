import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RequesterController } from './requester.controller';
import { RequesterService } from './requester.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [RequesterController],
  providers: [RequesterService],
})
export class RequesterModule {}
