import { api, type AuditEvent, type AuditEventsQuery } from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Tipos de objeto que el filtro «Objeto» puede enviar al servidor, derivados
 * del contrato generado (design §24.2 y plan D6); no se escriben a mano.
 */
export type AuditObjectType = NonNullable<AuditEventsQuery['objectType']>;

/**
 * Opciones del filtro «Objeto». El Record es exhaustivo: si el contrato añade o
 * quita un valor, el typecheck falla aquí. Hoy el contrato declara solo 4,
 * porque el @ApiQuery de audit.controller.ts los fija, aunque el DTO de la API
 * acepta más (pendiente documentado en docs/README.md).
 */
const AUDIT_OBJECT_TYPE_FILTER: Record<AuditObjectType, true> = {
  PROCESS: true,
  USER: true,
  GRANT: true,
  CATALOG_ITEM: true,
  SMTP_CONFIG: true,
};

export const AUDIT_OBJECT_TYPE_OPTIONS = Object.keys(
  AUDIT_OBJECT_TYPE_FILTER,
) as AuditObjectType[];

/** Etiquetas de las acciones auditadas (design §11.19). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  REVOKE: 'Revocación',
};

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

/** Tope de eventos por consulta: el máximo que admite el servidor. */
export const AUDIT_TAKE = 500;

export interface AuditFilters {
  objectType?: AuditObjectType;
}

/**
 * Eventos de auditoría visibles para el actor (GET /audit-events), los más
 * recientes primero. El alcance (propio para integrante, por proceso para
 * líder y jefe) lo aplica el backend; siempre se piden AUDIT_TAKE eventos.
 */
export async function listAuditEvents(
  filters: AuditFilters = {},
): Promise<AuditEvent[]> {
  try {
    const { data, error, response } = await api.GET('/audit-events', {
      params: {
        query: {
          ...(filters.objectType ? { objectType: filters.objectType } : {}),
          take: AUDIT_TAKE,
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
