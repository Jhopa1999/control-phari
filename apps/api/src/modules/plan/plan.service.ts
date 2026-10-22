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
import {
  PLAN_DOCUMENT_FORMAT_VERSION,
  PLAN_DOCUMENT_KIND,
  PlanDocumentDto,
} from './dto/plan-document.dto';
import { ImportPlanResultDto } from './dto/import-plan-result.dto';
import { PlanGuideService } from './plan-guide.service';
import { PlanStateService } from './plan-state.service';
import { PlanStatus } from './plan-status';
import { hasCycle } from './dependency/cycle';
import { applyMilestoneRule } from './task/milestone';

/**
 * CRUD del plan y acciones de flujo (design §3.3). Crea el plan desde una
 * Request COMPROMETIDA (COMPROMETIDA->EN_PLANIFICACION via RequestStateService),
 * edita datos (no `status`), expone la guia, y envia/autoriza/devuelve. Toda
 * mutacion + AuditService.record(tx,...) con scopeProcessId=request.mainProcessId
 * en una $transaction. No duplica la maquina de Request (reusa RequestStateService).
 */
/**
 * Payload de Plan con las relaciones `submittedBy` y `authorizedBy` incluidas
 * (solo id+name), para resolver los nombres de quien envio/autorizo sin exponer
 * el UUID crudo ni usar `any` (mismo molde que Triage.mainResponsible). Cada
 * relacion es nullable; si el id es null, la relacion viene null -> nombre null.
 */
type PlanWithUsers = Prisma.PlanGetPayload<{
  include: {
    submittedBy: { select: { id: true; name: true } };
    authorizedBy: { select: { id: true; name: true } };
  };
}>;

const PLAN_USERS_INCLUDE = {
  submittedBy: { select: { id: true, name: true } },
  authorizedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly requestState: RequestStateService,
    private readonly planState: PlanStateService,
    private readonly guide: PlanGuideService,
  ) {}

  private toResponse(plan: PlanWithUsers): PlanResponseDto {
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
      submittedByName: plan.submittedBy?.name ?? null,
      authorizedAt: plan.authorizedAt,
      authorizedByUserId: plan.authorizedByUserId,
      authorizedByName: plan.authorizedBy?.name ?? null,
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
        include: PLAN_USERS_INCLUDE,
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
    // `requirePlanInScope` (servicio de estado compartido) devuelve el plano sin
    // relaciones; se re-lee con include para resolver los nombres sin cambiar su
    // firma. El plan existe (ya validado en alcance), por eso el findFirst no es
    // null.
    const full = await this.prisma.plan.findFirst({
      where: { id: plan.id },
      include: PLAN_USERS_INCLUDE,
    });
    return this.toResponse(full as PlanWithUsers);
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
      const next = await tx.plan.update({
        where: { id: plan.id },
        data,
        include: PLAN_USERS_INCLUDE,
      });
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
        include: PLAN_USERS_INCLUDE,
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
        include: PLAN_USERS_INCLUDE,
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
        include: PLAN_USERS_INCLUDE,
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

  /**
   * Exporta el plan a un documento JSON portable (design §5.4, FR-1). Solo
   * lectura: no abre transaccion ni audita (§6.1). Carga fases ordenadas con sus
   * tareas (desempate estable createdAt->id) y todas las dependencias del plan,
   * asigna `ref` deterministas (t0, t1, ...) y expresa las dependencias con esos
   * refs locales (no UUID de BD). No exporta ids, responsable/proceso ni campos
   * de flujo/ejecucion (§4.3). Disponible en cualquier estado del plan.
   */
  async exportPlan(
    actor: CurrentActor,
    requestId: string,
  ): Promise<PlanDocumentDto> {
    const { plan } = await this.planState.requirePlanInScope(actor, requestId);

    const phases = await this.prisma.planPhase.findMany({
      where: { planId: plan.id },
      orderBy: { order: 'asc' },
      include: {
        tasks: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    const dependencies = await this.prisma.taskDependency.findMany({
      where: { dependent: { phase: { planId: plan.id } } },
      select: { dependentTaskId: true, predecessorTaskId: true },
      orderBy: { createdAt: 'asc' },
    });

    // Asigna un ref local y determinista por tarea recorriendo fases->tareas.
    const refByTaskId = new Map<string, string>();
    let counter = 0;
    const documentPhases = phases.map((phase) => ({
      order: phase.order,
      name: phase.name,
      startDate: phase.startDate ? phase.startDate.toISOString() : null,
      endDate: phase.endDate ? phase.endDate.toISOString() : null,
      deliverable: phase.deliverable,
      tasks: phase.tasks.map((task) => {
        const ref = `t${counter}`;
        counter += 1;
        refByTaskId.set(task.id, ref);
        return {
          ref,
          title: task.title,
          isMilestone: task.isMilestone,
          estimateHours: task.estimateHours,
          startDate: task.startDate ? task.startDate.toISOString() : null,
          endDate: task.endDate ? task.endDate.toISOString() : null,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          frameworkPhaseRequired: task.frameworkPhaseRequired,
          evidenceUrl: task.evidenceUrl,
        };
      }),
    }));

    const documentDependencies = dependencies
      .map((dep) => ({
        dependentRef: refByTaskId.get(dep.dependentTaskId),
        predecessorRef: refByTaskId.get(dep.predecessorTaskId),
      }))
      // Defensa: solo dependencias cuyas dos tareas pertenecen al plan cargado.
      .filter(
        (dep): dep is { dependentRef: string; predecessorRef: string } =>
          dep.dependentRef !== undefined && dep.predecessorRef !== undefined,
      );

    return {
      kind: PLAN_DOCUMENT_KIND,
      formatVersion: PLAN_DOCUMENT_FORMAT_VERSION,
      plan: {
        periodStart: plan.periodStart ? plan.periodStart.toISOString() : null,
        periodEnd: plan.periodEnd ? plan.periodEnd.toISOString() : null,
        commitmentDate: plan.commitmentDate
          ? plan.commitmentDate.toISOString()
          : null,
        risks: plan.risks,
        mitigations: plan.mitigations,
      },
      phases: documentPhases,
      dependencies: documentDependencies,
    };
  }

  /**
   * Importa un plan desde un documento (design §5.5, FR-2) con semantica
   * REPLACE: borra fases/tareas/dependencias y las recrea en una sola
   * $transaction, reaplicando TODAS las reglas de negocio (hito, ciclos, gate de
   * estado editable, alcance). Solo opera sobre planes BORRADOR/DEVUELTO (409).
   * Nunca escribe campos de flujo del plan ni responsable/proceso de la tarea.
   */
  async importPlan(
    actor: CurrentActor,
    requestId: string,
    dto: PlanDocumentDto,
  ): Promise<ImportPlanResultDto> {
    const { plan, mainProcessId } = await this.planState.requirePlanInScope(
      actor,
      requestId,
    );

    // Gate de estado editable (§5.5.2).
    if (
      plan.status !== PlanStatus.BORRADOR &&
      plan.status !== PlanStatus.DEVUELTO
    ) {
      throw new ConflictException(
        'Solo se puede importar sobre un plan en borrador o devuelto.',
      );
    }

    // Validacion semantica pre-persistencia (§5.5.3) -> todo 400.
    const refs = new Set<string>();
    for (const phase of dto.phases) {
      for (const task of phase.tasks) {
        if (task.ref.trim() === '') {
          throw new BadRequestException('Cada tarea debe tener un ref no vacio.');
        }
        if (refs.has(task.ref)) {
          throw new BadRequestException(
            `El ref de tarea "${task.ref}" esta duplicado en el documento.`,
          );
        }
        refs.add(task.ref);
      }
    }

    const seenPairs = new Set<string>();
    for (const dep of dto.dependencies) {
      if (!refs.has(dep.dependentRef) || !refs.has(dep.predecessorRef)) {
        throw new BadRequestException(
          'Una dependencia referencia un ref de tarea inexistente.',
        );
      }
      if (dep.dependentRef === dep.predecessorRef) {
        throw new BadRequestException(
          'Una tarea no puede depender de si misma.',
        );
      }
      const key = `${dep.dependentRef}->${dep.predecessorRef}`;
      if (seenPairs.has(key)) {
        throw new BadRequestException(
          'El documento contiene dependencias duplicadas.',
        );
      }
      seenPairs.add(key);
    }

    const edges = dto.dependencies.map((dep) => ({
      dependentRef: dep.dependentRef,
      predecessorRef: dep.predecessorRef,
    }));
    if (hasCycle(edges)) {
      throw new BadRequestException(
        'El plan importado contiene dependencias ciclicas.',
      );
    }

    // Normaliza la regla de hito por tarea ANTES de persistir; si una tarea hito
    // es invalida, lanza 400 aqui (reusa la regla compartida, §6.3).
    const toDate = (value?: string | null): Date | null =>
      value !== undefined && value !== null ? new Date(value) : null;
    const normalizedByRef = new Map<
      string,
      { estimateHours: number | null; startDate: Date | null; endDate: Date | null }
    >();
    for (const phase of dto.phases) {
      for (const task of phase.tasks) {
        normalizedByRef.set(
          task.ref,
          applyMilestoneRule({
            isMilestone: task.isMilestone,
            estimateHours: task.estimateHours ?? null,
            startDate: toDate(task.startDate),
            endDate: toDate(task.endDate),
          }),
        );
      }
    }

    const beforeCounts = {
      phases: await this.prisma.planPhase.count({ where: { planId: plan.id } }),
      tasks: await this.prisma.task.count({
        where: { phase: { planId: plan.id } },
      }),
    };

    const result = await this.prisma.$transaction(async (tx) => {
      // (a) Borrado hijo->padre (REPLACE).
      await tx.taskDependency.deleteMany({
        where: { dependent: { phase: { planId: plan.id } } },
      });
      await tx.task.deleteMany({ where: { phase: { planId: plan.id } } });
      await tx.planPhase.deleteMany({ where: { planId: plan.id } });

      // (b) Cabecera: reemplazo completo de periodos/risks/mitigations.
      //     NUNCA status/submitted*/authorized*/returnReason.
      await tx.plan.update({
        where: { id: plan.id },
        data: {
          periodStart: toDate(dto.plan.periodStart),
          periodEnd: toDate(dto.plan.periodEnd),
          commitmentDate: toDate(dto.plan.commitmentDate),
          risks: dto.plan.risks ?? null,
          mitigations: dto.plan.mitigations ?? null,
        },
      });

      // (c)+(d) Fases con order 0-based recalculado + tareas con valores
      //         normalizados. responsibleUserId/processId quedan null.
      const taskIdByRef = new Map<string, string>();
      let phasesCreated = 0;
      let tasksCreated = 0;
      for (let i = 0; i < dto.phases.length; i += 1) {
        const phase = dto.phases[i];
        const createdPhase = await tx.planPhase.create({
          data: {
            planId: plan.id,
            name: phase.name,
            order: i,
            startDate: toDate(phase.startDate),
            endDate: toDate(phase.endDate),
            deliverable: phase.deliverable ?? null,
          },
        });
        phasesCreated += 1;

        for (const task of phase.tasks) {
          const normalized = normalizedByRef.get(task.ref) ?? {
            estimateHours: null,
            startDate: null,
            endDate: null,
          };
          const createdTask = await tx.task.create({
            data: {
              phaseId: createdPhase.id,
              title: task.title,
              isMilestone: task.isMilestone,
              estimateHours: normalized.estimateHours,
              startDate: normalized.startDate,
              endDate: normalized.endDate,
              description: task.description ?? null,
              acceptanceCriteria: task.acceptanceCriteria ?? null,
              frameworkPhaseRequired: task.frameworkPhaseRequired ?? null,
              evidenceUrl: task.evidenceUrl ?? null,
            },
          });
          taskIdByRef.set(task.ref, createdTask.id);
          tasksCreated += 1;
        }
      }

      // (e) Dependencias resolviendo ref->nuevoTaskId.
      let dependenciesCreated = 0;
      for (const dep of dto.dependencies) {
        await tx.taskDependency.create({
          data: {
            dependentTaskId: taskIdByRef.get(dep.dependentRef) as string,
            predecessorTaskId: taskIdByRef.get(dep.predecessorRef) as string,
          },
        });
        dependenciesCreated += 1;
      }

      // (f) Auditoria: un unico UPDATE PLAN que resume el reemplazo (§6.1).
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PLAN',
        objectId: plan.id,
        scopeProcessId: mainProcessId,
        before: { phases: beforeCounts.phases, tasks: beforeCounts.tasks },
        after: {
          phases: phasesCreated,
          tasks: tasksCreated,
          dependencies: dependenciesCreated,
          imported: true,
        },
      });

      return { phasesCreated, tasksCreated, dependenciesCreated };
    });

    return {
      requestId,
      planId: plan.id,
      replaced: true,
      phasesCreated: result.phasesCreated,
      tasksCreated: result.tasksCreated,
      dependenciesCreated: result.dependenciesCreated,
      message:
        `Se reemplazo el contenido del plan: ${result.phasesCreated} fases, ` +
        `${result.tasksCreated} tareas, ${result.dependenciesCreated} dependencias.`,
    };
  }
}
