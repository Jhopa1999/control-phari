'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import Link from 'next/link';
import { AlarmClock, CircleCheck, Clock, ExternalLink, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { DisabledReason } from '@/components/disabled-reason';
import { ErrorState } from '@/components/error-state';
import { Field, FormError } from '@/components/field';
import { PageHeader, type Crumb } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RequirementsPanel } from '@/components/requirements-panel';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { progressTone } from '@/components/task-progress';
import type { CoordinationPerson, Task, TaskHistoryEntry, TaskStatus } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { formatDateOnly, formatHours, formatPercent, localDateInputValue } from '@/lib/format';
import { dueLabel, taskDueInfo } from '@/lib/task-due';
import { cn } from '@/lib/utils';
import { listCoordinationPeople } from '@/lib/worklog';
import { PlanError } from '@/lib/plan';
import {
  getTask,
  getTaskHistory,
  taskStatusLabel,
  updateTaskProgress,
  updateTaskStatus,
} from '@/lib/tasks';
import { TaskProgressControl } from '../plan/task-progress-control';
import { TaskHistory } from './task-history';
import { TaskEvidenceFiles } from './task-evidence-files';
import { nextTaskStatuses } from '@/lib/task-transitions';

type LoadState = 'loading' | 'success' | 'error';
type FieldKey = 'nextStatus' | 'progress';
type FieldErrors = Partial<Record<FieldKey, string>>;

const NO_TRANSITIONS_REASON_ID = 'task-status-reason';

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function taskHref(id: string): string {
  return `/seguimiento/tareas?taskId=${encodeURIComponent(id)}`;
}

export interface TaskDetailProps {
  taskId: string;
  /**
   * true: se muestra dentro de un panel lateral (sin PageLayout/PageHeader,
   * una sola columna); las predecesoras se abren con `onSelectTask`.
   */
  embedded?: boolean;
  breadcrumbs?: Crumb[];
  /** Embebido: abre otra tarea (p. ej. una predecesora) en el mismo panel. */
  onSelectTask?: (id: string) => void;
  /** Se invoca con la tarea actualizada tras cambiar su estado. */
  onChanged?: (task: Task) => void;
  /** Nombre de la fase de la tarea (lo conoce quien abre el detalle). */
  phaseName?: string;
}

/**
 * Detalle de una tarea: estado, predecesoras con su bloqueo, formulario de
 * estado y evidencia. Se usa como página (/seguimiento/tareas) y como panel
 * lateral desde Planificación.
 */
export function TaskDetail({
  taskId,
  embedded = false,
  breadcrumbs,
  onSelectTask,
  onChanged,
  phaseName,
}: TaskDetailProps): React.ReactElement {
  const [task, setTask] = React.useState<Task | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [savingStatus, setSavingStatus] = React.useState(false);
  const { permissions } = useActor();
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [history, setHistory] = React.useState<TaskHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  // Formulario de cambio de estado (reset solo en éxito, AC-031).
  const [nextStatus, setNextStatus] = React.useState<string>('');
  const [progress, setProgress] = React.useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = React.useState<string>('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const statusRef = React.useRef<HTMLButtonElement>(null);
  const progressRef = React.useRef<HTMLInputElement>(null);
  const formId = embedded ? 'task-status-form-panel' : 'task-status-form';

  const loadHistory = React.useCallback((id: string) => {
    return getTaskHistory(id)
      .then((entries) => {
        setHistory(entries);
        setHistoryError(null);
      })
      .catch((err: unknown) => {
        setHistoryError(messageOf(err));
      });
  }, []);

  // Personas en alcance, solo para mostrar el nombre del responsable.
  React.useEffect(() => {
    let active = true;
    void listCoordinationPeople()
      .then((data) => {
        if (active) setPeople(data);
      })
      .catch(() => {
        if (active) setPeople([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const fetchTask = React.useCallback((id: string) => {
    return getTask(id)
      .then((data) => {
        setTask(data);
        setProgress(String(data.progress));
        setEvidenceUrl(data.evidenceUrl ?? '');
        setNextStatus('');
        setFieldErrors({});
        setFormError(null);
        setState('success');
      })
      .catch(() => {
        setState('error');
      });
  }, []);
  const load = React.useCallback((id: string) => {
    setState('loading');
    return fetchTask(id);
  }, [fetchTask]);

  // Al cambiar de tarea se vuelve a mostrar la carga.
  useResetOnChange([taskId], () => {
    setState('loading');
    setHistory(null);
    setHistoryError(null);
  });
  React.useEffect(() => {
    void fetchTask(taskId);
    void loadHistory(taskId);
  }, [taskId, fetchTask, loadHistory]);

  function clearFieldError(key: FieldKey): void {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  async function handleStatusChange(event: React.FormEvent) {
    event.preventDefault();
    if (!task || savingStatus) return;
    const errors: FieldErrors = {};
    if (!nextStatus) errors.nextStatus = 'Elige el nuevo estado.';
    const progressNum = progress.trim() === '' ? undefined : Number(progress);
    if (
      progressNum !== undefined &&
      (Number.isNaN(progressNum) || progressNum < 0 || progressNum > 100)
    ) {
      errors.progress = 'El progreso debe estar entre 0 y 100.';
    }
    setFieldErrors(errors);
    if (errors.nextStatus || errors.progress) {
      if (errors.nextStatus) statusRef.current?.focus();
      else progressRef.current?.focus();
      return;
    }
    setFormError(null);
    setSavingStatus(true);
    try {
      const updated = await updateTaskStatus(task.id, {
        status: nextStatus as TaskStatus,
        progress: progressNum,
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      setTask(updated);
      setProgress(String(updated.progress));
      setEvidenceUrl(updated.evidenceUrl ?? '');
      setNextStatus('');
      toast.success('Estado de la tarea actualizado.');
      onChanged?.(updated);
      void loadHistory(updated.id);
    } catch (err) {
      // 409 al pasar a En curso: una predecesora bloquea (AC-010). Se conservan
      // los valores del formulario.
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSavingStatus(false);
    }
  }

  const wrap = (header: React.ReactNode, body: React.ReactNode): React.ReactElement =>
    embedded ? (
      <div className="flex flex-col gap-4">
        {header}
        {body}
      </div>
    ) : (
      <PageLayout>
        {header}
        {body}
      </PageLayout>
    );

  if (state === 'loading') {
    return wrap(
      embedded ? null : <PageHeader title="Tarea" breadcrumbs={breadcrumbs} />,
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>,
    );
  }

  if (state === 'error' || !task) {
    return wrap(
      embedded ? null : <PageHeader title="Tarea" breadcrumbs={breadcrumbs} />,
      <div className="rounded-lg border bg-card">
        <ErrorState title="No fue posible cargar la tarea." onRetry={() => void load(taskId)} />
      </div>,
    );
  }

  const blocking = task.predecessors.some((p) => p.status !== 'TERMINADA');
  const pendingPredecessors = task.predecessors.filter((p) => p.status !== 'TERMINADA').length;
  const transitions = nextTaskStatuses(task.status as TaskStatus);
  const noTransitions = transitions.length === 0;
  const statusLabel = taskStatusLabel(task.status);
  const due = taskDueInfo(task, localDateInputValue());
  const dueText = dueLabel(due);
  const responsibleName = task.responsibleUserId
    ? (people.find((p) => p.id === task.responsibleUserId)?.name ?? 'Responsable asignado')
    : null;
  const isManager = (permissions?.grants ?? []).some(
    (g) => g.roleCode === 'JEFE_AREA' || g.roleCode === 'LIDER_PROCESO',
  );
  const canChangeProgress = isManager || task.responsibleUserId === permissions?.userId;

  async function handleProgressSave(next: number): Promise<string | null> {
    if (!task) return 'La tarea no está disponible.';
    try {
      const updated = await updateTaskProgress(task.id, next);
      setTask(updated);
      setProgress(String(updated.progress));
      toast.success(`Avance actualizado a ${formatPercent(updated.progress)}.`);
      onChanged?.(updated);
      void loadHistory(task.id);
      return null;
    } catch (err) {
      return messageOf(err);
    }
  }

  /** Cabecera: lo primero que se ve es el estado, el avance, quién, dónde y cuándo. */
  const summary = (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="task" value={task.status} className="h-7 px-3 text-sm" />
        {task.isMilestone ? <Badge variant="outline">Hito</Badge> : null}
        {dueText ? (
          <Badge variant={due.kind === 'overdue' ? 'danger' : 'warning'}>
            {due.kind === 'overdue' ? <AlarmClock aria-hidden="true" /> : <Clock aria-hidden="true" />}
            {dueText}
          </Badge>
        ) : null}
        {pendingPredecessors > 0 ? (
          <Badge variant="warning">
            <Link2 aria-hidden="true" />
            {pendingPredecessors === 1
              ? '1 predecesora pendiente'
              : `${pendingPredecessors} predecesoras pendientes`}
          </Badge>
        ) : null}
        {task.accepted ? (
          <Badge variant="success">
            <CircleCheck aria-hidden="true" />
            Aceptada
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <span className="text-meta text-muted-foreground">Avance</span>
        <TaskProgressControl
          wide
          value={task.progress}
          status={task.status}
          taskTitle={task.title}
          tone={progressTone(task.status, due.kind === 'overdue')}
          disabled={!canChangeProgress || permissions === null}
          disabledReason={
            !canChangeProgress ? 'Solo puedes cambiar el avance de tus propias tareas.' : undefined
          }
          onSave={handleProgressSave}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-meta text-muted-foreground">Responsable</dt>
          <dd className={cn('text-sm font-medium wrap-break-word', !responsibleName && 'text-warning')}>
            {responsibleName ?? 'Sin asignar'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-meta text-muted-foreground">Fase</dt>
          <dd className="text-sm font-medium wrap-break-word">{phaseName ?? '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-meta text-muted-foreground">Inicio</dt>
          <dd className="text-sm font-medium tabular-nums">
            {task.startDate ? formatDateOnly(task.startDate) : 'Sin fecha'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-meta text-muted-foreground">Vencimiento</dt>
          <dd className="text-sm font-medium tabular-nums">
            {task.endDate ? formatDateOnly(task.endDate) : 'Sin fecha'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-meta text-muted-foreground">Esfuerzo</dt>
          <dd className="text-sm font-medium tabular-nums">
            {task.isMilestone || task.estimateHours === null ? '—' : formatHours(task.estimateHours)}
          </dd>
        </div>
      </dl>
    </div>
  );

  const header = embedded ? null : <PageHeader title={task.title} breadcrumbs={breadcrumbs} />;

  function predecessorLink(id: string, title: string): React.ReactElement {
    const className =
      'min-w-0 rounded-sm text-left text-sm font-medium wrap-break-word underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
    return embedded && onSelectTask ? (
      <button type="button" className={className} onClick={() => onSelectTask(id)}>
        {title}
      </button>
    ) : (
      <Link href={taskHref(id)} className={className}>
        {title}
      </Link>
    );
  }

  const resumen = (
    <div className="flex min-w-0 flex-col gap-6">
      <Section title="Descripción">
        <p className="text-sm whitespace-pre-wrap wrap-break-word text-muted-foreground">
          {task.description || 'Sin descripción.'}
        </p>
      </Section>

      <Section title="Criterios de aceptación">
        <p className="text-sm whitespace-pre-wrap wrap-break-word text-muted-foreground">
          {task.acceptanceCriteria || 'Sin criterios de aceptación.'}
        </p>
      </Section>

      {task.predecessors.length > 0 ? (
        <Section title="Predecesoras" count={task.predecessors.length}>
          {blocking ? (
            <RequirementsPanel
              id={embedded ? 'task-predecessors-panel' : 'task-predecessors'}
              headingLevel={3}
              title="Esta tarea no puede pasar a En curso todavía"
              description="Cada predecesora debe estar terminada."
              items={task.predecessors.map((p) => ({
                id: p.id,
                label: p.title,
                status: p.status === 'TERMINADA' ? 'met' : 'pending',
                detail: taskStatusLabel(p.status),
                action:
                  embedded && onSelectTask
                    ? { label: 'Abrir', onClick: () => onSelectTask(p.id) }
                    : { label: 'Abrir', href: taskHref(p.id) },
              }))}
            />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {task.predecessors.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  {predecessorLink(p.id, p.title)}
                  <span className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
                    <StatusBadge kind="task" value={p.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <Section title="Cambiar estado o registrar evidencia">
        <form
          id={formId}
          noValidate
          onSubmit={(event) => void handleStatusChange(event)}
          className="flex max-w-[45rem] flex-col gap-4 rounded-lg border bg-card p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${formId}-next`}
              label="Nuevo estado"
              error={fieldErrors.nextStatus}
              help={`Ahora: ${statusLabel}.`}
            >
              {(control) => (
                <Select
                  value={nextStatus}
                  onValueChange={(value) => {
                    setNextStatus(value);
                    clearFieldError('nextStatus');
                  }}
                >
                  <SelectTrigger ref={statusRef} {...control}>
                    <SelectValue placeholder="Elige el estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {noTransitions ? (
                      <SelectItem value="__none" disabled>
                        Sin transiciones disponibles
                      </SelectItem>
                    ) : (
                      transitions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {taskStatusLabel(s)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field id={`${formId}-progress`} label="Progreso (0–100)" error={fieldErrors.progress}>
              <Input
                ref={progressRef}
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={progress}
                onChange={(e) => {
                  setProgress(e.target.value);
                  clearFieldError('progress');
                }}
              />
            </Field>
          </div>
          <Field id={`${formId}-evidence`} label="Evidencia (URL o texto)">
            <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
          </Field>

          <FormError id={formId} message={formError} />

          <div className="flex flex-col items-start gap-1 border-t pt-4">
            <Button
              type="submit"
              unavailable={noTransitions}
              loading={!noTransitions && savingStatus}
              disabled={!noTransitions && savingStatus}
              aria-describedby={noTransitions ? NO_TRANSITIONS_REASON_ID : undefined}
            >
              {savingStatus ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            {noTransitions ? (
              <DisabledReason id={NO_TRANSITIONS_REASON_ID}>
                {`No hay transiciones disponibles desde «${statusLabel}».`}
              </DisabledReason>
            ) : null}
          </div>
        </form>
      </Section>
    </div>
  );

  const evidence = (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-sm">
      <TaskEvidenceFiles taskId={task.id} />
      {task.evidenceUrl ? (
        isWebUrl(task.evidenceUrl) ? (
          <a
            href={task.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-start gap-1 rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="break-all">{task.evidenceUrl}</span>
            <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
        ) : (
          <p className="break-all text-muted-foreground">{task.evidenceUrl}</p>
        )
      ) : (
        <p className="text-muted-foreground">Sin evidencia registrada.</p>
      )}
    </div>
  );

  const historyCount =
    history === null ? null : history.filter((e) => e.action !== 'UPDATE' || e.changes.length > 0).length;

  const tabs = (
    <Tabs defaultValue="resumen" className="flex min-w-0 flex-col gap-4">
      <TabsList className="overflow-x-auto">
        <TabsTrigger value="resumen">Resumen</TabsTrigger>
        <TabsTrigger value="historial">
          {historyCount === null ? 'Historial' : `Historial (${historyCount})`}
        </TabsTrigger>
        <TabsTrigger value="evidencia">Evidencia</TabsTrigger>
      </TabsList>
      <TabsContent value="resumen">{resumen}</TabsContent>
      <TabsContent value="historial">
        <TaskHistory
          entries={history}
          error={historyError}
          onRetry={() => void loadHistory(task.id)}
        />
      </TabsContent>
      <TabsContent value="evidencia">{evidence}</TabsContent>
    </Tabs>
  );

  return wrap(
    header,
    <div className="flex min-w-0 flex-col gap-4">
      {summary}
      {tabs}
    </div>,
  );
}
