import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { RequestModel } from '../../generated/prisma/models/Request';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

/**
 * Fuente de verdad del alcance de gobierno sobre una Request (design §1.2 /
 * §3.3). Metodos NUEVOS: NO se reutiliza `KnowledgeScopeService.requireProcessManager`,
 * que opera sobre un `Asset` (`asset.processId`) y no sobre una Request. La
 * LECTURA (`requireInScope`) sigue el patron de `RequestStateService.requireInScope`
 * (jefe => sin filtro; resto => mainProcessId in scopedProcessIds; 404 fuera de
 * alcance). La frontera POR ROL vive en `requireRequestManager`/`requireAreaLead`.
 */
@Injectable()
export class GovernanceScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** `where` de alcance por proceso principal (design §2.5): jefe sin filtro. */
  private scopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /** Procesos donde el actor es LIDER_PROCESO (no cualquier grant). */
  private leaderProcessIds(actor: CurrentActor): string[] {
    return actor.grants
      .filter((grant) => grant.roleCode === RoleCode.LIDER_PROCESO)
      .map((grant) => grant.processId);
  }

  /**
   * Resuelve una Request dentro del alcance de LECTURA del actor o lanza 404
   * (alcance en el `where`, sin confirmar existencia fuera de alcance). Usado por
   * los endpoints de lectura/mutacion de gobierno antes de aplicar su gate.
   */
  async requireInScope(
    actor: CurrentActor,
    requestId: string,
  ): Promise<RequestModel> {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: requestId }, this.scopeWhere(actor)] },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
    return request;
  }

  /**
   * Autoridad de gestion sobre la Request (design §1.2 D-B6): jefe de area, o
   * lider del proceso principal de la Request (`request.mainProcessId`). En otro
   * caso => 403. Resuelve el proceso desde la Request (NO desde un Asset).
   */
  requireRequestManager(
    actor: CurrentActor,
    request: Pick<RequestModel, 'mainProcessId'>,
  ): void {
    if (actor.isJefeArea) {
      return;
    }
    if (this.leaderProcessIds(actor).includes(request.mainProcessId)) {
      return;
    }
    throw new ForbiddenException(
      'Solo el líder del proceso principal o el jefe de área puede gestionar este control.',
    );
  }

  /**
   * Autoridad reservada al jefe de area (design §1.2 D-B6): los gates cuya
   * autoridad del marco es "comité/cambios mayores" se mapean a JEFE_AREA. Jefe
   * => ok; en otro caso => 403.
   */
  requireAreaLead(actor: CurrentActor): void {
    if (actor.isJefeArea) {
      return;
    }
    throw new ForbiddenException(
      'Solo el jefe de área puede ejecutar esta acción.',
    );
  }
}
