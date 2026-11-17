import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { RequestModel } from '../../generated/prisma/models/Request';
import type { RequestParticipantModel } from '../../generated/prisma/models/RequestParticipant';
import type { TriageModel } from '../../generated/prisma/models/Triage';
import type { PriorityEvaluationModel } from '../../generated/prisma/models/PriorityEvaluation';
import { CurrentActor } from '../auth/current-actor';
import { requestScopeWhere } from './request-scope.service';
import { RequestResponseDto } from './dto/request-response.dto';
import {
  isImplementedTransition,
  isRequestState,
  RequestState,
} from './request-state';

/** Decisiones de triage (design §1.2). */
export const TRIAGE_DECISIONS = ['CONTINUAR', 'DEVOLVER', 'RECHAZAR'] as const;
export type TriageDecision = (typeof TRIAGE_DECISIONS)[number];

/** Nombres de lo referenciado por una o varias solicitudes (proceso y activo). */
interface RequestReferenceNames {
  processes: Map<string, { id: string; code: string; name: string }>;
  assets: Map<string, string>;
}

/** Request con sus participantes (shape de lectura comun del modulo). */
export type RequestWithParticipants = RequestModel & {
  participants: RequestParticipantModel[];
};

/**
 * Pesos de los 8 criterios de prioridad (design §1.4, suman 100). El orden fija
 * la contribucion de cada criterio: score = round(Σ peso_i·(valor_i/5)).
 */
export const PRIORITY_WEIGHTS = {
  impact: 25,
  alignment: 15,
  riskControl: 15,
  urgency: 10,
  scope: 10,
  dataAvailability: 10,
  feasibility: 10,
  reuse: 5,
} as const;

/** Los 8 criterios de una evaluacion, en el orden de los pesos. */
export type PriorityCriteria = Record<keyof typeof PRIORITY_WEIGHTS, number>;

/**
 * Helper compartido por el modulo request/ (design §3.2):
 * - valida y resuelve transiciones de estado (unico escritor de
 *   `operationalState`, design §1.3);
 * - lee el triage vigente (1:1 efectivo) y la ultima PriorityEvaluation;
 * - calcula el score ponderado y la etiqueta de umbral informativa.
 *
 * No muta por si mismo: devuelve el `operationalState` destino para que el
 * service lo escriba dentro de su propia $transaction.
 */
@Injectable()
export class RequestStateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alcance de lectura compartido (ver 
equest-scope.service.ts). */
  private scopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    return requestScopeWhere(actor);
  }

  /**
   * Resuelve una Request dentro del alcance del actor o lanza 404 (el alcance en
   * el `where`, sin confirmar existencia fuera de alcance). Usado por los
   * submodulos triage/priority/approval antes de aplicar su gate.
   */
  async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<RequestModel> {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id }, this.scopeWhere(actor)] },
    });
    if (!request) {
      throw new NotFoundException('No se encontró la solicitud.');
    }
    return request;
  }

  /**
   * Compone el RequestResponseDto con el triage vigente (decision) y la ultima
   * evaluacion (score + etiqueta), segun el contrato de vigencia (design §3.4).
   * Helper compartido del modulo request/: incluye el activo base (`assetId`).
   */
  async buildResponse(
    request: RequestWithParticipants,
  ): Promise<RequestResponseDto> {
    const triage = await this.currentTriage(request.id);
    const evaluation = await this.currentPriorityEvaluation(request.id);
    const refs = await this.referenceNames([request]);
    return this.compose(request, triage, evaluation, refs);
  }

  /**
   * Versión por lote de `buildResponse` para los listados: triage vigente,
   * evaluación vigente y nombres referenciados en consultas únicas (sin 1+N).
   * Mismo criterio de vigencia que `currentTriage` y
   * `currentPriorityEvaluation` (la última por fecha).
   */
  async buildResponses(
    requests: RequestWithParticipants[],
  ): Promise<RequestResponseDto[]> {
    if (requests.length === 0) {
      return [];
    }
    const ids = requests.map((r) => r.id);
    const [triages, evaluations, refs] = await Promise.all([
      this.prisma.triage.findMany({
        where: { requestId: { in: ids } },
        orderBy: { decidedAt: 'desc' },
      }),
      this.prisma.priorityEvaluation.findMany({
        where: { requestId: { in: ids } },
        orderBy: { evaluatedAt: 'desc' },
      }),
      this.referenceNames(requests),
    ]);
    const triageBy = new Map<string, TriageModel>();
    for (const triage of triages) {
      if (!triageBy.has(triage.requestId)) triageBy.set(triage.requestId, triage);
    }
    const evaluationBy = new Map<string, PriorityEvaluationModel>();
    for (const evaluation of evaluations) {
      if (!evaluationBy.has(evaluation.requestId)) {
        evaluationBy.set(evaluation.requestId, evaluation);
      }
    }
    return requests.map((r) =>
      this.compose(r, triageBy.get(r.id) ?? null, evaluationBy.get(r.id) ?? null, refs),
    );
  }

  /**
   * Nombre y código del proceso principal y nombre del activo de varias
   * solicitudes (BL-039: la persona no debe ver solo UUID). Una consulta por
   * tipo de referencia, con `select` mínimo.
   */
  private async referenceNames(
    requests: Pick<RequestModel, 'mainProcessId' | 'assetId'>[],
  ): Promise<RequestReferenceNames> {
    const processIds = [
      ...new Set(requests.flatMap((r) => (r.mainProcessId ? [r.mainProcessId] : []))),
    ];
    const assetIds = [
      ...new Set(requests.flatMap((r) => (r.assetId ? [r.assetId] : []))),
    ];
    const [processes, assets] = await Promise.all([
      processIds.length > 0
        ? this.prisma.process.findMany({
            where: { id: { in: processIds } },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
      assetIds.length > 0
        ? this.prisma.asset.findMany({
            where: { id: { in: assetIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      processes: new Map(processes.map((p) => [p.id, p])),
      assets: new Map(assets.map((a) => [a.id, a.name])),
    };
  }

  private compose(
    request: RequestWithParticipants,
    triage: TriageModel | null,
    evaluation: PriorityEvaluationModel | null,
    refs: RequestReferenceNames,
  ): RequestResponseDto {
    const mainProcess = request.mainProcessId
      ? refs.processes.get(request.mainProcessId)
      : undefined;
    return {
      id: request.id,
      code: request.code,
      title: request.title,
      registeredAt: request.registeredAt,
      requesterId: request.requesterId,
      requesterArea: request.requesterArea,
      requesterName: request.requesterName,
      functionalOwner: request.functionalOwner,
      targetDate: request.targetDate,
      referenceUrl: request.referenceUrl,
      expectedResult: request.expectedResult,
      mainProcessId: request.mainProcessId,
      mainProcessCode: mainProcess?.code ?? null,
      mainProcessName: mainProcess?.name ?? null,
      assetId: request.assetId,
      assetName: request.assetId ? (refs.assets.get(request.assetId) ?? null) : null,
      createdByUserId: request.createdByUserId,
      operationalState: request.operationalState,
      initialCommitmentDate: request.initialCommitmentDate,
      changeJustification: request.changeJustification,
      currentTriageDecision: triage ? triage.decision : null,
      // Solo el motivo de una devolución o rechazo; las notas y dependencias
      // del triage son internas y nunca salen por la ficha del solicitante.
      currentTriageReason:
        triage && (triage.decision === 'DEVOLVER' || triage.decision === 'RECHAZAR')
          ? (triage.decisionReason ?? null)
          : null,
      currentTriageDecidedAt: triage ? triage.decidedAt : null,
      currentScore: evaluation ? evaluation.score : null,
      priorityLabel: evaluation ? this.priorityLabel(evaluation.score) : null,
      participants: request.participants.map((p) => ({
        id: p.id,
        processId: p.processId,
      })),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  /**
   * Valida que un code maestro exista y este activo en su familia (catalog);
   * code inexistente/inactivo -> 400 (design §2.4, sin exponer Prisma). No hace
   * nada si `code` es undefined (campo opcional).
   */
  async assertCatalogCode(
    catalog: string,
    code: string | undefined,
  ): Promise<void> {
    if (code === undefined) {
      return;
    }
    const item = await this.prisma.catalogItem.findFirst({
      where: { catalog, code, active: true },
      select: { id: true },
    });
    if (!item) {
      throw new BadRequestException('Revisa los datos ingresados.');
    }
  }

  /**
   * Valida que `from -> to` sea una transicion implementada (design §1.3) y
   * devuelve el estado destino como texto para persistir. No admite valores
   * fuera del enum (error interno) ni transiciones no implementadas
   * (ConflictException: precondicion de fase no cumplida).
   */
  assertTransition(from: string, to: RequestState): RequestState {
    if (!isRequestState(from)) {
      // Un valor no tipado en BD es un fallo de integridad, no del cliente.
      throw new InternalServerErrorException(
        `Estado operativo "${from}" no es un RequestState válido.`,
      );
    }
    if (!isImplementedTransition(from, to)) {
      throw new ConflictException(
        `No se puede pasar de "${from}" a "${to}" en esta fase.`,
      );
    }
    return to;
  }

  /**
   * Triage vigente de una Request. En Fase 2 el triage es 1:1 efectivo
   * (design §11 D3): hay cero o una fila. Se lee por `decidedAt desc` para que
   * quede correcto el dia que se habilite el historico.
   */
  async currentTriage(requestId: string): Promise<TriageModel | null> {
    return this.prisma.triage.findFirst({
      where: { requestId },
      orderBy: { decidedAt: 'desc' },
    });
  }

  /**
   * Evaluacion de prioridad vigente = la ultima por `evaluatedAt`
   * (design §11 D4). Las previas son historico de solo lectura.
   */
  async currentPriorityEvaluation(
    requestId: string,
  ): Promise<PriorityEvaluationModel | null> {
    return this.prisma.priorityEvaluation.findFirst({
      where: { requestId },
      orderBy: { evaluatedAt: 'desc' },
    });
  }

  /**
   * Score ponderado 20-100 (design §1.1): round(Σ peso_i·(valor_i/5)). Los 8
   * criterios deben estar presentes y en 1-5 (el DTO ya lo exige). Todos en 5
   * -> 100; todos en 1 -> 20. Redondeo Math.round. La formula y los pesos no
   * cambian en Fase 7: solo se realinean los cortes/vocabulario de la etiqueta.
   */
  computeScore(criteria: PriorityCriteria): number {
    let sum = 0;
    for (const key of Object.keys(PRIORITY_WEIGHTS) as Array<
      keyof typeof PRIORITY_WEIGHTS
    >) {
      sum += PRIORITY_WEIGHTS[key] * (criteria[key] / 5);
    }
    return Math.round(sum);
  }

  /**
   * Banda de prioridad orientadora del marco FCGR §4 (design §1.1), derivada del
   * score con cortes inclusivos 80/65/45; cuarto tramo <45. Es un codigo estable
   * (P1..P4) pensado para logica/filtros; la glosa legible la da `priorityLabel`.
   * Solo clasifica: no dispara transiciones ni aprobacion.
   */
  priorityBand(score: number): 'P1' | 'P2' | 'P3' | 'P4' {
    if (score >= 80) return 'P1';
    if (score >= 65) return 'P2';
    if (score >= 45) return 'P3';
    return 'P4';
  }

  /**
   * Etiqueta informativa derivada del score (design §1.1): banda P1-P4 del marco
   * FCGR §4 con la glosa de la decision de planificacion. Cortes inclusivos
   * 80/65/45; cuarto tramo <45. Solo etiqueta: no dispara transiciones ni
   * aprobacion. Se conserva el nombre `priorityLabel` para no romper llamadas
   * existentes (approval.service.ts, priority.service.ts).
   */
  priorityLabel(score: number): string {
    return PRIORITY_BAND_LABELS[this.priorityBand(score)];
  }
}

/**
 * Glosa legible de cada banda de prioridad (marco FCGR §4, design §1.1). Es una
 * constante de dominio (texto del marco), no configuracion de ambiente; debe
 * coincidir con los labels sembrados en el catalogo PRIORITY_BAND del seed.
 */
const PRIORITY_BAND_LABELS: Record<'P1' | 'P2' | 'P3' | 'P4', string> = {
  P1: 'P1 · Primera consideración para compromiso',
  P2: 'P2 · Programación en el horizonte cercano',
  P3: 'P3 · Planificación ordinaria según capacidad',
  P4: 'P4 · Reserva de demanda, reformulación o cierre motivado',
};
