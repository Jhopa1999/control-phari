/**
 * Configuracion del modulo de correo. Puede provenir del ENTORNO
 * (loadMailConfigOrNull) o de la BD (MailConfigResolver, modulo mail). En AMBAS
 * fuentes la obligatoriedad es uniforme (design d.2):
 * - Obligatorios para una config "completa/enviable": host, port, from
 *   (MAIL_FROM) y appWebUrl. `appWebUrl` SIEMPRE proviene de env (APP_WEB_URL),
 *   nunca de la BD (design d.1).
 * - Opcionales: secure (default false), user/password (relays sin auth),
 *   fromName.
 *
 * Nunca se imprime el valor de un secreto; si falta algo, se nombra la variable
 * sin exponer su contenido.
 */
export interface MailConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  /** Usuario SMTP; opcional (algunos relays no autentican). */
  readonly user?: string;
  /** Password SMTP; opcional. En BD viaja cifrado y se descifra al resolver. */
  readonly password?: string;
  readonly from: string;
  /** Nombre visible opcional del remitente (p. ej. "Notificaciones"). */
  readonly fromName?: string;
  /** URL base del frontend para construir enlaces (reset, invitacion). */
  readonly appWebUrl: string;
}
/**
 * Lee la configuracion de correo del ENTORNO SIN lanzar (design d.2/d.3). Una
 * config es "completa" (enviable) si SMTP_HOST, SMTP_PORT (entero > 0),
 * MAIL_FROM y APP_WEB_URL estan presentes. En ese caso devuelve MailConfig con
 * user/password/secure/fromName segun existan. Si falta cualquier obligatorio
 * (o SMTP_PORT no es un entero valido) devuelve `null` = "correo deshabilitado
 * via entorno". NUNCA imprime valores.
 */
export function loadMailConfigOrNull(): MailConfig | null {
  const host = nonEmpty(process.env.SMTP_HOST);
  const portRaw = nonEmpty(process.env.SMTP_PORT);
  const from = nonEmpty(process.env.MAIL_FROM);
  const appWebUrl = nonEmpty(process.env.APP_WEB_URL);
  if (!host || !portRaw || !from || !appWebUrl) {
    return null;
  }
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    // Puerto invalido => tratado como ausente => config no enviable.
    return null;
  }
  const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === 'true';
  const user = nonEmpty(process.env.SMTP_USER);
  const password = nonEmpty(process.env.SMTP_PASSWORD);
  const fromName = nonEmpty(process.env.MAIL_FROM_NAME);
  return {
    host,
    port,
    secure,
    ...(user ? { user } : {}),
    ...(password ? { password } : {}),
    from,
    ...(fromName ? { fromName } : {}),
    appWebUrl,
  };
}
/** Devuelve el valor recortado si no es vacio, o undefined. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '' ? trimmed : undefined;
}
