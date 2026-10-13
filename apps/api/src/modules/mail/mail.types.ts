/**
 * Payloads tipados para los correos transaccionales del portal. Las URLs se
 * construyen en la capa que invoca a MailService (FEAT-002) a partir de
 * APP_WEB_URL y el token correspondiente.
 */

/** Datos para el correo de reestablecimiento de contrasena. */
export interface PasswordResetPayload {
  /** Direccion de destino. */
  readonly to: string;
  /** Nombre de la persona destinataria (para el saludo). */
  readonly name: string;
  /** Enlace completo para reestablecer la contrasena. */
  readonly resetUrl: string;
  /** Texto legible de vigencia del enlace (p. ej. "1 hora"). */
  readonly expiresLabel: string;
}

/** Datos para el correo de invitacion a un usuario nuevo. */
export interface UserInvitationPayload {
  /** Direccion de destino. */
  readonly to: string;
  /** Nombre de la persona invitada (para el saludo). */
  readonly name: string;
  /** Enlace completo para activar la cuenta / definir contrasena. */
  readonly inviteUrl: string;
  /** Texto legible de vigencia del enlace (p. ej. "48 horas"). */
  readonly expiresLabel: string;
}
