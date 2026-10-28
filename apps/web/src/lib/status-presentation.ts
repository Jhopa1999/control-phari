import type { LucideIcon } from 'lucide-react';
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  TriangleAlert,
} from 'lucide-react';
import { RECORD_STATE_LABEL } from './record-state';
import { REQUEST_STATE_LABELS, TRIAGE_DECISION_LABELS } from './request-state';
import { PLAN_STATUS_LABELS, TASK_STATUS_LABELS } from './status-labels';

/**
 * Presentación de los estados de dominio: etiqueta, tono e icono (design §7.3).
 * Solo presentación, sin reglas: el backend decide los estados.
 *
 * Módulo puro (design §7.9.2): importaciones relativas y lucide-react, sin el
 * alias `@/` ni valores de ./api-client, para que e2e/web-lib.spec.ts lo cargue
 * en Node.
 *
 * Principio de tono: neutral = no iniciado o cerrado; info = en curso o en
 * manos de otro; success = cumplido o vigente; warning = requiere atención o
 * devuelto; danger = bloqueado, rechazado o sobrecarga.
 */

export type Tone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'outline';

export type StatusKind =
  | 'request'
  | 'triage'
  | 'plan'
  | 'task'
  | 'occurrence'
  | 'record'
  | 'log'
  | 'asset'
  | 'document'
  | 'gate'
  | 'capacity'
  | 'band'
  | 'active'
  | 'grant'
  | 'permission'
  | 'blocking'
  | 'blocked';

export interface StatusPresentation {
  label: string;
  tone: Tone;
  icon?: LucideIcon;
}

/** Tono de un valor, con icono opcional. */
type ToneSpec = Tone | { tone: Tone; icon: LucideIcon };

// Etiquetas nuevas de esta tabla. Las de solicitud, triage, plan, tarea y
// registro salen de sus mapas (request-state, status-labels y record-state).
const LOG_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  ENVIADO: 'Enviado',
  REVISADO: 'Revisado',
};
/** Estados de una ocurrencia de actividad recurrente (OccurrenceStatus). */
const OCCURRENCE_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  VENCIDA: 'Vencida',
};
const ASSET_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  ACTIVO: 'Activo',
  RETIRADO: 'Retirado',
};
const DOCUMENT_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  VIGENTE: 'Vigente',
  ARCHIVADA: 'Archivada',
};
const GATE_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  CUMPLIDO: 'Cumplido',
  NO_APLICA: 'No aplica',
};
const CAPACITY_LABELS: Record<string, string> = {
  OK: 'Normal',
  SOBRECARGA: 'Sobrecarga',
  SIN_DISPONIBILIDAD: 'Sin disponibilidad',
  CARGA_PARCIAL: 'Carga parcial',
};
const BAND_LABELS: Record<string, string> = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
  SIN_PRIORIZAR: 'Sin priorizar',
};
const ACTIVE_LABELS: Record<string, string> = {
  true: 'Activo',
  false: 'Inactivo',
};
const GRANT_LABELS: Record<string, string> = {
  true: 'Activo',
  false: 'Revocado',
};
const PERMISSION_LABELS: Record<string, string> = {
  true: 'Permitido',
  false: 'No permitido',
};
const BLOCKING_LABELS: Record<string, string> = {
  RESUELTO: 'Resuelto',
  SIN_RESOLVER: 'Sin resolver',
};
const BLOCKED_LABELS: Record<string, string> = {
  true: 'Bloqueada',
  false: 'Sin bloqueo',
};

/** Construye la tabla de un tipo: cada valor con tono tiene su etiqueta. */
function statusTable(
  labels: Readonly<Record<string, string>>,
  tones: Readonly<Record<string, ToneSpec>>,
): ReadonlyMap<string, StatusPresentation> {
  const table = new Map<string, StatusPresentation>();
  for (const [value, spec] of Object.entries(tones)) {
    const label = labels[value] ?? value;
    table.set(
      value,
      typeof spec === 'string'
        ? { label, tone: spec }
        : { label, tone: spec.tone, icon: spec.icon },
    );
  }
  return table;
}

// Tabla completa de §7.3. Un Map evita que valores como 'toString' se
// resuelvan contra el prototipo de un objeto.
const STATUS_TABLES: Record<
  StatusKind,
  ReadonlyMap<string, StatusPresentation>
> = {
  request: statusTable(REQUEST_STATE_LABELS, {
    REGISTRADA: 'neutral',
    EN_TRIAGE: 'info',
    DEVUELTA: 'warning',
    RECHAZADA: 'danger',
    BACKLOG_PRIORIZADO: 'info',
    COMPROMETIDA: 'info',
    EN_PLANIFICACION: 'info',
    EN_EJECUCION: 'info',
    BLOQUEADA: 'danger',
    EN_VALIDACION: 'info',
    LISTA_PARA_LIBERAR: 'success',
    EN_ESTABILIZACION: 'info',
    OPERATIVA: 'success',
    CERRADA: 'neutral',
    RETIRADA: 'neutral',
  }),
  triage: statusTable(TRIAGE_DECISION_LABELS, {
    CONTINUAR: 'success',
    DEVOLVER: 'warning',
    RECHAZAR: 'danger',
  }),
  plan: statusTable(PLAN_STATUS_LABELS, {
    BORRADOR: 'neutral',
    EN_AUTORIZACION: 'info',
    AUTORIZADO: 'success',
    DEVUELTO: 'warning',
  }),
  task: statusTable(TASK_STATUS_LABELS, {
    POR_HACER: 'neutral',
    EN_CURSO: 'info',
    BLOQUEADA: 'danger',
    EN_REVISION: 'info',
    TERMINADA: 'success',
  }),
  occurrence: statusTable(OCCURRENCE_LABELS, {
    PENDIENTE: { tone: 'neutral', icon: CircleDashed },
    EN_CURSO: 'info',
    COMPLETADA: { tone: 'success', icon: CircleCheck },
    VENCIDA: { tone: 'danger', icon: TriangleAlert },
  }),
  record: statusTable(RECORD_STATE_LABEL, {
    BORRADOR: 'neutral',
    EN_CURSO: 'info',
    BLOQUEADO: 'danger',
    COMPLETADO: 'success',
    ARCHIVADO: 'neutral',
  }),
  log: statusTable(LOG_LABELS, {
    BORRADOR: 'neutral',
    ENVIADO: 'info',
    REVISADO: 'success',
  }),
  asset: statusTable(ASSET_LABELS, {
    BORRADOR: 'neutral',
    ACTIVO: 'success',
    RETIRADO: 'neutral',
  }),
  document: statusTable(DOCUMENT_LABELS, {
    BORRADOR: 'neutral',
    VIGENTE: 'success',
    ARCHIVADA: 'neutral',
  }),
  gate: statusTable(GATE_LABELS, {
    PENDIENTE: { tone: 'neutral', icon: CircleDashed },
    CUMPLIDO: { tone: 'success', icon: CircleCheck },
    NO_APLICA: { tone: 'outline', icon: CircleMinus },
  }),
  capacity: statusTable(CAPACITY_LABELS, {
    OK: 'success',
    SOBRECARGA: { tone: 'danger', icon: TriangleAlert },
    SIN_DISPONIBILIDAD: 'neutral',
    CARGA_PARCIAL: 'warning',
  }),
  band: statusTable(BAND_LABELS, {
    P1: 'danger',
    P2: 'warning',
    P3: 'info',
    P4: 'neutral',
    SIN_PRIORIZAR: 'outline',
  }),
  active: statusTable(ACTIVE_LABELS, { true: 'success', false: 'neutral' }),
  grant: statusTable(GRANT_LABELS, { true: 'success', false: 'neutral' }),
  permission: statusTable(PERMISSION_LABELS, {
    true: 'success',
    false: 'neutral',
  }),
  // "No" (sin bloqueante) se muestra como texto, no como badge.
  blocking: statusTable(BLOCKING_LABELS, {
    RESUELTO: 'neutral',
    SIN_RESOLVER: { tone: 'danger', icon: TriangleAlert },
  }),
  // 'false' existe por completitud; en tablas se muestra "—" en su lugar.
  blocked: statusTable(BLOCKED_LABELS, {
    true: { tone: 'danger', icon: TriangleAlert },
    false: 'neutral',
  }),
};

/**
 * Etiqueta, tono e icono de un estado. Un valor desconocido devuelve
 * { label: valor, tone: 'neutral' } (null, undefined o '' -> '—') y nunca lanza.
 */
export function getStatus(
  kind: StatusKind,
  value: string | null | undefined,
): StatusPresentation {
  if (value === null || value === undefined || value === '') {
    return { label: '—', tone: 'neutral' };
  }
  return STATUS_TABLES[kind]?.get(value) ?? { label: value, tone: 'neutral' };
}

/**
 * Etiquetas de respaldo de la ruta proporcional (maestra GOVERNANCE_ROUTE).
 * Solo se usan si la maestra no trae el código.
 */
export const GOVERNANCE_ROUTE_FALLBACK_LABELS: Record<string, string> = {
  COMPLETA: 'Completa',
  SIMPLIFICADA: 'Simplificada',
  EXPLORACION: 'Exploración',
};

/**
 * Etiqueta de una ruta proporcional: la de la maestra GOVERNANCE_ROUTE
 * (editable en Maestras), si no la de respaldo y, si tampoco, el código.
 * null o '' -> '—'.
 */
export function routeLabel(
  code: string | null | undefined,
  catalog: ReadonlyArray<{ code: string; label: string }>,
): string {
  if (code === null || code === undefined || code === '') return '—';
  const fromCatalog = catalog.find((item) => item.code === code)?.label;
  if (fromCatalog) return fromCatalog;
  return Object.prototype.hasOwnProperty.call(
    GOVERNANCE_ROUTE_FALLBACK_LABELS,
    code,
  )
    ? GOVERNANCE_ROUTE_FALLBACK_LABELS[code]
    : code;
}

export type PriorityBand = 'P1' | 'P2' | 'P3' | 'P4';

/**
 * Glosa de cada banda de prioridad: la misma de la API, con ortografía. La
 * banda nunca se deriva del score en el frontend.
 */
export const PRIORITY_BAND_COPY: Record<PriorityBand, string> = {
  P1: 'Primera consideración para compromiso',
  P2: 'Programación en el horizonte cercano',
  P3: 'Planificación ordinaria según capacidad',
  P4: 'Reserva de demanda, reformulación o cierre motivado',
};

const BAND_PREFIX = /^(P[1-4])\b/;

/**
 * Banda del prefijo de `priorityLabel` de la API ("P2 · Programacion…" -> 'P2').
 * 'P10', 'Sin priorizar', null o '' -> null.
 */
export function parseBand(label: string | null | undefined): PriorityBand | null {
  if (!label) return null;
  const match = BAND_PREFIX.exec(label);
  return match ? (match[1] as PriorityBand) : null;
}
