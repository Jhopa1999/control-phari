'use client';

import * as React from 'react';
import { ChevronDown, Inbox } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/section';
import { StatStrip, StatTile } from '@/components/stat-tile';
import { AttentionSection } from './attention-section';
import { StatusBadge } from '@/components/status-badge';
import { TableSkeleton } from '@/components/table-skeleton';
import { NoAccessNotice, NO_ACCESS_COPY } from '@/components/no-access-notice';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ApiError,
  getDemandSummary,
  type DemandSummary,
} from '@/lib/area-control';
import { useActor } from '@/lib/actor-context';
import type { StatusKind } from '@/lib/status-presentation';
import { cn } from '@/lib/utils';

type LoadState = 'loading' | 'success' | 'error';

const NUMBER_FORMAT = new Intl.NumberFormat('es');

interface DistributionRow {
  key: string;
  count: number;
}

/**
 * Tabla compacta de distribución: Estado o Banda (StatusBadge) · Solicitudes ·
 * Distribución. La barra es decorativa (aria-hidden): su ancho es count/total,
 * un cálculo de presentación sobre los datos de la API.
 */
function DistributionTable({
  caption,
  columnLabel,
  kind,
  rows,
  total,
}: {
  caption: string;
  columnLabel: string;
  kind: StatusKind;
  rows: DistributionRow[];
  total: number;
}): React.ReactElement {
  // La tabla lista solo lo que tiene solicitudes; los valores en cero se pliegan
  // debajo (auditoría UX M1: once filas en cero tapaban las pocas con datos).
  // Si todo está en cero se muestran todas las filas.
  const withData = rows.filter((row) => row.count > 0);
  const visibleRows = withData.length > 0 ? withData : rows;
  const emptyRows = withData.length > 0 ? rows.filter((row) => row.count === 0) : [];
  return (
    <div className="flex flex-col gap-3">
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <Table density="compact">
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{columnLabel}</TableHead>
            <TableHead scope="col" className="text-right tabular-nums">
              Solicitudes
            </TableHead>
            <TableHead scope="col" className="w-1/3">
              Distribución
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => {
            const width = total > 0 ? Math.min((row.count / total) * 100, 100) : 0;
            return (
              <TableRow
                key={row.key}
                className={cn(row.count === 0 && 'text-muted-foreground')}
              >
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind={kind} value={row.key} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {NUMBER_FORMAT.format(row.count)}
                </TableCell>
                <TableCell>
                  <span
                    aria-hidden="true"
                    className="block h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${width}%` }}
                    />
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
    {emptyRows.length > 0 ? (
      <details className="group text-meta text-muted-foreground">
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          {`Sin solicitudes (${emptyRows.length})`}
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <ul className="mt-2 flex flex-wrap gap-2">
          {emptyRows.map((row) => (
            <li key={row.key}>
              <StatusBadge kind={kind} value={row.key} />
            </li>
          ))}
        </ul>
      </details>
    ) : null}
    </div>
  );
}

/**
 * Panel del área (design §11.3, patrón F): cuatro indicadores clave leídos de
 * GET /area-control/demand-summary sin ningún cálculo nuevo y las distribuciones
 * por estado operativo y por banda de prioridad. Es el estado actual, a hoy:
 * no hay selector de periodo (las series por periodo están en Indicadores).
 *
 * Quien no tiene el módulo `dashboard` (p. ej. el administrador), o recibe un
 * 403 de la API, ve un aviso de «sin acceso» y no un error de conexión.
 */
export function DashboardView(): React.ReactElement {
  const { allowedModules, state: permissionsState } = useActor();
  const permissionsLoaded = permissionsState === 'success';
  const lacksModule = permissionsLoaded && !allowedModules.has('dashboard');

  const [summary, setSummary] = React.useState<DemandSummary | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<unknown>(null);
  const [forbidden, setForbidden] = React.useState(false);

  const fetchSummary = React.useCallback(() => {
    return getDemandSummary()
      .then((data) => {
        setSummary(data);
        setState('success');
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
        }
        setErrorMessage(err);
        setState('error');
      });
  }, []);

  const load = React.useCallback(() => {
    setState('loading');
    setErrorMessage(null);
    return fetchSummary();
  }, [fetchSummary]);

  // Sin el módulo no se pide nada; mientras los permisos cargan, tampoco.
  const waitingForPermissions =
    permissionsState === 'loading' || permissionsState === 'none';
  React.useEffect(() => {
    if (lacksModule || waitingForPermissions) return;
    void fetchSummary();
  }, [lacksModule, waitingForPermissions, fetchSummary]);

  const noAccess = lacksModule || forbidden;

  const hasData =
    summary !== null &&
    (summary.total > 0 ||
      summary.byState.some((s) => s.count > 0) ||
      summary.byPriorityBand.some((b) => b.count > 0));
  // Leídos de los arreglos de la API, sin cálculo (0 si la fila no viene).
  const unprioritized =
    summary?.byPriorityBand.find((b) => b.band === 'SIN_PRIORIZAR')?.count ?? 0;
  const inExecution =
    summary?.byState.find((s) => s.state === 'EN_EJECUCION')?.count ?? 0;

  const header = (
    <PageHeader
      title="Panel del área"
      description="Estado actual, a hoy: volumen, bloqueos y distribución de las solicitudes por estado y prioridad."
    />
  );

  if (noAccess) {
    return (
      <PageLayout>
        {header}
        <NoAccessNotice {...NO_ACCESS_COPY.dashboard} />
      </PageLayout>
    );
  }

  if (waitingForPermissions) {
    return (
      <PageLayout>
        {header}
        <Skeleton aria-busy="true" className="h-24 w-full" />
      </PageLayout>
    );
  }

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex h-16 flex-col justify-center gap-2 bg-card px-3 py-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border bg-card">
            <TableSkeleton rows={6} columns={3} />
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <TableSkeleton rows={5} columns={3} />
          </div>
        </div>
      </div>
    );
  } else if (state === 'error' || summary === null) {
    content = (
      <div className="overflow-hidden rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar el panorama de la demanda."
          error={errorMessage}
          onRetry={() => void load()}
        />
      </div>
    );
  } else {
    content = (
      <>
        {hasData ? (
        <StatStrip label="Resumen general, estado actual a hoy">
          <StatTile
            label="Solicitudes en alcance"
            value={NUMBER_FORMAT.format(summary.total)}
          />
          <StatTile
            label="Bloqueadas activas"
            value={NUMBER_FORMAT.format(summary.blockedActive)}
            tone={summary.blockedActive > 0 ? 'danger' : 'default'}
          />
          <StatTile label="Sin priorizar" value={NUMBER_FORMAT.format(unprioritized)} />
          <StatTile label="En ejecución" value={NUMBER_FORMAT.format(inExecution)} />
        </StatStrip>
        ) : null}
        {!hasData ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            <EmptyState
              icon={Inbox}
              title="No hay solicitudes en tu alcance."
              description="Cuando se registren solicitudes en tu alcance, verás aquí su estado actual."
            />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Por estado">
              <DistributionTable
                caption="Número de solicitudes por estado, a hoy."
                columnLabel="Estado"
                kind="request"
                rows={summary.byState.map((row) => ({ key: row.state, count: row.count }))}
                total={summary.total}
              />
            </Section>
            <Section title="Por prioridad">
              <DistributionTable
                caption="Número de solicitudes por prioridad, a hoy."
                columnLabel="Banda"
                kind="band"
                rows={summary.byPriorityBand.map((row) => ({ key: row.band, count: row.count }))}
                total={summary.total}
              />
            </Section>
          </div>
        )}
      </>
    );
  }
  return (
    <PageLayout>
      {header}
      <AttentionSection />
      {content}
    </PageLayout>
  );
}
