'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import {
  DataTablePagination,
  ResultCount,
  SortableTableHead,
} from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { Field } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActionsCell } from '@/components/row-actions';
import { Toolbar } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
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
import type { AuditEvent, CoordinationPerson, Process } from '@/lib/api-client';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_OBJECT_TYPE_OPTIONS,
  AUDIT_TAKE,
  auditActionLabel,
  auditObjectLabel,
  listAuditEvents,
  type AuditObjectType,
} from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { compareDate, compareText, type Comparator, type SortState } from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useClientTable } from '@/lib/use-client-table';
import { listCoordinationPeople } from '@/lib/worklog';
import { VerCambioDialog, type AuditEventDetails } from './ver-cambio-dialog';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'createdAt' | 'action' | 'objectType';

/** Centinela de «Todos» / «Todas» en los filtros. */
const ALL = 'ALL';
const NOUN = { one: 'evento', other: 'eventos' };
/** Con el tope alcanzado, el total no es el total de la consulta (design §24.2). */
const CAPPED_NOUN = { one: 'evento más reciente', other: 'eventos más recientes' };
const DEFAULT_SORT: SortState<SortKey> = { key: 'createdAt', direction: 'desc' };
const COMPARATORS: Record<SortKey, Comparator<AuditEvent>> = {
  createdAt: (a, b, direction) => compareDate(a.createdAt, b.createdAt, direction),
  action: (a, b, direction) => compareText(auditActionLabel(a.action), auditActionLabel(b.action), direction),
  objectType: (a, b, direction) =>
    compareText(auditObjectLabel(a.objectType), auditObjectLabel(b.objectType), direction),
};
const ACTION_OPTIONS = Object.keys(AUDIT_ACTION_LABELS);

function isObjectType(value: string): value is AuditObjectType {
  return (AUDIT_OBJECT_TYPE_OPTIONS as readonly string[]).includes(value);
}

/**
 * Auditoría (design §11.19 y §24.2, patrón A). «Objeto» es un filtro de
 * servidor: al cambiarlo se vuelve a pedir la lista con objectType, así el tope
 * de 500 se calcula sobre la consulta ya filtrada. «Acción» solo acota lo que
 * se muestra, porque el servidor no lo admite.
 */
export function AuditoriaView(): React.ReactElement {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [objectFilter, setObjectFilter] = React.useState<AuditObjectType | typeof ALL>(ALL);
  const [actionFilter, setActionFilter] = React.useState(ALL);
  const [selected, setSelected] = React.useState<AuditEvent | null>(null);
  const objectFilterRef = React.useRef<HTMLButtonElement>(null);

  const load = React.useCallback(async (objectType: AuditObjectType | typeof ALL) => {
    setState('loading');
    try {
      // Procesos y personas solo dan nombres legibles: si fallan, no bloquean la auditoría.
      const [ev, procs, persons] = await Promise.all([
        listAuditEvents(objectType === ALL ? {} : { objectType }),
        listProcesses().catch(() => [] as Process[]),
        listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
      ]);
      setEvents(ev);
      setProcesses(procs);
      setPeople(persons);
      setState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : null);
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load(ALL);
  }, [load]);

  const processById = React.useMemo(() => new Map(processes.map((p) => [p.id, p])), [processes]);
  const personById = React.useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  function processLabel(id: string | null): string {
    if (!id) return '—';
    const process = processById.get(id);
    return process ? `${process.name} (${process.code})` : 'Proceso fuera de tu alcance';
  }

  function detailsOf(event: AuditEvent): AuditEventDetails {
    return {
      actorName: event.actorUserId ? (personById.get(event.actorUserId) ?? null) : null,
      process: processLabel(event.scopeProcessId),
    };
  }

  const capped = events.length === AUDIT_TAKE;
  const noun = capped ? CAPPED_NOUN : NOUN;
  const hasFilters = objectFilter !== ALL || actionFilter !== ALL;
  const filter = React.useCallback(
    (event: AuditEvent) => actionFilter === ALL || event.action === actionFilter,
    [actionFilter],
  );
  const table = useClientTable({
    rows: events,
    filter,
    comparators: COMPARATORS,
    defaultSort: DEFAULT_SORT,
    resetKey: JSON.stringify([objectFilter, actionFilter]),
    pageSize: 25,
  });

  function handleObjectChange(value: string): void {
    const next = isObjectType(value) ? value : ALL;
    setObjectFilter(next);
    void load(next);
  }

  function clearFilters(): void {
    const reload = objectFilter !== ALL;
    setObjectFilter(ALL);
    setActionFilter(ALL);
    if (reload) void load(ALL);
    // «Limpiar filtros» desaparece: el foco pasa al filtro Objeto (NIT 4, plan D9).
    objectFilterRef.current?.focus();
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (table.total === 0 && !hasFilters) viewState = 'empty';
  else if (table.filtered === 0) viewState = 'no-results';
  else viewState = 'ready';

  return (
    <PageLayout>
      <PageHeader title="Auditoría" description="Cambios registrados dentro de tu alcance." />

      <Toolbar
        label="Filtros de auditoría"
        end={
          <>
            {state !== 'error' ? (
              <ResultCount
                loading={state === 'loading'}
                total={table.total}
                filtered={table.filtered}
                noun={noun}
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
        <Field
          id="aud-filtro-objeto"
          label="Objeto"
          help="Vuelve a consultar al servidor."
          className="w-full sm:w-auto"
        >
          {(control) => (
            <Select value={objectFilter} onValueChange={handleObjectChange}>
              <SelectTrigger ref={objectFilterRef} {...control} className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {AUDIT_OBJECT_TYPE_OPTIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {auditObjectLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field
          id="aud-filtro-accion"
          label="Acción"
          help="Acota lo que se muestra; no cambia la consulta."
          className="w-full sm:w-auto"
        >
          {(control) => (
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger {...control} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {ACTION_OPTIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {auditActionLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </Toolbar>

      {state === 'success' && capped ? (
        <InlineNotice tone="info">
          Se muestran los 500 eventos más recientes de tu alcance. Usa el filtro Objeto para acotar
          la búsqueda.
        </InlineNotice>
      ) : null}

      <DataView
        state={viewState}
        loading={{ rows: 8, columns: 6 }}
        error={{
          title: 'No fue posible cargar la auditoría.',
          message: errorMessage,
          onRetry: () => void load(objectFilter),
        }}
        empty={{
          icon: History,
          title: 'No hay eventos visibles.',
          description: 'Los cambios registrados dentro de tu alcance aparecerán aquí.',
        }}
      >
        <Table density="compact" scrollLabel="Tabla de eventos de auditoría">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Fecha"
                sortKey="createdAt"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Actor</TableHead>
              <TableHead>Proceso</TableHead>
              <SortableTableHead
                label="Acción"
                sortKey="action"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead
                label="Objeto"
                sortKey="objectType"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead className="text-right">Cambio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.pageRows.map((event) => {
              const { actorName } = detailsOf(event);
              return (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {event.actorUserId === null ? (
                      'Sistema'
                    ) : actorName ? (
                      actorName
                    ) : (
                      // Fuera del alcance: id corto con el completo en title (NIT 9).
                      <span title={event.actorUserId} className="font-mono text-meta">
                        {`${event.actorUserId.slice(0, 8)}…`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-40">{processLabel(event.scopeProcessId)}</TableCell>
                  <TableCell className="whitespace-nowrap">{auditActionLabel(event.action)}</TableCell>
                  <TableCell className="whitespace-nowrap">{auditObjectLabel(event.objectType)}</TableCell>
                  <RowActionsCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="[[data-density=compact]_&]:h-7 [[data-density=compact]_&]:px-2"
                      onClick={() => setSelected(event)}
                    >
                      Ver cambio
                    </Button>
                  </RowActionsCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DataTablePagination
          id="aud-paginacion"
          page={table.page}
          pageCount={table.pageCount}
          from={table.from}
          to={table.to}
          filtered={table.filtered}
          pageSize={table.pageSize ?? 25}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun={noun}
        />
      </DataView>

      <VerCambioDialog
        event={selected}
        details={selected ? detailsOf(selected) : null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </PageLayout>
  );
}
