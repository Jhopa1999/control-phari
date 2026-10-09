import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { CommitmentModel } from '../../../generated/prisma/models/Commitment';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorkflowStateService } from '../workflow-state.service';
import { dateStringToDate, dateToString } from '../date';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { UpdateCommitmentDto } from './dto/update-commitment.dto';
import { ListCommitmentsDto } from './dto/list-commitments.dto';
import { TransitionDto } from '../dto/transition.dto';
import { CommitmentResponseDto } from './dto/commitment-response.dto';

/**
 * Logica de compromisos (design §2.2/§4). Mismo WorkflowStateService que Issue
 * (grafo RECORD_STATE reversible). Sin auto-creacion desde reunion
 * (`sourceMeetingId` solo relaciona, §11 D7). Alcance via
 * CoordinationScopeService (asignado/responsable). Mutacion + AuditEvent en la
 * MISMA `$transaction` (objectType COMMITMENT).
 */
@Injectable()
export class CommitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: CoordinationScopeService,
    private readonly workflow: WorkflowStateService,
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

  private toResponse(row: CommitmentModel): CommitmentResponseDto {
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

  /** Reunion fuente por alcance de reuniones (404 fuera). */
  private async requireMeetingVisible(
    actor: CurrentActor,
    meetingId: string,
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { AND: [{ id: meetingId }, this.scope.meetingWhere(actor)] },
      select: { id: true },
    });
    if (!meeting) {
      throw new NotFoundException(`Reunion "${meetingId}" no encontrada.`);
    }
  }

  private async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<CommitmentModel> {
    const row = await this.prisma.commitment.findFirst({
      where: { AND: [{ id }, this.scope.commitmentWhere(actor)] },
    });
    if (!row) {
      throw new NotFoundException(`Compromiso "${id}" no encontrado.`);
    }
    return row;
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

    const rows = await this.prisma.commitment.findMany({
      where,
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
      await this.requireMeetingVisible(actor, dto.sourceMeetingId);
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
    if (dto.sourceMeetingId) {
      await this.requireMeetingVisible(actor, dto.sourceMeetingId);
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
