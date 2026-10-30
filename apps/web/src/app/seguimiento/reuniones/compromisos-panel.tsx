'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
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
  transitionCommitment,
  updateCommitment,
} from '@/lib/commitments';
import { formatDateOnly, localDateInputValue } from '@/lib/format';
import { nextStates, stateLabel } from '@/lib/record-state';
import { CompromisoFormDialog, type CompromisoFormValues } from './compromiso-form-dialog';
import type { CoordinationData } from './reuniones-view';

const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';
const TRANSITIONS_LABEL_ID = 'com-transiciones';
const DONE = new Set(['COMPLETADO', 'ARCHIVADO']);

const ALL = 'ALL';
const WITHOUT_MINUTES = 'SIN_ACTA';
type StatusFilter = 'ABIERTOS' | 'VENCIDOS' | 'TERMINADOS' | 'TODOS';

function messageOf(err: unknown): string {
  return err instanceof CommitmentError ? err.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Pestaña «Compromisos»: seguimiento consolidado de todos los compromisos en
 * alcance, con o sin acta de origen, filtrables por estado, responsable y acta.
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
  const { meetings, commitments, processes, people, state, error, reload } = data;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ABIERTOS');
  const [personFilter, setPersonFilter] = React.useState(ALL);
  const [meetingFilter, setMeetingFilter] = React.useState(ALL);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Commitment | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [transitioningTo, setTransitioningTo] = React.useState<RecordState | null>(null);
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const today = localDateInputValue();

  const isOverdue = React.useCallback(
    (c: Commitment) => !DONE.has(c.state) && c.dueDate < today,
    [today],
  );

  const filtered = React.useMemo(
    () =>
      commitments.filter((c) => {
        if (statusFilter === 'ABIERTOS' && DONE.has(c.state)) return false;
        if (statusFilter === 'TERMINADOS' && !DONE.has(c.state)) return false;
        if (statusFilter === 'VENCIDOS' && !isOverdue(c)) return false;
        if (personFilter !== ALL && c.assignedUserId !== personFilter && c.responsibleUserId !== personFilter) return false;
        if (meetingFilter === WITHOUT_MINUTES && c.sourceMeetingId) return false;
        if (meetingFilter !== ALL && meetingFilter !== WITHOUT_MINUTES && c.sourceMeetingId !== meetingFilter) return false;
        return true;
      }),
    [commitments, statusFilter, personFilter, meetingFilter, isOverdue],
  );

  // Selección inicial desde la URL (notificación) o desde un acta.
  useResetOnChange([state, commitments, initialCommitmentId], () => {
    if (state !== 'success') return;
    if (initialCommitmentId && commitments.some((c) => c.id === initialCommitmentId)) {
      setStatusFilter('TODOS');
      setPersonFilter(ALL);
      setMeetingFilter(ALL);
      setSelectedId(initialCommitmentId);
    }
  });

  useResetOnChange([filtered], () => {
    setSelectedId((prev) => {
      if (prev && filtered.some((c) => c.id === prev)) return prev;
      return filtered[0]?.id ?? null;
    });
  });

  const selected = commitments.find((c) => c.id === selectedId) ?? null;
  const processName = (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS;
  const personName = (id: string | null) =>
    id ? (people.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PERSON) : null;
  const meta = (c: Commitment) =>
    `Vence ${formatDateOnly(c.dueDate)} · ${c.sourceMeetingTitle ? `Acta: ${c.sourceMeetingTitle}` : 'Sin acta'}`;

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
        await updateCommitment(editing.id, body);
        toast.success('Compromiso actualizado.');
      } else {
        const created = await createCommitment({ processId: values.processId, ...body });
        toast.success('Compromiso creado.');
        setStatusFilter('ABIERTOS');
        setSelectedId(created.id);
      }
      setOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(c: Commitment, toState: RecordState): Promise<void> {
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
    if (state === 'loading' && !selected) {
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
              {isOverdue(selected) ? <Badge variant="danger">Vencido</Badge> : null}
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
              { term: 'Resultado esperado', value: selected.expectedResult, span: 2 },
              { term: 'Bloqueos', value: selected.blockers, span: 2 },
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
        <ErrorState title="No fue posible cargar los compromisos." message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="com-filtro-estado">Estado</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger id="com-filtro-estado" className="w-40">
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
              <SelectTrigger id="com-filtro-persona" className="w-48">
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
            <Select value={meetingFilter} onValueChange={setMeetingFilter}>
              <SelectTrigger id="com-filtro-acta" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                <SelectItem value={WITHOUT_MINUTES}>Sin acta</SelectItem>
                {meetings.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {`${m.title} (${formatDateOnly(m.meetingDate)})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {newButton}
      </div>

      <MasterDetail
        listTitle="Compromisos"
        detailHeadingRef={detailHeadingRef}
        list={
          <SelectableList
            label="Compromisos"
            loading={state === 'loading' && commitments.length === 0}
            selectedId={selectedId}
            onSelect={setSelectedId}
            items={filtered.map((c) => ({
              id: c.id,
              title: c.title,
              meta: meta(c),
              badge: isOverdue(c) ? (
                <Badge variant="danger">Vencido</Badge>
              ) : (
                <StatusBadge kind="record" value={c.state} />
              ),
            }))}
            empty={{
              title: commitments.length === 0 ? 'Aún no hay compromisos.' : 'No hay compromisos con estos filtros.',
              description:
                commitments.length === 0
                  ? 'Registra los compromisos desde el acta de la reunión.'
                  : 'Cambia los filtros para ver otros compromisos.',
            }}
          />
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
        meetings={meetings}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
