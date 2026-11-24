'use client';

import { ModuleGate } from '@/components/module-gate';
import { NO_ACCESS_COPY } from '@/components/no-access-notice';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { History, X } from 'lucide-react';
import {
  DataTablePagination,
  ResultCount,
} from '@/components/data-table';
import { DataCardList } from '@/components/data-card-list';
import { DataView, type DataViewState } from '@/components/data-view';
import { Field } from '@/components/field';
import { IdChip } from '@/components/id-chip';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActionsCell } from '@/components/row-actions';
import { Toolbar } from '@/components/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  ApiError,
  AUDIT_ACTION_OPTIONS,
  AUDIT_OBJECT_CODE_PATTERN,
  AUDIT_OBJECT_TYPE_OPTIONS,
  auditActionLabel,
  auditObjectLabel,
  listAuditEvents,
  type AuditAction,
  type AuditObjectType,
} from '@/lib/audit';
import { formatDateOnly, formatDateTime, localDateInputValue } from '@/lib/format';
import { listProcesses } from '@/lib/team';
import type { ClientTablePageSize } from '@/lib/use-client-table';
import { listCoordinationPeople } from '@/lib/worklog';
import { VerCambioDialog, type AuditEventDetails } from './ver-cambio-dialog';

type LoadState = 'loading' | 'success' | 'error';

/** Centinela de «Todos» / «Todas» en los filtros. */
const ALL = 'ALL';
const NOUN = { one: 'evento', other: 'eventos' };
const DEFAULT_PAGE_SIZE: ClientTablePageSize = 25;
/** Pausa antes de consultar mientras se escribe el código del objeto (ms). */
const CODE_DEBOUNCE_MS = 400;
const CODE_HELP = 'Por ejemplo PRY-0012, PRY-0012-T07, ACT-0007 o DOC-0003.';
const CODE_ERROR = 'Escribe un código completo, por ejemplo PRY-0012 o ACT-0007.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';
const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';

/** Filtros aplicados a la consulta. Las fechas son YYYY-MM-DD o vacío. */
interface Filters {
  objectType: AuditObjectType | typeof ALL;
  action: AuditAction | typeof ALL;
  code: string;
  actor: string;
  from: string;
  to: string;
  process: string;
}

const EMPTY_FILTERS: Filters = {
  objectType: ALL,
  action: ALL,
  code: '',
  actor: ALL,
  from: '',
  to: '',
  process: ALL,
};

function isObjectType(value: string): value is AuditObjectType {
  return (AUDIT_OBJECT_TYPE_OPTIONS as readonly string[]).includes(value);
}

function isAction(value: string): value is AuditAction {
  return (AUDIT_ACTION_OPTIONS as readonly string[]).includes(value);
}

/** Filtros de entrada desde la URL; un valor inválido se ignora sin error visible. */
function filtersFromUrl(params: URLSearchParams): Filters {
  const code = (params.get('objectCode') ?? '').trim().toUpperCase();
  const type = params.get('objectType') ?? '';
  const actor = params.get('actorUserId') ?? '';
  return {
    ...EMPTY_FILTERS,
    code: AUDIT_OBJECT_CODE_PATTERN.test(code) ? code : '',
    objectType: isObjectType(type) ? type : ALL,
    actor: UUID_PATTERN.test(actor) ? actor : ALL,
  };
}

/** Guía en el cliente (la regla vive en la API): error del rango de fechas o null. */
function rangeErrorOf(from: string, to: string): string | null {
  if (from === '' || to === '') return null;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end < start) return 'La fecha final no puede ser anterior a la inicial.';
  if (Math.round((end - start) / MS_PER_DAY) + 1 > MAX_RANGE_DAYS) {
    return 'El rango máximo es de un año. Acota las fechas.';
  }
  return null;
}

interface Chip {
  key: string;
  name: string;
  value: string;
  /** Id del control del filtro al que vuelve el foco al quitar el chip. */
  focusId: string;
  remove: Partial<Filters>;
}

/**
 * Auditoría (design §11.19 y §24.2, patrón A). Todos los filtros son de
 * servidor: al cambiarlos se vuelve a pedir la lista. La paginación es real en
 * el servidor (page/pageSize); el backend aplica el alcance por rol antes de
 * paginar y los filtros solo lo intersectan. El orden lo fija el servidor
 * (createdAt desc). Especificación: docs/design/oleada4-b-activo-auditoria.md.
 */
function AuditoriaViewContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initial] = React.useState<Filters>(() => filtersFromUrl(new URLSearchParams(searchParams.toString())));

  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [total, setTotal] = React.useState(0);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<Filters>(initial);
  // Código del objeto: lo que se escribe; el aplicado vive en filters.code.
  const [codeInput, setCodeInput] = React.useState(initial.code);
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [serverRangeError, setServerRangeError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<ClientTablePageSize>(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = React.useState<AuditEvent | null>(null);
  const objectFilterRef = React.useRef<HTMLButtonElement>(null);
  const today = React.useMemo(() => localDateInputValue(), []);
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

  const fetchEvents = React.useCallback(
    (f: Filters, requestedPage: number, requestedPageSize: ClientTablePageSize) => {
      const requestId = ++requestRef.current;
      // Procesos y personas solo dan nombres legibles: si fallan, no bloquean la auditoría.
      return Promise.all([
        listAuditEvents({
          page: requestedPage,
          pageSize: requestedPageSize,
          ...(f.objectType === ALL ? {} : { objectType: f.objectType }),
          ...(f.action === ALL ? {} : { action: f.action }),
          ...(f.code === '' ? {} : { objectCode: f.code }),
          ...(f.actor === ALL ? {} : { actorUserId: f.actor }),
          ...(f.from === '' ? {} : { from: f.from }),
          ...(f.to === '' ? {} : { to: f.to }),
          ...(f.process === ALL ? {} : { processId: f.process }),
        }),
        loadLookups(),
      ])
        .then(([result]) => {
          if (requestId !== requestRef.current) return;
          setEvents(result.data);
          setTotal(result.total);
          // El servidor acota page/pageSize; se refleja lo aplicado realmente.
          setPage(result.page);
          setServerRangeError(null);
          setState('success');
        })
        .catch((err: unknown) => {
          if (requestId !== requestRef.current) return;
          const message = err instanceof Error ? err.message : null;
          // 400 con fechas: se conserva la tabla anterior y el mensaje va junto a «Hasta».
          if (err instanceof ApiError && err.status === 400 && (f.from !== '' || f.to !== '')) {
            setServerRangeError(message);
            setState('success');
            return;
          }
          setErrorMessage(message);
          setState('error');
        });
    },
    [loadLookups],
  );

  const load = React.useCallback(
    (f: Filters, requestedPage: number, requestedPageSize: ClientTablePageSize) => {
      setState('loading');
      return fetchEvents(f, requestedPage, requestedPageSize);
    },
    [fetchEvents],
  );

  React.useEffect(() => {
    // El estado inicial ya es 'loading': la carga de montaje no lo vuelve a fijar.
    void fetchEvents(initial, 1, DEFAULT_PAGE_SIZE);
  }, [fetchEvents, initial]);

  const processById = React.useMemo(() => new Map(processes.map((p) => [p.id, p])), [processes]);
  const sortedPeople = React.useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [people],
  );
  const personById = React.useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  function processLabel(id: string | null): string {
    if (!id) return '—';
    const process = processById.get(id);
    return process ? `${process.name} (${process.code})` : OUT_OF_SCOPE_PROCESS;
  }

  function detailsOf(event: AuditEvent): AuditEventDetails {
    return {
      actorName: event.actorUserId === null ? null : (event.actorName ?? null),
      process: processLabel(event.scopeProcessId),
    };
  }

  const clientRangeError = rangeErrorOf(filters.from, filters.to);
  const rangeError = clientRangeError ?? serverRangeError;
  const hasFilters =
    filters.objectType !== ALL ||
    filters.action !== ALL ||
    filters.code !== '' ||
    filters.actor !== ALL ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.process !== ALL;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : from + events.length - 1;

  /** Aplica un cambio de filtros: vuelve a la página 1 y, si el rango es válido, consulta. */
  function update(patch: Partial<Filters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    setServerRangeError(null);
    if (rangeErrorOf(next.from, next.to) !== null) return;
    void load(next, 1, pageSize);
  }

  function handlePageChange(next: number): void {
    setPage(next);
    void load(filters, next, pageSize);
  }

  function handlePageSizeChange(next: ClientTablePageSize): void {
    setPageSize(next);
    setPage(1);
    void load(filters, 1, next);
  }

  /** Aplica el código (vacío o válido) a la consulta; uno inválido no llama a la API. */
  function applyCode(value: string, showError: boolean): void {
    const code = value.trim();
    if (code !== '' && !AUDIT_OBJECT_CODE_PATTERN.test(code)) {
      if (showError) setCodeError(CODE_ERROR);
      return;
    }
    setCodeError(null);
    if (code === filters.code) return;
    update({ code });
  }

  // Con 400 ms de pausa, solo si el texto está vacío o es un código completo válido.
  const applyCodeRef = React.useRef(applyCode);
  React.useEffect(() => {
    applyCodeRef.current = applyCode;
  });
  React.useEffect(() => {
    const value = codeInput.trim();
    if (value !== '' && !AUDIT_OBJECT_CODE_PATTERN.test(value)) return;
    const timer = window.setTimeout(() => applyCodeRef.current(value, false), CODE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [codeInput]);

  function clearFilters(): void {
    setFilters(EMPTY_FILTERS);
    setCodeInput('');
    setCodeError(null);
    setServerRangeError(null);
    setPage(1);
    void load(EMPTY_FILTERS, 1, pageSize);
    // Los parámetros de entrada se quitan para que recargar no los restituya.
    router.replace('/gobierno/auditoria');
    // «Limpiar filtros» desaparece: el foco pasa al filtro Objeto (NIT 4, plan D9).
    objectFilterRef.current?.focus();
  }

  const chips: Chip[] = [];
  if (filters.objectType !== ALL) {
    chips.push({ key: 'objeto', name: 'Objeto', value: auditObjectLabel(filters.objectType), focusId: 'aud-filtro-objeto', remove: { objectType: ALL } });
  }
  if (filters.action !== ALL) {
    chips.push({ key: 'accion', name: 'Acción', value: auditActionLabel(filters.action), focusId: 'aud-filtro-accion', remove: { action: ALL } });
  }
  if (filters.code !== '') {
    chips.push({ key: 'codigo', name: 'Código', value: filters.code, focusId: 'aud-filtro-codigo', remove: { code: '' } });
  }
  if (filters.actor !== ALL) {
    chips.push({ key: 'actor', name: 'Actor', value: personById.get(filters.actor) ?? OUT_OF_SCOPE_PERSON, focusId: 'aud-filtro-actor', remove: { actor: ALL } });
  }
  if (filters.from !== '') {
    chips.push({ key: 'desde', name: 'Desde', value: formatDateOnly(filters.from), focusId: 'aud-filtro-desde', remove: { from: '' } });
  }
  if (filters.to !== '') {
    chips.push({ key: 'hasta', name: 'Hasta', value: formatDateOnly(filters.to), focusId: 'aud-filtro-hasta', remove: { to: '' } });
  }
  if (filters.process !== ALL) {
    chips.push({ key: 'proceso', name: 'Proceso', value: processLabel(filters.process), focusId: 'aud-filtro-proceso', remove: { process: ALL } });
  }

  function removeChip(chip: Chip): void {
    if (chip.key === 'codigo') {
      setCodeInput('');
      setCodeError(null);
    }
    update(chip.remove);
    window.setTimeout(() => {
      // Si era el último chip, «Limpiar filtros» desaparece: el foco va al filtro Objeto.
      const target =
        chips.length === 1 ? objectFilterRef.current : document.getElementById(chip.focusId);
      target?.focus();
    }, 0);
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (total === 0 && !hasFilters) viewState = 'empty';
  else if (total === 0) viewState = 'no-results';
  else viewState = 'ready';

  const actorMissing = filters.actor !== ALL && !personById.has(filters.actor);
  const processMissing = filters.process !== ALL && !processById.has(filters.process);

  return (
    <PageLayout>
      <PageHeader title="Auditoría" description="Cambios registrados dentro de tu alcance." />
      <Toolbar
        label="Filtros de auditoría"
        end={
          state !== 'error' ? (
            <ResultCount
              loading={state === 'loading'}
              total={total}
              filtered={total}
              noun={NOUN}
            />
          ) : null
        }
      >
        <Field
          id="aud-filtro-objeto"
          label="Objeto"
          className="w-full sm:w-auto sm:self-start"
        >
          {(control) => (
            <Select
              value={filters.objectType}
              onValueChange={(value) => update({ objectType: isObjectType(value) ? value : ALL })}
            >
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
          className="w-full sm:w-auto sm:self-start"
        >
          {(control) => (
            <Select
              value={filters.action}
              onValueChange={(value) => update({ action: isAction(value) ? value : ALL })}
            >
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
        <Field
          id="aud-filtro-codigo"
          label="Código del objeto"
          help={CODE_HELP}
          error={codeError}
          className="w-full sm:w-auto sm:self-start"
        >
          {(control) => (
            <Input
              {...control}
              value={codeInput}
              onChange={(event) => {
                setCodeInput(event.target.value.toUpperCase());
                setCodeError(null);
              }}
              onBlur={() => applyCode(codeInput, true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyCode(codeInput, true);
                }
              }}
              className="w-full sm:w-52"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              placeholder="PRY-0012"
            />
          )}
        </Field>
        <Field id="aud-filtro-actor" label="Actor" className="w-full sm:w-auto sm:self-start">
          {(control) => (
            <Select value={filters.actor} onValueChange={(value) => update({ actor: value })}>
              <SelectTrigger {...control} className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {actorMissing ? (
                  <SelectItem value={filters.actor}>{OUT_OF_SCOPE_PERSON}</SelectItem>
                ) : null}
                {sortedPeople.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field
          id="aud-filtro-desde"
          label="Desde"
          help="Incluye todo el día."
          className="w-full sm:w-auto sm:self-start"
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              value={filters.from}
              max={filters.to || today}
              onChange={(event) => update({ from: event.target.value })}
              className="w-full sm:w-44 max-md:h-11"
            />
          )}
        </Field>
        <Field
          id="aud-filtro-hasta"
          label="Hasta"
          help="Incluye todo el día."
          error={rangeError}
          className="w-full sm:w-auto sm:self-start"
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              max={today}
              onChange={(event) => update({ to: event.target.value })}
              className="w-full sm:w-44 max-md:h-11"
            />
          )}
        </Field>
        <Field id="aud-filtro-proceso" label="Proceso" className="w-full sm:w-auto sm:self-start">
          {(control) => (
            <Select value={filters.process} onValueChange={(value) => update({ process: value })}>
              <SelectTrigger {...control} className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {processMissing ? (
                  <SelectItem value={filters.process}>{OUT_OF_SCOPE_PROCESS}</SelectItem>
                ) : null}
                {processes.map((process) => (
                  <SelectItem key={process.id} value={process.id}>
                    {`${process.name} (${process.code})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </Toolbar>
      {chips.length > 0 ? (
        <ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary-subtle py-1 pl-3 pr-1 text-meta font-medium text-foreground">
                <span className="font-normal">{chip.name}:</span> {chip.value}
                <button
                  type="button"
                  aria-label={`Quitar filtro ${chip.name}: ${chip.value}`}
                  onClick={() => removeChip(chip)}
                  className="inline-flex size-6 items-center justify-center rounded-full hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring max-md:size-11"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
          <li>
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </li>
        </ul>
      ) : null}
      <DataView
        state={viewState}
        loading={{ rows: 8, columns: 6 }}
        mobileCards
        noResults={{
          title:
            filters.code !== ''
              ? `No hay eventos para ${filters.code} dentro de tu alcance.`
              : 'No hay eventos con estos filtros dentro de tu alcance.',
          description:
            'Amplía las fechas, quita algún filtro o limpia todos para ver más.',
        }}
        error={{
          title: 'No fue posible cargar la auditoría.',
          message: errorMessage,
          onRetry: () => void load(filters, page, pageSize),
        }}
        empty={{
          icon: History,
          title: 'No hay eventos visibles.',
          description: 'Los cambios registrados dentro de tu alcance aparecerán aquí.',
        }}
      >
        <div className="hidden md:block">
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
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <ActorCell event={event} />
                </TableCell>
                <TableCell className="min-w-40">{processLabel(event.scopeProcessId)}</TableCell>
                <TableCell className="whitespace-nowrap">{auditActionLabel(event.action)}</TableCell>
                <TableCell className="min-w-64 max-w-[26rem]">
                  {event.objectCode || event.objectLabel ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <IdChip code={event.objectCode} />
                      {event.objectLabel ? (
                        <span className="line-clamp-2 wrap-break-word text-foreground">
                          {event.objectLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <span className="block text-meta text-muted-foreground">
                    {auditObjectLabel(event.objectType)}
                  </span>
                </TableCell>
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
            ))}
          </TableBody>
        </Table>
        </div>
        <DataCardList
          label="Eventos de auditoría"
          rows={events}
          getKey={(event) => event.id}
          card={(event) => ({
            code: event.objectCode ? <IdChip code={event.objectCode} /> : undefined,
            title: (
              <span className="inline-flex min-h-11 items-center text-sm font-medium wrap-break-word">
                {auditActionLabel(event.action)}
              </span>
            ),
            subtitle: <ActorCell event={event} />,
            badges: [<Badge key="object" variant="neutral">{auditObjectLabel(event.objectType)}</Badge>],
            meta: [
              { label: 'Objeto', wide: true, value: event.objectLabel },
              { label: 'Fecha', wide: true, value: formatDateTime(event.createdAt) },
              { label: 'Proceso', wide: true, value: processLabel(event.scopeProcessId) },
            ],
            footer: (
              <Button type="button" variant="outline" onClick={() => setSelected(event)}>
                Ver cambio
              </Button>
            ),
          })}
        />
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

/** Quién actuó: «Sistema», el nombre, o «Persona no disponible» (nunca el UUID). */
function ActorCell({ event }: { event: AuditEvent }): React.ReactElement {
  if (event.actorUserId === null) return <>Sistema</>;
  if (event.actorName) return <>{event.actorName}</>;
  return (
    <span
      className="text-muted-foreground"
      title="Ya no figura en el portal o está fuera de tu alcance"
    >
      Persona no disponible
    </span>
  );
}

export function AuditoriaView(): React.ReactElement {
  return (
    <ModuleGate
      moduleKey="audit"
      title="Auditoría"
      description="Cambios registrados dentro de tu alcance."
      copy={NO_ACCESS_COPY.audit}
    >
      <AuditoriaViewContent />
    </ModuleGate>
  );
}
