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
import type { Process } from '@/lib/api-client';
import { localWeekMondayInputValue } from '@/lib/format';

export interface SemanalFormValues {
  processId: string;
  weekStart: string;
}

interface SemanalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processes: Process[];
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: SemanalFormValues) => void;
}

type FieldKey = 'processId' | 'weekStart';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `sem-form-error`. */
const FORM_ID = 'sem-form';

/** Reglas del cliente, las mismas de siempre, evaluadas todas a la vez (design §9). */
function validate(values: SemanalFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.processId) errors.processId = 'Selecciona un proceso.';
  if (!values.weekStart) errors.weekStart = 'Selecciona una fecha de la semana.';
  return errors;
}

export function SemanalFormDialog({
  open,
  onOpenChange,
  processes,
  submitting,
  errorMessage,
  onSubmit,
}: SemanalFormDialogProps): React.ReactElement {
  const [processId, setProcessId] = React.useState('');
  const [weekStart, setWeekStart] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const processRef = React.useRef<HTMLButtonElement>(null);
  const weekRef = React.useRef<HTMLInputElement>(null);

  // Inicializa al abrir. El reset solo ocurre aquí; ante fallo del POST el
  // padre mantiene el diálogo abierto con los valores (AC-031).
  useResetOnChange([open], () => {
    if (!open) return;
    setFieldErrors({});
    setProcessId('');
    // Lunes de la semana actual en el calendario local (design §7.9, regla 2).
    setWeekStart(localWeekMondayInputValue());
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const values = { processId, weekStart };
    const errors = validate(values);
    setFieldErrors(errors);
    if (errors.processId || errors.weekStart) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.processId) processRef.current?.focus();
      else weekRef.current?.focus();
      return;
    }
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Nuevo reporte semanal</DialogTitle>
          <DialogDescription>
            El reporte se ancla al lunes de la semana. Puedes elegir cualquier día; el sistema lo
            ajusta al lunes correspondiente.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="sem-process" label="Proceso" required error={fieldErrors.processId}>
              {(control) => (
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
              )}
            </Field>

            <Field
              id="sem-week"
              label="Semana (día cualquiera)"
              required
              error={fieldErrors.weekStart}
              help="Se usará el lunes de esa semana."
            >
              <Input
                ref={weekRef}
                type="date"
                value={weekStart}
                onChange={(e) => {
                  setWeekStart(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, weekStart: undefined }));
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
              {submitting ? 'Creando…' : 'Crear reporte semanal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
