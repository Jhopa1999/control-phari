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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Process } from '@/lib/api-client';

export interface SemanalFormValues {
  processId: string;
  weekStart: string;
}

interface SemanalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processes: Process[];
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: SemanalFormValues) => void;
}

/** Lunes de la semana actual en formato YYYY-MM-DD (UTC). */
function currentMonday(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff),
  );
  return monday.toISOString().slice(0, 10);
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
  const [clientError, setClientError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    setProcessId('');
    setWeekStart(currentMonday());
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!processId) {
      setClientError('Selecciona un proceso.');
      return;
    }
    if (!weekStart) {
      setClientError('Selecciona una fecha de la semana.');
      return;
    }
    setClientError(null);
    onSubmit({ processId, weekStart });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo registro semanal</DialogTitle>
          <DialogDescription>
            El registro se ancla al lunes de la semana. Puedes elegir cualquier
            dia; el sistema lo ajusta al lunes correspondiente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sem-process">Proceso *</Label>
            <Select value={processId} onValueChange={setProcessId}>
              <SelectTrigger id="sem-process">
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sem-week">Semana (dia cualquiera) *</Label>
            <Input
              id="sem-week"
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se usara el lunes de esa semana como ancla.
            </p>
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
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creando...' : 'Crear semanal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
