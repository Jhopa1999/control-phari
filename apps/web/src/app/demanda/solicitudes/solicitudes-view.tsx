'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Inbox, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { PriorityBadge, PriorityLegend, StatusBadge } from '@/components/status-badge';
import { MultiSelectFilter } from '@/components/multi-select-filter';
import { SearchInput, Toolbar } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import type { Process, Request, Requester } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import {
  BAND_FILTER_OPTIONS,
  NO_BAND,
  NO_PROCESS,
  parseProcessParam,
  processFilterOptions,
  stateFilterOptions,
} from '@/lib/filter-options';
import { formatDate } from '@/lib/format';
import { matchesAny, normalizeSelection } from '@/lib/multi-filter';
import { listRequesters } from '@/lib/requesters';
import {
  RequestError,
  createRequest,
  deleteRequest,
  listRequests,
  updateRequest,
} from '@/lib/requests';
import {
  REQUEST_STATE_LABELS,
  isCommitted,
  isPlannable,
  isPrioritizable,
  isTriageable,
} from '@/lib/request-state';
import { parseBand } from '@/lib/status-presentation';
import {
  compareByOrder,
  compareDate,
  compareNumber,
  compareText,
  matchCode,
  matchesSearch,
  type Comparator,
  type SortState,
} from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useClientTable } from '@/lib/use-client-table';
import {
  SolicitudFormDialog,
  type SolicitudFormValues,
} from './solicitud-form-dialog';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'title' | 'state' | 'priority' | 'registered';

/** Opciones del filtro de estado, agrupadas por fase del flujo. */
const STATE_OPTIONS = stateFilterOptions();
const NOUN = { one: 'solicitud', other: 'solicitudes' };

/** Estados en el orden del flujo (el de REQUEST_STATE_LABELS). */
const REQUEST_STATES = Object.keys(REQUEST_STATE_LABELS);
const compareState = compareByOrder(REQUEST_STATES);
/** Registro descendente: las más recientes primero. */
const DEFAULT_SORT: SortState<SortKey> = { key: 'registered', direction: 'desc' };
const COMPARATORS: Record<SortKey, Comparator<Request>> = {
  title: (a, b, direction) => compareText(a.title, b.title, direction),
  state: (a, b, direction) => compareState(a.operationalState, b.operationalState, direction),
  // Por score; las solicitudes sin score quedan al final en las dos direcciones.
  priority: (a, b, direction) => compareNumber(a.currentScore, b.currentScore, direction),
  registered: (a, b, direction) => compareDate(a.registeredAt, b.registeredAt, direction),
};

function messageOf(err: unknown): string {
  return err instanceof RequestError ? err.message : 'Ocurrió un error inesperado.';
}

/** Convierte un valor de fecha (yyyy-mm-dd) a ISO para el backend, u omite. */
function toIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Banda de una solicitud para el filtro: la del prefijo de priorityLabel, o «Sin priorizar». */
function bandOf(request: Request): string {
  return parseBand(request.priorityLabel) ?? NO_BAND;
}

/**
 * Solicitudes (design §11.5, patrón A): listado con búsqueda, filtros, orden y
 * paginación en cliente sobre GET /requests. El título abre la ficha; el menú
 * «Más acciones» lleva a cada fase solo si el módulo está permitido y la
 * solicitud cumple el predicado del destino.
 */
export function SolicitudesView(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allowedModules } = useActor();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requesters, setRequesters] = React.useState<Requester[]>([]);
  const [toDelete, setToDelete] = React.useState<Request | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState('');
  // Filtros de selección múltiple: arreglo de valores; vacío = sin restricción.
  const [stateFilter, setStateFilter] = React.useState<string[]>([]);
  // El Panel enlaza a ?proceso=SIN_PROCESO para abrir la bandeja «Sin proceso aún»;
  // también se acepta una lista separada por comas (SIN_PROCESO,<uuid>).
  const [processSelection, setProcessFilter] = React.useState<string[]>(() =>
    parseProcessParam(searchParams.get('proceso')),
  );
  const [bandFilter, setBandFilter] = React.useState<string[]>([]);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Request | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const loadData = React.useCallback(() => {
    return Promise.all([
      listRequests(),
      listProcesses().catch(() => [] as Process[]),
      listRequesters().catch(() => [] as Requester[]),
    ])
      .then(([reqs, procs, reqrs]) => {
        setRequests(reqs);
        setProcesses(procs);
        setRequesters(reqrs);
        setState('success');
      })
      .catch((err: unknown) => {
        setErrorMessage(messageOf(err));
        setState('error');
      });
  }, []);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const processName = React.useMemo(() => {
    const names = new Map(processes.map((p) => [p.id, p.name]));
    // null = la solicitud aún no tiene proceso (se fija en el triage);
    // un id fuera de alcance devuelve null (se pinta «—»).
    return (id: string | null): string | null => (id ? names.get(id) ?? null : null);
  }, [processes]);

  /** Texto de la celda de proceso: «Sin proceso aún» si la solicitud no lo tiene. */
  const processCell = React.useCallback(
    (r: Request): string =>
      r.mainProcessId === null ? 'Sin proceso aún' : processName(r.mainProcessId) ?? '—',
    [processName],
  );

  const processOptions = React.useMemo(() => processFilterOptions(processes), [processes]);
  // Los UUID de ?proceso= que no existen entre los procesos cargados se descartan.
  const processFilter = React.useMemo(
    () => normalizeSelection(processOptions, processSelection),
    [processOptions, processSelection],
  );

  const hasFilters =
    query.trim() !== '' ||
    stateFilter.length > 0 ||
    processFilter.length > 0 ||
    bandFilter.length > 0;
  // Y entre filtros, O dentro de cada uno. Una solicitud sin proceso (null)
  // coincide con el centinela SIN_PROCESO; con proceso, con su id.
  const filter = React.useCallback(
    (r: Request) =>
      (matchesSearch(r.title, query) || matchCode(r.code, query)) &&
      matchesAny(stateFilter, r.operationalState) &&
      matchesAny(processFilter, r.mainProcessId === null ? NO_PROCESS : r.mainProcessId) &&
      matchesAny(bandFilter, bandOf(r)),
    [query, stateFilter, processFilter, bandFilter],
  );
  const table = useClientTable({
    rows: requests,
    filter,
    comparators: COMPARATORS,
    defaultSort: DEFAULT_SORT,
    resetKey: JSON.stringify([query, stateFilter, processFilter, bandFilter]),
    pageSize: 25,
  });

  function clearFilters(): void {
    setQuery('');
    setStateFilter([]);
    setProcessFilter([]);
    setBandFilter([]);
    // «Limpiar filtros» desaparece: el foco pasa a la búsqueda (NIT 4, plan D9).
    searchRef.current?.focus();
  }

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(request: Request): void {
    setEditing(request);
    setFormError(null);
    setDialogOpen(true);
  }

  function rowActions(r: Request): RowAction[] {
    const id = encodeURIComponent(r.id);
    const actions: RowAction[] = [
      {
        key: 'detail',
        label: 'Ver detalle',
        href: `/demanda/solicitudes/${id}`,
        placement: 'menu',
      },
      { key: 'edit', label: 'Editar ficha', onSelect: () => openEdit(r), placement: 'menu' },
    ];
    // Una solicitud comprometida ya es una iniciativa: su avance está en Portafolio
    // (se llega con la búsqueda por título precargada).
    if (allowedModules.has('portfolio') && isCommitted(r)) {
      actions.push({
        key: 'portfolio',
        label: 'Ver en Portafolio',
        href: `/seguimiento/portafolio?q=${encodeURIComponent(r.title)}`,
        placement: 'menu',
      });
    }
    if (allowedModules.has('triage') && isTriageable(r)) {
      actions.push({
        key: 'triage',
        label: 'Ir a triage',
        href: `/demanda/triage?requestId=${id}`,
        placement: 'menu',
      });
    }
    if (allowedModules.has('priority') && isPrioritizable(r)) {
      actions.push({
        key: 'priority',
        label: 'Ir a priorización',
        href: `/demanda/priorizacion?requestId=${id}`,
        placement: 'menu',
      });
    }
    if (allowedModules.has('plan') && isPlannable(r)) {
      actions.push({
        key: 'plan',
        label: 'Ir a planificación',
        href: `/seguimiento/plan?requestId=${id}`,
        placement: 'menu',
      });
    }
    // Controles lista todas las solicitudes del alcance: sin predicado.
    if (allowedModules.has('frameworks')) {
      actions.push({
        key: 'frameworks',
        label: 'Ir a controles de gobierno',
        href: `/administracion/frameworks?requestId=${id}`,
        placement: 'menu',
      });
    }
    // Eliminar: el backend valida rol (jefe/líder), alcance y estado.
    if (allowedModules.has('triage')) {
      actions.push({
        key: 'delete',
        label: 'Eliminar',
        onSelect: () => setToDelete(r),
        placement: 'menu',
      });
    }
    return actions;
  }

  async function handleDelete(): Promise<void> {
    if (!toDelete) return;
    try {
      await deleteRequest(toDelete.id);
      toast.success('Solicitud eliminada.');
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setToDelete(null);
    }
  }

  async function handleSubmit(values: SolicitudFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateRequest(editing.id, {
          title: values.title,
          requesterId: values.requesterId || undefined,
          functionalOwner: trimOrUndefined(values.functionalOwner),
          expectedResult: trimOrUndefined(values.expectedResult),
          targetDate: toIso(values.targetDate),
          changeJustification: trimOrUndefined(values.changeJustification),
        });
        toast.success('Solicitud actualizada.');
      } else {
        const created = await createRequest({
          // El proceso principal NO se envía al registrar: se fija en el triage.
          title: values.title,
          requesterId: values.requesterId || undefined,
          functionalOwner: trimOrUndefined(values.functionalOwner),
          expectedResult: trimOrUndefined(values.expectedResult),
          targetDate: toIso(values.targetDate),
        });
        const triageHref = `/demanda/triage?requestId=${encodeURIComponent(created.id)}`;
        toast.success(
          'Solicitud registrada.',
          allowedModules.has('triage')
            ? { action: { label: 'Ir a triage', onClick: () => router.push(triageHref) } }
            : undefined,
        );
      }
      // Reset solo en el camino de éxito (AC-031).
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      // Fallo: conserva el diálogo abierto y los valores (AC-031).
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (table.total === 0) viewState = 'empty';
  else if (table.filtered === 0) viewState = 'no-results';
  else viewState = 'ready';

  return (
    <PageLayout>
      <PageHeader
        title="Solicitudes"
        description={
          <>
            Bandeja de entrada y gestión de solicitudes. El avance de lo comprometido está en{' '}
            {allowedModules.has('portfolio') ? (
              <Link
                href="/seguimiento/portafolio"
                className="rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Portafolio
              </Link>
            ) : (
              'Portafolio'
            )}
            .
          </>
        }
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" />
            Nueva solicitud
          </Button>
        }
      />

      <Toolbar
        label="Filtros de solicitudes"
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
          id="sol-buscar"
          placeholder="Título o ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <MultiSelectFilter
          id="sol-filtro-estado"
          label="Estado"
          options={STATE_OPTIONS}
          selected={stateFilter}
          onChange={setStateFilter}
          className="sm:w-44"
        />
        <MultiSelectFilter
          id="sol-filtro-proceso"
          label="Proceso"
          options={processOptions}
          selected={processFilter}
          onChange={setProcessFilter}
          className="sm:w-44"
        />
        <MultiSelectFilter
          id="sol-filtro-banda"
          label="Prioridad"
          options={BAND_FILTER_OPTIONS}
          selected={bandFilter}
          onChange={setBandFilter}
          placeholder="Todas"
          gender="f"
          className="sm:w-40"
        />
      </Toolbar>

      <PriorityLegend />

      <DataView
        state={viewState}
        loading={{ rows: 8, columns: 8 }}
        mobileCards
        error={{
          title: 'No fue posible cargar las solicitudes.',
          message: errorMessage,
          onRetry: () => void load(),
        }}
        empty={{
          icon: Inbox,
          title: 'Aún no hay solicitudes.',
          description: 'Registra la primera para iniciar el triage y la priorización.',
          action: (
            <Button type="button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nueva solicitud
            </Button>
          ),
        }}
      >
        <div className="hidden md:block">
        <Table scrollLabel="Tabla de solicitudes">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">ID</TableHead>
              <SortableTableHead
                label="Título"
                sortKey="title"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Proceso</TableHead>
              <SortableTableHead
                label="Estado"
                sortKey="state"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Decisión de triage</TableHead>
              <SortableTableHead
                label="Prioridad"
                sortKey="priority"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead
                label="Registro"
                sortKey="registered"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.pageRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <IdChip code={r.code} />
                </TableCell>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle onOpen={() => openEdit(r)}>{r.title}</CellTitle>
                </TableCell>
                <TableCell className="min-w-32 text-muted-foreground">
                  {processCell(r)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="request" value={r.operationalState} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.currentTriageDecision ? (
                    <StatusBadge kind="triage" value={r.currentTriageDecision} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <PriorityBadge variant="compact" score={r.currentScore} label={r.priorityLabel} />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDate(r.registeredAt)}
                </TableCell>
                <RowActionsCell>
                  <RowActions rowLabel={r.title} actions={rowActions(r)} />
                </RowActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <DataCardList
          label="Solicitudes"
          rows={table.pageRows}
          getKey={(r) => r.id}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'title', label: 'Título' },
              { key: 'state', label: 'Estado' },
              { key: 'priority', label: 'Prioridad' },
              { key: 'registered', label: 'Registro' },
            ],
          }}
          card={(r) => ({
            title: (
              <CellTitle touch onOpen={() => openEdit(r)}>
                {r.title}
              </CellTitle>
            ),
            subtitle: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <IdChip code={r.code} />
                {processCell(r)}
              </span>
            ),
            badges: [
              <StatusBadge key="state" kind="request" value={r.operationalState} />,
              r.currentTriageDecision ? (
                <StatusBadge key="triage" kind="triage" value={r.currentTriageDecision} />
              ) : null,
              <PriorityBadge
                key="priority"
                variant="compact"
                score={r.currentScore}
                label={r.priorityLabel}
              />,
            ],
            meta: [{ label: 'Registro', value: formatDate(r.registeredAt) }],
            actions: <RowActions menuOnly rowLabel={r.title} actions={rowActions(r)} />,
          })}
        />
        <DataTablePagination
          id="sol-paginacion"
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

      <SolicitudFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        requesters={requesters}
        onRequesterCreated={(r) => setRequesters((prev) => [...prev, r])}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={`¿Eliminar la solicitud ${toDelete?.code ?? ''} «${toDelete?.title ?? ''}»?`}
        description="La solicitud dejará de mostrarse en el portal. Se conserva su historial para trazabilidad."
        confirmLabel="Eliminar solicitud"
        onConfirm={handleDelete}
      />
    </PageLayout>
  );
}
