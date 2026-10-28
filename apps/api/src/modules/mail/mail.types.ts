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

/**
 * Motivo del aviso de una actividad recurrente (FEAT-003): "nueva" cuando se
 * materializa la ocurrencia y "recordatorio" cuando se acerca su dia objetivo.
 */
export type RecurringActivityNoticeKind = 'nueva' | 'recordatorio';

/**
 * Datos para el aviso por correo de una ocurrencia de actividad recurrente
 * (FEAT-003). Se envia a cada destinatario resuelto (persona responsable o
 * integrantes del area). Degrada sin SMTP (warn, no lanza). El enlace apunta a
 * la seccion de actividades recurrentes del frontend (appWebUrl).
 */
export interface RecurringActivityNoticePayload {
  /** Direccion de destino. */
  readonly to: string;
  /** Nombre de la persona destinataria (para el saludo). */
  readonly name: string;
  /** Motivo del aviso. */
  readonly kind: RecurringActivityNoticeKind;
  /** Titulo de la actividad recurrente. */
  readonly activityTitle: string;
  /** Dia objetivo legible (p. ej. "2026-01-15"). */
  readonly targetDateLabel: string;
  /** Enlace a la seccion de actividades recurrentes del frontend. */
  readonly activityUrl: string;
}
