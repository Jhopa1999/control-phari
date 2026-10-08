import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { TriageModel } from '../../../generated/prisma/models/Triage';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RequestState } from '../request-state';
import { RequestStateService } from '../request-state.service';
import { CreateTriageDto } from './dto/create-triage.dto';
import { TriageResponseDto } from './dto/triage-response.dto';

/** Mapa decision de triage -> estado resultante de la Request (design §2.2). */
const DECISION_TO_STATE: Record<string, RequestState> = {
  DEVOLVER: RequestState.DEVUELTA,
  RECHAZAR: RequestState.RECHAZADA,
  // CONTINUAR deja EN_TRIAGE (no crea un estado "triage aprobado", design §11 D5).
  CONTINUAR: RequestState.EN_TRIAGE,
};

/**
 * Gestiona el triage de una Request (design §2.1/§2.2). Gate: registrar triage
 * solo desde REGISTRADA (2o POST -> 409, HIGH-1). Valida codes maestros, aplica
 * la decision y audita CREATE Triage + UPDATE Request en una $transaction.
 */
@Injectable()
export class TriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly state: RequestStateService,
  ) {}

  private snapshot(triage: TriageModel): Prisma.InputJsonValue {
    return {
      id: triage.id,
      requestId: triage.requestId,
      decision: triage.decision,
      routeCode: triage.routeCode,
      demandTypeCode: triage.demandTypeCode,
      criticalityCode: triage.criticalityCode,
      sizeCode: triage.sizeCode,
      dataAvailabilityCode: triage.dataAvailabilityCode,
      totalEffortHours: triage.totalEffortHours,
      mainResponsible: triage.mainResponsible,
      decidedByUserId: triage.decidedByUserId,
    };
  }

  private toResponse(triage: TriageModel): TriageResponseDto {
    return {
      id: triage.id,
      requestId: triage.requestId,
      decision: triage.decision,
      routeCode: triage.routeCode,
      demandTypeCode: triage.demandTypeCode,
      criticalityCode: triage.criticalityCode,
      sizeCode: triage.sizeCode,
      dataAvailabilityCode: triage.dataAvailabilityCode,
      totalEffortHours: triage.totalEffortHours,
      mainResponsible: triage.mainResponsible,
      dependencies: triage.dependencies,
      notes: triage.notes,
      decidedAt: triage.decidedAt,
      decidedByUserId: triage.decidedByUserId,
      createdAt: triage.createdAt,
    };
  }

  /**
   * Devuelve el triage de la Request como lista (0 o 1 fila en Fase 2, 1:1
   * efectivo; forma lista por compatibilidad con el historico futuro).
   */
  async findForRequest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<TriageResponseDto[]> {
    await this.state.requireInScope(actor, requestId);
    const triages = await this.prisma.triage.findMany({
      where: { requestId },
      orderBy: { decidedAt: 'desc' },
    });
    return triages.map((t) => this.toResponse(t));
  }

  async create(
    actor: CurrentActor,
    requestId: string,
    dto: CreateTriageDto,
  ): Promise<TriageResponseDto> {
    const request = await this.state.requireInScope(actor, requestId);

    // Precondicion de fase (design §2.1): triage solo desde REGISTRADA. Un 2o
    // POST encuentra EN_TRIAGE/otro estado -> 409 sin mutacion (HIGH-1).
    if (request.operationalState !== RequestState.REGISTRADA) {
      throw new ConflictException(
        'Solo se puede registrar el triage de una solicitud recien registrada.',
      );
    }

    // Validacion de codes maestros contra CatalogItem activo (400 si no existe).
    await this.state.assertCatalogCode('TRIAGE_ROUTE', dto.routeCode);
    await this.state.assertCatalogCode('DEMAND_TYPE', dto.demandTypeCode);
    await this.state.assertCatalogCode('CRITICALITY', dto.criticalityCode);
    await this.state.assertCatalogCode('TRIAGE_SIZE', dto.sizeCode);
    await this.state.assertCatalogCode('DATA_AVAILABILITY', dto.dataAvailabilityCode);

    // Registrar triage lleva REGISTRADA -> EN_TRIAGE (design §11 D5); luego la
    // decision ajusta el estado final. CONTINUAR deja EN_TRIAGE; DEVOLVER y
    // RECHAZAR aplican una segunda transicion desde EN_TRIAGE. Ambas se validan
    // como transiciones implementadas.
    this.state.assertTransition(
      request.operationalState,
      RequestState.EN_TRIAGE,
    );
    const target = DECISION_TO_STATE[dto.decision];
    const nextState =
      target === RequestState.EN_TRIAGE
        ? RequestState.EN_TRIAGE
        : this.state.assertTransition(RequestState.EN_TRIAGE, target);

    const created = await this.prisma.$transaction(async (tx) => {
      const triage = await tx.triage.create({
        data: {
          requestId,
          decision: dto.decision,
          decidedByUserId: actor.userId,
          ...(dto.routeCode !== undefined ? { routeCode: dto.routeCode } : {}),
          ...(dto.demandTypeCode !== undefined
            ? { demandTypeCode: dto.demandTypeCode }
            : {}),
          ...(dto.criticalityCode !== undefined
            ? { criticalityCode: dto.criticalityCode }
            : {}),
          ...(dto.sizeCode !== undefined ? { sizeCode: dto.sizeCode } : {}),
          ...(dto.dataAvailabilityCode !== undefined
            ? { dataAvailabilityCode: dto.dataAvailabilityCode }
            : {}),
          ...(dto.totalEffortHours !== undefined
            ? { totalEffortHours: dto.totalEffortHours }
            : {}),
          ...(dto.mainResponsible !== undefined
            ? { mainResponsible: dto.mainResponsible }
            : {}),
          ...(dto.dependencies !== undefined
            ? { dependencies: dto.dependencies }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'TRIAGE',
        objectId: triage.id,
        scopeProcessId: request.mainProcessId,
        before: null,
        after: this.snapshot(triage),
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

      return triage;
    });

    return this.toResponse(created);
  }
}
