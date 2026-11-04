'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { toast } from 'sonner';
import { Field, FieldSet, FormError, RequiredHint } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
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
import type { Task, ResponsibleCandidate, PlanPhase } from '@/lib/api-client';
import { formatDateOnly } from '@/lib/format';
import { PlanError } from '@/lib/plan';
import { createTask, listResponsibleCandidates, updateTask } from '@/lib/tasks';
import {
  addDependency,
  listDependencies,
  removeDependency,
} from '@/lib/task-dependencies';

interface TaskDialogProps {
  open: boolean;
  task: Task | null;
  /** Fase sugerida al crear (la de origen, la del filtro o la inicial). */
  phaseId: string | null;
  allTasks: Task[];
  phases: PlanPhase[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Id del formulario: el FormError lleva `task-form-error`. */
const FORM_ID = 'task-form';

type FieldKey = 'title' | 'phase' | 'hours' | 'dates';
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

/** «5 ene 2026 – 30 ene 2026 · 3 tareas»: lo que ayuda a elegir la fase. */
function phaseSummary(phase: PlanPhase, taskCount: number): string {
  const range =
    phase.startDate || phase.endDate
      ? `${formatDateOnly(phase.startDate)} – ${formatDateOnly(phase.endDate)}`
      : 'Sin fechas';
  return `${range} · ${taskCount === 1 ? '1 tarea' : `${taskCount} tareas`}`;
}

function GroupHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

/**
 * Alta y edición de una tarea. Se organiza en bloques: qué y dónde (título y
 * fase, esta última destacada y siempre preseleccionada al crear), quién y
 * cuándo, detalle y predecesoras. Las reglas y llamadas son las de siempre; los
 * errores se evalúan todos a la vez. La fase no se puede cambiar al editar (la
 * API no lo admite) y las predecesoras solo se gestionan al editar.
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
  const [selectedPhaseId, setSelectedPhaseId] = React.useState('');
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
  const phaseRef = React.useRef<HTMLButtonElement>(null);
  const hoursRef = React.useRef<HTMLInputElement>(null);

  const [users, setUsers] = React.useState<ResponsibleCandidate[]>([]);
  const [peopleFailed, setPeopleFailed] = React.useState(false);
  const [predecessorIds, setPredecessorIds] = React.useState<Set<string>>(
    new Set(),
  );

  // Plan al que pertenece el diálogo (todas las fases comparten plan).
  const planId = phases[0]?.planId ?? null;

  // Candidatos a responsable: personas con grant activo en los procesos que
  // intervienen en la solicitud del plan (decididos en el triage), no todas las
  // personas en alcance. Así el desplegable ofrece solo lo que el backend
  // aceptará al asignar. Si falla, se avisa en el campo.
  React.useEffect(() => {
    if (!open || !planId) return;
    let active = true;
    void listResponsibleCandidates(planId)
      .then((data) => {
        if (!active) return;
        setUsers(data);
        setPeopleFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setUsers([]);
        setPeopleFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open, planId]);

  useResetOnChange([open, task], () => {
    if (open) {
      setTitle(task?.title ?? '');
      setSelectedPhaseId(task?.phaseId ?? phaseId ?? phases[0]?.id ?? '');
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

  const phase = React.useMemo(
    () => phases.find((p) => p.id === selectedPhaseId),
    [phases, selectedPhaseId],
  );
  const taskCountByPhase = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of allTasks) counts.set(t.phaseId, (counts.get(t.phaseId) ?? 0) + 1);
    return counts;
  }, [allTasks]);
  const suggestedFromOrigin = !task && phaseId !== null && phaseId === selectedPhaseId;

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
    const hours = estimateHours.trim() === '' ? undefined : Number(estimateHours);

    // Las reglas de siempre, evaluadas todas a la vez (design §9).
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = 'El título de la tarea es obligatorio.';
    if (!task && !selectedPhaseId) errors.phase = 'Elige la fase de la tarea.';
    if (hours !== undefined && (Number.isNaN(hours) || hours < 0)) {
      errors.hours = 'El esfuerzo debe ser un número de horas válido.';
    }
    const dateError = validateTaskDates(startDate, endDate, phase);
    if (dateError) errors.dates = dateError;
    setFieldErrors(errors);
    setFormError(null);
    if (errors.title || errors.phase || errors.hours || errors.dates) {
      // Foco al primer campo con error, en orden visual.
      if (errors.title) titleRef.current?.focus();
      else if (errors.phase) phaseRef.current?.focus();
      else if (errors.hours) hoursRef.current?.focus();
      return;
    }

    setSubmitting(true);
    const body = {
      title: title.trim(),
      responsibleUserId: responsibleUserId || undefined,
      startDate: toIso(startDate),
      endDate: toIso(endDate),
      estimateHours: hours,
      description: description.trim() || undefined,
      acceptanceCriteria: acceptanceCriteria.trim() || undefined,
    };
    try {
      if (task) {
        await updateTask(task.id, body);
        await syncDependencies(task.id);
        toast.success('Tarea actualizada.');
      } else {
        await createTask(selectedPhaseId, body);
        toast.success(phase ? `Tarea creada en «${phase.name}».` : 'Tarea creada.');
      }
      onSaved();
    } catch (err) {
      // Conserva los valores ante error (AC-031).
      setFormError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  const noPhases = !task && phases.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          <DialogDescription>
            Define qué hay que hacer, en qué fase, quién lo hace y cuándo.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-6">
            <RequiredHint />

            <div className="grid gap-4">
              <GroupHeading>Qué y dónde</GroupHeading>
              <Field
                id="task-title"
                label="Título"
                required
                error={fieldErrors.title}
                help="Una frase corta con un verbo, por ejemplo «Configurar el servidor»."
              >
                <Input
                  ref={titleRef}
                  autoFocus={!task}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearFieldError('title');
                  }}
                />
              </Field>

              {noPhases ? (
                <InlineNotice tone="warning" title="Primero crea una fase.">
                  <p className="text-muted-foreground">
                    Toda tarea vive dentro de una fase. Cierra este diálogo y usa «Nueva fase».
                  </p>
                </InlineNotice>
              ) : (
                <div className="rounded-xl bg-primary-subtle/50 p-3 ring-1 ring-primary/20">
                  {task ? (
                    <Field
                      id="task-phase"
                      label="Fase"
                      help="La fase no se puede cambiar. Para moverla, crea la tarea en la otra fase y elimina esta."
                    >
                      <div className="flex h-11 items-center gap-2 rounded-md border bg-card px-3 text-base font-medium">
                        <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 truncate">{phase?.name ?? 'Fase no disponible'}</span>
                      </div>
                    </Field>
                  ) : (
                    <Field
                      id="task-phase"
                      label="Fase"
                      required
                      error={fieldErrors.phase}
                      help={
                        suggestedFromOrigin && phase
                          ? `Preseleccionada desde «${phase.name}». La tarea se crea dentro de esta fase.`
                          : 'La tarea se crea dentro de esta fase.'
                      }
                    >
                      {(control) => (
                        <Select
                          value={selectedPhaseId}
                          onValueChange={(value) => {
                            setSelectedPhaseId(value);
                            clearFieldError('phase');
                            clearFieldError('dates');
                          }}
                        >
                          <SelectTrigger ref={phaseRef} {...control} className="h-11 bg-card text-base font-medium">
                            <SelectValue placeholder="Elige la fase" />
                          </SelectTrigger>
                          <SelectContent>
                            {phases.map((p) => (
                              <SelectItem
                                key={p.id}
                                value={p.id}
                                description={phaseSummary(p, taskCountByPhase.get(p.id) ?? 0)}
                              >
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 border-t pt-5">
              <GroupHeading>Quién y cuándo</GroupHeading>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field
                  id="task-responsible"
                  label="Responsable"
                  help={
                    peopleFailed
                      ? 'No se pudieron cargar las personas. Cierra y vuelve a abrir el diálogo.'
                      : 'Quien actualizará el estado y el avance.'
                  }
                >
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
                <Field id="task-hours" label="Esfuerzo (horas)" error={fieldErrors.hours} help="Opcional.">
                  <Input
                    ref={hoursRef}
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={estimateHours}
                    onChange={(e) => {
                      setEstimateHours(e.target.value);
                      clearFieldError('hours');
                    }}
                  />
                </Field>
                <Field id="task-start" label="Inicio">
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
              {fieldErrors.dates ? (
                <p role="alert" className="text-meta text-danger">
                  {fieldErrors.dates}
                </p>
              ) : phase && (phase.startDate || phase.endDate) ? (
                <p className="text-meta text-muted-foreground">
                  {`Dentro del rango de la fase «${phase.name}»: ${formatDateOnly(phase.startDate)} – ${formatDateOnly(phase.endDate)}.`}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 border-t pt-5">
              <GroupHeading>Detalle</GroupHeading>
              <Field id="task-desc" label="Descripción">
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Field
                id="task-criteria"
                label="Criterios de aceptación"
                help="Cómo sabrás que la tarea está lista."
              >
                <Textarea
                  rows={3}
                  value={acceptanceCriteria}
                  onChange={(e) => setAcceptanceCriteria(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 border-t pt-5">
              {task ? (
                <FieldSet
                  id="task-predecessors-field"
                  kind="checkbox"
                  legend={`Predecesoras${predecessorIds.size > 0 ? ` (${predecessorIds.size} seleccionadas)` : ''}`}
                >
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
                <>
                  <GroupHeading>Predecesoras</GroupHeading>
                  <InlineNotice tone="info">
                    Podrás elegir las predecesoras después de crear la tarea.
                  </InlineNotice>
                </>
              )}
            </div>

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
            <Button type="submit" loading={submitting} disabled={noPhases}>
              {submitting ? 'Guardando…' : task ? 'Guardar cambios' : 'Crear tarea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
