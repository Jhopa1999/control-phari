'use client';

import * as React from 'react';
import {
  clampPage,
  pageCountOf,
  pageRange,
  type ServerPage,
  type ServerPageSize,
} from './pagination';
import { nextSort, type SortState } from './table-sort';

// Filas antes de la primera página: siempre la misma referencia, para que quien
// dependa de `rows` (p. ej. useResetOnChange) no vea un cambio en cada render.
const NO_ROWS: never[] = [];

/** Parámetros que la vista recibe para pedir una página. */
export interface ServerTableRequest<K extends string> {
  page: number;
  pageSize: ServerPageSize;
  sort: SortState<K> | null;
  signal: AbortSignal;
}

/**
 * Estado del listado:
 * - `loading`: primera carga, aún sin filas (esqueleto).
 * - `reloading`: hay filas visibles y se pide otra página u otro filtro; la
 *   tabla NO se vacía ni se atenúa (docs/design/oleada-3-listados.md §5.4).
 * - `ready`: datos al día.
 * - `error`: falló la primera carga (ErrorState).
 * - `reload-error`: falló una recarga; se conservan las filas anteriores.
 */
export type ServerTableStatus = 'loading' | 'reloading' | 'ready' | 'error' | 'reload-error';

export interface UseServerTableOptions<T, K extends string> {
  fetchPage: (request: ServerTableRequest<K>) => Promise<ServerPage<T>>;
  /** Filtros y búsqueda serializados: si cambia, vuelve a la página 1 y recarga. */
  filtersKey: string;
  defaultSort: SortState<K> | null;
  initialPageSize?: ServerPageSize;
}

export interface ServerTable<T, K extends string> {
  status: ServerTableStatus;
  /** true en `loading` y `reloading`. */
  busy: boolean;
  error: unknown;
  rows: T[];
  total: number;
  truncated: boolean;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  pageSize: ServerPageSize;
  setPage(page: number): void;
  setPageSize(size: ServerPageSize): void;
  sort: SortState<K> | null;
  toggleSort(key: K): void;
  setSort(next: SortState<K> | null): void;
  /** Relanza la consulta actual («Reintentar» o tras crear/editar). */
  reload(): void;
}

/**
 * Búsqueda, filtros, orden y paginación EN EL SERVIDOR (patrón de la oleada 3).
 * Cada cambio cancela la petición anterior (AbortController) y conserva las
 * filas visibles hasta que llega la nueva página.
 */
export function useServerTable<T, K extends string>(
  options: UseServerTableOptions<T, K>,
): ServerTable<T, K> {
  const { fetchPage, filtersKey, defaultSort, initialPageSize = 25 } = options;
  const [sort, setSortState] = React.useState<SortState<K> | null>(defaultSort);
  const [pageSize, setPageSizeState] = React.useState<ServerPageSize>(initialPageSize);
  const [page, setPageState] = React.useState(1);
  const [nonce, setNonce] = React.useState(0);
  const [status, setStatus] = React.useState<ServerTableStatus>('loading');
  const [error, setError] = React.useState<unknown>(null);
  // La página a la que corresponden las filas visibles (durante una recarga, la
  // pedida aún no llegó y el rango «desde–hasta» sigue a las filas en pantalla).
  const [data, setData] = React.useState<(ServerPage<T> & { page: number }) | null>(null);
  const hasData = React.useRef(false);

  // Un filtro nuevo vuelve a la página 1, ajustado durante el render (sin pintar
  // la página anterior con los filtros nuevos).
  const [prevKey, setPrevKey] = React.useState(filtersKey);
  if (filtersKey !== prevKey) {
    setPrevKey(filtersKey);
    setPageState(1);
  }

  const fetchRef = React.useRef(fetchPage);
  React.useEffect(() => {
    fetchRef.current = fetchPage;
  }, [fetchPage]);

  React.useEffect(() => {
    const controller = new AbortController();
    setStatus(hasData.current ? 'reloading' : 'loading');
    fetchRef
      .current({ page, pageSize, sort, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const valid = clampPage(page, result.total, pageSize);
        if (valid !== page && result.rows.length === 0) {
          // Página fuera de rango tras un filtro: salta a la última existente.
          setPageState(valid);
          return;
        }
        hasData.current = true;
        setData({ ...result, page });
        setError(null);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err);
        setStatus(hasData.current ? 'reload-error' : 'error');
      });
    return () => controller.abort();
    // filtersKey dispara la recarga aunque la página siga en 1.
  }, [page, pageSize, sort, filtersKey, nonce]);

  const total = data?.total ?? 0;
  const rows: T[] = data?.rows ?? NO_ROWS;
  const range = pageRange(data?.page ?? page, pageSize, total, rows.length);

  const setPage = React.useCallback((next: number) => setPageState(Math.max(1, next)), []);
  const setPageSize = React.useCallback((next: ServerPageSize) => {
    setPageSizeState(next);
    setPageState(1);
  }, []);
  const toggleSort = React.useCallback(
    (key: K) => {
      setSortState((current) => nextSort(current, key, defaultSort));
      setPageState(1);
    },
    [defaultSort],
  );
  const setSort = React.useCallback((next: SortState<K> | null) => {
    setSortState(next);
    setPageState(1);
  }, []);
  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return {
    status,
    busy: status === 'loading' || status === 'reloading',
    error,
    rows,
    total,
    truncated: data?.truncated ?? false,
    page,
    pageCount: pageCountOf(total, pageSize),
    from: range.from,
    to: range.to,
    pageSize,
    setPage,
    setPageSize,
    sort,
    toggleSort,
    setSort,
    reload,
  };
}

/** Valor que solo se actualiza tras `delay` ms sin cambios (búsqueda al escribir). */
export function useDebouncedValue<V>(value: V, delay = 300): V {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
