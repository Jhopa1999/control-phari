/**
 * Formulas puras de los indicadores del marco §9 (design §2.9), SIN dependencia
 * de Prisma ni Nest, para unit test directo. Los services las consumen tras
 * traer los datos de Prisma; esto separa el calculo (unit test puro) de la
 * agregacion (test con Prisma mockeado), como `capacity.service` + `month.ts`.
 */

/** Milisegundos de un dia calendario (dias UTC, sin DST). */
const MS_PER_DAY = 86_400_000;

/**
 * Mediana de una muestra numerica (design §2.1/§2.3). Muestra vacia -> `null`.
 * Orden ascendente; longitud impar -> valor central; par -> `Math.round` del
 * promedio de los dos centrales. No muta el arreglo de entrada.
 */
export function median(nums: number[]): number | null {
  if (nums.length === 0) {
    return null;
  }
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Porcentaje de un numerador sobre un denominador (design §2.2). Denominador 0
 * -> `{ applicable: false, value: null }` (regla "No aplica" del marco, nunca
 * `0`). En otro caso `round(num / den * 100)`.
 */
export function percentage(
  num: number,
  den: number,
): { applicable: boolean; value: number | null } {
  if (den === 0) {
    return { applicable: false, value: null };
  }
  return { applicable: true, value: Math.round((num / den) * 100) };
}

/**
 * Dias calendario entre dos instantes (design §2.1/§2.3/§2.4):
 * `floor((b - a) / 86_400_000)`. Puede ser negativo (el llamador descarta los
 * negativos por dato sucio); no se fuerza a 0 aqui para no ocultar la anomalia.
 */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}
