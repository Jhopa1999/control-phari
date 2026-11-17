'use client';

import * as React from 'react';
import { Database, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { StatusBadge } from '@/components/status-badge';
import { SearchInput, Toolbar } from '@/components/toolbar';
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
import type {
  Asset,
  AssetStatus,
  CoordinationPerson,
  Process,
  Request,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import {
  AssetError,
  changeAssetStatus,
  createAsset,
  listAssetsPage,
  updateAsset,
  type AssetSortKey,
} from '@/lib/assets';
import { getStatus } from '@/lib/status-presentation';
import type { SortState } from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useDebouncedValue, useServerTable } from '@/lib/use-server-table';
import { ServerListBody } from '@/components/server-list';
import { ProcessRefCell, RefMissing, RequestRefCell } from '@/components/reference-cell';
import { listCoordinationPeople } from '@/lib/worklog';
import { listRequests } from '@/lib/requests';
import { ActivoFormDialog, type ActivoFormValues } from './activo-form-dialog';

/** Columnas ordenables en el servidor (lista blanca); «Proceso» ya no ordena. */
type SortKey = AssetSortKey;

/** Centinela de «Todos» / «Todas» en los filtros. */
const ALL = '__all__';
const NOUN = { one: 'activo', other: 'activos' };
/** Estados en el orden del ciclo de vida. */
const ASSET_STATES = ['BORRADOR', 'ACTIVO', 'RETIRADO'] as const;
/** Orden por defecto: Nombre ascendente (design §11.16). */
const DEFAULT_SORT: SortState<SortKey> = { key: 'name', direction: 'asc' };

function messageOf(err: unknown): string {
  return err instanceof AssetError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Transición disponible desde el estado actual (como hoy, §4.1). */
function transitionOf(status: string): { label: string; target: AssetStatus } | null {
  if (status === 'BORRADOR') return { label: 'Activar', target: 'ACTIVO' };
  if (status === 'ACTIVO') return { label: 'Retirar', target: 'RETIRADO' };
  if (status === 'RETIRADO') return { label: 'Recuperar', target: 'ACTIVO' };
  return null;
}

/**
 * Activos (design §11.16, patrón A): inventario con búsqueda (nombre), filtros,
 * orden y paginación EN EL SERVIDOR sobre GET /assets (oleada 3, PR-B); cada
 * fila trae el nombre del proceso, el responsable y la solicitud de origen. El nombre es texto; las acciones
 * («Editar» y la transición permitida) van en línea.
 */
export function ActivosView(): React.ReactElement {
  const { permissions } = useActor();

  // Gating cosmético (el control real es del servidor): puede cambiar estado
  // el jefe de área o el líder del proceso del activo.
  const isJefe = React.useMemo(
    () => (permissions?.grants ?? []).some((g) => g.roleCode === 'JEFE_AREA'),
    [permissions],
  );
  // Gobernanza: solo el jefe de área crea/edita/cambia estado de un activo. El
  // control real es del servidor (403); aquí es gating cosmético.
  const canChangeStatus = React.useCallback(() => isJefe, [isJefe]);

  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [owners, setOwners] = React.useState<CoordinationPerson[]>([]);

  // Búsqueda y filtros: se aplican en el servidor.
  const [query, setQuery] = React.useState('');
  const [processFilter, setProcessFilter] = React.useState<string>(ALL);
  const [requestFilter, setRequestFilter] = React.useState<string>(ALL);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Diálogo de alta y edición.
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Asset | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = React.useState<string | null>(null);

  // Maestras del formulario y de los filtros; si fallan, se degradan a vacío.
  React.useEffect(() => {
    void listProcesses()
      .then(setProcesses)
      .catch(() => setProcesses([]));
    void listRequests()
      .then(setRequests)
      .catch(() => setRequests([]));
    void listCoordinationPeople()
      .then(setOwners)
      .catch(() => setOwners([]));
  }, []);

  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const hasFilters =
    debouncedQuery !== '' || processFilter !== ALL || requestFilter !== ALL || statusFilter !== ALL;
  const showClear = hasFilters || query.trim() !== '';
  const fetchPage = React.useCallback(
    ({ page, pageSize, sort, signal }: { page: number; pageSize: number; sort: SortState<SortKey> | null; signal: AbortSignal }) =>
      listAssetsPage(
        {
          q: debouncedQuery,
          processId: processFilter === ALL ? undefined : processFilter,
          requestId: requestFilter === ALL ? undefined : requestFilter,
          status: statusFilter === ALL ? undefined : statusFilter,
          sort: sort?.key,
          dir: sort?.direction,
          page,
          pageSize,
        },
        signal,
      ),
    [debouncedQuery, processFilter, requestFilter, statusFilter],
  );
  const table = useServerTable<Asset, SortKey>({
    fetchPage,
    filtersKey: JSON.stringify([debouncedQuery, processFilter, requestFilter, statusFilter]),
    defaultSort: DEFAULT_SORT,
  });
  const listRef = React.useRef<HTMLDivElement>(null);
  const load = table.reload;

  function clearFilters(): void {
    setQuery('');
    setProcessFilter(ALL);
    setRequestFilter(ALL);
    setStatusFilter(ALL);
    // «Limpiar filtros» desaparece: el foco pasa a la búsqueda (NIT 4, plan D9).
    searchRef.current?.focus();
  }

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setOpen(true);
  }
  function openEdit(asset: Asset): void {
    setEditing(asset);
    setFormError(null);
    setOpen(true);
  }

  async function handleSubmit(values: ActivoFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateAsset(editing.id, {
          name: values.name.trim(),
          // Vacío en los Selects opcionales = desligar (null); undefined omite.
          requestId: trimOrUndefined(values.requestId) ?? null,
          ownerUserId: trimOrUndefined(values.ownerUserId) ?? null,
          documentationRef: trimOrUndefined(values.documentationRef),
          generalDescription: trimOrUndefined(values.generalDescription),
          dependencies: trimOrUndefined(values.dependencies),
          visibleProcessIds: values.visibleProcessIds,
        });
        toast.success('Activo actualizado.');
      } else {
        await createAsset({
          processId: values.processId,
          name: values.name.trim(),
          requestId: trimOrUndefined(values.requestId),
          ownerUserId: trimOrUndefined(values.ownerUserId),
          documentationRef: trimOrUndefined(values.documentationRef),
          generalDescription: trimOrUndefined(values.generalDescription),
          dependencies: trimOrUndefined(values.dependencies),
          visibleProcessIds: values.visibleProcessIds,
        });
        toast.success('Activo creado.');
      }
      // Reset solo en el camino de éxito (AC-031).
      setOpen(false);
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

  async function handleStatus(asset: Asset, targetStatus: AssetStatus): Promise<void> {
    setStatusBusyId(asset.id);
    try {
      await changeAssetStatus(asset.id, { targetStatus });
      toast.success(`Activo movido a ${getStatus('asset', targetStatus).label}.`);
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setStatusBusyId(null);
    }
  }

  function rowActions(asset: Asset): RowAction[] {
    const actions: RowAction[] = [
      {
        key: 'history',
        label: 'Ver historial',
        href: `/activos/catalogo/${asset.id}/historial`,
        placement: 'menu',
      },
    ];
    // Editar: solo el jefe de área (gobernanza; el control real es del servidor).
    if (isJefe) {
      actions.unshift({
        key: 'edit',
        label: 'Editar',
        onSelect: () => openEdit(asset),
        placement: 'inline',
      });
    }
    const transition = canChangeStatus() ? transitionOf(asset.status) : null;
    if (transition) {
      actions.push({
        key: 'status',
        label: transition.label,
        placement: 'inline',
        busy: statusBusyId === asset.id,
        busyLabel: transition.label,
        onSelect: () => void handleStatus(asset, transition.target),
      });
    }
    return actions;
  }

  // Una recarga con filas visibles sigue en 'ready': la tabla no parpadea a vacío.
  let viewState: DataViewState;
  if (table.status === 'loading') viewState = 'loading';
  else if (table.status === 'error') viewState = 'error';
  else if (table.total === 0 && table.status === 'ready') viewState = hasFilters ? 'no-results' : 'empty';
  else viewState = 'ready';

  return (
    <PageLayout>
      <PageHeader
        title="Activos"
        description="Activos de datos y soluciones de cada proceso."
        actions={
          isJefe ? (
            <Button type="button" onClick={openCreate} disabled={table.status === 'loading'}>
              <Plus aria-hidden="true" />
              Nuevo activo
            </Button>
          ) : null
        }
      />

      <Toolbar
        label="Filtros de activos"
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
          id="filtro-busqueda"
          placeholder="Nombre del activo"
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query !== '') setQuery('');
          }}
        />
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="filtro-proceso">Proceso</Label>
          <Select value={processFilter} onValueChange={setProcessFilter}>
            <SelectTrigger id="filtro-proceso" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {processes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="filtro-solicitud">Solicitud</Label>
          <Select value={requestFilter} onValueChange={setRequestFilter}>
            <SelectTrigger id="filtro-solicitud" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {requests.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.code} · {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="filtro-estado">Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="filtro-estado" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {ASSET_STATES.map((value) => (
                <SelectItem key={value} value={value}>
                  {getStatus('asset', value).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <DataView
        state={viewState}
        loading={{ rows: 6, columns: 6 }}
        mobileCards
        error={{
          title: 'No fue posible cargar los activos.',
          message: messageOf(table.error),
          onRetry: () => void load(),
        }}
        noResults={{
          title: 'Sin resultados',
          description: 'Ningún activo coincide con la búsqueda o los filtros.',
        }}
        empty={{
          icon: Database,
          title: 'Aún no hay activos registrados.',
          description: 'Registra el primer activo de un proceso para documentarlo y seguir su estado.',
          action: isJefe ? (
            <Button type="button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nuevo activo
            </Button>
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
        <Table scrollLabel="Tabla de activos">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Nombre"
                sortKey="name"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Proceso</TableHead>
              <TableHead>Solicitud</TableHead>
              <TableHead>Responsable</TableHead>
              <SortableTableHead
                label="Estado"
                sortKey="status"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle>{asset.name}</CellTitle>
                </TableCell>
                <TableCell className="min-w-40 max-w-[18rem]">
                  <ProcessRefCell
                    name={asset.processName}
                    code={asset.processCode}
                    missingLabel="Sin proceso"
                  />
                </TableCell>
                <TableCell className="min-w-40 max-w-[18rem]">
                  <RequestRefCell
                    code={asset.requestCode}
                    title={asset.requestTitle}
                    unavailable={asset.requestId !== null}
                    missingLabel="Sin solicitud de origen"
                  />
                </TableCell>
                <TableCell className="min-w-32 max-w-[18rem]">
                  {asset.ownerName ? (
                    <span className="line-clamp-1" title={asset.ownerName}>
                      {asset.ownerName}
                    </span>
                  ) : (
                    <RefMissing label="Sin responsable" />
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="asset" value={asset.status} />
                </TableCell>
                <RowActionsCell>
                  <RowActions rowLabel={asset.name} actions={rowActions(asset)} />
                </RowActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <DataCardList
          label="Activos"
          rows={table.rows}
          getKey={(asset) => asset.id}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'name', label: 'Nombre' },
              { key: 'status', label: 'Estado' },
            ],
          }}
          card={(asset) => ({
            title: <CellTitle touch>{asset.name}</CellTitle>,
            subtitle: [asset.processName, asset.processCode].filter(Boolean).join(' · '),
            badges: [<StatusBadge key="status" kind="asset" value={asset.status} />],
            meta: [
              {
                label: 'Solicitud',
                value: (
                  <RequestRefCell
                    code={asset.requestCode}
                    title={asset.requestTitle}
                    unavailable={asset.requestId !== null}
                    missingLabel="Sin solicitud de origen"
                  />
                ),
              },
              {
                label: 'Responsable',
                value: asset.ownerName ?? <RefMissing label="Sin responsable" />,
              },
            ],
            actions: <RowActions menuOnly rowLabel={asset.name} actions={rowActions(asset)} />,
          })}
        />
        <DataTablePagination
          id="activos-paginacion"
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

      <ActivoFormDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        processes={processes}
        requests={requests}
        owners={owners}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
