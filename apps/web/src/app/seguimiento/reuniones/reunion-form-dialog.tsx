'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, X } from 'lucide-react';
import type { CoordinationPerson, Meeting, MeetingAiProposal, Process } from '@/lib/api-client';
import { formatDateOnly, localDateInputValue } from '@/lib/format';
import {
  appendAgendaTemplate,
  listAgendaTemplates,
  type AgendaTemplate,
} from '@/lib/agenda-templates';
import { relatedValueOf, type RelatedRequestValue } from '@/lib/related-request-value';
import { getMeetingAiAvailability, type MeetingAiUiStatus } from '@/lib/meetings-ai';
import {
  PARTICIPANT_NOT_IN_PROCESS_COPY,
  PARTICIPANT_NOT_IN_PROCESS_MESSAGE,
  listProcessPeople,
} from '@/lib/meetings';
import { usePersonError } from '@/lib/use-person-error';
import {
  DuracionField,
  EMPTY_DURATION,
  durationToParts,
  partsToMinutes,
  type DuracionParts,
} from './duracion-field';
import { ParticipantesField, type PeopleLoadState } from './participantes-field';
import { RelatedRequestField } from './solicitud-field';
import { ActaIaPanel } from './acta-ia-panel';
import { ActaIaPreview, type AppliedProposal, type PendingCommitment } from './acta-ia-preview';

export type { PendingCommitment } from './acta-ia-preview';

export interface ReunionFormValues {
  processId: string;
  title: string;
  meetingDate: string;
  meetingTime: string;
  /** Duración en minutos (múltiplo de 15); null si no se indicó. */
  durationMinutes: number | null;
  participantUserIds: string[];
  responsibleUserId: string;
  /** Solicitud o proyecto relacionado (opcional). */
  related: RelatedRequestValue | null;
  agenda: string;
  decisions: string;
  notes: string;
  /** Compromisos aceptados desde la propuesta de IA; se crean después de guardar el acta. */
  pendingCommitments: PendingCommitment[];
}

interface ReunionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Meeting | null;
  processes: Process[];
  /** Persona que usa el formulario (marca «(tú)» en la lista). */
  myId: string | null;
  /** Al abrir, el foco va al campo de duración (p. ej. tras un cierre sin duración). */
  focusDuration?: boolean;
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: ReunionFormValues) => void;
}

const SIN_VALOR = '__none__';
const NO_REQUEST_ACCESS_COPY = 'No tienes acceso a la solicitud elegida. Quítala o elige otra.';

type FieldKey = 'processId' | 'title' | 'meetingDate' | 'meetingTime' | 'duration';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `reu-form-error`. */
const FORM_ID = 'reu-form';

/**
 * Reglas del cliente, las mismas de siempre (proceso al crear, título, fecha y
 * hora HH:mm), evaluadas todas a la vez (design §9).
 */
function validate(
  values: Pick<ReunionFormValues, 'processId' | 'title' | 'meetingDate' | 'meetingTime'> & {
    durationMinutes: number | null;
  },
  isEdit: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!isEdit && !values.processId) errors.processId = 'Selecciona un proceso.';
  if (!values.title.trim()) errors.title = 'El título es obligatorio.';
  if (!values.meetingDate) errors.meetingDate = 'La fecha es obligatoria.';
  if (values.meetingTime && !/^\d{2}:\d{2}$/.test(values.meetingTime)) {
    errors.meetingTime = 'La hora debe tener formato HH:mm.';
  }
  // La regla de fondo (15 a 1440 en pasos de 15) es de la API; aquí solo se evita enviar 0.
  if (values.durationMinutes !== null && values.durationMinutes < 15) {
    errors.duration = 'La duración debe ser de 15 minutos o más, en pasos de 15.';
  }
  return errors;
}

export function ReunionFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  myId,
  focusDuration = false,
  submitting,
  errorMessage,
  onSubmit,
}: ReunionFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [meetingDate, setMeetingDate] = React.useState('');
  const [meetingTime, setMeetingTime] = React.useState('');
  const [duration, setDuration] = React.useState<DuracionParts>(EMPTY_DURATION);
  const [participantUserIds, setParticipantUserIds] = React.useState<string[]>([]);
  const [responsibleUserId, setResponsibleUserId] = React.useState('');
  // Si la persona ya eligió responsable (o «Sin responsable»), no se le propone el suyo.
  const [responsibleTouched, setResponsibleTouched] = React.useState(false);
  const [agenda, setAgenda] = React.useState('');
  const [related, setRelated] = React.useState<RelatedRequestValue | null>(null);
  const [templates, setTemplates] = React.useState<AgendaTemplate[]>([]);
  // Plantilla recién insertada: permite deshacer hasta que se edite la agenda.
  const [templateUndo, setTemplateUndo] = React.useState<{ previous: string; name: string } | null>(null);
  const [templateError, setTemplateError] = React.useState<string | null>(null);
  const [decisions, setDecisions] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  // Candidatos del proceso elegido (responsable y participantes), los mismos que acepta la API.
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [peopleState, setPeopleState] = React.useState<PeopleLoadState>('idle');
  const [reloadKey, setReloadKey] = React.useState(0);
  // Aviso de lo que se quitó al cambiar de proceso (solo al crear).
  const [removedNotice, setRemovedNotice] = React.useState<string | null>(null);
  // Ayuda de IA: disponibilidad, notas, propuesta en revisión y compromisos aceptados.
  const [iaStatus, setIaStatus] = React.useState<MeetingAiUiStatus>('checking');
  const [iaMessage, setIaMessage] = React.useState<string | undefined>(undefined);
  const [iaText, setIaText] = React.useState('');
  const [proposal, setProposal] = React.useState<MeetingAiProposal | null>(null);
  const [view, setView] = React.useState<'form' | 'preview'>('form');
  const [discardRequest, setDiscardRequest] = React.useState(0);
  const [cancelSignal, setCancelSignal] = React.useState(0);
  const [appliedNotice, setAppliedNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingCommitment[]>([]);
  const iaButtonRef = React.useRef<HTMLButtonElement>(null);
  const processRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);
  const timeRef = React.useRef<HTMLInputElement>(null);
  const durationRef = React.useRef<HTMLButtonElement>(null);
  const responsibleRef = React.useRef<HTMLButtonElement>(null);
  // «La persona indicada…» (4.3): error junto al selector y foco en él.
  const person = usePersonError(errorMessage);
  const hasPersonError = person.personError !== null;
  React.useEffect(() => {
    if (open && hasPersonError) responsibleRef.current?.focus();
  }, [open, hasPersonError]);
  // Sin DialogTrigger, Radix no sabe a dónde devolver el foco al cerrar: vuelve
  // al botón que abrió el diálogo («Nueva reunión» o «Editar»), NIT 4.
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  React.useEffect(() => {
    if (!open || !focusDuration) return;
    const id = window.setTimeout(() => durationRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open, focusDuration]);

  // Inicializa al abrir. El reset solo ocurre aquí; ante fallo del POST/PATCH
  // el padre mantiene el diálogo abierto con los valores (AC-031).
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setFieldErrors({});
    setIaStatus('checking');
    setIaMessage(undefined);
    setIaText('');
    setProposal(null);
    setView('form');
    setAppliedNotice(null);
    setPending([]);
    setTemplateUndo(null);
    setTemplateError(null);
    if (editing) {
      setRelated(relatedValueOf(editing));
      setProcessId(editing.processId);
      setTitle(editing.title);
      setMeetingDate(editing.meetingDate);
      setMeetingTime(editing.meetingTime ?? '');
      setDuration(durationToParts(editing.durationMinutes));
      setParticipantUserIds(editing.participantUserIds ?? []);
      setResponsibleUserId(editing.responsibleUserId ?? '');
      setAgenda(editing.agenda ?? '');
      setDecisions(editing.decisions ?? '');
      setNotes(editing.notes ?? '');
    } else {
      setRelated(null);
      setProcessId('');
      setTitle('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setMeetingDate(localDateInputValue());
      setMeetingTime('');
      setDuration(EMPTY_DURATION);
      setParticipantUserIds([]);
      setResponsibleUserId('');
      setResponsibleTouched(false);
      setAgenda('');
      setDecisions('');
      setNotes('');
    }
  });

  // Plantillas de agenda (ayuda opcional): solo si el acta está abierta.
  React.useEffect(() => {
    if (!open || (editing?.closed ?? false)) return;
    let cancelled = false;
    void listAgendaTemplates().then((list) => {
      if (!cancelled) setTemplates(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, editing]);

  function insertTemplate(code: string): void {
    const template = templates.find((t) => t.code === code);
    if (!template) return;
    const next = appendAgendaTemplate(agenda, template.text);
    if (next === null) {
      setTemplateUndo(null);
      setTemplateError('La agenda ya es muy larga para agregar la plantilla.');
      return;
    }
    setTemplateError(null);
    setTemplateUndo({ previous: agenda, name: template.name });
    setAgenda(next);
    window.setTimeout(() => {
      const area = document.getElementById('reu-agenda') as HTMLTextAreaElement | null;
      area?.focus();
      area?.setSelectionRange(next.length, next.length);
    }, 50);
  }

  function undoTemplate(): void {
    if (!templateUndo) return;
    setAgenda(templateUndo.previous);
    setTemplateUndo(null);
    window.setTimeout(() => document.getElementById('reu-agenda')?.focus(), 50);
  }

  // Disponibilidad de la ayuda de IA al abrir (un acta cerrada no la usa).
  const iaApplies = !(editing?.closed ?? false);
  React.useEffect(() => {
    if (!open || !iaApplies) return;
    let cancelled = false;
    void getMeetingAiAvailability().then((result) => {
      if (cancelled) return;
      setIaStatus(result.status);
      setIaMessage(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [open, iaApplies]);

  // Al abrir, al cambiar de proceso o al reintentar se vuelve a cargar a las personas del proceso.
  useResetOnChange([open, processId, reloadKey], () => {
    const wanted = open && processId !== '';
    setPeopleState(wanted ? 'loading' : 'idle');
    if (!wanted) setPeople([]);
  });

  React.useEffect(() => {
    if (!open || !processId) return;
    let cancelled = false;
    listProcessPeople(processId)
      .then((list) => {
        if (cancelled) return;
        setPeople(list);
        setPeopleState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setPeople([]);
        setPeopleState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, processId, reloadKey]);

  // Al crear, lo marcado de otro proceso que no está en el nuevo se quita y se avisa.
  useResetOnChange([people], () => {
    if (isEdit || peopleState !== 'ready') return;
    const inProcess = new Set(people.map((p) => p.id));
    const keep = participantUserIds.filter((id) => inProcess.has(id));
    const removedParticipants = participantUserIds.length - keep.length;
    // Valor inicial: quien crea el acta es su responsable (la API aplica la misma regla
    // si no se indica uno). Solo si pertenece al proceso y no eligió otra cosa.
    if (!responsibleTouched) {
      const mine = myId && inProcess.has(myId) ? myId : '';
      if (responsibleUserId !== mine) setResponsibleUserId(mine);
    }
    const removedResponsible =
      responsibleTouched && responsibleUserId !== '' && !inProcess.has(responsibleUserId);
    if (removedParticipants === 0 && !removedResponsible) return;
    setParticipantUserIds(keep);
    if (removedResponsible) setResponsibleUserId('');
    const parts: string[] = [];
    if (removedParticipants > 0) {
      parts.push(removedParticipants === 1 ? '1 participante' : `${removedParticipants} participantes`);
    }
    if (removedResponsible) parts.push('el responsable');
    setRemovedNotice(
      `Se quitó ${parts.join(' y ')} porque no pertenece al proceso elegido. Revisa la lista.`,
    );
  });

  function clearError(key: FieldKey) {
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function focusSoon(id: string) {
    window.setTimeout(() => document.getElementById(id)?.focus(), 50);
  }

  function handleProposal(next: MeetingAiProposal) {
    setProposal(next);
    setAppliedNotice(null);
    setView('preview');
  }

  function discardProposal() {
    setView('form');
    setProposal(null);
    window.setTimeout(() => iaButtonRef.current?.focus(), 50);
  }

  function applyProposal(applied: AppliedProposal) {
    const filled: string[] = [];
    if (applied.fields.agenda !== undefined) {
      setAgenda(applied.fields.agenda);
      filled.push('Agenda');
    }
    if (applied.fields.decisions !== undefined) {
      setDecisions(applied.fields.decisions);
      filled.push('Decisiones y acuerdos');
    }
    if (applied.fields.notes !== undefined) {
      setNotes(applied.fields.notes);
      filled.push('Observaciones');
    }
    if (applied.commitments.length > 0) {
      setPending((prev) => [...prev, ...applied.commitments]);
    }
    const parts = [...filled];
    if (applied.commitments.length > 0) {
      parts.push(
        applied.commitments.length === 1
          ? '1 compromiso pendiente'
          : `${applied.commitments.length} compromisos pendientes`,
      );
    }
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
    setAppliedNotice(`Se aplicó la propuesta: ${joined}. Revisa todo antes de guardar.`);
    setProposal(null);
    setView('form');
    if (applied.fields.agenda !== undefined) focusSoon('reu-agenda');
    else if (applied.fields.decisions !== undefined) focusSoon('reu-decisions');
    else if (applied.fields.notes !== undefined) focusSoon('reu-notes');
    else window.setTimeout(() => iaButtonRef.current?.focus(), 50);
  }

  function removePending(index: number) {
    const remaining = pending.length - 1;
    setPending((prev) => prev.filter((_, i) => i !== index));
    if (remaining === 0) window.setTimeout(() => iaButtonRef.current?.focus(), 50);
    else focusSoon(`reu-pend-remove-${Math.min(index, remaining - 1)}`);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // El acta no depende de la IA: se cancela cualquier petición en curso.
    setCancelSignal((n) => n + 1);
    const durationMinutes = partsToMinutes(duration);
    const errors = validate({ processId, title, meetingDate, meetingTime, durationMinutes }, isEdit);
    setFieldErrors(errors);
    if (errors.processId || errors.title || errors.meetingDate || errors.meetingTime || errors.duration) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.processId) processRef.current?.focus();
      else if (errors.title) titleRef.current?.focus();
      else if (errors.meetingDate) dateRef.current?.focus();
      else if (errors.meetingTime) timeRef.current?.focus();
      else durationRef.current?.focus();
      return;
    }
    onSubmit({
      processId,
      title,
      meetingDate,
      meetingTime,
      durationMinutes,
      participantUserIds,
      responsibleUserId,
      related,
      agenda,
      decisions,
      notes,
      pendingCommitments: pending,
    });
  }

  // Aviso de visibilidad: al crear, con participantes; al editar, solo si se suman personas nuevas.
  const savedIds = new Set(editing?.participantUserIds ?? []);
  const showVisibilityNotice = isEdit
    ? participantUserIds.some((id) => !savedIds.has(id))
    : participantUserIds.length > 0;
  // El 400 en crudo de participantes se traduce a qué hacer.
  const formMessage =
    person.formMessage === PARTICIPANT_NOT_IN_PROCESS_MESSAGE
      ? PARTICIPANT_NOT_IN_PROCESS_COPY
      : person.formMessage;

  // 404 por la solicitud elegida: error junto al campo, sin duplicarlo abajo.
  const relatedError = formMessage === 'No se encontró la solicitud.' ? NO_REQUEST_ACCESS_COPY : null;
  const generalMessage = relatedError ? null : formMessage;

  const inPreview = view === 'preview' && proposal !== null;
  const pendingSuffix =
    pending.length === 0 ? '' : pending.length === 1 ? ' y 1 compromiso' : ` y ${pending.length} compromisos`;
  const submitLabel =
    pending.length === 0
      ? isEdit
        ? 'Guardar cambios'
        : 'Crear acta'
      : isEdit
        ? `Guardar cambios y crear ${pending.length === 1 ? '1 compromiso' : `${pending.length} compromisos`}`
        : `Crear acta${pendingSuffix}`;

  // Sin códigos internos visibles (design §13.1).
  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? 'Proceso fuera de tu alcance';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
        // En la vista previa, Escape y el clic fuera no cierran el diálogo: Escape
        // vuelve al formulario (pide confirmar si se editó la propuesta).
        onEscapeKeyDown={(event) => {
          if (inPreview) {
            event.preventDefault();
            setDiscardRequest((n) => n + 1);
          }
        }}
        onInteractOutside={(event) => {
          if (inPreview) event.preventDefault();
        }}
      >
        {inPreview && proposal ? (
          <ActaIaPreview
            proposal={proposal}
            people={people}
            current={{ agenda, decisions, notes }}
            discardRequest={discardRequest}
            onDiscard={discardProposal}
            onApply={applyProposal}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar acta' : 'Nueva acta de reunión'}</DialogTitle>
            <DialogDescription>
              Registra los datos de la reunión, quiénes asistieron, la agenda y lo decidido. Los
              compromisos se agregan desde el acta.
            </DialogDescription>
          </DialogHeader>
        )}

        <form
          id={FORM_ID}
          noValidate
          onSubmit={handleSubmit}
          // El formulario se oculta (no se desmonta) mientras se revisa la propuesta.
          className={inPreview ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}
        >
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field
              id="reu-process"
              label="Proceso"
              required={!isEdit}
              error={fieldErrors.processId}
              help="Define quién puede ser responsable y participante."
            >
              {(control) =>
                isEdit ? (
                  <Input {...control} readOnly disabled value={processName(processId)} />
                ) : (
                  <Select
                    value={processId}
                    onValueChange={(value) => {
                      setProcessId(value);
                      setRemovedNotice(null);
                      // Los responsables propuestos eran de otro proceso: se descartan.
                      if (pending.length > 0) {
                        setPending([]);
                        setAppliedNotice(null);
                      }
                      clearError('processId');
                    }}
                  >
                    <SelectTrigger ref={processRef} {...control}>
                      <SelectValue placeholder="Selecciona un proceso" />
                    </SelectTrigger>
                    <SelectContent>
                      {processes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>

            <Field
              id="reu-title"
              label="Título"
              required
              error={fieldErrors.title}
              help="Un nombre corto que se entienda solo. Por ejemplo: Seguimiento semanal de soporte."
            >
              <Input
                ref={titleRef}
                value={title}
                placeholder="Asunto de la reunión"
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearError('title');
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="reu-date"
                label="Fecha"
                required
                error={fieldErrors.meetingDate}
                help="Día en que ocurrió o va a ocurrir la reunión."
              >
                <Input
                  ref={dateRef}
                  type="date"
                  value={meetingDate}
                  onChange={(e) => {
                    setMeetingDate(e.target.value);
                    clearError('meetingDate');
                  }}
                />
              </Field>
              <Field
                id="reu-time"
                label="Hora (HH:mm)"
                error={fieldErrors.meetingTime}
                help="Formato de 24 horas, por ejemplo 14:30."
              >
                <Input
                  ref={timeRef}
                  type="time"
                  value={meetingTime}
                  onChange={(e) => {
                    setMeetingTime(e.target.value);
                    clearError('meetingTime');
                  }}
                />
              </Field>
            </div>

            <DuracionField
              id="reu-duration"
              value={duration}
              onChange={(next) => {
                setDuration(next);
                clearError('duration');
              }}
              meetingTime={meetingTime}
              error={fieldErrors.duration}
              hoursRef={durationRef}
              help="En minutos, de 15 en 15. Hace falta para cerrar el acta y se usa para proponer el tiempo en la bitácora de los participantes."
            />

            <RelatedRequestField
              id="reu-solicitud"
              value={related}
              onChange={setRelated}
              active={open}
              help="Opcional. Búscala por código (PRY-0012) o por título. Sirve para encontrar la reunión después por su solicitud."
              error={relatedError}
            />

            {removedNotice ? (
              <InlineNotice tone="warning" role="status">
                {removedNotice}
              </InlineNotice>
            ) : null}

            <Field
              id="reu-responsible"
              label="Responsable"
              error={person.personError}
              help={
                processId
                  ? 'Dirige la reunión y puede editar y cerrar el acta. Si lo dejas vacío, el acta queda a tu nombre cuando perteneces al proceso.'
                  : 'Elige primero un proceso.'
              }
            >
              {(control) => (
                <Select
                  value={responsibleUserId || SIN_VALOR}
                  disabled={!processId || peopleState === 'loading'}
                  onValueChange={(v) => {
                    setResponsibleUserId(v === SIN_VALOR ? '' : v);
                    setResponsibleTouched(true);
                    setRemovedNotice(null);
                    person.dismiss();
                  }}
                >
                  <SelectTrigger ref={responsibleRef} {...control}>
                    <SelectValue
                      placeholder={peopleState === 'loading' ? 'Cargando personas…' : 'Sin responsable'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin responsable</SelectItem>
                    {responsibleUserId && !people.some((p) => p.id === responsibleUserId) ? (
                      <SelectItem value={responsibleUserId}>
                        {editing?.responsibleUserName ?? 'Responsable actual'}
                      </SelectItem>
                    ) : null}
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <ParticipantesField
              loadState={peopleState}
              people={people}
              selectedIds={participantUserIds}
              onChange={(ids) => {
                setParticipantUserIds(ids);
                setRemovedNotice(null);
              }}
              responsibleUserId={responsibleUserId}
              myId={myId}
              saved={editing?.participants ?? []}
              onRetry={() => setReloadKey((k) => k + 1)}
            />

            {showVisibilityNotice ? (
              <InlineNotice tone="info" role="note">
                Cada participante recibirá una notificación y podrá leer el acta completa: agenda,
                decisiones y compromisos de todos.
              </InlineNotice>
            ) : null}

            {iaApplies ? (
              <ActaIaPanel
                status={iaStatus}
                unavailableMessage={iaMessage}
                processId={processId}
                meetingDate={meetingDate}
                participantUserIds={participantUserIds}
                text={iaText}
                onTextChange={(value) => {
                  setIaText(value);
                  setAppliedNotice(null);
                }}
                appliedNotice={appliedNotice}
                onProposal={handleProposal}
                onBlocked={() => setIaStatus('unavailable')}
                cancelSignal={cancelSignal}
                disabled={submitting}
                buttonRef={iaButtonRef}
              />
            ) : null}

            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <span aria-hidden="true" className="text-sm leading-none font-medium text-foreground">
                  Agenda
                </span>
                {templates.length > 0 ? (
                  <Select value="" onValueChange={insertTemplate}>
                    <SelectTrigger
                      aria-label="Insertar plantilla de agenda"
                      className="h-8 w-full sm:w-56 max-md:h-11"
                    >
                      <SelectValue placeholder="Usar una plantilla" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
              <Field
                id="reu-agenda"
                label="Agenda"
                labelHidden
                help="Los temas a tratar. Puedes preparar el acta antes de la reunión: queda abierta hasta que la cierres."
              >
                <Textarea
                  value={agenda}
                  onChange={(e) => {
                    setAgenda(e.target.value);
                    setTemplateUndo(null);
                    setTemplateError(null);
                  }}
                />
              </Field>
              {templateError ? (
                <p role="alert" className="text-meta text-danger">
                  {templateError}
                </p>
              ) : null}
              {templateUndo ? (
                <p role="status" className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
                  <span>{`Se insertó la plantilla “${templateUndo.name}”.`}</span>
                  <Button type="button" variant="link" size="sm" className="text-link" onClick={undoTemplate}>
                    Deshacer
                  </Button>
                </p>
              ) : null}
            </div>

            <Field
              id="reu-decisions"
              label="Decisiones y acuerdos"
              help="Lo que se decidió. Para cerrar el acta hace falta al menos una decisión o un compromiso."
            >
              <Textarea value={decisions} onChange={(e) => setDecisions(e.target.value)} />
            </Field>

            <Field id="reu-notes" label="Observaciones" help="Notas que no son decisiones ni compromisos.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            {pending.length > 0 ? (
              <section aria-labelledby="reu-pend-title" className="grid gap-2">
                <h3 id="reu-pend-title" className="text-sm font-semibold text-foreground">
                  Compromisos que se crearán al guardar ({pending.length})
                </h3>
                <p className="text-meta text-muted-foreground">
                  Primero se guarda el acta y luego se crean estos compromisos. Cada persona recibe su
                  aviso.
                </p>
                <ul className="grid gap-2">
                  {pending.map((c, index) => (
                    <li
                      key={c.key}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="grid min-w-0 gap-1">
                        <p className="min-w-0 break-words text-sm font-medium text-foreground">{c.title}</p>
                        <p className="text-meta text-muted-foreground break-words">
                          Responsable: {c.assignedUserName || 'Sin responsable'} · Vence{' '}
                          {formatDateOnly(c.dueDate)}
                        </p>
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-info-border bg-info-subtle px-2 py-0.5 text-xs font-medium text-info">
                          <Sparkles className="size-3" aria-hidden="true" />
                          Propuesto por IA
                        </span>
                      </div>
                      <Button
                        id={`reu-pend-remove-${index}`}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="pointer-coarse:min-h-11"
                        aria-label={`Quitar el compromiso: ${c.title}`}
                        onClick={() => removePending(index)}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <FormError id={FORM_ID} message={generalMessage} />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
