import { RecordState } from '../record-state';

/**
 * Ciclo de vida del ACTA de reunión. Reutiliza los códigos de RECORD_STATE con
 * su significado para el acta: BORRADOR = abierta (se edita y se le agregan
 * compromisos), COMPLETADO = cerrada (queda como registro, no se modifica),
 * ARCHIVADO = archivada. Los compromisos siguen su propio ciclo aunque el acta
 * esté cerrada.
 */
export const CLOSED_MINUTES_STATES: ReadonlySet<string> = new Set([
  RecordState.COMPLETADO,
  RecordState.ARCHIVADO,
]);

/** Estados de un compromiso que se consideran terminados (no abiertos). */
export const DONE_COMMITMENT_STATES: ReadonlySet<string> = new Set([
  RecordState.COMPLETADO,
  RecordState.ARCHIVADO,
]);

export function isMinutesClosed(state: string): boolean {
  return CLOSED_MINUTES_STATES.has(state);
}
