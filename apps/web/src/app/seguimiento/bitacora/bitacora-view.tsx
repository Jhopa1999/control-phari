'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DataCardList } from '@/components/data-card-list';
import { DataTablePagination, ResultCount } from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatTile, StatStrip } from '@/components/stat-tile';
import { StatusBadge } from '@/components/status-badge';
import { Toolbar, SearchInput } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActor } from '@/lib/actor-context';
import type {
  CoordinationPerson,
  DailyLog,
  DailyLogsQuery,
  DailyLogSummary,
  Process,
} from '@/lib/api-client';
import { formatDateOnlyWithWeekday, formatHours, orDash } from '@/lib/format';
import { listProcesses } from '@/lib/team';
import type { ClientTablePageSize } from '@/lib/use-client-table';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import {
  WorklogError,
  createDailyLog,
  listCoordinationPeople,
  listDailyLogs,
  summarizeDailyLogs,
} from '@/lib/worklog';
import { RANGE_PRESETS, isRangePreset, rangeForPreset, type RangePreset } from '@/lib/worklog-range';
import { CLASSIFICATION_META, classificationLabel } from './clasificaciones';
import { BitacoraDetalle } from './bitacora-detalle';
import { DiarioFormDialog, type DiarioFormValues } from './diario-form-dialog';

type LoadState = 'loading' | 'success' | 'error';
type View = 'mis' | 'equipo';

const ALL = 'ALL';
const NOUN = { one: 'diario', other: 'diarios' };
const DEFAULT_PAGE_SIZE: ClientTablePageSize = 25;
const STATUS_OPTIONS = [
  { value: 'BORRADOR', label: 'Borrador' },
  { value: 'ENVIADO', label: 'Enviado' },
  { value: 'REVISADO', label: 'Revisado' },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '');
  return letters.toUpperCase() || '?';
}

function PersonAvatar({ name }: { name: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-meta font-semibold text-link"
    >
      {initials(name)}
    </span>
  );
}

function classLabel(code: string): string {
  return classificationLabel(code);
}

function messageOf(err: unknown): string {
  return err instanceof WorklogError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/** Texto corto de la distribución por clasificación («Planificada 3 h · Soporte 2 h»). */
function distribution(log: DailyLog): string {
  const hours = new Map<string, number>();
  for (const a of log.activities) {
    hours.set(a.classificationCode, (hours.get(a.classificationCode) ?? 0) + a.hours);
  }
  return [...hours.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, h]) => `${classLabel(code)} ${formatHours(h)}`)
    .join(' · ');
}

/** Filtros y página que se guardan en la URL (nombres en español). */
interface UrlState {
  view: View;
  preset: RangePreset;
  desde: string;
  hasta: string;
  persona: string;
  proceso: string;
  estado: string;
  clase: string;
  q: string;
  pagina: number;
  tam: ClientTablePageSize;
  diario: string | null;
}

function parseUrl(sp: URLSearchParams, canReview: boolean): UrlState {
  const view: View = sp.get('vista') === 'equipo' && canReview ? 'equipo' : 'mis';
  const rango = sp.get('rango');
  const preset: RangePreset = isRangePreset(rango) ? rango : view === 'equipo' ? 'semana' : '30-dias';
  const tamRaw = Number(sp.get('tam'));
  const tam: ClientTablePageSize = tamRaw === 50 || tamRaw === 100 ? tamRaw : DEFAULT_PAGE_SIZE;
  const paginaRaw = Number(sp.get('pagina'));
  return {
    view,
    preset,
    desde: sp.get('desde') ?? '',
    hasta: sp.get('hasta') ?? '',
    persona: sp.get('persona') ?? '',
    proceso: sp.get('proceso') ?? '',
    estado: sp.get('estado') ?? '',
    clase: sp.get('clase') ?? '',
    q: sp.get('q') ?? '',
    pagina: Number.isInteger(paginaRaw) && paginaRaw > 0 ? paginaRaw : 1,
    tam,
    diario: sp.get('diario'),
  };
}

export function BitacoraView(): React.ReactElement {
  const { permissions } = useActor();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canReview = Boolean(
    permissions?.roleCodes.some((r) => r === 'JEFE_AREA' || r === 'LIDER_PROCESO'),
  );
  const myUserId = permissions?.userId ?? '';
  const url = parseUrl(new URLSearchParams(searchParams.toString()), canReview);

  const [logs, setLogs] = React.useState<DailyLog[]>([]);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState<DailyLogSummary | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);

  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);

  const [diarioOpen, setDiarioOpen] = React.useState(false);
  const [diarioSubmitting, setDiarioSubmitting] = React.useState(false);
  const [diarioError, setDiarioError] = React.useState<string | null>(null);

  const [qInput, setQInput] = React.useState(url.q);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const firstRowButtonRef = React.useRef<HTMLButtonElement>(null);

  /** Actualiza la URL (sin llenar el historial). `null` o '' quita el parámetro. */
  const setParams = React.useCallback(
    (patch: Record<string, string | null>, keepPage = false) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (!keepPage && !('pagina' in patch)) next.delete('pagina');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Búsqueda con retardo de 300 ms: no se pide al servidor en cada tecla.
  React.useEffect(() => {
    if (qInput === url.q) return;
    const timer = window.setTimeout(() => setParams({ q: qInput.trim() || null }), 300);
    return () => window.clearTimeout(timer);
  }, [qInput, url.q, setParams]);

  // Listas auxiliares: nombres de procesos y personas. Los proyectos y tareas imputables
  // los pide el formulario de actividades (GET /worklog/options) al abrirse.
  React.useEffect(() => {
    void listProcesses().then(setProcesses, () => undefined);
  }, []);
  React.useEffect(() => {
    if (canReview) void listCoordinationPeople().then(setPeople, () => undefined);
  }, [canReview]);

  // Consulta efectiva al servidor, derivada de la URL.
  const range = url.preset === 'personalizado'
    ? { from: url.desde || undefined, to: url.hasta || undefined }
    : rangeForPreset(url.preset);
  const filterQuery: DailyLogsQuery = {
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    ...(url.view === 'mis' && myUserId ? { authorUserId: myUserId } : {}),
    ...(url.view === 'equipo' && url.persona ? { authorUserId: url.persona } : {}),
    ...(url.proceso ? { processId: url.proceso } : {}),
    ...(url.clase ? { classificationCode: url.clase as never } : {}),
    ...(url.q ? { q: url.q } : {}),
  };
  const listQuery: DailyLogsQuery = {
    ...filterQuery,
    ...(url.estado ? { status: url.estado as never } : {}),
    page: url.pagina,
    pageSize: url.tam,
  };
  // Mientras no se conozca al usuario, la vista «mis» no puede filtrar por autor.
  const ready = url.view === 'equipo' || myUserId !== '';
  const queryKey = JSON.stringify({ list: listQuery, summary: filterQuery, ready, reloadTick });

  useResetOnChange([queryKey], () => {
    setState('loading');
  });

  React.useEffect(() => {
    const parsed = JSON.parse(queryKey) as {
      list: DailyLogsQuery;
      summary: DailyLogsQuery;
      ready: boolean;
    };
    if (!parsed.ready) return;
    let cancelled = false;
    Promise.all([
      listDailyLogs(parsed.list),
      summarizeDailyLogs(parsed.summary).catch(() => null),
    ])
      .then(([result, sum]) => {
        if (cancelled) return;
        setLogs(result.data);
        setTotal(result.total);
        setSummary(sum);
        setLoadError(null);
        setState('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof WorklogError ? err.message : null);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  const reload = React.useCallback(() => setReloadTick((n) => n + 1), [setReloadTick]);

  // --- Nuevo diario ---
  async function handleDiarioSubmit(values: DiarioFormValues) {
    setDiarioSubmitting(true);
    setDiarioError(null);
    try {
      const notes = values.dayNotes.trim();
      const created = await createDailyLog({
        processId: values.processId,
        date: values.date,
        ...(notes ? { dayNotes: notes } : {}),
      });
      toast.success('Diario creado.');
      setDiarioOpen(false);
      setParams({ diario: created.id }, true);
      reload();
    } catch (err) {
      const message = messageOf(err);
      setDiarioError(message);
      toast.error(message);
    } finally {
      setDiarioSubmitting(false);
    }
  }

  // --- Filtros ---
  const defaultPreset: RangePreset = url.view === 'equipo' ? 'semana' : '30-dias';
  const hasFilters =
    url.preset !== defaultPreset ||
    Boolean(url.persona || url.proceso || url.estado || url.clase || url.q);

  function clearFilters() {
    setQInput('');
    setParams({
      rango: null,
      desde: null,
      hasta: null,
      persona: null,
      proceso: null,
      estado: null,
      clase: null,
      q: null,
    });
    headingRef.current?.focus();
  }

  const pageCount = Math.max(1, Math.ceil(total / url.tam));
  const from = total === 0 ? 0 : (url.pagina - 1) * url.tam + 1;
  const to = total === 0 ? 0 : from + logs.length - 1;

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (total === 0 && !hasFilters) viewState = 'empty';
  else if (total === 0) viewState = 'no-results';
  else viewState = 'ready';

  const showPerson = url.view === 'equipo';
  const personName = (log: DailyLog) => orDash(log.authorName);

  // --- Indicadores ---
  const mine = url.view === 'mis';
  const tiles = summary ? (
    <StatStrip label="Resumen de la bitácora">
      <StatTile label="Diarios" value={summary.total} hint={`${summary.activityCount} actividades`} />
      <StatTile label="Horas" value={formatHours(summary.totalHours)} hint="Dedicación registrada" />
      {mine ? (
        <StatTile
          label="Pendientes de enviar"
          value={summary.draftCount - summary.returnedCount}
          hint="Borradores sin enviar"
          tone={summary.draftCount - summary.returnedCount > 0 ? 'warning' : 'default'}
        />
      ) : (
        <StatTile
          label="Por revisar"
          value={summary.sentCount}
          hint={
            summary.sentCount > 0 ? (
              <button
                type="button"
                className="text-link underline underline-offset-2"
                onClick={() => setParams({ estado: 'ENVIADO' })}
              >
                Ver pendientes
              </button>
            ) : (
              'Nada por revisar'
            )
          }
          tone={summary.sentCount > 0 ? 'warning' : 'default'}
        />
      )}
      {mine ? (
        <StatTile
          label="Devueltos"
          value={summary.returnedCount}
          hint="Necesitan corrección"
          tone={summary.returnedCount > 0 ? 'warning' : 'default'}
        />
      ) : (
        <StatTile
          label="Borradores"
          value={summary.draftCount}
          hint={summary.returnedCount > 0 ? `${summary.returnedCount} devueltos` : 'Sin enviar'}
        />
      )}
    </StatStrip>
  ) : null;

  return (
    <PageLayout>
      <PageHeader
        title="Bitácora"
        description="Lo que hiciste cada día y cuánto tiempo le dedicaste. La ven tu líder y tu jefatura."
        actions={
          <Button type="button" onClick={() => setDiarioOpen(true)} disabled={state === 'loading' && logs.length === 0}>
            <Plus aria-hidden="true" />
            Nuevo diario
          </Button>
        }
      />

      {canReview ? (
        <Tabs
          value={url.view}
          onValueChange={(value) =>
            setParams({ vista: value === 'equipo' ? 'equipo' : null, rango: null, desde: null, hasta: null, persona: null, estado: null })
          }
        >
          <TabsList aria-label="Vista de la bitácora" className="overflow-x-auto">
            <TabsTrigger value="mis">Mis diarios</TabsTrigger>
            <TabsTrigger value="equipo">
              {summary && url.view === 'equipo' && summary.sentCount > 0
                ? `Equipo · ${summary.sentCount} por revisar`
                : 'Equipo'}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <h2 ref={headingRef} tabIndex={-1} className="sr-only focus-visible:outline-none">
        {mine ? 'Mis diarios' : 'Diarios del equipo'}
      </h2>

      {state !== 'error' ? tiles : null}

      <Toolbar
        label="Filtros de la bitácora"
        collapseOnMobile
        end={
          <>
            {state !== 'error' ? (
              <ResultCount loading={state === 'loading'} total={total} filtered={total} noun={NOUN} />
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
          id="bit-q"
          placeholder="Notas, actividades, persona…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <Field id="bit-rango" label="Fechas" className="w-full sm:w-auto">
          {(control) => (
            <Select value={url.preset} onValueChange={(v) => setParams({ rango: v, desde: null, hasta: null })}>
              <SelectTrigger {...control} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        {url.preset === 'personalizado' ? (
          <>
            <Field id="bit-desde" label="Desde" className="w-full sm:w-auto">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={url.desde}
                  max={url.hasta || undefined}
                  onChange={(e) => setParams({ desde: e.target.value })}
                  className="w-full sm:w-40"
                />
              )}
            </Field>
            <Field id="bit-hasta" label="Hasta" className="w-full sm:w-auto">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={url.hasta}
                  min={url.desde || undefined}
                  onChange={(e) => setParams({ hasta: e.target.value })}
                  className="w-full sm:w-40"
                />
              )}
            </Field>
          </>
        ) : null}
        {showPerson ? (
          <Field id="bit-persona" label="Persona" className="w-full sm:w-auto">
            {(control) => (
              <Select
                value={url.persona || ALL}
                onValueChange={(v) => setParams({ persona: v === ALL ? null : v })}
              >
                <SelectTrigger {...control} className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ) : null}
        {processes.length > 1 ? (
          <Field id="bit-proceso" label="Proceso" className="w-full sm:w-auto">
            {(control) => (
              <Select
                value={url.proceso || ALL}
                onValueChange={(v) => setParams({ proceso: v === ALL ? null : v })}
              >
                <SelectTrigger {...control} className="w-full sm:w-44">
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
            )}
          </Field>
        ) : null}
        <Field id="bit-estado" label="Estado" className="w-full sm:w-auto">
          {(control) => (
            <Select
              value={url.estado || ALL}
              onValueChange={(v) => setParams({ estado: v === ALL ? null : v })}
            >
              <SelectTrigger {...control} className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="bit-clase" label="Clasificación" className="w-full sm:w-auto">
          {(control) => (
            <Select
              value={url.clase || ALL}
              onValueChange={(v) => setParams({ clase: v === ALL ? null : v })}
            >
              <SelectTrigger {...control} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {Object.entries(CLASSIFICATION_META).map(([code, meta]) => (
                  <SelectItem key={code} value={code}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </Toolbar>

      <DataView
        state={viewState}
        mobileCards
        loading={{ rows: 8, columns: 6 }}
        error={{
          title: 'No fue posible cargar la bitácora.',
          message: loadError,
          onRetry: () => {
            setState('loading');
            reload();
          },
        }}
        empty={{
          icon: ClipboardList,
          title: mine ? 'Aún no hay diarios.' : 'Aún no hay diarios del equipo.',
          description: mine
            ? 'Crea un diario para registrar las actividades de tu jornada.'
            : 'Cuando tu equipo registre su jornada, los diarios aparecerán aquí.',
          action: mine ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setDiarioOpen(true)}>
              <Plus aria-hidden="true" />
              Nuevo diario
            </Button>
          ) : undefined,
        }}
        noResults={{
          title: 'Ningún diario coincide con los filtros.',
          description: 'Prueba con otro rango de fechas o quita algún filtro.',
        }}
      >
        <div className="hidden md:block">
          <Table density="compact" scrollLabel="Tabla de diarios">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Fecha</TableHead>
                {showPerson ? <TableHead scope="col">Persona</TableHead> : null}
                <TableHead scope="col" className="hidden lg:table-cell">
                  Proceso
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Actividades
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Horas
                </TableHead>
                <TableHead scope="col" className="hidden lg:table-cell">
                  Distribución
                </TableHead>
                <TableHead scope="col">Estado</TableHead>
                <TableHead scope="col" className="hidden xl:table-cell">
                  Notas
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log, index) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setParams({ diario: log.id }, true)}
                >
                  <TableCell className="whitespace-nowrap">
                    <button
                      ref={index === 0 ? firstRowButtonRef : undefined}
                      type="button"
                      className="rounded-sm text-left font-medium text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={(e) => {
                        e.stopPropagation();
                        setParams({ diario: log.id }, true);
                      }}
                    >
                      {formatDateOnlyWithWeekday(log.date)}
                    </button>
                    {!showPerson ? (
                      <span className="block text-meta text-muted-foreground lg:hidden">
                        {orDash(log.processName)}
                      </span>
                    ) : null}
                  </TableCell>
                  {showPerson ? (
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <PersonAvatar name={personName(log)} />
                        <span className="flex flex-col">
                          <span>{personName(log)}</span>
                          <span className="text-meta text-muted-foreground lg:hidden">
                            {orDash(log.processName)}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    {orDash(log.processName)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{log.activities.length}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatHours(log.totalHours)}
                  </TableCell>
                  <TableCell className="hidden max-w-64 text-meta text-muted-foreground lg:table-cell">
                    <span className="line-clamp-2">{distribution(log) || '—'}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <StatusBadge kind="log" value={log.returned ? 'DEVUELTO' : log.status} />
                  </TableCell>
                  <TableCell className="hidden max-w-56 text-muted-foreground xl:table-cell">
                    <span className="line-clamp-1" title={log.dayNotes ?? undefined}>
                      {orDash(log.dayNotes)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DataCardList
          label="Diarios"
          rows={logs}
          getKey={(log) => log.id}
          card={(log) => ({
            title: (
              <button
                type="button"
                className="rounded-sm text-left font-medium text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => setParams({ diario: log.id }, true)}
              >
                {formatDateOnlyWithWeekday(log.date)}
              </button>
            ),
            subtitle: showPerson ? `${personName(log)} · ${orDash(log.processName)}` : orDash(log.processName),
            badges: [<StatusBadge key="s" kind="log" value={log.returned ? 'DEVUELTO' : log.status} />],
            note: log.dayNotes,
            meta: [
              { label: 'Actividades', value: log.activities.length },
              { label: 'Horas', value: formatHours(log.totalHours) },
            ],
          })}
        />
        <DataTablePagination
          id="bit-paginacion"
          page={url.pagina}
          pageCount={pageCount}
          from={from}
          to={to}
          filtered={total}
          pageSize={url.tam}
          onPageChange={(next) => setParams({ pagina: next > 1 ? String(next) : null }, true)}
          onPageSizeChange={(size) => setParams({ tam: size === DEFAULT_PAGE_SIZE ? null : String(size), pagina: null })}
          noun={NOUN}
        />
      </DataView>

      <DiarioFormDialog
        open={diarioOpen}
        onOpenChange={(open) => {
          setDiarioOpen(open);
          if (!open) setDiarioError(null);
        }}
        editing={null}
        processes={processes}
        submitting={diarioSubmitting}
        errorMessage={diarioError}
        onSubmit={handleDiarioSubmit}
      />

      {url.diario ? (
        <BitacoraDetalle
          key={url.diario}
          logId={url.diario}
          processes={processes}
          onChanged={reload}
          onClose={() => setParams({ diario: null }, true)}
          returnFocusTo={() => headingRef.current}
        />
      ) : null}
    </PageLayout>
  );
}
