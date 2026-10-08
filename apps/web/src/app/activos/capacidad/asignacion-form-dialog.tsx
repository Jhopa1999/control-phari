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
import type {
  Assignment,
  CapacityPerson,
  Process,
  Request,
} from '@/lib/api-client';

export interface AsignacionFormValues {
  userId: string;
  processId: string;
  requestId: string;
  committedHours: string;
  description: string;
}

/** Valor del Select de solicitud que representa "sin solicitud". */
const NO_REQUEST = '__none__';

interface AsignacionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mes activo (YYYY-MM), fijado desde el selector principal. */
  month: string;
  /** Asignacion en edicion; si se pasa, el dialog edita (PATCH). */
  editing?: Assignment | null;
  people: CapacityPerson[];
  processes: Process[];
  requests: Request[];
  /** True cuando el actor solo puede asignarse a si mismo (integrante). */
  lockPerson: boolean;
  selfUserId: string | null;
  submitting: boolean;
  /** Mensaje de error en linea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: AsignacionFormValues) => void;
}

function personLabel(person: CapacityPerson): string {
  return person.identifier ? `${person.name} (${person.identifier})` : person.name;
}

export function AsignacionFormDialog({
  open,
  onOpenChange,
  month,
  editing,
  people,
  processes,
  requests,
  lockPerson,
  selfUserId,
  submitting,
  errorMessage,
  onSubmit,
}: AsignacionFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<AsignacionFormValues>({
    userId: '',
    processId: '',
    requestId: '',
    committedHours: '',
    description: '',
  });
  const [clientError, setClientError] = React.useState<string | null>(null);

  // Inicializa al abrir. El reset solo ocurre aqui (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setValues({
        userId: editing.userId,
        processId: editing.processId,
        requestId: editing.requestId ?? '',
        committedHours: String(editing.committedHours),
        description: editing.description ?? '',
      });
    } else {
      setValues({
        userId: lockPerson && selfUserId ? selfUserId : '',
        processId: '',
        requestId: '',
        committedHours: '',
        description: '',
      });
    }
  }, [open, editing, lockPerson, selfUserId]);

  const activeProcesses = React.useMemo(
    () => processes.filter((p) => p.active),
    [processes],
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.userId) {
      setClientError('Selecciona una persona.');
      return;
    }
    if (!values.processId) {
      setClientError('El proceso es obligatorio.');
      return;
    }
    const trimmed = values.committedHours.trim();
    if (trimmed === '') {
      setClientError('Las horas comprometidas son obligatorias.');
      return;
    }
    const hours = Number(trimmed);
    if (!Number.isInteger(hours) || hours < 0) {
      setClientError('Las horas comprometidas deben ser un entero mayor o igual a 0.');
      return;
    }
    setClientError(null);
    onSubmit({ ...values, committedHours: trimmed });
  }

  const personName = (id: string) =>
    people.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar asignacion' : 'Nueva asignacion'}
          </DialogTitle>
          <DialogDescription>
            Las asignaciones se suman por persona y mes. Una persona puede tener
            varias asignaciones en distintos procesos o solicitudes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="asig-month">Mes</Label>
            <Input id="asig-month" value={month} readOnly disabled />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asig-person">Persona *</Label>
            {isEdit || (lockPerson && selfUserId) ? (
              <Input
                id="asig-person"
                readOnly
                disabled
                value={personName(values.userId)}
              />
            ) : (
              <Select
                value={values.userId}
                onValueChange={(value) =>
                  setValues((v) => ({ ...v, userId: value }))
                }
              >
                <SelectTrigger id="asig-person">
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asig-process">Proceso *</Label>
            <Select
              value={values.processId}
              onValueChange={(value) =>
                setValues((v) => ({ ...v, processId: value }))
              }
            >
              <SelectTrigger id="asig-process">
                <SelectValue placeholder="Selecciona un proceso" />
              </SelectTrigger>
              <SelectContent>
                {activeProcesses.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asig-request">Solicitud</Label>
            <Select
              value={values.requestId === '' ? NO_REQUEST : values.requestId}
              onValueChange={(value) =>
                setValues((v) => ({
                  ...v,
                  requestId: value === NO_REQUEST ? '' : value,
                }))
              }
            >
              <SelectTrigger id="asig-request">
                <SelectValue placeholder="Sin solicitud" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_REQUEST}>Sin solicitud</SelectItem>
                {requests.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Opcional. La solicitud debe pertenecer a un proceso en tu alcance.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asig-hours">Horas comprometidas *</Label>
            <Input
              id="asig-hours"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values.committedHours}
              placeholder="40"
              onChange={(e) =>
                setValues((v) => ({ ...v, committedHours: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Entero mayor o igual a 0.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asig-description">Descripcion</Label>
            <Textarea
              id="asig-description"
              value={values.description}
              placeholder="Distribucion del esfuerzo por periodo (opcional)."
              onChange={(e) =>
                setValues((v) => ({ ...v, description: e.target.value }))
              }
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
                  : 'Crear asignacion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
