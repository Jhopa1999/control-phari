import type { RecurringMyWork, RecurringOccurrence } from './api-client';
import { listMyWorkOccurrences } from './recurring-activities';

/** Filas visibles de la sección en Mi trabajo antes de «Ver las n restantes». */
export const MY_WORK_RECURRING_LIMIT = 5;

/**
 * Ocurrencias trabajables del actor (GET /recurring-activities/occurrences/my-work).
 * El backend decide cuáles (ventana abierta, vencen hoy o vencidas) y su orden.
 */
export function loadMyWorkRecurring(): Promise<RecurringMyWork> {
  return listMyWorkOccurrences();
}

/** Separa las filas visibles de las restantes (el orden lo manda la API). */
export function splitVisible(
  items: RecurringOccurrence[],
  expanded: boolean,
  limit: number = MY_WORK_RECURRING_LIMIT,
): { visible: RecurringOccurrence[]; hidden: number } {
  if (expanded || items.length <= limit) return { visible: items, hidden: 0 };
  return { visible: items.slice(0, limit), hidden: items.length - limit };
}
