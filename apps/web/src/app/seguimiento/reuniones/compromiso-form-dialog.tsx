'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
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
import type {
  Commitment,
  CoordinationPerson,
  Meeting,
  Process,
} from '@/lib/api-client';
import { formatDateOnly, localDateInputValue } from '@/lib/format';

export interface CompromisoFormValues {
  processId: string;
  title: string;
  dueDate: string;
  assignedUserId: string;
  responsibleUserId: string;
  sourceMeetingId: string;
  expectedResult: string;
  blockers: string;
}

interface CompromisoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Commitment | null;
  processes: Process[];
  people: CoordinationPerson[];
  meetings: Meeting[];
  /**
   * Acta desde la que se registra el compromiso: fija el proceso y el acta de
   * origen (no se pueden cambiar en el formulario).
   */
  fixedMeeting?: Meeting | null;
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: CompromisoFormValues) => void;
}

const SIN_VALOR = '__none__';

type FieldKey = 'processId' | 'title' | 'dueDate';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `com-form-error`. */
const FORM_ID = 'com-form';

/**
 * Reglas del cliente, las mismas de siempre (proceso al crear, título y
 * vencimiento), evaluadas todas a la vez (design §9).
 */
function validate(
  values: Pick<CompromisoFormValues, FieldKey>,
  isEdit: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!isEdit && !values.processId) errors.processId = 'Selecciona un proceso.';
  if (!values.title.trim()) errors.title = 'El título es obligatorio.';
  if (!values.dueDate) errors.dueDate = 'El vencimiento es obligatorio.';
  return errors;
}

export function CompromisoFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  people,
  meetings,
  fixedMeeting,
  submitting,
  errorMessage,
  onSubmit,
}: CompromisoFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [assignedUserId, setAssignedUserId] = React.useState('');
  const [responsibleUserId, setResponsibleUserId] = React.useState('');
  const [sourceMeetingId, setSourceMeetingId] = React.useState('');
  const [expectedResult, setExpectedResult] = React.useState('');
  const [blockers, setBlockers] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const processRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const dueRef = React.useRef<HTMLInputElement>(null);
  // Sin DialogTrigger, Radix no sabe a dónde devolver el foco al cerrar: vuelve
  // al botón que abrió el diálogo («Nuevo compromiso» o «Editar»), NIT 4.
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Inicializa al abrir. El reset solo ocurre aquí; ante fallo del POST/PATCH
  // el padre mantiene el diálogo abierto con los valores (AC-031).
  useResetOnChange([open, editing, fixedMeeting], () => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setProcessId(editing.processId);
      setTitle(editing.title);
      setDueDate(editing.dueDate);
      setAssignedUserId(editing.assignedUserId ?? '');
      setResponsibleUserId(editing.responsibleUserId ?? '');
      setSourceMeetingId(editing.sourceMeetingId ?? '');
      setExpectedResult(editing.expectedResult ?? '');
      setBlockers(editing.blockers ?? '');
    } else {
      setProcessId(fixedMeeting?.processId ?? '');
      setTitle('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setDueDate(localDateInputValue());
      setAssignedUserId('');
      setResponsibleUserId(fixedMeeting?.responsibleUserId ?? '');
      setSourceMeetingId(fixedMeeting?.id ?? '');
      setExpectedResult('');
      setBlockers('');
    }
  });

  // Actas a las que se puede ligar: abiertas y del mismo proceso (más la actual).
  const meetingOptions = React.useMemo(
    () =>
      meetings.filter(
        (m) =>
          m.id === (editing?.sourceMeetingId ?? '') ||
          (!m.closed && (!processId || m.processId === processId)),
      ),
    [meetings, editing, processId],
  );
  const lockedToMeeting = Boolean(fixedMeeting);

  function clearError(key: FieldKey) {
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate({ processId, title, dueDate }, isEdit);
    setFieldErrors(errors);
    if (errors.processId || errors.title || errors.dueDate) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.processId) processRef.current?.focus();
      else if (errors.title) titleRef.current?.focus();
      else dueRef.current?.focus();
      return;
    }
    onSubmit({
      processId,
      title,
      dueDate,
      assignedUserId,
      responsibleUserId,
      sourceMeetingId,
      expectedResult,
      blockers,
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
          <DialogTitle>{isEdit ? 'Editar compromiso' : 'Nuevo compromiso'}</DialogTitle>
          <DialogDescription>
            {lockedToMeeting
              ? 'Registra un compromiso acordado en esta reunión, con su responsable y vencimiento.'
              : 'Un compromiso tiene vencimiento. Puedes ligarlo a un acta abierta o registrarlo sin acta.'}
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="com-process" label="Proceso" required={!isEdit} error={fieldErrors.processId}>
              {(control) =>
                isEdit || lockedToMeeting ? (
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

            <Field id="com-title" label="Título" required error={fieldErrors.title}>
              <Input
                ref={titleRef}
                value={title}
                placeholder="Qué se compromete"
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearError('title');
                }}
              />
            </Field>

            <Field id="com-due" label="Vencimiento" required error={fieldErrors.dueDate}>
              <Input
                ref={dueRef}
                type="date"
                value={dueDate}
                className="sm:max-w-[calc(50%-0.5rem)]"
                onChange={(e) => {
                  setDueDate(e.target.value);
                  clearError('dueDate');
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="com-assigned" label="Asignado">
                {(control) => (
                  <Select
                    value={assignedUserId || SIN_VALOR}
                    onValueChange={(v) => setAssignedUserId(v === SIN_VALOR ? '' : v)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VALOR}>Sin asignar</SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field id="com-responsible" label="Responsable">
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
            </div>

            <Field
              id="com-meeting"
              label="Acta de origen"
              help={lockedToMeeting ? 'El compromiso queda registrado en esta acta.' : 'Solo actas abiertas del mismo proceso.'}
            >
              {(control) => lockedToMeeting && fixedMeeting ? (
                <Input
                  {...control}
                  readOnly
                  disabled
                  value={`${fixedMeeting.title} (${formatDateOnly(fixedMeeting.meetingDate)})`}
                />
              ) : (
                <Select
                  value={sourceMeetingId || SIN_VALOR}
                  onValueChange={(v) => setSourceMeetingId(v === SIN_VALOR ? '' : v)}
                >
                  <SelectTrigger {...control}>
                    <SelectValue placeholder="Sin acta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin acta</SelectItem>
                    {meetingOptions.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {`${m.title} (${formatDateOnly(m.meetingDate)})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field id="com-result" label="Resultado esperado">
              <Textarea
                value={expectedResult}
                onChange={(e) => setExpectedResult(e.target.value)}
              />
            </Field>

            <Field id="com-blockers" label="Bloqueos">
              <Textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} />
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear compromiso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
