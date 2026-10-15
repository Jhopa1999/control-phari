import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { SmtpConfigController } from './smtp-config.controller';
import { SmtpConfigService } from './smtp-config.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
/**
 * Modulo de administracion de sistema (design e). Agrupa la configuracion SMTP
 * en runtime y la gestion del rol de SISTEMA ADMIN. Monolito modular: NO es un
 * modulo global.
 *
 * - AuthModule aporta CurrentUserGuard/RolesGuard (@Roles(ADMIN)).
 * - AuditModule aporta AuditService (auditoria de SMTP_CONFIG y USER).
 * - MailModule exporta MailConfigResolver (estado/prueba de envio) y MailService
 *   (transporter efimero para la prueba).
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, MailModule],
  controllers: [SmtpConfigController, AdminUsersController],
  providers: [SmtpConfigService, AdminUsersService],
})
export class SystemSettingsModule {}
