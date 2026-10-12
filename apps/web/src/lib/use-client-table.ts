'use client';

import * as React from 'react';
import {
  buildTableView,
  nextSort,
  type Comparator,
  type SortState,
} from './table-sort';

/** Tamaños de página que ofrece DataTablePagination. */
export type ClientTablePageSize = 25 | 50 | 100;

export interface UseClientTableOptions<T, K extends string> {
  rows: readonly T[];
  /** Búsqueda + filtros de la vista (la vista lo memoiza). */
  filter?: (row: T) => boolean;
  comparators: Record<K, Comparator<T>>;
  /** Orden inicial; null = el orden de la API. */
  defaultSort: SortState<K> | null;
  /** P. ej. el JSON de los filtros: si cambia, vuelve a la página 1. */
  resetKey?: string;
  /**
   * Obligatorio (design §24.1.1): cada vista declara si pagina. Un número es
   * el tamaño inicial y la vista renderiza DataTablePagination siempre; null =
   * sin paginación, y pageRows contiene todas las filas filtradas.
   */
  pageSize: ClientTablePageSize | null;
}

export interface ClientTable<T, K extends string> {
  pageRows: T[];
  total: number;
  filtered: number;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  pageSize: ClientTablePageSize | null;
  setPage(page: number): void;
  setPageSize(size: ClientTablePageSize): void;
  sort: SortState<K> | null;
  toggleSort(key: K): void;
}

/**
 * Búsqueda, orden y paginación en cliente de una tabla (design §7.6 y §24.1).
 * Filtros, orden y página viven en el estado de la vista y no se persisten.
 *
 * - Con pageSize null, setPage y setPageSize no hacen nada (invariante de
 *   §24.1: ninguna fila queda oculta sin un control que lo indique).
 * - Cambiar el orden, el tamaño de página o resetKey vuelve a la página 1.
 * - Al recargar los datos se conserva la página, acotada a pageCount.
 */
export function useClientTable<T, K extends string>(
  options: UseClientTableOptions<T, K>,
): ClientTable<T, K> {
  const { rows, filter, comparators, defaultSort, resetKey } = options;
  const paginated = options.pageSize !== null;

  const [sort, setSort] = React.useState<SortState<K> | null>(defaultSort);
  const [size, setSize] = React.useState<ClientTablePageSize>(
    options.pageSize ?? 25,
  );
  const [page, setPageState] = React.useState(1);

  // Un resetKey nuevo vuelve a la página 1. Se ajusta durante el render, sin
  // un efecto que llegue a pintar la página anterior con los filtros nuevos.
  const [prevResetKey, setPrevResetKey] = React.useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setPageState(1);
  }

  const pageSize = paginated ? size : null;
  const view = React.useMemo(
    () =>
      buildTableView(rows, {
        filter,
        sort,
        comparators,
        page: paginated ? page : 1,
        pageSize,
      }),
    [rows, filter, sort, comparators, paginated, page, pageSize],
  );

  // Si una recarga deja menos páginas, el estado sigue a la página acotada para
  // que no reaparezca después una página que el usuario ya no veía.
  if (paginated && view.page !== page) {
    setPageState(view.page);
  }

  const setPage = React.useCallback(
    (next: number) => {
      if (paginated) setPageState(next);
    },
    [paginated],
  );

  const setPageSize = React.useCallback(
    (next: ClientTablePageSize) => {
      if (!paginated) return;
      setSize(next);
      setPageState(1);
    },
    [paginated],
  );

  const toggleSort = React.useCallback(
    (key: K) => {
      setSort((current) => nextSort(current, key, defaultSort));
      setPageState(1);
    },
    [defaultSort],
  );

  return {
    pageRows: view.pageRows,
    total: view.total,
    filtered: view.filtered,
    page: view.page,
    pageCount: view.pageCount,
    from: view.from,
    to: view.to,
    pageSize,
    setPage,
    setPageSize,
    sort,
    toggleSort,
  };
}
