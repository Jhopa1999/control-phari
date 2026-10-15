import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { decryptSecret } from '../system-settings/settings-crypto';
import { loadMailConfigOrNull, MailConfig } from './mail.config';
/** De donde saldria el envio de correo AHORA mismo (design e.1). */
export type MailConfigSource = 'db' | 'env' | 'none';
/**
 * Resuelve la configuracion de correo efectiva en RUNTIME con prioridad
 * BD > entorno > ninguna (design d.3). No cachea: se consulta en cada envio,
 * de modo que un cambio del ADMIN surte efecto sin reiniciar (coste
 * despreciable frente a la latencia SMTP).
 *
 * `appWebUrl` SIEMPRE proviene de `process.env.APP_WEB_URL` (design d.1): la
 * fila de BD nunca la aporta. Si falta en el entorno, ninguna fuente es
 * "completa".
 */
@Injectable()
export class MailConfigResolver {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * Devuelve la MailConfig efectiva o `null` ("correo deshabilitado").
   * Orden: (1) fila smtp_config COMPLETA (host, port, fromAddress) + APP_WEB_URL
   * de env, descifrando el password si existe; (2) entorno
   * (loadMailConfigOrNull); (3) null.
   */
  async resolve(): Promise<MailConfig | null> {
    const appWebUrl = process.env.APP_WEB_URL?.trim();
    const row = await this.prisma.smtpConfig.findFirst();
    if (
      row &&
      row.host.trim() !== '' &&
      Number.isInteger(row.port) &&
      row.port > 0 &&
      row.fromAddress.trim() !== '' &&
      appWebUrl &&
      appWebUrl !== ''
    ) {
      // Unico punto que exige SETTINGS_ENCRYPTION_KEY (lazy): solo si hay
      // password cifrado que descifrar.
      const password =
        row.passwordCiphertext && row.passwordCiphertext.trim() !== ''
          ? decryptSecret(row.passwordCiphertext)
          : undefined;
      const config: MailConfig = {
        host: row.host,
        port: row.port,
        secure: row.secure,
        ...(row.username ? { user: row.username } : {}),
        ...(password ? { password } : {}),
        from: row.fromAddress,
        ...(row.fromName ? { fromName: row.fromName } : {}),
        appWebUrl,
      };
      return config;
    }
    // Fila ausente o incompleta (o falta APP_WEB_URL) => se cae al entorno.
    return loadMailConfigOrNull();
  }
  /**
   * Indica la fuente efectiva para el GET/UI (design e.1): 'db' si la fila esta
   * completa y usable; 'env' si no hay fila completa pero el entorno aporta
   * config; 'none' si ninguna fuente es completa.
   */
  async resolveSource(): Promise<MailConfigSource> {
    const appWebUrl = process.env.APP_WEB_URL?.trim();
    const row = await this.prisma.smtpConfig.findFirst();
    const dbComplete =
      !!row &&
      row.host.trim() !== '' &&
      Number.isInteger(row.port) &&
      row.port > 0 &&
      row.fromAddress.trim() !== '' &&
      !!appWebUrl &&
      appWebUrl !== '';
    if (dbComplete) {
      return 'db';
    }
    return loadMailConfigOrNull() !== null ? 'env' : 'none';
  }
}
