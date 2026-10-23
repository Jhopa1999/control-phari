'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import {
  DataTablePagination,
  ResultCount,
} from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { Field } from '@/components/field';
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
  AUDIT_ACTION_OPTIONS,
  AUDIT_OBJECT_TYPE_OPTIONS,
  auditActionLabel,
  auditObjectLabel,
  listAuditEvents,
  type AuditAction,
  type AuditObjectType,
} from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { listProcesses } from '@/lib/team';
import type { ClientTablePageSize } from '@/lib/use-client-table';
import { listCoordinationPeople } from '@/lib/worklog';
import { VerCambioDialog, type AuditEventDetails } from './ver-cambio-dialog';

type LoadState = 'loading' | 'success' | 'error';

/** Centinela de «Todos» / «Todas» en los filtros. */
const ALL = 'ALL';
const NOUN = { one: 'evento', other: 'eventos' };
const DEFAULT_PAGE_SIZE: ClientTablePageSize = 25;

function isObjectType(value: string): value is AuditObjectType {
  return (AUDIT_OBJECT_TYPE_OPTIONS as readonly string[]).includes(value);
}

function isAction(value: string): value is AuditAction {
  return (AUDIT_ACTION_OPTIONS as readonly string[]).includes(value);
}

/**
 * Auditoría (design §11.19 y §24.2, patrón A). «Objeto» y «Acción» son filtros
 * de servidor: al cambiarlos se vuelve a pedir la lista con objectType/action.
 * La paginación es real en el servidor (page/pageSize); el backend aplica el
 * alcance por rol antes de paginar y devuelve { data, page, pageSize, total,
 * hasMore }. El orden lo fija el servidor (createdAt desc), por eso los
 * encabezados no son ordenables.
 */
export function AuditoriaView(): React.ReactElement {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [total, setTotal] = React.useState(0);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [objectFilter, setObjectFilter] = React.useState<AuditObjectType | typeof ALL>(ALL);
  const [actionFilter, setActionFilter] = React.useState<AuditAction | typeof ALL>(ALL);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<ClientTablePageSize>(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = React.useState<AuditEvent | null>(null);
  const objectFilterRef = React.useRef<HTMLButtonElement>(null);

  // Número de la última consulta de eventos: una respuesta que llega después de
  // otra más nueva (cambio de filtro o de página en curso) se descarta.
  const requestRef = React.useRef(0);
  // Procesos y personas no dependen del filtro: se piden una vez y solo se
  // vuelven a pedir si fallaron (por ejemplo, tras «Reintentar»).
  const processesRef = React.useRef<Promise<void> | null>(null);
  const peopleRef = React.useRef<Promise<void> | null>(null);
  const loadLookups = React.useCallback((): Promise<void[]> => {
    if (!processesRef.current) {
      processesRef.current = listProcesses().then(setProcesses, () => {
        processesRef.current = null;
      });
    }
    if (!peopleRef.current) {
      peopleRef.current = listCoordinationPeople().then(setPeople, () => {
        peopleRef.current = null;
      });
    }
    return Promise.all([processesRef.current, peopleRef.current]);
  }, []);

  const load = React.useCallback(
    async (
      objectType: AuditObjectType | typeof ALL,
      action: AuditAction | typeof ALL,
      requestedPage: number,
      requestedPageSize: ClientTablePageSize,
    ) => {
      const requestId = ++requestRef.current;
      setState('loading');
      try {
        // Procesos y personas solo dan nombres legibles: si fallan, no bloquean la auditoría.
        const [result] = await Promise.all([
          listAuditEvents({
            page: requestedPage,
            pageSize: requestedPageSize,
            ...(objectType === ALL ? {} : { objectType }),
            ...(action === ALL ? {} : { action }),
          }),
          loadLookups(),
        ]);
        if (requestId !== requestRef.current) return;
        setEvents(result.data);
        setTotal(result.total);
        // El servidor acota page/pageSize; se refleja lo aplicado realmente.
        setPage(result.page);
        setState('success');
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setErrorMessage(err instanceof Error ? err.message : null);
        setState('error');
      }
    },
    [loadLookups],
  );

  React.useEffect(() => {
    void load(ALL, ALL, 1, DEFAULT_PAGE_SIZE);
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

  const hasFilters = objectFilter !== ALL || actionFilter !== ALL;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : from + events.length - 1;

  function handleObjectChange(value: string): void {
    const next = isObjectType(value) ? value : ALL;
    setObjectFilter(next);
    setPage(1);
    void load(next, actionFilter, 1, pageSize);
  }

  function handleActionChange(value: string): void {
    const next = isAction(value) ? value : ALL;
    setActionFilter(next);
    setPage(1);
    void load(objectFilter, next, 1, pageSize);
  }

  function handlePageChange(next: number): void {
    setPage(next);
    void load(objectFilter, actionFilter, next, pageSize);
  }

  function handlePageSizeChange(next: ClientTablePageSize): void {
    setPageSize(next);
    setPage(1);
    void load(objectFilter, actionFilter, 1, next);
  }

  function clearFilters(): void {
    setObjectFilter(ALL);
    setActionFilter(ALL);
    setPage(1);
    void load(ALL, ALL, 1, pageSize);
    // «Limpiar filtros» desaparece: el foco pasa al filtro Objeto (NIT 4, plan D9).
    objectFilterRef.current?.focus();
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (total === 0 && !hasFilters) viewState = 'empty';
  else if (total === 0) viewState = 'no-results';
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
                total={total}
                filtered={total}
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
          help="Vuelve a consultar al servidor."
          className="w-full sm:w-auto"
        >
          {(control) => (
            <Select value={actionFilter} onValueChange={handleActionChange}>
              <SelectTrigger {...control} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {AUDIT_ACTION_OPTIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {auditActionLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </Toolbar>

      <DataView
        state={viewState}
        loading={{ rows: 8, columns: 6 }}
        error={{
          title: 'No fue posible cargar la auditoría.',
          message: errorMessage,
          onRetry: () => void load(objectFilter, actionFilter, page, pageSize),
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
              <TableHead>Fecha</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Proceso</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Objeto</TableHead>
              <TableHead className="text-right">Cambio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
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
          page={page}
          pageCount={pageCount}
          from={from}
          to={to}
          filtered={total}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          noun={NOUN}
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
