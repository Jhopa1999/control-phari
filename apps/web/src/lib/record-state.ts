import type { RecordState } from './api-client';

/**
 * Etiquetas en lenguaje llano para los estados de la maestra RECORD_STATE
 * (Issue/Commitment). La fuente de verdad del grafo es el backend; aqui solo se
 * ofrece UX: etiquetas y los destinos permitidos para armar los botones de
 * transicion. La validacion autoritativa es el 400 del backend (§4 del design).
 */
export const RECORD_STATE_LABEL: Record<RecordState, string> = {
  BORRADOR: 'Borrador',
  EN_CURSO: 'En curso',
  BLOQUEADO: 'Bloqueado',
  COMPLETADO: 'Completado',
  ARCHIVADO: 'Archivado',
};

/**
 * Transiciones permitidas por el WorkflowStateService del backend (reversibles):
 * EN_CURSO<->BLOQUEADO, EN_CURSO->COMPLETADO, BLOQUEADO->COMPLETADO,
 * COMPLETADO->ARCHIVADO, COMPLETADO->EN_CURSO, ARCHIVADO->EN_CURSO.
 */
const ALLOWED_TRANSITIONS: Partial<Record<RecordState, RecordState[]>> = {
  EN_CURSO: ['BLOQUEADO', 'COMPLETADO'],
  BLOQUEADO: ['EN_CURSO', 'COMPLETADO'],
  COMPLETADO: ['ARCHIVADO', 'EN_CURSO'],
  ARCHIVADO: ['EN_CURSO'],
};

/** Destinos de transicion validos desde un estado dado (para los botones UX). */
export function nextStates(current: string): RecordState[] {
  return ALLOWED_TRANSITIONS[current as RecordState] ?? [];
}

/** Etiqueta llana de un estado (tolerante a valores desconocidos). */
export function stateLabel(state: string): string {
  return RECORD_STATE_LABEL[state as RecordState] ?? state;
}
