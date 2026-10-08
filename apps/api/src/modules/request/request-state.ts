/**
 * Enum logico de los estados operativos de una Request (design §1.3). Es un
 * conjunto cerrado y tipado (como RoleCode): gobierna la logica de los gates y
 * nunca es editable por un campo libre (BR-022). La columna
 * `Request.operationalState` guarda el `code` (texto) de uno de estos valores;
 * solo el helper de RequestStateService la escribe.
 */
export enum RequestState {
  REGISTRADA = 'REGISTRADA',
  EN_TRIAGE = 'EN_TRIAGE',
  DEVUELTA = 'DEVUELTA',
  RECHAZADA = 'RECHAZADA',
  BACKLOG_PRIORIZADO = 'BACKLOG_PRIORIZADO',
  COMPROMETIDA = 'COMPROMETIDA',
  EN_PLANIFICACION = 'EN_PLANIFICACION',
  EN_EJECUCION = 'EN_EJECUCION',
  BLOQUEADA = 'BLOQUEADA',
  EN_VALIDACION = 'EN_VALIDACION',
  LISTA_PARA_LIBERAR = 'LISTA_PARA_LIBERAR',
  EN_ESTABILIZACION = 'EN_ESTABILIZACION',
  OPERATIVA = 'OPERATIVA',
  CERRADA = 'CERRADA',
  RETIRADA = 'RETIRADA',
}

/** Todos los estados validos, util para validaciones y pruebas. */
export const REQUEST_STATES: readonly RequestState[] =
  Object.values(RequestState);

/**
 * Transiciones IMPLEMENTADAS en Fase 2 (design §1.3). SOLO estas se admiten en
 * runtime; los demas estados del enum existen pero ninguna accion de Fase 2 los
 * produce (Plan/Ejecucion/Validacion/cierre, fases posteriores). Cada pareja es
 * `from -> to`; la precondicion de fase la aplica cada gate del service, aqui
 * solo se declara que la transicion esta codificada.
 */
export const IMPLEMENTED_TRANSITIONS: ReadonlyArray<
  readonly [RequestState, RequestState]
> = [
  // Registrar un Triage sobre una Request REGISTRADA.
  [RequestState.REGISTRADA, RequestState.EN_TRIAGE],
  // Decision del triage.
  [RequestState.EN_TRIAGE, RequestState.DEVUELTA],
  [RequestState.EN_TRIAGE, RequestState.RECHAZADA],
  // Guardar PriorityEvaluation con triage=CONTINUAR.
  [RequestState.EN_TRIAGE, RequestState.BACKLOG_PRIORIZADO],
  // Re-guardar PriorityEvaluation (re-evaluacion idempotente en estado).
  [RequestState.BACKLOG_PRIORIZADO, RequestState.BACKLOG_PRIORIZADO],
  // Aprobacion del compromiso.
  [RequestState.BACKLOG_PRIORIZADO, RequestState.COMPROMETIDA],
  // Devolucion de aprobacion (destino determinista).
  [RequestState.BACKLOG_PRIORIZADO, RequestState.EN_TRIAGE],
];

/** Indica si una transicion `from -> to` esta implementada en Fase 2. */
export function isImplementedTransition(
  from: RequestState,
  to: RequestState,
): boolean {
  return IMPLEMENTED_TRANSITIONS.some(
    ([f, t]) => f === from && t === to,
  );
}

/** True si el valor es un miembro del enum RequestState. */
export function isRequestState(value: string): value is RequestState {
  return (REQUEST_STATES as readonly string[]).includes(value);
}
