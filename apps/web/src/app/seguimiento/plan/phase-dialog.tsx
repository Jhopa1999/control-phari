'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

/** Fecha ISO -> valor de <input type="date"> (yyyy-mm-dd). */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** yyyy-mm-dd -> ISO date-time (o undefined si vacio). */
function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrio un error inesperado.';
}

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
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Prellenar al abrir (reset solo en exito, AC-031).
  React.useEffect(() => {
    if (open) {
      setName(phase?.name ?? '');
      setStartDate(toDateInput(phase?.startDate));
      setEndDate(toDateInput(phase?.endDate));
      setDeliverable(phase?.deliverable ?? '');
      setClientError(null);
    }
  }, [open, phase]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setClientError('El nombre de la fase es obligatorio.');
      return;
    }
    setClientError(null);
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
      setClientError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{phase ? 'Editar fase' : 'Nueva fase'}</DialogTitle>
          <DialogDescription>
            Define el nombre, el periodo y el entregable de la fase.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="phase-name">Nombre *</Label>
            <Input
              id="phase-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="phase-start">Inicio</Label>
              <Input
                id="phase-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phase-end">Fin</Label>
              <Input
                id="phase-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phase-deliverable">Entregable</Label>
            <Textarea
              id="phase-deliverable"
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
            />
          </div>

          {clientError ? (
            <p className="text-sm text-destructive" role="alert">
              {clientError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
