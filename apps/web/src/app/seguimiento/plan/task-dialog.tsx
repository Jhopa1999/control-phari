'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { toast } from 'sonner';
import { Field, FieldSet, FormError, RequiredHint } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Task, CoordinationPerson, PlanPhase } from '@/lib/api-client';
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
  phases: PlanPhase[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Id del formulario: el FormError lleva `task-form-error`. */
const FORM_ID = 'task-form';

type FieldKey = 'title' | 'hours' | 'dates';
type FieldErrors = Partial<Record<FieldKey, string>>;

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

function fmtDate(value: string): string {
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

/** PLA-04/PLA-05: fin >= inicio y fechas dentro del rango de la fase. */
function validateTaskDates(
  start: string,
  end: string,
  phase: PlanPhase | undefined,
): string | null {
  if (start && end && end < start) {
    return 'La fecha de vencimiento no puede ser anterior a la fecha de inicio.';
  }
  const phaseStart = phase?.startDate ? phase.startDate.slice(0, 10) : '';
  const phaseEnd = phase?.endDate ? phase.endDate.slice(0, 10) : '';
  const name = phase?.name ?? '';
  if (phaseStart && ((start && start < phaseStart) || (end && end < phaseStart))) {
    return `Las fechas de la tarea no pueden ser anteriores al inicio de la fase "${name}" (${fmtDate(phaseStart)}).`;
  }
  if (phaseEnd && ((end && end > phaseEnd) || (start && start > phaseEnd))) {
    return `Las fechas de la tarea no pueden ser posteriores al fin de la fase "${name}" (${fmtDate(phaseEnd)}).`;
  }
  return null;
}

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Alta y edición de una tarea (design §9 E, tamaño md). Mismos campos, reglas y
 * llamadas que antes, ahora con todos los errores a la vez; las predecesoras
 * solo se gestionan al editar.
 */
export function TaskDialog({
  open,
  task,
  phaseId,
  allTasks,
  phases,
  onOpenChange,
  onSaved,
}: TaskDialogProps): React.ReactElement {
  const [title, setTitle] = React.useState('');
  const [responsibleUserId, setResponsibleUserId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [estimateHours, setEstimateHours] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const hoursRef = React.useRef<HTMLInputElement>(null);

  const [users, setUsers] = React.useState<CoordinationPerson[]>([]);
  const [predecessorIds, setPredecessorIds] = React.useState<Set<string>>(
    new Set(),
  );

  // Personas en alcance para el selector de responsable. Usa
  // /coordination/people (disponible para los 3 roles, filtrado por alcance),
  // NO /users (que es solo-jefe): quien gestiona el plan es el líder, y debe
  // poder asignar responsables de su proceso. Si falla, se degrada a un
  // selector vacío sin romper el formulario.
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

  useResetOnChange([open, task], () => {
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
      setDescription(task?.description ?? '');
      setAcceptanceCriteria(task?.acceptanceCriteria ?? '');
      setPredecessorIds(
        new Set((task?.predecessors ?? []).map((p) => p.id)),
      );
      setFieldErrors({});
      setFormError(null);
    }
  });

  // Candidatas a predecesora: tareas del mismo plan, sin ofrecer la propia.
  const candidates = React.useMemo(
    () => allTasks.filter((t) => t.id !== task?.id),
    [allTasks, task],
  );

  function clearFieldError(key: FieldKey): void {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function togglePredecessor(id: string) {
    setPredecessorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function syncDependencies(taskId: string) {
    // Solo para edición: se calcula el delta frente a las predecesoras actuales.
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
    if (submitting) return;
    const effectiveEnd = endDate;
    const effectiveStart = startDate;
    const hours = estimateHours.trim() === '' ? undefined : Number(estimateHours);

    // Las reglas de siempre, evaluadas todas a la vez (design §9).
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = 'El título de la tarea es obligatorio.';
    if (hours !== undefined && (Number.isNaN(hours) || hours < 0)) {
      errors.hours = 'El esfuerzo debe ser un número de horas válido.';
    }
    const dateError = validateTaskDates(
      startDate,
      endDate,
      phases.find((p) => p.id === (task?.phaseId ?? phaseId)),
    );
    if (dateError) errors.dates = dateError;
    const missingPhase = !task && !phaseId;
    setFieldErrors(errors);
    setFormError(missingPhase ? 'Falta la fase de la tarea.' : null);
    if (errors.title || errors.hours || errors.dates || missingPhase) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.title) titleRef.current?.focus();
      else if (errors.hours) hoursRef.current?.focus();
      return;
    }

    setSubmitting(true);
    const body = {
      title: title.trim(),
      responsibleUserId: responsibleUserId || undefined,
      startDate: toIso(effectiveStart),
      endDate: toIso(effectiveEnd),
      estimateHours: hours,
      description: description.trim() || undefined,
      acceptanceCriteria: acceptanceCriteria.trim() || undefined,
    };
    try {
      if (task) {
        await updateTask(task.id, body);
        await syncDependencies(task.id);
        toast.success('Tarea actualizada.');
      } else if (phaseId) {
        await createTask(phaseId, body);
        toast.success('Tarea creada.');
      }
      onSaved();
    } catch (err) {
      // Conserva los valores ante error (AC-031).
      setFormError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{task ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          <DialogDescription>
            Define responsable, fechas, esfuerzo y predecesoras.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="task-title" label="Título" required error={fieldErrors.title}>
              <Input
                ref={titleRef}
                autoFocus
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearFieldError('title');
                }}
              />
            </Field>

            <Field id="task-responsible" label="Responsable">
              {(control) => (
                <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
                  <SelectTrigger {...control}>
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
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="task-start" label="Inicio" error={fieldErrors.dates}>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    clearFieldError('dates');
                  }}
                />
              </Field>
              <Field id="task-end" label="Vencimiento">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    clearFieldError('dates');
                  }}
                />
              </Field>
            </div>

            <Field id="task-hours" label="Esfuerzo (horas)" error={fieldErrors.hours}>
              <Input
                ref={hoursRef}
                type="number"
                min={0}
                inputMode="decimal"
                className="sm:w-40"
                value={estimateHours}
                onChange={(e) => {
                  setEstimateHours(e.target.value);
                  clearFieldError('hours');
                }}
              />
            </Field>

            <Field id="task-desc" label="Descripción">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            <Field id="task-criteria" label="Criterios de aceptación">
              <Textarea
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
              />
            </Field>

            {task ? (
              <FieldSet id="task-predecessors-field" kind="checkbox" legend="Predecesoras">
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay otras tareas en el plan.</p>
                ) : (
                  <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border px-3 py-1">
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={predecessorIds.has(c.id)}
                            onChange={() => togglePredecessor(c.id)}
                          />
                          <span className="min-w-0 wrap-break-word">{c.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </FieldSet>
            ) : (
              <p className="text-meta text-muted-foreground">
                Las predecesoras se gestionan tras crear la tarea.
              </p>
            )}

            <FormError id={FORM_ID} message={formError} />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : task ? 'Guardar cambios' : 'Crear tarea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
