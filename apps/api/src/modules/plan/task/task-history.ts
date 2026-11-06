import type { TaskHistoryChangeDto } from './dto/task-history-entry.dto';

/**
 * Campos de la tarea que se muestran en la traza, en el orden en que se listan.
 * Las claves son las del snapshot de auditoría (`TaskService.snapshot` y los
 * before/after de cambio de estado y aceptación).
 */
export const TRACKED_FIELDS = [
  'status',
  'progress',
  'accepted',
  'title',
  'phaseId',
  'responsibleUserId',
  'isMilestone',
  'startDate',
  'endDate',
  'estimateHours',
  'description',
  'acceptanceCriteria',
  'evidenceUrl',
  'frameworkPhaseRequired',
  'blockedReason',
] as const;

/** Nombre del campo en la API de la traza (phaseId -> phase, responsibleUserId -> responsible). */
const PUBLIC_FIELD: Record<string, string> = {
  phaseId: 'phase',
  responsibleUserId: 'responsible',
};

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null;
}

/** Texto estable de un valor de auditoría (null si no hay valor). */
function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Compara el before/after de un evento y devuelve solo los campos que cambiaron.
 * Una clave solo se compara si está en AMBOS lados: los eventos antiguos guardaron
 * snapshots con menos campos y no se deben inventar cambios.
 * `resolve` traduce ids (fase, responsable) a nombres.
 */
export function diffTaskSnapshots(
  before: unknown,
  after: unknown,
  resolve: (field: string, value: string | null) => string | null,
): TaskHistoryChangeDto[] {
  const b = asRecord(before);
  const a = asRecord(after);
  if (!b || !a) return [];
  const changes: TaskHistoryChangeDto[] = [];
  for (const key of TRACKED_FIELDS) {
    if (!(key in b) || !(key in a)) continue;
    const from = asText(b[key]);
    const to = asText(a[key]);
    if (from === to) continue;
    changes.push({
      field: PUBLIC_FIELD[key] ?? key,
      from: resolve(key, from),
      to: resolve(key, to),
    });
  }
  return changes;
}

/** Ids de usuario y de fase mencionados en los eventos, para resolverlos en una consulta. */
export function collectReferencedIds(
  events: Array<{ before: unknown; after: unknown }>,
): { userIds: string[]; phaseIds: string[] } {
  const userIds = new Set<string>();
  const phaseIds = new Set<string>();
  for (const event of events) {
    for (const side of [asRecord(event.before), asRecord(event.after)]) {
      if (!side) continue;
      const user = asText(side.responsibleUserId);
      if (user) userIds.add(user);
      const phase = asText(side.phaseId);
      if (phase) phaseIds.add(phase);
    }
  }
  return { userIds: [...userIds], phaseIds: [...phaseIds] };
}
