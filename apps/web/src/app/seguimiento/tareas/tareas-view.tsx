'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { PlanError } from '@/lib/plan';
import {
  acceptTask,
  getTask,
  taskStatusLabel,
  updateTaskStatus,
} from '@/lib/tasks';

type LoadState = 'loading' | 'success' | 'error' | 'empty';

/** Transiciones permitidas (espejo de design 1.3). Solo guia la UI; el control
 * real es server-side (el backend rechaza una transicion no permitida con 409). */
const ALLOWED_TRANSITIONS: Record<string, TaskStatus[]> = {
  POR_HACER: ['EN_CURSO', 'BLOQUEADA'],
  EN_CURSO: ['POR_HACER', 'BLOQUEADA', 'EN_REVISION'],
  BLOQUEADA: ['POR_HACER', 'EN_CURSO'],
  EN_REVISION: ['EN_CURSO', 'BLOQUEADA', 'TERMINADA'],
  TERMINADA: ['EN_CURSO'],
};

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrio un error inesperado.';
}

export function TareasView(): React.ReactElement {
  const searchParams = useSearchParams();
  const taskIdParam = searchParams.get('taskId');
  const { permissions } = useActor();

  const canManage = React.useMemo(() => {
    const modules = new Set(permissions?.allowedModules ?? []);
    return modules.has('plan');
  }, [permissions]);

  const [task, setTask] = React.useState<Task | null>(null);
  const [state, setState] = React.useState<LoadState>('empty');
  const [busy, setBusy] = React.useState(false);

  // Formulario de cambio de estado (reset solo en exito, AC-031).
  const [nextStatus, setNextStatus] = React.useState<string>('');
  const [progress, setProgress] = React.useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = React.useState<string>('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async (id: string) => {
    setState('loading');
    try {
      const data = await getTask(id);
      setTask(data);
      setProgress(String(data.progress));
      setEvidenceUrl(data.evidenceUrl ?? '');
      setNextStatus('');
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

  async function handleStatusChange(event: React.FormEvent) {
    event.preventDefault();
    if (!task || !nextStatus) {
      setFormError('Elige el nuevo estado.');
      return;
    }
    const progressNum = progress.trim() === '' ? undefined : Number(progress);
    if (
      progressNum !== undefined &&
      (Number.isNaN(progressNum) || progressNum < 0 || progressNum > 100)
    ) {
      setFormError('El progreso debe estar entre 0 y 100.');
      return;
    }
    setFormError(null);
    setBusy(true);
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
      // 409 al pasar a EN_CURSO: una predecesora bloquea (AC-010). Se conservan
      // los valores del formulario y se muestran las predecesoras pendientes.
      setFormError(messageOf(err));
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(accepted: boolean) {
    if (!task) return;
    setBusy(true);
    try {
      const updated = await acceptTask(task.id, { accepted });
      setTask(updated);
      toast.success(accepted ? 'Tarea aceptada.' : 'Aceptacion retirada.');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'empty') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Header />
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Abre una tarea desde la lista del plan para ver su detalle.
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Header />
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (state === 'error' || !task) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Header />
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No fue posible cargar la tarea.
          </p>
          {taskIdParam ? (
            <Button variant="outline" onClick={() => void load(taskIdParam)}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const blockingPredecessors = task.predecessors.filter(
    (p) => p.status !== 'TERMINADA' || !p.accepted,
  );
  const transitions = ALLOWED_TRANSITIONS[task.status] ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Header />

      <section className="flex flex-col gap-2 rounded-lg border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{task.title}</h2>
          <Badge variant="secondary">
            {taskStatusLabel(task.status)} ({task.progress}%)
          </Badge>
        </div>
        {task.isMilestone ? <Badge variant="outline">Hito</Badge> : null}
        {task.description ? (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        ) : null}
        {task.acceptanceCriteria ? (
          <div className="mt-2">
            <span className="text-sm font-medium">Criterios de aceptacion</span>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {task.acceptanceCriteria}
            </p>
          </div>
        ) : null}
        {task.evidenceUrl ? (
          <p className="text-sm">
            Evidencia:{' '}
            <span className="break-all text-muted-foreground">
              {task.evidenceUrl}
            </span>
          </p>
        ) : null}
        <p className="text-sm">
          {task.accepted ? (
            <Badge variant="success">Aceptada</Badge>
          ) : (
            <span className="text-muted-foreground">Sin aceptar</span>
          )}
        </p>
      </section>

      {/* Predecesoras */}
      {task.predecessors.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border bg-card p-6">
          <h3 className="text-lg font-medium">Predecesoras</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {task.predecessors.map((p) => {
              const ok = p.status === 'TERMINADA' && p.accepted;
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <Badge variant={ok ? 'success' : 'secondary'}>
                    {taskStatusLabel(p.status)}
                    {p.accepted ? ' · aceptada' : ''}
                  </Badge>
                  {p.title}
                </li>
              );
            })}
          </ul>
          {blockingPredecessors.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              No puede pasar a En curso hasta que estas predecesoras esten
              terminadas y aceptadas.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Cambio de estado */}
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-6">
        <h3 className="text-lg font-medium">Actualizar estado</h3>
        <form onSubmit={handleStatusChange} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="task-next-status">Nuevo estado</Label>
            <Select value={nextStatus} onValueChange={setNextStatus}>
              <SelectTrigger id="task-next-status" className="max-w-xs">
                <SelectValue placeholder="Selecciona estado" />
              </SelectTrigger>
              <SelectContent>
                {transitions.length === 0 ? (
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
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-progress">Progreso (0-100)</Label>
            <Input
              id="task-progress"
              type="number"
              min={0}
              max={100}
              className="max-w-xs"
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-evidence">Evidencia (URL o texto)</Label>
            <Input
              id="task-evidence"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
            />
          </div>

          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={busy || transitions.length === 0}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </section>

      {/* Aceptacion (solo jefe/lider) */}
      {canManage ? (
        <section className="flex flex-col gap-3 rounded-lg border bg-card p-6">
          <h3 className="text-lg font-medium">Aceptacion</h3>
          <p className="text-sm text-muted-foreground">
            Aceptar requiere que la tarea este Terminada. La aceptacion habilita
            a sus tareas dependientes.
          </p>
          <div className="flex gap-2">
            {task.accepted ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void handleAccept(false)}
              >
                Retirar aceptacion
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void handleAccept(true)}>
                Aceptar tarea
              </Button>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Header(): React.ReactElement {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
      <p className="text-sm text-muted-foreground">
        Detalle de la tarea: estado, progreso, evidencia y aceptacion.
      </p>
    </header>
  );
}
