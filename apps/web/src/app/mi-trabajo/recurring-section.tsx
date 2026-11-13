'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Repeat } from 'lucide-react';
import { InlineNotice } from '@/components/inline-notice';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import type { RecurringOccurrence } from '@/lib/api-client';
import { formatDateOnly, formatHours } from '@/lib/format';
import { loadMyWorkRecurring, splitVisible } from '@/lib/my-work-recurring';
import { relativeDayText } from '@/lib/recurring-format';
import { useTodayLocal } from '@/lib/use-today-local';
import { cn } from '@/lib/utils';
import { CompleteOccurrenceDialog } from '../actividades-recurrentes/complete-occurrence-dialog';
import { takeOccurrence } from '../actividades-recurrentes/occurrence-shared';

type LoadState = 'loading' | 'success' | 'error';

const HEADING_ID = 'mt-recurrentes-titulo';
const MODULE_HREF = '/actividades-recurrentes';

export interface RecurringSectionProps {
  /** Informa el total cargado (null mientras carga o si falló) para matizar el vacío de la página. */
  onTotalChange?: (total: number | null) => void;
  /** Mensaje para la región viva de la página. */
  announce: (message: string) => void;
}

/**
 * «Actividades recurrentes» en Mi trabajo: ocurrencias del actor con ventana
 * abierta, que vencen hoy o vencidas (GET occurrences/my-work). Carga y error
 * propios: un fallo aquí no bloquea las tareas. Tomar y Completar usan las
 * mismas acciones del módulo; la API decide las banderas y valida (409).
 * Sin ocurrencias, la sección no se renderiza.
 */
export function RecurringSection({
  onTotalChange,
  announce,
}: RecurringSectionProps): React.ReactElement | null {
  const { actorId } = useActor();
  const today = useTodayLocal();
  const [items, setItems] = React.useState<RecurringOccurrence[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [expanded, setExpanded] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<RecurringOccurrence | null>(null);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  // El notificador del padre puede cambiar de identidad en cada render: se guarda en un ref.
  const onTotalRef = React.useRef(onTotalChange);
  React.useEffect(() => {
    onTotalRef.current = onTotalChange;
  });

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const data = await loadMyWorkRecurring();
      if (!Array.isArray(data.items)) throw new Error('Respuesta inválida.');
      setItems(data.items);
      setState('success');
      onTotalRef.current?.(data.total);
    } catch {
      setState((prev) => (prev === 'success' ? prev : 'error'));
      onTotalRef.current?.(null);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    loadMyWorkRecurring()
      .then((data) => {
        if (!active) return;
        // Una respuesta inesperada se trata como error de la sección, nunca rompe la página.
        if (!Array.isArray(data.items)) throw new Error('Respuesta inválida.');
        setItems(data.items);
        setState('success');
        onTotalRef.current?.(data.total);
      })
      .catch(() => {
        if (!active) return;
        setState((prev) => (prev === 'success' ? prev : 'error'));
        onTotalRef.current?.(null);
      });
    return () => {
      active = false;
    };
  }, [actorId, attempt]);

  async function handleStart(occurrence: RecurringOccurrence): Promise<void> {
    setBusyId(occurrence.id);
    const ok = await takeOccurrence(occurrence);
    setBusyId(null);
    if (ok) {
      announce(`“${occurrence.activityTitle}” tomada.`);
      await load();
    }
  }

  function openComplete(occurrence: RecurringOccurrence): void {
    setCompleteTarget(occurrence);
    setCompleteOpen(true);
  }

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-card">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <InlineNotice
        tone="warning"
        role="status"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}>
            Reintentar
          </Button>
        }
      >
        No se pudieron cargar tus actividades recurrentes.
      </InlineNotice>
    );
  }

  if (items.length === 0) return null;

  const { visible, hidden } = splitVisible(items, expanded);
  const hasOverdue = items.some((i) => i.displayStatus === 'VENCIDA');

  return (
    <>
      <section
        aria-labelledby={HEADING_ID}
        className={cn(
          'flex flex-col gap-3 rounded-xl border-t-2 bg-card p-4 shadow-card',
          hasOverdue ? 'border-t-danger' : 'border-t-primary',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Repeat aria-hidden="true" className="size-4 text-link" />
            <h2 id={HEADING_ID} className="text-base font-semibold">
              Actividades recurrentes
            </h2>
            <Badge variant="neutral" className="tabular-nums">
              {items.length}
            </Badge>
          </div>
          <Link
            href={MODULE_HREF}
            className="inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
          >
            Ver todas
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <ul aria-label="Actividades recurrentes pendientes" className="flex flex-col gap-2">
          {visible.map((occurrence) => (
            <li
              key={occurrence.id}
              className="flex flex-col gap-2 rounded-lg bg-surface-subtle px-3 py-2 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{occurrence.activityTitle}</span>
                <span className="text-meta tabular-nums text-muted-foreground">
                  {relativeDayText(occurrence.targetDate, today)} · {formatDateOnly(occurrence.targetDate)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge kind="occurrence" value={occurrence.displayStatus} />
                <span className="text-meta tabular-nums text-muted-foreground">
                  {formatHours(occurrence.estimatedHours)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 max-sm:[&>button]:flex-1">
                {occurrence.canStart ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="pointer-coarse:min-h-11 max-sm:min-h-11"
                    loading={busyId === occurrence.id}
                    aria-label={`Tomar ${occurrence.activityTitle}`}
                    onClick={() => void handleStart(occurrence)}
                  >
                    Tomar
                  </Button>
                ) : null}
                {occurrence.canComplete ? (
                  <Button
                    type="button"
                    size="sm"
                    className="pointer-coarse:min-h-11 max-sm:min-h-11"
                    aria-label={`Completar ${occurrence.activityTitle}`}
                    onClick={() => openComplete(occurrence)}
                  >
                    Completar
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {hidden > 0 ? (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
              Ver las {hidden} restantes
            </Button>
          </div>
        ) : null}
      </section>

      <CompleteOccurrenceDialog
        open={completeOpen}
        onOpenChange={(open) => {
          setCompleteOpen(open);
          if (!open) setCompleteTarget(null);
        }}
        occurrence={completeTarget}
        onCompleted={async () => {
          announce('Actividad completada.');
          await load();
        }}
      />
    </>
  );
}
