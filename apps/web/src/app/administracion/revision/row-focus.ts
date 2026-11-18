/**
 * Destino del foco cuando una acción retira la fila que lo tenía (NIT 4): el
 * primer control de la fila que ocupa ahora su posición (la siguiente), o el de
 * la última fila si era la última, o el encabezado de la sección si la tabla
 * quedó vacía. El contenedor es el `tbody` de la tabla o la `ul` de tarjetas.
 */
export function focusTargetAfterRemoval(
  body: HTMLElement | null,
  index: number,
  heading: HTMLElement | null,
): HTMLElement | null {
  const rows = body ? Array.from(body.querySelectorAll(':scope > tr, :scope > li')) : [];
  const row = rows.length > 0 ? rows[Math.min(index, rows.length - 1)] : undefined;
  return row?.querySelector<HTMLElement>('button, a[href]') ?? heading;
}

/**
 * Tabla y tarjetas conviven en el DOM (una está en `display: none` según el
 * ancho): devuelve el contenedor que se está viendo.
 */
export function visibleContainer(...candidates: Array<HTMLElement | null>): HTMLElement | null {
  return candidates.find((el) => el !== null && el.offsetParent !== null) ?? null;
}