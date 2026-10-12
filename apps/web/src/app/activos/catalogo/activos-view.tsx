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
  CatalogItem,
  CoordinationPerson,
  Process,
  Request,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import {
  AssetError,
  changeAssetStatus,
  createAsset,
  listAssets,
  updateAsset,
} from '@/lib/assets';
import { listCatalogItems } from '@/lib/catalog';
import { getStatus } from '@/lib/status-presentation';
import {
  compareByOrder,
  compareText,
  matchesSearch,
  type Comparator,
  type SortState,
} from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useClientTable } from '@/lib/use-client-table';
import { listCoordinationPeople } from '@/lib/worklog';
import { listRequests } from '@/lib/requests';
import { ActivoFormDialog, type ActivoFormValues } from './activo-form-dialog';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'name' | 'process' | 'status';

/** Centinela de «Todos» / «Todas» en los filtros. */
const ALL = '__all__';
const NOUN = { one: 'activo', other: 'activos' };
/** Estados en el orden del ciclo de vida. */
const ASSET_STATES = ['BORRADOR', 'ACTIVO', 'RETIRADO'] as const;
const compareStatus = compareByOrder(ASSET_STATES);
/** Orden por defecto: Nombre ascendente (design §11.16). */
const DEFAULT_SORT: SortState<SortKey> = { key: 'name', direction: 'asc' };
// Ids que no vienen en las listas del alcance del actor: nunca un UUID visible (§13.1).
const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_REQUEST = 'Solicitud fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';

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
 * Activos (design §11.16, patrón A): inventario con búsqueda, filtros, orden y
 * paginación en cliente sobre GET /assets. El nombre es texto; las acciones
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
  const leaderProcessIds = React.useMemo(
    () =>
      new Set(
        (permissions?.grants ?? [])
          .filter((g) => g.roleCode === 'LIDER_PROCESO')
          .map((g) => g.processId),
      ),
    [permissions],
  );
  const canChangeStatus = React.useCallback(
    (asset: Asset) => isJefe || leaderProcessIds.has(asset.processId),
    [isJefe, leaderProcessIds],
  );

  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [owners, setOwners] = React.useState<CoordinationPerson[]>([]);
  const [typeOptions, setTypeOptions] = React.useState<CatalogItem[]>([]);
  const [technologyOptions, setTechnologyOptions] = React.useState<CatalogItem[]>([]);
  const [sourceOptions, setSourceOptions] = React.useState<CatalogItem[]>([]);
  const [frequencyOptions, setFrequencyOptions] = React.useState<CatalogItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Búsqueda y filtros en cliente (el contrato no expone parámetros de consulta).
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

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [list, procs, reqs, usrs, types, techs, sources, freqs] = await Promise.all([
        listAssets(),
        listProcesses().catch(() => [] as Process[]),
        listRequests().catch(() => [] as Request[]),
        listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
        listCatalogItems({ catalog: 'ASSET_TYPE', active: true }).catch(() => [] as CatalogItem[]),
        listCatalogItems({ catalog: 'TECHNOLOGY', active: true }).catch(() => [] as CatalogItem[]),
        listCatalogItems({ catalog: 'SOURCE', active: true }).catch(() => [] as CatalogItem[]),
        listCatalogItems({ catalog: 'FREQUENCY', active: true }).catch(() => [] as CatalogItem[]),
      ]);
      setAssets(list);
      setProcesses(procs);
      setRequests(reqs);
      setOwners(usrs);
      setTypeOptions(types);
      setTechnologyOptions(techs);
      setSourceOptions(sources);
      setFrequencyOptions(freqs);
      setState('success');
    } catch (err) {
      setErrorMessage(messageOf(err));
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS,
    [processes],
  );
  const requestTitle = React.useCallback(
    (id: string | null) =>
      id ? (requests.find((r) => r.id === id)?.title ?? OUT_OF_SCOPE_REQUEST) : '—',
    [requests],
  );
  const ownerName = React.useCallback(
    (id: string | null) =>
      id ? (owners.find((u) => u.id === id)?.name ?? OUT_OF_SCOPE_PERSON) : '—',
    [owners],
  );
  const typeLabel = React.useCallback(
    (code: string | null) =>
      code ? (typeOptions.find((o) => o.code === code)?.label ?? code) : '—',
    [typeOptions],
  );

  const comparators = React.useMemo<Record<SortKey, Comparator<Asset>>>(
    () => ({
      name: (a, b, direction) => compareText(a.name, b.name, direction),
      process: (a, b, direction) =>
        compareText(processName(a.processId), processName(b.processId), direction),
      status: (a, b, direction) => compareStatus(a.status, b.status, direction),
    }),
    [processName],
  );

  const hasFilters =
    query.trim() !== '' || processFilter !== ALL || requestFilter !== ALL || statusFilter !== ALL;
  const filter = React.useCallback(
    (a: Asset) =>
      matchesSearch(a.name, query) &&
      (processFilter === ALL || a.processId === processFilter) &&
      (requestFilter === ALL || a.requestId === requestFilter) &&
      (statusFilter === ALL || a.status === statusFilter),
    [query, processFilter, requestFilter, statusFilter],
  );
  const table = useClientTable({
    rows: assets,
    filter,
    comparators,
    defaultSort: DEFAULT_SORT,
    resetKey: JSON.stringify([query, processFilter, requestFilter, statusFilter]),
    pageSize: 25,
  });

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
          typeCode: trimOrUndefined(values.typeCode),
          technologyCode: trimOrUndefined(values.technologyCode),
          sourceCode: trimOrUndefined(values.sourceCode),
          frequencyCode: trimOrUndefined(values.frequencyCode),
          documentationRef: trimOrUndefined(values.documentationRef),
          functionalDescription: trimOrUndefined(values.functionalDescription),
          dependencies: trimOrUndefined(values.dependencies),
        });
        toast.success('Activo actualizado.');
      } else {
        await createAsset({
          processId: values.processId,
          name: values.name.trim(),
          requestId: trimOrUndefined(values.requestId),
          ownerUserId: trimOrUndefined(values.ownerUserId),
          typeCode: trimOrUndefined(values.typeCode),
          technologyCode: trimOrUndefined(values.technologyCode),
          sourceCode: trimOrUndefined(values.sourceCode),
          frequencyCode: trimOrUndefined(values.frequencyCode),
          documentationRef: trimOrUndefined(values.documentationRef),
          functionalDescription: trimOrUndefined(values.functionalDescription),
          dependencies: trimOrUndefined(values.dependencies),
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
      { key: 'edit', label: 'Editar', onSelect: () => openEdit(asset), placement: 'inline' },
    ];
    const transition = canChangeStatus(asset) ? transitionOf(asset.status) : null;
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

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (table.total === 0) viewState = 'empty';
  else if (table.filtered === 0) viewState = 'no-results';
  else viewState = 'ready';

  return (
    <PageLayout>
      <PageHeader
        title="Activos"
        description="Activos de datos y soluciones de cada proceso."
        actions={
          <Button type="button" onClick={openCreate} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nuevo activo
          </Button>
        }
      />

      <Toolbar
        label="Filtros de activos"
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
          id="filtro-busqueda"
          placeholder="Nombre del activo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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
                  {r.title}
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
        loading={{ rows: 6, columns: 7 }}
        error={{
          title: 'No fue posible cargar los activos.',
          message: errorMessage,
          onRetry: () => void load(),
        }}
        empty={{
          icon: Database,
          title: 'Aún no hay activos registrados.',
          description: 'Registra el primer activo de un proceso para documentarlo y seguir su estado.',
          action: (
            <Button type="button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nuevo activo
            </Button>
          ),
        }}
      >
        <Table scrollLabel="Tabla de activos">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Nombre"
                sortKey="name"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead
                label="Proceso"
                sortKey="process"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Solicitud</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Tipo</TableHead>
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
            {table.pageRows.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle>{asset.name}</CellTitle>
                </TableCell>
                <TableCell className="min-w-28 text-muted-foreground">
                  {processName(asset.processId)}
                </TableCell>
                <TableCell className="min-w-40 max-w-64">
                  <span className="line-clamp-2 wrap-break-word text-muted-foreground">
                    {requestTitle(asset.requestId)}
                  </span>
                </TableCell>
                <TableCell className="min-w-32 text-muted-foreground">
                  {ownerName(asset.ownerUserId)}
                </TableCell>
                <TableCell className="min-w-28 text-muted-foreground">
                  {typeLabel(asset.typeCode)}
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
        <DataTablePagination
          id="activos-paginacion"
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
        typeOptions={typeOptions}
        technologyOptions={technologyOptions}
        sourceOptions={sourceOptions}
        frequencyOptions={frequencyOptions}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
