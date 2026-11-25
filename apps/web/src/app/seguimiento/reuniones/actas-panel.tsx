'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Download, Eye, Lock, LockOpen, Plus, Printer, Trash2, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { DueBadge } from '@/components/due-badge';
import { InlineNotice } from '@/components/inline-notice';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { StatusBadge } from '@/components/status-badge';
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
import {
  formatDateOnly,
  formatDuration,
  formatTimeRange,
} from '@/lib/format';
import {
  MeetingError,
  PARTICIPANT_NOT_IN_PROCESS_MESSAGE,
  closeMeeting,
  createMeeting,
  deleteMeeting,
  reopenMeeting,
  updateMeeting,
} from '@/lib/meetings';
import { downloadMinutes, printMinutes } from '@/lib/minutes';
import { nextStates, stateLabel } from '@/lib/record-state';
import { PERSON_NOT_IN_PROCESS_MESSAGE } from '@/lib/use-person-error';
import { CompromisoFormDialog, type CompromisoFormValues } from './compromiso-form-dialog';
import { RegistrarDuracionDialog } from './registrar-duracion-dialog';
import { ReunionFormDialog, type ReunionFormValues } from './reunion-form-dialog';
import type { CoordinationData } from './reuniones-view';

const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';
/** Con más participantes que esto, el resto queda tras «Ver los N restantes». */
const PARTICIPANTS_VISIBLE = 8;
const FIRST_OWN_COMMITMENT_ID = 'acta-compromiso-propio';
const ROLE_CHIP = 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';

function messageOf(err: unknown): string {
  return err instanceof MeetingError || err instanceof CommitmentError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/** Horario y duración de una reunión para listados: «10:00 – 11:00 · 1 h». */
function meetingSchedule(m: Meeting): string | null {
  const range = formatTimeRange(m.meetingTime, m.meetingEndTime);
  if (m.durationMinutes) {
    return range ? `${range} · ${formatDuration(m.durationMinutes)}` : formatDuration(m.durationMinutes);
  }
  return range ? `${range} · sin duración` : null;
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
  // Aviso del cierre rechazado (p. ej. falta la duración): se muestra en el acta.
  const [closeError, setCloseError] = React.useState<string | null>(null);
  const [focusDuration, setFocusDuration] = React.useState(false);
  const [showAllParticipants, setShowAllParticipants] = React.useState(false);
  const [durationOpen, setDurationOpen] = React.useState(false);
  const listHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);

  // Selección: la de la URL (notificación o pestaña Compromisos) o la primera.
  useResetOnChange([state, meetings, initialMeetingId], () => {
    if (state !== 'success') return;
    setSelectedId((prev) => {
      if (initialMeetingId && meetings.some((m) => m.id === initialMeetingId)) return initialMeetingId;
      if (prev && meetings.some((m) => m.id === prev)) return prev;
      return meetings[0]?.id ?? null;
    });
  });

  // Cambiar de acta descarta el aviso de un cierre rechazado.
  useResetOnChange([selectedId], () => {
    setCloseError(null);
    setShowAllParticipants(false);
  });

  const selected = meetings.find((m) => m.id === selectedId) ?? null;
  const processName = (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS;
  const meetingProcessName = (m: Meeting) => m.processName || processName(m.processId);
  const personName = (id: string | null) =>
    id ? (people.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PERSON) : 'Sin asignar';
  /** Nombre de una persona del acta: los datos del acta primero, luego la lista de personas. */
  const meetingPersonName = (m: Meeting, id: string | null): string => {
    if (!id) return 'Sin asignar';
    const fromMeeting =
      m.participants.find((p) => p.id === id)?.name ??
      (m.responsibleUserId === id ? m.responsibleUserName : null) ??
      m.commitments.find((c) => c.assignedUserId === id)?.assignedUserName ??
      m.commitments.find((c) => c.responsibleUserId === id)?.responsibleUserName;
    return fromMeeting ?? personName(id);
  };
  const meetingMeta = (m: Meeting) =>
    [formatDateOnly(m.meetingDate), meetingSchedule(m), meetingProcessName(m)]
      .filter(Boolean)
      .join(' · ');
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
        responsibleUserId: trimOrUndefined(values.responsibleUserId),
        agenda: trimOrUndefined(values.agenda),
        decisions: trimOrUndefined(values.decisions),
        notes: trimOrUndefined(values.notes),
      };
      if (editing) {
        // Los participantes solo se reenvían si cambiaron: reenviar el set guardado no debe fallar.
        const saved = new Set(editing.participantUserIds);
        const participantsChanged =
          values.participantUserIds.length !== saved.size ||
          values.participantUserIds.some((id) => !saved.has(id));
        await updateMeeting(editing.id, {
          ...body,
          ...(participantsChanged ? { participantUserIds: values.participantUserIds } : {}),
          // En la edición, null borra la duración registrada.
          durationMinutes: values.durationMinutes,
        });
        toast.success('Acta actualizada.');
      } else {
        const created = await createMeeting({
          processId: values.processId,
          ...body,
          participantUserIds: values.participantUserIds,
          durationMinutes: values.durationMinutes ?? undefined,
        });
        const notified = created.participantUserIds.filter((id) => id !== myId).length;
        toast.success(
          notified > 0
            ? `Acta creada. Se avisó a ${notified} ${notified === 1 ? 'participante' : 'participantes'}.`
            : 'Acta creada. Registra ahora los compromisos acordados.',
        );
        setSelectedId(created.id);
      }
      setMeetingOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      // La persona fuera de alcance se muestra junto al selector, sin toast.
      if (message !== PERSON_NOT_IN_PROCESS_MESSAGE && message !== PARTICIPANT_NOT_IN_PROCESS_MESSAGE) {
        toast.error(message);
      }
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
      // La persona fuera de alcance se muestra junto al selector, sin toast.
      if (message !== PERSON_NOT_IN_PROCESS_MESSAGE && message !== PARTICIPANT_NOT_IN_PROCESS_MESSAGE) {
        toast.error(message);
      }
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

  async function handleClose(m: Meeting): Promise<void> {
    setBusy(true);
    try {
      await closeMeeting(m.id);
      setCloseError(null);
      toast.success('Acta cerrada.');
      await reload();
    } catch (err) {
      const message = messageOf(err);
      setCloseError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDurationSubmit(durationMinutes: number): Promise<void> {
    if (!selected) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await updateMeeting(selected.id, { durationMinutes });
      toast.success('Duración registrada.');
      setDurationOpen(false);
      await reload();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      // La persona fuera de alcance se muestra junto al selector, sin toast.
      if (message !== PERSON_NOT_IN_PROCESS_MESSAGE && message !== PARTICIPANT_NOT_IN_PROCESS_MESSAGE) {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function exportCtx(m: Meeting) {
    return { processName: meetingProcessName(m), personName: (id: string | null) => meetingPersonName(m, id) };
  }

  function renderCommitments(m: Meeting): React.ReactNode {
    return (
      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {`Compromisos (${m.commitmentsTotal}${m.commitmentsTotal > 0 ? ` · ${m.commitmentsOpen} abiertos` : ''})`}
          </h3>
          {!m.closed && m.viewerCanEdit ? (
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
              const isMine = c.assignedUserId === myId || c.responsibleUserId === myId;
              const isFirstMine = isMine && m.commitments.find((x) => x.assignedUserId === myId || x.responsibleUserId === myId)?.id === c.id;

              return (
                <li
                  key={c.id}
                  id={isFirstMine ? FIRST_OWN_COMMITMENT_ID : undefined}
                  tabIndex={isFirstMine ? -1 : undefined}
                  className="flex flex-col gap-2 rounded-md border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
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
                    <DueBadge status={c.dueStatus} daysToDue={c.daysToDue} dueDate={c.dueDate} />
                  </div>
                  <p className="text-meta text-muted-foreground">
                    {`Asignado: ${c.assignedUserName ?? meetingPersonName(m, c.assignedUserId)} · Vence ${formatDateOnly(c.dueDate)}`}
                    {c.responsibleUserId
                      ? ` · Responsable: ${c.responsibleUserName ?? meetingPersonName(m, c.responsibleUserId)}`
                      : ''}
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

  /** Quienes participan, con su nombre; el responsable va primero. */
  function renderParticipants(m: Meeting): React.ReactNode {
    const responsible =
      m.responsibleUserId && !m.participants.some((p) => p.id === m.responsibleUserId)
        ? [{ id: m.responsibleUserId, name: m.responsibleUserName ?? 'Responsable' }]
        : [];
    const ordered = [...responsible, ...m.participants].sort(
      (a, b) =>
        Number(b.id === m.responsibleUserId) - Number(a.id === m.responsibleUserId) ||
        a.name.localeCompare(b.name, 'es'),
    );
    const visible = showAllParticipants ? ordered : ordered.slice(0, PARTICIPANTS_VISIBLE);
    const hidden = ordered.length - PARTICIPANTS_VISIBLE;
    return (
      <section aria-labelledby="acta-participantes" className="flex flex-col gap-2">
        <h3 id="acta-participantes" className="text-sm font-semibold">
          {`Participantes (${ordered.length})`}
        </h3>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie más participa en esta acta.</p>
        ) : (
          <>
            <ul id="acta-participantes-lista" className="flex flex-wrap gap-2">
              {visible.map((person) => (
                <li
                  key={person.id}
                  className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full bg-muted py-1 pl-1 pr-3 text-sm text-foreground"
                >
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-subtle text-[0.6875rem] font-semibold text-link"
                    aria-hidden="true"
                  >
                    {person.name.trim().slice(0, 1).toUpperCase() || '?'}
                  </span>
                  <span className="max-w-[16rem] truncate" title={person.name}>
                    {person.name}
                    {person.id === myId ? <span className="text-muted-foreground"> (tú)</span> : null}
                  </span>
                  {person.id === m.responsibleUserId ? (
                    <span className={`${ROLE_CHIP} border-info-border bg-info-subtle text-info`}>
                      <UserCheck className="size-3" aria-hidden="true" />
                      Responsable
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {hidden > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                aria-expanded={showAllParticipants}
                aria-controls="acta-participantes-lista"
                onClick={() => setShowAllParticipants((v) => !v)}
              >
                {showAllParticipants ? 'Ver menos' : `Ver los ${hidden} restantes`}
              </Button>
            ) : null}
          </>
        )}
      </section>
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
    // Quién edita lo decide la API (`viewerCanEdit`); aquí solo se muestran o no los botones.
    const canEdit = m.viewerCanEdit;
    const hasOwnCommitment = m.commitments.some(
      (c) => c.assignedUserId === myId || c.responsibleUserId === myId,
    );
    const canClose = !m.closed && (m.responsibleUserId === myId || isManagerOf(m.processId));
    const canReopen = m.closed && isManagerOf(m.processId);
    // Sobre un acta cerrada la API admite solo la duración, a cargo del responsable, el líder o el jefe.
    const canSetDuration = m.closed && (m.responsibleUserId === myId || isManagerOf(m.processId));
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
              {!canEdit ? (
                <span className={`${ROLE_CHIP} border-neutral-border bg-neutral-subtle text-neutral`}>
                  <Eye className="size-3" aria-hidden="true" />
                  Solo lectura
                </span>
              ) : null}
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
            {!m.closed && canEdit ? (
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
            {!m.closed && canEdit && m.commitmentsTotal === 0 ? (
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
          {closeError && !m.closed ? (
            <InlineNotice
              tone="warning"
              role="status"
              action={
                /duraci/i.test(closeError) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(m);
                      setFormError(null);
                      setFocusDuration(true);
                      setMeetingOpen(true);
                    }}
                  >
                    Indicar duración
                  </Button>
                ) : undefined
              }
            >
              {closeError}
            </InlineNotice>
          ) : null}
          {!canEdit ? (
            <InlineNotice
              tone="neutral"
              icon={Eye}
              title={m.closed ? 'Acta cerrada, solo lectura' : 'Solo puedes leer esta acta'}
              action={
                hasOwnCommitment ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const target = document.getElementById(FIRST_OWN_COMMITMENT_ID);
                      target?.scrollIntoView({ block: 'center' });
                      target?.focus();
                    }}
                  >
                    Ver mis compromisos de esta acta
                  </Button>
                ) : undefined
              }
            >
              {m.closed
                ? 'El acta está cerrada y tú participas en ella. Puedes leerla y descargarla.'
                : 'Participas en esta reunión. Solo el responsable, el líder del proceso y la jefatura pueden editarla. Tus compromisos los actualizas desde esta pantalla o desde Mi trabajo.'}
            </InlineNotice>
          ) : m.closed ? (
            <InlineNotice tone="info">
              El acta está cerrada y queda como registro. Sus compromisos siguen su propio seguimiento.
            </InlineNotice>
          ) : null}
          {renderParticipants(m)}
          <DescriptionList
            className="border-t pt-4"
            items={[
              { term: 'Responsable', value: m.responsibleUserId ? meetingPersonName(m, m.responsibleUserId) : null },
              {
                term: 'Horario',
                value: formatTimeRange(m.meetingTime, m.meetingEndTime) ?? m.meetingTime,
              },
              {
                term: 'Duración',
                value: m.durationMinutes ? (
                  formatDuration(m.durationMinutes)
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Sin registrar</span>
                    {canSetDuration ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setFormError(null);
                          setDurationOpen(true);
                        }}
                      >
                        Registrar duración
                      </Button>
                    ) : null}
                  </span>
                ),
              },
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
            error={error}
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
                  badge: (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge kind="minutes" value={m.state} />
                      {m.responsibleUserId === myId ? (
                        <span className={`${ROLE_CHIP} border-info-border bg-info-subtle text-info`}>
                          <UserCheck className="size-3" aria-hidden="true" />
                          Responsable
                        </span>
                      ) : !m.viewerCanEdit ? (
                        <span className={`${ROLE_CHIP} border-neutral-border bg-neutral-subtle text-neutral`}>
                          <Users className="size-3" aria-hidden="true" />
                          Participante
                        </span>
                      ) : null}
                    </span>
                  ),
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
        myId={myId}
        focusDuration={focusDuration}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleMeetingSubmit}
      />

      <RegistrarDuracionDialog
        open={durationOpen}
        onOpenChange={(o) => {
          setDurationOpen(o);
          if (!o) setFormError(null);
        }}
        meeting={selected}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(minutes) => void handleDurationSubmit(minutes)}
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
          if (selected) await handleClose(selected);
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
