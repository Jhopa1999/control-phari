import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { RequestModel } from '../../../generated/prisma/models/Request';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { AssetService } from '../../knowledge/asset/asset.service';
import { RequestResponseDto } from '../dto/request-response.dto';
import { RequestState } from '../request-state';
import { RequestStateService } from '../request-state.service';
import { AssociateAssetDto } from './dto/associate-asset.dto';
import { CreateTriageDto } from './dto/create-triage.dto';
import { TriageContextResponseDto } from './dto/triage-context-response.dto';
import { TriageResponseDto } from './dto/triage-response.dto';

/**
 * Estados de la Request en los que se admite asociar/cambiar el activo base
 * (FEAT-002): el triage y los estados tempranos a los que puede regresar antes
 * de priorizarse. Fuera de este conjunto -> 409 (no se reasigna el activo una
 * vez priorizada o comprometida).
 */
const ASSET_ASSOCIABLE_STATES: readonly string[] = [
  RequestState.EN_TRIAGE,
  RequestState.BACKLOG_PRIORIZADO,
  RequestState.DEVUELTA,
];

/**
 * Mensaje accionable del 400 cuando el responsable principal referenciado no es
 * un candidato elegible (design §2.3.2). Dice QUE corregir sin filtrar detalle
 * interno; el desplegable del front solo ofrece elegibles, asi que esto es
 * defensa para clientes de API directos.
 */
const RESPONSIBLE_NOT_ELIGIBLE_MESSAGE =
  'El responsable principal debe ser un lider (o integrante, si no hay lider) del proceso principal de la solicitud.';

/**
 * Payload de Triage con la relacion `mainResponsible` incluida (solo id+name),
 * para resolver el nombre del responsable sin exponer el UUID crudo ni usar
 * `any` (design §2.4).
 */
type TriageWithResponsible = Prisma.TriageGetPayload<{
  include: { mainResponsible: { select: { id: true; name: true } } };
}>;

const RESPONSIBLE_INCLUDE = {
  mainResponsible: { select: { id: true, name: true } },
} as const;

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
    private readonly assetService: AssetService,
  ) {}

  private snapshot(triage: TriageWithResponsible): Prisma.InputJsonValue {
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
      mainResponsibleUserId: triage.mainResponsibleUserId,
      decidedByUserId: triage.decidedByUserId,
    };
  }

  private toResponse(triage: TriageWithResponsible): TriageResponseDto {
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
      mainResponsibleUserId: triage.mainResponsibleUserId,
      mainResponsibleName: triage.mainResponsible?.name ?? null,
      dependencies: triage.dependencies,
      notes: triage.notes,
      decidedAt: triage.decidedAt,
      decidedByUserId: triage.decidedByUserId,
      createdAt: triage.createdAt,
    };
  }

  /**
   * Conjunto canonico de candidatos a responsable principal para una Request
   * (design §2.3.1). Fuente de verdad UNICA: la consumen tanto la validacion
   * del POST como el `eligibleResponsibles` del GET, de modo que el desplegable
   * nunca ofrezca algo que el backend rechace. Depende solo del proceso
   * principal de la solicitud, no del actor.
   */
  private async eligibleResponsibleIds(
    request: RequestModel,
  ): Promise<string[]> {
    // Por defecto: lideres activos del proceso principal.
    const leaders = await this.prisma.grant.findMany({
      where: {
        active: true,
        processId: request.mainProcessId,
        role: { code: RoleCode.LIDER_PROCESO },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    if (leaders.length > 0) return leaders.map((g) => g.userId);

    // Respaldo: el proceso principal no tiene lider -> no bloquear el triage.
    // Candidatos = todas las personas con grant activo en el proceso principal.
    const members = await this.prisma.grant.findMany({
      where: { active: true, processId: request.mainProcessId },
      select: { userId: true },
      distinct: ['userId'],
    });
    return members.map((g) => g.userId);
  }

  /**
   * Valida (negocio) que el responsable referenciado sea un candidato elegible
   * del proceso principal (design §2.3.2). 400 con mensaje accionable: el valor
   * es un UUID valido pero no cumple la regla del campo.
   */
  private async assertMainResponsibleCandidate(
    request: RequestModel,
    userId: string,
  ): Promise<void> {
    const ids = new Set(await this.eligibleResponsibleIds(request));
    if (!ids.has(userId)) {
      throw new BadRequestException(RESPONSIBLE_NOT_ELIGIBLE_MESSAGE);
    }
  }

  /**
   * Devuelve el triage de la Request (0 o 1 fila en Fase 2) junto a los
   * candidatos elegibles como responsable principal (design §2.5), para poblar
   * el desplegable con el mismo conjunto que valida el POST.
   */
  async findForRequest(
    actor: CurrentActor,
    requestId: string,
  ): Promise<TriageContextResponseDto> {
    const request = await this.state.requireInScope(actor, requestId);
    const [triages, eligibleIds] = await Promise.all([
      this.prisma.triage.findMany({
        where: { requestId },
        orderBy: { decidedAt: 'desc' },
        include: RESPONSIBLE_INCLUDE,
      }),
      this.eligibleResponsibleIds(request),
    ]);
    const eligibleResponsibles = await this.prisma.user.findMany({
      where: { id: { in: eligibleIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return {
      triages: triages.map((t) => this.toResponse(t)),
      eligibleResponsibles,
    };
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

    // Regla de negocio del responsable principal (design §2.3.2): solo si viene
    // un id, debe ser un candidato elegible del proceso principal (400 si no).
    if (dto.mainResponsibleUserId !== undefined) {
      await this.assertMainResponsibleCandidate(
        request,
        dto.mainResponsibleUserId,
      );
    }

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
          ...(dto.mainResponsibleUserId !== undefined
            ? { mainResponsibleUserId: dto.mainResponsibleUserId }
            : {}),
          ...(dto.dependencies !== undefined
            ? { dependencies: dto.dependencies }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: RESPONSIBLE_INCLUDE,
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

  /**
   * Asocia un activo EXISTENTE como base de la solicitud durante el triage. El
   * triage NO crea activos (la creacion vive en el modulo de Activos, solo por
   * el jefe de area): solo asocia un `assetId` ya visible para el actor.
   * `AssetService.get` aplica el alcance de visibilidad (404 si no accesible),
   * por lo que un lider nunca asocia un activo no habilitado para sus procesos.
   * Refuerzo adicional: el activo debe estar habilitado para el proceso
   * principal de la solicitud (propietario O visibilidad), si no -> 409. Solo
   * en estados tempranos (ASSET_ASSOCIABLE_STATES); fuera -> 409. Escribe
   * `Request.assetId` y audita UPDATE REQUEST en una $transaction.
   */
  async associateAsset(
    actor: CurrentActor,
    requestId: string,
    dto: AssociateAssetDto,
  ): Promise<RequestResponseDto> {
    const request = await this.state.requireInScope(actor, requestId);

    if (!ASSET_ASSOCIABLE_STATES.includes(request.operationalState)) {
      throw new ConflictException(
        'La solicitud no admite asociar un activo en su estado actual.',
      );
    }

    // Activo existente: AssetService.get aplica el alcance (404 si no
    // accesible). El DTO devuelto trae el propietario en `processId` y el resto
    // de la visibilidad en `visibleProcessIds` (sin releer la tabla puente).
    const asset = await this.assetService.get(actor, dto.assetId);

    // Refuerzo de visibilidad: el activo debe estar habilitado para el proceso
    // principal de la solicitud (propietario O alguna fila de visibilidad).
    const visibleForMainProcess =
      asset.processId === request.mainProcessId ||
      asset.visibleProcessIds.includes(request.mainProcessId);
    if (!visibleForMainProcess) {
      throw new ConflictException(
        'El activo no esta habilitado para el proceso de la solicitud.',
      );
    }

    const assetId = asset.id;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.request.update({
        where: { id: requestId },
        data: { assetId },
        include: { participants: true },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: requestId,
        scopeProcessId: request.mainProcessId,
        before: { assetId: request.assetId },
        after: { assetId: row.assetId },
      });

      return row;
    });

    return this.state.buildResponse(updated);
  }
}
