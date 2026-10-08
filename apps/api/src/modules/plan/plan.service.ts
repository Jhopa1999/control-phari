import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { PlanModel } from '../../generated/prisma/models/Plan';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RequestState } from '../request/request-state';
import { RequestStateService } from '../request/request-state.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ReturnPlanDto } from './dto/return-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { PlanGuideDto } from './dto/plan-guide.dto';
import { PlanGuideService } from './plan-guide.service';
import { PlanStateService } from './plan-state.service';
import { PlanStatus } from './plan-status';

/**
 * CRUD del plan y acciones de flujo (design §3.3). Crea el plan desde una
 * Request COMPROMETIDA (COMPROMETIDA->EN_PLANIFICACION via RequestStateService),
 * edita datos (no `status`), expone la guia, y envia/autoriza/devuelve. Toda
 * mutacion + AuditService.record(tx,...) con scopeProcessId=request.mainProcessId
 * en una $transaction. No duplica la maquina de Request (reusa RequestStateService).
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly requestState: RequestStateService,
    private readonly planState: PlanStateService,
    private readonly guide: PlanGuideService,
  ) {}

  private toResponse(plan: PlanModel): PlanResponseDto {
    return {
      id: plan.id,
      requestId: plan.requestId,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      commitmentDate: plan.commitmentDate,
      risks: plan.risks,
      mitigations: plan.mitigations,
      status: plan.status,
      submittedAt: plan.submittedAt,
      submittedByUserId: plan.submittedByUserId,
      authorizedAt: plan.authorizedAt,
      authorizedByUserId: plan.authorizedByUserId,
      returnReason: plan.returnReason,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private snapshot(plan: PlanModel): Prisma.InputJsonValue {
    return {
      id: plan.id,
      requestId: plan.requestId,
      status: plan.status,
      submittedByUserId: plan.submittedByUserId,
      authorizedByUserId: plan.authorizedByUserId,
      returnReason: plan.returnReason,
    };
  }

  /**
   * Crea el plan de una Request (design §3.3): solo si la Request esta
   * COMPROMETIDA y sin plan previo. COMPROMETIDA->EN_PLANIFICACION via
   * RequestStateService dentro de la $transaction. 409 si el estado no aplica o
   * ya existe plan.
   */
  async create(
    actor: CurrentActor,
    requestId: string,
    dto: CreatePlanDto,
  ): Promise<PlanResponseDto> {
    const request = await this.requestState.requireInScope(actor, requestId);

    if (request.operationalState !== RequestState.COMPROMETIDA) {
      throw new ConflictException(
        'Solo se puede crear el plan de una solicitud comprometida.',
      );
    }

    const existing = await this.prisma.plan.findFirst({
      where: { requestId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('La solicitud ya tiene un plan.');
    }

    const nextState = this.requestState.assertTransition(
      request.operationalState,
      RequestState.EN_PLANIFICACION,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      // `status` default BORRADOR vive en el schema; no se repite aqui (D1).
      const plan = await tx.plan.create({
        data: {
          requestId,
          ...(dto.periodStart !== undefined ? { periodStart: new Date(dto.periodStart) } : {}),
          ...(dto.periodEnd !== undefined ? { periodEnd: new Date(dto.periodEnd) } : {}),
          ...(dto.commitmentDate !== undefined ? { commitmentDate: new Date(dto.commitmentDate) } : {}),
          ...(dto.risks !== undefined ? { risks: dto.risks } : {}),
          ...(dto.mitigations !== undefined ? { mitigations: dto.mitigations } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'PLAN',
        objectId: plan.id,
        scopeProcessId: request.mainProcessId,
        before: null,
        after: this.snapshot(plan),
      });

      const updated = await tx.request.update({
        where: { id: requestId },
        data: { operationalState: nextState },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: { operationalState: request.operationalState },
        after: { operationalState: updated.operationalState },
      });

      return plan;
    });

    return this.toResponse(created);
  }

  /** Devuelve el plan de una Request en alcance (404 si no existe/fuera). */
  async findByRequest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PlanResponseDto> {
    const { plan } = await this.planState.requirePlanInScope(actor, requestId);
    return this.toResponse(plan);
  }

  /** Edita datos del plan (no `status`). Audita UPDATE PLAN (design §3.3). */
  async update(
    actor: CurrentActor,
    requestId: string,
    dto: UpdatePlanDto,
  ): Promise<PlanResponseDto> {
    const { plan, mainProcessId } = await this.planState.requirePlanInScope(
      actor,
      requestId,
    );

    const data: Prisma.PlanUpdateInput = {};
    if (dto.periodStart !== undefined) data.periodStart = new Date(dto.periodStart);
    if (dto.periodEnd !== undefined) data.periodEnd = new Date(dto.periodEnd);
    if (dto.commitmentDate !== undefined) data.commitmentDate = new Date(dto.commitmentDate);
    if (dto.risks !== undefined) data.risks = dto.risks;
    if (dto.mitigations !== undefined) data.mitigations = dto.mitigations;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.plan.update({ where: { id: plan.id }, data });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PLAN',
        objectId: plan.id,
        scopeProcessId: mainProcessId,
        before: this.snapshot(plan),
        after: this.snapshot(next),
      });
      return next;
    });

    return this.toResponse(updated);
  }

  /** Guia de pendientes del plan de una Request (design §2.1). */
  async getGuide(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PlanGuideDto> {
    const { plan } = await this.planState.requirePlanInScope(actor, requestId);
    return this.guide.compute(plan.id);
  }

  /**
   * Envia el plan a autorizacion (design §3.3): recomputa la guia DENTRO de la
   * $transaction; 409 enumerando pendientes si canSubmit=false; si no,
   * BORRADOR/DEVUELTO -> EN_AUTORIZACION. Audita UPDATE PLAN.
   */
  async submit(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PlanResponseDto> {
    const { plan, mainProcessId } = await this.planState.requirePlanInScope(
      actor,
      requestId,
    );

    const nextStatus = this.planState.assertPlanTransition(
      plan.status,
      PlanStatus.EN_AUTORIZACION,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const guide = await this.guide.compute(plan.id);
      if (!guide.canSubmit) {
        const detail = guide.pendings.map((p) => p.message).join(' ');
        throw new ConflictException(
          `No se puede enviar el plan: hay pendientes. ${detail}`,
        );
      }

      const next = await tx.plan.update({
        where: { id: plan.id },
        data: { status: nextStatus, submittedAt: new Date(), submittedByUserId: actor.userId },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PLAN',
        objectId: plan.id,
        scopeProcessId: mainProcessId,
        before: { status: plan.status },
        after: { status: next.status },
      });

      return next;
    });

    return this.toResponse(updated);
  }

  /**
   * Autoriza el plan (design §3.3): EN_AUTORIZACION -> AUTORIZADO y la Request
   * EN_PLANIFICACION -> EN_EJECUCION. Dos AuditEvent (UPDATE PLAN + UPDATE
   * REQUEST) en una $transaction, como ApprovalService.
   */
  async authorize(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PlanResponseDto> {
    const { plan, mainProcessId, requestState } =
      await this.planState.requirePlanInScope(actor, requestId);

    const nextStatus = this.planState.assertPlanTransition(
      plan.status,
      PlanStatus.AUTORIZADO,
    );
    const nextRequestState = this.requestState.assertTransition(
      requestState,
      RequestState.EN_EJECUCION,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.plan.update({
        where: { id: plan.id },
        data: { status: nextStatus, authorizedAt: new Date(), authorizedByUserId: actor.userId },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PLAN',
        objectId: plan.id,
        scopeProcessId: mainProcessId,
        before: { status: plan.status },
        after: { status: next.status },
      });

      const updatedRequest = await tx.request.update({
        where: { id: requestId },
        data: { operationalState: nextRequestState },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: mainProcessId,
        before: { operationalState: requestState },
        after: { operationalState: updatedRequest.operationalState },
      });

      return next;
    });

    return this.toResponse(updated);
  }

  /**
   * Devuelve el plan con motivo (design §3.3): `reason` requerido -> 400 si
   * falta; EN_AUTORIZACION -> DEVUELTO. Audita UPDATE PLAN.
   */
  async return(
    actor: CurrentActor,
    requestId: string,
    dto: ReturnPlanDto,
  ): Promise<PlanResponseDto> {
    const { plan, mainProcessId } = await this.planState.requirePlanInScope(
      actor,
      requestId,
    );

    if (!dto.reason) {
      throw new BadRequestException('El motivo es obligatorio para devolver.');
    }

    const nextStatus = this.planState.assertPlanTransition(
      plan.status,
      PlanStatus.DEVUELTO,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.plan.update({
        where: { id: plan.id },
        data: { status: nextStatus, returnReason: dto.reason },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PLAN',
        objectId: plan.id,
        scopeProcessId: mainProcessId,
        before: { status: plan.status, returnReason: plan.returnReason },
        after: { status: next.status, returnReason: next.returnReason },
      });

      return next;
    });

    return this.toResponse(updated);
  }
}
