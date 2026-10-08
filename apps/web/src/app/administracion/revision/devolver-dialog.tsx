'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface DevolverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestTitle: string;
  submitting: boolean;
  /** Error en linea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onConfirm: (reason: string) => void;
}

/**
 * Dialogo para devolver una solicitud en revision. El motivo es obligatorio
 * (si falta, el backend responde 400 y el formulario conserva los valores).
 */
export function DevolverDialog({
  open,
  onOpenChange,
  requestTitle,
  submitting,
  errorMessage,
  onConfirm,
}: DevolverDialogProps): React.ReactElement {
  const [reason, setReason] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setClientError(null);
    }
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setClientError('El motivo es obligatorio para devolver.');
      return;
    }
    setClientError(null);
    onConfirm(reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver solicitud</DialogTitle>
          <DialogDescription>
            Devolver &laquo;{requestTitle}&raquo; a triage. Indica el motivo de
            la devolucion.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="devolver-reason">Motivo *</Label>
            <Textarea
              id="devolver-reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {clientError || errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {clientError ?? errorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? 'Devolviendo...' : 'Devolver'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
