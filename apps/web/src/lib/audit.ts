import {
  api,
  type AuditEventsQuery,
  type PaginatedAuditEvents,
} from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Tipos de objeto que el filtro «Objeto» puede enviar al servidor, derivados
 * del contrato generado (design §24.2 y plan D6); no se escriben a mano.
 */
export type AuditObjectType = NonNullable<AuditEventsQuery['objectType']>;

/**
 * Opciones del filtro «Objeto». El Record es exhaustivo: si el contrato añade o
 * quita un valor, el typecheck falla aquí, de modo que las opciones siempre
 * coinciden con lo que acepta el @ApiQuery de audit.controller.ts (OBJECT_TYPES
 * del DTO). SMTP_CONFIG no está entre ellos: el backend no lo admite como filtro
 * y ofrecerlo devolvería 400.
 */
const AUDIT_OBJECT_TYPE_FILTER: Record<AuditObjectType, true> = {
  PROCESS: true,
  AREA: true,
  REQUESTER: true,
  PROJECT_CLOSURE: true,
  USER: true,
  GRANT: true,
  CATALOG_ITEM: true,
  REQUEST: true,
  TRIAGE: true,
  PRIORITY_EVALUATION: true,
  APPROVAL: true,
  PLAN: true,
  PLAN_PHASE: true,
  TASK: true,
  TASK_DEPENDENCY: true,
  MONTHLY_AVAILABILITY: true,
  ASSIGNMENT: true,
  DAILY_LOG: true,
  DAILY_LOG_ACTIVITY: true,
  WEEKLY_REPORT: true,
  ISSUE: true,
  MEETING: true,
  COMMITMENT: true,
  ASSET: true,
  DOCUMENT: true,
  DOCUMENT_VERSION: true,
  GATE_CHECK: true,
  GATE_PENDING_ITEM: true,
  VALIDATION_RECORD: true,
  RECURRING_ACTIVITY: true,
  RECURRING_ACTIVITY_OCCURRENCE: true,
};

export const AUDIT_OBJECT_TYPE_OPTIONS = Object.keys(
  AUDIT_OBJECT_TYPE_FILTER,
) as AuditObjectType[];

/**
 * Acciones que el filtro «Acción» puede enviar al servidor, derivadas del
 * contrato generado; no se escriben a mano.
 */
export type AuditAction = NonNullable<AuditEventsQuery['action']>;

/**
 * Etiquetas de las acciones auditadas (design §11.19). El Record es exhaustivo
 * sobre AuditAction: si el contrato añade o quita un verbo, el typecheck falla
 * aquí, de modo que las opciones del filtro «Acción» siempre coinciden con lo
 * que acepta el @ApiQuery de audit.controller.ts (AUDIT_ACTIONS del DTO).
 */
const AUDIT_ACTION_LABEL_MAP: Record<AuditAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  REVOKE: 'Revocación',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = AUDIT_ACTION_LABEL_MAP;

export const AUDIT_ACTION_OPTIONS = Object.keys(
  AUDIT_ACTION_LABEL_MAP,
) as AuditAction[];

/** Etiquetas de los 26 tipos de objeto, solo para mostrar (design §11.19). */
const AUDIT_OBJECT_LABELS: Record<string, string> = {
  APPROVAL: 'Aprobación',
  ASSET: 'Activo',
  ASSIGNMENT: 'Asignación de horas',
  CATALOG_ITEM: 'Elemento de maestra',
  COMMITMENT: 'Compromiso',
  DAILY_LOG: 'Diario',
  DAILY_LOG_ACTIVITY: 'Actividad del diario',
  DOCUMENT: 'Documento',
  DOCUMENT_VERSION: 'Versión de documento',
  GATE_CHECK: 'Control de gobierno',
  GATE_PENDING_ITEM: 'Faltante de control',
  GRANT: 'Asignación de rol',
  ISSUE: 'Novedad',
  MEETING: 'Reunión',
  MONTHLY_AVAILABILITY: 'Disponibilidad mensual',
  PLAN: 'Plan',
  PLAN_PHASE: 'Fase del plan',
  PRIORITY_EVALUATION: 'Evaluación de prioridad',
  PROCESS: 'Proceso',
  REQUEST: 'Solicitud',
  REQUESTER: 'Solicitante',
  PROJECT_CLOSURE: 'Cierre de proyecto',
  TASK: 'Tarea',
  TASK_DEPENDENCY: 'Dependencia de tarea',
  TRIAGE: 'Triage',
  USER: 'Usuario',
  SMTP_CONFIG: 'Configuración SMTP',
  VALIDATION_RECORD: 'Validación',
  WEEKLY_REPORT: 'Reporte semanal',
};

function labelFrom(labels: Record<string, string>, code: string): string {
  return Object.prototype.hasOwnProperty.call(labels, code) ? labels[code] : code;
}

/** Etiqueta de una acción; un código desconocido se muestra tal cual. */
export function auditActionLabel(code: string): string {
  return labelFrom(AUDIT_ACTION_LABELS, code);
}

/** Etiqueta de un tipo de objeto; un código desconocido se muestra tal cual. */
export function auditObjectLabel(code: string): string {
  return labelFrom(AUDIT_OBJECT_LABELS, code);
}

export interface AuditQuery {
  page: number;
  pageSize: number;
  objectType?: AuditObjectType;
  action?: AuditAction;
}

/**
 * Página de eventos de auditoría visibles para el actor (GET /audit-events),
 * los más recientes primero. El alcance (propio para integrante, por proceso
 * para líder y jefe) y la paginación los aplica el backend, que devuelve
 * { data, page, pageSize, total, hasMore }. Objeto y Acción son filtros de
 * servidor: viajan en la consulta, no acotan solo en cliente.
 */
export async function listAuditEvents(
  query: AuditQuery,
): Promise<PaginatedAuditEvents> {
  try {
    const { data, error, response } = await api.GET('/audit-events', {
      params: {
        query: {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.objectType ? { objectType: query.objectType } : {}),
          ...(query.action ? { action: query.action } : {}),
        },
      },
    });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
