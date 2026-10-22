import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { ApprovalModel } from '../../../generated/prisma/models/Approval';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import {
  RequestResponseDto,
} from '../dto/request-response.dto';
import { RequestState } from '../request-state';
import {
  RequestStateService,
  RequestWithParticipants,
} from '../request-state.service';
import {
  ApprovalDecision,
  CreateApprovalDto,
} from './dto/create-approval.dto';
import { ApprovalResponseDto } from './dto/approval-response.dto';

/**
 * Payload de Approval con la relacion `decidedBy` incluida (solo id+name),
 * para resolver el nombre de quien decidio sin exponer el UUID crudo ni usar
 * `any` (mismo molde que Triage.mainResponsible).
 */
type ApprovalWithDecider = Prisma.ApprovalGetPayload<{
  include: { decidedBy: { select: { id: true; name: true } } };
}>;

const DECIDER_INCLUDE = {
  decidedBy: { select: { id: true, name: true } },
} as const;

/** Mapa decision de aprobacion -> estado resultante (design §2.4). */
const DECISION_TO_STATE: Record<ApprovalDecision, RequestState> = {
  APROBAR: RequestState.COMPROMETIDA,
  // DEVOLVER tiene destino determinista EN_TRIAGE (design §11 D6).
  DEVOLVER: RequestState.EN_TRIAGE,
};

/**
 * Gestiona la aprobacion del compromiso (design §2.4), SEPARADA del guardado de
 * la evaluacion (BR-006). Gate: estado = BACKLOG_PRIORIZADO (si no 409).
 * APROBAR -> COMPROMETIDA; DEVOLVER -> EN_TRIAGE con reason requerido (400 si
 * falta). Append-only + UPDATE Request + auditoria en una $transaction.
 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly state: RequestStateService,
  ) {}

  private scopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  private snapshot(approval: ApprovalModel): Prisma.InputJsonValue {
    return {
      id: approval.id,
      requestId: approval.requestId,
      decision: approval.decision,
      reason: approval.reason,
      previousState: approval.previousState,
      resultingState: approval.resultingState,
      decidedByUserId: approval.decidedByUserId,
    };
  }

  private toResponse(approval: ApprovalWithDecider): ApprovalResponseDto {
    return {
      id: approval.id,
      requestId: approval.requestId,
      decision: approval.decision,
      reason: approval.reason,
      previousState: approval.previousState,
      resultingState: approval.resultingState,
      decidedAt: approval.decidedAt,
      decidedByUserId: approval.decidedByUserId,
      decidedByName: approval.decidedBy?.name ?? null,
      createdAt: approval.createdAt,
    };
  }

  /**
   * Cola de aprobacion (SCR-20, design §3.3): Requests en BACKLOG_PRIORIZADO
   * dentro del alcance del actor. Endpoint propio restringido a `review`.
   */
  async pendingApproval(
    actor: CurrentActor,
  ): Promise<RequestResponseDto[]> {
    const requests = await this.prisma.request.findMany({
      where: {
        AND: [
          { operationalState: RequestState.BACKLOG_PRIORIZADO },
          this.scopeWhere(actor),
        ],
      },
      orderBy: [{ registeredAt: 'desc' }, { createdAt: 'desc' }],
      include: { participants: true },
    });

    return Promise.all(
      requests.map((request) =>
        this.state.buildResponse(request as RequestWithParticipants),
      ),
    );
  }

  /** Historico de decisiones de compromiso de la Request. */
  async findForRequest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<ApprovalResponseDto[]> {
    await this.state.requireInScope(actor, requestId);
    const approvals = await this.prisma.approval.findMany({
      where: { requestId },
      orderBy: { decidedAt: 'desc' },
      include: DECIDER_INCLUDE,
    });
    return approvals.map((a) => this.toResponse(a));
  }

  async create(
    actor: CurrentActor,
    requestId: string,
    dto: CreateApprovalDto,
  ): Promise<ApprovalResponseDto> {
    const request = await this.state.requireInScope(actor, requestId);

    // Precondicion de estado (design §2.4): solo desde BACKLOG_PRIORIZADO.
    if (request.operationalState !== RequestState.BACKLOG_PRIORIZADO) {
      throw new ConflictException(
        'Solo se puede decidir sobre una solicitud en backlog priorizado.',
      );
    }

    // reason requerido si DEVOLVER: validacion de dominio -> 400 (no 409).
    if (dto.decision === 'DEVOLVER' && !dto.reason) {
      throw new BadRequestException('El motivo es obligatorio para devolver.');
    }

    const target = DECISION_TO_STATE[dto.decision];
    const nextState = this.state.assertTransition(
      request.operationalState,
      target,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const approval = await tx.approval.create({
        data: {
          requestId,
          decision: dto.decision,
          previousState: request.operationalState,
          resultingState: nextState,
          decidedByUserId: actor.userId,
          ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        },
        include: DECIDER_INCLUDE,
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'APPROVAL',
        objectId: approval.id,
        scopeProcessId: request.mainProcessId,
        before: null,
        after: this.snapshot(approval),
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

      return approval;
    });

    return this.toResponse(created);
  }
}
