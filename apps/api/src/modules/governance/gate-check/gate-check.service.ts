import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { GateCheckModel } from '../../../generated/prisma/models/GateCheck';
import type { GatePendingItemModel } from '../../../generated/prisma/models/GatePendingItem';
import type { RequestModel } from '../../../generated/prisma/models/Request';
import type { ValidationRecordModel } from '../../../generated/prisma/models/ValidationRecord';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RequestState } from '../../request/request-state';
import { RequestStateService } from '../../request/request-state.service';
import {
  APPROVING_VALIDATION_RESULTS,
  GATE_DEFINITIONS,
  GATE_ORDER,
  GateCode,
  GateStatus,
  GOVERNANCE_ROUTE,
  isGateCode,
  MANDATORY_VALIDATION_TYPE,
} from '../gate';
import { GovernanceScopeService } from '../governance-scope.service';
import { GovernanceStateService, StageAction } from '../governance-state.service';
import { ApproveGateDto } from './dto/approve-gate.dto';
import { BlockRequestDto, UnblockRequestDto } from './dto/block-request.dto';
import { CreatePendingItemDto } from './dto/create-pending-item.dto';
import {
  GateCheckResponseDto,
  GatePendingItemResponseDto,
  GateValidationSummaryDto,
  GovernanceBoardResponseDto,
} from './dto/gate-check-response.dto';
import { ResolvePendingItemDto } from './dto/resolve-pending-item.dto';
import { SetRouteDto } from './dto/set-route.dto';
import { WaiveGateDto } from './dto/waive-gate.dto';

/** Catalogo de rutas que admiten NO_APLICA de gates (design §1.4 D-D2). */
const WAIVABLE_ROUTES: readonly string[] = [
  GOVERNANCE_ROUTE.SIMPLIFICADA,
  GOVERNANCE_ROUTE.EXPLORACION,
];

/**
 * Orden lineal de los estados del flujo para derivar GC1-GC3 (design §3.3): un
 * estado "a partir de" otro implica que el control previo ya se cumplio. Solo
 * se listan los estados del camino feliz; los estados de rechazo/devolucion no
 * participan en la derivacion de gates CUMPLIDOs.
 */
const STATE_RANK: Record<string, number> = {
  [RequestState.REGISTRADA]: 0,
  [RequestState.EN_TRIAGE]: 1,
  [RequestState.BACKLOG_PRIORIZADO]: 2,
  [RequestState.COMPROMETIDA]: 3,
  [RequestState.EN_PLANIFICACION]: 4,
  [RequestState.EN_EJECUCION]: 5,
  [RequestState.EN_VALIDACION]: 6,
  [RequestState.LISTA_PARA_LIBERAR]: 7,
  [RequestState.EN_ESTABILIZACION]: 8,
  [RequestState.OPERATIVA]: 9,
  [RequestState.CERRADA]: 10,
};

/**
 * Nucleo del ciclo de control GC1-GC5 (design §3.3). Materializa de forma
 * perezosa (lazy) los 5 GateCheck por Request, deriva GC1-GC3 del estado real,
 * y gestiona pendientes, preparacion de etapa, aprobacion (solo GC4/GC5), waive,
 * bloqueo transversal y ruta proporcional. RequestStateService sigue siendo el
 * unico escritor de operationalState (via GovernanceStateService.assertTransition).
 * Toda mutacion audita dentro de su $transaction (patron ApprovalService).
 */
@Injectable()
export class GateCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GovernanceScopeService,
    private readonly state: RequestStateService,
    private readonly governanceState: GovernanceStateService,
  ) {}

  private rank(stateCode: string): number {
    return STATE_RANK[stateCode] ?? -1;
  }

  private parseGateCode(gateCode: string): GateCode {
    if (!isGateCode(gateCode)) {
      throw new BadRequestException('Control de gobierno desconocido.');
    }
    return gateCode;
  }

  private pendingToResponse(
    item: GatePendingItemModel,
  ): GatePendingItemResponseDto {
    return {
      id: item.id,
      gateCheckId: item.gateCheckId,
      description: item.description,
      ownerUserId: item.ownerUserId,
      reviewDate: item.reviewDate,
      resolved: item.resolved,
      resolvedAt: item.resolvedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private gateSnapshot(gate: GateCheckModel): Prisma.InputJsonValue {
    return {
      id: gate.id,
      requestId: gate.requestId,
      gateCode: gate.gateCode,
      status: gate.status,
      waiverReason: gate.waiverReason,
      decidedByUserId: gate.decidedByUserId,
    };
  }

  /**
   * Status derivado de GC1-GC3 segun el estado real (design §3.3): GC1 (triage
   * CONTINUAR -> admision), GC2 (compromiso aprobado), GC3 (plan autorizado).
   * EXPLORACION fuerza GC4 NO_APLICA (D-D2). Devuelve el status a persistir o
   * `null` si el gate no se deriva (se respeta el persistido).
   */
  private deriveStatus(
    gateCode: GateCode,
    request: Pick<RequestModel, 'operationalState' | 'governanceRoute'>,
  ): GateStatus | null {
    const rank = this.rank(request.operationalState);
    switch (gateCode) {
      case GateCode.GC1:
        return rank >= STATE_RANK[RequestState.BACKLOG_PRIORIZADO]
          ? GateStatus.CUMPLIDO
          : GateStatus.PENDIENTE;
      case GateCode.GC2:
        return rank >= STATE_RANK[RequestState.COMPROMETIDA]
          ? GateStatus.CUMPLIDO
          : GateStatus.PENDIENTE;
      case GateCode.GC3:
        return rank >= STATE_RANK[RequestState.EN_EJECUCION]
          ? GateStatus.CUMPLIDO
          : GateStatus.PENDIENTE;
      case GateCode.GC4:
        // EXPLORACION no autoriza produccion: GC4 se fuerza a NO_APLICA (D-D2).
        if (request.governanceRoute === GOVERNANCE_ROUTE.EXPLORACION) {
          return GateStatus.NO_APLICA;
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * Materializa (upsert) los 5 GateCheck de una Request fijando condicion y
   * autoridad desde GATE_DEFINITIONS, y persiste el status derivado de GC1-GC4.
   * Idempotente por el unique compuesto (requestId, gateCode).
   */
  private async materialize(
    request: Pick<
      RequestModel,
      'id' | 'operationalState' | 'governanceRoute'
    >,
  ): Promise<GateCheckModel[]> {
    const gates: GateCheckModel[] = [];
    for (const gateCode of GATE_ORDER) {
      const def = GATE_DEFINITIONS[gateCode];
      const existing = await this.prisma.gateCheck.upsert({
        where: {
          gate_check_request_gate_unique: {
            requestId: request.id,
            gateCode,
          },
        },
        update: {
          conditionText: def.conditionText,
          authorityText: def.authorityText,
        },
        create: {
          requestId: request.id,
          gateCode,
          conditionText: def.conditionText,
          authorityText: def.authorityText,
        },
      });

      const derived = this.deriveStatus(gateCode, request);
      // No sobrescribir una decision manual (NO_APLICA via waive) con la
      // derivacion, salvo que la propia derivacion imponga NO_APLICA (EXPLORACION).
      const shouldPersist =
        derived !== null &&
        derived !== existing.status &&
        !(existing.status === GateStatus.NO_APLICA && derived !== GateStatus.NO_APLICA);

      if (shouldPersist) {
        const updated = await this.prisma.gateCheck.update({
          where: { id: existing.id },
          data: { status: derived },
        });
        gates.push(updated);
      } else {
        gates.push(existing);
      }
    }
    return gates;
  }

  /**
   * Recomputo server-side de la aprobabilidad de GC4 (design §1.5): no debe
   * existir ninguna validacion blocking sin resolver, y segun la ruta debe
   * existir al menos una validacion obligatoria aprobatoria. EXPLORACION fuerza
   * NO_APLICA (no aprobable por esta via).
   */
  private computeGc4Summary(
    validations: ValidationRecordModel[],
    governanceRoute: string | null,
  ): GateValidationSummaryDto {
    const blockingUnresolved = validations.filter(
      (v) => v.blocking && !v.blockingResolved,
    ).length;
    const hasMandatoryApproving = validations.some(
      (v) =>
        v.validationTypeCode === MANDATORY_VALIDATION_TYPE &&
        APPROVING_VALIDATION_RESULTS.includes(v.resultCode),
    );

    const blockingReasons: string[] = [];
    if (blockingUnresolved > 0) {
      blockingReasons.push(
        `Existen ${blockingUnresolved} validacion(es) con defecto bloqueante sin resolver.`,
      );
    }

    const routeRequiresMandatory =
      governanceRoute === GOVERNANCE_ROUTE.COMPLETA ||
      governanceRoute === GOVERNANCE_ROUTE.SIMPLIFICADA;

    if (routeRequiresMandatory && !hasMandatoryApproving) {
      blockingReasons.push(
        'Falta una validación funcional/aceptación aprobatoria exigida por la ruta.',
      );
    }

    return {
      total: validations.length,
      blockingUnresolved,
      hasMandatoryApproving,
      approvable: blockingReasons.length === 0,
      blockingReasons,
    };
  }

  private async gateToResponse(
    gate: GateCheckModel,
    request: Pick<RequestModel, 'governanceRoute'>,
  ): Promise<GateCheckResponseDto> {
    const pendingItems = await this.prisma.gatePendingItem.findMany({
      where: { gateCheckId: gate.id },
      orderBy: { createdAt: 'asc' },
    });

    let validationSummary: GateValidationSummaryDto | null = null;
    if (gate.gateCode === GateCode.GC4) {
      const validations = await this.prisma.validationRecord.findMany({
        where: { requestId: gate.requestId },
      });
      validationSummary = this.computeGc4Summary(
        validations,
        request.governanceRoute,
      );
    }

    return {
      id: gate.id,
      requestId: gate.requestId,
      gateCode: gate.gateCode,
      title: GATE_DEFINITIONS[gate.gateCode as GateCode].title,
      status: gate.status,
      conditionText: gate.conditionText,
      authorityText: gate.authorityText,
      waiverReason: gate.waiverReason,
      decidedAt: gate.decidedAt,
      decidedByUserId: gate.decidedByUserId,
      pendingItems: pendingItems.map((p) => this.pendingToResponse(p)),
      validationSummary,
      createdAt: gate.createdAt,
      updatedAt: gate.updatedAt,
    };
  }

  /** Carga un GateCheck de la Request por code o lanza 404. */
  private async requireGate(
    requestId: string,
    gateCode: GateCode,
  ): Promise<GateCheckModel> {
    const gate = await this.prisma.gateCheck.findUnique({
      where: {
        gate_check_request_gate_unique: { requestId, gateCode },
      },
    });
    if (!gate) {
      throw new NotFoundException('Control de gobierno no encontrado.');
    }
    return gate;
  }

  /**
   * Tablero de gobierno de una Request (GET /requests/:id/gates, design §3.3):
   * alcance de lectura, materializacion lazy de los 5 gates y respuesta con
   * pendientes y resumen de validaciones de GC4.
   */
  async getForRequest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<GovernanceBoardResponseDto> {
    const request = await this.scope.requireInScope(actor, requestId);
    const gates = await this.materialize(request);
    const gateDtos = await Promise.all(
      gates.map((gate) => this.gateToResponse(gate, request)),
    );
    return {
      requestId: request.id,
      operationalState: request.operationalState,
      governanceRoute: request.governanceRoute,
      blocked: request.blockedAt != null && request.blockedResolvedAt == null,
      blockedReason: request.blockedReason,
      gates: gateDtos,
    };
  }

  /** Registra un faltante en un gate (design §3.4). review. */
  async addPendingItem(
    actor: CurrentActor,
    requestId: string,
    gateCodeRaw: string,
    dto: CreatePendingItemDto,
  ): Promise<GatePendingItemResponseDto> {
    const gateCode = this.parseGateCode(gateCodeRaw);
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);
    await this.materialize(request);
    const gate = await this.requireGate(requestId, gateCode);

    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.gatePendingItem.create({
        data: {
          gateCheckId: gate.id,
          description: dto.description,
          ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
          ...(dto.reviewDate !== undefined ? { reviewDate: new Date(dto.reviewDate) } : {}),
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'GATE_PENDING_ITEM',
        objectId: item.id,
        scopeProcessId: request.mainProcessId,
        before: null,
        after: {
          id: item.id,
          gateCheckId: item.gateCheckId,
          description: item.description,
        },
      });
      return item;
    });

    return this.pendingToResponse(created);
  }

  /** Resuelve/edita un faltante (design §3.4). review. */
  async resolvePendingItem(
    actor: CurrentActor,
    requestId: string,
    gateCodeRaw: string,
    itemId: string,
    dto: ResolvePendingItemDto,
  ): Promise<GatePendingItemResponseDto> {
    const gateCode = this.parseGateCode(gateCodeRaw);
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);
    const gate = await this.requireGate(requestId, gateCode);

    const item = await this.prisma.gatePendingItem.findFirst({
      where: { id: itemId, gateCheckId: gate.id },
    });
    if (!item) {
      throw new NotFoundException('Faltante no encontrado.');
    }

    const data: Prisma.GatePendingItemUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.ownerUserId !== undefined) {
      data.owner = { connect: { id: dto.ownerUserId } };
    }
    if (dto.reviewDate !== undefined) data.reviewDate = new Date(dto.reviewDate);
    if (dto.resolved !== undefined) {
      data.resolved = dto.resolved;
      data.resolvedAt = dto.resolved ? new Date() : null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.gatePendingItem.update({
        where: { id: item.id },
        data,
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'GATE_PENDING_ITEM',
        objectId: result.id,
        scopeProcessId: request.mainProcessId,
        before: { resolved: item.resolved },
        after: { resolved: result.resolved },
      });
      return result;
    });

    return this.pendingToResponse(updated);
  }

  /**
   * Etapa de preparacion (design §3.4, D-B4): request-validation / mark-ready /
   * confirm-stabilization. Mueve el estado via GovernanceStateService (unico
   * escritor por assertTransition). mark-ready recomputa la obligatoriedad §1.5
   * y la ausencia de defecto bloqueante antes de avanzar (409 si no se cumple).
   */
  async advanceStage(
    actor: CurrentActor,
    requestId: string,
    action: StageAction,
  ): Promise<GovernanceBoardResponseDto> {
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);

    if (action === 'mark-ready') {
      const validations = await this.prisma.validationRecord.findMany({
        where: { requestId },
      });
      const summary = this.computeGc4Summary(
        validations,
        request.governanceRoute,
      );
      if (!summary.approvable) {
        throw new ConflictException(summary.blockingReasons.join(' '));
      }
    }

    const nextState = this.governanceState.resolveStageTransition(
      action,
      request.operationalState,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.governanceState.applyTransition(tx, requestId, nextState);
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: { operationalState: request.operationalState },
        after: { operationalState: nextState },
      });
    });

    return this.getForRequest(actor, requestId);
  }

  /**
   * Aprueba un gate por la autoridad (design §3.4): solo GC4/GC5 (GC1-GC3 => 409).
   * GC4 recomputa la aprobabilidad §1.5 (409 si bloqueado). Mueve el estado y
   * audita CREATE/UPDATE del gate + UPDATE de REQUEST (before/after estado).
   */
  async approve(
    actor: CurrentActor,
    requestId: string,
    gateCodeRaw: string,
    _dto: ApproveGateDto,
  ): Promise<GateCheckResponseDto> {
    const gateCode = this.parseGateCode(gateCodeRaw);
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);
    await this.materialize(request);
    const gate = await this.requireGate(requestId, gateCode);

    // Resuelve el destino (409 si no es GC4/GC5 o el estado no es el origen).
    const nextState = this.governanceState.resolveApproveTransition(
      gateCode,
      request.operationalState,
    );

    if (gateCode === GateCode.GC4) {
      const validations = await this.prisma.validationRecord.findMany({
        where: { requestId },
      });
      const summary = this.computeGc4Summary(
        validations,
        request.governanceRoute,
      );
      if (!summary.approvable) {
        throw new ConflictException(summary.blockingReasons.join(' '));
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const decided = await tx.gateCheck.update({
        where: { id: gate.id },
        data: {
          status: GateStatus.CUMPLIDO,
          decidedAt: new Date(),
          decidedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'GATE_CHECK',
        objectId: decided.id,
        scopeProcessId: request.mainProcessId,
        before: this.gateSnapshot(gate),
        after: this.gateSnapshot(decided),
      });

      await this.governanceState.applyTransition(tx, requestId, nextState);
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: { operationalState: request.operationalState },
        after: { operationalState: nextState },
      });
      return decided;
    });

    return this.gateToResponse(updated, request);
  }

  /**
   * Marca un gate NO_APLICA (design §3.4, D-D2): requiere waiverReason y ruta
   * SIMPLIFICADA/EXPLORACION (400 si no). No mueve el estado.
   */
  async waive(
    actor: CurrentActor,
    requestId: string,
    gateCodeRaw: string,
    dto: WaiveGateDto,
  ): Promise<GateCheckResponseDto> {
    const gateCode = this.parseGateCode(gateCodeRaw);
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);

    if (
      request.governanceRoute === null ||
      !WAIVABLE_ROUTES.includes(request.governanceRoute)
    ) {
      throw new BadRequestException(
        'Solo las rutas simplificada o de exploración admiten marcar un control como no aplicable.',
      );
    }

    await this.materialize(request);
    const gate = await this.requireGate(requestId, gateCode);

    const updated = await this.prisma.$transaction(async (tx) => {
      const decided = await tx.gateCheck.update({
        where: { id: gate.id },
        data: {
          status: GateStatus.NO_APLICA,
          waiverReason: dto.waiverReason,
          decidedAt: new Date(),
          decidedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'GATE_CHECK',
        objectId: decided.id,
        scopeProcessId: request.mainProcessId,
        before: this.gateSnapshot(gate),
        after: this.gateSnapshot(decided),
      });
      return decided;
    });

    return this.gateToResponse(updated, request);
  }

  /**
   * Bloquea la Request (design §3.4, D-B7): flag transversal. NO cambia el
   * operationalState ni invoca assertTransition. 409 si ya esta bloqueada.
   */
  async block(
    actor: CurrentActor,
    requestId: string,
    dto: BlockRequestDto,
  ): Promise<GovernanceBoardResponseDto> {
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);

    const isBlocked =
      request.blockedAt != null && request.blockedResolvedAt == null;
    if (isBlocked) {
      throw new ConflictException('La solicitud ya está bloqueada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: requestId },
        data: {
          blockedReason: dto.blockReason,
          blockedAt: new Date(),
          blockedByUserId: actor.userId,
          blockedResolvedAt: null,
          blockedResolvedByUserId: null,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: { blocked: false },
        after: { blocked: true, blockedReason: dto.blockReason },
      });
    });

    return this.getForRequest(actor, requestId);
  }

  /**
   * Desbloquea la Request (design §3.4, D-B7): flag transversal. NO cambia el
   * operationalState (no asume retorno a EN_EJECUCION). 409 si no esta bloqueada.
   */
  async unblock(
    actor: CurrentActor,
    requestId: string,
    _dto: UnblockRequestDto,
  ): Promise<GovernanceBoardResponseDto> {
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);

    const isBlocked =
      request.blockedAt != null && request.blockedResolvedAt == null;
    if (!isBlocked) {
      throw new ConflictException('La solicitud no está bloqueada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: requestId },
        data: {
          blockedResolvedAt: new Date(),
          blockedResolvedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: { blocked: true },
        after: { blocked: false },
      });
    });

    return this.getForRequest(actor, requestId);
  }

  /**
   * Fija/cambia la ruta proporcional (design §3.4, D-D1/D-D3): manual, auditada.
   * Valida el code contra el catalogo GOVERNANCE_ROUTE (400 si no existe/activo).
   */
  async setRoute(
    actor: CurrentActor,
    requestId: string,
    dto: SetRouteDto,
  ): Promise<GovernanceBoardResponseDto> {
    const request = await this.scope.requireInScope(actor, requestId);
    this.scope.requireRequestManager(actor, request);
    await this.state.assertCatalogCode('GOVERNANCE_ROUTE', dto.route);

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: requestId },
        data: { governanceRoute: dto.route },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: { governanceRoute: request.governanceRoute },
        after: { governanceRoute: dto.route },
      });
    });

    return this.getForRequest(actor, requestId);
  }
}
