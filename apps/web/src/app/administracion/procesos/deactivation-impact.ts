import { ApiError } from '@/lib/api-error';

/** Recuentos del 409 «requiere confirmación» al desactivar un proceso. */
export interface DeactivationImpact {
  activeAssignments: number;
  openRequests: number;
  openTasks: number;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Lee el 409 con `requiresConfirmation` que devuelve la API al desactivar un
 * proceso con trabajo en curso. Devuelve `null` si el error es de otro tipo.
 */
export function impactFromError(err: unknown): DeactivationImpact | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  if (!body || body.requiresConfirmation !== true) return null;
  return {
    activeAssignments: count(body.activeAssignments),
    openRequests: count(body.openRequests),
    openTasks: count(body.openTasks),
  };
}

/** Líneas del recuento (solo las de valor > 0), con singular y plural. */
export function impactLines(impact: DeactivationImpact): string[] {
  const lines: string[] = [];
  const { activeAssignments: a, openRequests: r, openTasks: t } = impact;
  if (a > 0) lines.push(a === 1 ? '1 asignación activa' : `${a} asignaciones activas`);
  if (r > 0) lines.push(r === 1 ? '1 solicitud abierta' : `${r} solicitudes abiertas`);
  if (t > 0) lines.push(t === 1 ? '1 tarea sin cerrar' : `${t} tareas sin cerrar`);
  return lines;
}
