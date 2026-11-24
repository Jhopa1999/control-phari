'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileClock } from 'lucide-react';
import { ResultCount, SortableTableHead } from '@/components/data-table';
import { DataCardList } from '@/components/data-card-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { IdChip } from '@/components/id-chip';
import { StatusBadge } from '@/components/status-badge';
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
import type { AssetRequestHistoryItem, Process } from '@/lib/api-client';
import { listAssetRequests } from '@/lib/assets';
import { formatDate } from '@/lib/format';
import { compareText, type Comparator, type SortState } from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'title' | 'registered' | 'state';

// Centinela sin UUID a la vista: un proceso que no está en el alcance.
const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const NOUN = { one: 'solicitud', other: 'solicitudes' };
const LINK_CLASS =
  'rounded-sm font-medium text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Orden por defecto: fecha de registro descendente. */
const DEFAULT_SORT: SortState<SortKey> = { key: 'registered', direction: 'desc' };

export interface SolicitudesTabProps {
  assetId: string;
}

/**
 * Pestaña «Solicitudes» de la ficha del activo (solo lectura): las solicitudes
 * que tienen este activo como base (GET /assets/:id/requests). El backend
 * filtra por alcance; aquí solo se presenta. Se monta al abrir la pestaña por
 * primera vez y conserva sus datos al volver.
 */
export function SolicitudesTab({ assetId }: SolicitudesTabProps): React.ReactElement {
  const [rows, setRows] = React.useState<AssetRequestHistoryItem[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<unknown>(null);
  const [sort, setSort] = React.useState<SortState<SortKey>>(DEFAULT_SORT);

  const loadData = React.useCallback(() => {
    return Promise.all([
      listAssetRequests(assetId),
      listProcesses().catch(() => [] as Process[]),
    ])
      .then(([history, procs]) => {
        setRows(history);
        setProcesses(procs);
        setState('success');
      })
      .catch((err: unknown) => {
        setErrorMessage(err);
        setState('error');
      });
  }, [assetId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  function retry(): void {
    setState('loading');
    void loadData();
  }

  const processName = React.useCallback(
    (id: string | null | undefined) =>
      id === null || id === undefined
        ? 'Sin proceso aún'
        : (processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS),
    [processes],
  );

  const comparators = React.useMemo<Record<SortKey, Comparator<AssetRequestHistoryItem>>>(
    () => ({
      title: (a, b, direction) => compareText(a.title, b.title, direction),
      registered: (a, b, direction) => compareText(a.registeredAt, b.registeredAt, direction),
      state: (a, b, direction) => compareText(a.operationalState, b.operationalState, direction),
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

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="rounded-xl bg-card shadow-card">
        <ErrorState
          title="No fue posible cargar las solicitudes del activo."
          error={errorMessage}
          onRetry={retry}
        />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-card shadow-card">
        <EmptyState
          icon={FileClock}
          title="Ninguna solicitud usa este activo todavía."
          description="Aparecerán aquí cuando una solicitud lo elija como base."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <Table scrollLabel="Solicitudes que usan este activo">
          <TableCaption>Solicitudes que usan este activo.</TableCaption>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Solicitud" sortKey="title" sort={sort} onSort={toggleSort} />
              <TableHead className="hidden lg:table-cell">Proceso</TableHead>
              <SortableTableHead label="Estado" sortKey="state" sort={sort} onSort={toggleSort} />
              <SortableTableHead
                label="Registrada"
                sortKey="registered"
                sort={sort}
                onSort={toggleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <IdChip code={row.code} />
                    <Link href={`/demanda/solicitudes/${row.id}`} className={LINK_CLASS}>
                      {row.title}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="hidden min-w-32 text-muted-foreground lg:table-cell">
                  {processName(row.mainProcessId)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="request" value={row.operationalState} />
                </TableCell>
                <TableCell className="min-w-32 whitespace-nowrap text-muted-foreground">
                  {formatDate(row.registeredAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DataCardList
        label="Solicitudes que usan este activo"
        rows={sortedRows}
        getKey={(row) => row.id}
        card={(row) => ({
          code: <IdChip code={row.code} />,
          title: (
            <Link href={`/demanda/solicitudes/${row.id}`} className={`${LINK_CLASS} inline-flex min-h-11 items-center`}>
              {row.title}
            </Link>
          ),
          badges: [<StatusBadge key="state" kind="request" value={row.operationalState} />],
          meta: [
            { label: 'Proceso', wide: true, value: processName(row.mainProcessId) },
            { label: 'Registrada', wide: true, value: formatDate(row.registeredAt) },
          ],
        })}
      />
      <ResultCount loading={false} total={rows.length} filtered={rows.length} noun={NOUN} />
    </div>
  );
}
