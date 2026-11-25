import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthThrottleService } from './auth-throttle.service';
import { CurrentActor } from './current-actor';
import { ChangePasswordDto } from './dto/change-password.dto';
import { hashPassword, verifyPassword } from './password-hash';
import { PasswordPolicyService } from './password-policy.service';

const WRONG_CURRENT = 'La contraseña actual no es correcta.';
const SAME_AS_CURRENT = 'La contraseña nueva debe ser distinta de la actual.';

/**
 * Cambio de contraseña de la propia persona. Es la única acción que levanta el
 * bloqueo de `mustChangePassword`. Reutiliza el límite de intentos del login
 * para que una sesión robada no pueda adivinar la contraseña actual.
 */
@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly throttle: AuthThrottleService,
    private readonly policy: PasswordPolicyService,
  ) {}

  async changePassword(
    actor: CurrentActor,
    dto: ChangePasswordDto,
    ip?: string,
  ): Promise<void> {
    await this.throttle.assertLoginAllowed(actor.identifier, ip);

    // Único lugar (junto al login) que pide el hash: el cliente lo omite.
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      omit: { passwordHash: false },
    });
    if (
      !user?.passwordHash ||
      !(await verifyPassword(dto.currentPassword, user.passwordHash))
    ) {
      await this.throttle.recordLoginFailure(actor.identifier, ip);
      // 400 y no 401: la web interpreta 401 como sesión caducada.
      throw new BadRequestException(WRONG_CURRENT);
    }
    // Política D20 (mínimo y contraseñas comunes). Un 400 no suma al límite de intentos
    // y deja `mustChangePassword` activo.
    await this.policy.assertAcceptable(dto.newPassword);
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(SAME_AS_CURRENT);
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      // Nunca se registra contraseña, hash ni longitud.
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'PASSWORD_CHANGED',
        objectType: 'USER',
        objectId: user.id,
        scopeProcessId: null,
        before: null,
        after: { mustChangePassword: false },
      });
    });
    this.throttle.clearLoginFailures(actor.identifier);
  }
}
