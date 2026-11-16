import type { Request } from './api-client';

/**
 * Etiquetas legibles del estado operativo de una Request (BR-022).
 * Espejo del enum RequestState del backend (design 1.3). El estado es
 * read-only en el frontend: solo cambia por las acciones del flujo server-side.
 *
 * Módulo puro (design §7.9.2): solo `import type` de ./api-client, para que
 * e2e/web-lib.spec.ts lo cargue en Node.
 */
export const REQUEST_STATE_LABELS: Record<string, string> = {
  REGISTRADA: 'Registrada',
  EN_TRIAGE: 'En triage',
  DEVUELTA: 'Devuelta',
  RECHAZADA: 'Rechazada',
  BACKLOG_PRIORIZADO: 'Backlog priorizado',
  COMPROMETIDA: 'Comprometida',
  EN_PLANIFICACION: 'En planificación',
  EN_EJECUCION: 'En ejecución',
  BLOQUEADA: 'Bloqueada',
  EN_VALIDACION: 'En validación',
  LISTA_PARA_LIBERAR: 'Lista para liberar',
  EN_ESTABILIZACION: 'En estabilización',
  OPERATIVA: 'Operativa',
  CERRADA: 'Cerrada',
  RETIRADA: 'Retirada',
};

export function requestStateLabel(state: string): string {
  return REQUEST_STATE_LABELS[state] ?? state;
}

/**
 * Estados de una solicitud ya COMPROMETIDA: desde la aprobación del compromiso
 * hasta el cierre. Son las «iniciativas» que muestra el Portafolio por defecto.
 * Quedan fuera los de decisión pendiente o sin compromiso: REGISTRADA,
 * EN_TRIAGE, DEVUELTA, RECHAZADA, BACKLOG_PRIORIZADO y RETIRADA. BLOQUEADA se
 * incluye por completitud del enum (hoy el bloqueo es un indicador aparte).
 */
export const COMMITTED_STATES: readonly string[] = [
  'COMPROMETIDA',
  'EN_PLANIFICACION',
  'EN_EJECUCION',
  'BLOQUEADA',
  'EN_VALIDACION',
  'LISTA_PARA_LIBERAR',
  'EN_ESTABILIZACION',
  'OPERATIVA',
  'CERRADA',
];

/** La solicitud ya está comprometida (es una iniciativa; ver COMMITTED_STATES). */
export function isCommitted(r: Pick<Request, 'operationalState'>): boolean {
  return COMMITTED_STATES.includes(r.operationalState);
}

/** Decisiones de triage legibles. */
export const TRIAGE_DECISION_LABELS: Record<string, string> = {
  CONTINUAR: 'Continuar',
  DEVOLVER: 'Devolver',
  RECHAZAR: 'Rechazar',
};

export function triageDecisionLabel(decision: string): string {
  return TRIAGE_DECISION_LABELS[decision] ?? decision;
}

// Predicados compartidos (design §7.9.2). Son una extracción literal de lo que
// ya decide la UI y no añaden reglas: el backend sigue siendo la autoridad y
// responde 409 si no se cumplen.

/** Estados de Request en los que tiene sentido planificar (design 1.4). */
export const PLANNABLE_STATES: readonly string[] = [
  'COMPROMETIDA',
  'EN_PLANIFICACION',
  'EN_EJECUCION',
];

/** El triage solo se admite desde REGISTRADA (gate server-side). */
export function isTriageable(r: Pick<Request, 'operationalState'>): boolean {
  return r.operationalState === 'REGISTRADA';
}

/**
 * La priorización exige el triage vigente Continuar y el estado En triage o
 * Backlog priorizado (gate server-side §2.3).
 */
export function isPrioritizable(
  r: Pick<Request, 'operationalState' | 'currentTriageDecision'>,
): boolean {
  return (
    r.currentTriageDecision === 'CONTINUAR' &&
    (r.operationalState === 'EN_TRIAGE' ||
      r.operationalState === 'BACKLOG_PRIORIZADO')
  );
}

/** Solicitud comprometida, en planificación o en ejecución. */
export function isPlannable(r: Pick<Request, 'operationalState'>): boolean {
  return PLANNABLE_STATES.includes(r.operationalState);
}

// Política de edición y reenvío (oleada 2, D3 y D4). La regla de negocio vive
// en la API (403, 400 y 409 con mensaje en español); estas funciones solo
// anticipan el resultado para deshabilitar la acción y explicar por qué.

/** Mínimo de caracteres de la justificación de una edición desde «Comprometida». */
export const EDIT_JUSTIFICATION_MIN_LENGTH = 10;

/** Estados en los que, además de líder y jefe, edita quien registró la solicitud. */
export const CREATOR_EDITABLE_STATES: readonly string[] = ['REGISTRADA', 'DEVUELTA'];

/** Desde la aprobación del compromiso hasta antes del cierre: editar exige justificación. */
export const JUSTIFIED_EDIT_STATES: readonly string[] = [
  'COMPROMETIDA',
  'EN_PLANIFICACION',
  'EN_EJECUCION',
  'BLOQUEADA',
  'EN_VALIDACION',
  'LISTA_PARA_LIBERAR',
  'EN_ESTABILIZACION',
  'OPERATIVA',
];

/** Datos del actor que la política necesita (se derivan de `/me/permissions`). */
export interface RequestActor {
  userId: string;
  isJefe: boolean;
  /** Procesos de los que el actor es líder. */
  leaderProcessIds: readonly string[];
}

/** Deriva el actor de la política a partir de los permisos cargados. */
export function requestActorFrom(
  permissions: {
    userId: string;
    roleCodes: readonly string[];
    grants: ReadonlyArray<{ roleCode: string; processId: string }>;
  } | null,
): RequestActor | null {
  if (!permissions) return null;
  return {
    userId: permissions.userId,
    isJefe: permissions.roleCodes.includes('JEFE_AREA'),
    leaderProcessIds: permissions.grants
      .filter((g) => g.roleCode === 'LIDER_PROCESO')
      .map((g) => g.processId),
  };
}

type RequestOwnership = Pick<Request, 'operationalState' | 'mainProcessId' | 'createdByUserId'>;

function isManager(actor: RequestActor, r: RequestOwnership): boolean {
  if (actor.isJefe) return true;
  if (r.mainProcessId === null) return actor.leaderProcessIds.length > 0;
  return actor.leaderProcessIds.includes(r.mainProcessId);
}

function isCreator(actor: RequestActor, r: RequestOwnership): boolean {
  return r.createdByUserId !== null && r.createdByUserId === actor.userId;
}

export interface EditPolicy {
  allowed: boolean;
  /** Motivo visible cuando no se puede editar. */
  reason: string | null;
  /** Desde «Comprometida» el cambio exige justificación. */
  needsJustification: boolean;
}

/** ¿Puede el actor editar la ficha en el estado actual de la solicitud? */
export function editPolicy(actor: RequestActor | null, r: RequestOwnership): EditPolicy {
  const needsJustification = JUSTIFIED_EDIT_STATES.includes(r.operationalState);
  if (r.operationalState === 'CERRADA') {
    return {
      allowed: false,
      reason: 'La solicitud está cerrada y no se puede editar.',
      needsJustification: false,
    };
  }
  // Sin permisos cargados no se bloquea: la API decide y explica.
  if (!actor) return { allowed: true, reason: null, needsJustification };
  if (CREATOR_EDITABLE_STATES.includes(r.operationalState)) {
    const allowed = isManager(actor, r) || isCreator(actor, r);
    return {
      allowed,
      reason: allowed
        ? null
        : 'Solo quien la registró, el líder del proceso o el jefe pueden editar esta solicitud.',
      needsJustification,
    };
  }
  const allowed = isManager(actor, r);
  return {
    allowed,
    reason: allowed
      ? null
      : 'Solo el líder del proceso o el jefe pueden editar una solicitud en este estado.',
    needsJustification,
  };
}

/** ¿Puede el actor reenviar a triage una solicitud devuelta? */
export function resubmitPolicy(
  actor: RequestActor | null,
  r: RequestOwnership,
): { allowed: boolean; reason: string | null } {
  if (r.operationalState !== 'DEVUELTA') return { allowed: false, reason: null };
  if (!actor) return { allowed: true, reason: null };
  const allowed = isManager(actor, r) || isCreator(actor, r);
  return {
    allowed,
    reason: allowed
      ? null
      : 'Solo quien la registró, el líder del proceso o el jefe pueden reenviarla.',
  };
}
