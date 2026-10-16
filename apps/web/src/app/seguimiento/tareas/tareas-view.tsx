'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { DisabledReason } from '@/components/disabled-reason';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Field, FormError } from '@/components/field';
import { PageHeader, type Crumb } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RequirementsPanel } from '@/components/requirements-panel';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { useActor } from '@/lib/actor-context';
import { formatPercent } from '@/lib/format';
import { PlanError } from '@/lib/plan';
import {
  acceptTask,
  getTask,
  taskStatusLabel,
  updateTaskStatus,
} from '@/lib/tasks';
import { nextTaskStatuses } from '@/lib/task-transitions';

type LoadState = 'loading' | 'success' | 'error' | 'empty';
type FieldKey = 'nextStatus' | 'progress';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `task-status-form-error`. */
const FORM_ID = 'task-status-form';
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

function taskHref(id: string): string {
  return `/seguimiento/tareas?taskId=${encodeURIComponent(id)}`;
}

/**
 * Detalle de una tarea (design §11.10, patrón D): migas, estado en la
 * cabecera, predecesoras con su bloqueo, formulario de estado y, en el
 * lateral, la evidencia y la aceptación (solo con el módulo plan).
 */
export function TareasView(): React.ReactElement {
  const searchParams = useSearchParams();
  const taskIdParam = searchParams.get('taskId');
  const { allowedModules } = useActor();
  const canManage = allowedModules.has('plan');

  const [task, setTask] = React.useState<Task | null>(null);
  const [state, setState] = React.useState<LoadState>(taskIdParam ? 'loading' : 'empty');
  const [busy, setBusy] = React.useState(false);
  const [savingStatus, setSavingStatus] = React.useState(false);

  // Formulario de cambio de estado (reset solo en éxito, AC-031).
  const [nextStatus, setNextStatus] = React.useState<string>('');
  const [progress, setProgress] = React.useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = React.useState<string>('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const statusRef = React.useRef<HTMLButtonElement>(null);
  const progressRef = React.useRef<HTMLInputElement>(null);

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
    if (!taskIdParam) {
      setState('empty');
      setTask(null);
      return;
    }
    void load(taskIdParam);
  }, [taskIdParam, load]);

  function clearFieldError(key: FieldKey): void {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  async function handleStatusChange(event: React.FormEvent) {
    event.preventDefault();
    if (!task || savingStatus) return;
    // Las reglas de siempre, evaluadas todas a la vez (design §9).
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
    setBusy(true);
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
    } catch (err) {
      // 409 al pasar a En curso: una predecesora bloquea (AC-010). Se conservan
      // los valores del formulario.
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSavingStatus(false);
      setBusy(false);
    }
  }

  async function handleAccept(accepted: boolean) {
    if (!task) return;
    setBusy(true);
    try {
      const updated = await acceptTask(task.id, { accepted });
      setTask(updated);
      toast.success(accepted ? 'Tarea aceptada.' : 'Aceptación retirada.');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const breadcrumbs: Crumb[] | undefined = allowedModules.has('assigned')
    ? [{ label: 'Mi trabajo', href: '/mi-trabajo' }]
    : undefined;

  if (state === 'empty') {
    return (
      <PageLayout>
        <PageHeader title="Detalle de tarea" breadcrumbs={breadcrumbs} />
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={ListChecks}
            title="Elige una tarea para ver su detalle."
            description="Abre una tarea desde Mi trabajo o desde la lista de tareas de un plan."
            action={
              allowedModules.has('assigned') ? (
                <Link href="/mi-trabajo" className={buttonVariants({ variant: 'outline' })}>
                  Ir a Mi trabajo
                </Link>
              ) : undefined
            }
            secondaryAction={
              allowedModules.has('plan') ? (
                <Link href="/seguimiento/plan" className={buttonVariants({ variant: 'outline' })}>
                  Ir a Planificación
                </Link>
              ) : undefined
            }
          />
        </div>
      </PageLayout>
    );
  }

  if (state === 'loading') {
    return (
      <PageLayout>
        <PageHeader title="Tarea" breadcrumbs={breadcrumbs} />
        <div aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="flex flex-col gap-6">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </PageLayout>
    );
  }

  if (state === 'error' || !task) {
    return (
      <PageLayout>
        <PageHeader title="Tarea" breadcrumbs={breadcrumbs} />
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar la tarea."
            onRetry={taskIdParam ? () => void load(taskIdParam) : undefined}
          />
        </div>
      </PageLayout>
    );
  }

  const blocking = task.predecessors.some((p) => p.status !== 'TERMINADA' || !p.accepted);
  const transitions = nextTaskStatuses(task.status as TaskStatus);
  const noTransitions = transitions.length === 0;
  const statusLabel = taskStatusLabel(task.status);

  return (
    <PageLayout>
      <PageHeader
        title={task.title}
        breadcrumbs={breadcrumbs}
        meta={
          <>
            <StatusBadge kind="task" value={task.status} />
            <span className="text-meta tabular-nums text-muted-foreground">
              <span className="sr-only">avance </span>
              {formatPercent(task.progress)}
            </span>
            {task.isMilestone ? <Badge variant="outline">Hito</Badge> : null}
            {task.accepted ? (
              <Badge variant="success">Aceptada</Badge>
            ) : (
              <Badge variant="neutral">Sin aceptar</Badge>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
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
                  id="task-predecessors"
                  headingLevel={3}
                  title="Esta tarea no puede pasar a En curso todavía"
                  description="Cada predecesora debe estar terminada y aceptada."
                  items={task.predecessors.map((p) => ({
                    id: p.id,
                    label: p.title,
                    status: p.status === 'TERMINADA' && p.accepted ? 'met' : 'pending',
                    detail: `${taskStatusLabel(p.status)} · ${p.accepted ? 'aceptada' : 'sin aceptar'}`,
                    action: { label: 'Abrir', href: taskHref(p.id) },
                  }))}
                />
              ) : (
                <ul className="divide-y rounded-lg border bg-card">
                  {task.predecessors.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <Link
                        href={taskHref(p.id)}
                        className="min-w-0 rounded-sm text-sm font-medium wrap-break-word underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {p.title}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
                        <StatusBadge kind="task" value={p.status} />
                        {p.accepted ? 'aceptada' : 'sin aceptar'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}

          <Section title="Actualizar estado">
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void handleStatusChange(event)}
              className="flex max-w-[45rem] flex-col gap-4 rounded-lg border bg-card p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="task-next-status" label="Nuevo estado" error={fieldErrors.nextStatus}>
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
                <Field id="task-progress" label="Progreso (0–100)" error={fieldErrors.progress}>
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
              <Field id="task-evidence" label="Evidencia (URL o texto)">
                <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
              </Field>

              <FormError id={FORM_ID} message={formError} />

              <div className="flex flex-col items-start gap-1 border-t pt-4">
                <Button
                  type="submit"
                  unavailable={noTransitions}
                  loading={!noTransitions && savingStatus}
                  disabled={!noTransitions && busy}
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

        <aside aria-label="Evidencia y aceptación" className="flex min-w-0 flex-col gap-6">
          <Section title="Evidencia">
            <div className="rounded-lg border bg-card p-4 text-sm">
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

          {canManage ? (
            <Section title="Aceptación">
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                <p className="text-meta text-muted-foreground">
                  Aceptar requiere que la tarea esté Terminada. La aceptación habilita a sus tareas
                  dependientes.
                </p>
                <div>
                  {task.accepted ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleAccept(false)}
                    >
                      Retirar aceptación
                    </Button>
                  ) : (
                    <Button type="button" disabled={busy} onClick={() => void handleAccept(true)}>
                      Aceptar tarea
                    </Button>
                  )}
                </div>
              </div>
            </Section>
          ) : null}
        </aside>
      </div>
    </PageLayout>
  );
}
