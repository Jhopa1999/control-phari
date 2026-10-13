import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserInviteController } from './user-invite.controller';
import { UserInviteService } from './user-invite.service';

@Module({
  // AuthModule exporta AuthTokenService (invitacion); MailModule, MailService.
  imports: [PrismaModule, AuthModule, AuditModule, MailModule],
  controllers: [UserController, UserInviteController],
  providers: [UserService, UserInviteService],
})
export class UserModule {}
