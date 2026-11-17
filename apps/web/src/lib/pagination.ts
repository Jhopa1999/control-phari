/**
 * Patrón de listado paginado en el servidor (oleada 3, PR-B). La API responde
 * un arreglo con la página pedida y la paginación en cabeceras; aquí se leen
 * y se calcula lo que pinta la interfaz. Sin dependencias de React (se prueba
 * en e2e/web-lib.spec.ts).
 */

/** Tamaños de página que ofrece la interfaz (el máximo del servidor es 100). */
export const SERVER_PAGE_SIZES = [25, 50, 100] as const;
export type ServerPageSize = (typeof SERVER_PAGE_SIZES)[number];

/** Una página del servidor: filas, total tras filtros y marca de truncado. */
export interface ServerPage<T> {
  rows: T[];
  total: number;
  truncated: boolean;
}

/** Lo mínimo que se necesita de una respuesta HTTP para leer las cabeceras. */
export interface HeaderSource {
  headers: { get(name: string): string | null };
}

/**
 * Página a partir de la respuesta. Si falta `X-Total-Count` (por ejemplo, un
 * mock de e2e o un proxy que la filtre) el total es el número de filas
 * recibidas: la paginación sigue siendo coherente.
 */
export function readServerPage<T>(rows: T[], response: HeaderSource): ServerPage<T> {
  const raw = response.headers.get('X-Total-Count');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  const total = Number.isFinite(parsed) && parsed >= 0 ? parsed : rows.length;
  return {
    rows,
    total: Math.max(total, rows.length),
    truncated: response.headers.get('X-Truncated') === 'true',
  };
}

/** Número de páginas (mínimo 1). */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Rango visible «from–to» (1-based); 0–0 si no hay filas. */
export function pageRange(
  page: number,
  pageSize: number,
  total: number,
  rowsOnPage: number,
): { from: number; to: number } {
  if (total === 0 || rowsOnPage === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, from + rowsOnPage - 1) };
}

/**
 * Página válida tras un cambio de total: si la pedida quedó fuera de rango
 * (p. ej. página 5 y el nuevo total tiene 2), la última existente.
 */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), pageCountOf(total, pageSize));
}
