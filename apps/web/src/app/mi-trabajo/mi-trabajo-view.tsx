'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { ListChecks, RefreshCw } from 'lucide-react';
import {
  CellTitle,
  DataTablePagination,
  ResultCount,
  SortableTableHead,
} from '@/components/data-table';
import { DataCardList } from '@/components/data-card-list';
import { DataView, type DataViewState } from '@/components/data-view';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusBadge } from '@/components/status-badge';
import { SearchInput, Toolbar } from '@/components/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MyWorkItem } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { formatDateOnly, formatPercent } from '@/lib/format';
import { listMyWork } from '@/lib/my-work';
import {
  compareByOrder,
  compareDate,
  compareText,
  matchesSearch,
  type Comparator,
  type SortState,
} from '@/lib/table-sort';
import { TASK_STATUSES, taskStatusLabel } from '@/lib/tasks';
import { useClientTable } from '@/lib/use-client-table';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'title' | 'endDate' | 'status';

/** Centinela de «Todos» en el filtro de estado. */
const ALL = 'ALL';
const NOUN = { one: 'tarea', other: 'tareas' };
/** Vence ascendente; las tareas sin fecha quedan al final en las dos direcciones. */
const DEFAULT_SORT: SortState<SortKey> = { key: 'endDate', direction: 'asc' };
const compareStatus = compareByOrder(TASK_STATUSES);
const COMPARATORS: Record<SortKey, Comparator<MyWorkItem>> = {
  title: (a, b, direction) => compareText(a.title, b.title, direction),
  endDate: (a, b, direction) => compareDate(a.endDate, b.endDate, direction),
  // Orden del flujo: Por hacer → En curso → Bloqueada → En revisión → Terminada.
  status: (a, b, direction) => compareStatus(a.status, b.status, direction),
};

/**
 * Mi trabajo (design §11.4, patrón A): tareas de las que el actor es
 * responsable, con búsqueda, filtro de estado, orden y paginación en cliente
 * sobre lo que devuelve GET /my-work. El título abre el detalle de la tarea.
 */
export function MiTrabajoView(): React.ReactElement {
  const { actorId } = useActor();
  const [items, setItems] = React.useState<MyWorkItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState(ALL);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const fetchItems = React.useCallback(() => {
    return listMyWork()
      .then((data) => {
        setItems(data);
        setState('success');
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : null);
        setState('error');
      });
  }, []);
  const load = React.useCallback(() => {
    setState('loading');
    return fetchItems();
  }, [fetchItems]);

  // Recarga también al cambiar de actor, como hasta ahora.
  // Al cambiar de usuario se vuelve a mostrar la carga.
  useResetOnChange([actorId], () => setState('loading'));
  React.useEffect(() => {
    void fetchItems();
  }, [fetchItems, actorId]);

  const hasFilters = query.trim() !== '' || status !== ALL;
  const filter = React.useCallback(
    (item: MyWorkItem) => matchesSearch(item.title, query) && (status === ALL || item.status === status),
    [query, status],
  );
  const table = useClientTable({
    rows: items,
    filter,
    comparators: COMPARATORS,
    defaultSort: DEFAULT_SORT,
    resetKey: JSON.stringify([query, status]),
    pageSize: 25,
  });

  function clearFilters(): void {
    setQuery('');
    setStatus(ALL);
    // «Limpiar filtros» desaparece al no quedar filtros: el foco pasa a la
    // búsqueda en lugar de perderse (NIT 4, plan D9).
    searchRef.current?.focus();
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (table.total === 0 && !hasFilters) viewState = 'empty';
  else if (table.filtered === 0) viewState = 'no-results';
  else viewState = 'ready';

  return (
    <PageLayout>
      <PageHeader
        title="Mi trabajo"
        description="Tareas en las que eres responsable, con su plan y su estado."
        actions={
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        }
      />

      <Toolbar
        label="Filtros de mi trabajo"
        collapseOnMobile
        end={
          <>
            {state !== 'error' ? (
              <ResultCount
                loading={state === 'loading'}
                total={table.total}
                filtered={table.filtered}
                noun={NOUN}
              />
            ) : null}
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : null}
          </>
        }
      >
        <SearchInput
          ref={searchRef}
          id="mt-buscar"
          placeholder="Título de la tarea"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="mt-filtro-estado">Estado</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="mt-filtro-estado" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {TASK_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {taskStatusLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <DataView
        state={viewState}
        loading={{ rows: 6, columns: 5 }}
        mobileCards
        error={{
          title: 'No fue posible cargar tu trabajo.',
          message: errorMessage,
          onRetry: () => void load(),
        }}
        empty={{
          icon: ListChecks,
          title: 'No tienes tareas asignadas.',
          description: 'Las tareas de las que seas responsable aparecerán aquí.',
        }}
      >
        <div className="hidden md:block">
        <Table scrollLabel="Tabla de mis tareas">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Tarea"
                sortKey="title"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Solicitud</TableHead>
              <TableHead>Fase</TableHead>
              <SortableTableHead
                label="Vence"
                sortKey="endDate"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead
                label="Estado"
                sortKey="status"
                sort={table.sort}
                onSort={table.toggleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.pageRows.map((item) => (
              <TableRow key={item.taskId}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <div className="flex items-center gap-2">
                    <CellTitle href={`/seguimiento/tareas?taskId=${encodeURIComponent(item.taskId)}`}>
                      {item.title}
                    </CellTitle>
                    {item.isMilestone ? (
                      <Badge variant="outline" className="shrink-0">
                        Hito
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-40 text-muted-foreground">{item.requestTitle}</TableCell>
                <TableCell className="min-w-32 text-muted-foreground">{item.phaseName}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDateOnly(item.endDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <StatusBadge kind="task" value={item.status} />
                    <span className="text-meta tabular-nums text-muted-foreground">
                      <span className="sr-only">avance </span>
                      {formatPercent(item.progress)}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <DataCardList
          label="Mis tareas"
          rows={table.pageRows}
          getKey={(item) => item.taskId}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'title', label: 'Tarea' },
              { key: 'endDate', label: 'Vence' },
              { key: 'status', label: 'Estado' },
            ],
          }}
          card={(item) => ({
            title: (
              <div className="flex items-center gap-2">
                <CellTitle
                  touch
                  href={`/seguimiento/tareas?taskId=${encodeURIComponent(item.taskId)}`}
                >
                  {item.title}
                </CellTitle>
                {item.isMilestone ? (
                  <Badge variant="outline" className="shrink-0">
                    Hito
                  </Badge>
                ) : null}
              </div>
            ),
            subtitle: [item.requestTitle, item.phaseName].filter(Boolean).join(' · '),
            badges: [<StatusBadge key="status" kind="task" value={item.status} />],
            meta: [
              { label: 'Vence', value: formatDateOnly(item.endDate) },
              { label: 'Avance', value: formatPercent(item.progress) },
            ],
          })}
        />
        <DataTablePagination
          id="mt-paginacion"
          page={table.page}
          pageCount={table.pageCount}
          from={table.from}
          to={table.to}
          filtered={table.filtered}
          pageSize={table.pageSize ?? 25}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun={NOUN}
        />
      </DataView>
    </PageLayout>
  );
}
