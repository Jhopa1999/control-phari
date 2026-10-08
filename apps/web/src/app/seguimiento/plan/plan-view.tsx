'use client';

import * as React from 'react';
import Link from 'next/link';
import { Lock, Plus, RefreshCw, Search } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Plan, PlanPhase, Request, Task } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import {
  PlanError,
  createPlan,
  getPlan,
  getPlanGuide,
  planStatusLabel,
  submitPlan,
} from '@/lib/plan';
import { deletePhase, listPhases, reorderPhases } from '@/lib/plan-phases';
import { deleteTask, listPlanTasks, taskStatusLabel } from '@/lib/tasks';
import { listRequests } from '@/lib/requests';
import { requestStateLabel } from '@/lib/request-state';
import type { PlanGuide } from '@/lib/api-client';
import { PhaseDialog } from './phase-dialog';
import { TaskDialog } from './task-dialog';

type LoadState = 'loading' | 'success' | 'error';

/** Estados de Request en los que tiene sentido planificar (design 1.4). */
const PLANNABLE_STATES = ['COMPROMETIDA', 'EN_PLANIFICACION', 'EN_EJECUCION'];

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrio un error inesperado.';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}

export function PlanView(): React.ReactElement {
  const { actorId } = useActor();

  // --- Selector de solicitud ---
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [requestsState, setRequestsState] = React.useState<LoadState>('loading');
  const [selectedRequestId, setSelectedRequestId] = React.useState<string>('');

  // --- Plan y sus datos ---
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [phases, setPhases] = React.useState<PlanPhase[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [guide, setGuide] = React.useState<PlanGuide | null>(null);
  const [planState, setPlanState] = React.useState<LoadState | 'empty'>('empty');
  const [busy, setBusy] = React.useState(false);

  // --- Filtros de la lista de tareas ---
  const [q, setQ] = React.useState('');
  const [mine, setMine] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [phaseFilter, setPhaseFilter] = React.useState<string>('ALL');

  // --- Dialogos ---
  const [phaseDialog, setPhaseDialog] = React.useState<{
    open: boolean;
    phase: PlanPhase | null;
  }>({ open: false, phase: null });
  const [taskDialog, setTaskDialog] = React.useState<{
    open: boolean;
    task: Task | null;
    phaseId: string | null;
  }>({ open: false, task: null, phaseId: null });

  const loadRequests = React.useCallback(async () => {
    setRequestsState('loading');
    try {
      const all = await Promise.all(
        PLANNABLE_STATES.map((state) => listRequests({ state })),
      );
      const flat = all.flat();
      setRequests(flat);
      setRequestsState('success');
    } catch {
      setRequestsState('error');
    }
  }, []);

  React.useEffect(() => {
    void loadRequests();
  }, [loadRequests, actorId]);

  const loadPlan = React.useCallback(async (requestId: string) => {
    if (!requestId) {
      setPlan(null);
      setPlanState('empty');
      return;
    }
    setPlanState('loading');
    try {
      const current = await getPlan(requestId);
      const [phaseList, taskList, guideData] = await Promise.all([
        listPhases(current.id),
        listPlanTasks(current.id),
        getPlanGuide(requestId),
      ]);
      setPlan(current);
      setPhases(phaseList);
      setTasks(taskList);
      setGuide(guideData);
      setPlanState('success');
    } catch (err) {
      if (err instanceof PlanError && err.status === 404) {
        // Aun no hay plan para esta solicitud: ofrecer crearlo.
        setPlan(null);
        setPhases([]);
        setTasks([]);
        setGuide(null);
        setPlanState('empty');
      } else {
        setPlanState('error');
      }
    }
  }, []);

  React.useEffect(() => {
    void loadPlan(selectedRequestId);
  }, [selectedRequestId, loadPlan]);

  const refreshPlanData = React.useCallback(async () => {
    if (!plan || !selectedRequestId) return;
    try {
      const [phaseList, taskList, guideData, current] = await Promise.all([
        listPhases(plan.id),
        listPlanTasks(plan.id),
        getPlanGuide(selectedRequestId),
        getPlan(selectedRequestId),
      ]);
      setPhases(phaseList);
      setTasks(taskList);
      setGuide(guideData);
      setPlan(current);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }, [plan, selectedRequestId]);

  async function handleCreatePlan() {
    if (!selectedRequestId) return;
    setBusy(true);
    try {
      await createPlan(selectedRequestId, {});
      toast.success('Plan creado. La solicitud pasa a En planificacion.');
      await loadPlan(selectedRequestId);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPlan() {
    if (!selectedRequestId) return;
    setBusy(true);
    try {
      await submitPlan(selectedRequestId);
      toast.success('Plan enviado a autorizacion.');
      await refreshPlanData();
    } catch (err) {
      // 409: el backend recomputa la guia; mostrar los pendientes vigentes.
      toast.error(messageOf(err));
      await refreshPlanData();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePhase(phase: PlanPhase) {
    if (!plan) return;
    setBusy(true);
    try {
      await deletePhase(plan.id, phase.id);
      toast.success('Fase eliminada.');
      await refreshPlanData();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleMovePhase(index: number, direction: -1 | 1) {
    if (!plan) return;
    const target = index + direction;
    if (target < 0 || target >= phases.length) return;
    const reordered = [...phases];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setBusy(true);
    try {
      await reorderPhases(plan.id, { phaseIds: reordered.map((p) => p.id) });
      await refreshPlanData();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTask(task: Task) {
    setBusy(true);
    try {
      await deleteTask(task.id);
      toast.success('Tarea eliminada.');
      await refreshPlanData();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const initialPhaseId = React.useMemo(() => {
    if (phases.length === 0) return null;
    return phases.reduce((min, p) => (p.order < min.order ? p : min), phases[0])
      .id;
  }, [phases]);

  const phaseName = React.useCallback(
    (phaseId: string) => phases.find((p) => p.id === phaseId)?.name ?? '-',
    [phases],
  );

  const filteredTasks = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (phaseFilter !== 'ALL' && t.phaseId !== phaseFilter) return false;
      if (mine && t.responsibleUserId !== actorId) return false;
      if (needle && !t.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tasks, statusFilter, phaseFilter, mine, q, actorId]);

  const canEdit = plan?.status === 'BORRADOR' || plan?.status === 'DEVUELTO';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Planificacion</h1>
        <p className="text-sm text-muted-foreground">
          Plan por fases y tareas de una solicitud comprometida. La guia abajo
          indica que falta para enviarlo a autorizacion.
        </p>
      </header>

      {/* Selector de solicitud */}
      <section className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <Label htmlFor="plan-request">Solicitud</Label>
        {requestsState === 'loading' ? (
          <Skeleton className="h-9 w-full max-w-md" />
        ) : requestsState === 'error' ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              No fue posible cargar las solicitudes.
            </p>
            <Button variant="outline" size="sm" onClick={() => void loadRequests()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay solicitudes comprometidas, en planificacion o en ejecucion en
            tu alcance.
          </p>
        ) : (
          <Select
            value={selectedRequestId}
            onValueChange={(v) => setSelectedRequestId(v)}
          >
            <SelectTrigger id="plan-request" className="max-w-md">
              <SelectValue placeholder="Selecciona una solicitud" />
            </SelectTrigger>
            <SelectContent>
              {requests.map((req) => (
                <SelectItem key={req.id} value={req.id}>
                  {req.title} ({requestStateLabel(req.operationalState)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      {selectedRequestId ? (
        <PlanPanel
          planState={planState}
          plan={plan}
          busy={busy}
          onCreatePlan={handleCreatePlan}
          onRetry={() => void loadPlan(selectedRequestId)}
        />
      ) : null}

      {plan && planState === 'success' ? (
        <>
          {/* Guia */}
          {guide ? (
            <PlanGuidePanel
              guide={guide}
              canEdit={canEdit}
              busy={busy}
              onSubmit={handleSubmitPlan}
              phaseName={phaseName}
              tasks={tasks}
            />
          ) : null}

          {/* Fases */}
          <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Fases</h2>
              {canEdit ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => setPhaseDialog({ open: true, phase: null })}
                >
                  <Plus aria-hidden="true" />
                  Nueva fase
                </Button>
              ) : null}
            </div>
            {phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aun no hay fases. Crea la primera para empezar a planificar.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {phases.map((phase, index) => {
                  const isInitial = phase.id === initialPhaseId;
                  const hasTasks = tasks.some((t) => t.phaseId === phase.id);
                  const lockedInitial = isInitial && hasTasks;
                  return (
                    <li
                      key={phase.id}
                      className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-medium">
                          {phase.name}
                          {isInitial ? (
                            <Badge variant="secondary">Fase inicial</Badge>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(phase.startDate)} -{' '}
                          {formatDate(phase.endDate)}
                        </span>
                      </div>
                      {canEdit ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || index === 0 || lockedInitial}
                            onClick={() => void handleMovePhase(index, -1)}
                            aria-label="Subir fase"
                          >
                            ↑
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              busy ||
                              index === phases.length - 1 ||
                              lockedInitial
                            }
                            onClick={() => void handleMovePhase(index, 1)}
                            aria-label="Bajar fase"
                          >
                            ↓
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              setPhaseDialog({ open: true, phase })
                            }
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy || hasTasks}
                            onClick={() => void handleTaskNew(phase.id)}
                          >
                            <Plus aria-hidden="true" />
                            Tarea
                          </Button>
                          {lockedInitial ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock aria-hidden="true" className="size-3" />
                              Fase inicial con tareas: no se mueve ni se borra.
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || hasTasks}
                              onClick={() => void handleDeletePhase(phase)}
                            >
                              Eliminar
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Lista de tareas */}
          <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <h2 className="text-lg font-medium">Tareas</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="task-q">Buscar</Label>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="absolute left-2 top-2.5 size-4 text-muted-foreground"
                  />
                  <Input
                    id="task-q"
                    className="pl-8"
                    placeholder="Titulo de tarea"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="task-status">Estado</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="task-status" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="POR_HACER">Por hacer</SelectItem>
                    <SelectItem value="EN_CURSO">En curso</SelectItem>
                    <SelectItem value="BLOQUEADA">Bloqueada</SelectItem>
                    <SelectItem value="EN_REVISION">En revision</SelectItem>
                    <SelectItem value="TERMINADA">Terminada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="task-phase">Fase</Label>
                <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                  <SelectTrigger id="task-phase" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas</SelectItem>
                    {phases.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={mine} onCheckedChange={setMine} />
                Solo mis tareas
              </label>
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aun no hay tareas. Agrega tareas desde cada fase.
              </p>
            ) : filteredTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ninguna tarea coincide con los filtros.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Fase</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Esfuerzo</TableHead>
                    <TableHead>Predecesoras</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">
                        {task.title}
                        {task.isMilestone ? (
                          <Badge variant="outline" className="ml-2">
                            Hito
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {phaseName(task.phaseId)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(task.startDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(task.endDate)}
                      </TableCell>
                      <TableCell>
                        {task.isMilestone ? '-' : `${task.estimateHours ?? 0} h`}
                      </TableCell>
                      <TableCell>{task.predecessors.length}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {taskStatusLabel(task.status)} ({task.progress}%)
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/seguimiento/tareas?taskId=${task.id}`}>
                              Abrir
                            </Link>
                          </Button>
                          {canEdit ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  setTaskDialog({
                                    open: true,
                                    task,
                                    phaseId: task.phaseId,
                                  })
                                }
                              >
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void handleDeleteTask(task)}
                              >
                                Eliminar
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      ) : null}

      {plan ? (
        <>
          <PhaseDialog
            open={phaseDialog.open}
            phase={phaseDialog.phase}
            planId={plan.id}
            onOpenChange={(open) =>
              setPhaseDialog((prev) => ({ ...prev, open }))
            }
            onSaved={() => {
              setPhaseDialog({ open: false, phase: null });
              void refreshPlanData();
            }}
          />
          <TaskDialog
            open={taskDialog.open}
            task={taskDialog.task}
            phaseId={taskDialog.phaseId}
            allTasks={tasks}
            onOpenChange={(open) =>
              setTaskDialog((prev) => ({ ...prev, open }))
            }
            onSaved={() => {
              setTaskDialog({ open: false, task: null, phaseId: null });
              void refreshPlanData();
            }}
          />
        </>
      ) : null}
    </div>
  );

  function handleTaskNew(phaseId: string) {
    setTaskDialog({ open: true, task: null, phaseId });
  }
}

/** Panel con el estado del plan (loading/error/empty + crear). */
function PlanPanel({
  planState,
  plan,
  busy,
  onCreatePlan,
  onRetry,
}: {
  planState: LoadState | 'empty';
  plan: Plan | null;
  busy: boolean;
  onCreatePlan: () => void;
  onRetry: () => void;
}): React.ReactElement {
  if (planState === 'loading') {
    return (
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }
  if (planState === 'error') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No fue posible cargar el plan.
        </p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Reintentar
        </Button>
      </section>
    );
  }
  if (planState === 'empty' && !plan) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
        <p className="text-sm font-medium">
          Esta solicitud aun no tiene un plan.
        </p>
        <p className="text-sm text-muted-foreground">
          Crea el plan para empezar a definir fases y tareas.
        </p>
        <Button disabled={busy} onClick={onCreatePlan}>
          <Plus aria-hidden="true" />
          Crear plan
        </Button>
      </section>
    );
  }
  if (plan) {
    return (
      <section className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">Estado del plan</span>
          <span className="text-lg font-medium">
            {planStatusLabel(plan.status)}
          </span>
          {plan.status === 'DEVUELTO' && plan.returnReason ? (
            <span className="text-sm text-destructive">
              Devuelto: {plan.returnReason}
            </span>
          ) : null}
        </div>
      </section>
    );
  }
  return <></>;
}

/** Guia "Resuelve el siguiente paso" + boton Enviar (AC-007). */
function PlanGuidePanel({
  guide,
  canEdit,
  busy,
  onSubmit,
  phaseName,
  tasks,
}: {
  guide: PlanGuide;
  canEdit: boolean;
  busy: boolean;
  onSubmit: () => void;
  phaseName: (id: string) => string;
  tasks: Task[];
}): React.ReactElement {
  const byCategory = React.useMemo(() => {
    const map = new Map<string, typeof guide.pendings>();
    for (const p of guide.pendings) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, [guide]);

  const taskTitle = React.useCallback(
    (id: string | null | undefined) =>
      id ? (tasks.find((t) => t.id === id)?.title ?? '') : '',
    [tasks],
  );

  function targetLabel(category: string, targetId?: string | null): string {
    if (!targetId) return '';
    if (category === 'datesPhases') return ` · ${phaseName(targetId)}`;
    const title = taskTitle(targetId);
    return title ? ` · ${title}` : '';
  }

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Resuelve el siguiente paso</h2>
        {guide.canSubmit ? (
          <Badge variant="success">Listo para enviar</Badge>
        ) : (
          <Badge variant="secondary">
            {guide.pendings.length} pendiente(s)
          </Badge>
        )}
      </div>

      {guide.pendings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay pendientes en las categorias evaluadas. Puedes enviar el plan a
          autorizacion.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(byCategory.entries()).map(([category, items]) => (
            <div key={category} className="flex flex-col gap-1">
              <span className="text-sm font-medium capitalize">{category}</span>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {items.map((p) => (
                  <li key={`${p.code}-${p.targetId ?? ''}`}>
                    {p.message}
                    {targetLabel(category, p.targetId)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {guide.futureCategories.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Se evaluaran en una fase posterior:{' '}
          {guide.futureCategories.join(', ')}.
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button
            disabled={busy || !guide.canSubmit}
            onClick={onSubmit}
            title={
              guide.canSubmit
                ? undefined
                : 'Resuelve los pendientes para habilitar el envio.'
            }
          >
            Enviar a autorizacion
          </Button>
          {!guide.canSubmit ? (
            <span className="text-sm text-muted-foreground">
              Resuelve los pendientes para habilitar el envio.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
