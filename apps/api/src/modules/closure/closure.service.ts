import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { ProjectClosureModel } from '../../generated/prisma/models/ProjectClosure';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CLOSURE_DOC_CATEGORY, DocStatus } from '../knowledge/document/doc-status';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';
import { PlanStatus } from '../plan/plan-status';
import { TaskStatus } from '../plan/task-status';
import { RequestState } from '../request/request-state';
import { RequestStateService } from '../request/request-state.service';
import {
  ClosureDecisionDto,
  ClosurePhase,
  ClosureRecordDto,
  ClosureStatusDto,
  PendingClosureDto,
  ReopenProjectDto,
} from './dto/closure.dto';

export enum ClosureStatus {
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
}

/** Estados operativos desde los que se puede cerrar formalmente un proyecto. */
const CLOSABLE_STATES = new Set<string>([
  RequestState.EN_EJECUCION,
  RequestState.EN_VALIDACION,
  RequestState.LISTA_PARA_LIBERAR,
  RequestState.EN_ESTABILIZACION,
  RequestState.OPERATIVA,
]);

interface Evaluation {
  request: { id: string; title: string; mainProcessId: string; operationalState: string; closedAt: Date | null; closedByUserId: string | null };
  tasksTotal: number;
  tasksCompleted: number;
  documents: Array<{ id: string; title: string; status: string; reviewReason: string | null }>;
  blockers: string[];
}

/**
 * Cierre formal de proyectos (CIE-01). Valida tareas y documentación de cierre
 * aprobada, gestiona la solicitud y la aprobación del cierre (jefe de área),
 * lleva la solicitud a CERRADA y permite la reapertura autorizada. Todo queda en
 * auditoría y genera notificaciones.
 */
@Injectable()
export class ClosureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly requestState: RequestStateService,
    private readonly notifications: NotificationService,
  ) {}

  private scopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    return actor.isJefeArea
      ? { deletedAt: null }
      : { deletedAt: null, mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  private async requireRequest(actor: CurrentActor, requestId: string) {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: requestId }, this.scopeWhere(actor)] },
      select: {
        id: true,
        title: true,
        mainProcessId: true,
        operationalState: true,
        closedAt: true,
        closedByUserId: true,
      },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
    return request;
  }

  /** Paso 1 y 2: evalúa tareas y documentación de cierre. */
  private async evaluate(actor: CurrentActor, requestId: string): Promise<Evaluation> {
    const request = await this.requireRequest(actor, requestId);
    const blockers: string[] = [];

    const plan = await this.prisma.plan.findFirst({
      where: { requestId },
      select: { id: true, status: true },
    });
    let tasksTotal = 0;
    let tasksCompleted = 0;
    if (plan) {
      [tasksTotal, tasksCompleted] = await Promise.all([
        this.prisma.task.count({ where: { phase: { planId: plan.id } } }),
        this.prisma.task.count({
          where: { phase: { planId: plan.id }, status: TaskStatus.TERMINADA },
        }),
      ]);
    }

    const documents = await this.prisma.document.findMany({
      where: {
        categoryCode: CLOSURE_DOC_CATEGORY,
        OR: [{ requestId }, { asset: { requestId } }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, status: true, reviewReason: true },
    });

    if (request.operationalState !== RequestState.CERRADA) {
      if (!CLOSABLE_STATES.has(request.operationalState)) {
        blockers.push('El proyecto debe estar en ejecución (plan autorizado) para gestionar su cierre.');
      }
      if (!plan || plan.status !== PlanStatus.AUTORIZADO) {
        blockers.push('El plan del proyecto debe estar autorizado.');
      }
      if (tasksTotal === 0) {
        blockers.push('El plan no tiene tareas.');
      } else if (tasksCompleted < tasksTotal) {
        const pending = tasksTotal - tasksCompleted;
        blockers.push(
          `Hay ${pending} tarea${pending === 1 ? '' : 's'} sin terminar. Todas las tareas deben estar terminadas.`,
        );
      }
      if (documents.length === 0) {
        blockers.push('No hay documentación de cierre cargada (categoría «Cierre de proyecto»).');
      } else {
        if (documents.some((d) => d.status === DocStatus.PENDIENTE_APROBACION)) {
          blockers.push('Hay documentación de cierre pendiente de aprobación.');
        }
        if (!documents.some((d) => d.status === DocStatus.VIGENTE)) {
          blockers.push('La documentación de cierre aún no está aprobada.');
        }
      }
    }

    return { request, tasksTotal, tasksCompleted, documents, blockers };
  }

  private toRecord(row: ProjectClosureModel, names: Map<string, string>): ClosureRecordDto {
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt,
      requestedByUserId: row.requestedByUserId,
      requestedByName: names.get(row.requestedByUserId) ?? null,
      decidedAt: row.decidedAt,
      decidedByName: row.decidedByUserId ? (names.get(row.decidedByUserId) ?? null) : null,
      decisionReason: row.decisionReason,
    };
  }

  private async userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async getStatus(actor: CurrentActor, requestId: string): Promise<ClosureStatusDto> {
    const ev = await this.evaluate(actor, requestId);
    const closures = await this.prisma.projectClosure.findMany({
      where: { requestId },
      orderBy: { requestedAt: 'desc' },
    });
    const names = await this.userNames([
      ...closures.flatMap((c) => [c.requestedByUserId, c.decidedByUserId]),
      ev.request.closedByUserId,
    ]);
    const pendingRow = closures.find((c) => c.status === ClosureStatus.PENDIENTE) ?? null;

    let phase: ClosurePhase;
    const state = ev.request.operationalState;
    const allTasksDone = ev.tasksTotal > 0 && ev.tasksCompleted === ev.tasksTotal;
    if (state === RequestState.CERRADA) phase = 'CERRADO';
    else if (!CLOSABLE_STATES.has(state)) phase = 'NO_APLICA';
    else if (pendingRow) phase = 'PENDIENTE_APROBACION_CIERRE';
    else if (!allTasksDone) phase = 'EN_EJECUCION';
    else if (ev.documents.some((d) => d.status === DocStatus.PENDIENTE_APROBACION))
      phase = 'PENDIENTE_APROBACION_DOCUMENTAL';
    else if (!ev.documents.some((d) => d.status === DocStatus.VIGENTE))
      phase = 'PENDIENTE_DOCUMENTACION';
    else phase = 'EJECUCION_FINALIZADA';

    const blockers = [...ev.blockers];
    if (pendingRow) blockers.push('Ya hay una solicitud de cierre pendiente de aprobación.');

    return {
      requestId,
      requestState: state,
      phase,
      tasksTotal: ev.tasksTotal,
      tasksCompleted: ev.tasksCompleted,
      documents: ev.documents,
      canRequestClosure: state !== RequestState.CERRADA && blockers.length === 0,
      blockers: state === RequestState.CERRADA ? [] : blockers,
      pending: pendingRow ? this.toRecord(pendingRow, names) : null,
      history: closures.map((c) => this.toRecord(c, names)),
      closedAt: ev.request.closedAt,
      closedByName: ev.request.closedByUserId
        ? (names.get(ev.request.closedByUserId) ?? null)
        : null,
    };
  }

  /** Paso 3: solicitar el cierre (líder o jefe). */
  async requestClosure(actor: CurrentActor, requestId: string): Promise<ClosureStatusDto> {
    const ev = await this.evaluate(actor, requestId);
    if (ev.request.operationalState === RequestState.CERRADA) {
      throw new ConflictException('El proyecto ya está cerrado.');
    }
    if (ev.blockers.length > 0) {
      throw new ConflictException(`No se puede solicitar el cierre: ${ev.blockers.join(' ')}`);
    }
    const pending = await this.prisma.projectClosure.findFirst({
      where: { requestId, status: ClosureStatus.PENDIENTE },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('Ya hay una solicitud de cierre pendiente de aprobación.');
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.projectClosure.create({
        data: {
          requestId,
          status: ClosureStatus.PENDIENTE,
          requestedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'PROJECT_CLOSURE',
        objectId: row.id,
        scopeProcessId: ev.request.mainProcessId,
        before: null,
        after: {
          requestId,
          status: row.status,
          tasksCompleted: ev.tasksCompleted,
          documents: ev.documents.map((d) => ({ id: d.id, status: d.status })),
        },
      });
    });

    await this.notifications.notify({
      userIds: await this.notifications.areaHeadsForProcess(ev.request.mainProcessId),
      excludeUserId: actor.userId,
      type: NotificationType.CLOSURE_REQUESTED,
      title: 'Solicitud de cierre de proyecto',
      message: `Se solicitó el cierre de «${ev.request.title}».`,
      link: '/administracion/revision',
      requestId,
    });
    return this.getStatus(actor, requestId);
  }

  /** Paso 4: aprobar (-> CERRADA) o rechazar (con observaciones). Solo jefe. */
  async decide(
    actor: CurrentActor,
    requestId: string,
    dto: ClosureDecisionDto,
  ): Promise<ClosureStatusDto> {
    if (!actor.isJefeArea) {
      throw new ForbiddenException('Solo el jefe de área puede aprobar o rechazar el cierre.');
    }
    const ev = await this.evaluate(actor, requestId);
    const pending = await this.prisma.projectClosure.findFirst({
      where: { requestId, status: ClosureStatus.PENDIENTE },
    });
    if (!pending) {
      throw new ConflictException('No hay una solicitud de cierre pendiente para este proyecto.');
    }
    const approve = dto.decision === 'APROBAR';
    if (!approve && !dto.reason?.trim()) {
      throw new BadRequestException('Indica las observaciones del rechazo para que puedan subsanarse.');
    }
    if (approve && ev.blockers.length > 0) {
      throw new ConflictException(
        `El proyecto ya no cumple las condiciones de cierre: ${ev.blockers.join(' ')}`,
      );
    }
    const nextState = approve
      ? this.requestState.assertTransition(ev.request.operationalState, RequestState.CERRADA)
      : null;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const decided = await tx.projectClosure.update({
        where: { id: pending.id },
        data: {
          status: approve ? ClosureStatus.APROBADO : ClosureStatus.RECHAZADO,
          decidedByUserId: actor.userId,
          decidedAt: now,
          decisionReason: dto.reason?.trim() || null,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PROJECT_CLOSURE',
        objectId: decided.id,
        scopeProcessId: ev.request.mainProcessId,
        before: { status: pending.status },
        after: { status: decided.status, decisionReason: decided.decisionReason },
      });
      if (nextState) {
        await tx.request.update({
          where: { id: requestId },
          data: { operationalState: nextState, closedAt: now, closedByUserId: actor.userId },
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'UPDATE',
          objectType: 'REQUEST',
          objectId: requestId,
          scopeProcessId: ev.request.mainProcessId,
          before: { operationalState: ev.request.operationalState },
          after: { operationalState: nextState, closedAt: now.toISOString(), closedByUserId: actor.userId },
        });
      }
    });

    await this.notifications.notify({
      userIds: [
        pending.requestedByUserId,
        ...(await this.notifications.processLeaders(ev.request.mainProcessId)),
      ],
      excludeUserId: actor.userId,
      type: approve ? NotificationType.CLOSURE_APPROVED : NotificationType.CLOSURE_REJECTED,
      title: approve ? 'Cierre de proyecto aprobado' : 'Cierre de proyecto rechazado',
      message: approve
        ? `«${ev.request.title}» quedó cerrado.`
        : `El cierre de «${ev.request.title}» fue rechazado: ${dto.reason?.trim() ?? ''}`,
      link: `/demanda/solicitudes/${encodeURIComponent(requestId)}`,
      requestId,
    });
    return this.getStatus(actor, requestId);
  }

  /** Paso 5: reapertura autorizada (solo jefe de área, con motivo). */
  async reopen(
    actor: CurrentActor,
    requestId: string,
    dto: ReopenProjectDto,
  ): Promise<ClosureStatusDto> {
    if (!actor.isJefeArea) {
      throw new ForbiddenException('Solo el jefe de área puede reabrir un proyecto cerrado.');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Indica el motivo de la reapertura.');
    }
    const request = await this.requireRequest(actor, requestId);
    const nextState = this.requestState.assertTransition(
      request.operationalState,
      RequestState.EN_EJECUCION,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: requestId },
        data: { operationalState: nextState, closedAt: null, closedByUserId: null },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: {
          operationalState: request.operationalState,
          closedAt: request.closedAt ? request.closedAt.toISOString() : null,
          closedByUserId: request.closedByUserId,
        },
        after: { operationalState: nextState, reopened: true, reason: dto.reason.trim() },
      });
    });
    await this.notifications.notify({
      userIds: await this.notifications.processLeaders(request.mainProcessId),
      excludeUserId: actor.userId,
      type: NotificationType.PROJECT_REOPENED,
      title: 'Proyecto reabierto',
      message: `«${request.title}» fue reabierto: ${dto.reason.trim()}`,
      link: `/demanda/solicitudes/${encodeURIComponent(requestId)}`,
      requestId,
    });
    return this.getStatus(actor, requestId);
  }

  /** Cola de cierres pendientes dentro del alcance (Aprobaciones). */
  async pendingClosures(actor: CurrentActor): Promise<PendingClosureDto[]> {
    const rows = await this.prisma.projectClosure.findMany({
      where: { status: ClosureStatus.PENDIENTE, request: this.scopeWhere(actor) },
      orderBy: { requestedAt: 'asc' },
      include: { request: { select: { title: true } } },
    });
    const names = await this.userNames(rows.map((r) => r.requestedByUserId));
    return rows.map((r) => ({
      closureId: r.id,
      requestId: r.requestId,
      requestTitle: r.request.title,
      requestedAt: r.requestedAt,
      requestedByName: names.get(r.requestedByUserId) ?? null,
    }));
  }
}
