'use client';

import * as React from 'react';
import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Gauge,
  History,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  User,
} from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskHistoryEntry } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import {
  dayHeading,
  describeTaskChange,
  localDayKey,
  summarizeEvent,
  type DisplayTaskChange,
} from '@/lib/task-history';
import { cn } from '@/lib/utils';

export interface TaskHistoryProps {
  /** null mientras carga; [] si no hay eventos. */
  entries: TaskHistoryEntry[] | null;
  /** Mensaje de error de la carga, si falló. */
  error: string | null;
  onRetry: () => void;
}

const FIELD_ICONS: Record<string, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  status: RefreshCw,
  progress: Gauge,
  responsible: User,
  startDate: CalendarClock,
  endDate: CalendarClock,
  phase: Layers,
  accepted: CircleCheck,
};

function iconFor(action: string, firstField: string | undefined) {
  if (action === 'CREATE') return Plus;
  return (firstField && FIELD_ICONS[firstField]) || Pencil;
}

/** Valor de un cambio: texto, o «Sin valor» en cursiva. Los textos largos se pliegan. */
function ChangeValue({
  value,
  emphasis,
  long,
}: {
  value: string | null;
  emphasis: boolean;
  long: boolean;
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  if (value === null) {
    return <span className="text-muted-foreground italic">Sin valor</span>;
  }
  const clamp = long && !expanded;
  return (
    <span className={cn('wrap-break-word', emphasis ? 'font-medium' : 'text-muted-foreground')}>
      <span className={clamp ? 'line-clamp-3' : undefined}>{value}</span>
      {long && value.length > 120 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-sm text-meta font-medium text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expanded ? 'Ver menos' : 'Ver todo'}
        </button>
      ) : null}
    </span>
  );
}

function ChangeRow({ change }: { change: DisplayTaskChange }): React.ReactElement {
  return (
    <div className="grid gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[8.5rem_1fr]">
      <dt className="text-meta text-muted-foreground">{change.label}</dt>
      <dd className="min-w-0">
        <span className="sr-only">De </span>
        <ChangeValue value={change.from} emphasis={false} long={change.long} />
        <ArrowRight className="mx-1.5 inline size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">a </span>
        <ChangeValue value={change.to} emphasis long={change.long} />
      </dd>
    </div>
  );
}

/**
 * Traza de cambios de la tarea: línea de tiempo agrupada por día, con quién,
 * fecha y hora, y cada campo con su valor anterior y nuevo. Presentación pura:
 * los datos llegan ya cargados desde el detalle.
 */
export function TaskHistory({ entries, error, onRetry }: TaskHistoryProps): React.ReactElement {
  if (error) {
    return <ErrorState title="No se pudo cargar el historial." message={error} onRetry={onRetry} />;
  }
  if (entries === null) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Un evento UPDATE sin campos rastreados no aporta nada: se omite.
  const visible = entries.filter((e) => e.action !== 'UPDATE' || e.changes.length > 0);
  if (visible.length === 0) {
    return (
      <EmptyState
        icon={History}
        size="compact"
        title="Aún no hay cambios registrados."
        description="Aquí verás quién cambia el estado, el avance, el responsable o las fechas de la tarea."
      />
    );
  }

  const groups: Array<{ key: string; items: TaskHistoryEntry[] }> = [];
  for (const entry of visible) {
    const key = localDayKey(String(entry.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(entry);
    else groups.push({ key, items: [entry] });
  }

  return (
    <section aria-labelledby="task-history-title" className="flex flex-col gap-3">
      <h3 id="task-history-title" className="sr-only">
        Historial de cambios
      </h3>
      <p className="text-meta text-muted-foreground">
        Del más reciente al más antiguo.
        {entries.length >= 200 ? ' Se muestran los últimos 200 cambios.' : ''}
      </p>
      <ol className="flex flex-col gap-5">
        {groups.map((group) => (
          <li key={group.key}>
            <h4 className="py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {dayHeading(group.key)}
            </h4>
            <ol className="relative flex flex-col gap-4 py-2 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border">
              {group.items.map((entry) => {
                const changes = entry.changes.map(describeTaskChange);
                const Icon = iconFor(entry.action, entry.changes[0]?.field);
                return (
                  <li key={entry.id} className="relative flex gap-3">
                    <span
                      aria-hidden="true"
                      className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-link"
                    >
                      <Icon className="size-3.5" aria-hidden={true} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm">
                          <span className="font-medium">{entry.actorName ?? 'Sistema'}</span>{' '}
                          <span className="text-muted-foreground">
                            {summarizeEvent(entry.action, entry.changes)}
                          </span>
                        </p>
                        <time
                          dateTime={String(entry.createdAt)}
                          className="text-meta tabular-nums text-muted-foreground"
                        >
                          {formatDateTime(String(entry.createdAt))}
                        </time>
                      </div>
                      {changes.length > 0 ? (
                        <dl className="flex flex-col gap-1.5">
                          {changes.map((change) => (
                            <ChangeRow key={change.field} change={change} />
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
