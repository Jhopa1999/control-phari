import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { CommitmentModel } from '../../../generated/prisma/models/Commitment';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import {
  NotificationService,
  NotificationType,
} from '../../notification/notification.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorkflowStateService } from '../workflow-state.service';
import { dateStringToDate, dateToString } from '../date';
import { isMinutesClosed } from '../meeting/minutes';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { UpdateCommitmentDto } from './dto/update-commitment.dto';
import { ListCommitmentsDto } from './dto/list-commitments.dto';
import { TransitionDto } from '../dto/transition.dto';
import { CommitmentResponseDto } from './dto/commitment-response.dto';

const MEETING_REF = { sourceMeeting: { select: { title: true, meetingDate: true } } } as const;

type CommitmentWithMeeting = CommitmentModel & {
  sourceMeeting: { title: string; meetingDate: Date } | null;
};

/**
 * Lógica de compromisos (design §2.2/§4). Mismo WorkflowStateService que Issue
 * (grafo RECORD_STATE reversible). Un compromiso puede nacer de un acta de
 * reunión (`sourceMeetingId`) o registrarse sin acta. No se agregan ni se
 * re-ligan compromisos a un acta cerrada; los existentes siguen su ciclo. Se
 * notifica al asignado y al responsable. Alcance via CoordinationScopeService.
 * Mutación + AuditEvent en la MISMA `$transaction` (objectType COMMITMENT).
 */
@Injectable()
export class CommitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: CoordinationScopeService,
    private readonly workflow: WorkflowStateService,
    private readonly notifications: NotificationService,
  ) {}

  private snapshot(row: CommitmentModel): Prisma.InputJsonValue {
    return {
      id: row.id,
      processId: row.processId,
      title: row.title,
      state: row.state,
      dueDate: dateToString(row.dueDate),
      sourceMeetingId: row.sourceMeetingId,
      assignedUserId: row.assignedUserId,
      responsibleUserId: row.responsibleUserId,
      relatedRequestId: row.relatedRequestId,
      relatedProjectRequestId: row.relatedProjectRequestId,
      expectedResult: row.expectedResult,
      result: row.result,
      blockers: row.blockers,
    };
  }

  private toResponse(row: CommitmentWithMeeting): CommitmentResponseDto {
    return {
      id: row.id,
      processId: row.processId,
      title: row.title,
      state: row.state,
      dueDate: dateToString(row.dueDate),
      sourceMeetingId: row.sourceMeetingId,
      sourceMeetingTitle: row.sourceMeeting?.title ?? null,
      sourceMeetingDate: row.sourceMeeting ? dateToString(row.sourceMeeting.meetingDate) : null,
      assignedUserId: row.assignedUserId,
      responsibleUserId: row.responsibleUserId,
      relatedRequestId: row.relatedRequestId,
      relatedProjectRequestId: row.relatedProjectRequestId,
      expectedResult: row.expectedResult,
      result: row.result,
      blockers: row.blockers,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Request relacionada por visibilidad real de Fase 2 (404 fuera). */
  private async requireRequestVisible(
    actor: CurrentActor,
    requestId: string,
  ): Promise<void> {
    const request = await this.prisma.request.findFirst({
      where: {
        AND: [{ id: requestId }, this.scope.requestVisibilityWhere(actor)],
      },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
  }

  /**
   * Acta de origen por alcance de reuniones (404 fuera). Debe estar abierta y
   * pertenecer al mismo proceso del compromiso.
   */
  private async requireOpenMeeting(
    actor: CurrentActor,
    meetingId: string,
    processId: string,
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { AND: [{ id: meetingId }, this.scope.meetingWhere(actor)] },
      select: { id: true, state: true, processId: true },
    });
    if (!meeting) {
      throw new NotFoundException(`Reunion "${meetingId}" no encontrada.`);
    }
    if (isMinutesClosed(meeting.state)) {
      throw new ConflictException(
        'El acta está cerrada; no se le pueden agregar compromisos. Reábrela si es necesario.',
      );
    }
    if (meeting.processId !== processId) {
      throw new BadRequestException(
        'El compromiso debe pertenecer al mismo proceso que su acta de origen.',
      );
    }
  }

  private async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<CommitmentWithMeeting> {
    const row = await this.prisma.commitment.findFirst({
      where: { AND: [{ id }, this.scope.commitmentWhere(actor)] },
      include: MEETING_REF,
    });
    if (!row) {
      throw new NotFoundException(`Compromiso "${id}" no encontrado.`);
    }
    return row;
  }

  /** Avisa a las personas recién asignadas o responsables del compromiso. */
  private async notifyPeople(
    actor: CurrentActor,
    row: CommitmentWithMeeting,
    userIds: Array<string | null>,
  ): Promise<void> {
    const origin = row.sourceMeeting ? ` (acta «${row.sourceMeeting.title}»)` : '';
    await this.notifications.notify({
      userIds,
      excludeUserId: actor.userId,
      type: NotificationType.COMMITMENT_ASSIGNED,
      title: 'Nuevo compromiso asignado',
      message: `«${row.title}» vence el ${dateToString(row.dueDate)}${origin}.`,
      link: `/seguimiento/reuniones?tab=compromisos&commitmentId=${encodeURIComponent(row.id)}`,
      requestId: row.relatedProjectRequestId ?? row.relatedRequestId,
    });
  }

  async list(
    actor: CurrentActor,
    filters: ListCommitmentsDto,
  ): Promise<CommitmentResponseDto[]> {
    const where: Prisma.CommitmentWhereInput = {
      AND: [this.scope.commitmentWhere(actor)],
    };
    const and = where.AND as Prisma.CommitmentWhereInput[];
    if (filters.state !== undefined) {
      and.push({ state: filters.state });
    }
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }
    if (filters.assignedUserId !== undefined) {
      and.push({ assignedUserId: filters.assignedUserId });
    }
    if (filters.requestId !== undefined) {
      and.push({
        OR: [
          { relatedRequestId: filters.requestId },
          { relatedProjectRequestId: filters.requestId },
        ],
      });
    }

    const rows = await this.prisma.commitment.findMany({
      where,
      include: MEETING_REF,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(actor: CurrentActor, id: string): Promise<CommitmentResponseDto> {
    const row = await this.requireInScope(actor, id);
    return this.toResponse(row);
  }

  async create(
    actor: CurrentActor,
    dto: CreateCommitmentDto,
  ): Promise<CommitmentResponseDto> {
    const dueDate = dateStringToDate(dto.dueDate);
    if (dto.sourceMeetingId) {
      await this.requireOpenMeeting(actor, dto.sourceMeetingId, dto.processId);
    }
    if (dto.relatedRequestId) {
      await this.requireRequestVisible(actor, dto.relatedRequestId);
    }
    if (dto.relatedProjectRequestId) {
      await this.requireRequestVisible(actor, dto.relatedProjectRequestId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.commitment.create({
        data: {
          processId: dto.processId,
          title: dto.title,
          dueDate,
          ...(dto.sourceMeetingId !== undefined
            ? { sourceMeetingId: dto.sourceMeetingId }
            : {}),
          ...(dto.assignedUserId !== undefined
            ? { assignedUserId: dto.assignedUserId }
            : {}),
          ...(dto.responsibleUserId !== undefined
            ? { responsibleUserId: dto.responsibleUserId }
            : {}),
          ...(dto.relatedRequestId !== undefined
            ? { relatedRequestId: dto.relatedRequestId }
            : {}),
          ...(dto.relatedProjectRequestId !== undefined
            ? { relatedProjectRequestId: dto.relatedProjectRequestId }
            : {}),
          ...(dto.expectedResult !== undefined
            ? { expectedResult: dto.expectedResult }
            : {}),
          ...(dto.result !== undefined ? { result: dto.result } : {}),
          ...(dto.blockers !== undefined ? { blockers: dto.blockers } : {}),
        },
        include: MEETING_REF,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'COMMITMENT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: null,
        after: this.snapshot(row),
      });

      return row;
    });

    await this.notifyPeople(actor, created, [created.assignedUserId, created.responsibleUserId]);
    return this.toResponse(created);
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateCommitmentDto,
  ): Promise<CommitmentResponseDto> {
    const existing = await this.requireInScope(actor, id);
    const dueDate =
      dto.dueDate !== undefined ? dateStringToDate(dto.dueDate) : undefined;
    // Solo se valida el acta si el compromiso se liga a OTRA acta: los
    // compromisos de un acta cerrada siguen editables (seguimiento).
    if (dto.sourceMeetingId && dto.sourceMeetingId !== existing.sourceMeetingId) {
      await this.requireOpenMeeting(actor, dto.sourceMeetingId, existing.processId);
    }
    if (dto.relatedRequestId) {
      await this.requireRequestVisible(actor, dto.relatedRequestId);
    }
    if (dto.relatedProjectRequestId) {
      await this.requireRequestVisible(actor, dto.relatedProjectRequestId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.commitment.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dueDate !== undefined ? { dueDate } : {}),
          ...(dto.sourceMeetingId !== undefined
            ? { sourceMeetingId: dto.sourceMeetingId }
            : {}),
          ...(dto.assignedUserId !== undefined
            ? { assignedUserId: dto.assignedUserId }
            : {}),
          ...(dto.responsibleUserId !== undefined
            ? { responsibleUserId: dto.responsibleUserId }
            : {}),
          ...(dto.relatedRequestId !== undefined
            ? { relatedRequestId: dto.relatedRequestId }
            : {}),
          ...(dto.relatedProjectRequestId !== undefined
            ? { relatedProjectRequestId: dto.relatedProjectRequestId }
            : {}),
          ...(dto.expectedResult !== undefined
            ? { expectedResult: dto.expectedResult }
            : {}),
          ...(dto.result !== undefined ? { result: dto.result } : {}),
          ...(dto.blockers !== undefined ? { blockers: dto.blockers } : {}),
        },
        include: MEETING_REF,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'COMMITMENT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.snapshot(existing),
        after: this.snapshot(row),
      });

      return row;
    });

    const newPeople = [
      updated.assignedUserId !== existing.assignedUserId ? updated.assignedUserId : null,
      updated.responsibleUserId !== existing.responsibleUserId ? updated.responsibleUserId : null,
    ];
    await this.notifyPeople(actor, updated, newPeople);
    return this.toResponse(updated);
  }

  async transition(
    actor: CurrentActor,
    id: string,
    dto: TransitionDto,
  ): Promise<CommitmentResponseDto> {
    const existing = await this.requireInScope(actor, id);
    const toState = this.workflow.assertTransition(existing.state, dto.toState);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.commitment.update({
        where: { id },
        data: { state: toState },
        include: MEETING_REF,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'COMMITMENT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.snapshot(existing),
        after: this.snapshot(row),
      });

      return row;
    });

    return this.toResponse(updated);
  }

  async remove(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireInScope(actor, id);
    if (existing.sourceMeetingId) {
      const meeting = await this.prisma.meeting.findFirst({
        where: { id: existing.sourceMeetingId },
        select: { state: true },
      });
      if (meeting && isMinutesClosed(meeting.state)) {
        throw new ConflictException(
          'El compromiso pertenece a un acta cerrada y forma parte de su registro; no se puede eliminar.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.commitment.delete({ where: { id } });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'COMMITMENT',
        objectId: existing.id,
        scopeProcessId: existing.processId,
        before: this.snapshot(existing),
        after: null,
      });
    });
  }
}
