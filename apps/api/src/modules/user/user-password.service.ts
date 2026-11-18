import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import {
  ForcePasswordChangeDto,
  ForcePasswordChangeResponseDto,
} from './dto/force-password-change.dto';

/**
 * Exigir (o retirar) el cambio de contraseña obligatorio. No toca contraseñas
 * ni hashes: solo el indicador `mustChangePassword`. Todo o nada, en una
 * transacción con un evento de auditoría por usuario cambiado.
 */
@Injectable()
export class UserPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async forcePasswordChange(
    actor: CurrentActor,
    dto: ForcePasswordChangeDto,
  ): Promise<ForcePasswordChangeResponseDto> {
    const enabled = dto.enabled !== false;
    const userIds = dto.userIds ?? [];
    const all = dto.all === true;
    const exclude = dto.excludeUserIds ?? [];

    if (all === (userIds.length > 0)) {
      throw new BadRequestException(
        'Indica a quién aplicar: todos los usuarios o una lista.',
      );
    }
    if (exclude.length > 0 && !all) {
      throw new BadRequestException(
        'La lista de exclusión solo se usa con «todos los usuarios».',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Candidatos: la lista indicada (todos deben existir) o, con `all`, todos.
      const found = await tx.user.findMany({
        where: all ? {} : { id: { in: userIds } },
        // Solo se mira si existe (no es nulo); el hash no sale de este servicio.
        omit: { passwordHash: false },
      });
      if (!all) {
        const known = new Set(found.map((u) => u.id));
        if (userIds.some((id) => !known.has(id))) {
          throw new NotFoundException(
            'Alguno de los usuarios indicados no existe. No se aplicó ningún cambio.',
          );
        }
      }

      const excluded = new Set(exclude);
      let excludedSelf = false;
      let candidates = found;
      if (all) {
        candidates = found.filter((u) => !excluded.has(u.id));
        if (enabled) {
          excludedSelf = candidates.some((u) => u.id === actor.userId);
          candidates = candidates.filter((u) => u.id !== actor.userId);
        }
      }

      const targets = candidates.filter((u) => {
        // Exigir solo tiene sentido con contraseña que rotar.
        if (enabled && !u.passwordHash) return false;
        return u.mustChangePassword !== enabled;
      });

      if (targets.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: targets.map((u) => u.id) } },
          data: { mustChangePassword: enabled },
        });
        for (const target of targets) {
          await this.audit.record(tx, {
            actorUserId: actor.userId,
            action: enabled
              ? 'PASSWORD_CHANGE_REQUIRED'
              : 'PASSWORD_CHANGE_CLEARED',
            objectType: 'USER',
            objectId: target.id,
            scopeProcessId: null,
            before: { mustChangePassword: !enabled },
            after: { mustChangePassword: enabled },
          });
        }
      }

      return {
        updated: targets.length,
        skipped: candidates.length - targets.length,
        excludedSelf,
      };
    });
  }
}
