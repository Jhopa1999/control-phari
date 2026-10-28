'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
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
import { orDash } from '@/lib/format';
import { ApiError, getCompliance } from '@/lib/recurring-activities';
import { recurrenceLabel, responsibleKindLabel } from '@/lib/status-labels';

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

/** Tarjeta con un total de cumplimiento (texto + número, no solo color). */
function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <CardTitle as="div" className="text-2xl tabular-nums">
          {value}
        </CardTitle>
        <CardDescription>{label}</CardDescription>
        <span className="text-meta text-muted-foreground">{description}</span>
      </CardContent>
    </Card>
  );
}

/** Celdas de métricas reutilizadas por las dos tablas (a tiempo/destiempo/...). */
function MetricCells({
  metrics,
}: {
  metrics: RecurringComplianceMetrics;
}): React.ReactElement {
  return (
    <>
      <TableCell className="tabular-nums">{metrics.onTime}</TableCell>
      <TableCell className="tabular-nums">{metrics.late}</TableCell>
      <TableCell className="tabular-nums">{metrics.overdue}</TableCell>
      <TableCell className="tabular-nums">{metrics.pending}</TableCell>
      <TableCell className="tabular-nums font-medium">{metrics.total}</TableCell>
    </>
  );
}

/**
 * Panel de cumplimiento (FEAT-003). Consume GET /recurring-activities/compliance
 * (jefe/área o admin; el backend acota el alcance). Permite filtrar por rango de
 * días objetivo y muestra totales y desgloses por actividad y por responsable.
 * El estado se comunica con texto además de números (accesibilidad). No agrega
 * librerías de gráficos: usa tarjetas y tablas ya disponibles en el repo.
 */
export function CompliancePanel({
  users,
  areas,
}: CompliancePanelProps): React.ReactElement {
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

  const load = React.useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const query: { from?: string; to?: string } = {};
      if (from !== '') query.from = from;
      if (to !== '') query.to = to;
      const result = await getCompliance(query);
      setData(result);
      setState('success');
    } catch (err) {
      setError(messageOf(err));
      setState('error');
    }
  }, [from, to]);

  React.useEffect(() => {
    void load();
    // Carga inicial sin filtros; recargas posteriores son manuales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function responsibleName(
    kind: string,
    userId: string | null,
    areaId: string | null,
  ): string {
    if (kind === 'USER') {
      return orDash(userId ? userNameById.get(userId) : null);
    }
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
        <Input
          id="compliance-from"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="compliance-to">Hasta</Label>
        <Input
          id="compliance-to"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
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
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    body = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar el panel de cumplimiento."
          message={error}
          onRetry={() => void load()}
        />
      </div>
    );
  } else if (data === null || data.totals.total === 0) {
    body = (
      <div className="overflow-hidden rounded-lg border bg-card">
        <EmptyState
          title="Sin ocurrencias en el rango seleccionado."
          description="Ajusta las fechas o espera a que se generen nuevas ocurrencias."
        />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <MetricCard label="A tiempo" value={data.totals.onTime} description="Completadas en fecha" />
          <MetricCard label="A destiempo" value={data.totals.late} description="Completadas tarde" />
          <MetricCard label="Vencidas" value={data.totals.overdue} description="Sin completar y fuera de fecha" />
          <MetricCard label="Pendientes" value={data.totals.pending} description="En plazo" />
          <MetricCard label="Total" value={data.totals.total} description="Ocurrencias en el rango" />
        </div>

        <Section title="Por actividad" count={data.byActivity.length}>
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table scrollLabel="Cumplimiento por actividad">
              <TableHeader>
                <TableRow>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Cadencia</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>A tiempo</TableHead>
                  <TableHead>A destiempo</TableHead>
                  <TableHead>Vencidas</TableHead>
                  <TableHead>Pendientes</TableHead>
                  <TableHead>Total</TableHead>
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
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table scrollLabel="Cumplimiento por responsable">
              <TableHeader>
                <TableRow>
                  <TableHead>Responsable</TableHead>
                  <TableHead>A tiempo</TableHead>
                  <TableHead>A destiempo</TableHead>
                  <TableHead>Vencidas</TableHead>
                  <TableHead>Pendientes</TableHead>
                  <TableHead>Total</TableHead>
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
