'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { FormError } from '@/components/field';
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
import type { Meeting } from '@/lib/api-client';
import {
  DuracionField,
  EMPTY_DURATION,
  durationToParts,
  partsToMinutes,
  type DuracionParts,
} from './duracion-field';

const FORM_ID = 'reu-duracion-form';

export interface RegistrarDuracionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting | null;
  submitting: boolean;
  /** Error de la API; se conserva ante fallo. */
  errorMessage: string | null;
  onSubmit: (durationMinutes: number) => void;
}

/**
 * Registra solo la duración de un acta ya cerrada (la API admite ese único
 * campo sobre un acta cerrada, para el responsable, el líder o el jefe).
 */
export function RegistrarDuracionDialog({
  open,
  onOpenChange,
  meeting,
  submitting,
  errorMessage,
  onSubmit,
}: RegistrarDuracionDialogProps): React.ReactElement {
  const [duration, setDuration] = React.useState<DuracionParts>(EMPTY_DURATION);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const hoursRef = React.useRef<HTMLButtonElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  useResetOnChange([open, meeting], () => {
    if (!open) return;
    setFieldError(null);
    setDuration(durationToParts(meeting?.durationMinutes));
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const minutes = partsToMinutes(duration);
    if (minutes === null || minutes < 15) {
      setFieldError('La duración debe ser de 15 minutos o más, en pasos de 15.');
      hoursRef.current?.focus();
      return;
    }
    onSubmit(minutes);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Registrar duración</DialogTitle>
          <DialogDescription>
            Los participantes verán esta duración en las sugerencias de su bitácora.
          </DialogDescription>
        </DialogHeader>
        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <DuracionField
              id="reu-duracion-solo"
              value={duration}
              onChange={(next) => {
                setDuration(next);
                setFieldError(null);
              }}
              meetingTime={meeting?.meetingTime ?? undefined}
              error={fieldError}
              help={null}
              hoursRef={hoursRef}
            />
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
              {submitting ? 'Guardando…' : 'Guardar duración'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
