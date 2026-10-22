import type {
  Approval,
  PriorityEvaluation,
  Request,
  Triage,
} from '@/lib/api-client';

/**
 * Estado de un paso del stepper de la ficha (design §10b del informe de
 * investigación). Se DERIVA del dato existente + el estado operativo de la
 * solicitud; la ficha nunca inventa reglas de negocio: el backend es la
 * autoridad y este módulo solo refleja lo ya registrado.
 *
 * - `completado`: existe un registro de la etapa.
 * - `en-curso`: el estado operativo de la solicitud corresponde a esa etapa.
 * - `pendiente`: la etapa aún no tiene registro.
 *
 * Módulo puro: solo `import type` de `@/lib/api-client`, sin React, para que no
 * arrastre dependencias de cliente.
 */
export type StepState = 'pendiente' | 'en-curso' | 'completado';

/** Etiqueta legible del estado del paso (para el texto accesible del marcador). */
export const STEP_STATE_LABELS: Record<StepState, string> = {
  pendiente: 'Pendiente',
  'en-curso': 'En curso',
  completado: 'Completado',
};

/** Paso 1 · Solicitud: siempre registrada (hay `registeredAt`). */
export function solicitudStepState(): StepState {
  return 'completado';
}

/**
 * Paso 2 · Triage: completado si hay decisión de triage vigente o alguna fila
 * de triage; en curso si la solicitud está «En triage».
 */
export function triageStepState(
  request: Pick<Request, 'operationalState' | 'currentTriageDecision'>,
  triages: Triage[],
): StepState {
  if (request.currentTriageDecision !== null || triages.length > 0) {
    return 'completado';
  }
  return request.operationalState === 'EN_TRIAGE' ? 'en-curso' : 'pendiente';
}

/**
 * Paso 3 · Priorización: completado si hay al menos una evaluación; en curso si
 * la solicitud está en «Backlog priorizado».
 */
export function priorityStepState(
  request: Pick<Request, 'operationalState'>,
  evaluations: PriorityEvaluation[],
): StepState {
  if (evaluations.length > 0) return 'completado';
  return request.operationalState === 'BACKLOG_PRIORIZADO'
    ? 'en-curso'
    : 'pendiente';
}

/**
 * Paso 4 · Aprobación/Compromiso: completado si hay al menos una decisión de
 * compromiso; en curso si la solicitud está «Comprometida».
 */
export function approvalStepState(
  request: Pick<Request, 'operationalState'>,
  approvals: Approval[],
): StepState {
  if (approvals.length > 0) return 'completado';
  return request.operationalState === 'COMPROMETIDA' ? 'en-curso' : 'pendiente';
}

/**
 * Paso 5 · Planificación: completado si hay plan (getPlan respondió 200); en
 * curso si la solicitud está en planificación o en ejecución.
 */
export function planStepState(
  request: Pick<Request, 'operationalState'>,
  hasPlan: boolean,
): StepState {
  if (hasPlan) return 'completado';
  return request.operationalState === 'EN_PLANIFICACION' ||
    request.operationalState === 'EN_EJECUCION'
    ? 'en-curso'
    : 'pendiente';
}

/** Estados operativos en los que la etapa de estabilización/cierre está vigente. */
const STABILIZATION_STATES: readonly string[] = [
  'LISTA_PARA_LIBERAR',
  'EN_ESTABILIZACION',
];
const CLOSURE_STATES: readonly string[] = ['OPERATIVA', 'CERRADA', 'RETIRADA'];

/**
 * Paso 6 · Gobierno y validación: completado si la solicitud ya superó la fase
 * de validación (listas/operativas/cerradas) o hay validaciones; en curso si
 * está «En validación».
 */
export function governanceStepState(
  request: Pick<Request, 'operationalState'>,
  hasValidations: boolean,
): StepState {
  if (
    STABILIZATION_STATES.includes(request.operationalState) ||
    CLOSURE_STATES.includes(request.operationalState)
  ) {
    return 'completado';
  }
  if (request.operationalState === 'EN_VALIDACION') return 'en-curso';
  return hasValidations ? 'completado' : 'pendiente';
}

/**
 * Paso 7 · Estabilización/Cierre: completado si la solicitud está operativa,
 * cerrada o retirada; en curso si está lista para liberar o en estabilización.
 */
export function stabilizationStepState(
  request: Pick<Request, 'operationalState'>,
): StepState {
  if (CLOSURE_STATES.includes(request.operationalState)) return 'completado';
  return STABILIZATION_STATES.includes(request.operationalState)
    ? 'en-curso'
    : 'pendiente';
}
