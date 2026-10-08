import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { GrantController } from './grant.controller';
import { GrantService } from './grant.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [GrantController],
  providers: [GrantService],
})
export class GrantModule {}
