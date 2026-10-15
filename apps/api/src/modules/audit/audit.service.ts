import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { AuditEventModel } from '../../generated/prisma/models/AuditEvent';
import { RoleCode } from '../auth/role-code';
import { CurrentActor } from '../auth/current-actor';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';

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
  | 'SMTP_CONFIG';

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

/** Tope de eventos devueltos por la consulta de UI (design 4.2 / 1.2). */
const MAX_AUDIT_TAKE = 500;

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
   * Orden createdAt desc; take fijado por el service a <= 500.
   */
  async findMany(
    actor: CurrentActor,
    filters: ListAuditEventsDto,
  ): Promise<AuditEventModel[]> {
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

    const take =
      filters.take !== undefined
        ? Math.min(filters.take, MAX_AUDIT_TAKE)
        : MAX_AUDIT_TAKE;

    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
