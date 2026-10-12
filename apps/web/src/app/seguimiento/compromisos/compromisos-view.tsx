'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  Commitment,
  CoordinationPerson,
  Meeting,
  Process,
  RecordState,
} from '@/lib/api-client';
import {
  CommitmentError,
  createCommitment,
  listCommitments,
  transitionCommitment,
  updateCommitment,
} from '@/lib/commitments';
import { formatDateOnly } from '@/lib/format';
import { listMeetings } from '@/lib/meetings';
import { listCoordinationPeople } from '@/lib/worklog';
import { listProcesses } from '@/lib/team';
import { nextStates, stateLabel } from '@/lib/record-state';
import {
  CompromisoFormDialog,
  type CompromisoFormValues,
} from './compromiso-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof CommitmentError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Id del rótulo del grupo de transiciones (aria-labelledby). */
const TRANSITIONS_LABEL_ID = 'com-transiciones';

// Sin códigos internos visibles (design §13.1): si el proceso, la persona o la
// reunión no vienen en las listas del alcance del actor, se nombra el caso.
const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';
const OUT_OF_SCOPE_MEETING = 'Reunión fuera de tu alcance';

export function CompromisosView(): React.ReactElement {
  const [commitments, setCommitments] = React.useState<Commitment[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [meetings, setMeetings] = React.useState<Meeting[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Commitment | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  // Destino en curso: su botón muestra el spinner y los demás se deshabilitan.
  const [transitioningTo, setTransitioningTo] = React.useState<RecordState | null>(null);

  // Destino del foco: el encabezado del detalle (MasterDetail en <1024 px y
  // tras una transición, cuando el botón pulsado desaparece; NIT 4).
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [cmts, procs, ppl, mts] = await Promise.all([
        listCommitments(),
        listProcesses().catch(() => [] as Process[]),
        listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
        listMeetings().catch(() => [] as Meeting[]),
      ]);
      setCommitments(cmts);
      setProcesses(procs);
      setPeople(ppl);
      setMeetings(mts);
      setLoadError(null);
      setState('success');
      // Mantiene la selección si sigue existiendo; si no, toma el primero.
      setSelectedId((prev) => {
        if (prev && cmts.some((c) => c.id === prev)) return prev;
        return cmts[0]?.id ?? null;
      });
    } catch (err) {
      setLoadError(err instanceof CommitmentError ? err.message : null);
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = React.useMemo(
    () => commitments.find((c) => c.id === selectedId) ?? null,
    [commitments, selectedId],
  );

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS,
    [processes],
  );
  const personName = React.useCallback(
    (id: string | null) =>
      id ? (people.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PERSON) : null,
    [people],
  );
  const meetingTitle = React.useCallback(
    (id: string | null) =>
      id ? (meetings.find((m) => m.id === id)?.title ?? OUT_OF_SCOPE_MEETING) : null,
    [meetings],
  );

  /** «Vence {fecha} · proceso». */
  const commitmentMeta = React.useCallback(
    (commitment: Commitment) =>
      `Vence ${formatDateOnly(commitment.dueDate)} · ${processName(commitment.processId)}`,
    [processName],
  );

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setOpen(true);
  }
  function openEdit(commitment: Commitment) {
    setEditing(commitment);
    setFormError(null);
    setOpen(true);
  }

  async function handleSubmit(values: CompromisoFormValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateCommitment(editing.id, {
          title: values.title,
          dueDate: values.dueDate,
          assignedUserId: trimOrUndefined(values.assignedUserId),
          responsibleUserId: trimOrUndefined(values.responsibleUserId),
          sourceMeetingId: trimOrUndefined(values.sourceMeetingId),
          expectedResult: trimOrUndefined(values.expectedResult),
          blockers: trimOrUndefined(values.blockers),
        });
        toast.success('Compromiso actualizado.');
      } else {
        const created = await createCommitment({
          processId: values.processId,
          title: values.title,
          dueDate: values.dueDate,
          assignedUserId: trimOrUndefined(values.assignedUserId),
          responsibleUserId: trimOrUndefined(values.responsibleUserId),
          sourceMeetingId: trimOrUndefined(values.sourceMeetingId),
          expectedResult: trimOrUndefined(values.expectedResult),
          blockers: trimOrUndefined(values.blockers),
        });
        toast.success('Compromiso creado.');
        setSelectedId(created.id);
      }
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(commitment: Commitment, toState: RecordState) {
    setTransitioningTo(toState);
    try {
      await transitionCommitment(commitment.id, { toState });
      toast.success(`Compromiso movido a ${stateLabel(toState)}.`);
      await load();
      // El botón pulsado ya no existe con el nuevo estado: el foco va al
      // encabezado del detalle si se perdió (NIT 4).
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
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      );
    }
    if (!selected) {
      return (
        <Card>
          <EmptyState
            title="Selecciona un compromiso para ver su detalle."
            description="O crea uno nuevo para registrar un acuerdo con vencimiento."
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
            </div>
            <p className="text-meta text-muted-foreground">{commitmentMeta(selected)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEdit(selected)}
            >
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-4">
          <DescriptionList
            columns={2}
            items={[
              { term: 'Asignado', value: personName(selected.assignedUserId) },
              { term: 'Responsable', value: personName(selected.responsibleUserId) },
              {
                term: 'Reunión de origen',
                value: meetingTitle(selected.sourceMeetingId),
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
              <p className="text-meta text-muted-foreground">
                No hay transiciones disponibles desde este estado.
              </p>
            ) : (
              <div
                role="group"
                aria-labelledby={TRANSITIONS_LABEL_ID}
                className="flex flex-wrap gap-2"
              >
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

  return (
    <PageLayout>
      <PageHeader
        title="Compromisos"
        description="Acuerdos con vencimiento y responsable. Puedes relacionarlos con una reunión de origen."
        actions={
          <Button type="button" onClick={openCreate} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nuevo compromiso
          </Button>
        }
      />

      {state === 'error' ? (
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar los compromisos."
            message={loadError}
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <MasterDetail
          listTitle="Compromisos"
          detailHeadingRef={detailHeadingRef}
          list={
            <SelectableList
              label="Compromisos"
              loading={state === 'loading' && commitments.length === 0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              items={commitments.map((commitment) => ({
                id: commitment.id,
                title: commitment.title,
                meta: commitmentMeta(commitment),
                badge: <StatusBadge kind="record" value={commitment.state} />,
              }))}
              empty={{
                title: 'Aún no hay compromisos.',
                description: 'Registra un acuerdo con su vencimiento y su responsable.',
                action: (
                  <Button type="button" variant="outline" size="sm" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Nuevo compromiso
                  </Button>
                ),
              }}
            />
          }
          detail={renderDetail()}
        />
      )}

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
    </PageLayout>
  );
}
