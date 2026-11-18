/**
 * Mocks de listados paginados en el servidor (oleada 3, PR-B). Desde que
 * Solicitudes, Portafolio, Activos y Documentos filtran, buscan, ordenan y
 * paginan en el servidor, un mock que sustituye el cuerpo de GET /requests debe
 * aplicar él mismo los parámetros que recibe (state, mainProcessId, band, q,
 * page, pageSize) y devolver el total en X-Total-Count, como la API real.
 */

/** Forma mínima de una solicitud en los fixtures. */
export interface RequestLike {
  code?: string;
  title: string;
  mainProcessId: string | null;
  operationalState: string;
  priorityLabel: string | null;
  requesterName?: string | null;
  registeredAt?: string;
}

/** Banda de una fila según el prefijo de priorityLabel (o SIN_PRIORIZAR). */
function bandOf(row: RequestLike): string {
  return /^P[1-4]/.exec(row.priorityLabel ?? '')?.[0] ?? 'SIN_PRIORIZAR';
}

/** Filtra y pagina `rows` con los parámetros de la URL (mismo contrato que GET /requests). */
export function serveRequestList<T extends RequestLike>(
  rows: readonly T[],
  url: URL,
): { rows: T[]; total: number } {
  const states = url.searchParams.getAll('state');
  const processes = url.searchParams.getAll('mainProcessId');
  const bands = url.searchParams.getAll('band');
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (states.length > 0 && !states.includes(row.operationalState)) return false;
    if (processes.length > 0) {
      const key = row.mainProcessId ?? 'SIN_PROCESO';
      if (!processes.includes(key)) return false;
    }
    if (bands.length > 0 && !bands.includes(bandOf(row))) return false;
    if (q !== '') {
      const haystack = [row.code ?? '', row.title, row.requesterName ?? ''].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  return { rows: paginate(sortRequests(filtered, url), url), total: filtered.length };
}

/** Orden del servidor para los campos que traen los fixtures (registro, título, código). */
function sortRequests<T extends RequestLike>(rows: T[], url: URL): T[] {
  const sort = url.searchParams.get('sort') ?? 'registeredAt';
  const dir = url.searchParams.get('dir') ?? (sort === 'registeredAt' ? 'desc' : 'asc');
  const sign = dir === 'asc' ? 1 : -1;
  const key = (row: T): string => {
    if (sort === 'title') return row.title;
    if (sort === 'code') return row.code ?? '';
    return row.registeredAt ?? '';
  };
  return [...rows].sort((a, b) => sign * key(a).localeCompare(key(b)));
}

/** Ventana de página de `rows` según page/pageSize (sin ellos, todas). */
export function paginate<T>(rows: readonly T[], url: URL): T[] {
  const pageParam = url.searchParams.get('page');
  const sizeParam = url.searchParams.get('pageSize');
  if (pageParam === null && sizeParam === null) return [...rows];
  const size = Math.min(100, Math.max(1, Number(sizeParam ?? '25')));
  const page = Math.max(1, Number(pageParam ?? '1'));
  return rows.slice((page - 1) * size, page * size);
}

/** Cabeceras que la API real añade a un listado paginado. */
export function paginationHeaders(total: number): Record<string, string> {
  return { 'X-Total-Count': String(total), 'X-Truncated': 'false' };
}
