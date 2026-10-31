'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { FolderKanban } from 'lucide-react';
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
import { PriorityBadge, PriorityLegend, StatusBadge } from '@/components/status-badge';
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CatalogItem, Process } from '@/lib/api-client';
import { listCatalogItems } from '@/lib/catalog';
import { formatDateOnly } from '@/lib/format';
import {
  ApiError,
  listPortfolio,
  type PortfolioItem,
} from '@/lib/portfolio';
import { REQUEST_STATE_LABELS, requestStateLabel } from '@/lib/request-state';
import { routeLabel } from '@/lib/status-presentation';
import {
  compareByOrder,
  compareDate,
  compareText,
  matchesSearch,
  type Comparator,
} from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useClientTable } from '@/lib/use-client-table';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'title' | 'state' | 'band' | 'registered' | 'target';

/** Valor centinela del Select para "sin filtro" (Radix no admite value vacío). */
const ANY = '__any';

/** Bandas de prioridad del marco §4 + SIN_PRIORIZAR. */
const BANDS = ['P1', 'P2', 'P3', 'P4', 'SIN_PRIORIZAR'] as const;

const BAND_LABELS: Record<string, string> = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
  SIN_PRIORIZAR: 'Sin priorizar',
};

/** Estados operativos en orden del enum RequestState. */
const STATE_OPTIONS = Object.keys(REQUEST_STATE_LABELS);
const NOUN = { one: 'iniciativa', other: 'iniciativas' };

const compareState = compareByOrder(STATE_OPTIONS);
// P1 → P4; sin priorizar (null) al final en las dos direcciones.
const compareBand = compareByOrder(['P1', 'P2', 'P3', 'P4']);
const COMPARATORS: Record<SortKey, Comparator<PortfolioItem>> = {
  title: (a, b, direction) => compareText(a.title, b.title, direction),
  state: (a, b, direction) => compareState(a.operationalState, b.operationalState, direction),
  band: (a, b, direction) => compareBand(a.priorityBand, b.priorityBand, direction),
  registered: (a, b, direction) => compareDate(a.registeredAt, b.registeredAt, direction),
  target: (a, b, direction) => compareDate(a.targetDate, b.targetDate, direction),
};

function messageOf(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Ocurrió un error inesperado.';
}

/**
 * Línea bajo el título: proceso y, si la hay, la ruta de gobierno. Sustituye a
 * las columnas «Proceso» y «Ruta» (auditoría UX A2: la tabla de 11 columnas se
 * cortaba a 1440 px).
 */
function rowMeta(item: PortfolioItem, routes: CatalogItem[]): string {
  const route = routeLabel(item.governanceRoute, routes);
  const hasRoute = route !== '' && route !== '—';
  return [item.mainProcessName, hasRoute ? `Ruta: ${route}` : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/** Barra de avance del proyecto; «—» si aún no tiene tareas. */
function ProgressCell({ value }: { value: number | null | undefined }): React.ReactElement {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">Sin tareas</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="Avance del proyecto"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 w-20 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="text-meta tabular-nums">{value}%</span>
    </div>
  );
}

/** Alerta según la fecha objetivo (vencido, próximo a vencer). */
function DueBadge({
  status,
  days,
}: {
  status: string;
  days: number | null | undefined;
}): React.ReactElement | null {
  if (status === 'VENCIDO') {
    const late = Math.abs(days ?? 0);
    return (
      <Badge variant="danger">{late === 1 ? 'Vencido hace 1 día' : `Vencido hace ${late} días`}</Badge>
    );
  }
  if (status === 'PROXIMO_A_VENCER') {
    return (
      <Badge variant="warning">
        {days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`}
      </Badge>
    );
  }
  if (status === 'EN_TIEMPO') {
    return <Badge variant="success">En tiempo</Badge>;
  }
  return null;
}

/**
 * Portafolio (design §11.12, patrón A): vista de solo lectura de las
 * iniciativas en alcance. Proceso, estado y banda filtran en el servidor, como
 * siempre; la búsqueda por título, el orden y la paginación son de
 * presentación, en cliente.
 */
export function PortafolioView(): React.ReactElement {
  const [processId, setProcessId] = React.useState<string>(ANY);
  const [stateFilter, setStateFilter] = React.useState<string>(ANY);
  const [bandFilter, setBandFilter] = React.useState<string>(ANY);
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [items, setItems] = React.useState<PortfolioItem[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [routes, setRoutes] = React.useState<CatalogItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Procesos para poblar el filtro (acotados por el alcance del backend) y la
  // maestra de rutas para sus etiquetas; si fallan, se degradan a vacío.
  React.useEffect(() => {
    void listProcesses()
      .then(setProcesses)
      .catch(() => setProcesses([]));
    void listCatalogItems({ catalog: 'GOVERNANCE_ROUTE' })
      .then(setRoutes)
      .catch(() => setRoutes([]));
  }, []);

  const fetchPortfolio = React.useCallback(
    (filters: { mainProcessId?: string; state?: string; band?: string }) => {
      return listPortfolio(filters)
        .then((data) => {
          setItems(data);
          setState('success');
        })
        .catch((err: unknown) => {
          setErrorMessage(messageOf(err));
          setState('error');
        });
    },
    [],
  );
  const load = React.useCallback(
    (filters: { mainProcessId?: string; state?: string; band?: string }) => {
      setState('loading');
      setErrorMessage(null);
      return fetchPortfolio(filters);
    },
    [fetchPortfolio],
  );

  const activeFilters = React.useMemo(
    () => ({
      ...(processId !== ANY ? { mainProcessId: processId } : {}),
      ...(stateFilter !== ANY ? { state: stateFilter } : {}),
      ...(bandFilter !== ANY ? { band: bandFilter } : {}),
    }),
    [processId, stateFilter, bandFilter],
  );

  // Filtros de servidor: recarga automática al cambiar, como hasta ahora.
  // Al cambiar los filtros se vuelve a mostrar la carga.
  useResetOnChange([activeFilters], () => {
    setState('loading');
    setErrorMessage(null);
  });
  React.useEffect(() => {
    void fetchPortfolio(activeFilters);
  }, [activeFilters, fetchPortfolio]);

  const hasServerFilters = processId !== ANY || stateFilter !== ANY || bandFilter !== ANY;
  const hasFilters = hasServerFilters || query.trim() !== '';
  const filter = React.useCallback((item: PortfolioItem) => matchesSearch(item.title, query), [query]);
  const table = useClientTable({
    rows: items,
    filter,
    comparators: COMPARATORS,
    defaultSort: null,
    resetKey: JSON.stringify([query, processId, stateFilter, bandFilter]),
    pageSize: 25,
  });

  function clearFilters(): void {
    // Restablecer los filtros de servidor dispara la misma recarga que elegirlos.
    setProcessId(ANY);
    setStateFilter(ANY);
    setBandFilter(ANY);
    setQuery('');
    // «Limpiar filtros» desaparece: el foco pasa a la búsqueda (NIT 4, plan D9).
    searchRef.current?.focus();
  }

  // NIT 7: total = lo que devuelve el servidor con sus filtros; filtered = tras
  // la búsqueda en cliente; los filtros de servidor también cuentan como filtros.
  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (table.total === 0 && !hasFilters) viewState = 'empty';
  else if (table.filtered === 0) viewState = 'no-results';
  else viewState = 'ready';

  return (
    <PageLayout>
      <PageHeader
        title="Portafolio"
        description="Vista de conjunto de las iniciativas de tu alcance. Los filtros acotan tu alcance, no lo amplían."
      />

      <Toolbar
        label="Filtros del portafolio"
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
          id="portafolio-buscar"
          placeholder="Título de la iniciativa"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="portafolio-proceso">Proceso</Label>
          <Select value={processId} onValueChange={setProcessId}>
            <SelectTrigger id="portafolio-proceso" className="w-full sm:w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos</SelectItem>
              {processes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="portafolio-estado">Estado operativo</Label>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger id="portafolio-estado" className="w-full sm:w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos</SelectItem>
              {STATE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {requestStateLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="portafolio-banda">Banda de prioridad</Label>
          <Select value={bandFilter} onValueChange={setBandFilter}>
            <SelectTrigger id="portafolio-banda" className="w-full sm:w-40">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todas</SelectItem>
              {BANDS.map((b) => (
                <SelectItem key={b} value={b}>
                  {BAND_LABELS[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <PriorityLegend />

      <DataView
        state={viewState}
        loading={{ rows: 8, columns: 11 }}
        mobileCards
        error={{
          title: 'No fue posible cargar el portafolio.',
          message: errorMessage,
          onRetry: () => void load(activeFilters),
        }}
        empty={{
          icon: FolderKanban,
          title: 'No hay iniciativas en tu alcance.',
          description: 'Las solicitudes de los procesos de tu alcance aparecen aquí desde su registro.',
        }}
      >
        <div className="hidden md:block">
        <Table scrollLabel="Tabla del portafolio">
          <TableCaption>
            Iniciativas del portafolio dentro de tu alcance. Bajo cada título se indican el proceso y la
            ruta de gobierno; el estado incluye el bloqueo, y el objetivo incluye la fecha de compromiso.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Título" sortKey="title" sort={table.sort} onSort={table.toggleSort} />
              <SortableTableHead label="Estado" sortKey="state" sort={table.sort} onSort={table.toggleSort} />
              <SortableTableHead label="Banda" sortKey="band" sort={table.sort} onSort={table.toggleSort} />
              <TableHead>Avance</TableHead>
              <TableHead>Responsable</TableHead>
              <SortableTableHead
                label="Registro"
                sortKey="registered"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead label="Objetivo" sortKey="target" sort={table.sort} onSort={table.toggleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.pageRows.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle
                    href={`/demanda/solicitudes/${encodeURIComponent(item.id)}`}
                    meta={rowMeta(item, routes)}
                  >
                    {item.title}
                  </CellTitle>
                </TableCell>
                <TableCell className="min-w-36">
                  <div className="flex flex-col items-start gap-1 py-0.5">
                    <StatusBadge kind="request" value={item.operationalState} />
                    {item.blocked ? (
                      <>
                        <StatusBadge kind="blocked" value="true" />
                        {item.blockedReason ? (
                          <span
                            className="line-clamp-2 max-w-[16rem] text-meta wrap-break-word text-muted-foreground"
                            title={item.blockedReason}
                          >
                            {item.blockedReason}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <PriorityBadge variant="compact" band={item.priorityBand} label={item.priorityLabel} />
                </TableCell>
                <TableCell className="min-w-32">
                  <ProgressCell value={item.progressPercent} />
                </TableCell>
                <TableCell className="min-w-44 max-w-[16rem]">
                  {item.responsibleName ? (
                    <span className="line-clamp-2 wrap-break-word" title={item.responsibleName}>
                      {item.responsibleName}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDateOnly(item.registeredAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="tabular-nums">{formatDateOnly(item.targetDate)}</span>
                    <DueBadge status={item.dueStatus} days={item.daysToTarget} />
                    {item.initialCommitmentDate ? (
                      <span className="text-meta tabular-nums text-muted-foreground">
                        {`Compromiso: ${formatDateOnly(item.initialCommitmentDate)}`}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <DataCardList
          label="Iniciativas del portafolio"
          rows={table.pageRows}
          getKey={(item) => item.id}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'title', label: 'Título' },
              { key: 'state', label: 'Estado' },
              { key: 'band', label: 'Banda' },
              { key: 'registered', label: 'Registro' },
              { key: 'target', label: 'Objetivo' },
            ],
          }}
          card={(item) => ({
            title: (
              <CellTitle touch href={`/demanda/solicitudes/${encodeURIComponent(item.id)}`}>
                {item.title}
              </CellTitle>
            ),
            subtitle: rowMeta(item, routes),
            badges: [
              <StatusBadge key="state" kind="request" value={item.operationalState} />,
              item.blocked ? <StatusBadge key="blocked" kind="blocked" value="true" /> : null,
              <PriorityBadge
                key="band"
                variant="compact"
                band={item.priorityBand}
                label={item.priorityLabel}
              />,
            ],
            note: item.blocked ? item.blockedReason : null,
            meta: [
              { label: 'Avance', value: <ProgressCell value={item.progressPercent} /> },
              { label: 'Responsable', value: item.responsibleName ?? '—' },
              {
                label: 'Objetivo',
                value: (
                  <span className="flex flex-col items-start gap-0.5">
                    <span>{formatDateOnly(item.targetDate)}</span>
                    <DueBadge status={item.dueStatus} days={item.daysToTarget} />
                    {item.initialCommitmentDate ? (
                      <span className="text-muted-foreground">
                        {`Compromiso: ${formatDateOnly(item.initialCommitmentDate)}`}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              { label: 'Registro', value: formatDateOnly(item.registeredAt) },
            ],
          })}
        />
        <DataTablePagination
          id="portafolio-paginacion"
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
