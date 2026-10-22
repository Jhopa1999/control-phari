import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { PriorityEvaluationModel } from '../../../generated/prisma/models/PriorityEvaluation';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RequestState } from '../request-state';
import {
  PriorityCriteria,
  RequestStateService,
  TriageDecision,
} from '../request-state.service';
import { CreatePriorityEvaluationDto } from './dto/create-priority-evaluation.dto';
import { PriorityEvaluationResponseDto } from './dto/priority-evaluation-response.dto';

/** Estados en los que se admite guardar una evaluacion (design §2.3, HIGH-2). */
const PRIORITY_ALLOWED_STATES: readonly string[] = [
  RequestState.EN_TRIAGE,
  RequestState.BACKLOG_PRIORIZADO,
];

const CONTINUAR: TriageDecision = 'CONTINUAR';

/**
 * Payload de PriorityEvaluation con la relacion `evaluatedBy` incluida (solo
 * id+name), para resolver el nombre del evaluador sin exponer el UUID crudo ni
 * usar `any` (mismo molde que Triage.mainResponsible).
 */
type PriorityEvaluationWithEvaluator = Prisma.PriorityEvaluationGetPayload<{
  include: { evaluatedBy: { select: { id: true; name: true } } };
}>;

const EVALUATOR_INCLUDE = {
  evaluatedBy: { select: { id: true, name: true } },
} as const;

/**
 * Gestiona la evaluacion de prioridad (design §2.3). Gate: triage vigente =
 * CONTINUAR Y estado in {EN_TRIAGE, BACKLOG_PRIORIZADO} (si no 409 sin
 * mutacion). Calcula el score en backend, persiste la evaluacion (1:N) y lleva
 * la Request a BACKLOG_PRIORIZADO (idempotente en estado). Audita en $transaction.
 */
@Injectable()
export class PriorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly state: RequestStateService,
  ) {}

  private criteriaOf(dto: CreatePriorityEvaluationDto): PriorityCriteria {
    return {
      impact: dto.impact,
      alignment: dto.alignment,
      riskControl: dto.riskControl,
      urgency: dto.urgency,
      scope: dto.scope,
      dataAvailability: dto.dataAvailability,
      feasibility: dto.feasibility,
      reuse: dto.reuse,
    };
  }

  private snapshot(
    evaluation: PriorityEvaluationModel,
  ): Prisma.InputJsonValue {
    return {
      id: evaluation.id,
      requestId: evaluation.requestId,
      impact: evaluation.impact,
      alignment: evaluation.alignment,
      riskControl: evaluation.riskControl,
      urgency: evaluation.urgency,
      scope: evaluation.scope,
      dataAvailability: evaluation.dataAvailability,
      feasibility: evaluation.feasibility,
      reuse: evaluation.reuse,
      score: evaluation.score,
      evaluatedByUserId: evaluation.evaluatedByUserId,
    };
  }

  private toResponse(
    evaluation: PriorityEvaluationWithEvaluator,
  ): PriorityEvaluationResponseDto {
    return {
      id: evaluation.id,
      requestId: evaluation.requestId,
      impact: evaluation.impact,
      alignment: evaluation.alignment,
      riskControl: evaluation.riskControl,
      urgency: evaluation.urgency,
      scope: evaluation.scope,
      dataAvailability: evaluation.dataAvailability,
      feasibility: evaluation.feasibility,
      reuse: evaluation.reuse,
      score: evaluation.score,
      thresholdLabel: this.state.priorityLabel(evaluation.score),
      justification: evaluation.justification,
      evaluatedAt: evaluation.evaluatedAt,
      evaluatedByUserId: evaluation.evaluatedByUserId,
      evaluatedByName: evaluation.evaluatedBy?.name ?? null,
      createdAt: evaluation.createdAt,
    };
  }

  /**
   * Historico de evaluaciones de la Request (vigente = ultima por evaluatedAt,
   * design §11 D4), ordenado de la mas reciente a la mas antigua.
   */
  async findForRequest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PriorityEvaluationResponseDto[]> {
    await this.state.requireInScope(actor, requestId);
    const evaluations = await this.prisma.priorityEvaluation.findMany({
      where: { requestId },
      orderBy: { evaluatedAt: 'desc' },
      include: EVALUATOR_INCLUDE,
    });
    return evaluations.map((e) => this.toResponse(e));
  }

  async create(
    actor: CurrentActor,
    requestId: string,
    dto: CreatePriorityEvaluationDto,
  ): Promise<PriorityEvaluationResponseDto> {
    const request = await this.state.requireInScope(actor, requestId);

    // Precondicion de decision (design §2.3): triage vigente = CONTINUAR.
    const triage = await this.state.currentTriage(requestId);
    if (!triage || triage.decision !== CONTINUAR) {
      throw new ConflictException(
        'La priorizacion requiere un triage con decision Continuar.',
      );
    }

    // Precondicion de estado (HIGH-2): solo EN_TRIAGE o BACKLOG_PRIORIZADO. En
    // COMPROMETIDA/DEVUELTA/RECHAZADA -> 409 sin mutacion (no revierte compromiso).
    if (!PRIORITY_ALLOWED_STATES.includes(request.operationalState)) {
      throw new ConflictException(
        'La solicitud no admite priorizacion en su estado actual.',
      );
    }

    // Gate de activo base (FEAT-002): no se puede salir del triage sin un
    // activo asociado. 409 sin mutacion si la Request no tiene assetId.
    if (request.assetId === null) {
      throw new ConflictException(
        'Asocia un activo a la solicitud en el triage antes de priorizarla.',
      );
    }

    // Transicion a BACKLOG_PRIORIZADO (desde EN_TRIAGE o idempotente en estado).
    const nextState = this.state.assertTransition(
      request.operationalState,
      RequestState.BACKLOG_PRIORIZADO,
    );

    const score = this.state.computeScore(this.criteriaOf(dto));

    const created = await this.prisma.$transaction(async (tx) => {
      const evaluation = await tx.priorityEvaluation.create({
        data: {
          requestId,
          impact: dto.impact,
          alignment: dto.alignment,
          riskControl: dto.riskControl,
          urgency: dto.urgency,
          scope: dto.scope,
          dataAvailability: dto.dataAvailability,
          feasibility: dto.feasibility,
          reuse: dto.reuse,
          score,
          evaluatedByUserId: actor.userId,
          ...(dto.justification !== undefined
            ? { justification: dto.justification }
            : {}),
        },
        include: EVALUATOR_INCLUDE,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'PRIORITY_EVALUATION',
        objectId: evaluation.id,
        scopeProcessId: request.mainProcessId,
        before: null,
        after: this.snapshot(evaluation),
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

      return evaluation;
    });

    return this.toResponse(created);
  }
}
