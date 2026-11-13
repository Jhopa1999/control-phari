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

/**
 * Hora de fin (HH:mm) de una reunion: `meetingTime + durationMinutes`. `null` si
 * falta la hora o la duracion, si la hora no es valida o si cruza la medianoche.
 */
export function meetingEndTimeOf(
  meetingTime: string | null,
  durationMinutes: number | null,
): string | null {
  if (!meetingTime || durationMinutes === null || durationMinutes === undefined) {
    return null;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(meetingTime);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const end = hours * 60 + minutes + durationMinutes;
  if (end >= 24 * 60) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}