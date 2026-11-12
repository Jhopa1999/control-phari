/*
 * Filtrado puro del selector con búsqueda (SearchableSelect). Sin React ni DOM
 * para poder probarlo con el runner existente (e2e/web-lib.spec.ts).
 *
 * Reglas (docs/design/bitacora-selectores.md, E8):
 * - Sin distinguir mayúsculas ni tildes.
 * - Se busca en el título, el código completo (PRY-0012-T07), su forma corta
 *   (T07) y el texto adicional (proyecto, fase…). «0012» también encuentra.
 * - Varios términos separados por espacio: todos deben aparecer (AND).
 * - Con consulta, primero la coincidencia exacta de código, luego el prefijo
 *   y después el resto, conservando el orden original dentro de cada rango.
 */

export interface SearchableItem {
  /** ID visible completo (PRY-0012, PRY-0012-T07). */
  code?: string | null;
  /** Título. */
  label: string;
  /** Texto extra buscable (título del proyecto, fase, código del proyecto…). */
  searchText?: string | null;
  /** Clave del grupo; los grupos vacíos tras filtrar desaparecen. */
  groupKey?: string | null;
}

/** Minúsculas, sin tildes y con espacios colapsados. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Forma corta del código: `PRY-0012-T07` → `T07`; `PRY-0012` queda igual. */
export function shortCodeOf(code: string): string {
  const match = /-([FT]\d+)$/i.exec(code);
  return match ? match[1] : code;
}

function haystackOf(item: SearchableItem): string {
  const parts = [item.label];
  if (item.code) parts.push(item.code, shortCodeOf(item.code));
  if (item.searchText) parts.push(item.searchText);
  return normalizeText(parts.join(' '));
}

/** Términos de la consulta ya normalizados (vacío si no hay consulta). */
export function queryTerms(query: string): string[] {
  const normalized = normalizeText(query);
  return normalized === '' ? [] : normalized.split(' ');
}

/** `true` si todos los términos de la consulta aparecen en el elemento. */
export function matchesQuery(item: SearchableItem, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const haystack = haystackOf(item);
  return terms.every((term) => haystack.includes(term));
}

/** 0 = código exacto, 1 = prefijo de código, 2 = resto. */
export function matchRank(item: SearchableItem, query: string): 0 | 1 | 2 {
  const q = normalizeText(query);
  if (q === '' || !item.code) return 2;
  const full = normalizeText(item.code);
  const short = normalizeText(shortCodeOf(item.code));
  if (q === full || q === short) return 0;
  if (full.startsWith(q) || short.startsWith(q)) return 1;
  return 2;
}

/**
 * Filtra y ordena por rango (estable). Sin consulta devuelve la lista tal cual.
 */
export function filterItems<T extends SearchableItem>(items: readonly T[], query: string): T[] {
  if (queryTerms(query).length === 0) return [...items];
  const kept = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matchesQuery(item, query));
  kept.sort((a, b) => {
    const diff = matchRank(a.item, query) - matchRank(b.item, query);
    return diff !== 0 ? diff : a.index - b.index;
  });
  return kept.map(({ item }) => item);
}

export interface ItemGroup<T> {
  key: string | null;
  items: T[];
}

/**
 * Agrupa por `groupKey` en orden de primera aparición y, con consulta, ordena
 * dentro de cada grupo por rango. Los grupos sin resultados se omiten.
 */
export function groupFiltered<T extends SearchableItem>(
  items: readonly T[],
  query: string,
): ItemGroup<T>[] {
  const order: Array<string | null> = [];
  const byKey = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.groupKey ?? null;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)?.push(item);
  }
  const groups: ItemGroup<T>[] = [];
  for (const key of order) {
    const filtered = filterItems(byKey.get(key) ?? [], query);
    if (filtered.length > 0) groups.push({ key, items: filtered });
  }
  return groups;
}

/**
 * Opción activa al filtrar: la de código exacto aunque esté en un grupo
 * posterior; si no, la primera visible; -1 si no hay resultados.
 */
export function initialActiveIndex(flat: readonly SearchableItem[], query: string): number {
  if (flat.length === 0) return -1;
  const exact = flat.findIndex((item) => matchRank(item, query) === 0);
  return exact >= 0 ? exact : 0;
}

/** Lista plana en el orden en que se pintan los grupos (para teclado). */
export function flattenGroups<T>(groups: readonly ItemGroup<T>[]): T[] {
  return groups.flatMap((group) => group.items);
}
