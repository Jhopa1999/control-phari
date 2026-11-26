'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FolderKanban, X } from 'lucide-react';
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
  getPortfolioSummary,
  listPortfolioPage,
  type PortfolioAlert,
  type PortfolioItem,
  type PortfolioSummary,
  type PortfolioSortKey,
} from '@/lib/portfolio';
import { COMMITTED_STATES } from '@/lib/request-state';
import { routeLabel } from '@/lib/status-presentation';
import { cn } from '@/lib/utils';
import type { SortState } from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useDebouncedValue, useServerTable } from '@/lib/use-server-table';
import { ServerListBody } from '@/components/server-list';
import { AlertStrip, alertLabel, parseAlert } from './alert-strip';

/**
 * Columnas ordenables: solo las de la lista blanca del servidor. «Entrega» se
 * calcula con el plan y no es ordenable en el servidor: su cabecera es texto.
 */
type SortKey = 'title' | 'state' | 'band' | 'registered';

/** Opciones del filtro de estado, agrupadas por fase del flujo. */
const STATE_FILTER_OPTIONS = stateFilterOptions();

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
/** Columna de la vista → orden del servidor. */
const SERVER_SORT: Record<SortKey, PortfolioSortKey> = {
  title: 'title',
  state: 'state',
  // La banda sale del score: «ascendente» por banda (P1 → P4) es score
  // descendente. Sin priorizar queda al final en las dos direcciones.
  band: 'score',
  registered: 'registeredAt',
};

function serverDirection(sort: SortState<SortKey>): 'asc' | 'desc' {
  if (sort.key !== 'band') return sort.direction;
  return sort.direction === 'asc' ? 'desc' : 'asc';
}

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

/** Texto de días con signo: «+20 d» / «−3 d». */
function signedDays(days: number): string {
  return `${days > 0 ? '+' : '−'}${Math.abs(days)} d`;
}

/**
 * Fecha de entrega de una iniciativa. La fecha objetivo de la solicitud es una
 * expectativa inicial; con el plan autorizado, el vencimiento se mide contra el
 * compromiso del plan y la brecha con lo solicitado se informa aparte (no es un
 * vencimiento).
 */
function DeliveryCell({
  item,
  compact = false,
}: {
  item: PortfolioItem;
  compact?: boolean;
}): React.ReactElement {
  const fromPlan = item.referenceSource === 'PLAN';
  const muted = compact ? 'text-muted-foreground' : 'text-meta text-muted-foreground';
  const gap = item.requestedGapDays ?? 0;
  const variance = item.scheduleVarianceDays ?? 0;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="tabular-nums">
        {fromPlan ? `Compromiso: ${formatDateOnly(item.referenceDate)}` : formatDateOnly(item.targetDate)}
      </span>
      <DueBadge status={item.dueStatus} days={item.daysToTarget} />
      {fromPlan && item.targetDate ? (
        <span className={cn('tabular-nums', muted)}>{`Solicitada: ${formatDateOnly(item.targetDate)}`}</span>
      ) : null}
      {fromPlan && gap > 0 ? (
        <Badge variant="warning" title="El plan autorizado termina después de la fecha que pidió el solicitante.">
          {`Plan ${signedDays(gap)} sobre lo solicitado`}
        </Badge>
      ) : null}
      {fromPlan && variance > 0 ? (
        <Badge variant="warning" title="Las tareas abiertas terminan después del compromiso del plan.">
          {`Desviación ${signedDays(variance)}`}
        </Badge>
      ) : null}
      {!fromPlan && item.initialCommitmentDate ? (
        <span className={cn('tabular-nums', muted)}>
          {`Compromiso: ${formatDateOnly(item.initialCommitmentDate)}`}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Portafolio (design §11.12, patrón A): vista de solo lectura de las
 * iniciativas en alcance. Proceso, estado y banda son de selección múltiple y
 * filtran en el servidor (parámetros repetidos; O dentro de cada filtro, Y
 * entre filtros); cada selección se aplica al cerrar su panel. La búsqueda
 * (código y título), el orden y la paginación también son del servidor
 * (oleada 3, PR-B).
 */
export function PortafolioView(): React.ReactElement {
  // Selección aplicada (la que viaja al servidor) y borrador (lo que el usuario
  // marca con el panel abierto). Se aplica al CERRAR el panel: un clic por
  // casilla no dispara una petición ni una pantalla de carga (spec D8).
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { allowedModules } = useActor();
  // La alerta activa vive en la URL (?alert=); un valor desconocido se ignora.
  const alert = parseAlert(searchParams.get('alert'));
  const [applied, setApplied] = React.useState<SelectionState>(DEFAULT_SELECTION);
  const [draft, setDraft] = React.useState<SelectionState>(DEFAULT_SELECTION);
  // «Ver en Portafolio» (Solicitudes) llega con ?q=<título>: se precarga la búsqueda.
  const [query, setQuery] = React.useState(() => (searchParams.get('q') ?? '').slice(0, 200));
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [routes, setRoutes] = React.useState<CatalogItem[]>([]);

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

  /** Activa o apaga la alerta en la URL sin añadir historial; conserva el resto de parámetros. */
  const selectAlert = React.useCallback(
    (next: PortfolioAlert | undefined): void => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === undefined) params.delete('alert');
      else params.set('alert', next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const processOptions = React.useMemo(() => processFilterOptions(processes), [processes]);

  /** Al cerrar el panel de un filtro, su borrador pasa a aplicarse (solo si cambió). */
  function commit(key: keyof SelectionState, open: boolean): void {
    if (open) return;
    if (sameList(draft[key], applied[key])) return;
    setApplied({ ...applied, [key]: draft[key] });
  }

  // La búsqueda (código y título) viaja al servidor 300 ms después de la última tecla.
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  // Los filtros «activos» son los que se apartan del conjunto por defecto.
  const hasServerFilters =
    applied.process.length > 0 ||
    applied.band.length > 0 ||
    !sameList(applied.state, DEFAULT_SELECTION.state);
  const hasFilters = hasServerFilters || debouncedQuery !== '' || alert !== undefined;
  const showClear = hasServerFilters || query.trim() !== '' || alert !== undefined;
  const pendingIncluded = includesPending(applied.state);
  // Solo cambia cuando cambia la selección APLICADA (no la del borrador).
  const fetchPage = React.useCallback(
    ({ page, pageSize, sort, signal }: { page: number; pageSize: number; sort: SortState<SortKey> | null; signal: AbortSignal }) =>
      listPortfolioPage(
        {
          mainProcessId: applied.process,
          state: applied.state,
          band: applied.band,
          alert,
          q: debouncedQuery,
          sort: sort ? SERVER_SORT[sort.key] : undefined,
          dir: sort ? serverDirection(sort) : undefined,
          page,
          pageSize,
        },
        signal,
      ),
    [applied, debouncedQuery, alert],
  );
  // Contadores de la franja: mismos filtros que el listado, sin la alerta (D3).
  // El resultado guarda la clave con la que se pidió: «cargando» = la clave vigente
  // aún no tiene respuesta (sin setState síncrono en el efecto).
  const [summaryNonce, setSummaryNonce] = React.useState(0);
  const summaryKey = JSON.stringify([applied, debouncedQuery, summaryNonce]);
  const [summaryResult, setSummaryResult] = React.useState<{
    key: string;
    summary: PortfolioSummary | null;
    failed: boolean;
  }>({ key: '', summary: null, failed: false });
  React.useEffect(() => {
    const controller = new AbortController();
    getPortfolioSummary(
      { mainProcessId: applied.process, state: applied.state, band: applied.band, q: debouncedQuery },
      controller.signal,
    )
      .then((next) => setSummaryResult({ key: summaryKey, summary: next, failed: false }))
      .catch(() => {
        if (controller.signal.aborted) return;
        setSummaryResult((prev) => ({ key: summaryKey, summary: prev.summary, failed: true }));
      });
    return () => controller.abort();
  }, [applied, debouncedQuery, summaryKey]);
  const summaryLoading = summaryResult.key !== summaryKey;
  const summaryFailed = !summaryLoading && summaryResult.failed;

  const table = useServerTable<PortfolioItem, SortKey>({
    fetchPage,
    filtersKey: JSON.stringify([debouncedQuery, applied, alert]),
    defaultSort: DEFAULT_SORT,
  });
  const listRef = React.useRef<HTMLDivElement>(null);

  function clearFilters(): void {
    // Restablecer los filtros de servidor dispara la misma recarga que elegirlos;
    // «Limpiar filtros» vuelve al conjunto por defecto (iniciativas comprometidas).
    setApplied(DEFAULT_SELECTION);
    setDraft(DEFAULT_SELECTION);
    setQuery('');
    if (alert !== undefined) selectAlert(undefined);
    // «Limpiar filtros» desaparece: el foco pasa a la búsqueda (NIT 4, plan D9).
    searchRef.current?.focus();
  }

  // Total = el del servidor tras filtros y búsqueda. Una recarga con filas
  // visibles sigue en 'ready' (la tabla no parpadea a vacío).
  let viewState: DataViewState;
  if (table.status === 'loading') viewState = 'loading';
  else if (table.status === 'error') viewState = 'error';
  else if (table.total === 0 && table.status === 'ready') viewState = hasFilters ? 'no-results' : 'empty';
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

      <AlertStrip
        summary={summaryResult.summary}
        loading={summaryLoading}
        failed={summaryFailed}
        active={alert}
        onSelect={selectAlert}
        onRetry={() => setSummaryNonce((n) => n + 1)}
      />

      <Toolbar
        label="Filtros del portafolio"
        collapseOnMobile
        end={
          <>
            <PriorityLegend />
            {table.status !== 'error' ? (
              <ResultCount
                loading={table.busy}
                spinner
                total={table.total}
                filtered={table.total}
                noun={pendingIncluded ? NOUN_ALL : NOUN}
              />
            ) : null}
            {alert !== undefined ? (
              <Badge variant="accent" className="gap-1 pr-0.5">
                {`Alerta: ${alertLabel(alert)}`}
                <button
                  type="button"
                  aria-label={`Quitar alerta ${alertLabel(alert)}`}
                  onClick={() => selectAlert(undefined)}
                  className="inline-flex size-6 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <X aria-hidden="true" />
                </button>
              </Badge>
            ) : null}
            {showClear ? (
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
          placeholder="Código o título"
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query !== '') setQuery('');
          }}
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


      <DataView
        state={viewState}
        loading={{ rows: 8, columns: 11 }}
        mobileCards
        error={{
          title: 'No fue posible cargar el portafolio.',
          message: messageOf(table.error),
          onRetry: table.reload,
        }}
        noResults={{
          title: 'Sin resultados',
          description:
            alert !== undefined
              ? 'Ninguna iniciativa coincide con la búsqueda o los filtros. Quita el filtro de alerta para ver más.'
              : 'Ninguna iniciativa coincide con la búsqueda o los filtros.',
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
        <ServerListBody
          containerRef={listRef}
          reloading={table.status === 'reloading'}
          reloadFailed={table.status === 'reload-error'}
          onRetry={table.reload}
          truncated={table.truncated}
        >
        <div className="hidden md:block">
        <Table scrollLabel="Tabla del portafolio">
          <TableCaption>
            Iniciativas del portafolio dentro de tu alcance. Bajo cada título se indican el proceso y la
            ruta de gobierno; el estado incluye el bloqueo, y la entrega muestra el compromiso del plan autorizado (o la fecha solicitada si aún no hay plan) con su alerta de vencimiento.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Título" sortKey="title" sort={table.sort} onSort={table.toggleSort} />
              <SortableTableHead label="Estado" sortKey="state" sort={table.sort} onSort={table.toggleSort} />
              <SortableTableHead label="Prioridad" sortKey="band" sort={table.sort} onSort={table.toggleSort} />
              <TableHead>Avance</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Responsable</TableHead>
              {/* Registro se oculta por debajo de 1280 px para que «Entrega» quepa en tablet. */}
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
            {table.rows.map((item) => (
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
                  <DeliveryCell item={item} />
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
          rows={table.rows}
          getKey={(item) => item.id}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'title', label: 'Título' },
              { key: 'state', label: 'Estado' },
              { key: 'band', label: 'Prioridad' },
              { key: 'registered', label: 'Registro' },
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
                label: 'Entrega',
                value: <DeliveryCell item={item} compact />,
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
          filtered={table.total}
          pageSize={table.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun={pendingIncluded ? NOUN_ALL : NOUN}
          showingPrefix
          busy={table.busy}
          fallbackFocusRef={listRef}
        />
        </ServerListBody>
      </DataView>
    </PageLayout>
  );
}
