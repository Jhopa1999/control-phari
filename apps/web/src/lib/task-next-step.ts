/**
 * «Siguiente paso» natural de una tarea y verbos de acción de cada transición.
 * Módulo puro (sin imports de la app). Espejo de la UI: el backend manda (409
 * ante una predecesora pendiente, 403 sin permiso, etc.).
 */

export type NextStepStatus = 'POR_HACER' | 'EN_CURSO' | 'BLOQUEADA' | 'EN_REVISION' | 'TERMINADA';

export interface NextStep {
  /** Verbo del botón: «Empezar», «Enviar a revisión», «Retomar», «Terminar». */
  label: string;
  /** Estado al que pasa la tarea. */
  to: NextStepStatus;
}

const NEXT_STEP: Partial<Record<string, NextStep>> = {
  POR_HACER: { label: 'Empezar', to: 'EN_CURSO' },
  EN_CURSO: { label: 'Enviar a revisión', to: 'EN_REVISION' },
  BLOQUEADA: { label: 'Retomar', to: 'EN_CURSO' },
  EN_REVISION: { label: 'Terminar', to: 'TERMINADA' },
};

/** Siguiente paso desde `status`; null en TERMINADA o ante un estado fuera del enum. */
export function nextStepFor(status: string): NextStep | null {
  return NEXT_STEP[status] ?? null;
}

/**
 * Verbo de cada transición según el estado de origen (el destino solo no basta:
 * EN_CURSO se llega «Empezando», «Retomando», «Devolviendo» o «Reabriendo»).
 */
export function transitionVerb(from: string, to: string): string {
  if (to === 'EN_CURSO') {
    if (from === 'POR_HACER') return 'Empezar';
    if (from === 'BLOQUEADA') return 'Retomar';
    if (from === 'EN_REVISION') return 'Devolver a En curso';
    if (from === 'TERMINADA') return 'Reabrir (vuelve a En curso)';
  }
  if (to === 'EN_REVISION') return 'Enviar a revisión';
  if (to === 'TERMINADA') return 'Terminar';
  if (to === 'BLOQUEADA') return 'Marcar como bloqueada';
  if (to === 'POR_HACER') return 'Volver a Por hacer';
  return to;
}
