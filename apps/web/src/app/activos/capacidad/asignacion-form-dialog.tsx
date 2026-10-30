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
import type {
  Assignment,
  CapacityPerson,
  Process,
  Request,
} from '@/lib/api-client';
import { formatMonth } from '@/lib/format';

export interface AsignacionFormValues {
  userId: string;
  processId: string;
  requestId: string;
  committedHours: string;
  description: string;
}

/** Valor del Select de solicitud que representa "sin solicitud". */
const NO_REQUEST = '__none__';

/** Id del formulario: el FormError lleva `asig-form-error`. */
const FORM_ID = 'asig-form';

type FieldKey = 'userId' | 'processId' | 'committedHours';
type FieldErrors = Partial<Record<FieldKey, string>>;

interface AsignacionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mes activo (YYYY-MM), fijado desde el selector principal. */
  month: string;
  /** Asignación en edición; si se pasa, el diálogo edita (PATCH). */
  editing?: Assignment | null;
  people: CapacityPerson[];
  processes: Process[];
  requests: Request[];
  /** True cuando el actor solo puede asignarse a sí mismo (integrante). */
  lockPerson: boolean;
  selfUserId: string | null;
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: AsignacionFormValues) => void;
}

function personLabel(person: CapacityPerson): string {
  return person.identifier ? `${person.name} (${person.identifier})` : person.name;
}

/** Reglas del cliente, las mismas de siempre, evaluadas todas a la vez (design §9). */
function validate(values: AsignacionFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.userId) errors.userId = 'Selecciona una persona.';
  if (!values.processId) errors.processId = 'El proceso es obligatorio.';
  const trimmed = values.committedHours.trim();
  if (trimmed === '') {
    errors.committedHours = 'Las horas comprometidas son obligatorias.';
  } else {
    const hours = Number(trimmed);
    if (!Number.isInteger(hours) || hours < 0) {
      errors.committedHours = 'Las horas comprometidas deben ser un entero mayor o igual a 0.';
    }
  }
  return errors;
}

const EMPTY_VALUES: AsignacionFormValues = {
  userId: '',
  processId: '',
  requestId: '',
  committedHours: '',
  description: '',
};

export function AsignacionFormDialog({
  open,
  onOpenChange,
  month,
  editing,
  people,
  processes,
  requests,
  lockPerson,
  selfUserId,
  submitting,
  errorMessage,
  onSubmit,
}: AsignacionFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const personReadOnly = isEdit || (lockPerson && selfUserId !== null);
  const [values, setValues] = React.useState<AsignacionFormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const personRef = React.useRef<HTMLButtonElement>(null);
  const processRef = React.useRef<HTMLButtonElement>(null);
  const hoursRef = React.useRef<HTMLInputElement>(null);

  // Inicializa al abrir. El reset solo ocurre aquí (AC-031).
  useResetOnChange([open, editing, lockPerson, selfUserId], () => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setValues({
        userId: editing.userId,
        processId: editing.processId,
        requestId: editing.requestId ?? '',
        committedHours: String(editing.committedHours),
        description: editing.description ?? '',
      });
    } else {
      setValues({ ...EMPTY_VALUES, userId: lockPerson && selfUserId ? selfUserId : '' });
    }
  });

  const activeProcesses = React.useMemo(() => processes.filter((p) => p.active), [processes]);

  function update<K extends keyof AsignacionFormValues>(key: K, value: AsignacionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((prev) => (key in prev ? { ...prev, [key]: undefined } : prev));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate(values);
    setFieldErrors(errors);
    if (errors.userId || errors.processId || errors.committedHours) {
      // Foco al primer campo con error que se pueda enfocar, en orden del DOM.
      if (errors.userId && !personReadOnly) personRef.current?.focus();
      else if (errors.processId) processRef.current?.focus();
      else if (errors.committedHours) hoursRef.current?.focus();
      return;
    }
    onSubmit({ ...values, committedHours: values.committedHours.trim() });
  }

  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar asignación' : 'Nueva asignación'}</DialogTitle>
          <DialogDescription>
            Las asignaciones se suman por persona y mes. Una persona puede tener varias
            asignaciones en distintos procesos o solicitudes.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="asig-month" label="Mes" help="Fijado por el selector de mes de la pantalla.">
                <Input value={month ? formatMonth(month) : ''} readOnly disabled />
              </Field>

              <Field
                id="asig-person"
                label="Persona"
                required
                error={fieldErrors.userId}
              >
                {(control) =>
                  personReadOnly ? (
                    <Input {...control} readOnly disabled value={personName(values.userId)} />
                  ) : (
                    <Select value={values.userId} onValueChange={(value) => update('userId', value)}>
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
            </div>

            <Field id="asig-process" label="Proceso" required error={fieldErrors.processId}>
              {(control) => (
                <Select value={values.processId} onValueChange={(value) => update('processId', value)}>
                  <SelectTrigger ref={processRef} {...control}>
                    <SelectValue placeholder="Selecciona un proceso" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProcesses.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              id="asig-request"
              label="Solicitud"
              help="Opcional. La solicitud debe pertenecer a un proceso en tu alcance."
            >
              {(control) => (
                <Select
                  value={values.requestId === '' ? NO_REQUEST : values.requestId}
                  onValueChange={(value) => update('requestId', value === NO_REQUEST ? '' : value)}
                >
                  <SelectTrigger {...control}>
                    <SelectValue placeholder="Sin solicitud" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_REQUEST}>Sin solicitud</SelectItem>
                    {requests.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              id="asig-hours"
              label="Horas comprometidas"
              required
              error={fieldErrors.committedHours}
              help="Entero mayor o igual a 0."
            >
              <Input
                ref={hoursRef}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={values.committedHours}
                placeholder="40"
                className="sm:w-40"
                onChange={(e) => update('committedHours', e.target.value)}
              />
            </Field>

            <Field id="asig-description" label="Descripción">
              <Textarea
                value={values.description}
                placeholder="Distribución del esfuerzo por periodo (opcional)."
                onChange={(e) => update('description', e.target.value)}
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear asignación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
