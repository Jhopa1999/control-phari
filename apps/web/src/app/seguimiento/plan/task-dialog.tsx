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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { Task, CoordinationPerson } from '@/lib/api-client';
import { PlanError } from '@/lib/plan';
import { createTask, updateTask } from '@/lib/tasks';
import {
  addDependency,
  listDependencies,
  removeDependency,
} from '@/lib/task-dependencies';
import { listCoordinationPeople } from '@/lib/worklog';

interface TaskDialogProps {
  open: boolean;
  task: Task | null;
  phaseId: string | null;
  allTasks: Task[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrio un error inesperado.';
}

export function TaskDialog({
  open,
  task,
  phaseId,
  allTasks,
  onOpenChange,
  onSaved,
}: TaskDialogProps): React.ReactElement {
  const [title, setTitle] = React.useState('');
  const [responsibleUserId, setResponsibleUserId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [estimateHours, setEstimateHours] = React.useState('');
  const [isMilestone, setIsMilestone] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [users, setUsers] = React.useState<CoordinationPerson[]>([]);
  const [predecessorIds, setPredecessorIds] = React.useState<Set<string>>(
    new Set(),
  );

  // Personas en alcance para el selector de responsable. Usa
  // /coordination/people (disponible para los 3 roles, filtrado por alcance),
  // NO /users (que es solo-jefe): quien gestiona el plan es el lider, y debe
  // poder asignar responsables de su proceso. Si falla, se degrada a un
  // selector vacio sin romper el formulario.
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    void listCoordinationPeople()
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch(() => {
        if (active) setUsers([]);
      });
    return () => {
      active = false;
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setResponsibleUserId(task?.responsibleUserId ?? '');
      setStartDate(toDateInput(task?.startDate));
      setEndDate(toDateInput(task?.endDate));
      setEstimateHours(
        task?.estimateHours !== null && task?.estimateHours !== undefined
          ? String(task.estimateHours)
          : '',
      );
      setIsMilestone(task?.isMilestone ?? false);
      setDescription(task?.description ?? '');
      setAcceptanceCriteria(task?.acceptanceCriteria ?? '');
      setPredecessorIds(
        new Set((task?.predecessors ?? []).map((p) => p.id)),
      );
      setClientError(null);
    }
  }, [open, task]);

  // Candidatas a predecesora: tareas del mismo plan, sin ofrecer la propia.
  const candidates = React.useMemo(
    () => allTasks.filter((t) => t.id !== task?.id),
    [allTasks, task],
  );

  function togglePredecessor(id: string) {
    setPredecessorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function syncDependencies(taskId: string) {
    // Solo para edicion: se calcula el delta frente a las predecesoras actuales.
    const current = await listDependencies(taskId);
    const currentIds = new Set(current.map((d) => d.predecessorTaskId));
    const toAdd = [...predecessorIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !predecessorIds.has(id));
    for (const predecessorTaskId of toAdd) {
      await addDependency(taskId, { predecessorTaskId });
    }
    for (const predecessorTaskId of toRemove) {
      await removeDependency(taskId, predecessorTaskId);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setClientError('El titulo de la tarea es obligatorio.');
      return;
    }
    // Regla hito (BR-010/AC-011): una sola fecha y 0 horas. La UI lo fuerza; el
    // backend es el control real.
    const effectiveEnd = isMilestone ? startDate || endDate : endDate;
    const effectiveStart = isMilestone ? startDate || endDate : startDate;
    const hours = isMilestone
      ? 0
      : estimateHours.trim() === ''
        ? undefined
        : Number(estimateHours);
    if (hours !== undefined && (Number.isNaN(hours) || hours < 0)) {
      setClientError('El esfuerzo debe ser un numero de horas valido.');
      return;
    }
    setClientError(null);
    setSubmitting(true);
    const body = {
      title: title.trim(),
      responsibleUserId: responsibleUserId || undefined,
      startDate: toIso(effectiveStart),
      endDate: toIso(effectiveEnd),
      estimateHours: hours,
      isMilestone,
      description: description.trim() || undefined,
      acceptanceCriteria: acceptanceCriteria.trim() || undefined,
    };
    try {
      if (task) {
        await updateTask(task.id, body);
        await syncDependencies(task.id);
        toast.success('Tarea actualizada.');
      } else {
        if (!phaseId) {
          setClientError('Falta la fase de la tarea.');
          setSubmitting(false);
          return;
        }
        await createTask(phaseId, body);
        toast.success('Tarea creada.');
      }
      onSaved();
    } catch (err) {
      setClientError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          <DialogDescription>
            Define responsable, fechas, esfuerzo y predecesoras.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="task-title">Titulo *</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-responsible">Responsable</Label>
            <Select
              value={responsibleUserId}
              onValueChange={setResponsibleUserId}
            >
              <SelectTrigger id="task-responsible">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={isMilestone}
              onCheckedChange={(checked) => {
                setIsMilestone(checked);
                if (checked) setEstimateHours('0');
              }}
            />
            Es un hito (una sola fecha, sin esfuerzo)
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="task-start">
                {isMilestone ? 'Fecha del hito' : 'Inicio'}
              </Label>
              <Input
                id="task-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {!isMilestone ? (
              <div className="grid gap-2">
                <Label htmlFor="task-end">Vencimiento</Label>
                <Input
                  id="task-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {!isMilestone ? (
            <div className="grid gap-2">
              <Label htmlFor="task-hours">Esfuerzo (horas)</Label>
              <Input
                id="task-hours"
                type="number"
                min={0}
                value={estimateHours}
                onChange={(e) => setEstimateHours(e.target.value)}
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="task-desc">Descripcion</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-criteria">Criterios de aceptacion</Label>
            <Textarea
              id="task-criteria"
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
            />
          </div>

          {task ? (
            <div className="grid gap-2">
              <Label>Predecesoras</Label>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay otras tareas en el plan.
                </p>
              ) : (
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={predecessorIds.has(c.id)}
                          onChange={() => togglePredecessor(c.id)}
                        />
                        {c.title}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Las predecesoras se gestionan tras crear la tarea.
            </p>
          )}

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
