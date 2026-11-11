'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { IdChip } from '@/components/id-chip';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PriorityBadge, PriorityLegend, StatusBadge } from '@/components/status-badge';
import { MultiSelectFilter } from '@/components/multi-select-filter';
import { SearchInput, Toolbar } from '@/components/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useActor } from '@/lib/actor-context';
import { listCatalogItems } from '@/lib/catalog';
import {
  BAND_FILTER_OPTIONS,
  processFilterOptions,
  stateFilterOptions,
} from '@/lib/filter-options';
import { formatDateOnly } from '@/lib/format';
import {
  ApiError,
  listPortfolio,
  type PortfolioFilters,
  type PortfolioItem,
} from '@/lib/portfolio';
import { COMMITTED_STATES, REQUEST_STATE_LABELS } from '@/lib/request-state';
import { routeLabel } from '@/lib/status-presentation';
import {
  compareByOrder,
  compareDate,
  compareText,
  matchCode,
  matchesSearch,
  type Comparator,
  type SortState,
} from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useClientTable } from '@/lib/use-client-table';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'title' | 'state' | 'band' | 'registered' | 'target';

/** Opciones del filtro de estado, agrupadas por fase del flujo. */
const STATE_FILTER_OPTIONS = stateFilterOptions();

/** Estados operativos en orden del enum RequestState. */
const STATE_OPTIONS = Object.keys(REQUEST_STATE_LABELS);
/** Por defecto solo iniciativas (solicitudes ya comprometidas); ver COMMITTED_STATES. */
const NOUN = { one: 'iniciativa', other: 'iniciativas' };
/** Con «Incluir pendientes de decisión» el listado mezcla solicitudes e iniciativas. */
const NOUN_ALL = { one: 'solicitud o iniciativa', other: 'solicitudes e iniciativas' };

/** Selección de los tres filtros de servidor; vacío = sin restricción. */
interface SelectionState {
  process: string[];
  state: string[];
  band: string[];
}
/**
 * Selección inicial: el Portafolio muestra las iniciativas comprometidas. El
 * filtro por defecto vive en la UI; GET /portfolio sin parámetros sigue
 * devolviendo todos los estados (MCP y asistente no cambian).
 */
const DEFAULT_SELECTION: SelectionState = {
  process: [],
  state: [...COMMITTED_STATES],
  band: [],
};

/** Mismos elementos, sin importar el orden. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/**
 * El listado incluye estados fuera del conjunto comprometido: sin filtro de
 * estado (todos) o con algún estado de decisión pendiente marcado.
 */
function includesPending(states: readonly string[]): boolean {
  return states.length === 0 || states.some((s) => !COMMITTED_STATES.includes(s));
}

/** Registro descendente, igual que Solicitudes (también en móvil). */
const DEFAULT_SORT: SortState<SortKey> = { key: 'registered', direction: 'desc' };
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

/** Barra de avance de la iniciativa; «—» si aún no tiene tareas. */
function ProgressCell({ value }: { value: number | null | undefined }): React.ReactElement {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">Sin tareas</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="Avance de la iniciativa"
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
 * iniciativas en alcance. Proceso, estado y banda son de selección múltiple y
 * filtran en el servidor (parámetros repetidos; O dentro de cada filtro, Y
 * entre filtros); cada selección se aplica al cerrar su panel. La búsqueda por
 * título, el orden y la paginación son de presentación, en cliente.
 */
export function PortafolioView(): React.ReactElement {
  // Selección aplicada (la que viaja al servidor) y borrador (lo que el usuario
  // marca con el panel abierto). Se aplica al CERRAR el panel: un clic por
  // casilla no dispara una petición ni una pantalla de carga (spec D8).
  const searchParams = useSearchParams();
  const { allowedModules } = useActor();
  const [applied, setApplied] = React.useState<SelectionState>(DEFAULT_SELECTION);
  const [draft, setDraft] = React.useState<SelectionState>(DEFAULT_SELECTION);
  // «Ver en Portafolio» (Solicitudes) llega con ?q=<título>: se precarga la búsqueda.
  const [query, setQuery] = React.useState(() => (searchParams.get('q') ?? '').slice(0, 200));
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

  const processOptions = React.useMemo(() => processFilterOptions(processes), [processes]);

  const fetchPortfolio = React.useCallback(
    (filters: PortfolioFilters) => {
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
    (filters: PortfolioFilters) => {
      setState('loading');
      setErrorMessage(null);
      return fetchPortfolio(filters);
    },
    [fetchPortfolio],
  );

  // Solo cambia cuando cambia la selección aplicada (no la del borrador).
  const activeFilters = React.useMemo<PortfolioFilters>(
    () => ({ mainProcessId: applied.process, state: applied.state, band: applied.band }),
    [applied],
  );

  /** Al cerrar el panel de un filtro, su borrador pasa a aplicarse (solo si cambió). */
  function commit(key: keyof SelectionState, open: boolean): void {
    if (open) return;
    if (sameList(draft[key], applied[key])) return;
    setApplied({ ...applied, [key]: draft[key] });
  }

  // Filtros de servidor: recarga automática al cambiar, como hasta ahora.
  // Al cambiar los filtros se vuelve a mostrar la carga.
  useResetOnChange([activeFilters], () => {
    setState('loading');
    setErrorMessage(null);
  });
  React.useEffect(() => {
    void fetchPortfolio(activeFilters);
  }, [activeFilters, fetchPortfolio]);

  // Los filtros «activos» son los que se apartan del conjunto por defecto.
  const hasServerFilters =
    applied.process.length > 0 ||
    applied.band.length > 0 ||
    !sameList(applied.state, DEFAULT_SELECTION.state);
  const hasFilters = hasServerFilters || query.trim() !== '';
  const pendingIncluded = includesPending(applied.state);
  const filter = React.useCallback((item: PortfolioItem) => matchesSearch(item.title, query) || matchCode(item.code, query), [query]);
  const table = useClientTable({
    rows: items,
    filter,
    comparators: COMPARATORS,
    defaultSort: DEFAULT_SORT,
    resetKey: JSON.stringify([query, applied]),
    pageSize: 25,
  });

  function clearFilters(): void {
    // Restablecer los filtros de servidor dispara la misma recarga que elegirlos;
    // «Limpiar filtros» vuelve al conjunto por defecto (iniciativas comprometidas).
    setApplied(DEFAULT_SELECTION);
    setDraft(DEFAULT_SELECTION);
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

  /** «Incluir pendientes de decisión»: amplía a todos los estados; apagado vuelve al conjunto por defecto. */
  function togglePending(include: boolean): void {
    const next: SelectionState = {
      ...applied,
      state: include ? [] : [...DEFAULT_SELECTION.state],
    };
    setApplied(next);
    setDraft((current) => ({ ...current, state: next.state }));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Portafolio"
        description={
          <>
            Seguimiento de avance y fechas de las iniciativas comprometidas. Para registrar o
            editar, ve a{' '}
            {allowedModules.has('requests') ? (
              <Link
                href="/demanda/solicitudes"
                className="rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Solicitudes
              </Link>
            ) : (
              'Solicitudes'
            )}
            .
          </>
        }
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
                noun={pendingIncluded ? NOUN_ALL : NOUN}
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
          placeholder="Título o ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <MultiSelectFilter
          id="portafolio-proceso"
          label="Proceso"
          options={processOptions}
          selected={draft.process}
          onChange={(next) => setDraft({ ...draft, process: next })}
          onOpenChange={(open) => commit('process', open)}
          className="sm:w-44"
        />
        <MultiSelectFilter
          id="portafolio-estado"
          label="Estado"
          options={STATE_FILTER_OPTIONS}
          selected={draft.state}
          onChange={(next) => setDraft({ ...draft, state: next })}
          onOpenChange={(open) => commit('state', open)}
          className="sm:w-44"
        />
        <MultiSelectFilter
          id="portafolio-banda"
          label="Prioridad"
          options={BAND_FILTER_OPTIONS}
          selected={draft.band}
          onChange={(next) => setDraft({ ...draft, band: next })}
          onOpenChange={(open) => commit('band', open)}
          placeholder="Todas"
          gender="f"
          className="sm:w-40"
        />
        <div className="flex h-9 items-center gap-2">
          <Switch
            id="portafolio-incluir-pendientes"
            checked={pendingIncluded}
            onCheckedChange={togglePending}
          />
          <Label htmlFor="portafolio-incluir-pendientes" className="font-normal">
            Incluir pendientes de decisión
          </Label>
        </div>
      </Toolbar>

      <p className="text-meta text-muted-foreground">
        {pendingIncluded
          ? 'Se incluyen solicitudes pendientes de decisión (registradas, en triage, devueltas, rechazadas, en backlog o retiradas), además de las iniciativas comprometidas.'
          : 'Solo iniciativas comprometidas, desde «Comprometida» hasta «Cerrada». Activa «Incluir pendientes de decisión» para ver también las solicitudes que aún no se comprometen.'}
      </p>

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
          title: pendingIncluded
            ? 'No hay solicitudes ni iniciativas en tu alcance.'
            : 'Aún no hay iniciativas comprometidas en tu alcance.',
          description: pendingIncluded
            ? 'Las solicitudes aparecen aquí cuando se registran y entran en tu alcance.'
            : 'Una solicitud pasa a ser iniciativa cuando se aprueba su compromiso. Mientras tanto la gestionas en Solicitudes.',
          action: allowedModules.has('requests') ? (
            <Link href="/demanda/solicitudes" className={buttonVariants({ variant: 'outline' })}>
              Ir a Solicitudes
            </Link>
          ) : undefined,
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
              <SortableTableHead label="Prioridad" sortKey="band" sort={table.sort} onSort={table.toggleSort} />
              <TableHead>Avance</TableHead>
              <SortableTableHead label="Objetivo" sortKey="target" sort={table.sort} onSort={table.toggleSort} />
              <TableHead>Responsable</TableHead>
              {/* Registro se oculta por debajo de 1280 px para que «Objetivo» quepa en tablet. */}
              <SortableTableHead
                label="Registro"
                sortKey="registered"
                sort={table.sort}
                onSort={table.toggleSort}
                className="hidden xl:table-cell"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.pageRows.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="min-w-56 max-w-[30rem]">
                  <div className="flex items-start gap-2">
                    <IdChip code={item.code} className="mt-0.5" />
                    <CellTitle
                      href={`/seguimiento/portafolio/${encodeURIComponent(item.id)}`}
                      meta={rowMeta(item, routes)}
                    >
                      {item.title}
                    </CellTitle>
                  </div>
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
                <TableCell className="min-w-36 max-w-[16rem]">
                  {item.responsibleName ? (
                    <span className="line-clamp-2 wrap-break-word" title={item.responsibleName}>
                      {item.responsibleName}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground xl:table-cell">
                  {formatDateOnly(item.registeredAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <DataCardList
          label="Portafolio"
          rows={table.pageRows}
          getKey={(item) => item.id}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'title', label: 'Título' },
              { key: 'state', label: 'Estado' },
              { key: 'band', label: 'Prioridad' },
              { key: 'registered', label: 'Registro' },
              { key: 'target', label: 'Objetivo' },
            ],
          }}
          card={(item) => ({
            title: (
              <CellTitle touch href={`/seguimiento/portafolio/${encodeURIComponent(item.id)}`}>
                {item.title}
              </CellTitle>
            ),
            subtitle: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <IdChip code={item.code} />
                {rowMeta(item, routes)}
              </span>
            ),
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
