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
import type { Availability, CapacityPerson } from '@/lib/api-client';

export interface DisponibilidadFormValues {
  userId: string;
  availableHours: string;
}

interface DisponibilidadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mes activo (YYYY-MM), fijado desde el selector principal. */
  month: string;
  /** Disponibilidad en edicion; si se pasa, el dialog edita (PATCH). */
  editing?: Availability | null;
  /** Personas en alcance para el Select. */
  people: CapacityPerson[];
  /** True cuando el actor solo puede registrar la suya (integrante). */
  lockPerson: boolean;
  /** userId del actor; se usa para fijar la persona cuando lockPerson. */
  selfUserId: string | null;
  submitting: boolean;
  /** Mensaje de error en linea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: DisponibilidadFormValues) => void;
}

function personLabel(person: CapacityPerson): string {
  return person.identifier ? `${person.name} (${person.identifier})` : person.name;
}

export function DisponibilidadFormDialog({
  open,
  onOpenChange,
  month,
  editing,
  people,
  lockPerson,
  selfUserId,
  submitting,
  errorMessage,
  onSubmit,
}: DisponibilidadFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [userId, setUserId] = React.useState('');
  const [availableHours, setAvailableHours] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);

  // Inicializa el formulario al abrir. El reset solo ocurre aqui; ante fallo
  // del POST/PATCH el padre mantiene el dialog abierto con los valores (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setUserId(editing.userId);
      setAvailableHours(String(editing.availableHours));
    } else {
      setUserId(lockPerson && selfUserId ? selfUserId : '');
      setAvailableHours('');
    }
  }, [open, editing, lockPerson, selfUserId]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) {
      setClientError('Selecciona una persona.');
      return;
    }
    const trimmed = availableHours.trim();
    if (trimmed === '') {
      setClientError('Las horas disponibles son obligatorias.');
      return;
    }
    const hours = Number(trimmed);
    if (!Number.isInteger(hours) || hours < 0) {
      setClientError('Las horas disponibles deben ser un entero mayor o igual a 0.');
      return;
    }
    setClientError(null);
    onSubmit({ userId, availableHours: trimmed });
  }

  const personName = (id: string) =>
    people.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar disponibilidad' : 'Registrar disponibilidad'}
          </DialogTitle>
          <DialogDescription>
            La disponibilidad se registra una sola vez por persona y mes. Para
            cambiarla, edita las horas de la fila existente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="disp-month">Mes</Label>
            <Input id="disp-month" value={month} readOnly disabled />
            <p className="text-xs text-muted-foreground">
              Fijado por el selector de mes de la pantalla.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="disp-person">Persona *</Label>
            {isEdit || (lockPerson && selfUserId) ? (
              <Input
                id="disp-person"
                readOnly
                disabled
                value={personName(userId)}
              />
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="disp-person">
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
            )}
            {lockPerson && !isEdit ? (
              <p className="text-xs text-muted-foreground">
                Solo puedes registrar tu propia disponibilidad.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="disp-hours">Horas disponibles *</Label>
            <Input
              id="disp-hours"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={availableHours}
              autoFocus
              placeholder="160"
              onChange={(e) => setAvailableHours(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Entero mayor o igual a 0. 0 significa &quot;sin disponibilidad&quot;
              ese mes.
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
              {submitting
                ? 'Guardando...'
                : isEdit
                  ? 'Guardar cambios'
                  : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
