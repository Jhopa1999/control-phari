/**
 * Claves de origen de las sugerencias de tiempo de la Bitacora. Las construye
 * SOLO el servidor: el cliente las devuelve de forma opaca y se validan contra
 * las sugerencias vigentes (nunca se acepta texto libre como origen).
 *
 *   MEETING:<uuid> | OCCURRENCE:<uuid> | TASK:<uuid>:<YYYY-MM-DD>
 */
export type SuggestionKind = 'MEETING' | 'OCCURRENCE' | 'TASK';

export interface ParsedSuggestionKey {
  kind: SuggestionKind;
  id: string;
  /** Solo para TASK (YYYY-MM-DD). */
  date?: string;
}

export const meetingKey = (meetingId: string): string => `MEETING:${meetingId}`;
export const occurrenceKey = (occurrenceId: string): string =>
  `OCCURRENCE:${occurrenceId}`;
export const taskKey = (taskId: string, date: string): string =>
  `TASK:${taskId}:${date}`;

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const KEY_PATTERN = new RegExp(
  `^(?:(MEETING|OCCURRENCE):(${UUID})|(TASK):(${UUID}):(\\d{4}-\\d{2}-\\d{2}))$`,
);

/** Descompone una clave; `null` si no tiene el formato esperado. */
export function parseSuggestionKey(key: string): ParsedSuggestionKey | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  if (match[1]) {
    return { kind: match[1] as SuggestionKind, id: match[2] };
  }
  return { kind: 'TASK', id: match[4], date: match[5] };
}
