/**
 * Enum logico de estados de registro de Fase 5 (design §4; maestra RECORD_STATE
 * de `06`). Es un conjunto cerrado y tipado (como TaskStatus/RoleCode): gobierna
 * las maquinas minimas reversibles de Issue y Commitment. La columna `state`
 * guarda el `code` (texto); solo el helper del modulo coordination la escribe.
 * Los nombres "abierto/en seguimiento/resuelto/cerrado" del brief son conceptos
 * mapeados a estos codigos reales (§1.7/§11 D5); "abierto" = `EN_CURSO`.
 */
export enum RecordState {
  BORRADOR = 'BORRADOR',
  EN_CURSO = 'EN_CURSO',
  BLOQUEADO = 'BLOQUEADO',
  COMPLETADO = 'COMPLETADO',
  ARCHIVADO = 'ARCHIVADO',
}

/** Todos los estados validos, util para validaciones y pruebas. */
export const RECORD_STATES: readonly RecordState[] = Object.values(RecordState);

/**
 * Transiciones permitidas de la maquina minima REVERSIBLE de Issue/Commitment
 * (design §4). SOLO estas aristas se admiten; lo no listado -> 400 en el helper.
 * Reversible por diseno: se puede reabrir (COMPLETADO/ARCHIVADO -> EN_CURSO)
 * para no fijar una terminal que el Site no confirma (`06`/`28` p.3 marcan las
 * transiciones exactas como P).
 */
export const RECORD_STATE_TRANSITIONS: ReadonlyArray<
  readonly [RecordState, RecordState]
> = [
  // Bloqueo y desbloqueo (reversible).
  [RecordState.EN_CURSO, RecordState.BLOQUEADO],
  [RecordState.BLOQUEADO, RecordState.EN_CURSO],
  // Completar ("resolver") desde en curso o bloqueado.
  [RecordState.EN_CURSO, RecordState.COMPLETADO],
  [RecordState.BLOQUEADO, RecordState.COMPLETADO],
  // Archivar ("cerrar") lo completado.
  [RecordState.COMPLETADO, RecordState.ARCHIVADO],
  // Reapertura (reversible).
  [RecordState.COMPLETADO, RecordState.EN_CURSO],
  [RecordState.ARCHIVADO, RecordState.EN_CURSO],
];

/**
 * Indica si `from -> to` es una transicion permitida (design §4). Lo no listado
 * devuelve false (el service traduce a BadRequestException 400).
 */
export function isRecordStateTransitionAllowed(
  from: RecordState,
  to: RecordState,
): boolean {
  return RECORD_STATE_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** True si el valor es un miembro del enum RecordState. */
export function isRecordState(value: string): value is RecordState {
  return (RECORD_STATES as readonly string[]).includes(value);
}

/** Estados de la bitacora diaria/semanal (design §4, Finding 7). */
export enum DailyLogStatus {
  BORRADOR = 'BORRADOR',
  ENVIADO = 'ENVIADO',
  REVISADO = 'REVISADO',
}

/** Estados elegibles para la consolidacion del semanal (design §2.5/§4). */
export const CONSOLIDATION_STATES: readonly string[] = [
  DailyLogStatus.ENVIADO,
  DailyLogStatus.REVISADO,
];
