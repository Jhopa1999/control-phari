import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { CommitmentModel } from '../../../generated/prisma/models/Commitment';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import {
  NotificationService,
  NotificationType,
} from '../../notification/notification.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorkflowStateService } from '../workflow-state.service';
import { dateStringToDate, dateToString } from '../date';
import { isMinutesClosed } from '../meeting/minutes';
import { localToday } from '../local-day';
import { OPEN_COMMITMENT_STATES, dueStatusOf } from './commitment-due';
import {
  COMMITMENT_DUE_DEFAULTS,
  COMMITMENT_PARAM_CATALOG,
  COMMITMENT_PARAM_CODES,
  assertDueDateInRange,
  dueDateRangeOf,
  parseYearsParam,
  type DueDateRange,
} from './commitment-due-range';
import {
  loadRelatedRequests,
  relatedRequestIdOf,
  relatedRequestSearchClauses,
  type RelatedRequestInfo,
} from '../related-request';
import {
  buildPageResult,
  normalizeSearch,
  resolvePage,
  type PageResult,
} from '../../../common/pagination/pagination';
import { CommitmentMyWorkDto } from './dto/commitment-my-work.dto';
import { RecordState } from '../record-state';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { UpdateCommitmentDto } from './dto/update-commitment.dto';
import { ListCommitmentsDto } from './dto/list-commitments.dto';
import { TransitionDto } from '../dto/transition.dto';
import { CommitmentResponseDto } from './dto/commitment-response.dto';

/** Tope de filas de `GET /commitments/my-work` (los contadores siguen siendo exactos). */
export const MY_WORK_COMMITMENTS_LIMIT = 200;

/** Reinicia las marcas de los avisos de vencimiento (permite un aviso nuevo). */
const CLEAR_NOTICE_MARKS = {
  dueSoonNotifiedAt: null,
  dueTodayNotifiedAt: null,
  overdueNotifiedAt: null,
} as const;

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

  private toResponse(
    row: CommitmentWithMeeting,
    related: ReadonlyMap<string, RelatedRequestInfo> = new Map(),
  ): CommitmentResponseDto {
    const due = dueStatusOf(row.dueDate, row.state, localToday());
    const requestId = relatedRequestIdOf(row);
    const request = requestId ? related.get(requestId) : undefined;
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
      relatedRequestCode: request?.code ?? null,
      relatedRequestTitle: request?.title ?? null,
      expectedResult: row.expectedResult,
      result: row.result,
      blockers: row.blockers,
      dueStatus: due.status,
      daysToDue: due.daysToDue,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Cambia el contexto de los avisos: otra fecha de vencimiento u otra persona
   * destinataria (asignado, o responsable cuando no hay asignado).
   */
  private noticeContextChanged(
    existing: CommitmentModel,
    dto: UpdateCommitmentDto,
    dueDate: Date | undefined,
  ): boolean {
    if (dueDate !== undefined && dueDate.getTime() !== existing.dueDate.getTime()) {
      return true;
    }
    const recipient = (assigned: string | null, responsible: string | null) =>
      assigned ?? responsible;
    const next = recipient(
      dto.assignedUserId !== undefined ? dto.assignedUserId : existing.assignedUserId,
      dto.responsibleUserId !== undefined ? dto.responsibleUserId : existing.responsibleUserId,
    );
    return next !== recipient(existing.assignedUserId, existing.responsibleUserId);
  }

  /** Request relacionada por visibilidad real de Fase 2 (404 fuera). */
  private requireRequestVisible(actor: CurrentActor, requestId: string): Promise<void> {
    return this.scope.assertRequestVisible(actor, requestId);
  }

  /**
   * Rango aceptado para el vencimiento (D5): años hacia atrás y adelante desde
   * hoy, de la maestra COMMITMENT_PARAM con valor seguro por defecto.
   */
  private async dueRange(): Promise<DueDateRange> {
    let rows: Array<{ code: string; label: string }> = [];
    try {
      rows = await this.prisma.catalogItem.findMany({
        where: {
          catalog: COMMITMENT_PARAM_CATALOG,
          active: true,
          code: { in: Object.values(COMMITMENT_PARAM_CODES) },
        },
        select: { code: true, label: true },
      });
    } catch {
      // Sin acceso a la maestra se aplican los valores por defecto.
    }
    const byCode = new Map(rows.map((row) => [row.code, row.label]));
    return dueDateRangeOf(
      localToday(),
      parseYearsParam(
        byCode.get(COMMITMENT_PARAM_CODES.dueYearsBack),
        COMMITMENT_DUE_DEFAULTS.yearsBack,
      ),
      parseYearsParam(
        byCode.get(COMMITMENT_PARAM_CODES.dueYearsAhead),
        COMMITMENT_DUE_DEFAULTS.yearsAhead,
      ),
    );
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
      select: { id: true, state: true, processId: true, responsibleUserId: true },
    });
    if (!meeting) {
      throw new NotFoundException('No se encontró la reunión.');
    }
    this.assertCanEditMinutes(actor, meeting);
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

  /**
   * Agregar o cambiar compromisos del acta lo hace quien la dirige: responsable,
   * líder del proceso o jefe de área. Un participante solo da seguimiento a los
   * compromisos asignados a él (completar, transicionar, resultado, bloqueos).
   */
  private assertCanEditMinutes(
    actor: CurrentActor,
    meeting: { processId: string; responsibleUserId: string | null },
  ): void {
    const canEdit =
      actor.isJefeArea ||
      meeting.responsibleUserId === actor.userId ||
      actor.grants.some(
        (g) => g.roleCode === RoleCode.LIDER_PROCESO && g.processId === meeting.processId,
      );
    if (!canEdit) {
      throw new ForbiddenException(
        'Solo el responsable del acta, el líder del proceso o el jefe de área pueden agregar o cambiar los compromisos del acta.',
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
      throw new NotFoundException('No se encontró el compromiso.');
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
  ): Promise<PageResult<CommitmentResponseDto>> {
    const where: Prisma.CommitmentWhereInput = {
      AND: [this.scope.commitmentWhere(actor)],
    };
    const and = where.AND as Prisma.CommitmentWhereInput[];
    if (filters.state !== undefined) {
      and.push({ state: filters.state });
    }
    if (filters.view === 'ABIERTOS') {
      and.push({ state: { in: [...OPEN_COMMITMENT_STATES] } });
    } else if (filters.view === 'VENCIDOS') {
      and.push({ state: { in: [...OPEN_COMMITMENT_STATES] }, dueDate: { lt: localToday() } });
    } else if (filters.view === 'TERMINADOS') {
      and.push({ state: { notIn: [...OPEN_COMMITMENT_STATES] } });
    }
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }
    if (filters.assignedUserId !== undefined) {
      and.push({ assignedUserId: filters.assignedUserId });
    }
    if (filters.personId !== undefined) {
      and.push({
        OR: [{ assignedUserId: filters.personId }, { responsibleUserId: filters.personId }],
      });
    }
    if (filters.withoutMeeting === true) {
      and.push({ sourceMeetingId: null });
    } else if (filters.meetingId !== undefined) {
      and.push({ sourceMeetingId: filters.meetingId });
    }
    if (filters.requestId !== undefined) {
      and.push({
        OR: [
          { relatedRequestId: filters.requestId },
          { relatedProjectRequestId: filters.requestId },
        ],
      });
    }
    const q = normalizeSearch(filters.q);
    if (q !== undefined) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { expectedResult: { contains: q, mode: 'insensitive' } },
          { sourceMeeting: { is: { title: { contains: q, mode: 'insensitive' } } } },
          ...relatedRequestSearchClauses(actor, q),
        ],
      });
    }

    const window = resolvePage(filters);
    const dir = filters.dir ?? 'asc';
    const [rows, total] = await Promise.all([
      this.prisma.commitment.findMany({
        where,
        include: MEETING_REF,
        orderBy: [{ dueDate: dir }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.commitment.count({ where }),
    ]);
    const related = await loadRelatedRequests(this.prisma, actor, rows);
    return buildPageResult(
      rows.map((row) => this.toResponse(row, related)),
      total,
      window,
    );
  }

  /**
   * Compromisos abiertos de la persona (asignada; si no hay asignado, la
   * responsable) para Mi trabajo: todos, los más urgentes primero, con tope de
   * `MY_WORK_COMMITMENTS_LIMIT` filas y contadores exactos. La condición
   * personal ya es más estricta que el alcance de lectura, así que no se
   * combina con `commitmentWhere`: un líder conserva los suyos de procesos que
   * no lidera. El total es la suma de los tres contadores, de modo que nunca
   * contradice a las filas.
   */
  async myWork(actor: CurrentActor): Promise<CommitmentMyWorkDto> {
    const today = localToday();
    const mine: Prisma.CommitmentWhereInput = {
      state: { in: [...OPEN_COMMITMENT_STATES] },
      OR: [
        { assignedUserId: actor.userId },
        { assignedUserId: null, responsibleUserId: actor.userId },
      ],
    };
    // Lectura consistente: contadores y filas salen del mismo instante, así que
    // `total` no descuadra con `items` por una escritura concurrente.
    const [overdueCount, dueTodayCount, upcomingCount, rows] = await this.prisma.$transaction(
      (tx) =>
        Promise.all([
          tx.commitment.count({ where: { AND: [mine, { dueDate: { lt: today } }] } }),
          tx.commitment.count({ where: { AND: [mine, { dueDate: today }] } }),
          tx.commitment.count({ where: { AND: [mine, { dueDate: { gt: today } }] } }),
          tx.commitment.findMany({
            where: mine,
            include: {
              ...MEETING_REF,
              process: { select: { name: true } },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
            take: MY_WORK_COMMITMENTS_LIMIT,
          }),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const items: CommitmentMyWorkDto['items'] = rows.map((row) => {
      const due = dueStatusOf(row.dueDate, row.state, today);
      return {
        id: row.id,
        title: row.title,
        state: row.state,
        dueDate: dateToString(row.dueDate),
        dueStatus: due.status as string,
        daysToDue: due.daysToDue as number,
        processId: row.processId,
        processName: row.process.name,
        sourceMeetingId: row.sourceMeetingId,
        sourceMeetingTitle: row.sourceMeeting?.title ?? null,
        expectedResult: row.expectedResult,
        blockers: row.blockers,
        canComplete: true,
      };
    });
    const total = overdueCount + dueTodayCount + upcomingCount;
    return {
      total,
      overdueCount,
      dueTodayCount,
      upcomingCount,
      truncated: total > items.length,
      items,
    };
  }

  async get(actor: CurrentActor, id: string): Promise<CommitmentResponseDto> {
    const row = await this.requireInScope(actor, id);
    return this.toResponse(row, await loadRelatedRequests(this.prisma, actor, [row]));
  }

  async create(
    actor: CurrentActor,
    dto: CreateCommitmentDto,
  ): Promise<CommitmentResponseDto> {
    const dueDate = dateStringToDate(dto.dueDate);
    assertDueDateInRange(dueDate, await this.dueRange());
    await this.scope.assertActorInProcess(actor, dto.processId);
    await this.scope.assertPeopleInProcess(dto.processId, [
      dto.assignedUserId,
      dto.responsibleUserId,
    ]);
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
    return this.toResponse(created, await loadRelatedRequests(this.prisma, actor, [created]));
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateCommitmentDto,
  ): Promise<CommitmentResponseDto> {
    const existing = await this.requireInScope(actor, id);
    const dueDate =
      dto.dueDate !== undefined ? dateStringToDate(dto.dueDate) : undefined;
    // El límite de fechas solo aplica cuando la fecha cambia: un compromiso
    // viejo sigue editable aunque su vencimiento ya quede fuera del rango.
    if (dueDate !== undefined && dueDate.getTime() !== existing.dueDate.getTime()) {
      assertDueDateInRange(dueDate, await this.dueRange());
    }
    // Solo se validan las personas que cambian: reenviar el valor guardado no
    // debe bloquear la edición si esa persona ya salió del proceso.
    await this.scope.assertPeopleInProcess(existing.processId, [
      dto.assignedUserId !== existing.assignedUserId ? dto.assignedUserId : undefined,
      dto.responsibleUserId !== existing.responsibleUserId
        ? dto.responsibleUserId
        : undefined,
    ]);
    // Los campos de seguimiento (resultado, bloqueos) los puede trabajar quien
    // tiene asignado el compromiso; el resto del compromiso de un acta lo
    // cambia quien la dirige.
    if (
      existing.sourceMeetingId &&
      Object.entries(dto).some(
        ([key, value]) => value !== undefined && key !== 'result' && key !== 'blockers',
      )
    ) {
      const source = await this.prisma.meeting.findFirst({
        where: { id: existing.sourceMeetingId },
        select: { processId: true, responsibleUserId: true },
      });
      if (source) {
        this.assertCanEditMinutes(actor, source);
      }
    }
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
          ...(this.noticeContextChanged(existing, dto, dueDate) ? CLEAR_NOTICE_MARKS : {}),
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
    return this.toResponse(updated, await loadRelatedRequests(this.prisma, actor, [updated]));
  }

  async transition(
    actor: CurrentActor,
    id: string,
    dto: TransitionDto,
  ): Promise<CommitmentResponseDto> {
    const existing = await this.requireInScope(actor, id);
    const toState = this.workflow.assertTransition(existing.state, dto.toState);
    if (dto.blockedReason !== undefined && toState !== RecordState.BLOQUEADO) {
      throw new BadRequestException('El motivo del bloqueo solo aplica al marcar el compromiso como bloqueado.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.commitment.update({
        where: { id },
        data: {
          state: toState,
          ...(toState === RecordState.BLOQUEADO && dto.blockedReason !== undefined
            ? { blockers: dto.blockedReason }
            : {}),
          // Reabrir permite un nuevo aviso con la nueva realidad.
          ...(toState === RecordState.EN_CURSO &&
          (existing.state === RecordState.COMPLETADO ||
            existing.state === RecordState.ARCHIVADO)
            ? CLEAR_NOTICE_MARKS
            : {}),
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

    return this.toResponse(updated, await loadRelatedRequests(this.prisma, actor, [updated]));
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
