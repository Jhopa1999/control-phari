'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FieldSet, FormError, RequiredHint } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

export interface ReunionFormValues {
  processId: string;
  title: string;
  meetingDate: string;
  meetingTime: string;
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
  people: CoordinationPerson[];
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: ReunionFormValues) => void;
}

const SIN_VALOR = '__none__';

type FieldKey = 'processId' | 'title' | 'meetingDate' | 'meetingTime';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `reu-form-error`. */
const FORM_ID = 'reu-form';

/**
 * Reglas del cliente, las mismas de siempre (proceso al crear, título, fecha y
 * hora HH:mm), evaluadas todas a la vez (design §9).
 */
function validate(
  values: Pick<ReunionFormValues, FieldKey>,
  isEdit: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!isEdit && !values.processId) errors.processId = 'Selecciona un proceso.';
  if (!values.title.trim()) errors.title = 'El título es obligatorio.';
  if (!values.meetingDate) errors.meetingDate = 'La fecha es obligatoria.';
  if (values.meetingTime && !/^\d{2}:\d{2}$/.test(values.meetingTime)) {
    errors.meetingTime = 'La hora debe tener formato HH:mm.';
  }
  return errors;
}

export function ReunionFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  people,
  submitting,
  errorMessage,
  onSubmit,
}: ReunionFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [meetingDate, setMeetingDate] = React.useState('');
  const [meetingTime, setMeetingTime] = React.useState('');
  const [participantUserIds, setParticipantUserIds] = React.useState<string[]>([]);
  const [responsibleUserId, setResponsibleUserId] = React.useState('');
  const [agenda, setAgenda] = React.useState('');
  const [decisions, setDecisions] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const processRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);
  const timeRef = React.useRef<HTMLInputElement>(null);
  // Sin DialogTrigger, Radix no sabe a dónde devolver el foco al cerrar: vuelve
  // al botón que abrió el diálogo («Nueva reunión» o «Editar»), NIT 4.
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

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
      setParticipantUserIds([]);
      setResponsibleUserId('');
      setAgenda('');
      setDecisions('');
      setNotes('');
    }
  });

  function clearError(key: FieldKey) {
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function toggleParticipant(id: string) {
    setParticipantUserIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate({ processId, title, meetingDate, meetingTime }, isEdit);
    setFieldErrors(errors);
    if (errors.processId || errors.title || errors.meetingDate || errors.meetingTime) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.processId) processRef.current?.focus();
      else if (errors.title) titleRef.current?.focus();
      else if (errors.meetingDate) dateRef.current?.focus();
      else timeRef.current?.focus();
      return;
    }
    onSubmit({
      processId,
      title,
      meetingDate,
      meetingTime,
      participantUserIds,
      responsibleUserId,
      agenda,
      decisions,
      notes,
    });
  }

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

            <Field id="reu-responsible" label="Responsable">
              {(control) => (
                <Select
                  value={responsibleUserId || SIN_VALOR}
                  onValueChange={(v) => setResponsibleUserId(v === SIN_VALOR ? '' : v)}
                >
                  <SelectTrigger {...control}>
                    <SelectValue placeholder="Sin responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin responsable</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <FieldSet id="reu-participants" legend="Participantes" kind="checkbox">
              {people.length === 0 ? (
                <p className="text-meta text-muted-foreground">
                  No hay personas en tu alcance para agregar.
                </p>
              ) : (
                <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border px-2 py-1">
                  {people.map((p) => (
                    <li key={p.id}>
                      <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={participantUserIds.includes(p.id)}
                          onChange={() => toggleParticipant(p.id)}
                        />
                        <span>{p.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </FieldSet>

            <Field id="reu-agenda" label="Agenda">
              <Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} />
            </Field>

            <Field id="reu-decisions" label="Decisiones y acuerdos">
              <Textarea value={decisions} onChange={(e) => setDecisions(e.target.value)} />
            </Field>

            <Field id="reu-notes" label="Observaciones">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <FormError id={FORM_ID} message={errorMessage} />
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
