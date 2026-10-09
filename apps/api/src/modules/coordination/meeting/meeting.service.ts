import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { MeetingModel } from '../../../generated/prisma/models/Meeting';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { CoordinationScopeService } from '../coordination-scope.service';
import { dateStringToDate, dateToString } from '../date';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { ListMeetingsDto } from './dto/list-meetings.dto';
import { MeetingResponseDto } from './dto/meeting-response.dto';

/** Reunion con sus participantes (para el mapeo de respuesta). */
type MeetingWithParticipants = MeetingModel & {
  participants: { userId: string }[];
};

/**
 * Logica de reuniones (design §2.2/§4). Estado inicial BORRADOR; participantes
 * N:M limitados al alcance (listPeople). Alcance via CoordinationScopeService
 * (participante o responsable). Mutacion + AuditEvent en la MISMA
 * `$transaction` (objectType MEETING). Sin acta/notificacion/compromiso-auto.
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

  private toResponse(row: MeetingWithParticipants): MeetingResponseDto {
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
  ): Promise<MeetingWithParticipants> {
    const row = await this.prisma.meeting.findFirst({
      where: { AND: [{ id }, this.scope.meetingWhere(actor)] },
      include: { participants: { select: { userId: true } } },
    });
    if (!row) {
      throw new NotFoundException(`Reunion "${id}" no encontrada.`);
    }
    return row;
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

    const rows = await this.prisma.meeting.findMany({
      where,
      include: { participants: { select: { userId: true } } },
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
        include: { participants: { select: { userId: true } } },
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
        include: { participants: { select: { userId: true } } },
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

  async remove(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireInScope(actor, id);

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
