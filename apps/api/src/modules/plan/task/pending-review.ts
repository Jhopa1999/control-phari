import { Prisma } from '../../../generated/prisma/client';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { TaskStatus } from '../task-status';

/** Máximo de tareas que devuelve la cola «Por aprobar» (el `total` es el real). */
export const PENDING_REVIEW_LIMIT = 100;

/** Quién puede terminar, reabrir y aprobar tareas: jefe de área o líder de proceso. */
export function canApproveTasks(actor: CurrentActor): boolean {
  return (
    actor.roleCodes.has(RoleCode.JEFE_AREA) ||
    actor.roleCodes.has(RoleCode.LIDER_PROCESO)
  );
}

/**
 * Cláusula única de la cola «Por aprobar» (la usan el listado y el contador de
 * `GET /area-control/attention`, para que nunca difieran). Tareas EN_REVISION:
 * - dentro del alcance de lectura del actor (jefe sin filtro; resto, los procesos
 *   de todos sus grants, igual que `PortfolioScopeService.taskScope`);
 * - de solicitudes no eliminadas ni CERRADAS (en un proyecto cerrado el servidor
 *   rechazaría aprobar con 409);
 * - sin las tareas cuyo responsable es el propio actor (las ve en su lista); una
 *   tarea sin responsable sí cuenta (por eso el OR: `NOT` descartaría los null).
 */
export function pendingReviewWhere(actor: CurrentActor): Prisma.TaskWhereInput {
  const request: Prisma.RequestWhereInput = actor.isJefeArea
    ? { deletedAt: null, operationalState: { not: 'CERRADA' } }
    : {
        deletedAt: null,
        operationalState: { not: 'CERRADA' },
        mainProcessId: { in: Array.from(actor.scopedProcessIds) },
      };
  return {
    status: TaskStatus.EN_REVISION,
    phase: { plan: { request } },
    OR: [{ responsibleUserId: null }, { responsibleUserId: { not: actor.userId } }],
  };
}

/**
 * ¿La tarea exige evidencia para enviarse a revisión? Sí si tiene criterios de
 * aceptación o fase de gobierno requerida (`frameworkPhaseRequired` es un texto:
 * cuenta si tiene contenido tras recortar).
 */
export function isEvidenceRequired(task: {
  acceptanceCriteria: string | null;
  frameworkPhaseRequired: string | null;
}): boolean {
  return (
    (task.acceptanceCriteria ?? '').trim() !== '' ||
    (task.frameworkPhaseRequired ?? '').trim() !== ''
  );
}

/** ¿Tiene evidencia? Nota/enlace con texto o al menos un archivo. */
export function hasEvidenceOf(
  task: { evidenceUrl: string | null },
  fileCount: number,
): boolean {
  return (task.evidenceUrl ?? '').trim() !== '' || fileCount > 0;
}
