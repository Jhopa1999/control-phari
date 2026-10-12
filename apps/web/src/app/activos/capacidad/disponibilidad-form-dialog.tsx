'use client';

import * as React from 'react';
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
import type { Availability, CapacityPerson } from '@/lib/api-client';
import { formatMonth } from '@/lib/format';

export interface DisponibilidadFormValues {
  userId: string;
  availableHours: string;
}

interface DisponibilidadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mes activo (YYYY-MM), fijado desde el selector principal. */
  month: string;
  /** Disponibilidad en edición; si se pasa, el diálogo edita (PATCH). */
  editing?: Availability | null;
  /** Personas en alcance para el Select. */
  people: CapacityPerson[];
  /** True cuando el actor solo puede registrar la suya (integrante). */
  lockPerson: boolean;
  /** userId del actor; se usa para fijar la persona cuando lockPerson. */
  selfUserId: string | null;
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: DisponibilidadFormValues) => void;
}

type FieldKey = 'userId' | 'availableHours';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `disp-form-error`. */
const FORM_ID = 'disp-form';

function personLabel(person: CapacityPerson): string {
  return person.identifier ? `${person.name} (${person.identifier})` : person.name;
}

/** Reglas del cliente, las mismas de siempre, evaluadas todas a la vez (design §9). */
function validate(values: DisponibilidadFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.userId) errors.userId = 'Selecciona una persona.';
  const trimmed = values.availableHours.trim();
  if (trimmed === '') {
    errors.availableHours = 'Las horas disponibles son obligatorias.';
  } else {
    const hours = Number(trimmed);
    if (!Number.isInteger(hours) || hours < 0) {
      errors.availableHours = 'Las horas disponibles deben ser un entero mayor o igual a 0.';
    }
  }
  return errors;
}

export function DisponibilidadFormDialog({
  open,
  onOpenChange,
  month,
  editing,
  people,
  lockPerson,
  selfUserId,
  submitting,
  errorMessage,
  onSubmit,
}: DisponibilidadFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const personReadOnly = isEdit || (lockPerson && selfUserId !== null);
  const [userId, setUserId] = React.useState('');
  const [availableHours, setAvailableHours] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const personRef = React.useRef<HTMLButtonElement>(null);
  const hoursRef = React.useRef<HTMLInputElement>(null);

  // Inicializa el formulario al abrir. El reset solo ocurre aquí; ante fallo
  // del POST/PATCH el padre mantiene el diálogo abierto con los valores (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setUserId(editing.userId);
      setAvailableHours(String(editing.availableHours));
    } else {
      setUserId(lockPerson && selfUserId ? selfUserId : '');
      setAvailableHours('');
    }
  }, [open, editing, lockPerson, selfUserId]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const values = { userId, availableHours };
    const errors = validate(values);
    setFieldErrors(errors);
    if (errors.userId || errors.availableHours) {
      // Foco al primer campo con error que se pueda enfocar, en orden del DOM.
      if (errors.userId && !personReadOnly) personRef.current?.focus();
      else if (errors.availableHours) hoursRef.current?.focus();
      return;
    }
    onSubmit({ userId, availableHours: availableHours.trim() });
  }

  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar disponibilidad' : 'Registrar disponibilidad'}</DialogTitle>
          <DialogDescription>
            La disponibilidad se registra una sola vez por persona y mes. Para cambiarla, edita
            las horas de la fila existente.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="disp-month" label="Mes" help="Fijado por el selector de mes de la pantalla.">
              <Input value={month ? formatMonth(month) : ''} readOnly disabled />
            </Field>

            <Field
              id="disp-person"
              label="Persona"
              required
              error={fieldErrors.userId}
              help={lockPerson && !isEdit ? 'Solo puedes registrar tu propia disponibilidad.' : undefined}
            >
              {(control) =>
                personReadOnly ? (
                  <Input {...control} readOnly disabled value={personName(userId)} />
                ) : (
                  <Select
                    value={userId}
                    onValueChange={(value) => {
                      setUserId(value);
                      setFieldErrors((prev) => ({ ...prev, userId: undefined }));
                    }}
                  >
                    <SelectTrigger ref={personRef} {...control}>
                      <SelectValue placeholder="Selecciona una persona" />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {personLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>

            <Field
              id="disp-hours"
              label="Horas disponibles"
              required
              error={fieldErrors.availableHours}
              help="Entero mayor o igual a 0. 0 significa «sin disponibilidad» ese mes."
            >
              <Input
                ref={hoursRef}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={availableHours}
                autoFocus
                placeholder="160"
                onChange={(e) => {
                  setAvailableHours(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, availableHours: undefined }));
                }}
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
