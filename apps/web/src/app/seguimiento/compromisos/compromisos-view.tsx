'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
    : 'Ocurrio un error inesperado.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function CompromisosView(): React.ReactElement {
  const [commitments, setCommitments] = React.useState<Commitment[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [meetings, setMeetings] = React.useState<Meeting[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Commitment | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [transitioning, setTransitioning] = React.useState(false);

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
      setState('success');
      setSelectedId((prev) => {
        if (prev && cmts.some((c) => c.id === prev)) return prev;
        return cmts[0]?.id ?? null;
      });
    } catch {
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
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );
  const personName = React.useCallback(
    (id: string | null) =>
      id ? (people.find((p) => p.id === id)?.name ?? id) : '—',
    [people],
  );
  const meetingTitle = React.useCallback(
    (id: string | null) =>
      id ? (meetings.find((m) => m.id === id)?.title ?? id) : '—',
    [meetings],
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
    setTransitioning(true);
    try {
      await transitionCommitment(commitment.id, { toState });
      toast.success(`Compromiso movido a ${stateLabel(toState)}.`);
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Compromisos</h1>
          <p className="text-sm text-muted-foreground">
            Acuerdos con vencimiento y responsable. Puedes relacionarlos con una
            reunion fuente.
          </p>
        </div>
        <Button onClick={openCreate} disabled={state === 'loading'}>
          <Plus aria-hidden="true" />
          Nuevo compromiso
        </Button>
      </header>

      {state === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No fue posible cargar los compromisos.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section aria-labelledby="compromisos-heading" className="flex flex-col gap-3">
            <h2
              id="compromisos-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Lista
            </h2>
            <div className="rounded-lg border bg-card">
              {state === 'loading' ? (
                <div className="flex flex-col gap-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : commitments.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm font-medium">Aun no hay compromisos.</p>
                  <Button variant="outline" size="sm" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Nuevo compromiso
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {commitments.map((commitment) => (
                    <li key={commitment.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(commitment.id)}
                        aria-current={commitment.id === selectedId}
                        className={`flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-muted/50 ${
                          commitment.id === selectedId ? 'bg-muted' : ''
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{commitment.title}</span>
                          <Badge variant="secondary">
                            {stateLabel(commitment.state)}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Vence {commitment.dueDate} ·{' '}
                          {processName(commitment.processId)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-label="Detalle del compromiso" className="flex flex-col gap-3">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm font-medium">Selecciona un compromiso.</p>
                <p className="text-sm text-muted-foreground">
                  O crea uno nuevo para registrar un acuerdo con vencimiento.
                </p>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="flex items-center gap-2">
                        {selected.title}
                        <Badge variant="secondary">
                          {stateLabel(selected.state)}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Vence {selected.dueDate} ·{' '}
                        {processName(selected.processId)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(selected)}
                    >
                      Editar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Asignado</dt>
                      <dd>{personName(selected.assignedUserId)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Responsable</dt>
                      <dd>{personName(selected.responsibleUserId)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Reunion fuente</dt>
                      <dd>{meetingTitle(selected.sourceMeetingId)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">
                        Resultado esperado
                      </dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.expectedResult ?? '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Bloqueos</dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.blockers ?? '—'}
                      </dd>
                    </div>
                  </dl>

                  <Separator />

                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">Cambiar estado</h3>
                    {nextStates(selected.state).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No hay transiciones disponibles desde este estado.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {nextStates(selected.state).map((to) => (
                          <Button
                            key={to}
                            variant="outline"
                            size="sm"
                            disabled={transitioning}
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
            )}
          </section>
        </div>
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
    </div>
  );
}
