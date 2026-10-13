/**
 * Configuracion del modulo de correo. Se lee EXCLUSIVAMENTE del entorno
 * (nunca hardcodeada). Si falta una variable obligatoria, se lanza un Error
 * que NOMBRA la variable ausente pero NUNCA imprime su valor ni ningun
 * secreto (mismo patron que PrismaService y resolveJwtSecret en auth.module).
 */
export interface MailConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly password: string;
  readonly from: string;
  /** Nombre visible opcional del remitente (p. ej. "Notificaciones"). */
  readonly fromName?: string;
  /** URL base del frontend para construir enlaces (reset, invitacion). */
  readonly appWebUrl: string;
}

/** Variables obligatorias; su ausencia hace fallar el arranque. */
const REQUIRED_VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'MAIL_FROM',
  'APP_WEB_URL',
] as const;

function requireVar(name: (typeof REQUIRED_VARS)[number]): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    // Mensaje claro que nombra la variable, SIN exponer valores ni secretos.
    throw new Error(
      `Mail configuration missing: la variable de entorno ${name} no esta definida.`,
    );
  }
  return value;
}

/**
 * Lee y valida la configuracion de correo del entorno. SMTP_PORT se parsea a
 * numero; SMTP_SECURE se interpreta como booleano desde 'true'/'false'.
 */
export function loadMailConfig(): MailConfig {
  const host = requireVar('SMTP_HOST');
  const portRaw = requireVar('SMTP_PORT');
  const user = requireVar('SMTP_USER');
  const password = requireVar('SMTP_PASSWORD');
  const from = requireVar('MAIL_FROM');
  const appWebUrl = requireVar('APP_WEB_URL');

  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      'Mail configuration invalid: la variable de entorno SMTP_PORT debe ser un entero positivo.',
    );
  }

  const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === 'true';

  const fromNameRaw = process.env.MAIL_FROM_NAME?.trim();
  const fromName =
    fromNameRaw && fromNameRaw !== '' ? fromNameRaw : undefined;

  return { host, port, secure, user, password, from, fromName, appWebUrl };
}
