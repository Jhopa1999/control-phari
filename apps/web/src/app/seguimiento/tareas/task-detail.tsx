'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import Link from 'next/link';
import { AlarmClock, CircleCheck, Clock, ExternalLink, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { BlockedReasonBox } from '@/components/blocked-reason';
import { DisabledReason } from '@/components/disabled-reason';
import { ErrorState } from '@/components/error-state';
import { Field, FormError } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader, type Crumb } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RequirementsPanel } from '@/components/requirements-panel';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { listTaskEvidence } from '@/lib/task-evidence';
import { nextStepFor, transitionVerb } from '@/lib/task-next-step';
import {
  getTask,
  getTaskHistory,
  taskStatusLabel,
  updateTaskProgress,
  updateTaskStatus,
} from '@/lib/tasks';
import { BlockReasonDialog } from '../plan/block-reason-dialog';
import { TaskProgressControl } from '../plan/task-progress-control';
import { TaskHistory } from './task-history';
import { TaskEvidenceFiles } from './task-evidence-files';
import { nextTaskStatuses } from '@/lib/task-transitions';

type LoadState = 'loading' | 'success' | 'error';
type FieldKey = 'nextStatus';
type FieldErrors = Partial<Record<FieldKey, string>>;

const NO_TRANSITIONS_REASON_ID = 'task-status-reason';

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

/** Estado preseleccionado: el siguiente paso natural; en TERMINADA, reabrir. */
function defaultNextStatus(status: string): string {
  const step = nextStepFor(status);
  if (step) return step.to;
  return nextTaskStatuses(status as TaskStatus)[0] ?? '';
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
  /**
   * Motivo por el que no se puede cambiar el estado ni el avance (p. ej. proyecto
   * cerrado). Lo conoce quien abre el detalle; si falta, manda el servidor (409).
   */
  readOnlyReason?: string;
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
  readOnlyReason,
}: TaskDetailProps): React.ReactElement {
  const [task, setTask] = React.useState<Task | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [savingStatus, setSavingStatus] = React.useState(false);
  const { permissions, allowedModules } = useActor();
  const canOpenRequest = allowedModules.has('requests');
  const [blockOpen, setBlockOpen] = React.useState(false);
  // Número de archivos de evidencia (null = aún no se sabe: no se acusa de lo que no se sabe).
  const [fileCount, setFileCount] = React.useState<{ taskId: string; count: number } | null>(null);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [history, setHistory] = React.useState<TaskHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  // Formulario de cambio de estado (reset solo en éxito, AC-031).
  const [nextStatus, setNextStatus] = React.useState<string>('');
  const [registerFull, setRegisterFull] = React.useState(true);
  const [evidenceUrl, setEvidenceUrl] = React.useState<string>('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const statusRef = React.useRef<HTMLButtonElement>(null);
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
        setEvidenceUrl(data.evidenceUrl ?? '');
        setNextStatus('');
        setRegisterFull(true);
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

  // Cuántos archivos de evidencia hay, para el aviso de «sin evidencia».
  React.useEffect(() => {
    let active = true;
    void listTaskEvidence(taskId)
      .then((list) => {
        if (active) setFileCount({ taskId, count: list.length });
      })
      .catch(() => {
        // Si la consulta falla no se avisa: no se inventa.
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  function clearFieldError(key: FieldKey): void {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function afterStatusUpdate(updated: Task): void {
    setTask(updated);
    setEvidenceUrl(updated.evidenceUrl ?? '');
    setNextStatus('');
    setRegisterFull(true);
    toast.success('Estado de la tarea actualizado.');
    onChanged?.(updated);
    void loadHistory(updated.id);
  }

  /** Confirma el diálogo de motivo: devuelve el error del servidor o null si salió bien. */
  async function confirmBlock(reason: string): Promise<string | null> {
    if (!task) return 'La tarea no está disponible.';
    try {
      const updated = await updateTaskStatus(task.id, {
        status: 'BLOQUEADA',
        blockedReason: reason,
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      afterStatusUpdate(updated);
      return null;
    } catch (err) {
      return messageOf(err);
    }
  }

  async function handleStatusChange(event: React.FormEvent) {
    event.preventDefault();
    if (!task || savingStatus) return;
    const chosen = nextStatus || defaultNextStatus(task.status);
    const errors: FieldErrors = {};
    if (!chosen) errors.nextStatus = 'Elige el nuevo estado.';
    setFieldErrors(errors);
    if (errors.nextStatus) {
      statusRef.current?.focus();
      return;
    }
    setFormError(null);
    // Bloquear pide antes el motivo (obligatorio en la interfaz).
    if (chosen === 'BLOQUEADA') {
      setBlockOpen(true);
      return;
    }
    setSavingStatus(true);
    try {
      const updated = await updateTaskStatus(task.id, {
        status: chosen as TaskStatus,
        // Propuesta de 100 % al terminar (desmarcable); el avance no se edita aquí.
        progress: chosen === 'TERMINADA' && task.progress < 100 && registerFull ? 100 : undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      afterStatusUpdate(updated);
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

  // Fase y solicitud vienen en la propia tarea (GET /tasks/:id).
  const { phaseName, requestId, requestTitle } = task;
  const chosenStatus = nextStatus || defaultNextStatus(task.status);
  const knownFileCount = fileCount && fileCount.taskId === task.id ? fileCount.count : null;
  const evidenceCount =
    knownFileCount === null ? null : knownFileCount + (task.evidenceUrl?.trim() ? 1 : 0);
  const blocking = task.predecessors.some((p) => p.status !== 'TERMINADA');
  const pendingPredecessors = task.predecessors.filter((p) => p.status !== 'TERMINADA').length;
  const transitions = nextTaskStatuses(task.status as TaskStatus);
  const noTransitions = transitions.length === 0;
  const statusLocked = noTransitions || readOnlyReason !== undefined;
  const lockedReasonText = readOnlyReason ?? `No hay transiciones disponibles desde «${taskStatusLabel(task.status)}».`;
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

      {task.status === 'BLOQUEADA' ? (
        <BlockedReasonBox reason={task.blockedReason} label="Motivo del bloqueo" clamp={false} />
      ) : null}

      <div className="grid gap-1.5">
        <span className="text-meta text-muted-foreground">Avance</span>
        <TaskProgressControl
          wide
          value={task.progress}
          status={task.status}
          taskTitle={task.title}
          tone={progressTone(task.status, due.kind === 'overdue')}
          disabled={!canChangeProgress || permissions === null || readOnlyReason !== undefined}
          disabledReason={
            readOnlyReason ??
            (!canChangeProgress ? 'Solo puedes cambiar el avance de tus propias tareas.' : undefined)
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
        {phaseName ? (
          <div className="min-w-0">
            <dt className="text-meta text-muted-foreground">Fase</dt>
            <dd className="text-sm font-medium wrap-break-word">{phaseName}</dd>
          </div>
        ) : null}
        {requestTitle ? (
          <div className="min-w-0">
            <dt className="text-meta text-muted-foreground">Solicitud</dt>
            <dd className="text-sm font-medium wrap-break-word">
              {canOpenRequest && requestId ? (
                <Link
                  href={`/demanda/solicitudes/${encodeURIComponent(requestId)}`}
                  className="rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {requestTitle}
                </Link>
              ) : (
                requestTitle
              )}
            </dd>
          </div>
        ) : null}
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
    </div>
  );

  const evidenceWarning =
    (chosenStatus === 'EN_REVISION' || chosenStatus === 'TERMINADA') &&
    knownFileCount === 0 &&
    evidenceUrl.trim() === ''
      ? 'Esta tarea no tiene evidencia (ni nota ni archivos). Puedes añadirla ahora o después.'
      : null;
  const progressWarning =
    chosenStatus === 'TERMINADA' && task.progress < 100
      ? `El avance es ${formatPercent(task.progress)}. Se propone registrar 100 % al terminarla.`
      : chosenStatus === 'EN_REVISION' && task.progress < 100
        ? `El avance es ${formatPercent(task.progress)}.`
        : null;
  const waitingNote =
    chosenStatus === 'EN_CURSO' && (task.status === 'POR_HACER' || task.status === 'BLOQUEADA')
      ? task.predecessors.find((p) => p.status !== 'TERMINADA')
      : undefined;
  const submitLabel = chosenStatus ? transitionVerb(task.status, chosenStatus) : 'Guardar';

  /** Acción principal: va encima de las pestañas para quedar en la primera pantalla. */
  const statusCard = (
    <form
      id={formId}
      noValidate
      aria-label="Actualizar estado"
      onSubmit={(event) => void handleStatusChange(event)}
      className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-card"
    >
      <h3 className="font-heading text-base font-semibold">Actualizar estado</h3>
      <Field
        id={`${formId}-next`}
        label="Siguiente paso"
        error={fieldErrors.nextStatus}
        help={`Ahora: ${statusLabel}.`}
      >
        {(control) => (
          <Select
            value={chosenStatus}
            onValueChange={(value) => {
              setNextStatus(value);
              clearFieldError('nextStatus');
            }}
          >
            <SelectTrigger ref={statusRef} {...control} className="w-full max-lg:min-h-11">
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
                    {transitionVerb(task.status, s)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
      </Field>

      {chosenStatus === 'TERMINADA' && task.progress < 100 ? (
        <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm max-lg:min-h-11">
          <Checkbox checked={registerFull} onChange={(e) => setRegisterFull(e.target.checked)} />
          Registrar avance en 100 %
        </label>
      ) : null}

      <Field
        id={`${formId}-evidence`}
        label="Nota o enlace de evidencia (opcional)"
        help="Se guarda junto con el cambio de estado."
      >
        <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
      </Field>

      {evidenceWarning || progressWarning || waitingNote ? (
        <div className="flex flex-col gap-2">
          {waitingNote ? (
            <InlineNotice tone="warning" role="status">
              {`Aún espera a «${waitingNote.title}». Si no está terminada, el servidor no te dejará empezar.`}
            </InlineNotice>
          ) : null}
          {evidenceWarning ? (
            <InlineNotice tone="warning" role="status">
              {evidenceWarning}
            </InlineNotice>
          ) : null}
          {progressWarning ? (
            <InlineNotice tone="warning" role="status">
              {progressWarning}
            </InlineNotice>
          ) : null}
        </div>
      ) : null}

      <FormError id={formId} message={formError} />

      <div className="flex flex-col items-stretch gap-1 sm:items-start">
        <Button
          type="submit"
          className="max-sm:w-full max-lg:min-h-11"
          unavailable={statusLocked}
          loading={!statusLocked && savingStatus}
          disabled={!statusLocked && savingStatus}
          aria-describedby={statusLocked ? NO_TRANSITIONS_REASON_ID : undefined}
        >
          {savingStatus ? 'Guardando…' : submitLabel}
        </Button>
        {statusLocked ? (
          <DisabledReason id={NO_TRANSITIONS_REASON_ID}>{lockedReasonText}</DisabledReason>
        ) : null}
      </div>
    </form>
  );

  const evidence = (
    <div className="flex flex-col gap-6 rounded-lg border bg-card p-4 text-sm">
      <section aria-labelledby={`${formId}-ev-note`} className="flex flex-col gap-2">
        <h3 id={`${formId}-ev-note`} className="font-heading text-base font-semibold">
          Nota o enlace
        </h3>
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
          <p className="text-muted-foreground">Sin nota ni enlace.</p>
        )}
      </section>
      <section aria-labelledby={`${formId}-ev-files`} className="flex flex-col gap-2">
        <h3 id={`${formId}-ev-files`} className="font-heading text-base font-semibold">
          Archivos adjuntos
        </h3>
        <TaskEvidenceFiles
          taskId={task.id}
          onCountChange={(count) => setFileCount({ taskId: task.id, count })}
        />
      </section>
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
        <TabsTrigger value="evidencia">
          {evidenceCount === null ? 'Evidencia' : `Evidencia (${evidenceCount})`}
        </TabsTrigger>
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
      {statusCard}
      {tabs}
      <BlockReasonDialog
        open={blockOpen}
        taskTitle={task.title}
        onOpenChange={setBlockOpen}
        onConfirm={confirmBlock}
      />
    </div>,
  );
}
