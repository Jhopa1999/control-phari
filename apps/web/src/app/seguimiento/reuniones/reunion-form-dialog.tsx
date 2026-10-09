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
import type { CoordinationPerson, Meeting, Process } from '@/lib/api-client';

export interface ReunionFormValues {
  processId: string;
  title: string;
  meetingDate: string;
  meetingTime: string;
  participantUserIds: string[];
  responsibleUserId: string;
  agenda: string;
  decisions: string;
  notes: string;
}

interface ReunionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Meeting | null;
  processes: Process[];
  people: CoordinationPerson[];
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: ReunionFormValues) => void;
}

const SIN_VALOR = '__none__';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReunionFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  people,
  submitting,
  errorMessage,
  onSubmit,
}: ReunionFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [meetingDate, setMeetingDate] = React.useState('');
  const [meetingTime, setMeetingTime] = React.useState('');
  const [participantUserIds, setParticipantUserIds] = React.useState<string[]>(
    [],
  );
  const [responsibleUserId, setResponsibleUserId] = React.useState('');
  const [agenda, setAgenda] = React.useState('');
  const [decisions, setDecisions] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setProcessId(editing.processId);
      setTitle(editing.title);
      setMeetingDate(editing.meetingDate);
      setMeetingTime(editing.meetingTime ?? '');
      setParticipantUserIds(editing.participantUserIds ?? []);
      setResponsibleUserId(editing.responsibleUserId ?? '');
      setAgenda(editing.agenda ?? '');
      setDecisions(editing.decisions ?? '');
      setNotes(editing.notes ?? '');
    } else {
      setProcessId('');
      setTitle('');
      setMeetingDate(today());
      setMeetingTime('');
      setParticipantUserIds([]);
      setResponsibleUserId('');
      setAgenda('');
      setDecisions('');
      setNotes('');
    }
  }, [open, editing]);

  function toggleParticipant(id: string) {
    setParticipantUserIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

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
    if (!meetingDate) {
      setClientError('La fecha es obligatoria.');
      return;
    }
    if (meetingTime && !/^\d{2}:\d{2}$/.test(meetingTime)) {
      setClientError('La hora debe tener formato HH:mm.');
      return;
    }
    setClientError(null);
    onSubmit({
      processId,
      title,
      meetingDate,
      meetingTime,
      participantUserIds,
      responsibleUserId,
      agenda,
      decisions,
      notes,
    });
  }

  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar reunion' : 'Nueva reunion'}</DialogTitle>
          <DialogDescription>
            Registra la reunion y sus participantes. La reunion inicia en estado
            Borrador.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="reu-process">Proceso *</Label>
            {isEdit ? (
              <Input
                id="reu-process"
                readOnly
                disabled
                value={processName(processId)}
              />
            ) : (
              <Select value={processId} onValueChange={setProcessId}>
                <SelectTrigger id="reu-process">
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
            <Label htmlFor="reu-title">Titulo *</Label>
            <Input
              id="reu-title"
              value={title}
              placeholder="Asunto de la reunion"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="reu-date">Fecha *</Label>
              <Input
                id="reu-date"
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reu-time">Hora (HH:mm)</Label>
              <Input
                id="reu-time"
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reu-responsible">Responsable</Label>
            <Select
              value={responsibleUserId || SIN_VALOR}
              onValueChange={(v) =>
                setResponsibleUserId(v === SIN_VALOR ? '' : v)
              }
            >
              <SelectTrigger id="reu-responsible">
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

          <div className="grid gap-2">
            <span className="text-sm font-medium">Participantes</span>
            {people.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay personas en tu alcance para agregar.
              </p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                {people.map((p) => {
                  const checked = participantUserIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={checked}
                        onChange={() => toggleParticipant(p.id)}
                      />
                      <span>{p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reu-agenda">Agenda</Label>
            <Textarea
              id="reu-agenda"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reu-decisions">Decisiones</Label>
            <Textarea
              id="reu-decisions"
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reu-notes">Observaciones</Label>
            <Textarea
              id="reu-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
                  : 'Crear reunion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
