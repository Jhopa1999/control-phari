import { REQUEST_STATE_LABELS } from './request-state';
import type { MultiFilterOption } from './multi-filter';

/**
 * Opciones compartidas de los filtros de selección múltiple de Solicitudes y
 * Portafolio (docs/design/filtros-seleccion-multiple.md §2.3).
 *
 * Módulo puro: sin React ni alias `@/`.
 */

/** Centinela de «solicitudes sin proceso aún» (el mismo literal que acepta GET /portfolio). */
export const NO_PROCESS = 'SIN_PROCESO';
/** Valor de la banda para las solicitudes sin priorizar. */
export const NO_BAND = 'SIN_PRIORIZAR';

/** Grupos de estados, en el orden del flujo (D9). */
const STATE_GROUPS: { group: string; states: string[] }[] = [
  { group: 'Entrada', states: ['REGISTRADA', 'EN_TRIAGE', 'DEVUELTA', 'RECHAZADA'] },
  {
    group: 'Priorización y plan',
    states: ['BACKLOG_PRIORIZADO', 'COMPROMETIDA', 'EN_PLANIFICACION'],
  },
  { group: 'Ejecución', states: ['EN_EJECUCION', 'BLOQUEADA', 'EN_VALIDACION'] },
  {
    group: 'Entrega y cierre',
    states: ['LISTA_PARA_LIBERAR', 'EN_ESTABILIZACION', 'OPERATIVA', 'CERRADA', 'RETIRADA'],
  },
];

/** Estados agrupados con encabezado; cualquier estado no listado va al final sin grupo. */
export function stateFilterOptions(): MultiFilterOption[] {
  const grouped = new Set(STATE_GROUPS.flatMap((g) => g.states));
  const options: MultiFilterOption[] = STATE_GROUPS.flatMap((g) =>
    g.states.map((value) => ({ value, label: REQUEST_STATE_LABELS[value] ?? value, group: g.group })),
  );
  for (const [value, label] of Object.entries(REQUEST_STATE_LABELS)) {
    if (!grouped.has(value)) options.push({ value, label });
  }
  return options;
}

/** «Sin proceso aún» aparte y el resto bajo el encabezado «Procesos». */
export function processFilterOptions(
  processes: readonly { id: string; name: string }[],
): MultiFilterOption[] {
  return [
    { value: NO_PROCESS, label: 'Sin proceso aún' },
    ...processes.map((p) => ({ value: p.id, label: p.name, group: 'Procesos' })),
  ];
}

/** P1 a P4 y «Sin priorizar», en un solo bloque. */
export const BAND_FILTER_OPTIONS: MultiFilterOption[] = [
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' },
  { value: 'P4', label: 'P4' },
  { value: NO_BAND, label: 'Sin priorizar' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee `?proceso=` del enlace del Panel (D7): un valor (`SIN_PROCESO`, el formato
 * antiguo) o varios separados por comas. Solo se aceptan `SIN_PROCESO` y UUID;
 * el resto se ignora.
 */
export function parseProcessParam(param: string | null): string[] {
  if (!param) return [];
  const tokens = param
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t === NO_PROCESS || UUID_RE.test(t));
  return [...new Set(tokens)];
}
