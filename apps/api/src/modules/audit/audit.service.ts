import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { RoleCode } from '../auth/role-code';
import { CurrentActor } from '../auth/current-actor';
import type { AuditEventModel } from '../../generated/prisma/models/AuditEvent';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';
import { AuditEventResponseDto } from './dto/audit-event-response.dto';
import { PaginatedAuditEventsResponseDto } from './dto/paginated-audit-events-response.dto';

/**
 * Tipos de objeto auditables. Fase 1 (design 6.2): PROCESS, USER, GRANT,
 * CATALOG_ITEM. Fase 2 (flujo de demanda, design §1.7): REQUEST, TRIAGE,
 * PRIORITY_EVALUATION, APPROVAL. Fase 3 (plan, design §1.6): PLAN, PLAN_PHASE,
 * TASK, TASK_DEPENDENCY. Fase 4 (capacidad, design §1.5):
 * MONTHLY_AVAILABILITY, ASSIGNMENT. Fase 5 (trabajo y coordinacion, design
 * §1.6): DAILY_LOG, DAILY_LOG_ACTIVITY, WEEKLY_REPORT, ISSUE, MEETING,
 * COMMITMENT. Fase 6 (activos y documentos, design §1.6): ASSET, DOCUMENT,
 * DOCUMENT_VERSION. Fase 7 (gobierno de la demanda, design §3.5): GATE_CHECK,
 * GATE_PENDING_ITEM, VALIDATION_RECORD.
 */
export type AuditObjectType =
  | 'PROCESS'
  | 'AREA'
  | 'USER'
  | 'GRANT'
  | 'CATALOG_ITEM'
  | 'REQUEST'
  | 'TRIAGE'
  | 'PRIORITY_EVALUATION'
  | 'APPROVAL'
  | 'PLAN'
  | 'PLAN_PHASE'
  | 'TASK'
  | 'TASK_DEPENDENCY'
  | 'MONTHLY_AVAILABILITY'
  | 'ASSIGNMENT'
  | 'DAILY_LOG'
  | 'DAILY_LOG_ACTIVITY'
  | 'WEEKLY_REPORT'
  | 'ISSUE'
  | 'MEETING'
  | 'COMMITMENT'
  | 'ASSET'
  | 'DOCUMENT'
  | 'DOCUMENT_VERSION'
  | 'GATE_CHECK'
  | 'GATE_PENDING_ITEM'
  | 'VALIDATION_RECORD'
  | 'SMTP_CONFIG'
  | 'RECURRING_ACTIVITY'
  | 'RECURRING_ACTIVITY_OCCURRENCE';

/** Verbos de mutacion registrados (design 1.2 / 4.2.1). */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE';

/** Datos de un evento de auditoria a registrar dentro de una transaccion. */
export interface AuditRecordInput {
  actorUserId: string | null;
  action: AuditAction;
  objectType: AuditObjectType;
  objectId: string;
  scopeProcessId: string | null;
  before: Prisma.InputJsonValue | null;
  after: Prisma.InputJsonValue | null;
}

/** Tamanos de pagina de la consulta de UI (design 4.2 / 1.2). */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un AuditEvent usando el cliente transaccional `tx` (design 6.1):
   * se escribe dentro de la MISMA transaccion que la mutacion de dominio, de
   * modo que o se guardan el cambio y su evento, o ninguno (atomicidad).
   * before/after Json; null se persiste como JSON null.
   */
  async record(
    tx: Prisma.TransactionClient,
    input: AuditRecordInput,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId,
        scopeProcessId: input.scopeProcessId,
        before:
          input.before === null ? Prisma.JsonNull : input.before,
        after: input.after === null ? Prisma.JsonNull : input.after,
      },
    });
  }

  /**
   * Lectura con alcance por rol (design 2.4 "Auditoria"; specs/10 "Auditoria":
   * integrante = propios eventos, lider = alcance de proceso, jefe = area
   * completa):
   * - JEFE_AREA: TODA el area, sin filtro de proceso. Debe ver tambien los
   *   eventos SIN proceso (scopeProcessId = null): administracion de area como
   *   USER/GRANT/CATALOG_ITEM (Fase 1) y MONTHLY_AVAILABILITY (Fase 4), que son
   *   por persona, no por proceso. Filtrar por scopeProcessId los ocultaria.
   * - LIDER_PROCESO: eventos de sus procesos (scopeProcessId in
   *   scopedProcessIds) MAS sus propios eventos sin proceso (los que el genero,
   *   p. ej. su disponibilidad), para no perder su propia actividad de area.
   * - INTEGRANTE: solo sus propios eventos (actorUserId); nunca auditoria ajena.
   * La paginacion (page/pageSize) se aplica DESPUES del alcance: el MISMO where
   * alimenta findMany y count, de modo que total y hasMore se calculan sobre el
   * alcance y los filtros vigentes, sin exponer filas fuera de alcance. Orden
   * createdAt desc; pageSize acotado a <= 100, nunca ilimitado.
   */
  async findMany(
    actor: CurrentActor,
    filters: ListAuditEventsDto,
  ): Promise<PaginatedAuditEventsResponseDto> {
    const where: Prisma.AuditEventWhereInput = {};

    if (actor.roleCodes.has(RoleCode.JEFE_AREA)) {
      // Jefe: area completa; sin filtro de alcance (ve eventos con y sin proceso).
    } else if (actor.roleCodes.has(RoleCode.LIDER_PROCESO)) {
      // Lider: eventos de sus procesos + sus propios eventos sin proceso.
      where.OR = [
        { scopeProcessId: { in: Array.from(actor.scopedProcessIds) } },
        { scopeProcessId: null, actorUserId: actor.userId },
      ];
    } else {
      // Integrante: solo su propia actividad; nunca auditoria ajena.
      where.actorUserId = actor.userId;
    }

    if (filters.objectType !== undefined) {
      where.objectType = filters.objectType;
    }

    if (filters.action !== undefined) {
      where.action = filters.action;
    }

    const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = filters.page ?? 1;
    const skip = (page - 1) * pageSize;

    // count y findMany comparten el MISMO where (alcance + filtros): el total y
    // hasMore se calculan sobre lo que el actor puede ver, nunca sobre todo.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      data: rows.map(toResponseDto),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }
}

/**
 * Proyecta una fila de Prisma al contrato HTTP. before/after son Json (objeto,
 * null o, en teoria, escalar); el contrato los expone como objeto nullable, que
 * es lo que registran las mutaciones (siempre objeto o null).
 */
function toResponseDto(row: AuditEventModel): AuditEventResponseDto {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    scopeProcessId: row.scopeProcessId,
    before: row.before as Record<string, unknown> | null,
    after: row.after as Record<string, unknown> | null,
    createdAt: row.createdAt,
  };
}
