import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { MeetingModel } from '../../../generated/prisma/models/Meeting';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { CoordinationScopeService } from '../coordination-scope.service';
import { dateStringToDate, dateToString } from '../date';
import { RecordState } from '../record-state';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { ListMeetingsDto } from './dto/list-meetings.dto';
import { MeetingResponseDto } from './dto/meeting-response.dto';
import { DONE_COMMITMENT_STATES, isMinutesClosed } from './minutes';

const COMMITMENT_SELECT = {
  id: true,
  title: true,
  state: true,
  dueDate: true,
  assignedUserId: true,
  responsibleUserId: true,
  expectedResult: true,
  result: true,
} as const;

const MEETING_INCLUDE = {
  participants: { select: { userId: true } },
  commitments: {
    select: COMMITMENT_SELECT,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.MeetingInclude;

/** Reunion con sus participantes y compromisos (para el mapeo de respuesta). */
type MeetingWithRelations = Prisma.MeetingGetPayload<{ include: typeof MEETING_INCLUDE }>;

/**
 * Lógica de reuniones y su ACTA (design §2.2/§4 + unificación con compromisos).
 * El acta nace abierta (BORRADOR); se cierra (COMPLETADO) y desde entonces no se
 * modifica ni se le agregan compromisos; puede reabrirla el líder del proceso o
 * el jefe de área. Los compromisos del acta se devuelven con la reunión.
 * Participantes N:M limitados al alcance. Mutación + AuditEvent en la MISMA
 * `$transaction` (objectType MEETING).
 */
@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: CoordinationScopeService,
  ) {}

  private snapshot(
    row: MeetingModel,
    participantUserIds: string[],
  ): Prisma.InputJsonValue {
    return {
      id: row.id,
      processId: row.processId,
      title: row.title,
      state: row.state,
      meetingDate: dateToString(row.meetingDate),
      meetingTime: row.meetingTime,
      responsibleUserId: row.responsibleUserId,
      relatedRequestId: row.relatedRequestId,
      relatedProjectRequestId: row.relatedProjectRequestId,
      agenda: row.agenda,
      decisions: row.decisions,
      notes: row.notes,
      participantUserIds,
    };
  }

  private toResponse(row: MeetingWithRelations): MeetingResponseDto {
    return {
      id: row.id,
      processId: row.processId,
      title: row.title,
      state: row.state,
      meetingDate: dateToString(row.meetingDate),
      meetingTime: row.meetingTime,
      participantUserIds: row.participants.map((p) => p.userId),
      responsibleUserId: row.responsibleUserId,
      relatedRequestId: row.relatedRequestId,
      relatedProjectRequestId: row.relatedProjectRequestId,
      agenda: row.agenda,
      decisions: row.decisions,
      notes: row.notes,
      closed: isMinutesClosed(row.state),
      commitmentsTotal: row.commitments.length,
      commitmentsOpen: row.commitments.filter((c) => !DONE_COMMITMENT_STATES.has(c.state)).length,
      commitments: row.commitments.map((c) => ({
        id: c.id,
        title: c.title,
        state: c.state,
        dueDate: dateToString(c.dueDate),
        assignedUserId: c.assignedUserId,
        responsibleUserId: c.responsibleUserId,
        expectedResult: c.expectedResult,
        result: c.result,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Valida que todos los participantes esten en el alcance del actor
   * (listPeople). Fuera -> 400 (dato de entrada invalido: el cliente no deberia
   * ofrecer personas fuera del selector).
   */
  private async assertParticipantsInScope(
    actor: CurrentActor,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const people = await this.scope.listPeople(actor);
    const allowed = new Set(people.map((p) => p.id));
    for (const id of userIds) {
      if (!allowed.has(id)) {
        throw new BadRequestException(
          `El participante "${id}" esta fuera de tu alcance.`,
        );
      }
    }
  }

  private async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<MeetingWithRelations> {
    const row = await this.prisma.meeting.findFirst({
      where: { AND: [{ id }, this.scope.meetingWhere(actor)] },
      include: MEETING_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Reunion "${id}" no encontrada.`);
    }
    return row;
  }

  /** Jefe de área o líder del proceso de la reunión. */
  private isManager(actor: CurrentActor, processId: string): boolean {
    return (
      actor.isJefeArea ||
      actor.grants.some(
        (g) => g.roleCode === RoleCode.LIDER_PROCESO && g.processId === processId,
      )
    );
  }

  private assertOpen(row: MeetingModel): void {
    if (isMinutesClosed(row.state)) {
      throw new ConflictException(
        'El acta está cerrada y no admite cambios. Reábrela si necesitas modificarla.',
      );
    }
  }

  async list(
    actor: CurrentActor,
    filters: ListMeetingsDto,
  ): Promise<MeetingResponseDto[]> {
    const where: Prisma.MeetingWhereInput = {
      AND: [this.scope.meetingWhere(actor)],
    };
    const and = where.AND as Prisma.MeetingWhereInput[];
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }
    if (filters.state !== undefined) {
      and.push({ state: filters.state });
    }
    if (filters.requestId !== undefined) {
      and.push({
        OR: [
          { relatedRequestId: filters.requestId },
          { relatedProjectRequestId: filters.requestId },
        ],
      });
    }

    const rows = await this.prisma.meeting.findMany({
      where,
      include: MEETING_INCLUDE,
      orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(actor: CurrentActor, id: string): Promise<MeetingResponseDto> {
    const row = await this.requireInScope(actor, id);
    return this.toResponse(row);
  }

  async create(
    actor: CurrentActor,
    dto: CreateMeetingDto,
  ): Promise<MeetingResponseDto> {
    const meetingDate = dateStringToDate(dto.meetingDate);
    const participantIds = dto.participantUserIds ?? [];
    await this.assertParticipantsInScope(actor, participantIds);
    // De-duplicar por si el cliente repite.
    const uniqueIds = Array.from(new Set(participantIds));

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.meeting.create({
        data: {
          processId: dto.processId,
          title: dto.title,
          meetingDate,
          ...(dto.meetingTime !== undefined
            ? { meetingTime: dto.meetingTime }
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
          ...(dto.agenda !== undefined ? { agenda: dto.agenda } : {}),
          ...(dto.decisions !== undefined ? { decisions: dto.decisions } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(uniqueIds.length > 0
            ? {
                participants: {
                  create: uniqueIds.map((userId) => ({ userId })),
                },
              }
            : {}),
        },
        include: MEETING_INCLUDE,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'MEETING',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: null,
        after: this.snapshot(
          row,
          row.participants.map((p) => p.userId),
        ),
      });

      return row;
    });

    return this.toResponse(created);
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateMeetingDto,
  ): Promise<MeetingResponseDto> {
    const existing = await this.requireInScope(actor, id);
    // El acta cerrada es un registro: se reabre explícitamente (POST /reopen).
    this.assertOpen(existing);
    if (dto.state !== undefined && isMinutesClosed(dto.state)) {
      throw new BadRequestException(
        'Para cerrar el acta usa la acción «Cerrar acta».',
      );
    }
    const meetingDate =
      dto.meetingDate !== undefined
        ? dateStringToDate(dto.meetingDate)
        : undefined;

    let uniqueIds: string[] | undefined;
    if (dto.participantUserIds !== undefined) {
      await this.assertParticipantsInScope(actor, dto.participantUserIds);
      uniqueIds = Array.from(new Set(dto.participantUserIds));
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (uniqueIds !== undefined) {
        // Reemplazo del set de participantes (design §3).
        await tx.meetingParticipant.deleteMany({ where: { meetingId: id } });
        if (uniqueIds.length > 0) {
          await tx.meetingParticipant.createMany({
            data: uniqueIds.map((userId) => ({ meetingId: id, userId })),
          });
        }
      }

      const row = await tx.meeting.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.state !== undefined ? { state: dto.state } : {}),
          ...(meetingDate !== undefined ? { meetingDate } : {}),
          ...(dto.meetingTime !== undefined
            ? { meetingTime: dto.meetingTime }
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
          ...(dto.agenda !== undefined ? { agenda: dto.agenda } : {}),
          ...(dto.decisions !== undefined ? { decisions: dto.decisions } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: MEETING_INCLUDE,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'MEETING',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.snapshot(
          existing,
          existing.participants.map((p) => p.userId),
        ),
        after: this.snapshot(
          row,
          row.participants.map((p) => p.userId),
        ),
      });

      return row;
    });

    return this.toResponse(updated);
  }

  /**
   * Cierra el acta (BORRADOR/EN_CURSO -> COMPLETADO). Lo hace el responsable de
   * la reunión, el líder del proceso o el jefe de área. Exige que el acta tenga
   * registrado algo de lo acordado: decisiones o al menos un compromiso.
   */
  async close(actor: CurrentActor, id: string): Promise<MeetingResponseDto> {
    const existing = await this.requireInScope(actor, id);
    this.assertOpen(existing);
    if (
      existing.responsibleUserId !== actor.userId &&
      !this.isManager(actor, existing.processId)
    ) {
      throw new ForbiddenException(
        'Solo el responsable de la reunión, el líder del proceso o el jefe de área pueden cerrar el acta.',
      );
    }
    if (!existing.decisions?.trim() && existing.commitments.length === 0) {
      throw new ConflictException(
        'Registra las decisiones o al menos un compromiso antes de cerrar el acta.',
      );
    }
    return this.setState(actor, existing, RecordState.COMPLETADO);
  }

  /** Reabre un acta cerrada (-> BORRADOR). Solo líder del proceso o jefe de área. */
  async reopen(actor: CurrentActor, id: string): Promise<MeetingResponseDto> {
    const existing = await this.requireInScope(actor, id);
    if (!isMinutesClosed(existing.state)) {
      throw new ConflictException('El acta ya está abierta.');
    }
    if (!this.isManager(actor, existing.processId)) {
      throw new ForbiddenException(
        'Solo el líder del proceso o el jefe de área pueden reabrir un acta.',
      );
    }
    return this.setState(actor, existing, RecordState.BORRADOR);
  }

  private async setState(
    actor: CurrentActor,
    existing: MeetingWithRelations,
    state: RecordState,
  ): Promise<MeetingResponseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.meeting.update({
        where: { id: existing.id },
        data: { state },
        include: MEETING_INCLUDE,
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'MEETING',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: { state: existing.state },
        after: { state: row.state },
      });
      return row;
    });
    return this.toResponse(updated);
  }

  async remove(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireInScope(actor, id);
    this.assertOpen(existing);
    if (existing.commitments.length > 0) {
      throw new ConflictException(
        'No se puede eliminar un acta con compromisos registrados; elimina o reasigna primero sus compromisos.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Cascade de participantes por el schema (onDelete: Cascade).
      await tx.meeting.delete({ where: { id } });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'MEETING',
        objectId: existing.id,
        scopeProcessId: existing.processId,
        before: this.snapshot(
          existing,
          existing.participants.map((p) => p.userId),
        ),
        after: null,
      });
    });
  }
}
