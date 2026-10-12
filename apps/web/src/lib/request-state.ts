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
