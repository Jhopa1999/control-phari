/**
 * Orden, búsqueda y paginación de tablas en cliente (design §7.6 y §24.1).
 * Todo es presentación sobre lo que ya devuelve la API, sin parámetros nuevos.
 *
 * Módulo puro (design §7.9.2): no importa nada, así que e2e/web-lib.spec.ts lo
 * carga en Node.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export type Comparator<T> = (a: T, b: T, direction: SortDirection) => number;

// Mismo criterio que localeCompare(b, 'es', { sensitivity: 'base', numeric: true }),
// con un Collator reutilizable porque se llama en cada comparación.
const TEXT_COLLATOR = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
});

/** Invierte el resultado en descendente (0 - r evita devolver -0). */
function directed(result: number, direction: SortDirection): number {
  return direction === 'asc' ? result : 0 - result;
}

/**
 * Coloca los vacíos al final en las dos direcciones. Devuelve null si los dos
 * valores tienen dato y hay que compararlos.
 */
function emptiesLast(aEmpty: boolean, bEmpty: boolean): number | null {
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return null;
}

/**
 * Texto en español sin distinguir mayúsculas ni tildes ("Árbol" junto a
 * "arbol") y con números en orden natural ("Item 2" antes que "Item 10").
 * null, undefined o solo espacios van al final en las dos direcciones.
 */
export function compareText(
  a: string | null | undefined,
  b: string | null | undefined,
  d: SortDirection,
): number {
  const aText = a?.trim() ?? '';
  const bText = b?.trim() ?? '';
  const empty = emptiesLast(aText === '', bText === '');
  if (empty !== null) return empty;
  return directed(TEXT_COLLATOR.compare(aText, bText), d);
}

/** Números; null, undefined o NaN al final en las dos direcciones. */
export function compareNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  d: SortDirection,
): number {
  const aEmpty = a === null || a === undefined || Number.isNaN(a);
  const bEmpty = b === null || b === undefined || Number.isNaN(b);
  const empty = emptiesLast(aEmpty, bEmpty);
  if (empty !== null) return empty;
  return directed((a as number) - (b as number), d);
}

function dateTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Fechas (ISO o YYYY-MM-DD); inválidas, null o '' al final en las dos direcciones. */
export function compareDate(
  a: string | null | undefined,
  b: string | null | undefined,
  d: SortDirection,
): number {
  const aTime = dateTime(a);
  const bTime = dateTime(b);
  const empty = emptiesLast(aTime === null, bTime === null);
  if (empty !== null) return empty;
  return directed((aTime as number) - (bTime as number), d);
}

/**
 * Por la posición en `order` (p. ej. los estados en el orden del flujo).
 * Valores desconocidos, null o '' al final en las dos direcciones.
 */
export function compareByOrder(
  order: readonly string[],
): (
  a: string | null | undefined,
  b: string | null | undefined,
  d: SortDirection,
) => number {
  const position = new Map<string, number>();
  order.forEach((value, index) => {
    if (!position.has(value)) position.set(value, index);
  });
  return (a, b, d) => {
    const aIndex = a === null || a === undefined ? undefined : position.get(a);
    const bIndex = b === null || b === undefined ? undefined : position.get(b);
    const empty = emptiesLast(aIndex === undefined, bIndex === undefined);
    if (empty !== null) return empty;
    return directed((aIndex as number) - (bIndex as number), d);
  };
}

/**
 * Ordena una copia de las filas, de forma estable. Con `sort` null devuelve una
 * copia en el orden recibido de la API.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  comparators: Record<K, Comparator<T>>,
): T[] {
  const comparator = sort ? comparators[sort.key] : undefined;
  if (!sort || !comparator) return rows.slice();
  const direction = sort.direction;
  // El índice original desempata: el orden es estable aunque el motor no lo fuera.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => comparator(x.row, y.row, direction) || x.index - y.index)
    .map((entry) => entry.row);
}

/**
 * Siguiente orden al pulsar una columna: en otra columna, ascendente; en
 * ascendente, descendente; en descendente, el orden por defecto de la vista,
 * salvo que la columna sea la del orden por defecto, que pasa a ascendente.
 */
export function nextSort<K extends string>(
  current: SortState<K> | null,
  key: K,
  defaultSort: SortState<K> | null,
): SortState<K> | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  // Desde descendente se vuelve al orden por defecto, salvo que sea esta misma columna: entonces ascendente.
  return defaultSort?.key === key ? { key, direction: 'asc' } : defaultSort;
}

export interface PageSlice<T> {
  pageRows: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
}

/**
 * Página de filas. `page` se acota a [1, pageCount]; pageCount ≥ 1; from y to
 * empiezan en 1 (0 y 0 si no hay filas).
 *
 * Invariante (design §24.1): con `pageSize` null no hay paginación y
 * `pageRows` contiene TODAS las filas (página 1 de 1). Con un número,
 * pageRows.length <= pageSize.
 */
export function paginate<T>(
  rows: readonly T[],
  page: number,
  pageSize: number | null,
): PageSlice<T> {
  const total = rows.length;
  if (pageSize === null) {
    return {
      pageRows: rows.slice(),
      page: 1,
      pageCount: 1,
      from: total > 0 ? 1 : 0,
      to: total,
    };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize debe ser un entero positivo o null.');
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1;
  const current = Math.min(Math.max(requested, 1), pageCount);
  const start = (current - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  return {
    pageRows,
    page: current,
    pageCount,
    from: pageRows.length > 0 ? start + 1 : 0,
    to: start + pageRows.length,
  };
}

/** Texto normalizado para buscar: sin espacios en los extremos, minúsculas y sin diacríticos. */
function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * true si `text` contiene `query` sin distinguir mayúsculas ni tildes:
 * "priorizacion" encuentra "Priorización". Una búsqueda vacía coincide siempre.
 */
export function matchesSearch(
  text: string | null | undefined,
  query: string,
): boolean {
  const needle = normalizeForSearch(query);
  if (needle === '') return true;
  return normalizeForSearch(text ?? '').includes(needle);
}

export interface TableViewOptions<T, K extends string> {
  /** Búsqueda y filtros de la vista; sin filtro pasan todas las filas. */
  filter?: (row: T) => boolean;
  sort: SortState<K> | null;
  comparators: Record<K, Comparator<T>>;
  page: number;
  /** null = sin paginación: se muestran todas las filas filtradas. */
  pageSize: number | null;
}

export interface TableView<T> extends PageSlice<T> {
  /** Filas recibidas, antes de filtrar. */
  total: number;
  /** Filas que pasan el filtro (todas las páginas). */
  filtered: number;
}

/**
 * Vista de una tabla en cliente: filtrar -> ordenar -> paginar (plan D4). La
 * usa useClientTable y la prueba e2e/web-lib.spec.ts sin navegador.
 */
export function buildTableView<T, K extends string>(
  rows: readonly T[],
  options: TableViewOptions<T, K>,
): TableView<T> {
  const { filter } = options;
  const filteredRows = filter ? rows.filter((row) => filter(row)) : rows;
  const sorted = sortRows(filteredRows, options.sort, options.comparators);
  const slice = paginate(sorted, options.page, options.pageSize);
  return { ...slice, total: rows.length, filtered: filteredRows.length };
}
