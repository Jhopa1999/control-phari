import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { MailConfigResolver } from './mail-config.resolver';
import { MailService } from './mail.service';
/**
 * Modulo de correo transaccional. Provee `MailConfigResolver` (resolucion en
 * runtime BD > entorno > ninguna) y `MailService` (construye el transporter por
 * envio). NINGUN provider resuelve el SMTP en el arranque, de modo que el API
 * ARRANCA sin configuracion de correo (design d.5).
 *
 * Exporta ambos: `MailService` para auth/user (reset/invitacion) y
 * `MailConfigResolver` para el modulo system-settings (GET de estado y prueba
 * de envio). Importa `PrismaModule` porque el resolver consulta `smtp_config`.
 */
@Module({
  imports: [PrismaModule],
  providers: [MailConfigResolver, MailService],
  exports: [MailService, MailConfigResolver],
})
export class MailModule {}
