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
  Commitment,
  CoordinationPerson,
  Meeting,
  Process,
} from '@/lib/api-client';
import { localDateInputValue } from '@/lib/format';

export interface CompromisoFormValues {
  processId: string;
  title: string;
  dueDate: string;
  assignedUserId: string;
  responsibleUserId: string;
  sourceMeetingId: string;
  expectedResult: string;
  blockers: string;
}

interface CompromisoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Commitment | null;
  processes: Process[];
  people: CoordinationPerson[];
  meetings: Meeting[];
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: CompromisoFormValues) => void;
}

const SIN_VALOR = '__none__';

export function CompromisoFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  people,
  meetings,
  submitting,
  errorMessage,
  onSubmit,
}: CompromisoFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [assignedUserId, setAssignedUserId] = React.useState('');
  const [responsibleUserId, setResponsibleUserId] = React.useState('');
  const [sourceMeetingId, setSourceMeetingId] = React.useState('');
  const [expectedResult, setExpectedResult] = React.useState('');
  const [blockers, setBlockers] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setProcessId(editing.processId);
      setTitle(editing.title);
      setDueDate(editing.dueDate);
      setAssignedUserId(editing.assignedUserId ?? '');
      setResponsibleUserId(editing.responsibleUserId ?? '');
      setSourceMeetingId(editing.sourceMeetingId ?? '');
      setExpectedResult(editing.expectedResult ?? '');
      setBlockers(editing.blockers ?? '');
    } else {
      setProcessId('');
      setTitle('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setDueDate(localDateInputValue());
      setAssignedUserId('');
      setResponsibleUserId('');
      setSourceMeetingId('');
      setExpectedResult('');
      setBlockers('');
    }
  }, [open, editing]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isEdit && !processId) {
      setClientError('Selecciona un proceso.');
      return;
    }
    if (!title.trim()) {
      setClientError('El titulo es obligatorio.');
      return;
    }
    if (!dueDate) {
      setClientError('El vencimiento es obligatorio.');
      return;
    }
    setClientError(null);
    onSubmit({
      processId,
      title,
      dueDate,
      assignedUserId,
      responsibleUserId,
      sourceMeetingId,
      expectedResult,
      blockers,
    });
  }

  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar compromiso' : 'Nuevo compromiso'}
          </DialogTitle>
          <DialogDescription>
            Un compromiso tiene vencimiento. La reunion fuente es opcional y solo
            relaciona; no se crea automaticamente desde reuniones.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="com-process">Proceso *</Label>
            {isEdit ? (
              <Input
                id="com-process"
                readOnly
                disabled
                value={processName(processId)}
              />
            ) : (
              <Select value={processId} onValueChange={setProcessId}>
                <SelectTrigger id="com-process">
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
            <Label htmlFor="com-title">Titulo *</Label>
            <Input
              id="com-title"
              value={title}
              placeholder="Que se compromete"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="com-due">Vencimiento *</Label>
            <Input
              id="com-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="com-assigned">Asignado</Label>
              <Select
                value={assignedUserId || SIN_VALOR}
                onValueChange={(v) =>
                  setAssignedUserId(v === SIN_VALOR ? '' : v)
                }
              >
                <SelectTrigger id="com-assigned">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin asignar</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="com-responsible">Responsable</Label>
              <Select
                value={responsibleUserId || SIN_VALOR}
                onValueChange={(v) =>
                  setResponsibleUserId(v === SIN_VALOR ? '' : v)
                }
              >
                <SelectTrigger id="com-responsible">
                  <SelectValue placeholder="Sin responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin responsable</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="com-meeting">Reunion fuente</Label>
            <Select
              value={sourceMeetingId || SIN_VALOR}
              onValueChange={(v) =>
                setSourceMeetingId(v === SIN_VALOR ? '' : v)
              }
            >
              <SelectTrigger id="com-meeting">
                <SelectValue placeholder="Sin reunion" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Sin reunion</SelectItem>
                {meetings.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title} ({m.meetingDate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="com-result">Resultado esperado</Label>
            <Textarea
              id="com-result"
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="com-blockers">Bloqueos</Label>
            <Textarea
              id="com-blockers"
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
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
                  : 'Crear compromiso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
