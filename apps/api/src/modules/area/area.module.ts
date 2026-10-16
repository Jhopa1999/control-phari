import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AreaController } from './area.controller';
import { AreaService } from './area.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [AreaController],
  providers: [AreaService],
})
export class AreaModule {}
