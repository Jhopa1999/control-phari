import type { Task } from './api-client';
import { matchesSearch } from './table-sort';

/**
 * Filtros de presentación de la lista de tareas de Planificación (design
 * §7.9.2). Se aplican en cliente sobre lo que devuelve la API.
 *
 * Módulo puro: importaciones relativas e `import type` de ./api-client, para
 * que e2e/web-lib.spec.ts lo cargue en Node.
 */

/** 'ALL' en status o phaseId = sin filtro. */
export interface TaskFilters {
  /** Búsqueda en el título, sin distinguir mayúsculas ni tildes. */
  q: string;
  status: string;
  phaseId: string;
  /**
   * "Solo mis tareas": userId del actor (permissions.userId de
   * GET /me/permissions), comparable con responsibleUserId. null = sin filtro.
   */
  mineUserId: string | null;
}

/**
 * Coincidencia con el ID visible (PRY-0012-T07), sin distinguir mayúsculas:
 * acepta el código completo o parcial (`pry-0012`) y la forma corta (`T07`,
 * `t7`, `F2`). Misma regla que `?q=` en la API.
 */
export function matchesCode(code: string | null | undefined, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (q === '' || !code) return false;
  const upper = code.toUpperCase();
  if (upper.includes(q)) return true;
  const short = /^([FT])(\d+)$/.exec(q);
  if (!short) return false;
  const seq = Number(short[2]);
  const suffix = short[1] === 'T' ? `-T${String(seq).padStart(2, '0')}` : `-F${seq}`;
  return upper.endsWith(suffix);
}

export function matchesTaskFilters(
  t: Pick<Task, 'title' | 'status' | 'phaseId' | 'responsibleUserId'> & {
    /** ID visible de la tarea; opcional para no romper llamadores antiguos. */
    code?: string;
  },
  f: TaskFilters,
): boolean {
  if (f.status !== 'ALL' && t.status !== f.status) return false;
  if (f.phaseId !== 'ALL' && t.phaseId !== f.phaseId) return false;
  if (f.mineUserId !== null && t.responsibleUserId !== f.mineUserId) {
    return false;
  }
  // La búsqueda coincide con el título O con el ID visible.
  return matchesSearch(t.title, f.q) || matchesCode(t.code, f.q);
}
