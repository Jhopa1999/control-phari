'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { StatTile } from '@/components/stat-tile';
import type { RecurringBoard } from '@/lib/api-client';
import { formatHours } from '@/lib/format';
import { weekRangeLabel } from '@/lib/recurring-format';

export interface WeekHeaderProps {
  board: RecurringBoard;
  /** Desplaza al grupo indicado (id del grupo). */
  onJump: (groupId: 'overdue' | 'thisWeek') => void;
}

/**
 * Cabecera de la semana actual (número, rango y contadores). La semana y los
 * conteos vienen de la API; los tiles son botones de acceso rápido al grupo.
 */
export function WeekHeader({ board, onJump }: WeekHeaderProps): React.ReactElement {
  const tiles = [
    { id: 'overdue' as const, label: 'Vencidas', value: board.counts.overdue, tone: 'danger' as const },
    { id: 'thisWeek' as const, label: 'Vencen hoy', value: board.counts.dueToday, tone: 'warning' as const },
    { id: 'thisWeek' as const, label: 'Esta semana', value: board.counts.thisWeek, tone: 'default' as const },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-link"
        >
          <CalendarDays className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-meta uppercase tracking-wider text-muted-foreground">Esta semana</p>
          <h2 className="text-lg font-semibold">{weekRangeLabel(board.week)}</h2>
          <p className="text-meta text-muted-foreground">
            Horas estimadas de la semana: {formatHours(board.plannedHoursThisWeek)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:w-96">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            aria-label={`${tile.label}: ${tile.value}. Ir al grupo`}
            onClick={() => onJump(tile.id)}
            className="overflow-hidden rounded-lg border text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <StatTile label={tile.label} value={tile.value} tone={tile.tone} />
          </button>
        ))}
      </div>
    </div>
  );
}
