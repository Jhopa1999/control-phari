'use client';

import * as React from 'react';
import Link from 'next/link';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { FileX, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { BlockedReasonBox } from '@/components/blocked-reason';
import { DescriptionList } from '@/components/description-list';
import { DueBadge } from '@/components/due-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { IdChip } from '@/components/id-chip';
import { ListPager } from '@/components/list-pager';
import { ListSearchBar } from '@/components/list-search-bar';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { SearchableSelect, type SearchableOption } from '@/components/searchable-select';
import { ServerListBody } from '@/components/server-list';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Commitment, RecordState } from '@/lib/api-client';
import {
  CommitmentError,
  createCommitment,
  getCommitment,
  listCommitmentsPage,
  transitionCommitment,
  updateCommitment,
  type CommitmentView,
} from '@/lib/commitments';
import { formatDateOnly } from '@/lib/format';
import { listCountText } from '@/lib/list-count';
import { listMeetingsPage } from '@/lib/meetings';
import { nextStates, stateLabel } from '@/lib/record-state';
import {
  relatedCreateFields,
  relatedUpdateFields,
  relatedValueOf,
} from '@/lib/related-request-value';
import { PERSON_NOT_IN_PROCESS_MESSAGE } from '@/lib/use-person-error';
import { useDebouncedValue, useServerTable } from '@/lib/use-server-table';
import { BlockCommitmentDialog, type BlockTarget } from './bloquear-compromiso-dialog';
import { CompromisoFormDialog, type CompromisoFormValues } from './compromiso-form-dialog';
import type { CoordinationData } from './reuniones-view';

const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';
const TRANSITIONS_LABEL_ID = 'com-transiciones';

const ALL = 'ALL';
const WITHOUT_MINUTES = 'SIN_ACTA';
type StatusFilter = 'ABIERTOS' | 'VENCIDOS' | 'TERMINADOS' | 'TODOS';

const VIEW_OF: Record<StatusFilter, CommitmentView | undefined> = {
  ABIERTOS: 'ABIERTOS',
  VENCIDOS: 'VENCIDOS',
  TERMINADOS: 'TERMINADOS',
  TODOS: undefined,
};

const WITHOUT_MINUTES_OPTION: SearchableOption = {
  value: WITHOUT_MINUTES,
  label: 'Sin acta',
  summary: 'Sin acta',
};

function messageOf(err: unknown): string {
  return err instanceof CommitmentError ? err.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function meetingFilterOption(m: { id: string; title: string; meetingDate: string }): SearchableOption {
  const date = formatDateOnly(m.meetingDate);
  return { value: m.id, label: m.title, secondary: date, summary: `${m.title} (${date})` };
}

/**
 * Pestaña «Compromisos»: seguimiento consolidado de todos los compromisos en
 * alcance, con o sin acta de origen. Busca, filtra y pagina el servidor sobre
 * el alcance único; el detalle de uno que no está en la página se pide por id.
 */
export function CompromisosPanel({
  data,
  initialCommitmentId,
  onOpenMeeting,
}: {
  data: CoordinationData;
  initialCommitmentId: string | null;
  onOpenMeeting: (meetingId: string) => void;
}): React.ReactElement {
  const { processes, people, totals } = data;
  const [selectedId, setSelectedId] = React.useState<string | null>(initialCommitmentId);
  const [pinnedId, setPinnedId] = React.useState<string | null>(initialCommitmentId);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ABIERTOS');
  const [personFilter, setPersonFilter] = React.useState(ALL);
  const [meetingFilter, setMeetingFilter] = React.useState<SearchableOption | null>(null);
  const [meetingOptions, setMeetingOptions] = React.useState<SearchableOption[]>([]);
  const [meetingQuery, setMeetingQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Commitment | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [transitioningTo, setTransitioningTo] = React.useState<RecordState | null>(null);
  const [blockTarget, setBlockTarget] = React.useState<BlockTarget | null>(null);
  const [external, setExternal] = React.useState<Commitment | null>(null);
  const [externalMissing, setExternalMissing] = React.useState(false);
  const [detailNonce, setDetailNonce] = React.useState(0);
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listBodyRef = React.useRef<HTMLDivElement>(null);
  const validatedKey = React.useRef<string | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const meetingFilterValue = meetingFilter?.value ?? ALL;
  const filtersKey = [debouncedSearch, statusFilter, personFilter, meetingFilterValue].join('|');
  const table = useServerTable<Commitment, 'none'>({
    fetchPage: ({ page, pageSize, signal }) =>
      listCommitmentsPage(
        {
          q: debouncedSearch,
          view: VIEW_OF[statusFilter],
          personId: personFilter !== ALL ? personFilter : undefined,
          withoutMeeting: meetingFilterValue === WITHOUT_MINUTES,
          meetingId:
            meetingFilterValue !== ALL && meetingFilterValue !== WITHOUT_MINUTES
              ? meetingFilterValue
              : undefined,
          page,
          pageSize,
        },
        signal,
      ),
    filtersKey,
    defaultSort: null,
  });
  const commitments = table.rows;
  const state: 'loading' | 'success' | 'error' =
    table.status === 'error' ? 'error' : table.status === 'loading' ? 'loading' : 'success';
  const filtersActive =
    statusFilter !== 'ABIERTOS' || personFilter !== ALL || meetingFilterValue !== ALL;
  const searching = debouncedSearch !== '' || filtersActive;

  /** Recarga la lista, los totales y el detalle abierto desde fuera de la página. */
  const reload = React.useCallback(async (): Promise<void> => {
    table.reload();
    setDetailNonce((n) => n + 1);
    await data.reload();
  }, [table, data]);

  // Un compromiso pedido desde fuera (notificación o un acta) se abre aunque no esté en la página.
  useResetOnChange([initialCommitmentId], () => {
    if (!initialCommitmentId) return;
    setSelectedId(initialCommitmentId);
    setPinnedId(initialCommitmentId);
  });

  // Con una búsqueda o filtro nuevo, si la selección no está en la lista se elige la primera.
  // Cambiar de página no cambia el detalle abierto.
  useResetOnChange([table.status, table.rows, filtersKey], () => {
    if (table.status !== 'ready' || validatedKey.current === filtersKey) return;
    validatedKey.current = filtersKey;
    setSelectedId((prev) => {
      if (prev && (prev === pinnedId || commitments.some((c) => c.id === prev))) return prev;
      return commitments[0]?.id ?? null;
    });
  });

  const inPage = selectedId !== null && commitments.some((c) => c.id === selectedId);
  React.useEffect(() => {
    if (!selectedId || inPage) return;
    let cancelled = false;
    getCommitment(selectedId)
      .then((c) => {
        if (cancelled) return;
        setExternal(c);
        setExternalMissing(false);
      })
      .catch(() => {
        if (cancelled) return;
        setExternal(null);
        setExternalMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, inPage, detailNonce]);

  // Opciones del filtro «Acta»: «Sin acta» y las actas buscadas en el servidor.
  React.useEffect(() => {
    const controller = new AbortController();
    listMeetingsPage({ q: meetingQuery, page: 1, pageSize: 25 }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setMeetingOptions([WITHOUT_MINUTES_OPTION, ...result.rows.map(meetingFilterOption)]);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMeetingOptions([WITHOUT_MINUTES_OPTION]);
      });
    return () => controller.abort();
  }, [meetingQuery]);

  const selected =
    commitments.find((c) => c.id === selectedId) ??
    (external && external.id === selectedId ? external : null);
  const processName = (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS;
  const personName = (id: string | null) =>
    id ? (people.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PERSON) : null;
  const meta = (c: Commitment) => (
    <>
      {`Vence ${formatDateOnly(c.dueDate)} · ${c.sourceMeetingTitle ? `Acta: ${c.sourceMeetingTitle}` : 'Sin acta'}`}
      {c.relatedRequestCode ? (
        <IdChip code={c.relatedRequestCode} variant="full" copyable={false} className="ml-1 align-middle" />
      ) : null}
    </>
  );

  function clearAll(): void {
    setSearch('');
    setStatusFilter('ABIERTOS');
    setPersonFilter(ALL);
    setMeetingFilter(null);
    searchRef.current?.focus();
  }

  async function handleSubmit(values: CompromisoFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      const body = {
        title: values.title,
        dueDate: values.dueDate,
        assignedUserId: trimOrUndefined(values.assignedUserId),
        responsibleUserId: trimOrUndefined(values.responsibleUserId),
        sourceMeetingId: trimOrUndefined(values.sourceMeetingId),
        expectedResult: trimOrUndefined(values.expectedResult),
        blockers: trimOrUndefined(values.blockers),
      };
      if (editing) {
        await updateCommitment(editing.id, {
          ...body,
          ...relatedUpdateFields(relatedValueOf(editing), values.related),
        });
        toast.success('Compromiso actualizado.');
      } else {
        const created = await createCommitment({
          processId: values.processId,
          ...body,
          ...relatedCreateFields(values.related),
        });
        toast.success('Compromiso creado.');
        setStatusFilter('ABIERTOS');
        setSelectedId(created.id);
        setPinnedId(created.id);
      }
      setOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      // La persona fuera de alcance, la fecha y la solicitud se muestran junto al campo, sin toast.
      if (
        message !== PERSON_NOT_IN_PROCESS_MESSAGE &&
        !message.startsWith('La fecha límite debe estar entre') &&
        message !== 'No se encontró la solicitud.'
      ) {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(c: Commitment, toState: RecordState): Promise<void> {
    if (toState === 'BLOQUEADO') {
      // El motivo se pide en un diálogo; allí se envía el cambio.
      setBlockTarget({ id: c.id, title: c.title, blockers: c.blockers });
      return;
    }
    setTransitioningTo(toState);
    try {
      await transitionCommitment(c.id, { toState });
      toast.success(`Compromiso movido a ${stateLabel(toState)}.`);
      await reload();
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body) detailHeadingRef.current?.focus();
      });
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setTransitioningTo(null);
    }
  }

  function renderDetail(): React.ReactNode {
    if (!selected && externalMissing && selectedId) {
      return (
        <Card>
          <EmptyState
            icon={FileX}
            title="No encontramos este compromiso"
            description="Puede que se haya eliminado o que ya no tengas acceso a él."
          />
        </Card>
      );
    }
    if ((state === 'loading' || (selectedId && !externalMissing)) && !selected) {
      return (
        <Card aria-hidden="true" className="flex flex-col gap-4 p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </Card>
      );
    }
    if (!selected) {
      return (
        <Card>
          <EmptyState
            title="Selecciona un compromiso para ver su detalle."
            description="Los compromisos se registran normalmente desde el acta de la reunión."
          />
        </Card>
      );
    }
    const targets = nextStates(selected.state);
    const blocked = selected.state === 'BLOQUEADO';
    const requestId = selected.relatedProjectRequestId ?? selected.relatedRequestId;
    return (
      <Card>
        <CardHeader className="gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                ref={detailHeadingRef}
                tabIndex={-1}
                className="rounded-sm text-lg font-semibold wrap-break-word focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {selected.title}
              </h2>
              <StatusBadge kind="record" value={selected.state} />
              <DueBadge
                status={selected.dueStatus}
                daysToDue={selected.daysToDue}
                dueDate={selected.dueDate}
              />
            </div>
            <p className="text-meta text-muted-foreground">
              {`Vence ${formatDateOnly(selected.dueDate)} · ${processName(selected.processId)}`}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(selected);
              setFormError(null);
              setOpen(true);
            }}
          >
            Editar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-4">
          {blocked ? (
            <BlockedReasonBox reason={selected.blockers} clamp={false} label="Motivo del bloqueo" className="mb-0" />
          ) : null}
          <DescriptionList
            columns={2}
            items={[
              { term: 'Asignado', value: personName(selected.assignedUserId) },
              { term: 'Responsable', value: personName(selected.responsibleUserId) },
              {
                term: 'Acta de origen',
                value: selected.sourceMeetingId ? (
                  <button
                    type="button"
                    className="text-left underline-offset-4 hover:underline"
                    onClick={() => onOpenMeeting(selected.sourceMeetingId as string)}
                  >
                    {`${selected.sourceMeetingTitle ?? 'Acta'}${selected.sourceMeetingDate ? ` (${formatDateOnly(selected.sourceMeetingDate)})` : ''}`}
                  </button>
                ) : (
                  'Sin acta'
                ),
                span: 2,
              },
              {
                term: 'Solicitud relacionada',
                value: !requestId ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Sin solicitud relacionada</span>
                  </>
                ) : selected.relatedRequestCode ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <IdChip code={selected.relatedRequestCode} variant="full" />
                    <Link
                      href={`/demanda/solicitudes/${requestId}`}
                      className="min-w-0 text-link underline-offset-4 wrap-break-word hover:underline"
                    >
                      {selected.relatedRequestTitle}
                    </Link>
                  </span>
                ) : (
                  <span className="text-muted-foreground">No disponible</span>
                ),
                span: 2,
              },
              { term: 'Resultado esperado', value: selected.expectedResult, span: 2 },
              // Con el compromiso bloqueado, los bloqueos se ven en la caja de motivo.
              ...(blocked ? [] : [{ term: 'Bloqueos', value: selected.blockers, span: 2 as const }]),
            ]}
          />
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 id={TRANSITIONS_LABEL_ID} className="text-sm font-semibold">
              Cambiar estado a:
            </h3>
            {targets.length === 0 ? (
              <p className="text-meta text-muted-foreground">No hay transiciones disponibles desde este estado.</p>
            ) : (
              <div role="group" aria-labelledby={TRANSITIONS_LABEL_ID} className="flex flex-wrap gap-2">
                {targets.map((to) => (
                  <Button
                    key={to}
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={transitioningTo === to}
                    disabled={transitioningTo !== null}
                    aria-haspopup={to === 'BLOQUEADO' ? 'dialog' : undefined}
                    // eslint-disable-next-line react-hooks/refs -- falso positivo: la función solo lee el ref dentro de un manejador o callback, nunca durante el render.
                    onClick={() => void handleTransition(selected, to)}
                  >
                    {stateLabel(to)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const newButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        setEditing(null);
        setFormError(null);
        setOpen(true);
      }}
      disabled={state === 'loading'}
    >
      <Plus aria-hidden="true" />
      Compromiso sin acta
    </Button>
  );

  if (state === 'error') {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState title="No fue posible cargar los compromisos." error={table.error} onRetry={table.reload} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
          <div className="grid gap-1.5">
            <Label htmlFor="com-filtro-estado">Estado</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger id="com-filtro-estado" className="w-40 max-sm:w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ABIERTOS">Abiertos</SelectItem>
                <SelectItem value="VENCIDOS">Vencidos</SelectItem>
                <SelectItem value="TERMINADOS">Terminados</SelectItem>
                <SelectItem value="TODOS">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="com-filtro-persona">Persona</Label>
            <Select value={personFilter} onValueChange={setPersonFilter}>
              <SelectTrigger id="com-filtro-persona" className="w-48 max-sm:w-full">
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
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="com-filtro-acta">Acta</Label>
            <SearchableSelect
              id="com-filtro-acta"
              className="w-56 max-sm:w-full"
              options={meetingOptions}
              selected={meetingFilter}
              onSelect={setMeetingFilter}
              placeholder="Todas las actas"
              listLabel="Actas"
              clearLabel="Quitar filtro de acta"
              clearSearchLabel="Borrar búsqueda"
              truncated={meetingOptions.length > 25}
              truncatedMessage="Mostrando las primeras 25. Escribe para acotar."
              onSearch={setMeetingQuery}
              emptyContent="No hay actas."
            />
          </div>
          {filtersActive || search !== '' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-link max-sm:w-full"
              onClick={clearAll}
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
        {newButton}
      </div>

      <MasterDetail
        listTitle="Compromisos"
        detailHeadingRef={detailHeadingRef}
        list={
          <>
            <ListSearchBar
              label="Buscar compromisos"
              placeholder="Buscar por título, acta o solicitud"
              value={search}
              onChange={setSearch}
              busy={table.busy && table.status !== 'loading'}
              disabled={state === 'loading'}
              inputRef={searchRef}
              countText={
                state === 'loading'
                  ? 'Cargando compromisos…'
                  : listCountText(
                      table.total,
                      statusFilter === 'ABIERTOS' ? totals.openCommitments : null,
                      searching,
                      'compromiso',
                      'compromisos',
                    )
              }
            />
            <ServerListBody
              reloading={table.status === 'reloading'}
              reloadFailed={table.status === 'reload-error'}
              onRetry={table.reload}
              truncated={table.truncated}
              containerRef={listBodyRef}
            >
              <SelectableList
                label="Compromisos"
                loading={state === 'loading'}
                selectedId={selectedId}
                onSelect={setSelectedId}
                items={commitments.map((c) => ({
                  id: c.id,
                  title: c.title,
                  meta: meta(c),
                  badge:
                    c.dueStatus === 'VENCIDO' ? (
                      <span className="flex flex-col items-end gap-1">
                        <DueBadge status={c.dueStatus} daysToDue={c.daysToDue} dueDate={c.dueDate} />
                        {c.state === 'BLOQUEADO' ? <StatusBadge kind="record" value={c.state} /> : null}
                      </span>
                    ) : (
                      <StatusBadge kind="record" value={c.state} />
                    ),
                }))}
                empty={
                  searching
                    ? {
                        title: 'Sin resultados',
                        description: 'Ningún compromiso coincide con la búsqueda o los filtros.',
                        action: (
                          <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                            Limpiar búsqueda y filtros
                          </Button>
                        ),
                      }
                    : {
                        title: 'Aún no hay compromisos.',
                        description: 'Registra los compromisos desde el acta de la reunión.',
                      }
                }
              />
            </ServerListBody>
            <ListPager
              label="Paginación de compromisos"
              page={table.page}
              pageCount={table.pageCount}
              from={table.from}
              to={table.to}
              total={table.total}
              busy={table.busy}
              onPageChange={(p) => {
                table.setPage(p);
                listBodyRef.current?.scrollIntoView({ block: 'nearest' });
              }}
            />
          </>
        }
        detail={renderDetail()}
      />

      <CompromisoFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        processes={processes}
        people={people}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleSubmit}
      />

      <BlockCommitmentDialog
        target={blockTarget}
        onClose={() => setBlockTarget(null)}
        onDone={async () => {
          await reload();
        }}
        onClosedAfterSuccess={() => detailHeadingRef.current?.focus()}
      />
    </div>
  );
}
