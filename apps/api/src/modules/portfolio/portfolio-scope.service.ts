import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';

/**
 * Alcance de LECTURA de la Fase 8 (design §4). REPLICA el patron canonico del
 * repo (`RequestStateService.scopeWhere`, `RequestService.scopeWhere`, etc.),
 * que es `private` en esos modulos y no se puede importar: misma forma, no la
 * misma funcion. NO filtra por `roleCode` (la frontera lider/integrante vive en
 * el guard de ruta). Jefe -> sin filtro; resto -> union de TODOS sus grants.
 */
@Injectable()
export class PortfolioScopeService {
  /**
   * `where` de Request por proceso principal: jefe `{}`; no-jefe
   * `mainProcessId ∈ scopedProcessIds` (todos los grants, sin mirar el rol).
   */
  requestScope(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /**
   * `where` de Task proyectado al alcance via su Request dueña
   * (`phase.plan.request`), como lo resuelve `TaskService`. Jefe -> sin filtro.
   */
  taskScope(actor: CurrentActor): Prisma.TaskWhereInput {
    return { phase: { plan: { request: this.requestScope(actor) } } };
  }

  /**
   * `where` de Issue por su proceso dueño (`Issue.processId`). Jefe -> sin
   * filtro; no-jefe -> `processId ∈ scopedProcessIds`.
   */
  issueScope(actor: CurrentActor): Prisma.IssueWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { processId: { in: Array.from(actor.scopedProcessIds) } };
  }
}
