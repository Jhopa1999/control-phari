import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { PlanPhaseModel } from '../../../generated/prisma/models/PlanPhase';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { PlanStateService } from '../plan-state.service';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { ReorderPhasesDto } from './dto/reorder-phases.dto';
import { PlanPhaseResponseDto } from './dto/plan-phase-response.dto';

/**
 * CRUD y reorden de fases (design §2.5/§3.3). `order` al final si falta; reorden
 * transaccional recomputando order 0-based respetando @@unique([planId, order]).
 * Protege la fase inicial (order minimo) con tareas (409) al borrar/reordenar;
 * rechaza borrar cualquier fase con tareas (409, D12). Auditoria dentro de la tx.
 */
@Injectable()
export class PhaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planState: PlanStateService,
  ) {}

  private toResponse(phase: PlanPhaseModel): PlanPhaseResponseDto {
    return {
      id: phase.id,
      planId: phase.planId,
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
      deliverable: phase.deliverable,
      order: phase.order,
      createdAt: phase.createdAt,
      updatedAt: phase.updatedAt,
    };
  }

  private snapshot(phase: PlanPhaseModel): Prisma.InputJsonValue {
    return {
      id: phase.id,
      planId: phase.planId,
      name: phase.name,
      order: phase.order,
    };
  }

  async findForPlan(
    actor: CurrentActor,
    planId: string,
  ): Promise<PlanPhaseResponseDto[]> {
    await this.planState.requirePlanByIdInScope(actor, planId);
    const phases = await this.prisma.planPhase.findMany({
      where: { planId },
      orderBy: { order: 'asc' },
    });
    return phases.map((p) => this.toResponse(p));
  }

  async create(
    actor: CurrentActor,
    planId: string,
    dto: CreatePhaseDto,
  ): Promise<PlanPhaseResponseDto> {
    const { mainProcessId } = await this.planState.requirePlanByIdInScope(
      actor,
      planId,
    );

    let order = dto.order;
    if (order === undefined) {
      const last = await this.prisma.planPhase.findFirst({
        where: { planId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      order = last ? last.order + 1 : 0;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const phase = await tx.planPhase.create({
        data: {
          planId,
          name: dto.name,
          order: order as number,
          ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
          ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
          ...(dto.deliverable !== undefined ? { deliverable: dto.deliverable } : {}),
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'PLAN_PHASE',
        objectId: phase.id,
        scopeProcessId: mainProcessId,
        before: null,
        after: this.snapshot(phase),
      });
      return phase;
    });

    return this.toResponse(created);
  }

  async update(
    actor: CurrentActor,
    planId: string,
    phaseId: string,
    dto: UpdatePhaseDto,
  ): Promise<PlanPhaseResponseDto> {
    const { mainProcessId } = await this.planState.requirePlanByIdInScope(
      actor,
      planId,
    );
    const phase = await this.requirePhase(planId, phaseId);

    const data: Prisma.PlanPhaseUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.deliverable !== undefined) data.deliverable = dto.deliverable;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.planPhase.update({ where: { id: phase.id }, data });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PLAN_PHASE',
        objectId: phase.id,
        scopeProcessId: mainProcessId,
        before: this.snapshot(phase),
        after: this.snapshot(next),
      });
      return next;
    });

    return this.toResponse(updated);
  }

  /**
   * Reordena las fases del plan (design §2.5). `phaseIds` debe contener
   * exactamente las fases del plan (400 si no). Protege la fase inicial (order
   * minimo) con tareas: si deja de ser la de menor order -> 409. Recomputa order
   * 0-based en dos pasos (offset temporal) para no colisionar con el @@unique.
   * Audita como un UPDATE PLAN con snapshot del orden (no inflar auditoria).
   */
  async reorder(
    actor: CurrentActor,
    planId: string,
    dto: ReorderPhasesDto,
  ): Promise<PlanPhaseResponseDto[]> {
    const { plan, mainProcessId } = await this.planState.requirePlanByIdInScope(
      actor,
      planId,
    );

    const phases = await this.prisma.planPhase.findMany({
      where: { planId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });

    const currentIds = new Set(phases.map((p) => p.id));
    const requestedIds = new Set(dto.phaseIds);
    if (
      currentIds.size !== requestedIds.size ||
      !dto.phaseIds.every((id) => currentIds.has(id))
    ) {
      throw new ConflictException(
        'La lista de fases no coincide con las fases del plan.',
      );
    }

    // Fase inicial actual (menor order) con tareas: no puede dejar de ser la
    // primera (AC-009, D4).
    const currentInitial = phases[0];
    if (
      currentInitial &&
      currentInitial._count.tasks > 0 &&
      dto.phaseIds[0] !== currentInitial.id
    ) {
      throw new ConflictException(
        'No se puede mover la fase inicial que tiene tareas.',
      );
    }

    const beforeOrder = phases.map((p) => ({ id: p.id, order: p.order }));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Paso 1: offset temporal para evitar colision de @@unique durante el swap.
      const offset = phases.length + 1;
      for (let i = 0; i < dto.phaseIds.length; i += 1) {
        await tx.planPhase.update({
          where: { id: dto.phaseIds[i] },
          data: { order: i + offset },
        });
      }
      // Paso 2: order 0-based definitivo.
      for (let i = 0; i < dto.phaseIds.length; i += 1) {
        await tx.planPhase.update({
          where: { id: dto.phaseIds[i] },
          data: { order: i },
        });
      }

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PLAN',
        objectId: plan.id,
        scopeProcessId: mainProcessId,
        before: { order: beforeOrder },
        after: { order: dto.phaseIds.map((id, i) => ({ id, order: i })) },
      });

      return tx.planPhase.findMany({
        where: { planId },
        orderBy: { order: 'asc' },
      });
    });

    return updated.map((p) => this.toResponse(p));
  }

  async remove(
    actor: CurrentActor,
    planId: string,
    phaseId: string,
  ): Promise<void> {
    const { mainProcessId } = await this.planState.requirePlanByIdInScope(
      actor,
      planId,
    );
    const phase = await this.requirePhase(planId, phaseId);

    const taskCount = await this.prisma.task.count({ where: { phaseId } });
    if (taskCount > 0) {
      // D12: no borrar ninguna fase con tareas (no perder tareas por cascade).
      throw new ConflictException(
        'No se puede borrar una fase que tiene tareas; mueve o borra las tareas primero.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.planPhase.delete({ where: { id: phase.id } });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'PLAN_PHASE',
        objectId: phase.id,
        scopeProcessId: mainProcessId,
        before: this.snapshot(phase),
        after: null,
      });
    });
  }

  /** Resuelve una fase del plan o lanza 409 si no pertenece al plan. */
  private async requirePhase(
    planId: string,
    phaseId: string,
  ): Promise<PlanPhaseModel> {
    const phase = await this.prisma.planPhase.findFirst({
      where: { id: phaseId, planId },
    });
    if (!phase) {
      throw new ConflictException('La fase no pertenece a este plan.');
    }
    return phase;
  }
}
