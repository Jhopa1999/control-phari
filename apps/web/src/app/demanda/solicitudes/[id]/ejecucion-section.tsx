'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, CircleCheck, ListChecks, TrendingUp } from 'lucide-react';
import { IdChip } from '@/components/id-chip';
import { InlineNotice } from '@/components/inline-notice';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateOnly } from '@/lib/format';
import {
  ApiError,
  getPortfolioExecution,
  type PortfolioExecution,
  type PortfolioExecutionPhase,
  type PortfolioExecutionTask,
} from '@/lib/portfolio';
import { cn } from '@/lib/utils';

/** Etiqueta y tono del estado de una fase (se deriva de sus tareas en la API). */
const PHASE_STATUS: Record<string, { label: string; variant: 'neutral' | 'info' | 'success' }> = {
  SIN_TAREAS: { label: 'Sin tareas', variant: 'neutral' },
  POR_HACER: { label: 'Por hacer', variant: 'neutral' },
  EN_CURSO: { label: 'En curso', variant: 'info' },
  TERMINADA: { label: 'Terminada', variant: 'success' },
};

function signedDays(days: number): string {
  return `${days > 0 ? '+' : '−'}${Math.abs(days)} d`;
}

function ProgressBar({
  value,
  label,
  className,
}: {
  value: number | null;
  label: string;
  className?: string;
}): React.ReactElement {
  if (value === null) {
    return <span className="text-muted-foreground">Sin tareas</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className={cn('h-2 w-20 overflow-hidden rounded-full bg-muted', className)}
      >
        <div className="h-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="text-meta tabular-nums">{`${value} %`}</span>
    </div>
  );
}

function dates(task: Pick<PortfolioExecutionTask, 'startDate' | 'endDate'>): string {
  if (!task.startDate && !task.endDate) return 'Sin fechas';
  return `${task.startDate ? formatDateOnly(task.startDate) : '—'} – ${task.endDate ? formatDateOnly(task.endDate) : '—'}`;
}

function VarianceBadge({ days }: { days: number | null }): React.ReactElement {
  if (days !== null && days > 0) {
    return (
      <Badge variant="warning" title="Las tareas abiertas terminan después del compromiso del plan.">
        <TrendingUp aria-hidden="true" />
        {signedDays(days)}
      </Badge>
    );
  }
  if (days !== null && days < 0) {
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden="true" />
        {`${signedDays(days)} (adelantada)`}
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <CircleCheck aria-hidden="true" />
      Sin desviación
    </Badge>
  );
}

function Summary({ data }: { data: PortfolioExecution }): React.ReactElement {
  return (
    <div className="rounded-xl bg-card p-4 shadow-card">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-meta text-muted-foreground">Plan</dt>
          <dd>
            {data.planStatus ? (
              <StatusBadge kind="plan" value={data.planStatus} />
            ) : (
              <span className="text-muted-foreground">Sin plan</span>
            )}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-meta text-muted-foreground">Línea base</dt>
          <dd className="tabular-nums">{data.baselineDate ? formatDateOnly(data.baselineDate) : '—'}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-meta text-muted-foreground">Pronóstico</dt>
          <dd className="tabular-nums">{data.forecastDate ? formatDateOnly(data.forecastDate) : '—'}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-meta text-muted-foreground">Desviación</dt>
          <dd>
            <VarianceBadge days={data.scheduleVarianceDays} />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-meta text-muted-foreground">Avance</dt>
          <dd>
            <ProgressBar value={data.progressPercent} label="Avance de la ejecución" className="max-w-40" />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TaskTable({ phase }: { phase: PortfolioExecutionPhase }): React.ReactElement {
  if (phase.tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta fase aún no tiene tareas.</p>;
  }
  return (
    <>
      <div className="hidden md:block">
        <Table scrollLabel={`Tareas de la fase ${phase.code}`}>
          <TableCaption>
            {`Tareas de la fase ${phase.code} con su estado, avance, fechas y responsable.`}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Tarea</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Avance</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Responsable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phase.tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <div className="flex items-start gap-2">
                    <IdChip code={task.code} variant="short" className="mt-0.5" />
                    <span className="line-clamp-2 wrap-break-word">{task.title}</span>
                  </div>
                </TableCell>
                <TableCell className="min-w-32">
                  <StatusBadge kind="task" value={task.status} />
                </TableCell>
                <TableCell className="min-w-32">
                  <ProgressBar
                    value={task.status === 'TERMINADA' ? 100 : task.progress}
                    label={`Avance de la tarea ${task.code}`}
                  />
                </TableCell>
                <TableCell
                  className={cn(
                    'whitespace-nowrap tabular-nums',
                    !task.startDate && !task.endDate && 'text-muted-foreground',
                  )}
                >
                  {dates(task)}
                </TableCell>
                <TableCell className="min-w-36 max-w-[14rem]">
                  {task.responsibleName ? (
                    <span className="line-clamp-2 wrap-break-word">{task.responsibleName}</span>
                  ) : (
                    <span className="text-muted-foreground">Sin responsable</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col divide-y divide-border md:hidden">
        {phase.tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-start gap-2">
              <IdChip code={task.code} variant="short" className="mt-0.5" />
              <span className="font-medium wrap-break-word">{task.title}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="task" value={task.status} />
              <span className="text-meta tabular-nums">{dates(task)}</span>
            </div>
            <ProgressBar
              value={task.status === 'TERMINADA' ? 100 : task.progress}
              label={`Avance de la tarea ${task.code}`}
            />
            <span className="text-meta text-muted-foreground">
              {task.responsibleName ?? 'Sin responsable'}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function PhaseItem({
  phase,
  open,
  onToggle,
}: {
  phase: PortfolioExecutionPhase;
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const base = React.useId();
  const buttonId = `${base}-btn`;
  const panelId = `${base}-panel`;
  const status = PHASE_STATUS[phase.status] ?? PHASE_STATUS.POR_HACER;
  return (
    <li className="rounded-xl bg-card shadow-card">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:p-4"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        <IdChip code={phase.code} variant="short" copyable={false} />
        <span className="min-w-0 flex-1 truncate font-medium" title={phase.name}>
          {phase.name}
        </span>
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="flex items-center gap-2">
          {phase.progressPercent === null ? null : (
            <>
              <span
                role="progressbar"
                aria-label={`Avance de la fase ${phase.code}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={phase.progressPercent}
                className="h-2 w-24 overflow-hidden rounded-full bg-muted max-sm:hidden"
              >
                <span className="block h-full bg-primary" style={{ width: `${phase.progressPercent}%` }} />
              </span>
              <span className="text-meta tabular-nums">{`${phase.progressPercent} %`}</span>
            </>
          )}
        </span>
        <span className="text-meta tabular-nums text-muted-foreground max-sm:hidden">
          {`${phase.tasksDone} de ${phase.tasksTotal} terminadas`}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="px-3 pb-3 sm:px-4 sm:pb-4"
      >
        {open ? (
          <>
            <p className="mb-2 text-meta text-muted-foreground sm:hidden">
              {`${phase.tasksDone} de ${phase.tasksTotal} terminadas`}
            </p>
            <TaskTable phase={phase} />
          </>
        ) : null}
      </div>
    </li>
  );
}

/** Se abre solo la primera fase no terminada; el resto, cerradas. */
function initialOpen(phases: PortfolioExecutionPhase[]): Set<string> {
  const first = phases.find((phase) => phase.status !== 'TERMINADA');
  return new Set(first ? [first.id] : []);
}

function Skeletons(): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
    </div>
  );
}

/**
 * Ejecución de la iniciativa en solo lectura (plan, fechas, avance, fases y
 * tareas). Se monta solo con el módulo Portafolio y no exige Planificación:
 * lee GET /portfolio/{id}/execution. «Abrir en Planificación» solo con `plan`.
 */
export function EjecucionSection({
  requestId,
  canOpenPlan,
}: {
  requestId: string;
  canOpenPlan: boolean;
}): React.ReactElement | null {
  const [data, setData] = React.useState<PortfolioExecution | null>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error' | 'hidden'>('loading');
  const [error, setError] = React.useState<string>('');
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    getPortfolioExecution(requestId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setOpen(initialOpen(result.phases));
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 404: la ficha ya habría fallado por el mismo motivo; la sección no se muestra.
        if (err instanceof ApiError && err.status === 404) {
          setStatus('hidden');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, nonce]);

  if (status === 'hidden') return null;

  const planLink =
    canOpenPlan && data?.hasPlan ? (
      <Link
        href={`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Abrir en Planificación
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    ) : null;
  const toggleAll =
    data && data.phases.length > 3 ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          setOpen(open.size === data.phases.length ? new Set() : new Set(data.phases.map((p) => p.id)))
        }
      >
        {open.size === data.phases.length ? 'Plegar todas' : 'Expandir todas'}
      </Button>
    ) : null;

  return (
    <div aria-busy={status === 'loading'}>
      <Section
        title="Ejecución"
        description="Solo lectura. Estado del plan y avance de las tareas."
        actions={
          <>
            {toggleAll}
            {planLink}
          </>
        }
      >
        {status === 'loading' ? <Skeletons /> : null}
        {status === 'error' ? (
          <InlineNotice
            tone="danger"
            role="alert"
            title="No fue posible cargar la ejecución."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatus('loading');
                  setNonce((n) => n + 1);
                }}
              >
                Reintentar
              </Button>
            }
          >
            {error}
          </InlineNotice>
        ) : null}
        {status === 'ready' && data && (!data.hasPlan || data.phases.length === 0) ? (
          <div className="flex items-start gap-3 rounded-xl bg-card p-4 shadow-card">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle">
              <ListChecks className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">Aún no hay ejecución que mostrar</p>
              <p className="text-sm text-muted-foreground">
                Cuando la solicitud tenga un plan con fases y tareas, aquí verás su avance.
              </p>
            </div>
          </div>
        ) : null}
        {status === 'ready' && data && data.hasPlan && data.phases.length > 0 ? (
          <>
            <Summary data={data} />
            <ul className="flex flex-col gap-3">
              {data.phases.map((phase) => (
                <PhaseItem
                  key={phase.id}
                  phase={phase}
                  open={open.has(phase.id)}
                  onToggle={() => {
                    const next = new Set(open);
                    if (next.has(phase.id)) next.delete(phase.id);
                    else next.add(phase.id);
                    setOpen(next);
                  }}
                />
              ))}
            </ul>
          </>
        ) : null}
      </Section>
    </div>
  );
}
