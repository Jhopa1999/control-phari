'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Section } from '@/components/section';
import { StatStrip, StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  Area,
  RecurringCompliance,
  RecurringComplianceMetrics,
  User,
} from '@/lib/api-client';
import { formatHours, formatPercent, orDash } from '@/lib/format';
import { ApiError, getCompliance } from '@/lib/recurring-activities';
import { signedHours } from '@/lib/recurring-format';
import { recurrenceLabel, responsibleKindLabel } from '@/lib/status-labels';
import { cn } from '@/lib/utils';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

interface CompliancePanelProps {
  /** Usuarios para resolver nombres de responsables USER. */
  readonly users: User[];
  /** Áreas para resolver nombres de responsables AREA. */
  readonly areas: Area[];
}

/** Diferencia real − estimada con signo explícito (nunca solo color). */
function HoursDifference({ metrics }: { metrics: RecurringComplianceMetrics }): React.ReactElement {
  const diff = metrics.actualHours - metrics.estimatedHours;
  const rounded = Math.round(diff * 10) / 10;
  return (
    <span className={cn('tabular-nums', rounded > 0 && 'text-warning', rounded < 0 && 'text-success')}>
      {signedHours(diff)}
    </span>
  );
}

/** Celdas de métricas reutilizadas por las tres tablas. */
function MetricCells({ metrics }: { metrics: RecurringComplianceMetrics }): React.ReactElement {
  return (
    <>
      <TableCell className="tabular-nums">{metrics.onTime}</TableCell>
      <TableCell className="tabular-nums">{metrics.late}</TableCell>
      <TableCell className="tabular-nums">{metrics.overdue}</TableCell>
      <TableCell className="tabular-nums">{metrics.pending}</TableCell>
      <TableCell className="tabular-nums font-medium">{metrics.total}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{formatHours(metrics.estimatedHours)}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{formatHours(metrics.actualHours)}</TableCell>
      <TableCell className="whitespace-nowrap">
        <HoursDifference metrics={metrics} />
      </TableCell>
    </>
  );
}

function MetricHeads(): React.ReactElement {
  return (
    <>
      <TableHead>A tiempo</TableHead>
      <TableHead>A destiempo</TableHead>
      <TableHead>Vencidas</TableHead>
      <TableHead>Pendientes</TableHead>
      <TableHead>Total</TableHead>
      <TableHead>Est. (h)</TableHead>
      <TableHead>Real (h)</TableHead>
      <TableHead>Diferencia</TableHead>
    </>
  );
}

/**
 * Panel de cumplimiento. Consume GET /recurring-activities/compliance (jefe/área
 * o admin; el backend acota el alcance). Filtra por rango de días objetivo y
 * muestra totales, horas estimadas frente a reales y desgloses por actividad,
 * responsable y persona. El estado se comunica con texto además de números.
 */
export function CompliancePanel({ users, areas }: CompliancePanelProps): React.ReactElement {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [state, setState] = React.useState<LoadState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<RecurringCompliance | null>(null);

  const userNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) map.set(user.id, user.name);
    return map;
  }, [users]);
  const areaNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const area of areas) map.set(area.id, area.name);
    return map;
  }, [areas]);

  const loadData = React.useCallback(() => {
    const query: { from?: string; to?: string } = {};
    if (from !== '') query.from = from;
    if (to !== '') query.to = to;
    return getCompliance(query)
      .then((result) => {
        setData(result);
        setState('success');
      })
      .catch((err: unknown) => {
        setError(messageOf(err));
        setState('error');
      });
  }, [from, to]);
  const load = React.useCallback(async () => {
    setState('loading');
    setError(null);
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadData();
    // Carga inicial sin filtros; recargas posteriores son manuales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function responsibleName(kind: string, userId: string | null, areaId: string | null): string {
    if (kind === 'USER') return orDash(userId ? userNameById.get(userId) : null);
    return orDash(areaId ? areaNameById.get(areaId) : null);
  }

  const filters = (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void load();
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="compliance-from">Desde</Label>
        <Input id="compliance-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="compliance-to">Hasta</Label>
        <Input id="compliance-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <Button type="submit" variant="outline">
        <RefreshCw aria-hidden="true" />
        Aplicar
      </Button>
    </form>
  );

  let body: React.ReactNode;
  if (state === 'loading' || state === 'idle') {
    body = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  } else if (state === 'error') {
    body = (
      <div className="rounded-xl bg-card shadow-card">
        <ErrorState
          title="No fue posible cargar el panel de cumplimiento."
          message={error}
          onRetry={() => void load()}
        />
      </div>
    );
  } else if (data === null || data.totals.total === 0) {
    body = (
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <EmptyState
          title="Sin ocurrencias en el rango seleccionado."
          description="Ajusta las fechas o espera a que se generen nuevas ocurrencias."
        />
      </div>
    );
  } else {
    const { totals } = data;
    // Presentación: de lo ya cerrado (a tiempo, tarde o vencida), cuánto fue a tiempo.
    const closed = totals.onTime + totals.late + totals.overdue;
    const ratio = closed === 0 ? '—' : formatPercent((totals.onTime / closed) * 100);
    body = (
      <div className="flex flex-col gap-6">
        <StatStrip label="Resumen de cumplimiento">
          <StatTile label="Cumplimiento" value={ratio} hint={`${totals.onTime} a tiempo de ${closed} cerradas`} />
          <StatTile label="Horas estimadas" value={formatHours(totals.estimatedHours)} />
          <StatTile label="Horas reales" value={formatHours(totals.actualHours)} />
          <StatTile
            label="Completadas tarde"
            value={totals.late}
            tone={totals.late > 0 ? 'warning' : 'default'}
            hint={`${totals.overdue} vencidas, ${totals.pending} pendientes`}
          />
        </StatStrip>

        <Section title="Por actividad" count={data.byActivity.length}>
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table scrollLabel="Cumplimiento por actividad">
              <TableHeader>
                <TableRow>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Cadencia</TableHead>
                  <TableHead>Responsable</TableHead>
                  <MetricHeads />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byActivity.map((row) => (
                  <TableRow key={row.activityId}>
                    <TableCell className="min-w-48 font-medium">{row.activityTitle}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {recurrenceLabel(row.cadence)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {responsibleKindLabel(row.responsibleKind)}
                      {': '}
                      {responsibleName(row.responsibleKind, row.responsibleUserId, row.responsibleAreaId)}
                    </TableCell>
                    <MetricCells metrics={row.metrics} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section title="Por responsable" count={data.byResponsible.length}>
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table scrollLabel="Cumplimiento por responsable">
              <TableHeader>
                <TableRow>
                  <TableHead>Responsable</TableHead>
                  <MetricHeads />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byResponsible.map((row) => (
                  <TableRow
                    key={`${row.responsibleKind}:${row.responsibleUserId ?? ''}:${row.responsibleAreaId ?? ''}`}
                  >
                    <TableCell className="min-w-48 font-medium">
                      {responsibleKindLabel(row.responsibleKind)}
                      {': '}
                      {responsibleName(row.responsibleKind, row.responsibleUserId, row.responsibleAreaId)}
                    </TableCell>
                    <MetricCells metrics={row.metrics} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section
          title="Por persona que completó"
          count={data.byPerson.length}
          description="Quién realizó las actividades, sin importar a quién estaban asignadas."
        >
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table scrollLabel="Cumplimiento por persona que completó">
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <MetricHeads />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byPerson.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="min-w-48 font-medium">{row.userName}</TableCell>
                    <MetricCells metrics={row.metrics} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <p className="text-meta text-muted-foreground">Las canceladas no cuentan en el cumplimiento.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filters}
      {body}
    </div>
  );
}
