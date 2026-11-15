import { createHash } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import type { UserModel } from '../../generated/prisma/models/User';
import { AuditService } from '../audit/audit.service';
import { AuthThrottleService, normalizeIdentifier } from './auth-throttle.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { verifyPassword } from './password-hash';

/** Vigencia por defecto del token si no se configura JWT_EXPIRES_IN. */
const DEFAULT_EXPIRES_IN = '8h';

/** Mensaje generico de credenciales: NUNCA revela si el usuario existe. */
const INVALID_CREDENTIALS = 'Credenciales invalidas';

/**
 * Autentica por identifier + contrasena y emite un JWT (modo auth real). Toda
 * falla de credenciales (usuario inexistente, inactivo, sin passwordHash o
 * contrasena incorrecta) termina en el MISMO UnauthorizedException con mensaje
 * generico, para no filtrar la existencia de usuarios.
 */
@Injectable()
export class AuthLoginService {
  private readonly logger = new Logger(AuthLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly throttle: AuthThrottleService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Autentica. Antes de mirar la contraseña aplica el límite de intentos (D1):
   * superado, responde 429 sin revelar si el usuario existe. Cada fallo se
   * cuenta y se audita como LOGIN_FAILED; un acierto borra los fallos del
   * identificador.
   */
  async login(dto: LoginRequestDto, ip?: string): Promise<LoginResponseDto> {
    await this.throttle.assertLoginAllowed(dto.identifier, ip);
    // findFirst por la misma razon que el resto del modulo: el unique de un
    // solo campo con nombre custom no es consultable de forma estable por
    // findUnique con Prisma 7.
    const user = await this.prisma.user.findFirst({
      where: { identifier: dto.identifier },
      // Único punto que necesita el hash: el cliente lo omite por defecto.
      omit: { passwordHash: false },
    });
    let failure = this.failureReason(user);
    if (failure === null && user?.passwordHash) {
      if (!(await verifyPassword(dto.password, user.passwordHash))) {
        failure = 'CONTRASENA_INCORRECTA';
      }
    }
    if (failure !== null || !user) {
      const { blocked } = await this.throttle.recordLoginFailure(dto.identifier, ip);
      await this.auditFailure(dto.identifier, user, failure ?? 'USUARIO_INEXISTENTE', ip, blocked);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    this.throttle.clearLoginFailures(dto.identifier);
    return this.issueSessionForUser(user);
  }

  /** Motivo interno del fallo antes de comparar la contraseña; null si hay que compararla. */
  private failureReason(
    user: Pick<UserModel, 'active' | 'passwordHash'> | null,
  ): string | null {
    if (!user) return 'USUARIO_INEXISTENTE';
    if (!user.active) return 'USUARIO_INACTIVO';
    if (!user.passwordHash) return 'SIN_CONTRASENA';
    return null;
  }

  /**
   * Audita el fallo (LOGIN_FAILED). Un identificador que no existe se registra
   * con una huella corta, nunca en claro: a veces se escribe la contraseña en
   * ese campo. Si la auditoría falla no se altera la respuesta del login.
   */
  private async auditFailure(
    identifier: string,
    user: Pick<UserModel, 'id'> | null,
    reason: string,
    ip: string | undefined,
    blocked: boolean,
  ): Promise<void> {
    try {
      const fingerprint = createHash('sha256')
        .update(normalizeIdentifier(identifier))
        .digest('hex')
        .slice(0, 12);
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          actorUserId: user?.id ?? null,
          action: 'LOGIN_FAILED',
          objectType: 'USER',
          objectId: user?.id ?? `identificador:${fingerprint}`,
          scopeProcessId: null,
          before: null,
          after: { reason, ip: ip ?? null, blocked },
        }),
      );
    } catch (err) {
      this.logger.warn(`No se pudo auditar el fallo de login: ${String(err)}`);
    }
  }

  /**
   * Emite una sesion (JWT + usuario) para un usuario ya autenticado. UNICA
   * fuente de emision de JWT del modulo: la reutiliza tanto el login (tras
   * validar credenciales) como el reset/activacion (tras consumir el token),
   * para no duplicar ni la firma del token ni la construccion del DTO.
   *
   * Solo lee `id`, `name` e `identifier` del usuario (un `Pick`), de modo que
   * la firma no acarrea campos sensibles como `passwordHash`.
   */
  async issueSessionForUser(
    user: Pick<UserModel, 'id' | 'name' | 'identifier'>,
  ): Promise<LoginResponseDto> {
    const expiresIn = process.env.JWT_EXPIRES_IN ?? DEFAULT_EXPIRES_IN;
    // `expiresIn` llega como string de configuracion (env); los tipos de
    // @nestjs/jwt esperan el formato de jsonwebtoken (p. ej. '8h'). Se tipa la
    // opcion para respetar el contrato sin usar `any`.
    const signOptions: JwtSignOptions = {
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };
    const accessToken = await this.jwtService.signAsync(
      { sub: user.identifier },
      signOptions,
    );
    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        name: user.name,
        identifier: user.identifier,
      },
    };
  }
}
