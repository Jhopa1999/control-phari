import type { PendingReviewItem } from './api-client';

/** Cuánto lleva esperando una tarea por aprobar. Módulo puro (sin llamadas a la API). */

/** A partir de este número de días la espera se marca como larga (advertencia). */
export const LONG_WAIT_DAYS = 3;

export interface WaitingInfo {
  /** Texto del chip: «Espera desde hoy», «Espera hace 4 días», «Espera hace unos 4 días». */
  label: string;
  /** Días completos de espera (0 si hoy). */
  days: number;
  /** Espera larga (≥ 3 días): chip de advertencia y borde. */
  long: boolean;
  /** Fecha aproximada (la tarea ya estaba en revisión antes de registrarse cuándo). */
  approximate: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cuánto lleva esperando una tarea por aprobar. Puro: recibe «ahora» para ser
 * determinista. Menos de 24 h es «desde hoy»; una fecha futura (reloj
 * desajustado) cuenta como hoy.
 */
export function waitingInfo(
  item: Pick<PendingReviewItem, 'waitingSince' | 'waitingSinceApproximate'>,
  now: Date,
): WaitingInfo {
  const since = new Date(item.waitingSince).getTime();
  const elapsed = Number.isNaN(since) ? 0 : Math.max(0, now.getTime() - since);
  const days = Math.floor(elapsed / DAY_MS);
  const approximate = item.waitingSinceApproximate === true;
  let label: string;
  if (days < 1) {
    label = 'Espera desde hoy';
  } else {
    const unit = days === 1 ? 'día' : 'días';
    label = `Espera hace ${approximate ? 'unos ' : ''}${days} ${unit}`;
  }
  return { label, days, long: days >= LONG_WAIT_DAYS, approximate };
}
