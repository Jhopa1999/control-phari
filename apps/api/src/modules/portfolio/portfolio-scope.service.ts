import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { RequestScopeService } from '../request/request-scope.service';

/**
 * Alcance de LECTURA del portafolio y del Panel. El alcance de solicitudes ya
 * NO se define aquí: se delega en `RequestScopeService` (fuente única, la misma
 * de Solicitudes, Triage, Priorización, Aprobaciones y Planificación), de modo
 * que las cifras de todas las pantallas coincidan. Aquí solo se proyecta ese
 * alcance a tareas.
 */
@Injectable()
export class PortfolioScopeService {
  constructor(private readonly requests: RequestScopeService) {}

  /** `where` de Request: el alcance compartido de solicitudes. */
  requestScope(actor: CurrentActor): Prisma.RequestWhereInput {
    return this.requests.requestScope(actor);
  }

  /**
   * `where` de Task proyectado al alcance via su Request dueña
   * (`phase.plan.request`), como lo resuelve `TaskService`.
   */
  taskScope(actor: CurrentActor): Prisma.TaskWhereInput {
    return { phase: { plan: { request: this.requestScope(actor) } } };
  }
}