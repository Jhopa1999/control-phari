'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import type { PlanPhase } from '@/lib/api-client';
import { PlanError } from '@/lib/plan';
import { createPhase, updatePhase } from '@/lib/plan-phases';

interface PhaseDialogProps {
  open: boolean;
  phase: PlanPhase | null;
  planId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Id del formulario: el FormError lleva `phase-form-error`. */
const FORM_ID = 'phase-form';

/** Fecha ISO -> valor de <input type="date"> (yyyy-mm-dd), en UTC como siempre. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** yyyy-mm-dd -> ISO date-time (o undefined si vacío). */
function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Alta y edición de una fase (design §9 E, tamaño sm). Mismos campos, reglas y
 * llamadas que antes; los valores se conservan ante cualquier error (AC-031).
 */
export function PhaseDialog({
  open,
  phase,
  planId,
  onOpenChange,
  onSaved,
}: PhaseDialogProps): React.ReactElement {
  const [name, setName] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [deliverable, setDeliverable] = React.useState('');
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Prellenar al abrir (reset solo en éxito, AC-031).
  useResetOnChange([open, phase], () => {
    if (open) {
      setName(phase?.name ?? '');
      setStartDate(toDateInput(phase?.startDate));
      setEndDate(toDateInput(phase?.endDate));
      setDeliverable(phase?.deliverable ?? '');
      setNameError(null);
      setDateError(null);
      setFormError(null);
    }
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setNameError('El nombre de la fase es obligatorio.');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setFormError(null);
    if (startDate && endDate && endDate < startDate) {
      setDateError('La fecha de fin no puede ser anterior a la fecha de inicio.');
      return;
    }
    setDateError(null);
    setSubmitting(true);
    const body = {
      name: name.trim(),
      startDate: toIso(startDate),
      endDate: toIso(endDate),
      deliverable: deliverable.trim() || undefined,
    };
    try {
      if (phase) {
        await updatePhase(planId, phase.id, body);
        toast.success('Fase actualizada.');
      } else {
        await createPhase(planId, body);
        toast.success('Fase creada.');
      }
      onSaved();
    } catch (err) {
      // Conserva los valores ante error (AC-031).
      setFormError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{phase ? 'Editar fase' : 'Nueva fase'}</DialogTitle>
          <DialogDescription>Define el nombre, el periodo y el entregable de la fase.</DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="phase-name" label="Nombre" required error={nameError}>
              <Input
                ref={nameRef}
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="phase-start" label="Inicio">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDateError(null);
                  }}
                />
              </Field>
              <Field id="phase-end" label="Fin" error={dateError}>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDateError(null);
                  }}
                />
              </Field>
            </div>
            <Field id="phase-deliverable" label="Entregable">
              <Textarea value={deliverable} onChange={(e) => setDeliverable(e.target.value)} />
            </Field>

            <FormError id={FORM_ID} message={formError} />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : phase ? 'Guardar cambios' : 'Crear fase'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
