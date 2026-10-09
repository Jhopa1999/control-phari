'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { CoordinationPerson, Meeting, Process } from '@/lib/api-client';
import {
  MeetingError,
  createMeeting,
  deleteMeeting,
  listMeetings,
  updateMeeting,
} from '@/lib/meetings';
import { listCoordinationPeople } from '@/lib/worklog';
import { listProcesses } from '@/lib/team';
import { stateLabel } from '@/lib/record-state';
import {
  ReunionFormDialog,
  type ReunionFormValues,
} from './reunion-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof MeetingError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function ReunionesView(): React.ReactElement {
  const [meetings, setMeetings] = React.useState<Meeting[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Meeting | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [mts, procs, ppl] = await Promise.all([
        listMeetings(),
        listProcesses().catch(() => [] as Process[]),
        listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
      ]);
      setMeetings(mts);
      setProcesses(procs);
      setPeople(ppl);
      setState('success');
      setSelectedId((prev) => {
        if (prev && mts.some((m) => m.id === prev)) return prev;
        return mts[0]?.id ?? null;
      });
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = React.useMemo(
    () => meetings.find((m) => m.id === selectedId) ?? null,
    [meetings, selectedId],
  );

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );
  const personName = React.useCallback(
    (id: string) => people.find((p) => p.id === id)?.name ?? id,
    [people],
  );

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setOpen(true);
  }
  function openEdit(meeting: Meeting) {
    setEditing(meeting);
    setFormError(null);
    setOpen(true);
  }

  async function handleSubmit(values: ReunionFormValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateMeeting(editing.id, {
          title: values.title,
          meetingDate: values.meetingDate,
          meetingTime: trimOrUndefined(values.meetingTime),
          participantUserIds: values.participantUserIds,
          responsibleUserId: trimOrUndefined(values.responsibleUserId),
          agenda: trimOrUndefined(values.agenda),
          decisions: trimOrUndefined(values.decisions),
          notes: trimOrUndefined(values.notes),
        });
        toast.success('Reunion actualizada.');
      } else {
        const created = await createMeeting({
          processId: values.processId,
          title: values.title,
          meetingDate: values.meetingDate,
          meetingTime: trimOrUndefined(values.meetingTime),
          participantUserIds: values.participantUserIds,
          responsibleUserId: trimOrUndefined(values.responsibleUserId),
          agenda: trimOrUndefined(values.agenda),
          decisions: trimOrUndefined(values.decisions),
          notes: trimOrUndefined(values.notes),
        });
        toast.success('Reunion creada.');
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

  async function handleDelete(meeting: Meeting) {
    setDeleting(true);
    try {
      await deleteMeeting(meeting.id);
      toast.success('Reunion eliminada.');
      setSelectedId(null);
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reuniones</h1>
          <p className="text-sm text-muted-foreground">
            Agenda y acuerdos de las reuniones del area, con sus participantes.
          </p>
        </div>
        <Button onClick={openCreate} disabled={state === 'loading'}>
          <Plus aria-hidden="true" />
          Nueva reunion
        </Button>
      </header>

      {state === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No fue posible cargar las reuniones.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section aria-labelledby="reuniones-heading" className="flex flex-col gap-3">
            <h2
              id="reuniones-heading"
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
              ) : meetings.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm font-medium">Aun no hay reuniones.</p>
                  <Button variant="outline" size="sm" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Nueva reunion
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {meetings.map((meeting) => (
                    <li key={meeting.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(meeting.id)}
                        aria-current={meeting.id === selectedId}
                        className={`flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-muted/50 ${
                          meeting.id === selectedId ? 'bg-muted' : ''
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{meeting.title}</span>
                          <Badge variant="secondary">
                            {stateLabel(meeting.state)}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {meeting.meetingDate}
                          {meeting.meetingTime ? ` · ${meeting.meetingTime}` : ''}{' '}
                          · {processName(meeting.processId)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-label="Detalle de la reunion" className="flex flex-col gap-3">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm font-medium">Selecciona una reunion.</p>
                <p className="text-sm text-muted-foreground">
                  O crea una nueva para registrar la agenda y los acuerdos.
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
                        {selected.meetingDate}
                        {selected.meetingTime
                          ? ` · ${selected.meetingTime}`
                          : ''}{' '}
                        · {processName(selected.processId)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(selected)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deleting}
                        onClick={() => void handleDelete(selected)}
                      >
                        {deleting ? 'Borrando...' : 'Borrar'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">Participantes</h3>
                    {selected.participantUserIds.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Sin participantes registrados.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selected.participantUserIds.map((id) => (
                          <Badge key={id} variant="outline">
                            {personName(id)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator />

                  <dl className="grid gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Agenda</dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.agenda ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Decisiones</dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.decisions ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Observaciones</dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.notes ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      )}

      <ReunionFormDialog
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
    </div>
  );
}
