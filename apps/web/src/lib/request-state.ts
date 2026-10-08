/**
 * Etiquetas legibles del estado operativo de una Request (BR-022).
 * Espejo del enum RequestState del backend (design 1.3). El estado es
 * read-only en el frontend: solo cambia por las acciones del flujo server-side.
 */
export const REQUEST_STATE_LABELS: Record<string, string> = {
  REGISTRADA: 'Registrada',
  EN_TRIAGE: 'En triage',
  DEVUELTA: 'Devuelta',
  RECHAZADA: 'Rechazada',
  BACKLOG_PRIORIZADO: 'Backlog priorizado',
  COMPROMETIDA: 'Comprometida',
  EN_PLANIFICACION: 'En planificacion',
  EN_EJECUCION: 'En ejecucion',
  BLOQUEADA: 'Bloqueada',
  EN_VALIDACION: 'En validacion',
  LISTA_PARA_LIBERAR: 'Lista para liberar',
  EN_ESTABILIZACION: 'En estabilizacion',
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
