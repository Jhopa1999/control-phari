import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { MonthlyAvailabilityModel } from '../../generated/prisma/models/MonthlyAvailability';
import type { AssignmentModel } from '../../generated/prisma/models/Assignment';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CapacityScopeService } from './capacity-scope.service';
import { dateToMonthString, monthStringToDate } from './month';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { ListAvailabilityDto } from './dto/list-availability.dto';
import { ListAssignmentsDto } from './dto/list-assignments.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';
import { AssignmentResponseDto } from './dto/assignment-response.dto';
import {
  CapacitySummaryEstado,
  CapacitySummaryRowDto,
} from './dto/capacity-summary-row.dto';

/**
 * Logica de capacidad (design §2): disponibilidad por persona/mes, asignaciones
 * de horas y resumen de carga server-side. Sigue el patron de RequestService:
 * alcance en el `where` (404 por findFirst fuera de alcance), mutacion +
 * AuditEvent en la misma `$transaction`, P2002 -> ConflictException. El alcance
 * POR PERSONA lo resuelve siempre `CapacityScopeService.scopedUserIds` (D1/§2.6).
 */
@Injectable()
export class CapacityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: CapacityScopeService,
  ) {}

  // --- Snapshots para auditoria -------------------------------------------

  private availabilitySnapshot(
    row: MonthlyAvailabilityModel,
  ): Prisma.InputJsonValue {
    return {
      id: row.id,
      userId: row.userId,
      month: dateToMonthString(row.month),
      availableHours: row.availableHours,
    };
  }

  private assignmentSnapshot(row: AssignmentModel): Prisma.InputJsonValue {
    return {
      id: row.id,
      userId: row.userId,
      month: dateToMonthString(row.month),
      processId: row.processId,
      requestId: row.requestId,
      committedHours: row.committedHours,
      description: row.description,
    };
  }

  // --- Mapeo a DTOs de respuesta ------------------------------------------

  private toAvailabilityResponse(
    row: MonthlyAvailabilityModel,
  ): AvailabilityResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      month: dateToMonthString(row.month),
      availableHours: row.availableHours,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAssignmentResponse(row: AssignmentModel): AssignmentResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      month: dateToMonthString(row.month),
      processId: row.processId,
      requestId: row.requestId,
      committedHours: row.committedHours,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // --- Helpers de alcance --------------------------------------------------

  /**
   * `where` del proceso para asignaciones (Plano A directo, design §2.5):
   * - jefe -> sin filtro (ve el area);
   * - lider (con `scopedProcessIds`) -> `processId ∈ scopedProcessIds`;
   * - integrante PURO (`scopedProcessIds` vacio) -> SIN filtro de proceso: su
   *   alcance de asignaciones es "solo las suyas", acotado por `userId ∈
   *   scopedUserIds` (que para el integrante es `{ el mismo }`). Filtrar por
   *   `processId: { in: [] }` NO matchearia ninguna fila (ni la propia), dejando
   *   inoperante el flujo del integrante (UC-011/US-007/FLOW-007).
   */
  private assignmentProcessWhere(
    actor: CurrentActor,
  ): Prisma.AssignmentWhereInput {
    if (actor.isJefeArea || actor.scopedProcessIds.size === 0) {
      return {};
    }
    return { processId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /**
   * Verifica que una persona objetivo este en el alcance del actor para una
   * ESCRITURA (design §2.1/§2.5, FINDING 6): el integrante que intenta operar
   * sobre `userId` ajeno -> 403 (regla "solo la suya"); el lider sobre una
   * persona fuera de `scopedUserIds` -> 404 (no existe para el).
   */
  private async requireWritablePerson(
    actor: CurrentActor,
    targetUserId: string,
  ): Promise<void> {
    if (actor.isJefeArea) {
      return;
    }

    const scoped = await this.scope.scopedUserIds(this.prisma, actor);
    if (scoped === 'ALL') {
      return;
    }
    if (!scoped.includes(targetUserId)) {
      // Politica 403 vs 404 (design §2.5 D8/FINDING 6): un integrante PURO (sin
      // alcance de proceso) que intenta registrar capacidad ajena viola la regla
      // "solo la suya" -> 403; un lider (con procesos) sobre una persona fuera de
      // su alcance -> 404 (la persona "no existe para el").
      const isPureIntegrante = actor.scopedProcessIds.size === 0;
      if (isPureIntegrante && targetUserId !== actor.userId) {
        throw new ForbiddenException(
          'Solo puedes registrar tu propia capacidad.',
        );
      }
      throw new NotFoundException(
        `Persona "${targetUserId}" fuera de tu alcance.`,
      );
    }
  }

  /**
   * Resuelve el `processId` de una asignacion dentro del alcance del actor o
   * lanza 404 (design §2.2): el proceso "no existe para ti" si esta fuera.
   * - jefe -> cualquier proceso existente;
   * - lider (con `scopedProcessIds`) -> solo `processId ∈ scopedProcessIds`;
   * - integrante PURO (`scopedProcessIds` vacio) -> cualquier proceso
   *   existente (su acotacion es por `userId`, ya aplicada en
   *   `requireWritablePerson`); filtrar por `id: { in: [] }` le impediria
   *   CREAR su propia asignacion.
   */
  private async requireProcessInScope(
    actor: CurrentActor,
    processId: string,
  ): Promise<void> {
    const noProcessScope =
      actor.isJefeArea || actor.scopedProcessIds.size === 0;
    const process = await this.prisma.process.findFirst({
      where: {
        AND: [
          { id: processId },
          noProcessScope
            ? {}
            : { id: { in: Array.from(actor.scopedProcessIds) } },
        ],
      },
      select: { id: true },
    });
    if (!process) {
      throw new NotFoundException(`Proceso "${processId}" fuera de tu alcance.`);
    }
  }

  /**
   * Resuelve una Request por id aplicando el MISMO `scopeWhere` que
   * request.service.ts (design §2.2, FINDING 3): inexistente o fuera de alcance
   * -> 404 (nunca 400). El `requestId` opcional no amplia el alcance.
   */
  private async requireRequestInScope(
    actor: CurrentActor,
    requestId: string,
  ): Promise<void> {
    const scopeWhere: Prisma.RequestWhereInput = actor.isJefeArea
      ? {}
      : { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };

    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: requestId }, scopeWhere] },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud "${requestId}" no encontrada.`,
      );
    }
  }

  // --- Disponibilidad ------------------------------------------------------

  async createAvailability(
    actor: CurrentActor,
    dto: CreateAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    await this.requireWritablePerson(actor, dto.userId);
    const monthDate = monthStringToDate(dto.month);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.monthlyAvailability.create({
          data: {
            userId: dto.userId,
            month: monthDate,
            availableHours: dto.availableHours,
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'MONTHLY_AVAILABILITY',
          objectId: row.id,
          scopeProcessId: null,
          before: null,
          after: this.availabilitySnapshot(row),
        });

        return row;
      });

      return this.toAvailabilityResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe disponibilidad para esa persona y mes; editala.',
        );
      }
      throw error;
    }
  }

  async updateAvailability(
    actor: CurrentActor,
    id: string,
    dto: UpdateAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    const scoped = await this.scope.scopedUserIds(this.prisma, actor);
    const existing = await this.prisma.monthlyAvailability.findFirst({
      where: {
        AND: [
          { id },
          scoped === 'ALL' ? {} : { userId: { in: scoped } },
        ],
      },
    });
    if (!existing) {
      throw new NotFoundException(`Disponibilidad "${id}" no encontrada.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.monthlyAvailability.update({
        where: { id },
        data: { availableHours: dto.availableHours },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'MONTHLY_AVAILABILITY',
        objectId: row.id,
        scopeProcessId: null,
        before: this.availabilitySnapshot(existing),
        after: this.availabilitySnapshot(row),
      });

      return row;
    });

    return this.toAvailabilityResponse(updated);
  }

  async listAvailability(
    actor: CurrentActor,
    filters: ListAvailabilityDto,
  ): Promise<AvailabilityResponseDto[]> {
    const scoped = await this.scope.scopedUserIds(this.prisma, actor);
    const where: Prisma.MonthlyAvailabilityWhereInput = {
      month: monthStringToDate(filters.month),
    };
    if (scoped !== 'ALL') {
      where.userId = { in: scoped };
    }

    const rows = await this.prisma.monthlyAvailability.findMany({
      where,
      orderBy: { userId: 'asc' },
    });

    return rows.map((row) => this.toAvailabilityResponse(row));
  }

  // --- Asignaciones --------------------------------------------------------

  async createAssignment(
    actor: CurrentActor,
    dto: CreateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    await this.requireWritablePerson(actor, dto.userId);
    await this.requireProcessInScope(actor, dto.processId);
    if (dto.requestId !== undefined) {
      await this.requireRequestInScope(actor, dto.requestId);
    }

    const monthDate = monthStringToDate(dto.month);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.assignment.create({
        data: {
          userId: dto.userId,
          month: monthDate,
          processId: dto.processId,
          committedHours: dto.committedHours,
          ...(dto.requestId !== undefined ? { requestId: dto.requestId } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'ASSIGNMENT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: null,
        after: this.assignmentSnapshot(row),
      });

      return row;
    });

    return this.toAssignmentResponse(created);
  }

  private async requireAssignmentInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<AssignmentModel> {
    const scoped = await this.scope.scopedUserIds(this.prisma, actor);
    const row = await this.prisma.assignment.findFirst({
      where: {
        AND: [
          { id },
          this.assignmentProcessWhere(actor),
          scoped === 'ALL' ? {} : { userId: { in: scoped } },
        ],
      },
    });
    if (!row) {
      throw new NotFoundException(`Asignacion "${id}" no encontrada.`);
    }
    return row;
  }

  async updateAssignment(
    actor: CurrentActor,
    id: string,
    dto: UpdateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    const existing = await this.requireAssignmentInScope(actor, id);

    if (dto.processId !== undefined) {
      await this.requireProcessInScope(actor, dto.processId);
    }
    // requestId set/clear (design §2.2): omitido -> sin cambio; null -> desligar
    // (no requiere validar alcance); UUID -> ligar validando alcance (404 fuera).
    if (dto.requestId != null) {
      await this.requireRequestInScope(actor, dto.requestId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.assignment.update({
        where: { id },
        data: {
          ...(dto.processId !== undefined ? { processId: dto.processId } : {}),
          ...(dto.requestId !== undefined ? { requestId: dto.requestId } : {}),
          ...(dto.committedHours !== undefined
            ? { committedHours: dto.committedHours }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'ASSIGNMENT',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.assignmentSnapshot(existing),
        after: this.assignmentSnapshot(row),
      });

      return row;
    });

    return this.toAssignmentResponse(updated);
  }

  async removeAssignment(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireAssignmentInScope(actor, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.delete({ where: { id } });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'ASSIGNMENT',
        objectId: existing.id,
        scopeProcessId: existing.processId,
        before: this.assignmentSnapshot(existing),
        after: null,
      });
    });
  }

  async listAssignments(
    actor: CurrentActor,
    filters: ListAssignmentsDto,
  ): Promise<AssignmentResponseDto[]> {
    const scoped = await this.scope.scopedUserIds(this.prisma, actor);
    const where: Prisma.AssignmentWhereInput = {
      month: monthStringToDate(filters.month),
      ...this.assignmentProcessWhere(actor),
    };
    if (scoped !== 'ALL') {
      where.userId = { in: scoped };
    }
    // Filtros opcionales: se INTERSECTAN con el alcance (nunca lo amplian).
    if (filters.processId !== undefined) {
      where.processId = actor.isJefeArea
        ? filters.processId
        : {
            in: Array.from(actor.scopedProcessIds).filter(
              (pid) => pid === filters.processId,
            ),
          };
    }
    if (filters.userId !== undefined) {
      if (scoped === 'ALL') {
        where.userId = filters.userId;
      } else {
        where.userId = {
          in: scoped.filter((uid) => uid === filters.userId),
        };
      }
    }
    if (filters.requestId !== undefined) {
      where.requestId = filters.requestId;
    }

    const rows = await this.prisma.assignment.findMany({
      where,
      orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => this.toAssignmentResponse(row));
  }

  // --- Resumen de carga ----------------------------------------------------

  async summary(
    actor: CurrentActor,
    query: SummaryQueryDto,
  ): Promise<CapacitySummaryRowDto[]> {
    const monthDate = monthStringToDate(query.month);
    const monthStr = query.month;
    const scoped = await this.scope.scopedUserIds(this.prisma, actor);

    const userIn: string[] | null = scoped === 'ALL' ? null : scoped;

    // Disponibilidad en alcance (una fila por persona/mes).
    const availabilities = await this.prisma.monthlyAvailability.findMany({
      where: {
        month: monthDate,
        ...(userIn ? { userId: { in: userIn } } : {}),
      },
    });

    // Asignaciones visibles en alcance (processId para no-jefe; userId siempre).
    const visibleAssignments = await this.prisma.assignment.findMany({
      where: {
        month: monthDate,
        ...this.assignmentProcessWhere(actor),
        ...(userIn ? { userId: { in: userIn } } : {}),
      },
    });

    // Conjunto de personas con disponibilidad o carga visible ese mes.
    const userIds = new Set<string>();
    for (const a of availabilities) userIds.add(a.userId);
    for (const a of visibleAssignments) userIds.add(a.userId);

    if (userIds.size === 0) {
      return [];
    }

    // Nombres de las personas involucradas.
    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const availableByUser = new Map<string, number>();
    for (const a of availabilities) {
      availableByUser.set(a.userId, a.availableHours);
    }

    const committedByUser = new Map<string, number>();
    for (const a of visibleAssignments) {
      committedByUser.set(
        a.userId,
        (committedByUser.get(a.userId) ?? 0) + a.committedHours,
      );
    }

    // Deteccion de carga fuera de alcance (FINDING 4): existencia de
    // asignaciones de esas personas en procesos NO en alcance. Solo aplica al
    // LIDER (tiene procesos y por tanto una frontera de alcance de proceso). El
    // JEFE ve el total agregado (sin "fuera de alcance") y el INTEGRANTE PURO ve
    // TODAS sus propias asignaciones (su alcance es por `userId`, sin frontera
    // de proceso): para ambos `cargaParcial` siempre es `false`.
    const outOfScopeUsers = new Set<string>();
    if (!actor.isJefeArea && actor.scopedProcessIds.size > 0) {
      const scopedProcessIds = Array.from(actor.scopedProcessIds);
      const outside = await this.prisma.assignment.findMany({
        where: {
          month: monthDate,
          userId: { in: Array.from(userIds) },
          processId: { notIn: scopedProcessIds },
        },
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const row of outside) outOfScopeUsers.add(row.userId);
    }

    const rows: CapacitySummaryRowDto[] = Array.from(userIds).map((userId) => {
      const disponible = availableByUser.has(userId)
        ? availableByUser.get(userId)!
        : null;
      const comprometido = committedByUser.get(userId) ?? 0;
      const cargaParcial = outOfScopeUsers.has(userId);

      let utilizacion: number | null = null;
      let libre: number | null = null;
      let sobrecargado = false;
      let estado: CapacitySummaryEstado;

      if (cargaParcial) {
        // Carga parcial: no se mezcla disponible total con comprometido parcial.
        estado = 'CARGA_PARCIAL';
      } else if (disponible === null || disponible === 0) {
        // Sin disponibilidad: sin division por cero.
        estado = 'SIN_DISPONIBILIDAD';
      } else {
        utilizacion = Math.round((comprometido / disponible) * 100);
        libre = disponible - comprometido;
        sobrecargado = libre < 0;
        estado = sobrecargado ? 'SOBRECARGA' : 'OK';
      }

      return {
        userId,
        userName: nameById.get(userId) ?? '',
        month: monthStr,
        disponible,
        comprometido,
        utilizacion,
        libre,
        estado,
        sobrecargado,
        cargaParcial,
      };
    });

    rows.sort((a, b) => a.userName.localeCompare(b.userName));
    return rows;
  }
}
