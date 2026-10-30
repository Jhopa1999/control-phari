'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
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
import type { DailyLog, Process } from '@/lib/api-client';
import { localDateInputValue } from '@/lib/format';

export interface DiarioFormValues {
  processId: string;
  date: string;
  dayNotes: string;
}

interface DiarioFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Diario en edición; si se pasa, el diálogo edita (PATCH solo notas). */
  editing?: DailyLog | null;
  /** Procesos en alcance para el Select de cabecera. */
  processes: Process[];
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: DiarioFormValues) => void;
}

type FieldKey = 'processId' | 'date';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `diario-form-error`. */
const FORM_ID = 'diario-form';

/**
 * Reglas del cliente, las mismas de siempre (proceso y fecha al crear),
 * evaluadas todas a la vez (design §9).
 */
function validate(values: DiarioFormValues, isEdit: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (isEdit) return errors;
  if (!values.processId) errors.processId = 'Selecciona un proceso.';
  if (!values.date) errors.date = 'La fecha es obligatoria.';
  return errors;
}

export function DiarioFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  submitting,
  errorMessage,
  onSubmit,
}: DiarioFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [date, setDate] = React.useState('');
  const [dayNotes, setDayNotes] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const processRef = React.useRef<HTMLButtonElement>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);

  // Inicializa al abrir. El reset solo ocurre aquí; ante fallo del POST/PATCH
  // el padre mantiene el diálogo abierto con los valores (AC-031).
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setProcessId(editing.processId);
      setDate(editing.date);
      setDayNotes(editing.dayNotes ?? '');
    } else {
      setProcessId('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setDate(localDateInputValue());
      setDayNotes('');
    }
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const values = { processId, date, dayNotes };
    const errors = validate(values, isEdit);
    setFieldErrors(errors);
    if (errors.processId || errors.date) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.processId) processRef.current?.focus();
      else dateRef.current?.focus();
      return;
    }
    onSubmit(values);
  }

  const processName = (id: string) => processes.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar notas del diario' : 'Nuevo diario'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'El proceso y la fecha de un diario no se cambian; edita solo las notas del día.'
              : 'Un diario agrupa las actividades de un día para un proceso. Después agregas sus actividades.'}
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            {isEdit ? null : <RequiredHint />}
            <Field id="diario-process" label="Proceso" required={!isEdit} error={fieldErrors.processId}>
              {(control) =>
                isEdit ? (
                  <Input {...control} readOnly disabled value={processName(processId)} />
                ) : (
                  <Select
                    value={processId}
                    onValueChange={(value) => {
                      setProcessId(value);
                      setFieldErrors((prev) => ({ ...prev, processId: undefined }));
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

            <Field id="diario-date" label="Fecha" required={!isEdit} error={fieldErrors.date}>
              <Input
                ref={dateRef}
                type="date"
                value={date}
                readOnly={isEdit}
                disabled={isEdit}
                onChange={(e) => {
                  setDate(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, date: undefined }));
                }}
              />
            </Field>

            <Field id="diario-notes" label="Notas del día">
              <Textarea
                value={dayNotes}
                placeholder="Observaciones o contexto del día (opcional)."
                onChange={(e) => setDayNotes(e.target.value)}
              />
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear diario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
