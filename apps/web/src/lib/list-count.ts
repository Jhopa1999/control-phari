/**
 * Texto del contador de una lista con búsqueda en servidor: «12 de 300 actas»
 * si hay filtros y se conoce el total sin filtrar; «1 acta» o «300 actas» si no.
 */
export function listCountText(
  total: number,
  allTotal: number | null,
  filtered: boolean,
  singular: string,
  plural: string,
): string {
  const noun = total === 1 ? singular : plural;
  if (filtered && allTotal !== null && allTotal >= total) {
    return `${total} de ${allTotal} ${allTotal === 1 ? singular : plural}`;
  }
  return `${total} ${noun}`;
}
