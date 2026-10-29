'use client';

import * as React from 'react';
import { Download, Lock, LockOpen, Plus, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import type { Meeting, RecordState } from '@/lib/api-client';
import {
  CommitmentError,
  createCommitment,
  transitionCommitment,
  updateCommitment,
} from '@/lib/commitments';
import { formatDateOnly, localDateInputValue } from '@/lib/format';
import {
  MeetingError,
  closeMeeting,
  createMeeting,
  deleteMeeting,
  reopenMeeting,
  updateMeeting,
} from '@/lib/meetings';
import { downloadMinutes, printMinutes } from '@/lib/minutes';
import { nextStates, stateLabel } from '@/lib/record-state';
import { CompromisoFormDialog, type CompromisoFormValues } from './compromiso-form-dialog';
import { ReunionFormDialog, type ReunionFormValues } from './reunion-form-dialog';
import type { CoordinationData } from './reuniones-view';

const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';
const DONE = new Set(['COMPLETADO', 'ARCHIVADO']);

function messageOf(err: unknown): string {
  return err instanceof MeetingError || err instanceof CommitmentError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Pestaña «Actas»: lista de reuniones y el acta seleccionada con su agenda,
 * decisiones y la lista de compromisos acordados. Desde el acta abierta se
 * registran compromisos; el acta se cierra como registro y se puede descargar o
 * imprimir. El backend valida permisos y reglas (acta cerrada → 409).
 */
export function ActasPanel({
  data,
  initialMeetingId,
  onOpenCommitment,
}: {
  data: CoordinationData;
  initialMeetingId: string | null;
  onOpenCommitment: (commitmentId: string) => void;
}): React.ReactElement {
  const { meetings, commitments, processes, people, state, error, reload } = data;
  const { permissions } = useActor();
  const myId = permissions?.userId ?? null;
  const grants = permissions?.grants ?? [];
  const isJefe = grants.some((g) => g.roleCode === 'JEFE_AREA');
  const isManagerOf = (processId: string) =>
    isJefe || grants.some((g) => g.roleCode === 'LIDER_PROCESO' && g.processId === processId);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [meetingOpen, setMeetingOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Meeting | null>(null);
  const [commitmentOpen, setCommitmentOpen] = React.useState(false);
  const [editingCommitmentId, setEditingCommitmentId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<Meeting | null>(null);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const listHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);

  // Selección: la de la URL (notificación o pestaña Compromisos) o la primera.
  React.useEffect(() => {
    if (state !== 'success') return;
    setSelectedId((prev) => {
      if (initialMeetingId && meetings.some((m) => m.id === initialMeetingId)) return initialMeetingId;
      if (prev && meetings.some((m) => m.id === prev)) return prev;
      return meetings[0]?.id ?? null;
    });
  }, [state, meetings, initialMeetingId]);

  const selected = meetings.find((m) => m.id === selectedId) ?? null;
  const processName = (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS;
  const personName = (id: string | null) =>
    id ? (people.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PERSON) : 'Sin asignar';
  const meetingMeta = (m: Meeting) =>
    [formatDateOnly(m.meetingDate), m.meetingTime, processName(m.processId)].filter(Boolean).join(' · ');
  const today = localDateInputValue();
  const editingCommitment = editingCommitmentId
    ? (commitments.find((c) => c.id === editingCommitmentId) ?? null)
    : null;

  async function handleMeetingSubmit(values: ReunionFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      const body = {
        title: values.title,
        meetingDate: values.meetingDate,
        meetingTime: trimOrUndefined(values.meetingTime),
        participantUserIds: values.participantUserIds,
        responsibleUserId: trimOrUndefined(values.responsibleUserId),
        agenda: trimOrUndefined(values.agenda),
        decisions: trimOrUndefined(values.decisions),
        notes: trimOrUndefined(values.notes),
      };
      if (editing) {
        await updateMeeting(editing.id, body);
        toast.success('Acta actualizada.');
      } else {
        const created = await createMeeting({ processId: values.processId, ...body });
        toast.success('Acta creada. Registra ahora los compromisos acordados.');
        setSelectedId(created.id);
      }
      setMeetingOpen(false);
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

  async function handleCommitmentSubmit(values: CompromisoFormValues): Promise<void> {
    if (!selected) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const body = {
        title: values.title,
        dueDate: values.dueDate,
        assignedUserId: trimOrUndefined(values.assignedUserId),
        responsibleUserId: trimOrUndefined(values.responsibleUserId),
        expectedResult: trimOrUndefined(values.expectedResult),
        blockers: trimOrUndefined(values.blockers),
      };
      if (editingCommitment) {
        await updateCommitment(editingCommitment.id, body);
        toast.success('Compromiso actualizado.');
      } else {
        await createCommitment({
          ...body,
          processId: selected.processId,
          sourceMeetingId: selected.id,
        });
        toast.success('Compromiso agregado al acta.');
      }
      setCommitmentOpen(false);
      setEditingCommitmentId(null);
      await reload();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function exportCtx(m: Meeting) {
    return { processName: processName(m.processId), personName };
  }

  function renderCommitments(m: Meeting): React.ReactNode {
    return (
      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {`Compromisos (${m.commitmentsTotal}${m.commitmentsTotal > 0 ? `, ${m.commitmentsOpen} abiertos` : ''})`}
          </h3>
          {!m.closed ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingCommitmentId(null);
                setFormError(null);
                setCommitmentOpen(true);
              }}
            >
              <Plus aria-hidden="true" />
              Agregar compromiso
            </Button>
          ) : null}
        </div>
        {m.commitments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.closed ? 'El acta se cerró sin compromisos.' : 'Aún no hay compromisos en esta acta.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Compromisos del acta">
            {m.commitments.map((c) => {
              const full = commitments.find((x) => x.id === c.id);
              const overdue = !DONE.has(c.state) && c.dueDate < today;
              return (
                <li key={c.id} className="flex flex-col gap-2 rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-left text-sm font-medium underline-offset-4 hover:underline disabled:no-underline"
                      disabled={!full}
                      onClick={() => onOpenCommitment(c.id)}
                    >
                      {c.title}
                    </button>
                    <StatusBadge kind="record" value={c.state} />
                    {overdue ? <Badge variant="danger">Vencido</Badge> : null}
                  </div>
                  <p className="text-meta text-muted-foreground">
                    {`Asignado: ${personName(c.assignedUserId)} · Vence ${formatDateOnly(c.dueDate)}`}
                    {c.responsibleUserId ? ` · Responsable: ${personName(c.responsibleUserId)}` : ''}
                  </p>
                  {full ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setEditingCommitmentId(c.id);
                          setFormError(null);
                          setCommitmentOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      {nextStates(c.state).map((to: RecordState) => (
                        <Button
                          key={to}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => transitionCommitment(c.id, { toState: to }),
                              `Compromiso movido a ${stateLabel(to)}.`,
                            )
                          }
                        >
                          {stateLabel(to)}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
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
            title="Selecciona un acta para ver su detalle."
            description="O crea una nueva para registrar la agenda, las decisiones y los compromisos."
          />
        </Card>
      );
    }
    const m = selected;
    const canClose = !m.closed && (m.responsibleUserId === myId || isManagerOf(m.processId));
    const canReopen = m.closed && isManagerOf(m.processId);
    return (
      <Card>
        <CardHeader className="gap-3 border-b">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                ref={detailHeadingRef}
                tabIndex={-1}
                className="rounded-sm text-lg font-semibold wrap-break-word focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {m.title}
              </h2>
              <StatusBadge kind="minutes" value={m.state} />
            </div>
            <p className="text-meta text-muted-foreground">{meetingMeta(m)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => downloadMinutes(m, exportCtx(m))}>
              <Download aria-hidden="true" />
              Descargar acta
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!printMinutes(m, exportCtx(m))) {
                  toast.error('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
                }
              }}
            >
              <Printer aria-hidden="true" />
              Imprimir / PDF
            </Button>
            {!m.closed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setEditing(m);
                  setFormError(null);
                  setMeetingOpen(true);
                }}
              >
                Editar acta
              </Button>
            ) : null}
            {canClose ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => setCloseOpen(true)}>
                <Lock aria-hidden="true" />
                Cerrar acta
              </Button>
            ) : null}
            {canReopen ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => reopenMeeting(m.id), 'Acta reabierta.')}
              >
                <LockOpen aria-hidden="true" />
                Reabrir acta
              </Button>
            ) : null}
            {!m.closed && m.commitmentsTotal === 0 ? (
              <Button
                type="button"
                variant="ghost-destructive"
                size="sm"
                disabled={busy}
                onClick={() => setToDelete(m)}
              >
                <Trash2 aria-hidden="true" />
                Eliminar
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-4">
          {m.closed ? (
            <InlineNotice tone="info">
              El acta está cerrada y queda como registro. Sus compromisos siguen su propio seguimiento.
            </InlineNotice>
          ) : null}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Participantes</h3>
            {m.participantUserIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin participantes registrados.</p>
            ) : (
              <ul aria-label="Participantes" className="flex flex-wrap gap-2">
                {m.participantUserIds.map((id) => (
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
              { term: 'Responsable', value: m.responsibleUserId ? personName(m.responsibleUserId) : null },
              { term: 'Agenda', value: m.agenda },
              { term: 'Decisiones', value: m.decisions },
              { term: 'Observaciones', value: m.notes },
            ]}
          />
          {renderCommitments(m)}
        </CardContent>
      </Card>
    );
  }

  const newButton = (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        setEditing(null);
        setFormError(null);
        setMeetingOpen(true);
      }}
      disabled={state === 'loading'}
    >
      <Plus aria-hidden="true" />
      Nueva acta
    </Button>
  );

  return (
    <>
      {state === 'error' ? (
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar las actas."
            message={error}
            onRetry={() => void reload()}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">{newButton}</div>
          <MasterDetail
            listTitle="Actas"
            listHeadingRef={listHeadingRef}
            detailHeadingRef={detailHeadingRef}
            list={
              <SelectableList
                label="Actas"
                loading={state === 'loading' && meetings.length === 0}
                selectedId={selectedId}
                onSelect={setSelectedId}
                items={meetings.map((m) => ({
                  id: m.id,
                  title: m.title,
                  meta: `${meetingMeta(m)} · ${m.commitmentsTotal} compromiso${m.commitmentsTotal === 1 ? '' : 's'}${m.commitmentsOpen > 0 ? ` (${m.commitmentsOpen} abiertos)` : ''}`,
                  badge: <StatusBadge kind="minutes" value={m.state} />,
                }))}
                empty={{
                  title: 'Aún no hay actas.',
                  description: 'Registra una reunión con su agenda, participantes, decisiones y compromisos.',
                  action: newButton,
                }}
              />
            }
            detail={renderDetail()}
          />
        </div>
      )}

      <ReunionFormDialog
        open={meetingOpen}
        onOpenChange={(o) => {
          setMeetingOpen(o);
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
        onSubmit={handleMeetingSubmit}
      />

      <CompromisoFormDialog
        open={commitmentOpen}
        onOpenChange={(o) => {
          setCommitmentOpen(o);
          if (!o) {
            setEditingCommitmentId(null);
            setFormError(null);
          }
        }}
        editing={editingCommitment}
        processes={processes}
        people={people}
        meetings={meetings}
        fixedMeeting={selected}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleCommitmentSubmit}
      />

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        tone="default"
        title={`¿Cerrar el acta «${selected?.title ?? ''}»?`}
        description="El acta quedará como registro: no se podrá editar ni se le podrán agregar compromisos. Los compromisos ya registrados siguen su seguimiento."
        confirmLabel="Cerrar acta"
        onConfirm={async () => {
          if (selected) await run(() => closeMeeting(selected.id), 'Acta cerrada.');
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title={`¿Eliminar el acta «${toDelete?.title ?? ''}»?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar acta"
        onConfirm={async () => {
          const target = toDelete;
          setToDelete(null);
          if (target) await run(() => deleteMeeting(target.id), 'Acta eliminada.');
        }}
        returnFocusTo={() => detailHeadingRef.current ?? listHeadingRef.current}
      />
    </>
  );
}
