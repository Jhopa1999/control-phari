/**
 * Lo único que el patrón necesita de la respuesta HTTP (sin depender de los
 * tipos de Express, que el backend no instala; patrón de `CookieResponse`).
 */
export interface HeaderResponse {
  setHeader(name: string, value: string): unknown;
}

/**
 * Patrón único de listado paginado (oleada 3, PR-B). La respuesta sigue siendo
 * un arreglo (compatible con el MCP y los clientes existentes) y la paginación
 * viaja en cabeceras:
 *
 * - `X-Total-Count`: total tras alcance, filtros y `q` (no solo la página).
 * - `X-Page` y `X-Page-Size`: la ventana servida.
 * - `X-Truncated`: `true` si hubo más filas que el tope y no se pidió página.
 *
 * Sin `page` ni `pageSize` el servidor devuelve como máximo `LIST_HARD_CAP`
 * filas (el comportamiento anterior, con un tope).
 */

/** Tamaño de página por defecto cuando solo llega `page`. */
export const DEFAULT_PAGE_SIZE = 25;
/** Máximo de `pageSize`. */
export const MAX_PAGE_SIZE = 100;
/** Tope de filas de un listado que no pide página (lookups, MCP, scripts). */
export const LIST_HARD_CAP = 1000;

export const TOTAL_COUNT_HEADER = 'X-Total-Count';
export const PAGE_HEADER = 'X-Page';
export const PAGE_SIZE_HEADER = 'X-Page-Size';
export const TRUNCATED_HEADER = 'X-Truncated';

/** Cabeceras que el CORS debe exponer para que la web de otro origen las lea. */
export const PAGINATION_EXPOSED_HEADERS = [
  TOTAL_COUNT_HEADER,
  PAGE_HEADER,
  PAGE_SIZE_HEADER,
  TRUNCATED_HEADER,
];

/** Ventana de filas a leer: derivada de `page` y `pageSize` (o del tope). */
export interface PageWindow {
  /** true si el cliente pidió `page` o `pageSize`. */
  paginated: boolean;
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/** Resultado de un listado: filas de la ventana, total y marca de truncado. */
export interface PageResult<T> {
  rows: T[];
  total: number;
  window: PageWindow;
  truncated: boolean;
}

/**
 * Resuelve la ventana. `pageSize` se acota a [1, MAX_PAGE_SIZE] y `page` a >= 1
 * (el DTO ya los valida; esto protege las llamadas internas). Sin ninguno de
 * los dos, ventana única de `LIST_HARD_CAP` filas.
 */
export function resolvePage(input: {
  page?: number;
  pageSize?: number;
}): PageWindow {
  if (input.page === undefined && input.pageSize === undefined) {
    return {
      paginated: false,
      page: 1,
      pageSize: LIST_HARD_CAP,
      skip: 0,
      take: LIST_HARD_CAP,
    };
  }
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  return { paginated: true, page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * Ventana de los listados que ya aceptaban `take` (Activos, Documentos). `take`
 * se conserva como alias obsoleto: sin `page` ni `pageSize`, `take: N` sirve las
 * N primeras filas como antes (sin marca de truncado, el límite lo pidió el
 * cliente). Si llegan `take` y `pageSize`, gana `pageSize`.
 */
export function resolveLegacyTakeWindow(input: {
  page?: number;
  pageSize?: number;
  take?: number;
}): PageWindow {
  if (input.page === undefined && input.pageSize === undefined && input.take !== undefined) {
    const take = Math.max(1, Math.trunc(input.take));
    return { paginated: true, page: 1, pageSize: take, skip: 0, take };
  }
  return resolvePage(input);
}

/** Arma el resultado: marca el truncado solo cuando no se pidió página. */
export function buildPageResult<T>(
  rows: T[],
  total: number,
  window: PageWindow,
): PageResult<T> {
  return {
    rows,
    total,
    window,
    truncated: !window.paginated && total > window.take,
  };
}

/** Fragmento de una lista ya completa en memoria (rutas que ordenan en memoria). */
export function sliceWindow<T>(all: readonly T[], window: PageWindow): T[] {
  return all.slice(window.skip, window.skip + window.take);
}

/** Escribe las cabeceras de paginación en la respuesta HTTP. */
export function setPaginationHeaders(
  res: HeaderResponse,
  result: Pick<PageResult<unknown>, 'total' | 'window' | 'truncated'>,
): void {
  res.setHeader(TOTAL_COUNT_HEADER, String(result.total));
  res.setHeader(PAGE_HEADER, String(result.window.page));
  res.setHeader(PAGE_SIZE_HEADER, String(result.window.pageSize));
  res.setHeader(TRUNCATED_HEADER, result.truncated ? 'true' : 'false');
}

/** Quita espacios sobrantes de `q`; vacío = sin búsqueda (Prisma escapa los comodines de LIKE). */
export function normalizeSearch(q: string | undefined): string | undefined {
  const text = q?.trim();
  return text ? text : undefined;
}
