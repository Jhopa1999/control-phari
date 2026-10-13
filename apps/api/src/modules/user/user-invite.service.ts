import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { AuthTokenPurpose } from '../auth/auth-token-purpose';
import { AuthTokenService } from '../auth/auth-token.service';
import { parseTtlMs } from '../auth/auth-token.util';
import { MailService } from '../mail/mail.service';

/** TTL por defecto de la invitacion si no se configura USER_INVITATION_TTL. */
const DEFAULT_USER_INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72 horas

/**
 * Invitacion/activacion de cuenta. Emite un token USER_INVITATION y envia el
 * correo de invitacion con el enlace a /activar-cuenta. La activacion la aplica
 * POST /auth/reset-password (acepta tokens USER_INVITATION), que define la
 * contrasena. El reenvio reutiliza `issue`, que invalida el token previo no
 * usado, dejando un unico enlace vigente.
 *
 * El envio de correo ocurre FUERA de la transaccion: la escritura (token +
 * auditoria) es atomica y el SMTP externo no la bloquea ni la aborta.
 */
@Injectable()
export class UserInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  /** Vigencia configurada del token de invitacion, en milisegundos. */
  private invitationTtlMs(): number {
    return parseTtlMs(
      process.env.USER_INVITATION_TTL,
      DEFAULT_USER_INVITATION_TTL_MS,
    );
  }

  /**
   * Envia (o reenvia) la invitacion de activacion para `userId`. Aqui no se
   * oculta la existencia: es una accion administrativa de un JEFE_AREA sobre un
   * usuario conocido, por lo que un id inexistente responde 404.
   */
  async invite(actor: CurrentActor, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Usuario "${userId}" no encontrado.`);
    }

    const ttlMs = this.invitationTtlMs();
    const { token } = await this.prisma.$transaction(async (tx) => {
      const issued = await this.authTokenService.issue(tx, {
        userId: user.id,
        purpose: AuthTokenPurpose.USER_INVITATION,
        ttlMs,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'USER',
        objectId: user.id,
        scopeProcessId: null,
        before: null,
        after: null,
      });

      return issued;
    });

    // Fuera de la transaccion: el envio SMTP no bloquea ni aborta la escritura.
    await this.mail.sendUserInvitation({
      to: user.identifier,
      name: user.name,
      inviteUrl: this.buildUrl('activar-cuenta', token),
      expiresLabel: this.labelFromMs(ttlMs),
    });
  }

  /** Construye la URL del frontend (APP_WEB_URL + ruta + token). */
  private buildUrl(path: string, token: string): string {
    const base = process.env.APP_WEB_URL ?? '';
    const normalized = base.replace(/\/+$/, '');
    return `${normalized}/${path}?token=${encodeURIComponent(token)}`;
  }

  /** Texto legible de vigencia a partir de milisegundos (p. ej. "72 horas"). */
  private labelFromMs(ms: number): string {
    const hours = Math.round(ms / (60 * 60 * 1000));
    if (hours >= 1) {
      return hours === 1 ? '1 hora' : `${hours} horas`;
    }
    const minutes = Math.max(1, Math.round(ms / (60 * 1000)));
    return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
  }
}
