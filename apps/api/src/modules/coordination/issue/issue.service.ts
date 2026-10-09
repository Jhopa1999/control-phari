import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { IssueModel } from '../../../generated/prisma/models/Issue';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorkflowStateService } from '../workflow-state.service';
import { dateStringToDate, dateToString } from '../date';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { ListIssuesDto } from './dto/list-issues.dto';
import { TransitionDto } from '../dto/transition.dto';
import { IssueResponseDto } from './dto/issue-response.dto';

/**
 * Logica de novedades (design §2.2/§2.6/§4). Un registro por incidente (AC-019):
 * PATCH edita, no duplica. Alcance via CoordinationScopeService; transicion de
 * estado via WorkflowStateService (salto -> 400). Mutacion + AuditEvent en la
 * MISMA `$transaction` (objectType ISSUE, scopeProcessId = issue.processId).
 */
@Injectable()
export class IssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: CoordinationScopeService,
    private readonly workflow: WorkflowStateService,
  ) {}

  private snapshot(row: IssueModel): Prisma.InputJsonValue {
    return {
      id: row.id,
      processId: row.processId,
      reportedByUserId: row.reportedByUserId,
      date: dateToString(row.date),
      typeCode: row.typeCode,
      state: row.state,
      title: row.title,
      relatedRequestId: row.relatedRequestId,
      relatedTaskId: row.relatedTaskId,
      relatedAssetRef: row.relatedAssetRef,
      detail: row.detail,
      impact: row.impact,
      resolverUserId: row.resolverUserId,
      targetDate: row.targetDate ? dateToString(row.targetDate) : null,
      resolution: row.resolution,
    };
  }

  private toResponse(row: IssueModel): IssueResponseDto {
    return {
      id: row.id,
      processId: row.processId,
      reportedByUserId: row.reportedByUserId,
      date: dateToString(row.date),
      typeCode: row.typeCode,
      state: row.state,
      title: row.title,
      relatedRequestId: row.relatedRequestId,
      relatedTaskId: row.relatedTaskId,
      relatedAssetRef: row.relatedAssetRef,
      detail: row.detail,
      impact: row.impact,
      resolverUserId: row.resolverUserId,
      targetDate: row.targetDate ? dateToString(row.targetDate) : null,
      resolution: row.resolution,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Request relacionada por visibilidad real de Fase 2 (404 fuera). */
  private async requireRequestVisible(
    actor: CurrentActor,
    requestId: string,
  ): Promise<void> {
    const request = await this.prisma.request.findFirst({
      where: {
        AND: [{ id: requestId }, this.scope.requestVisibilityWhere(actor)],
      },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${requestId}" no encontrada.`);
    }
  }

  /** Task relacionada por traversal phase.plan.request (404 fuera). */
  private async requireTaskVisible(
    actor: CurrentActor,
    taskId: string,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      include: { phase: { select: { planId: true } } },
    });
    if (!task) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    const plan = await this.prisma.plan.findFirst({
      where: { id: task.phase.planId },
      select: { requestId: true },
    });
    if (!plan) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
    const request = await this.prisma.request.findFirst({
      where: {
        AND: [{ id: plan.requestId }, this.scope.requestVisibilityWhere(actor)],
      },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException(`Tarea "${taskId}" no encontrada.`);
    }
  }

  private async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<IssueModel> {
    const row = await this.prisma.issue.findFirst({
      where: { AND: [{ id }, this.scope.issueWhere(actor)] },
    });
    if (!row) {
      throw new NotFoundException(`Novedad "${id}" no encontrada.`);
    }
    return row;
  }

  async list(
    actor: CurrentActor,
    filters: ListIssuesDto,
  ): Promise<IssueResponseDto[]> {
    const where: Prisma.IssueWhereInput = {
      AND: [this.scope.issueWhere(actor)],
    };
    const and = where.AND as Prisma.IssueWhereInput[];
    if (filters.state !== undefined) {
      and.push({ state: filters.state });
    }
    if (filters.typeCode !== undefined) {
      and.push({ typeCode: filters.typeCode });
    }
    if (filters.processId !== undefined) {
      and.push({ processId: filters.processId });
    }

    const rows = await this.prisma.issue.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(actor: CurrentActor, id: string): Promise<IssueResponseDto> {
    const row = await this.requireInScope(actor, id);
    return this.toResponse(row);
  }

  async create(
    actor: CurrentActor,
    dto: CreateIssueDto,
  ): Promise<IssueResponseDto> {
    const date = dateStringToDate(dto.date);
    const targetDate =
      dto.targetDate !== undefined
        ? dateStringToDate(dto.targetDate)
        : undefined;
    if (dto.relatedRequestId) {
      await this.requireRequestVisible(actor, dto.relatedRequestId);
    }
    if (dto.relatedTaskId) {
      await this.requireTaskVisible(actor, dto.relatedTaskId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.issue.create({
        data: {
          processId: dto.processId,
          reportedByUserId: actor.userId,
          date,
          title: dto.title,
          ...(dto.typeCode !== undefined ? { typeCode: dto.typeCode } : {}),
          ...(dto.relatedRequestId !== undefined
            ? { relatedRequestId: dto.relatedRequestId }
            : {}),
          ...(dto.relatedTaskId !== undefined
            ? { relatedTaskId: dto.relatedTaskId }
            : {}),
          ...(dto.relatedAssetRef !== undefined
            ? { relatedAssetRef: dto.relatedAssetRef }
            : {}),
          ...(dto.detail !== undefined ? { detail: dto.detail } : {}),
          ...(dto.impact !== undefined ? { impact: dto.impact } : {}),
          ...(dto.resolverUserId !== undefined
            ? { resolverUserId: dto.resolverUserId }
            : {}),
          ...(targetDate !== undefined ? { targetDate } : {}),
          ...(dto.resolution !== undefined
            ? { resolution: dto.resolution }
            : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'ISSUE',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: null,
        after: this.snapshot(row),
      });

      return row;
    });

    return this.toResponse(created);
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateIssueDto,
  ): Promise<IssueResponseDto> {
    const existing = await this.requireInScope(actor, id);
    const targetDate =
      dto.targetDate !== undefined
        ? dateStringToDate(dto.targetDate)
        : undefined;
    if (dto.relatedRequestId) {
      await this.requireRequestVisible(actor, dto.relatedRequestId);
    }
    if (dto.relatedTaskId) {
      await this.requireTaskVisible(actor, dto.relatedTaskId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.issue.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.typeCode !== undefined ? { typeCode: dto.typeCode } : {}),
          ...(dto.relatedRequestId !== undefined
            ? { relatedRequestId: dto.relatedRequestId }
            : {}),
          ...(dto.relatedTaskId !== undefined
            ? { relatedTaskId: dto.relatedTaskId }
            : {}),
          ...(dto.relatedAssetRef !== undefined
            ? { relatedAssetRef: dto.relatedAssetRef }
            : {}),
          ...(dto.detail !== undefined ? { detail: dto.detail } : {}),
          ...(dto.impact !== undefined ? { impact: dto.impact } : {}),
          ...(dto.resolverUserId !== undefined
            ? { resolverUserId: dto.resolverUserId }
            : {}),
          ...(targetDate !== undefined ? { targetDate } : {}),
          ...(dto.resolution !== undefined
            ? { resolution: dto.resolution }
            : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'ISSUE',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.snapshot(existing),
        after: this.snapshot(row),
      });

      return row;
    });

    return this.toResponse(updated);
  }

  async transition(
    actor: CurrentActor,
    id: string,
    dto: TransitionDto,
  ): Promise<IssueResponseDto> {
    const existing = await this.requireInScope(actor, id);
    const toState = this.workflow.assertTransition(existing.state, dto.toState);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.issue.update({
        where: { id },
        data: { state: toState },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'ISSUE',
        objectId: row.id,
        scopeProcessId: row.processId,
        before: this.snapshot(existing),
        after: this.snapshot(row),
      });

      return row;
    });

    return this.toResponse(updated);
  }

  async remove(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireInScope(actor, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.issue.delete({ where: { id } });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'ISSUE',
        objectId: existing.id,
        scopeProcessId: existing.processId,
        before: this.snapshot(existing),
        after: null,
      });
    });
  }
}
