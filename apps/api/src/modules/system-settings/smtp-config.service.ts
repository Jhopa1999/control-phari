import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { MailConfigResolver } from '../mail/mail-config.resolver';
import { classifySmtpError } from './classify-smtp-error';
import { encryptSecret } from './settings-crypto';
import { SmtpConfigResponseDto } from './dto/smtp-config-response.dto';
import { SmtpTestRequestDto } from './dto/smtp-test-request.dto';
import { SmtpTestResultDto } from './dto/smtp-test-result.dto';
import { UpdateSmtpConfigDto } from './dto/update-smtp-config.dto';
import { MailService } from '../mail/mail.service';
/**
 * Logica de la configuracion SMTP en runtime (design e). Lee/escribe la fila
 * singleton `smtp_config`, cifra el password (lazy, settings-crypto) y audita
 * los cambios. NUNCA devuelve el password ni el ciphertext.
 */
@Injectable()
export class SmtpConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: MailConfigResolver,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}
  /**
   * Estado actual para el ADMIN: refleja la fila de BD si existe (para editar lo
   * guardado) y calcula `source` segun la resolucion efectiva (design e.1). El
   * password nunca se expone; solo `passwordSet`.
   */
  async getCurrent(): Promise<SmtpConfigResponseDto> {
    const row = await this.prisma.smtpConfig.findFirst();
    const source = await this.resolver.resolveSource();
    return {
      host: row?.host ?? null,
      port: row?.port ?? null,
      secure: row?.secure ?? false,
      username: row?.username ?? null,
      passwordSet: !!(row && row.passwordCiphertext && row.passwordCiphertext.trim() !== ''),
      fromAddress: row?.fromAddress ?? null,
      fromName: row?.fromName ?? null,
      source,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
  /**
   * Crea o actualiza la fila singleton. Aplica las reglas deterministas del
   * password (design e.2) y audita dentro de una transaccion (objectType
   * SMTP_CONFIG). Devuelve el estado actualizado (sin password).
   */
  async update(
    actor: CurrentActor,
    dto: UpdateSmtpConfigDto,
  ): Promise<SmtpConfigResponseDto> {
    // Reglas e.2: cadena vacia no es "limpiar"; combinacion invalida.
    if (dto.password === '') {
      throw new BadRequestException(
        'El password no puede ser una cadena vacia; usa clearPassword para limpiarlo.',
      );
    }
    if (dto.clearPassword === true && dto.password !== undefined && dto.password !== '') {
      throw new BadRequestException(
        'No envies password y clearPassword a la vez.',
      );
    }
    const existing = await this.prisma.smtpConfig.findFirst();
    // Resolucion del ciphertext objetivo:
    // - password no vacio => cifrar y reemplazar.
    // - clearPassword true => null.
    // - ausente => conservar el actual (undefined => no se toca en update).
    let passwordCiphertext: string | null | undefined;
    if (dto.password !== undefined && dto.password !== '') {
      passwordCiphertext = encryptSecret(dto.password);
    } else if (dto.clearPassword === true) {
      passwordCiphertext = null;
    } else {
      passwordCiphertext = undefined;
    }
    await this.prisma.$transaction(async (tx) => {
      const data = {
        host: dto.host,
        port: dto.port,
        secure: dto.secure ?? false,
        username: dto.username ?? null,
        fromAddress: dto.fromAddress,
        fromName: dto.fromName ?? null,
        updatedByUserId: actor.userId,
      };
      let rowId: string;
      if (existing) {
        const updated = await tx.smtpConfig.update({
          where: { id: existing.id },
          data: {
            ...data,
            // Solo tocar el ciphertext cuando se decidio un valor (reemplazar o
            // limpiar); undefined lo deja intacto.
            ...(passwordCiphertext !== undefined
              ? { passwordCiphertext }
              : {}),
          },
        });
        rowId = updated.id;
      } else {
        const created = await tx.smtpConfig.create({
          data: {
            ...data,
            // En create, undefined queda como null (no habia password previo).
            passwordCiphertext:
              passwordCiphertext === undefined ? null : passwordCiphertext,
          },
        });
        rowId = created.id;
      }
      // Auditoria SIN password ni ciphertext (design e.3).
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'SMTP_CONFIG',
        objectId: rowId,
        scopeProcessId: null,
        before: null,
        after: null,
      });
    });
    return this.getCurrent();
  }
  /**
   * Prueba de envio: resuelve la config efectiva (BD>env) y envia un correo de
   * prueba a `dto.to` con un transporter efimero. Devuelve `{ ok, message }`
   * legible SIN credenciales ni stack. Si no hay config, ok:false con mensaje
   * claro.
   */
  async test(dto: SmtpTestRequestDto): Promise<SmtpTestResultDto> {
    const cfg = await this.resolver.resolve();
    if (cfg === null) {
      return {
        ok: false,
        message:
          'No hay SMTP configurado (ni en BD ni en el entorno). Guarda la configuracion antes de probar.',
      };
    }
    try {
      const transporter = this.mail.createTransport(cfg);
      await transporter.sendMail({
        from: cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from,
        to: dto.to,
        subject: 'Prueba de configuracion SMTP',
        text: 'Este es un correo de prueba del portal. Si lo recibiste, la configuracion SMTP funciona.',
      });
      return { ok: true, message: `Correo de prueba enviado a ${dto.to}.` };
    } catch (error) {
      // Mensaje breve y legible; NUNCA el stack ni credenciales.
      const c = classifySmtpError(error);
      return {
        ok: false,
        message: c.message,
        ...(c.hint ? { hint: c.hint } : {}),
        ...(c.code ? { code: c.code } : {}),
      };
    }
  }
}
