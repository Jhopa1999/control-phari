'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
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
import type { Task, TaskStatus } from '@/lib/api-client';
import { formatPercent } from '@/lib/format';
import { PlanError } from '@/lib/plan';
import { getTask, taskStatusLabel, updateTaskStatus } from '@/lib/tasks';
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
}: TaskDetailProps): React.ReactElement {
  const [task, setTask] = React.useState<Task | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [savingStatus, setSavingStatus] = React.useState(false);

  // Formulario de cambio de estado (reset solo en éxito, AC-031).
  const [nextStatus, setNextStatus] = React.useState<string>('');
  const [progress, setProgress] = React.useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = React.useState<string>('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const statusRef = React.useRef<HTMLButtonElement>(null);
  const progressRef = React.useRef<HTMLInputElement>(null);
  const formId = embedded ? 'task-status-form-panel' : 'task-status-form';

  const load = React.useCallback(async (id: string) => {
    setState('loading');
    try {
      const data = await getTask(id);
      setTask(data);
      setProgress(String(data.progress));
      setEvidenceUrl(data.evidenceUrl ?? '');
      setNextStatus('');
      setFieldErrors({});
      setFormError(null);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load(taskId);
  }, [taskId, load]);

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
  const transitions = nextTaskStatuses(task.status as TaskStatus);
  const noTransitions = transitions.length === 0;
  const statusLabel = taskStatusLabel(task.status);

  const badges = (
    <>
      <StatusBadge kind="task" value={task.status} />
      <span className="text-meta tabular-nums text-muted-foreground">
        <span className="sr-only">avance </span>
        {formatPercent(task.progress)}
      </span>
      {task.isMilestone ? <Badge variant="outline">Hito</Badge> : null}
    </>
  );

  const header = embedded ? (
    <div className="flex flex-wrap items-center gap-2 pr-10">{badges}</div>
  ) : (
    <PageHeader title={task.title} breadcrumbs={breadcrumbs} meta={badges} />
  );

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

  const main = (
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

      <Section title="Actualizar estado">
        <form
          id={formId}
          noValidate
          onSubmit={(event) => void handleStatusChange(event)}
          className="flex max-w-[45rem] flex-col gap-4 rounded-lg border bg-card p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${formId}-next`} label="Nuevo estado" error={fieldErrors.nextStatus}>
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
    <Section title="Evidencia">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-sm">
        <TaskEvidenceFiles taskId={task.id} />
        {task.evidenceUrl ? (
          isWebUrl(task.evidenceUrl) ? (
            <a
              href={task.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-start gap-1 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
    </Section>
  );

  if (embedded) {
    return wrap(
      header,
      <>
        {evidence}
        {main}
      </>,
    );
  }

  return wrap(
    header,
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {main}
      <aside aria-label="Evidencia" className="flex min-w-0 flex-col gap-6">
        {evidence}
      </aside>
    </div>,
  );
}
