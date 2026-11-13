import { RecordState } from '../record-state';

/** Semaforo de vencimiento de un compromiso abierto. */
export const COMMITMENT_DUE_STATUSES = [
  'VENCIDO',
  'VENCE_HOY',
  'PROXIMO',
  'A_TIEMPO',
] as const;
export type CommitmentDueStatus = (typeof COMMITMENT_DUE_STATUSES)[number];

/** Dias de anticipacion hasta los que un vencimiento se considera Â«proximoÂ». */
export const UPCOMING_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Estados en los que el compromiso sigue abierto (se le da seguimiento). */
export const OPEN_COMMITMENT_STATES: readonly string[] = [
  RecordState.EN_CURSO,
  RecordState.BLOQUEADO,
];

export interface CommitmentDue {
  status: CommitmentDueStatus | null;
  daysToDue: number | null;
}

/**
 * Semaforo de vencimiento. `dueDate` y `today` son dias anclados a medianoche
 * UTC. Devuelve `null` si el compromiso ya termino (COMPLETADO/ARCHIVADO).
 */
export function dueStatusOf(dueDate: Date, state: string, today: Date): CommitmentDue {
  if (!OPEN_COMMITMENT_STATES.includes(state)) {
    return { status: null, daysToDue: null };
  }
  const daysToDue = Math.round((dueDate.getTime() - today.getTime()) / MS_PER_DAY);
  if (daysToDue < 0) return { status: 'VENCIDO', daysToDue };
  if (daysToDue === 0) return { status: 'VENCE_HOY', daysToDue };
  if (daysToDue <= UPCOMING_DAYS) return { status: 'PROXIMO', daysToDue };
  return { status: 'A_TIEMPO', daysToDue };
}
