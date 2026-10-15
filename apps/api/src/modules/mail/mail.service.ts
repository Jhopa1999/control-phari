import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { MailConfig } from './mail.config';
import { MailConfigResolver } from './mail-config.resolver';
import type {
  PasswordResetPayload,
  UserInvitationPayload,
} from './mail.types';
/**
 * Servicio de correo transaccional. Resuelve la configuracion en RUNTIME con
 * `MailConfigResolver` (BD > entorno > ninguna) y construye el transporter POR
 * ENVIO, de modo que un cambio del ADMIN surte efecto sin reiniciar y el API
 * ARRANCA aunque no haya SMTP (design d.4/d.5).
 *
 * Degradacion sin romper contratos: si NO hay config (`resolve()===null`),
 * `sendPasswordReset`/`sendUserInvitation` registran un `warn` con el enlace
 * (sin secretos) y retornan SIN lanzar. Asi los flujos que los invocan fuera de
 * transaccion (reset 204 / invitacion) no se rompen por ausencia de SMTP. Un
 * fallo REAL de SMTP con config presente se propaga como antes.
 *
 * Nunca loguea secretos (user/password) ni el contenido completo del correo.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly resolver: MailConfigResolver) {}
  /**
   * Helper SOLO para el endpoint de prueba y la UI: indica si hay correo
   * habilitado. NO se usa como gate de reset/invite (esos degradan sin lanzar).
   */
  async isEnabled(): Promise<boolean> {
    return (await this.resolver.resolve()) !== null;
  }
  /** Envia el correo de reestablecimiento de contrasena (o degrada si no hay SMTP). */
  async sendPasswordReset(payload: PasswordResetPayload): Promise<void> {
    const cfg = await this.resolver.resolve();
    if (cfg === null) {
      this.logDisabled('reestablecimiento de contrasena', payload.to, payload.resetUrl);
      return;
    }
    const subject = 'Reestablecimiento de contrasena';
    const intro =
      'Recibimos una solicitud para reestablecer la contrasena de tu cuenta.';
    const action = 'Reestablecer contrasena';
    await this.createTransport(cfg).sendMail({
      from: this.formatFrom(cfg),
      to: payload.to,
      subject,
      text: this.buildText(payload.name, intro, action, payload.resetUrl, payload.expiresLabel),
      html: this.buildHtml(payload.name, intro, action, payload.resetUrl, payload.expiresLabel),
    });
  }
  /** Envia el correo de invitacion a un usuario nuevo (o degrada si no hay SMTP). */
  async sendUserInvitation(payload: UserInvitationPayload): Promise<void> {
    const cfg = await this.resolver.resolve();
    if (cfg === null) {
      this.logDisabled('invitacion de usuario', payload.to, payload.inviteUrl);
      return;
    }
    const subject = 'Invitacion para activar tu cuenta';
    const intro =
      'Se creo una cuenta para ti. Activa tu acceso y define tu contrasena.';
    const action = 'Activar cuenta';
    await this.createTransport(cfg).sendMail({
      from: this.formatFrom(cfg),
      to: payload.to,
      subject,
      text: this.buildText(payload.name, intro, action, payload.inviteUrl, payload.expiresLabel),
      html: this.buildHtml(payload.name, intro, action, payload.inviteUrl, payload.expiresLabel),
    });
  }
  /**
   * Construye un transporter efimero para un envio concreto. Solo pasa `auth`
   * cuando hay usuario (relays sin autenticacion lo omiten).
   */
  createTransport(cfg: MailConfig): Transporter {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    });
  }
  /**
   * Registra que el correo esta deshabilitado, dejando constancia del enlace
   * para no bloquear el flujo. NO imprime secretos (user/password). El enlace
   * es de un solo uso y vigencia corta (riesgo documentado).
   */
  private logDisabled(kind: string, to: string, url: string): void {
    this.logger.warn(
      `Correo deshabilitado (sin SMTP configurado): no se envio ${kind} a ${to}. Enlace generado: ${url}`,
    );
  }
  /** Construye el remitente usando el nombre visible cuando esta definido. */
  private formatFrom(cfg: MailConfig): string {
    return cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from;
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
