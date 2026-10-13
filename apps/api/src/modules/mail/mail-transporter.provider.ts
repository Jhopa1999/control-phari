import type { Provider } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { loadMailConfig } from './mail.config';

/**
 * Token de inyeccion del transporter de Nodemailer. Permite que los tests
 * inyecten un doble (sin red SMTP) y que MailService dependa de una
 * abstraccion inyectable en lugar de crear el transporter directamente.
 */
export const MAIL_TRANSPORTER = Symbol('MAIL_TRANSPORTER');

/**
 * Token de inyeccion de la MailConfig resuelta desde el entorno.
 */
export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

/**
 * Provider que resuelve la MailConfig desde el entorno al arrancar (falla
 * temprano con mensaje claro si falta una variable obligatoria).
 */
export const mailConfigProvider: Provider = {
  provide: MAIL_CONFIG,
  useFactory: () => loadMailConfig(),
};

/**
 * Provider del transporter SMTP. Crea el transporter de Nodemailer con la
 * configuracion del entorno (Office365 587 => STARTTLS cuando secure=false).
 */
export const mailTransporterProvider: Provider = {
  provide: MAIL_TRANSPORTER,
  useFactory: (): Transporter => {
    const config = loadMailConfig();
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
  },
};
