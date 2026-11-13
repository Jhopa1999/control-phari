'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError } from '@/components/field';
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
import type { RecurringOccurrence } from '@/lib/api-client';

interface CompleteOccurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: RecurringOccurrence | null;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: { comment: string; actualHours: number }) => void;
}

const COMMENT_MAX = 2000;

const FORM_ID = 'complete-occurrence-form';

/**
 * Marca una ocurrencia como completada. Pide qué se realizó y las horas reales
 * (ambos obligatorios). La ventana, la transición y la evidencia exigida las
 * valida el backend.
 */
export function CompleteOccurrenceDialog({
  open,
  onOpenChange,
  occurrence,
  submitting,
  errorMessage,
  onSubmit,
}: CompleteOccurrenceDialogProps): React.ReactElement {
  const [comment, setComment] = React.useState('');
  const [hours, setHours] = React.useState('');
  const [errors, setErrors] = React.useState<{ comment: string | null; hours: string | null }>({
    comment: null,
    hours: null,
  });
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  useResetOnChange([open], () => {
    if (!open) return;
    setComment('');
    setHours(occurrence ? String(occurrence.estimatedHours) : '');
    setErrors({ comment: null, hours: null });
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = comment.trim();
    const actualHours = Number.parseFloat(hours.replace(',', '.'));
    const next = {
      comment: text === '' ? 'Describe qué se realizó.' : null,
      hours:
        Number.isFinite(actualHours) && actualHours > 0 && actualHours <= 999.99
          ? null
          : 'Indica las horas reales (mayor que 0).',
    };
    setErrors(next);
    if (next.comment || next.hours) return;
    onSubmit({ comment: text, actualHours });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Completar actividad</DialogTitle>
          <DialogDescription>
            {occurrence
              ? `Marcar «${occurrence.activityTitle}» como completada.`
              : 'Marcar la actividad como completada.'}
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <Field
              id="complete-comment"
              label="Qué se realizó"
              required
              error={errors.comment}
            >
              <Textarea
                value={comment}
                rows={3}
                maxLength={COMMENT_MAX}
                onChange={(e) => {
                  setComment(e.target.value);
                  setErrors((p) => (p.comment ? { ...p, comment: null } : p));
                }}
              />
            </Field>
            <Field
              id="complete-hours"
              label="Horas reales"
              required
              help={occurrence ? `Estimadas: ${occurrence.estimatedHours} h.` : undefined}
              error={errors.hours}
            >
              <Input
                type="number"
                inputMode="decimal"
                min={0.25}
                step={0.25}
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  setErrors((p) => (p.hours ? { ...p, hours: null } : p));
                }}
              />
            </Field>
            <FormError id={FORM_ID} message={errorMessage} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : 'Completar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
