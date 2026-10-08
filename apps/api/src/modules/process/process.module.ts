import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [ProcessController],
  providers: [ProcessService],
})
export class ProcessModule {}
