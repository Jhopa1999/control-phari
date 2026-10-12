'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CoordinationPerson, Meeting, Process } from '@/lib/api-client';
import { formatDateOnly } from '@/lib/format';
import {
  MeetingError,
  createMeeting,
  deleteMeeting,
  listMeetings,
  updateMeeting,
} from '@/lib/meetings';
import { listCoordinationPeople } from '@/lib/worklog';
import { listProcesses } from '@/lib/team';
import { ReunionFormDialog, type ReunionFormValues } from './reunion-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

// Sin códigos internos visibles (design §13.1): si el proceso o la persona no
// vienen en las listas del alcance del actor, se nombra el caso en vez del id.
const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';

function messageOf(err: unknown): string {
  return err instanceof MeetingError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
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
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Meeting | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Confirmación de borrado (design §13.3). La reunión se fija al abrir: el
  // título no cambia mientras el diálogo se cierra y la selección pasa a otra.
  const [toDelete, setToDelete] = React.useState<Meeting | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // Destinos del foco (NIT 4).
  const listHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);

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
      setLoadError(null);
      setState('success');
      // Mantiene la selección si sigue existiendo; si no, toma la primera.
      setSelectedId((prev) => {
        if (prev && mts.some((m) => m.id === prev)) return prev;
        return mts[0]?.id ?? null;
      });
    } catch (err) {
      setLoadError(err instanceof MeetingError ? err.message : null);
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
    (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS,
    [processes],
  );
  const personName = React.useCallback(
    (id: string) => people.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PERSON,
    [people],
  );

  /** «fecha · hora · proceso»; sin hora, «fecha · proceso». */
  const meetingMeta = React.useCallback(
    (meeting: Meeting) =>
      [formatDateOnly(meeting.meetingDate), meeting.meetingTime, processName(meeting.processId)]
        .filter(Boolean)
        .join(' · '),
    [processName],
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
        toast.success('Reunión actualizada.');
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
        toast.success('Reunión creada.');
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
      toast.success('Reunión eliminada.');
      // load() selecciona la primera que quede (la eliminada ya no existe).
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeleting(false);
    }
  }

  // Tras eliminar, el botón pulsado ya no existe: el foco va al encabezado del
  // detalle que quede seleccionado o, si no queda ninguno, al título de la
  // lista (NIT 4).
  const returnFocusToDetail = React.useCallback(
    (): HTMLElement | null => detailHeadingRef.current ?? listHeadingRef.current,
    [],
  );

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
            title="Selecciona una reunión para ver su detalle."
            description="O crea una nueva para registrar la agenda y los acuerdos."
          />
        </Card>
      );
    }
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
            <p className="text-meta text-muted-foreground">{meetingMeta(selected)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            <Button
              type="button"
              variant="ghost-destructive"
              size="sm"
              loading={deleting}
              onClick={() => {
                setToDelete(selected);
                setDeleteOpen(true);
              }}
            >
              {deleting ? null : <Trash2 aria-hidden="true" />}
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEdit(selected)}
              disabled={deleting}
            >
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Participantes</h3>
            {selected.participantUserIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin participantes registrados.</p>
            ) : (
              <ul aria-label="Participantes" className="flex flex-wrap gap-2">
                {selected.participantUserIds.map((id) => (
                  <li key={id}>
                    <Badge variant="outline">{personName(id)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DescriptionList
            className="border-t pt-4"
            items={[
              { term: 'Agenda', value: selected.agenda },
              { term: 'Decisiones', value: selected.decisions },
              { term: 'Observaciones', value: selected.notes },
            ]}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Reuniones"
        description="Agenda y acuerdos de las reuniones del área, con sus participantes."
        actions={
          <Button type="button" onClick={openCreate} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nueva reunión
          </Button>
        }
      />

      {state === 'error' ? (
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar las reuniones."
            message={loadError}
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <MasterDetail
          listTitle="Reuniones"
          listHeadingRef={listHeadingRef}
          detailHeadingRef={detailHeadingRef}
          list={
            <SelectableList
              label="Reuniones"
              loading={state === 'loading' && meetings.length === 0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              items={meetings.map((meeting) => ({
                id: meeting.id,
                title: meeting.title,
                meta: meetingMeta(meeting),
                badge: <StatusBadge kind="record" value={meeting.state} />,
              }))}
              empty={{
                title: 'Aún no hay reuniones.',
                description: 'Registra una reunión con su agenda, participantes y acuerdos.',
                action: (
                  <Button type="button" variant="outline" size="sm" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Nueva reunión
                  </Button>
                ),
              }}
            />
          }
          detail={renderDetail()}
        />
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

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar la reunión «${toDelete?.title ?? ''}»?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar reunión"
        busy={deleting}
        onConfirm={async () => {
          if (toDelete) await handleDelete(toDelete);
        }}
        returnFocusTo={returnFocusToDetail}
      />
    </PageLayout>
  );
}
