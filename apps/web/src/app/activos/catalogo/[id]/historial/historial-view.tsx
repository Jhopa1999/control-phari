'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileClock } from 'lucide-react';
import { CellTitle, SortableTableHead } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusBadge } from '@/components/status-badge';
import { buttonVariants } from '@/components/ui/button';
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
import type { Asset, AssetRequestHistoryItem, Process } from '@/lib/api-client';
import { AssetError, getAsset, listAssetRequests } from '@/lib/assets';
import { formatDate } from '@/lib/format';
import {
  compareText,
  type Comparator,
  type SortState,
} from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'title' | 'registered' | 'state';

// Centinela sin UUID a la vista: un proceso que no está en el alcance (§13.1).
const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
/** Orden por defecto: fecha de registro descendente. */
const DEFAULT_SORT: SortState<SortKey> = { key: 'registered', direction: 'desc' };

function messageOf(err: unknown): string {
  return err instanceof AssetError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export interface HistorialViewProps {
  assetId: string;
}

/**
 * Historial de solicitudes de un activo (solo lectura). Lista las solicitudes
 * que tienen este activo como base, con su estado y proceso. El backend filtra
 * por alcance; aquí solo se presenta. Patrón de activos-view.tsx.
 */
export function HistorialView({ assetId }: HistorialViewProps): React.ReactElement {
  const [asset, setAsset] = React.useState<Asset | null>(null);
  const [rows, setRows] = React.useState<AssetRequestHistoryItem[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortState<SortKey>>(DEFAULT_SORT);

  const loadData = React.useCallback(() => {
    return Promise.all([
      getAsset(assetId),
      listAssetRequests(assetId),
      listProcesses().catch(() => [] as Process[]),
    ])
      .then(([assetDetail, history, procs]) => {
        setAsset(assetDetail);
        setRows(history);
        setProcesses(procs);
        setState('success');
      })
      .catch((err: unknown) => {
        setErrorMessage(messageOf(err));
        setState('error');
      });
  }, [assetId]);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS,
    [processes],
  );

  const comparators = React.useMemo<Record<SortKey, Comparator<AssetRequestHistoryItem>>>(
    () => ({
      title: (a, b, direction) => compareText(a.title, b.title, direction),
      registered: (a, b, direction) =>
        compareText(a.registeredAt, b.registeredAt, direction),
      state: (a, b, direction) =>
        compareText(a.operationalState, b.operationalState, direction),
    }),
    [],
  );

  const sortedRows = React.useMemo(() => {
    const compare = comparators[sort.key];
    return [...rows].sort((a, b) => compare(a, b, sort.direction));
  }, [rows, comparators, sort]);

  function toggleSort(key: SortKey): void {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'registered' ? 'desc' : 'asc' },
    );
  }

  const backLink = (
    <Link href="/activos/catalogo" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      <ArrowLeft aria-hidden="true" />
      Volver al catálogo
    </Link>
  );

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar el historial del activo."
          message={errorMessage}
          onRetry={() => void load()}
        />
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={FileClock}
          title="Este activo aún no tiene solicitudes asociadas."
          description="Las solicitudes que se asocien a este activo en el triage aparecerán aquí."
        />
      </div>
    );
  } else {
    content = (
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table scrollLabel="Historial de solicitudes del activo">
          <TableCaption>Solicitudes que tienen este activo como base.</TableCaption>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Título"
                sortKey="title"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Fecha de registro"
                sortKey="registered"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Estado"
                sortKey="state"
                sort={sort}
                onSort={toggleSort}
              />
              <TableHead>Proceso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle>{row.title}</CellTitle>
                </TableCell>
                <TableCell className="min-w-32 whitespace-nowrap text-muted-foreground">
                  {formatDate(row.registeredAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="request" value={row.operationalState} />
                </TableCell>
                <TableCell className="min-w-32 text-muted-foreground">
                  {processName(row.mainProcessId)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const title = asset ? asset.name : 'Historial del activo';

  return (
    <PageLayout>
      <PageHeader
        title={title}
        description="Historial de solicitudes trabajadas sobre este activo."
        actions={backLink}
      />
      {asset ? (
        <div className="flex items-center gap-2">
          <span className="text-meta text-muted-foreground">Estado del activo:</span>
          <StatusBadge kind="asset" value={asset.status} />
        </div>
      ) : null}
      {content}
    </PageLayout>
  );
}
