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
import { Textarea } from '@/components/ui/textarea';
import type { RecurringOccurrence } from '@/lib/api-client';

interface CompleteOccurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: RecurringOccurrence | null;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (comment: string) => void;
}

const FORM_ID = 'complete-occurrence-form';

/**
 * Marca una ocurrencia como completada. El comentario/evidencia es OPCIONAL:
 * se puede completar sin texto. La transición de estado la valida el backend.
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
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  useResetOnChange([open], () => {
    if (open) setComment('');
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(comment.trim());
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
              label="Comentario o evidencia (opcional)"
              help="Puedes dejarlo vacío."
            >
              <Textarea
                value={comment}
                rows={3}
                onChange={(e) => setComment(e.target.value)}
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
