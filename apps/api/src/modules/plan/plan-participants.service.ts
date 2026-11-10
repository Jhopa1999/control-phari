import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { resolveParticipantProcessIds } from '../request/request-participants';
import { RequestState } from '../request/request-state';
import { PlanParticipantsResponseDto } from './dto/plan-participants-response.dto';
import { UpdatePlanParticipantsDto } from './dto/update-plan-participants.dto';
import { PlanStateService } from './plan-state.service';

/**
 * Estados de la solicitud en los que existe un plan y la solicitud sigue viva,
 * es decir, aquellos en los que se pueden asignar tareas (el único bloqueo de
 * tareas es el proyecto CERRADO, CIE-01). Fuera de este conjunto (antes del
 * plan, devuelta, rechazada, retirada o cerrada) la corrección no aplica.
 * BLOQUEADA no es un estado de la solicitud (es un indicador transversal).
 */
export const PARTICIPANTS_EDITABLE_STATES: readonly string[] = [
  RequestState.EN_PLANIFICACION,
  RequestState.EN_EJECUCION,
  RequestState.EN_VALIDACION,
  RequestState.LISTA_PARA_LIBERAR,
  RequestState.EN_ESTABILIZACION,
  RequestState.OPERATIVA,
];

/** Máximo de títulos de tarea nombrados por proceso en el mensaje de rechazo. */
const MAX_TITLES_IN_MESSAGE = 3;

type Db = PrismaService | Prisma.TransactionClient;

interface BlockingTask {
  id: string;
  title: string;
  responsibleName: string;
}

/**
 * Corrección de los procesos que intervienen en la solicitud de un plan
 * (después del triage, que se registra una sola vez). Solo agrega o quita filas
 * de RequestParticipant: no toca la decisión del triage, el proceso principal,
 * las aprobaciones, el estado de la solicitud ni las tareas. Reutiliza la
 * validación de participantes del triage (resolveParticipantProcessIds).
 *
 * La autorización (solo JEFE_AREA) la impone el controller con @Roles.
 */
@Injectable()
export class PlanParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planState: PlanStateService,
  ) {}

  /**
   * Tareas del plan que impiden quitar `processId`: las asignadas a personas con
   * grant activo en ese proceso que, tras el cambio, no tendrían grant activo en
   * ningún proceso que siga interviniendo (`keptProcessIds`). Una persona que
   * sigue siendo elegible por otro proceso no bloquea.
   */
  private async blockingTasks(
    db: Db,
    planId: string,
    removalProcessIds: string[],
    keptProcessIds: string[],
  ): Promise<Map<string, BlockingTask[]>> {
    const result = new Map<string, BlockingTask[]>();
    for (const id of removalProcessIds) result.set(id, []);
    if (removalProcessIds.length === 0) return result;

    const tasks = await db.task.findMany({
      where: { phase: { planId }, responsibleUserId: { not: null } },
      select: {
        id: true,
        title: true,
        responsibleUserId: true,
        responsible: { select: { name: true } },
      },
      orderBy: { title: 'asc' },
    });
    if (tasks.length === 0) return result;

    const userIds = Array.from(
      new Set(tasks.flatMap((t) => (t.responsibleUserId ? [t.responsibleUserId] : []))),
    );
    const grants = await db.grant.findMany({
      where: { active: true, userId: { in: userIds } },
      select: { userId: true, processId: true },
    });
    const processesByUser = new Map<string, Set<string>>();
    for (const g of grants) {
      const set = processesByUser.get(g.userId) ?? new Set<string>();
      set.add(g.processId);
      processesByUser.set(g.userId, set);
    }
    const kept = new Set(keptProcessIds);

    for (const task of tasks) {
      const userProcesses = processesByUser.get(task.responsibleUserId ?? '');
      if (!userProcesses) continue;
      const stillEligible = Array.from(userProcesses).some((p) => kept.has(p));
      if (stillEligible) continue;
      for (const processId of removalProcessIds) {
        if (userProcesses.has(processId)) {
          result.get(processId)?.push({
            id: task.id,
            title: task.title,
            responsibleName: task.responsible?.name ?? '',
          });
        }
      }
    }
    return result;
  }

  private assertEditableState(requestState: string): void {
    if (!PARTICIPANTS_EDITABLE_STATES.includes(requestState)) {
      throw new ConflictException(
        'La solicitud no admite cambiar los procesos que intervienen en su estado actual: solo aplica cuando tiene plan y sigue en curso.',
      );
    }
  }

  /** Procesos activos y participantes con su situación (consulta del diálogo). */
  async get(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PlanParticipantsResponseDto> {
    const { plan, mainProcessId } = await this.planState.requirePlanInScope(
      actor,
      requestId,
    );
    return this.buildResponse(this.prisma, plan.id, requestId, mainProcessId, [], []);
  }

  private async buildResponse(
    db: Db,
    planId: string,
    requestId: string,
    mainProcessId: string | null,
    addedProcessIds: string[],
    removedProcessIds: string[],
  ): Promise<PlanParticipantsResponseDto> {
    const participants = await db.requestParticipant.findMany({
      where: { requestId },
      select: { processId: true },
    });
    const participantIds = participants.map((p) => p.processId);
    const participantSet = new Set(participantIds);

    const processes = await db.process.findMany({
      where: { OR: [{ active: true }, { id: { in: participantIds } }] },
      select: { id: true, code: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const removable = participantIds.filter((id) => id !== mainProcessId);
    // Cada proceso se evalúa por separado: ¿qué pasaría si se quita solo ese?
    const blockers = new Map<string, BlockingTask[]>();
    for (const id of removable) {
      const one = await this.blockingTasks(
        db,
        planId,
        [id],
        participantIds.filter((p) => p !== id),
      );
      blockers.set(id, one.get(id) ?? []);
    }

    const rows = processes.map((p) => {
      const isParticipant = participantSet.has(p.id);
      const isMain = p.id === mainProcessId;
      const blocked = blockers.get(p.id) ?? [];
      return {
        processId: p.id,
        code: p.code,
        name: p.name,
        isMain,
        isParticipant,
        canRemove: isParticipant && !isMain && blocked.length === 0,
        removalBlockedBy: blocked,
      };
    });
    // El principal primero; el resto conserva el orden del catálogo.
    rows.sort((a, b) => Number(b.isMain) - Number(a.isMain));

    return {
      requestId,
      mainProcessId,
      processes: rows,
      addedProcessIds,
      removedProcessIds,
    };
  }

  /**
   * Reemplaza los procesos que intervienen (además del principal). Agregar es
   * libre; quitar exige que ninguna tarea del plan quede asignada a personas
   * que dejarían de ser elegibles. Audita UPDATE REQUEST con antes/después.
   */
  async update(
    actor: CurrentActor,
    requestId: string,
    dto: UpdatePlanParticipantsDto,
  ): Promise<PlanParticipantsResponseDto> {
    const { plan, mainProcessId, requestState } =
      await this.planState.requirePlanInScope(actor, requestId);
    this.assertEditableState(requestState);
    if (mainProcessId === null) {
      throw new ConflictException(
        'La solicitud no tiene proceso principal; defínelo en el triage antes de gestionar los procesos que intervienen.',
      );
    }

    // Misma validación que el triage: principal siempre, extras activos.
    const desired = await resolveParticipantProcessIds(
      this.prisma,
      mainProcessId,
      dto.participantProcessIds,
    );

    return this.prisma.$transaction(async (tx) => {
      const current = (
        await tx.requestParticipant.findMany({
          where: { requestId },
          select: { processId: true },
        })
      ).map((p) => p.processId);

      const desiredSet = new Set(desired);
      const currentSet = new Set(current);
      const added = desired.filter((id) => !currentSet.has(id));
      const removed = current.filter((id) => !desiredSet.has(id));

      if (removed.length > 0) {
        const blockers = await this.blockingTasks(tx, plan.id, removed, desired);
        const blocked = removed.filter((id) => (blockers.get(id) ?? []).length > 0);
        if (blocked.length > 0) {
          const names = await tx.process.findMany({
            where: { id: { in: blocked } },
            select: { id: true, name: true },
          });
          const nameById = new Map(names.map((n) => [n.id, n.name]));
          const parts = blocked.map((id) => {
            const list = blockers.get(id) ?? [];
            const shown = list
              .slice(0, MAX_TITLES_IN_MESSAGE)
              .map((t) => `«${t.title}»`)
              .join(', ');
            const extra =
              list.length > MAX_TITLES_IN_MESSAGE
                ? ` y ${list.length - MAX_TITLES_IN_MESSAGE} más`
                : '';
            const noun = list.length === 1 ? 'tarea asignada' : 'tareas asignadas';
            return `«${nameById.get(id) ?? id}» (${list.length} ${noun}: ${shown}${extra})`;
          });
          throw new ConflictException(
            `No se puede quitar ${parts.join('; ')}: hay tareas del plan asignadas a su gente. Reasígnalas y vuelve a intentarlo.`,
          );
        }
      }

      if (added.length > 0 || removed.length > 0) {
        if (removed.length > 0) {
          await tx.requestParticipant.deleteMany({
            where: { requestId, processId: { in: removed } },
          });
        }
        if (added.length > 0) {
          await tx.requestParticipant.createMany({
            data: added.map((processId) => ({ requestId, processId })),
          });
        }
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'REQUEST',
          objectId: requestId,
          scopeProcessId: mainProcessId,
          before: { participantProcessIds: [...current].sort() },
          after: {
            participantProcessIds: [...desired].sort(),
            addedProcessIds: added,
            removedProcessIds: removed,
            reason: 'GESTION_PROCESOS_PLAN',
          },
        });
      }

      return this.buildResponse(tx, plan.id, requestId, mainProcessId, added, removed);
    });
  }
}
