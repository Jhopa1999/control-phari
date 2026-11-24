import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { RoleCode } from '../auth/role-code';
import { CurrentActor } from '../auth/current-actor';
import type { AuditEventModel } from '../../generated/prisma/models/AuditEvent';
import {
  formatAssetCode,
  formatDocumentCode,
  parseAuditObjectCode,
} from '../plan/visible-code';
import { dateStringToDate } from '../coordination/date';
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
  | 'REQUESTER'
  | 'PROJECT_CLOSURE'
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
  | 'DAILY_LOG_SUGGESTION'
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
  | 'AI_CONFIG'
  | 'RECURRING_ACTIVITY'
  | 'RECURRING_ACTIVITY_OCCURRENCE';

/** Verbos de mutacion registrados (design 1.2 / 4.2.1). */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'REVOKE'
  | 'LOGIN_FAILED'
  | 'PASSWORD_RESET_THROTTLED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'PASSWORD_CHANGE_CLEARED'
  | 'PASSWORD_CHANGED';

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

    if (filters.objectCode !== undefined) {
      // El código se traduce a tipo e id del objeto ANTES de consultar; el
      // alcance por rol de arriba sigue aplicándose. Sin coincidencia (o código
      // inexistente) la lista queda vacía: nunca un 404 que delate el objeto.
      const target = await this.resolveObjectCode(filters.objectCode);
      if (
        target === null ||
        (filters.objectType !== undefined && filters.objectType !== target.objectType)
      ) {
        return {
          data: [],
          page: filters.page ?? 1,
          pageSize: Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
          total: 0,
          hasMore: false,
        };
      }
      where.objectType = target.objectType;
      where.objectId = target.objectId;
    }

    // Filtros de investigación: van en un AND aparte para que el alcance por rol
    // (incluido el OR del líder) quede intacto; solo intersectan, nunca amplían.
    const extra: Prisma.AuditEventWhereInput[] = [];
    if (filters.actorUserId !== undefined) {
      extra.push({ actorUserId: filters.actorUserId });
    }
    if (filters.processId !== undefined) {
      extra.push({ scopeProcessId: filters.processId });
    }
    const createdAt = buildCreatedAtRange(filters.from, filters.to);
    if (createdAt !== null) {
      extra.push({ createdAt });
    }
    if (extra.length > 0) {
      where.AND = extra;
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

    const [labels, actorNames] = await Promise.all([
      this.resolveLabels(rows),
      this.resolveActorNames(rows),
    ]);
    return {
      data: rows.map((row) =>
        toResponseDto(
          row,
          labels.get(labelKey(row.objectType, row.objectId)),
          row.actorUserId === null ? null : (actorNames.get(row.actorUserId) ?? null),
        ),
      ),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  /** Nombre de los actores de la página, en una sola consulta (sin N+1). */
  private async resolveActorNames(
    rows: Array<{ actorUserId: string | null }>,
  ): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.actorUserId !== null && UUID_PATTERN.test(row.actorUserId)) ids.add(row.actorUserId);
    }
    if (ids.size === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /**
   * Traduce un código visible (`PRY-0012`, `PRY-0012-F2`, `PRY-0012-T07`,
   * `ACT-0007`, `DOC-0003`) al tipo y al id del objeto auditado. `null` si el
   * código no existe o no tiene forma de código.
   */
  private async resolveObjectCode(
    raw: string,
  ): Promise<{ objectType: string; objectId: string } | null> {
    const parsed = parseAuditObjectCode(raw);
    if (parsed === null) return null;
    switch (parsed.kind) {
      case 'REQUEST': {
        const row = await this.prisma.request.findUnique({
          where: { code: parsed.code },
          select: { id: true },
        });
        return row ? { objectType: 'REQUEST', objectId: row.id } : null;
      }
      case 'PHASE': {
        const row = await this.prisma.planPhase.findUnique({
          where: { code: parsed.code },
          select: { id: true },
        });
        return row ? { objectType: 'PLAN_PHASE', objectId: row.id } : null;
      }
      case 'TASK': {
        const row = await this.prisma.task.findUnique({
          where: { code: parsed.code },
          select: { id: true },
        });
        return row ? { objectType: 'TASK', objectId: row.id } : null;
      }
      case 'ASSET': {
        const row = await this.prisma.asset.findUnique({
          where: { number: parsed.number as number },
          select: { id: true },
        });
        return row ? { objectType: 'ASSET', objectId: row.id } : null;
      }
      case 'DOCUMENT': {
        const row = await this.prisma.document.findUnique({
          where: { number: parsed.number as number },
          select: { id: true },
        });
        return row ? { objectType: 'DOCUMENT', objectId: row.id } : null;
      }
    }
  }

  /**
   * Etiqueta (y código visible) de los objetos de la página, por lote: una
   * consulta por tipo de objeto presente, sin N+1. Solo se calcula para
   * eventos que el actor ya puede ver (las filas vienen filtradas por alcance).
   * Un objeto eliminado o de un tipo sin etiqueta no aparece en el mapa.
   */
  private async resolveLabels(
    rows: Array<{ objectType: string; objectId: string }>,
  ): Promise<Map<string, ObjectLabel>> {
    const ids = new Map<string, Set<string>>();
    for (const row of rows) {
      if (typeof row.objectType !== 'string' || !LABELED_TYPES.has(row.objectType)) continue;
      // Algunos eventos guardan en objectId algo que no es un UUID (p. ej.
      // LOGIN_FAILED guarda el identificador escrito): las columnas id son uuid y
      // un valor así haría fallar toda la consulta. Esos eventos van sin etiqueta.
      if (!UUID_PATTERN.test(row.objectId)) continue;
      const set = ids.get(row.objectType) ?? new Set<string>();
      set.add(row.objectId);
      ids.set(row.objectType, set);
    }
    const result = new Map<string, ObjectLabel>();
    const put = (type: string, id: string, code: string | null, label: string): void => {
      result.set(labelKey(type, id), { code, label });
    };
    const inIds = (type: string): { in: string[] } => ({ in: [...(ids.get(type) ?? [])] });
    const jobs: Array<Promise<void>> = [];
    if (ids.has('REQUEST')) {
      jobs.push(
        this.prisma.request
          .findMany({ where: { id: inIds('REQUEST') }, select: { id: true, code: true, title: true } })
          .then((list) => list.forEach((r) => put('REQUEST', r.id, r.code, r.title))),
      );
    }
    if (ids.has('PLAN_PHASE')) {
      jobs.push(
        this.prisma.planPhase
          .findMany({ where: { id: inIds('PLAN_PHASE') }, select: { id: true, code: true, name: true } })
          .then((list) => list.forEach((r) => put('PLAN_PHASE', r.id, r.code, r.name))),
      );
    }
    if (ids.has('TASK')) {
      jobs.push(
        this.prisma.task
          .findMany({ where: { id: inIds('TASK') }, select: { id: true, code: true, title: true } })
          .then((list) => list.forEach((r) => put('TASK', r.id, r.code, r.title))),
      );
    }
    if (ids.has('ASSET')) {
      jobs.push(
        this.prisma.asset
          .findMany({ where: { id: inIds('ASSET') }, select: { id: true, number: true, name: true } })
          .then((list) => list.forEach((r) => put('ASSET', r.id, formatAssetCode(r.number), r.name))),
      );
    }
    if (ids.has('DOCUMENT')) {
      jobs.push(
        this.prisma.document
          .findMany({ where: { id: inIds('DOCUMENT') }, select: { id: true, number: true, title: true } })
          .then((list) => list.forEach((r) => put('DOCUMENT', r.id, formatDocumentCode(r.number), r.title))),
      );
    }
    if (ids.has('USER')) {
      jobs.push(
        this.prisma.user
          .findMany({ where: { id: inIds('USER') }, select: { id: true, name: true } })
          .then((list) => list.forEach((r) => put('USER', r.id, null, r.name))),
      );
    }
    if (ids.has('AREA')) {
      jobs.push(
        this.prisma.area
          .findMany({ where: { id: inIds('AREA') }, select: { id: true, name: true } })
          .then((list) => list.forEach((r) => put('AREA', r.id, null, r.name))),
      );
    }
    if (ids.has('PROCESS')) {
      jobs.push(
        this.prisma.process
          .findMany({ where: { id: inIds('PROCESS') }, select: { id: true, name: true } })
          .then((list) => list.forEach((r) => put('PROCESS', r.id, null, r.name))),
      );
    }
    if (ids.has('CATALOG_ITEM')) {
      jobs.push(
        this.prisma.catalogItem
          .findMany({ where: { id: inIds('CATALOG_ITEM') }, select: { id: true, label: true } })
          .then((list) => list.forEach((r) => put('CATALOG_ITEM', r.id, null, r.label))),
      );
    }
    await Promise.all(jobs);
    return result;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tipos de objeto con etiqueta (y código, si lo tienen) en la respuesta. */
const LABELED_TYPES: ReadonlySet<string> = new Set([
  'REQUEST',
  'PLAN_PHASE',
  'TASK',
  'ASSET',
  'DOCUMENT',
  'USER',
  'AREA',
  'PROCESS',
  'CATALOG_ITEM',
]);

interface ObjectLabel {
  code: string | null;
  label: string;
}

function labelKey(objectType: string, objectId: string): string {
  return `${objectType}:${objectId}`;
}

/**
 * Proyecta una fila de Prisma al contrato HTTP. before/after son Json (objeto,
 * null o, en teoria, escalar); el contrato los expone como objeto nullable, que
 * es lo que registran las mutaciones (siempre objeto o null).
 */
function toResponseDto(
  row: AuditEventModel,
  label?: ObjectLabel,
  actorName: string | null = null,
): AuditEventResponseDto {
  return {
    actorName,
    objectCode: label?.code ?? null,
    objectLabel: label?.label ?? null,
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

/** Rango máximo entre «from» y «to», en días (ambos inclusivos). */
const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Traduce «from» y «to» (YYYY-MM-DD) a un rango sobre createdAt en hora local del
 * servidor: «from» inclusivo desde las 00:00 y «to» inclusivo hasta el fin de ese
 * día. 400 en español si la fecha no es real, «from» es posterior a «to» o el
 * rango pasa de 366 días.
 */
function buildCreatedAtRange(from?: string, to?: string): Prisma.DateTimeFilter | null {
  if (from === undefined && to === undefined) return null;
  const fromUtc = from === undefined ? null : dateStringToDate(from);
  const toUtc = to === undefined ? null : dateStringToDate(to);
  if (fromUtc !== null && toUtc !== null) {
    if (fromUtc.getTime() > toUtc.getTime()) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial.');
    }
    const days = Math.round((toUtc.getTime() - fromUtc.getTime()) / MS_PER_DAY) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException('El rango máximo es de un año (366 días). Acota las fechas.');
    }
  }
  const range: Prisma.DateTimeFilter = {};
  if (fromUtc !== null) {
    range.gte = new Date(fromUtc.getUTCFullYear(), fromUtc.getUTCMonth(), fromUtc.getUTCDate());
  }
  if (toUtc !== null) {
    range.lt = new Date(toUtc.getUTCFullYear(), toUtc.getUTCMonth(), toUtc.getUTCDate() + 1);
  }
  return range;
}
