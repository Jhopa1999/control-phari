import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { AuthLoginService } from './auth-login.service';
import { AuthTokenPurpose } from './auth-token-purpose';
import { AuthTokenService } from './auth-token.service';
import { parseTtlMs } from './auth-token.util';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RESET_PASSWORD_MIN_LENGTH, ResetPasswordDto } from './dto/reset-password.dto';
import { hashPassword } from './password-hash';

/** TTL por defecto del token de reset si no se configura PASSWORD_RESET_TTL. */
const DEFAULT_PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hora
/** Mensaje de contrasena demasiado corta (400). */
const PASSWORD_TOO_SHORT = 'La contrasena no cumple la longitud minima.';
/** Purposes que /auth/reset-password acepta: reset y activacion por invitacion. */
const RESET_ALLOWED_PURPOSES: readonly AuthTokenPurpose[] = [
  AuthTokenPurpose.PASSWORD_RESET,
  AuthTokenPurpose.USER_INVITATION,
];

/**
 * Flujos de credencial por correo: solicitud de reset (forgot-password) y
 * aplicacion del reset/activacion (reset-password).
 *
 * Regla de privacidad (igual que auth-login.service): forgot-password NUNCA
 * revela si un usuario existe o esta activo; responde void siempre y solo emite
 * token + envia correo cuando corresponde.
 *
 * El envio de correo ocurre SIEMPRE fuera de la transaccion: la escritura en BD
 * (emision/consumo del token, actualizacion de la contrasena, auditoria) es
 * atomica, y el correo —que depende de un servicio externo (SMTP)— no debe
 * mantener abierta ni poder abortar esa transaccion.
 */
@Injectable()
export class AuthResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly authTokenService: AuthTokenService,
    private readonly authLoginService: AuthLoginService,
  ) {}

  /** Vigencia configurada del token de reset, en milisegundos. */
  private passwordResetTtlMs(): number {
    return parseTtlMs(process.env.PASSWORD_RESET_TTL, DEFAULT_PASSWORD_RESET_TTL_MS);
  }

  /** Longitud minima efectiva (configurable, con piso igual al del DTO). */
  private passwordMinLength(): number {
    const raw = process.env.PASSWORD_MIN_LENGTH?.trim();
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : RESET_PASSWORD_MIN_LENGTH;
  }

  /**
   * Solicita el reset de contrasena. Si el usuario existe y esta activo, emite
   * un token y envia el correo; si no, no hace nada. En ambos casos retorna
   * void para no revelar la existencia del usuario (el controller responde 204).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { identifier: dto.identifier },
    });

    if (!user || !user.active) {
      // No se revela que el usuario no existe o esta inactivo.
      return;
    }

    const { token } = await this.prisma.$transaction(async (tx) => {
      const issued = await this.authTokenService.issue(tx, {
        userId: user.id,
        purpose: AuthTokenPurpose.PASSWORD_RESET,
        ttlMs: this.passwordResetTtlMs(),
      });

      await this.audit.record(tx, {
        actorUserId: user.id,
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
    await this.mail.sendPasswordReset({
      to: user.identifier,
      name: user.name,
      resetUrl: this.buildUrl('restablecer-contrasena', token),
      expiresLabel: this.labelFromMs(this.passwordResetTtlMs()),
    });
  }

  /**
   * Aplica una nueva contrasena consumiendo un token valido (reset o
   * activacion). Valida la longitud minima, consume el token y actualiza el
   * passwordHash dentro de una unica transaccion; audita el cambio.
   *
   * En exito emite y devuelve la MISMA sesion que el login
   * (`LoginResponseDto`) reutilizando `AuthLoginService.issueSessionForUser`,
   * de modo que el usuario queda autenticado tras restablecer o activar su
   * cuenta. La identidad sale del usuario duenno del token
   * (`tx.user.update(...)`), no de ningun dato externo. La firma del JWT es una
   * operacion en memoria y se hace FUERA de la transaccion para no alargarla
   * (mismo criterio que el envio SMTP en forgotPassword).
   */
  async resetPassword(dto: ResetPasswordDto): Promise<LoginResponseDto> {
    if (dto.newPassword.length < this.passwordMinLength()) {
      throw new BadRequestException(PASSWORD_TOO_SHORT);
    }

    const passwordHash = await hashPassword(dto.newPassword);

    const updated = await this.prisma.$transaction(async (tx) => {
      const authToken = await this.authTokenService.consume(
        tx,
        dto.token,
        RESET_ALLOWED_PURPOSES,
      );

      const user = await tx.user.update({
        where: { id: authToken.userId },
        data: { passwordHash },
      });

      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'UPDATE',
        objectType: 'USER',
        objectId: user.id,
        scopeProcessId: null,
        before: null,
        after: null,
      });

      return user;
    });

    return this.authLoginService.issueSessionForUser(updated);
  }

  /** Construye la URL del frontend (APP_WEB_URL + ruta + token). */
  private buildUrl(path: string, token: string): string {
    const base = process.env.APP_WEB_URL ?? '';
    const normalized = base.replace(/\/+$/, '');
    return `${normalized}/${path}?token=${encodeURIComponent(token)}`;
  }

  /** Texto legible de vigencia a partir de milisegundos (p. ej. "1 hora"). */
  private labelFromMs(ms: number): string {
    const hours = Math.round(ms / (60 * 60 * 1000));
    if (hours >= 1) {
      return hours === 1 ? '1 hora' : `${hours} horas`;
    }
    const minutes = Math.max(1, Math.round(ms / (60 * 1000)));
    return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
  }
}
