/**
 * Lógica pura de los filtros de selección múltiple (docs/design/filtros-seleccion-multiple.md).
 * Semántica: O dentro de un filtro, Y entre filtros; sin selección = todo pasa.
 *
 * Módulo puro (design §7.9.2): sin React, sin alias `@/` y sin importar archivos
 * del API, para que e2e/web-lib.spec.ts lo cargue en Node.
 */

export interface MultiFilterOption {
  value: string;
  label: string;
  /** Nombre del grupo; un cambio de grupo pinta separador y encabezado. */
  group?: string;
}

/** Máximo de caracteres de la lista con comas en el resumen (D3). */
export const SUMMARY_MAX_CHARS = 14;
/** Máximo de opciones que se listan por nombre en el resumen (D3). */
export const SUMMARY_MAX_LISTED = 3;

/**
 * Normaliza una selección: sin duplicados, solo valores presentes en `options`
 * y en el orden de `options` (D11), no en el de clic.
 */
export function normalizeSelection(
  options: readonly MultiFilterOption[],
  selected: readonly string[],
): string[] {
  const chosen = new Set(selected);
  const result: string[] = [];
  for (const option of options) {
    if (chosen.has(option.value) && !result.includes(option.value)) result.push(option.value);
  }
  return result;
}

/** Alterna `value`: lo quita si estaba y lo añade si no. Devuelve la selección normalizada (§3.2). */
export function toggleValue(
  options: readonly MultiFilterOption[],
  selected: readonly string[],
  value: string,
): string[] {
  if (!options.some((option) => option.value === value)) return normalizeSelection(options, selected);
  const next = selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
  return normalizeSelection(options, next);
}

/** Texto del disparador según la regla exacta de §1.2 (D3). */
export function summarizeSelection(
  options: readonly MultiFilterOption[],
  selected: readonly string[],
  placeholder = 'Todos',
  gender: 'm' | 'f' = 'm',
): string {
  const labels = normalizeSelection(options, selected).map(
    (value) => options.find((option) => option.value === value)?.label ?? value,
  );
  const n = labels.length;
  if (n === 0) return placeholder;
  if (n === 1) return labels[0];
  if (n <= SUMMARY_MAX_LISTED) {
    const joined = labels.join(', ');
    if (joined.length <= SUMMARY_MAX_CHARS) return joined;
  }
  return `${n} ${gender === 'f' ? 'seleccionadas' : 'seleccionados'}`;
}

/** Texto largo para la región viva del panel: «Estado: 3 seleccionados» (§4). */
export function announceSelection(
  label: string,
  options: readonly MultiFilterOption[],
  selected: readonly string[],
  gender: 'm' | 'f' = 'm',
): string {
  const n = normalizeSelection(options, selected).length;
  if (n === 0) return `${label}: ninguna selección, se muestran ${gender === 'f' ? 'todas' : 'todos'}`;
  if (n === 1) return `${label}: 1 ${gender === 'f' ? 'seleccionada' : 'seleccionado'}`;
  return `${label}: ${n} ${gender === 'f' ? 'seleccionadas' : 'seleccionados'}`;
}

/**
 * Coincidencia OR de un filtro: sin selección todo pasa; con selección, el valor
 * del registro debe estar entre los seleccionados. Un valor nulo no coincide
 * con ninguna selección no vacía (para «sin proceso» usar el valor centinela).
 */
export function matchesAny(selected: readonly string[], value: string | null | undefined): boolean {
  if (selected.length === 0) return true;
  return value != null && selected.includes(value);
}
