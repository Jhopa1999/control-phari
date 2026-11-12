import type { components } from '@plantilla-portales/api-client';
import { api } from './api-client';
import { PLANNABLE_STATES } from './request-state';

/** Resultado de GET /codes/{code} (tipo derivado del contrato OpenAPI). */
export type CodeResolution = components['schemas']['CodeResolutionDto'];

/** Longitud máxima de un código aceptado (misma regla que la API). */
export const CODE_MAX_LENGTH = 32;

/**
 * Forma de un código completo: solicitud, fase o tarea. Misma expresión que
 * `parseVisibleCode` en la API; la forma corta (T07, F2) no se resuelve (B5).
 */
export const VISIBLE_CODE_PATTERN = /^PRY-\d{4,}(-(F\d+|T\d+))?$/;

/** Espacios, guiones bajos y guiones largos pasan a un único `-`; se pasa a mayúsculas. */
export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .replace(/[\s_\u2013\u2014]+/g, '-')
    .toUpperCase();
}

/** `true` si el texto, normalizado, tiene la forma de un código completo. */
export function isVisibleCode(raw: string): boolean {
  const code = normalizeCode(raw);
  return code.length <= CODE_MAX_LENGTH && VISIBLE_CODE_PATTERN.test(code);
}

export type CodeSearchResult =
  | { kind: 'found'; resolution: CodeResolution }
  | { kind: 'not-found' }
  | { kind: 'invalid' }
  | { kind: 'forbidden' }
  | { kind: 'error' };

/** Resuelve un código (GET /codes/{code}). Una petición cancelada propaga el AbortError. */
export async function resolveCode(
  raw: string,
  signal: AbortSignal,
): Promise<CodeSearchResult> {
  const code = normalizeCode(raw);
  try {
    const { data, response } = await api.GET('/codes/{code}', {
      params: { path: { code } },
      signal,
    });
    if (data) return { kind: 'found', resolution: data };
    if (response.status === 404) return { kind: 'not-found' };
    if (response.status === 400) return { kind: 'invalid' };
    if (response.status === 403) return { kind: 'forbidden' };
    return { kind: 'error' };
  } catch (err) {
    if (signal.aborted) throw err;
    return { kind: 'error' };
  }
}

/**
 * Destino de navegación según los módulos del actor (design §2.6). El primero
 * que cumpla gana; `null` si el actor no tiene pantalla para ese tipo. El
 * alcance ya lo filtró la API: aquí solo se elige la pantalla.
 */
export function resolveDestination(
  resolution: CodeResolution,
  allowedModules: ReadonlySet<string>,
): string | null {
  const { type, id, requestId, phaseId, requestStatus } = resolution;
  const plannable = PLANNABLE_STATES.includes(requestStatus);
  const ficha = allowedModules.has('requests') ? `/demanda/solicitudes/${requestId}` : null;
  const portafolio = allowedModules.has('portfolio') ? `/seguimiento/portafolio/${requestId}` : null;
  if (type === 'REQUEST') {
    if (ficha) return ficha;
    if (portafolio) return portafolio;
    return allowedModules.has('plan') && plannable
      ? `/seguimiento/plan?requestId=${requestId}`
      : null;
  }
  if (type === 'PHASE') {
    if (allowedModules.has('plan') && plannable && phaseId) {
      return `/seguimiento/plan?requestId=${requestId}&phaseId=${phaseId}`;
    }
    return ficha ?? portafolio;
  }
  if (allowedModules.has('plan') || allowedModules.has('assigned')) {
    return `/seguimiento/tareas?taskId=${id}`;
  }
  return ficha ?? portafolio;
}

/** Roles que pueden usar el endpoint (los demás no ven el campo, B12). */
export const CODE_SEARCH_ROLES: readonly string[] = ['JEFE_AREA', 'LIDER_PROCESO', 'INTEGRANTE'];
