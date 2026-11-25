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
import type { CoordinationPerson, Meeting, Process } from '@/lib/api-client';
import { localDateInputValue } from '@/lib/format';
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

export interface ReunionFormValues {
  processId: string;
  title: string;
  meetingDate: string;
  meetingTime: string;
  /** Duración en minutos (múltiplo de 15); null si no se indicó. */
  durationMinutes: number | null;
  participantUserIds: string[];
  responsibleUserId: string;
  agenda: string;
  decisions: string;
  notes: string;
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
  const [agenda, setAgenda] = React.useState('');
  const [decisions, setDecisions] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  // Candidatos del proceso elegido (responsable y participantes), los mismos que acepta la API.
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [peopleState, setPeopleState] = React.useState<PeopleLoadState>('idle');
  const [reloadKey, setReloadKey] = React.useState(0);
  // Aviso de lo que se quitó al cambiar de proceso (solo al crear).
  const [removedNotice, setRemovedNotice] = React.useState<string | null>(null);
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
    if (editing) {
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
      setProcessId('');
      setTitle('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setMeetingDate(localDateInputValue());
      setMeetingTime('');
      setDuration(EMPTY_DURATION);
      setParticipantUserIds([]);
      setResponsibleUserId('');
      setAgenda('');
      setDecisions('');
      setNotes('');
    }
  });

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
    const removedResponsible = responsibleUserId !== '' && !inProcess.has(responsibleUserId);
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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      agenda,
      decisions,
      notes,
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

  // Sin códigos internos visibles (design §13.1).
  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? 'Proceso fuera de tu alcance';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar acta' : 'Nueva acta de reunión'}</DialogTitle>
          <DialogDescription>
            Registra los datos de la reunión, quiénes asistieron, la agenda y lo decidido. Los
            compromisos se agregan desde el acta.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="reu-process" label="Proceso" required={!isEdit} error={fieldErrors.processId}>
              {(control) =>
                isEdit ? (
                  <Input {...control} readOnly disabled value={processName(processId)} />
                ) : (
                  <Select
                    value={processId}
                    onValueChange={(value) => {
                      setProcessId(value);
                      setRemovedNotice(null);
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

            <Field id="reu-title" label="Título" required error={fieldErrors.title}>
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
              <Field id="reu-date" label="Fecha" required error={fieldErrors.meetingDate}>
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
              <Field id="reu-time" label="Hora (HH:mm)" error={fieldErrors.meetingTime}>
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
                  ? 'Dirige la reunión y puede editar y cerrar el acta.'
                  : 'Elige primero un proceso.'
              }
            >
              {(control) => (
                <Select
                  value={responsibleUserId || SIN_VALOR}
                  disabled={!processId || peopleState === 'loading'}
                  onValueChange={(v) => {
                    setResponsibleUserId(v === SIN_VALOR ? '' : v);
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

            <Field id="reu-agenda" label="Agenda">
              <Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} />
            </Field>

            <Field id="reu-decisions" label="Decisiones y acuerdos">
              <Textarea value={decisions} onChange={(e) => setDecisions(e.target.value)} />
            </Field>

            <Field id="reu-notes" label="Observaciones">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <FormError id={FORM_ID} message={formMessage} />
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear acta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
