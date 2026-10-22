'use client';

import * as React from 'react';
import { ListChecks, Plus } from 'lucide-react';
import { DataView, type DataViewState } from '@/components/data-view';
import { DisabledReason } from '@/components/disabled-reason';
import { RowActions } from '@/components/row-actions';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  CoordinationPerson,
  MyPermissions,
  Plan,
  Task,
  TaskStatus,
} from '@/lib/api-client';
import { TASK_STATUSES, taskStatusLabel } from '@/lib/tasks';
import { nextTaskStatuses } from '@/lib/task-transitions';
import { cn } from '@/lib/utils';
import { TaskResponsibleControl } from './task-responsible-control';
import { TaskStatusControl } from './task-status-control';

type LoadState = 'loading' | 'success' | 'error';

export interface PlanTasksKanbanProps {
  /** Tareas YA filtradas y ordenadas (las mismas filas que la tabla). */
  tasks: Task[];
  /** Plan seleccionado (no null: el kanban solo se renderiza con plan). */
  plan: Plan;
  /** Personas en alcance, para reasignar responsable. */
  people: CoordinationPerson[];
  /** Distingue fallo de carga de lista vacía legítima. */
  peopleState: LoadState;
  /** Permisos del actor (de useActor()); null mientras cargan. */
  permissions: MyPermissions | null;
  /** El actor es jefe de área o líder de proceso. */
  isPlanManager: boolean;
  /** Plan editable (BORRADOR/DEVUELTO): gobierna crear/editar/eliminar. */
  canEdit: boolean;
  /** Nombre de fase por id, para el subtítulo de cada tarjeta. */
  phaseNameById: Map<string, string>;
  /** Fase inicial: fase por defecto al crear una tarea desde el kanban. */
  initialPhaseId: string | null;
  /** Fila ocupada: busy global || rowBusyId === id. */
  inlineBusy: (taskId: string) => boolean;
  /** Tarjeta con una acción en línea en curso. */
  rowBusyId: string | null;
  /** Acción global en curso (bloquea crear/editar/eliminar como en la tabla). */
  busy: boolean;
  /** Borrado en curso de una tarea (spinner «Eliminando…» como en la tabla). */
  deletingId: string | null;
  /** Estado de la vista, mismo cálculo que renderTasks. */
  viewState: 'empty' | 'no-results' | 'ready';
  /** Motivo del responsable deshabilitado (plan no editable), ya formateado. */
  responsibleDisabledReason?: string;
  /** = handleInlineStatusChange de PlanView. */
  onInlineStatusChange: (task: Task, next: TaskStatus) => void;
  /** = handleInlineResponsibleChange de PlanView. */
  onInlineResponsibleChange: (task: Task, userId: string) => void;
  /** = openNewTask de PlanView. */
  onNewTask: (phaseId: string) => void;
  /** = openEditTask de PlanView. */
  onEditTask: (task: Task) => void;
  /** = requestDeleteTask de PlanView. */
  onRequestDeleteTask: (task: Task) => void;
}

/**
 * Vista Kanban de las tareas del plan: alternativa a la tabla con paridad total
 * de acciones. Solo presentación + arrastrar y soltar; el estado y los handlers
 * viven en PlanView y llegan por props (cero duplicación de la lógica
 * optimista). El TaskDialog sigue montado una sola vez en PlanView; aquí solo
 * se invoca onNewTask/onEditTask.
 *
 * Columnas = los 5 estados (TASK_STATUSES), no fases; la fase es un atributo de
 * cada tarjeta. Drag & drop con HTML5 nativo, sin dependencia; el menú «mover
 * a…» del TaskStatusControl es el camino universal (teclado y móvil/táctil,
 * donde el drag nativo no es fiable).
 */
export function PlanTasksKanban({
  tasks,
  // `plan` llega por paridad del contrato, pero la presentación del kanban no
  // lo necesita directamente: el motivo de responsable deshabilitado ya viene
  // formateado en `responsibleDisabledReason` desde PlanView.
  people,
  peopleState,
  permissions,
  isPlanManager,
  canEdit,
  phaseNameById,
  initialPhaseId,
  inlineBusy,
  rowBusyId,
  busy,
  deletingId,
  viewState,
  responsibleDisabledReason,
  onInlineStatusChange,
  onInlineResponsibleChange,
  onNewTask,
  onEditTask,
  onRequestDeleteTask,
}: PlanTasksKanbanProps): React.ReactElement {
  // Id de la tarjeta que se arrastra (fuente canónica del drag en curso).
  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(null);

  // Fuente ÚNICA del permiso de «cambiar estado» (misma expresión que la tabla):
  // decide el `disabled` del control, si la tarjeta es arrastrable y si una
  // columna acepta el drop. NO depende de `canEdit` (ver plan-view.tsx).
  const canChangeStatus = React.useCallback(
    (task: Task): boolean =>
      !(
        permissions === null ||
        inlineBusy(task.id) ||
        (!isPlanManager && task.responsibleUserId !== permissions?.userId)
      ),
    [permissions, inlineBusy, isPlanManager],
  );

  // Agrupar por estado conservando el orden de llegada (el backend ordena por
  // createdAt asc y PlanView ya aplicó el mismo orden/filtrado). No hay drag
  // intra-columna, así que no se reordena dentro de cada columna.
  const byStatus = React.useMemo(() => {
    const groups = new Map<TaskStatus, Task[]>();
    for (const status of TASK_STATUSES) groups.set(status, []);
    for (const task of tasks) {
      groups.get(task.status as TaskStatus)?.push(task);
    }
    return groups;
  }, [tasks]);

  // La tarea que se está arrastrando (si hay alguna), para decidir si una
  // columna destino resalta/acepta el drop.
  const draggingTask = React.useMemo(
    () => (draggingTaskId ? tasks.find((t) => t.id === draggingTaskId) ?? null : null),
    [draggingTaskId, tasks],
  );

  function acceptsDrop(status: TaskStatus): boolean {
    return (
      draggingTask !== null &&
      canChangeStatus(draggingTask) &&
      nextTaskStatuses(draggingTask.status as TaskStatus).includes(status)
    );
  }

  // Botón «Nueva tarea»: crea en la fase inicial por defecto (el TaskDialog
  // exige phaseId y no tiene selector de fase). Solo si canEdit, como la tabla.
  const canCreate = canEdit;
  const createDisabled = busy || initialPhaseId === null;
  const createReasonId = 'plan-kanban-create-reason';

  if (viewState !== 'ready') {
    return (
      <DataView
        state={viewState as DataViewState}
        empty={{
          icon: ListChecks,
          title: 'Aún no hay tareas.',
          description: canEdit
            ? 'Agrega tareas desde cada fase con «Agregar tarea».'
            : 'Este plan no tiene tareas.',
          size: 'compact',
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canCreate ? (
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            size="sm"
            unavailable={initialPhaseId === null}
            disabled={initialPhaseId !== null && busy}
            aria-describedby={initialPhaseId === null ? createReasonId : undefined}
            onClick={() => {
              if (initialPhaseId !== null && !createDisabled) onNewTask(initialPhaseId);
            }}
          >
            <Plus aria-hidden="true" />
            Nueva tarea
          </Button>
          {initialPhaseId === null ? (
            <DisabledReason id={createReasonId}>Primero crea una fase.</DisabledReason>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <ul className="flex min-w-max gap-3 pb-2" aria-label="Tareas por estado">
          {TASK_STATUSES.map((status) => {
            const columnTasks = byStatus.get(status) ?? [];
            const highlight = acceptsDrop(status);
            return (
              <li key={status} className="flex w-72 shrink-0 flex-col">
                <section
                  aria-label={`Columna ${taskStatusLabel(status)}`}
                  className={cn(
                    'flex h-full flex-col gap-3 rounded-lg border bg-muted/30 p-3 transition-colors',
                    highlight && 'border-primary bg-primary/5',
                  )}
                  onDragOver={(event) => {
                    // Solo preventDefault habilita el drop ⇒ solo transiciones
                    // válidas de una tarjeta arrastrable.
                    if (acceptsDrop(status)) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const task = draggingTask;
                    setDraggingTaskId(null);
                    if (
                      task &&
                      canChangeStatus(task) &&
                      nextTaskStatuses(task.status as TaskStatus).includes(status)
                    ) {
                      onInlineStatusChange(task, status);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge kind="task" value={status} />
                    <span className="text-meta tabular-nums text-muted-foreground">
                      {columnTasks.length}
                    </span>
                  </div>

                  {columnTasks.length === 0 ? (
                    <p className="py-6 text-center text-meta text-muted-foreground">Sin tareas</p>
                  ) : (
                    <ul className="flex flex-col gap-2" aria-label={`Tareas en ${taskStatusLabel(status)}`}>
                      {columnTasks.map((task) => {
                        const draggable = canChangeStatus(task);
                        const taskBusy = rowBusyId === task.id;
                        const statusReason =
                          !isPlanManager && task.responsibleUserId !== permissions?.userId
                            ? 'Solo puedes cambiar el estado de tus propias tareas.'
                            : undefined;
                        return (
                          <li key={task.id}>
                            <article
                              aria-label={`Tarea: ${task.title}`}
                              aria-busy={taskBusy || undefined}
                              draggable={draggable}
                              onDragStart={(event) => {
                                setDraggingTaskId(task.id);
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', task.id);
                              }}
                              onDragEnd={() => setDraggingTaskId(null)}
                              className={cn(
                                'flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground',
                                draggable && 'cursor-grab active:cursor-grabbing',
                                taskBusy && 'opacity-70',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium wrap-break-word">{task.title}</span>
                                  {task.isMilestone ? (
                                    <Badge variant="outline" className="shrink-0">
                                      Hito
                                    </Badge>
                                  ) : null}
                                </span>
                                {canEdit ? (
                                  <RowActions
                                    rowLabel={task.title}
                                    actions={[
                                      {
                                        key: 'edit',
                                        label: 'Editar',
                                        placement: 'menu',
                                        disabled: busy,
                                        onSelect: () => onEditTask(task),
                                      },
                                      {
                                        key: 'delete',
                                        label: 'Eliminar tarea',
                                        placement: 'menu',
                                        tone: 'danger',
                                        busy: deletingId === task.id,
                                        busyLabel: 'Eliminando…',
                                        disabled: busy,
                                        onSelect: () => onRequestDeleteTask(task),
                                      },
                                    ]}
                                  />
                                ) : null}
                              </div>

                              <p className="text-meta text-muted-foreground wrap-break-word">
                                {phaseNameById.get(task.phaseId) ?? '—'}
                              </p>

                              <TaskResponsibleControl
                                value={task.responsibleUserId}
                                people={people}
                                loadError={peopleState === 'error'}
                                busy={taskBusy}
                                disabled={!canEdit || permissions === null || inlineBusy(task.id)}
                                disabledReason={!canEdit ? responsibleDisabledReason : undefined}
                                taskTitle={task.title}
                                onChange={(userId) => onInlineResponsibleChange(task, userId)}
                              />

                              {/*
                                El menú «mover a…» es la alternativa accesible al
                                drag (teclado y móvil/táctil) y muestra el avance
                                junto al estado. Misma expresión de permiso que el
                                drag y que la tabla (canChangeStatus).
                              */}
                              <TaskStatusControl
                                status={task.status}
                                progress={task.progress}
                                busy={taskBusy}
                                disabled={!canChangeStatus(task)}
                                disabledReason={statusReason}
                                taskTitle={task.title}
                                onChange={(next) => onInlineStatusChange(task, next)}
                              />
                            </article>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
