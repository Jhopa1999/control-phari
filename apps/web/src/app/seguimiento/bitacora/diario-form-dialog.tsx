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
import { Textarea } from '@/components/ui/textarea';
import type { DailyLog, Process } from '@/lib/api-client';
import { localDateInputValue } from '@/lib/format';

export interface DiarioFormValues {
  processId: string;
  date: string;
  dayNotes: string;
}

interface DiarioFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Diario en edicion; si se pasa, el dialog edita (PATCH solo notas). */
  editing?: DailyLog | null;
  /** Procesos en alcance para el Select de cabecera. */
  processes: Process[];
  submitting: boolean;
  /** Mensaje de error en linea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: DiarioFormValues) => void;
}

export function DiarioFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  submitting,
  errorMessage,
  onSubmit,
}: DiarioFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [date, setDate] = React.useState('');
  const [dayNotes, setDayNotes] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);

  // Inicializa al abrir. El reset solo ocurre aqui; ante fallo del POST/PATCH
  // el padre mantiene el dialog abierto con los valores (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setProcessId(editing.processId);
      setDate(editing.date);
      setDayNotes(editing.dayNotes ?? '');
    } else {
      setProcessId('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setDate(localDateInputValue());
      setDayNotes('');
    }
  }, [open, editing]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isEdit && !processId) {
      setClientError('Selecciona un proceso.');
      return;
    }
    if (!isEdit && !date) {
      setClientError('La fecha es obligatoria.');
      return;
    }
    setClientError(null);
    onSubmit({ processId, date, dayNotes });
  }

  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar notas del diario' : 'Nuevo diario'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'El proceso y la fecha de un diario no se cambian; edita solo las notas del dia.'
              : 'Un diario agrupa las actividades de un dia para un proceso. Luego agregas las lineas de actividad.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="diario-process">Proceso *</Label>
            {isEdit ? (
              <Input
                id="diario-process"
                readOnly
                disabled
                value={processName(processId)}
              />
            ) : (
              <Select value={processId} onValueChange={setProcessId}>
                <SelectTrigger id="diario-process">
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="diario-date">Fecha *</Label>
            <Input
              id="diario-date"
              type="date"
              value={date}
              readOnly={isEdit}
              disabled={isEdit}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="diario-notes">Notas del dia</Label>
            <Textarea
              id="diario-notes"
              value={dayNotes}
              placeholder="Observaciones o contexto del dia (opcional)."
              onChange={(e) => setDayNotes(e.target.value)}
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
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Guardando...'
                : isEdit
                  ? 'Guardar cambios'
                  : 'Crear diario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
