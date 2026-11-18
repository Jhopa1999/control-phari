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
  parseProcessParam,
  processFilterOptions,
  stateFilterOptions,
} from '@/lib/filter-options';
import { formatDate } from '@/lib/format';
import { normalizeSelection } from '@/lib/multi-filter';
import { listRequesters } from '@/lib/requesters';
import {
  RequestError,
  createRequest,
  deleteRequest,
  listRequestsPage,
  updateRequest,
  type RequestSortKey,
} from '@/lib/requests';
import {
  isCommitted,
  isPlannable,
  editPolicy,
  isPrioritizable,
  isTriageable,
  requestActorFrom,
} from '@/lib/request-state';
import type { SortState } from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useDebouncedValue, useServerTable } from '@/lib/use-server-table';
import { ServerListBody } from '@/components/server-list';
import { ProcessRefCell, RefMissing } from '@/components/reference-cell';
import {
  SolicitudFormDialog,
  type SolicitudFormValues,
} from './solicitud-form-dialog';
import { solicitudUpdatePayload, toIso, trimOrUndefined } from './solicitud-payload';

type SortKey = 'code' | 'title' | 'state' | 'priority' | 'registered';

/** Opciones del filtro de estado, agrupadas por fase del flujo. */
const STATE_OPTIONS = stateFilterOptions();
const NOUN = { one: 'solicitud', other: 'solicitudes' };

/** Registro descendente: las más recientes primero. */
const DEFAULT_SORT: SortState<SortKey> = { key: 'registered', direction: 'desc' };
/** Columna de la vista → columna de orden del servidor (lista blanca de la API). */
const SERVER_SORT: Record<SortKey, RequestSortKey> = {
  code: 'code',
  title: 'title',
  state: 'state',
  // Por score; las solicitudes sin score quedan al final en las dos direcciones.
  priority: 'score',
  registered: 'registeredAt',
};

function messageOf(err: unknown): string {
  return err instanceof RequestError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Solicitudes (design §11.5, patrón A): listado con búsqueda, filtros, orden y
 * paginación EN EL SERVIDOR sobre GET /requests (oleada 3, PR-B). El título
 * abre la ficha; el menú «Más acciones» lleva a cada fase solo si el módulo
 * está permitido y la solicitud cumple el predicado del destino.
 */
export function SolicitudesView(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allowedModules, permissions } = useActor();
  const requestActor = React.useMemo(() => requestActorFrom(permissions), [permissions]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requesters, setRequesters] = React.useState<Requester[]>([]);
  const [toDelete, setToDelete] = React.useState<Request | null>(null);

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

  // Maestras para los filtros y el formulario; si fallan, se degradan a vacío.
  React.useEffect(() => {
    void listProcesses()
      .then(setProcesses)
      .catch(() => setProcesses([]));
    void listRequesters()
      .then(setRequesters)
      .catch(() => setRequesters([]));
  }, []);

  const processOptions = React.useMemo(() => processFilterOptions(processes), [processes]);
  // Los UUID de ?proceso= que no existen entre los procesos cargados se
  // descartan (parseProcessParam ya solo admite SIN_PROCESO y UUID). Mientras
  // los procesos no llegan, la selección viaja tal cual: el servidor la
  // intersecta con el alcance.
  const processFilter = React.useMemo(
    () =>
      processes.length === 0
        ? processSelection
        : normalizeSelection(processOptions, processSelection),
    [processes.length, processOptions, processSelection],
  );

  // La búsqueda viaja al servidor 300 ms después de la última tecla.
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const hasFilters =
    debouncedQuery !== '' ||
    stateFilter.length > 0 ||
    processFilter.length > 0 ||
    bandFilter.length > 0;
  const fetchPage = React.useCallback(
    ({ page, pageSize, sort, signal }: { page: number; pageSize: number; sort: SortState<SortKey> | null; signal: AbortSignal }) =>
      listRequestsPage(
        {
          q: debouncedQuery,
          state: stateFilter,
          // Y entre filtros, O dentro de cada uno; SIN_PROCESO = sin proceso aún.
          mainProcessId: processFilter,
          // «Sin priorizar» (NO_BAND) ya es el literal SIN_PRIORIZAR de la API.
          band: bandFilter,
          sort: sort ? SERVER_SORT[sort.key] : undefined,
          dir: sort?.direction,
          page,
          pageSize,
        },
        signal,
      ),
    [debouncedQuery, stateFilter, processFilter, bandFilter],
  );
  const table = useServerTable<Request, SortKey>({
    fetchPage,
    filtersKey: JSON.stringify([debouncedQuery, stateFilter, processFilter, bandFilter]),
    defaultSort: DEFAULT_SORT,
  });
  const listRef = React.useRef<HTMLDivElement>(null);
  const load = table.reload;

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

  /** El título abre la edición si el actor puede editar; si no, la ficha de solo lectura. */
  function openTitle(request: Request): void {
    if (editPolicy(requestActor, request).allowed) openEdit(request);
    else router.push(`/demanda/solicitudes/${encodeURIComponent(request.id)}`);
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
      {
        key: 'edit',
        label: 'Editar ficha',
        onSelect: () => openEdit(r),
        placement: 'menu',
        // La API decide (403); aquí solo se anticipa y se explica el motivo.
        disabled: !editPolicy(requestActor, r).allowed,
        disabledReason: editPolicy(requestActor, r).reason ?? undefined,
      },
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
        await updateRequest(editing.id, solicitudUpdatePayload(values));
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

  // Una recarga con filas visibles sigue en 'ready': la tabla no parpadea a
  // vacío (docs/design/oleada-3-listados.md §5.4).
  let viewState: DataViewState;
  if (table.status === 'loading') viewState = 'loading';
  else if (table.status === 'error') viewState = 'error';
  else if (table.total === 0 && table.status === 'ready') viewState = hasFilters ? 'no-results' : 'empty';
  else viewState = 'ready';
  const showClear = hasFilters || query.trim() !== '';

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
            {table.status !== 'error' ? (
              <ResultCount
                loading={table.busy}
                spinner
                total={table.total}
                filtered={table.total}
                noun={NOUN}
              />
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
          id="sol-buscar"
          placeholder="Código, título o solicitante"
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
          message: messageOf(table.error),
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
        noResults={{
          title: 'Sin resultados',
          description: 'Ninguna solicitud coincide con la búsqueda o los filtros.',
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
        <Table scrollLabel="Tabla de solicitudes">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="ID"
                sortKey="code"
                sort={table.sort}
                onSort={table.toggleSort}
                className="w-28"
              />
              <SortableTableHead
                label="Título"
                sortKey="title"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Proceso</TableHead>
              <TableHead>Activo</TableHead>
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
            {table.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <IdChip code={r.code} />
                </TableCell>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle onOpen={() => openTitle(r)}>{r.title}</CellTitle>
                </TableCell>
                <TableCell className="min-w-32 max-w-[14rem]">
                  <ProcessRefCell
                    name={r.mainProcessName}
                    code={r.mainProcessCode}
                    missingLabel="Sin proceso aún"
                    missingVisible={r.mainProcessId === null}
                  />
                </TableCell>
                <TableCell className="min-w-32 max-w-[14rem]">
                  {r.assetName ? (
                    <span className="line-clamp-1" title={r.assetName}>
                      {r.assetName}
                    </span>
                  ) : (
                    <RefMissing label="Sin activo" />
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="request" value={r.operationalState} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.currentTriageDecision ? (
                    <StatusBadge kind="triage" value={r.currentTriageDecision} />
                  ) : (
                    <RefMissing label="Sin decisión" />
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
          rows={table.rows}
          getKey={(r) => r.id}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'code', label: 'ID' },
              { key: 'title', label: 'Título' },
              { key: 'state', label: 'Estado' },
              { key: 'priority', label: 'Prioridad' },
              { key: 'registered', label: 'Registro' },
            ],
          }}
          card={(r) => ({
            title: (
              <CellTitle touch onOpen={() => openTitle(r)}>
                {r.title}
              </CellTitle>
            ),
            subtitle: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <IdChip code={r.code} />
                {r.mainProcessName
                  ? [r.mainProcessName, r.mainProcessCode].filter(Boolean).join(' · ')
                  : 'Sin proceso aún'}
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
            meta: [
              ...(r.assetName ? [{ label: 'Activo', value: r.assetName }] : []),
              { label: 'Registro', value: formatDate(r.registeredAt) },
            ],
            actions: <RowActions menuOnly rowLabel={r.title} actions={rowActions(r)} />,
          })}
        />
        <DataTablePagination
          id="sol-paginacion"
          page={table.page}
          pageCount={table.pageCount}
          from={table.from}
          to={table.to}
          filtered={table.total}
          pageSize={table.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun={NOUN}
          showingPrefix
          busy={table.busy}
          fallbackFocusRef={listRef}
        />
        </ServerListBody>
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
