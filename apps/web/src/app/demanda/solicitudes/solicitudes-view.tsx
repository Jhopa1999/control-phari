'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Plus } from 'lucide-react';
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
import { PriorityBadge, PriorityLegend, StatusBadge } from '@/components/status-badge';
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
import type { Process, Request } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { formatDate } from '@/lib/format';
import {
  RequestError,
  createRequest,
  listRequests,
  updateRequest,
} from '@/lib/requests';
import {
  REQUEST_STATE_LABELS,
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

/** Centinela de «Todos» / «Todas» en los filtros. */
const ALL = 'ALL';
/** Valor del filtro de prioridad para las solicitudes sin banda. */
const NO_BAND = 'SIN_PRIORIZAR';
const BAND_OPTIONS = ['P1', 'P2', 'P3', 'P4'] as const;
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
  const { allowedModules } = useActor();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState(ALL);
  const [processFilter, setProcessFilter] = React.useState(ALL);
  const [bandFilter, setBandFilter] = React.useState(ALL);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Request | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [reqs, procs] = await Promise.all([
        listRequests(),
        listProcesses().catch(() => [] as Process[]),
      ]);
      setRequests(reqs);
      setProcesses(procs);
      setState('success');
    } catch (err) {
      setErrorMessage(messageOf(err));
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const processName = React.useMemo(() => {
    const names = new Map(processes.map((p) => [p.id, p.name]));
    return (id: string): string | null => names.get(id) ?? null;
  }, [processes]);

  const hasFilters =
    query.trim() !== '' || stateFilter !== ALL || processFilter !== ALL || bandFilter !== ALL;
  const filter = React.useCallback(
    (r: Request) =>
      matchesSearch(r.title, query) &&
      (stateFilter === ALL || r.operationalState === stateFilter) &&
      (processFilter === ALL || r.mainProcessId === processFilter) &&
      (bandFilter === ALL || bandOf(r) === bandFilter),
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
    setStateFilter(ALL);
    setProcessFilter(ALL);
    setBandFilter(ALL);
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
    return actions;
  }

  async function handleSubmit(values: SolicitudFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateRequest(editing.id, {
          title: values.title,
          participantProcessIds: values.participantProcessIds,
          requesterArea: trimOrUndefined(values.requesterArea),
          requesterName: trimOrUndefined(values.requesterName),
          functionalOwner: trimOrUndefined(values.functionalOwner),
          expectedResult: trimOrUndefined(values.expectedResult),
          targetDate: toIso(values.targetDate),
          referenceUrl: trimOrUndefined(values.referenceUrl),
          changeJustification: trimOrUndefined(values.changeJustification),
        });
        toast.success('Solicitud actualizada.');
      } else {
        const created = await createRequest({
          title: values.title,
          mainProcessId: values.mainProcessId,
          participantProcessIds: values.participantProcessIds,
          requesterArea: trimOrUndefined(values.requesterArea),
          requesterName: trimOrUndefined(values.requesterName),
          functionalOwner: trimOrUndefined(values.functionalOwner),
          expectedResult: trimOrUndefined(values.expectedResult),
          targetDate: toIso(values.targetDate),
          referenceUrl: trimOrUndefined(values.referenceUrl),
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
        description="Registra y actualiza las solicitudes de demanda de tu alcance."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" />
            Nueva solicitud
          </Button>
        }
      />

      <Toolbar
        label="Filtros de solicitudes"
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
          placeholder="Título de la solicitud"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="sol-filtro-estado">Estado</Label>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger id="sol-filtro-estado" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {REQUEST_STATES.map((value) => (
                <SelectItem key={value} value={value}>
                  {REQUEST_STATE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="sol-filtro-proceso">Proceso</Label>
          <Select value={processFilter} onValueChange={setProcessFilter}>
            <SelectTrigger id="sol-filtro-proceso" className="w-full sm:w-44">
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
          <Label htmlFor="sol-filtro-banda">Prioridad</Label>
          <Select value={bandFilter} onValueChange={setBandFilter}>
            <SelectTrigger id="sol-filtro-banda" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {BAND_OPTIONS.map((band) => (
                <SelectItem key={band} value={band}>
                  {band}
                </SelectItem>
              ))}
              <SelectItem value={NO_BAND}>Sin priorizar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <PriorityLegend />

      <DataView
        state={viewState}
        loading={{ rows: 8, columns: 7 }}
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
        <Table scrollLabel="Tabla de solicitudes">
          <TableHeader>
            <TableRow>
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
              <TableHead>Triage</TableHead>
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
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle onOpen={() => openEdit(r)}>{r.title}</CellTitle>
                </TableCell>
                <TableCell className="min-w-32 text-muted-foreground">
                  {processName(r.mainProcessId) ?? '—'}
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
        processes={processes}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
