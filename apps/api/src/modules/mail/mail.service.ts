import { Inject, Injectable } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import type { MailConfig } from './mail.config';
import {
  MAIL_CONFIG,
  MAIL_TRANSPORTER,
} from './mail-transporter.provider';
import type {
  PasswordResetPayload,
  UserInvitationPayload,
} from './mail.types';

/**
 * Servicio de correo transaccional. Recibe por DI el transporter (token
 * MAIL_TRANSPORTER) y la MailConfig (token MAIL_CONFIG). Construye correos en
 * espanol con HTML inline sobrio mas fallback de texto plano, sin motor de
 * plantillas. No loguea secretos ni contenido sensible.
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    @Inject(MAIL_CONFIG) private readonly config: MailConfig,
  ) {}

  /** Envia el correo de reestablecimiento de contrasena. */
  async sendPasswordReset(payload: PasswordResetPayload): Promise<void> {
    const subject = 'Reestablecimiento de contrasena';
    const intro =
      'Recibimos una solicitud para reestablecer la contrasena de tu cuenta.';
    const action = 'Reestablecer contrasena';
    await this.transporter.sendMail({
      from: this.formatFrom(),
      to: payload.to,
      subject,
      text: this.buildText(payload.name, intro, action, payload.resetUrl, payload.expiresLabel),
      html: this.buildHtml(payload.name, intro, action, payload.resetUrl, payload.expiresLabel),
    });
  }

  /** Envia el correo de invitacion a un usuario nuevo. */
  async sendUserInvitation(payload: UserInvitationPayload): Promise<void> {
    const subject = 'Invitacion para activar tu cuenta';
    const intro =
      'Se creo una cuenta para ti. Activa tu acceso y define tu contrasena.';
    const action = 'Activar cuenta';
    await this.transporter.sendMail({
      from: this.formatFrom(),
      to: payload.to,
      subject,
      text: this.buildText(payload.name, intro, action, payload.inviteUrl, payload.expiresLabel),
      html: this.buildHtml(payload.name, intro, action, payload.inviteUrl, payload.expiresLabel),
    });
  }

  /** Construye el remitente usando MAIL_FROM_NAME cuando esta definido. */
  private formatFrom(): string {
    return this.config.fromName
      ? `"${this.config.fromName}" <${this.config.from}>`
      : this.config.from;
  }

  /** Cuerpo de texto plano (fallback). */
  private buildText(
    name: string,
    intro: string,
    action: string,
    url: string,
    expiresLabel: string,
  ): string {
    return [
      `Hola ${name},`,
      '',
      intro,
      '',
      `${action}: ${url}`,
      '',
      `El enlace vence en ${expiresLabel}.`,
      '',
      'Si no esperabas este correo, puedes ignorarlo.',
    ].join('\n');
  }

  /** Cuerpo HTML inline sobrio. */
  private buildHtml(
    name: string,
    intro: string,
    action: string,
    url: string,
    expiresLabel: string,
  ): string {
    return [
      '<div style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">',
      `  <p>Hola ${name},</p>`,
      `  <p>${intro}</p>`,
      `  <p><a href="${url}" style="display: inline-block; padding: 10px 16px; background-color: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 6px;">${action}</a></p>`,
      `  <p style="color: #6b7280; font-size: 13px;">Si el boton no funciona, copia y pega este enlace en tu navegador:<br /><a href="${url}">${url}</a></p>`,
      `  <p style="color: #6b7280; font-size: 13px;">El enlace vence en ${expiresLabel}.</p>`,
      '  <p style="color: #6b7280; font-size: 13px;">Si no esperabas este correo, puedes ignorarlo.</p>',
      '</div>',
    ].join('\n');
  }
}
