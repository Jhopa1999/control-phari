import * as React from 'react';
import { cn } from '@/lib/utils';

export type ProgressTone = 'default' | 'done' | 'blocked' | 'overdue';

const FILL: Record<ProgressTone, string> = {
  default: 'bg-primary',
  done: 'bg-success',
  blocked: 'bg-warning',
  overdue: 'bg-danger',
};

/** Tono de la barra según el estado de la tarea y su vencimiento. */
export function progressTone(status: string, overdue: boolean): ProgressTone {
  if (status === 'TERMINADA') return 'done';
  if (status === 'BLOQUEADA') return 'blocked';
  if (overdue) return 'overdue';
  return 'default';
}

export interface TaskProgressBarProps {
  /** Porcentaje 0-100. */
  value: number;
  tone?: ProgressTone;
  className?: string;
}

/**
 * Barra de avance decorativa: el valor siempre va también en texto junto a ella
 * (no se transmite solo por la barra ni por el color). Seguro para servidor.
 */
export function TaskProgressBar({
  value,
  tone = 'default',
  className,
}: TaskProgressBarProps): React.ReactElement {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <span
      aria-hidden="true"
      className={cn('relative block h-2 w-24 overflow-hidden rounded-full bg-muted', className)}
    >
      <span
        className={cn('absolute inset-y-0 left-0 rounded-full', FILL[tone])}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}
