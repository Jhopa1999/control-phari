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
import { RequestResponseDto } from './dto/request-response.dto';
import {
  isImplementedTransition,
  isRequestState,
  RequestState,
} from './request-state';

/** Decisiones de triage (design §1.2). */
export const TRIAGE_DECISIONS = ['CONTINUAR', 'DEVOLVER', 'RECHAZAR'] as const;
export type TriageDecision = (typeof TRIAGE_DECISIONS)[number];

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

  /**
   * `where` de alcance por proceso principal (design §2.5): jefe sin filtro;
   * no-jefe filtra por scopedProcessIds. Compartido por los submodulos para no
   * duplicar la resolucion de scope.
   */
  private scopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
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
      throw new NotFoundException(`Solicitud "${id}" no encontrada.`);
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

    return {
      id: request.id,
      title: request.title,
      registeredAt: request.registeredAt,
      requesterArea: request.requesterArea,
      requesterName: request.requesterName,
      functionalOwner: request.functionalOwner,
      targetDate: request.targetDate,
      referenceUrl: request.referenceUrl,
      expectedResult: request.expectedResult,
      mainProcessId: request.mainProcessId,
      assetId: request.assetId,
      operationalState: request.operationalState,
      initialCommitmentDate: request.initialCommitmentDate,
      changeJustification: request.changeJustification,
      currentTriageDecision: triage ? triage.decision : null,
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
        `Estado operativo "${from}" no es un RequestState valido.`,
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
  P1: 'P1 · Primera consideracion para compromiso',
  P2: 'P2 · Programacion en el horizonte cercano',
  P3: 'P3 · Planificacion ordinaria segun capacidad',
  P4: 'P4 · Reserva de demanda, reformulacion o cierre motivado',
};
