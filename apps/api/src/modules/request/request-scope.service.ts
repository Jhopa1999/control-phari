import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';

/**
 * Alcance de LECTURA de las solicitudes: fuente única de verdad para
 * Solicitudes, Triage, Priorización, Aprobaciones, Planificación, Portafolio y
 * Panel del área (así las cifras de cada pantalla no pueden divergir).
 *
 * - Jefe de área y líder de proceso: todas las solicitudes no eliminadas
 *   (incluidas las de otros procesos y las que aún no tienen proceso).
 * - Integrante: las de sus procesos con grant activo más las que él creó
 *   (`createdByUserId`), aunque aún no tengan proceso principal.
 * - ADMIN no amplía este alcance (su acceso es de sistema, no por proceso).
 *
 * Los filtros de cada pantalla solo se INTERSECAN con este `where` (`AND`);
 * nunca lo amplían.
 */
export function requestScopeWhere(
  actor: CurrentActor,
): Prisma.RequestWhereInput {
  if (actor.isJefeArea || actor.isLiderProceso) {
    return { deletedAt: null };
  }
  return {
    deletedAt: null,
    OR: [
      { mainProcessId: { in: Array.from(actor.scopedProcessIds) } },
      { createdByUserId: actor.userId },
    ],
  };
}

/** Provider inyectable del alcance de solicitudes (exportado por RequestModule). */
@Injectable()
export class RequestScopeService {
  requestScope(actor: CurrentActor): Prisma.RequestWhereInput {
    return requestScopeWhere(actor);
  }
}
