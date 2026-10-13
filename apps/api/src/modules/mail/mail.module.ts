import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import {
  mailConfigProvider,
  mailTransporterProvider,
} from './mail-transporter.provider';

/**
 * Modulo de correo transaccional. Provee la MailConfig (resuelta desde el
 * entorno), el transporter SMTP de Nodemailer y MailService; exporta
 * MailService para que lo consuman otros modulos (p. ej. auth/user en
 * FEAT-002).
 */
@Module({
  providers: [mailConfigProvider, mailTransporterProvider, MailService],
  exports: [MailService],
})
export class MailModule {}
