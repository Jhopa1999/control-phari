'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Download,
  FileSpreadsheet,
  ListChecks,
  Lock,
  Plus,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CellTitle, ResultCount, SortableTableHead } from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { DisabledReason } from '@/components/disabled-reason';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RequestInbox } from '@/components/request-inbox';
import { RequestContextBar, type RequestPickerGroup } from '@/components/request-context-bar';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { SearchInput, Toolbar } from '@/components/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import type {
  CoordinationPerson,
  Plan,
  PlanGuide,
  PlanPhase,
  Request,
  Task,
  TaskStatus,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { formatDateOnly, formatHours } from '@/lib/format';
import {
  PlanError,
  createPlan,
  downloadPlanExcel,
  getPlan,
  getPlanGuide,
  importPlanExcel,
  submitPlan,
} from '@/lib/plan';
import { deletePhase, listPhases, reorderPhases } from '@/lib/plan-phases';
import { PLANNABLE_STATES } from '@/lib/request-state';
import { listRequests } from '@/lib/requests';
import { compareByOrder, compareDate, type Comparator } from '@/lib/table-sort';
import { matchesTaskFilters } from '@/lib/task-filters';
import {
  TASK_STATUSES,
  deleteTask,
  downloadTasksCsv,
  listPlanTasks,
  taskStatusLabel,
  updateTask,
  updateTaskStatus,
} from '@/lib/tasks';
import { useClientTable } from '@/lib/use-client-table';
import { usePlanTasksView } from '@/lib/use-plan-tasks-view';
import { useRequestIdParam } from '@/lib/use-request-param';
import { listCoordinationPeople } from '@/lib/worklog';
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { TaskDetail } from '../tareas/task-detail';
import { PhaseDialog } from './phase-dialog';
import { PlanGuidePanel } from './plan-guide-panel';
import { PlanSummary } from './plan-summary';
import { PlanTasksKanban } from './plan-tasks-kanban';
import { TaskDialog } from './task-dialog';
import { TaskResponsibleControl } from './task-responsible-control';
import { TaskStatusControl } from './task-status-control';

type LoadState = 'loading' | 'success' | 'error';
/** idle: sin solicitud elegida; missing: la solicitud aún no tiene plan (404). */
type PlanLoadState = 'idle' | 'loading' | 'success' | 'error' | 'missing';
type MoveDirection = 'up' | 'down';
type TaskSortKey = 'start' | 'end' | 'status';

const TITLE = 'Planificación';
/** La misma descripción usa el PageFallback de page.tsx. */
const PLAN_DESCRIPTION =
  'Plan por fases y tareas de una solicitud comprometida. La guía indica qué falta para enviarlo a autorización.';
const NOT_PLANNABLE =
  'La solicitud indicada no está comprometida, en planificación ni en ejecución.';
/** Nota y motivo de la fase inicial con tareas (design §10.2, «LOCK»). */
const LOCK = 'Fase inicial con tareas: no se mueve ni se elimina.';
const PHASE_HAS_TASKS = 'La fase tiene tareas. Elimínalas antes de eliminar la fase.';
const ALL = 'ALL';
const TASK_NOUN = { one: 'tarea', other: 'tareas' };

const GROUPS: RequestPickerGroup[] = [
  { label: 'Comprometidas', match: (r) => r.operationalState === 'COMPROMETIDA' },
  { label: 'En planificación', match: (r) => r.operationalState === 'EN_PLANIFICACION' },
  { label: 'En ejecución', match: (r) => r.operationalState === 'EN_EJECUCION' },
];

const compareTaskStatus = compareByOrder(TASK_STATUSES);
const TASK_COMPARATORS: Record<TaskSortKey, Comparator<Task>> = {
  start: (a, b, direction) => compareDate(a.startDate, b.startDate, direction),
  end: (a, b, direction) => compareDate(a.endDate, b.endDate, direction),
  // Orden del flujo: Por hacer → En curso → Bloqueada → En revisión → Terminada.
  status: (a, b, direction) => compareTaskStatus(a.status, b.status, direction),
};


function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

function phaseActionId(phaseId: string, action: 'up' | 'down' | 'edit'): string {
  return `phase-${phaseId}-${action}`;
}

function taskActionId(taskId: string): string {
  return `task-${taskId}-edit`;
}

/** «En autorización» → «en autorización»: el estado dentro de una frase. */
function planStatePhrase(status: string): string {
  if (status === 'EN_AUTORIZACION') return 'en autorización';
  if (status === 'AUTORIZADO') return 'autorizado';
  return status;
}

/**
 * Planificación (design §11.9, patrón C): barra de contexto con las
 * solicitudes planificables agrupadas por estado, guía de pendientes con el
 * envío a autorización, fases en tabla y tareas filtrables. La selección se
 * refleja en ?requestId= (§7.9.1).
 */
export function PlanView(): React.ReactElement {
  const { actorId, permissions, allowedModules } = useActor();
  const { requestId: urlId, setRequestId } = useRequestIdParam();
  // Presentación de la sección «Tareas»: tabla (por defecto) o kanban. Solo
  // cambia la vista; datos, filtros y acciones son los mismos.
  const { view: tasksView, setView: setTasksView } = usePlanTasksView();
  const permissionsLoaded = permissions !== null;
  const planAllowed = allowedModules.has('plan');
  // Un 403 del plan lleva al mismo aviso que no tener el módulo.
  const [planForbidden, setPlanForbidden] = React.useState(false);
  const forbidden = planForbidden || (permissionsLoaded && !planAllowed);

  // --- Selector de solicitud ---
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [requestsState, setRequestsState] = React.useState<LoadState>('loading');
  const [requestsError, setRequestsError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState('');
  const selectedRef = React.useRef(selectedId);
  // Ultimo valor para los callbacks asincronos (se actualiza tras el render, no durante).
  React.useEffect(() => {
    selectedRef.current = selectedId;
  });
  const [notice, setNotice] = React.useState<string | null>(null);

  // --- Plan y sus datos ---
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [phases, setPhases] = React.useState<PlanPhase[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [guide, setGuide] = React.useState<PlanGuide | null>(null);
  const [planState, setPlanState] = React.useState<PlanLoadState>('idle');
  const [busy, setBusy] = React.useState(false);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  // Distingue el fallo de carga de una lista legitimamente vacia (design 3.6.1).
  const [peopleState, setPeopleState] = React.useState<LoadState>('loading');
  // Fila con una accion de edicion en linea en curso (una a la vez).
  const [rowBusyId, setRowBusyId] = React.useState<string | null>(null);

  // --- Filtros de la lista de tareas ---
  const [q, setQ] = React.useState('');
  const [mine, setMine] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [phaseFilter, setPhaseFilter] = React.useState<string>(ALL);

  // --- Diálogos ---
  const [phaseDialog, setPhaseDialog] = React.useState<{
    open: boolean;
    phase: PlanPhase | null;
  }>({ open: false, phase: null });
  const [taskDialog, setTaskDialog] = React.useState<{
    open: boolean;
    task: Task | null;
    phaseId: string | null;
  }>({ open: false, task: null, phaseId: null });
  // Panel lateral con el detalle de la tarea elegida.
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [phaseToDelete, setPhaseToDelete] = React.useState<PlanPhase | null>(null);
  const [phaseConfirmOpen, setPhaseConfirmOpen] = React.useState(false);
  const [taskToDelete, setTaskToDelete] = React.useState<Task | null>(null);
  const [taskConfirmOpen, setTaskConfirmOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  // Import de plan: documento elegido pendiente de confirmar el reemplazo.
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importErrors, setImportErrors] = React.useState<string[]>([]);
  const [importConfirmOpen, setImportConfirmOpen] = React.useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // Foco tras reordenar y tras eliminar una fila (§11.9 y NIT 4).
  const moveFocusRef = React.useRef<{ phaseId: string; dir: MoveDirection } | null>(null);
  const focusAfterDeleteRef = React.useRef<string | null>(null);
  const phasesHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const tasksHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const selectRequest = React.useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const fetchRequests = React.useCallback(() => {
    return Promise.all(PLANNABLE_STATES.map((state) => listRequests({ state })))
      .then((all) => {
        const flat = all.flat();
        setRequests(flat);
        setRequestsState('success');
        // Regla 3 de §7.9.1: si la solicitud elegida ya no está, se limpia.
        if (selectedRef.current && !flat.some((r) => r.id === selectedRef.current)) {
          selectRequest('');
          setRequestId(null);
        }
      })
      .catch((err: unknown) => {
        setRequestsError(err instanceof Error ? err.message : null);
        setRequestsState('error');
      });
  }, [selectRequest, setRequestId]);
  const loadRequests = React.useCallback(() => {
    setRequestsState('loading');
    return fetchRequests();
  }, [fetchRequests]);

  // Recarga también al cambiar de actor, como hasta ahora. Gating cosmético,
  // como en Indicadores y Aprobaciones: sin el módulo plan no se llama al
  // backend (respondería 403) y se muestra el aviso de rol.
  // Al cambiar de usuario o de permisos se vuelve a mostrar la carga.
  useResetOnChange([actorId, permissionsLoaded, planAllowed], () => {
    if (!permissionsLoaded || !planAllowed) return;
    setPlanForbidden(false);
    setRequestsState('loading');
    setPeopleState('loading');
  });
  React.useEffect(() => {
    if (!permissionsLoaded || !planAllowed) return;
    void fetchRequests();
  }, [fetchRequests, actorId, permissionsLoaded, planAllowed]);

  // Personas para el selector de Responsable. peopleState distingue el fallo de
  // carga (motivo "No se pudieron cargar las personas") de una lista
  // legítimamente vacía (design §3.6.1): listCoordinationPeople LANZA ante un
  // fallo HTTP/red, no devuelve [].
  React.useEffect(() => {
    if (!permissionsLoaded || !planAllowed) return;
    let active = true;
    void listCoordinationPeople()
      .then((data) => {
        if (!active) return;
        setPeople(data);
        setPeopleState('success');
      })
      .catch(() => {
        if (!active) return;
        setPeople([]);
        setPeopleState('error');
      });
    return () => {
      active = false;
    };
  }, [actorId, permissionsLoaded, planAllowed]);

  // Regla 1 de §7.9.1: adoptar ?requestId= al terminar la carga y cuando cambia.
  React.useEffect(() => {
    if (requestsState !== 'success' || !urlId || urlId === selectedRef.current) return;
    if (requests.some((r) => r.id === urlId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza la selección con ?requestId= de la URL (sistema externo, vía router) una vez cargada la lista.
      setNotice(null);
      selectRequest(urlId);
    } else {
      setNotice(NOT_PLANNABLE);
      setRequestId(null);
    }
  }, [requestsState, requests, urlId, selectRequest, setRequestId]);

  // Regla 2: primero el estado, después la URL.
  function handlePick(id: string): void {
    setNotice(null);
    selectRequest(id);
    setRequestId(id);
  }

  const handlePlanLoadError = React.useCallback((err: unknown) => {
    if (err instanceof PlanError && err.status === 404) {
      // Aún no hay plan para esta solicitud: ofrecer crearlo.
      setPlan(null);
      setPhases([]);
      setTasks([]);
      setGuide(null);
      setPlanState('missing');
    } else if (err instanceof PlanError && err.status === 403) {
      setPlanForbidden(true);
      setPlanState('error');
    } else {
      setPlanState('error');
    }
  }, []);
  const fetchPlan = React.useCallback((requestId: string) => {
    return getPlan(requestId)
      .then((current) =>
        Promise.all([
          listPhases(current.id),
          listPlanTasks(current.id),
          getPlanGuide(requestId),
        ]).then(([phaseList, taskList, guideData]) => {
          setPlan(current);
          setPhases(phaseList);
          setTasks(taskList);
          setGuide(guideData);
          setPlanState('success');
        }),
      )
      .catch((err: unknown) => {
        handlePlanLoadError(err);
      });
  }, [handlePlanLoadError]);
  const loadPlan = React.useCallback((requestId: string) => {
    if (!requestId) {
      setPlan(null);
      setPlanState('idle');
      return Promise.resolve();
    }
    setPlanState('loading');
    return fetchPlan(requestId);
  }, [fetchPlan]);


  // Al cambiar de solicitud: sin solicitud, se vacía el plan; con solicitud, se
  // vuelve a mostrar la carga.
  useResetOnChange([selectedId], () => {
    if (!selectedId) {
      setPlan(null);
      setPlanState('idle');
    } else {
      setPlanState('loading');
    }
  });
  React.useEffect(() => {
    if (selectedId) void fetchPlan(selectedId);
  }, [selectedId, fetchPlan]);

  const refreshPlanData = React.useCallback(async () => {
    if (!plan || !selectedId) return;
    try {
      const [phaseList, taskList, guideData, current] = await Promise.all([
        listPhases(plan.id),
        listPlanTasks(plan.id),
        getPlanGuide(selectedId),
        getPlan(selectedId),
      ]);
      setPhases(phaseList);
      setTasks(taskList);
      setGuide(guideData);
      setPlan(current);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }, [plan, selectedId]);

  // Recarga SOLO la guía tras un cambio de estado ya confirmado por el backend.
  // Best-effort: su fallo no revierte la fila ni muestra toast (a diferencia de
  // refreshPlanData, que sí avisa). La guía depende del estado de las tareas.
  const refreshGuideOnly = React.useCallback(async () => {
    if (!selectedId) return;
    try {
      const g = await getPlanGuide(selectedId);
      setGuide(g);
    } catch {
      // best-effort tras un cambio ya confirmado.
    }
  }, [selectedId]);

  // Cambio de estado en línea (PATCH /tasks/{id}/status). Optimista con
  // reconciliación: pinta el nuevo estado, lo reemplaza por la tarea del backend
  // al tener éxito, revierte y avisa en error (design §3.7). Usa solo rowBusyId
  // (no bloquea toda la tabla); guarda `if (busy)` como defensa en profundidad.
  async function handleInlineStatusChange(task: Task, next: TaskStatus) {
    if (busy) return;
    setRowBusyId(task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      const updated = await updateTaskStatus(task.id, { status: next });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast.success('Estado de la tarea actualizado.');
      await refreshGuideOnly();
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast.error(messageOf(err));
    } finally {
      setRowBusyId(null);
    }
  }

  // Reasignación de responsable en línea (PATCH /tasks/{id}). Optimista con
  // reconciliación; no refresca la guía (reasignar no la cambia).
  async function handleInlineResponsibleChange(task: Task, userId: string) {
    if (busy) return;
    setRowBusyId(task.id);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, responsibleUserId: userId } : t)),
    );
    try {
      const updated = await updateTask(task.id, { responsibleUserId: userId });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast.success('Responsable actualizado.');
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast.error(messageOf(err));
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleCreatePlan() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await createPlan(selectedId, {});
      toast.success('Plan creado. La solicitud pasa a En planificación.');
      await loadPlan(selectedId);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPlan() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await submitPlan(selectedId);
      toast.success('Plan enviado a autorización.');
      await refreshPlanData();
    } catch (err) {
      // 409: el backend recalcula la guía; se muestran los pendientes vigentes.
      toast.error(messageOf(err));
      await refreshPlanData();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePhase(phase: PlanPhase) {
    if (!plan) return;
    setBusy(true);
    setDeletingId(phase.id);
    try {
      await deletePhase(plan.id, phase.id);
      toast.success('Fase eliminada.');
      await refreshPlanData();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeletingId(null);
      setBusy(false);
    }
  }

  async function handleMovePhase(index: number, direction: -1 | 1) {
    if (!plan) return;
    const target = index + direction;
    if (target < 0 || target >= phases.length) return;
    // Destino del foco cuando termine la llamada (§11.9); la lógica no cambia.
    moveFocusRef.current = { phaseId: phases[index].id, dir: direction < 0 ? 'up' : 'down' };
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
    setDeletingId(task.id);
    try {
      await deleteTask(task.id);
      toast.success('Tarea eliminada.');
      await refreshPlanData();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeletingId(null);
      setBusy(false);
    }
  }

  async function handleExportPlan() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await downloadPlanExcel(selectedId, 'export');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadTemplate() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await downloadPlanExcel(selectedId, 'template');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function handleExportTasks() {
    if (!selectedId) return;
    // Foto de la vista: exporta las tareas actualmente filtradas (design §7.2).
    downloadTasksCsv(selectedId, taskTable.pageRows, {
      phaseName: (id) => phaseNameById.get(id),
      personName: (id) => personNameById.get(id),
      formatDate: formatDateOnly,
    });
  }

  // El import se dispara desde un <input type=file> oculto; el botón real lo abre.
  async function handleImportFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    // Limpiar el value permite reintentar el mismo archivo tras un error.
    event.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('Elige un archivo Excel (.xlsx). Puedes descargar la plantilla.');
      return;
    }
    // El contenido lo valida el backend al importar.
    setImportErrors([]);
    setImportFile(file);
    setImportConfirmOpen(true);
  }

  async function handleImportPlan() {
    if (!selectedId || !importFile) return;
    setBusy(true);
    try {
      const result = await importPlanExcel(selectedId, importFile);
      setImportErrors([]);
      toast.success(result.message);
      await refreshPlanData();
    } catch (err) {
      if (err instanceof PlanError && err.details.length > 0) {
        setImportErrors(err.details);
      }
      toast.error(messageOf(err));
    } finally {
      setImportFile(null);
      setBusy(false);
    }
  }

  // Cuando termina el reordenamiento (con éxito o con error), el foco vuelve al
  // botón pulsado de la fase movida o, si quedó en el límite, al del otro sentido.
  React.useEffect(() => {
    const pending = moveFocusRef.current;
    if (busy || !pending) return;
    moveFocusRef.current = null;
    const opposite: MoveDirection = pending.dir === 'up' ? 'down' : 'up';
    const pressed = document.getElementById(phaseActionId(pending.phaseId, pending.dir));
    const target =
      pressed instanceof HTMLButtonElement && pressed.disabled
        ? document.getElementById(phaseActionId(pending.phaseId, opposite))
        : pressed;
    target?.focus();
  }, [busy, phases]);

  const initialPhaseId = React.useMemo(() => {
    if (phases.length === 0) return null;
    return phases.reduce((min, p) => (p.order < min.order ? p : min), phases[0]).id;
  }, [phases]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- falso positivo del compilador: se conserva a propósito la memoización manual del mapa.
  const phaseNameById = React.useMemo(() => new Map(phases.map((p) => [p.id, p.name])), [phases]);
  const taskTitleById = React.useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- falso positivo del compilador: se conserva a propósito la memoización manual del mapa.
  const personNameById = React.useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const taskCountByPhase = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) counts.set(t.phaseId, (counts.get(t.phaseId) ?? 0) + 1);
    return counts;
  }, [tasks]);

  // «Solo mis tareas» compara con el userId de GET /me/permissions (corrige §19.13).
  const mineUserId = mine ? (permissions?.userId ?? null) : null;
  const taskFilter = React.useCallback(
    (t: Task) => matchesTaskFilters(t, { q, status: statusFilter, phaseId: phaseFilter, mineUserId }),
    [q, statusFilter, phaseFilter, mineUserId],
  );
  // Un plan cabe en una tabla: sin paginación, para no ocultar filas (§24.1).
  const taskTable = useClientTable({
    rows: tasks,
    filter: taskFilter,
    comparators: TASK_COMPARATORS,
    defaultSort: null,
    pageSize: null,
  });

  const selected = React.useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );
  const canEdit = plan?.status === 'BORRADOR' || plan?.status === 'DEVUELTO';
  // Rol de gestión del plan (jefe/líder): en la mesa de plan el actor siempre lo
  // es (el módulo plan no admite INTEGRANTE), así que el chequeo por integrante
  // del control de estado es defensa en profundidad; el backend es el control real.
  const isPlanManager = (permissions?.grants ?? []).some(
    (g) => g.roleCode === 'JEFE_AREA' || g.roleCode === 'LIDER_PROCESO',
  );
  // Fila ocupada: el busy global bloquea toda la tabla; rowBusyId, su propia fila.
  const inlineBusy = React.useCallback(
    (taskId: string) => busy || rowBusyId === taskId,
    [busy, rowBusyId],
  );

  function openNewPhase(): void {
    setPhaseDialog({ open: true, phase: null });
  }

  function openEditPhase(phase: PlanPhase): void {
    setPhaseDialog({ open: true, phase });
  }

  function openNewTask(phaseId: string): void {
    setTaskDialog({ open: true, task: null, phaseId });
  }

  function openEditTask(task: Task): void {
    setTaskDialog({ open: true, task, phaseId: task.phaseId });
  }

  function requestDeletePhase(phase: PlanPhase): void {
    const index = phases.findIndex((p) => p.id === phase.id);
    const neighbour = phases[index + 1] ?? phases[index - 1] ?? null;
    focusAfterDeleteRef.current = neighbour ? phaseActionId(neighbour.id, 'edit') : null;
    setPhaseToDelete(phase);
    setPhaseConfirmOpen(true);
  }

  function requestDeleteTask(task: Task): void {
    const rows = taskTable.pageRows;
    const index = rows.findIndex((t) => t.id === task.id);
    const neighbour = rows[index + 1] ?? rows[index - 1] ?? null;
    focusAfterDeleteRef.current = neighbour ? taskActionId(neighbour.id) : null;
    setTaskToDelete(task);
    setTaskConfirmOpen(true);
  }

  const returnFocusToPhases = React.useCallback((): HTMLElement | null => {
    const id = focusAfterDeleteRef.current;
    return (id ? document.getElementById(id) : null) ?? phasesHeadingRef.current;
  }, []);

  const returnFocusToTasks = React.useCallback((): HTMLElement | null => {
    const id = focusAfterDeleteRef.current;
    return (id ? document.getElementById(id) : null) ?? tasksHeadingRef.current;
  }, []);

  function phaseActions(phase: PlanPhase, index: number): RowAction[] {
    const isInitial = phase.id === initialPhaseId;
    const hasTasks = (taskCountByPhase.get(phase.id) ?? 0) > 0;
    const lockedInitial = isInitial && hasTasks;
    const atTop = index === 0;
    const atBottom = index === phases.length - 1;
    // Cálculo por fila de §10.2: el límite natural manda sobre el bloqueo (§10.3).
    const move = (dir: MoveDirection, atLimit: boolean): RowAction => ({
      key: dir,
      id: phaseActionId(phase.id, dir),
      label: dir === 'up' ? 'Subir fase' : 'Bajar fase',
      icon: dir === 'up' ? ArrowUp : ArrowDown,
      iconOnly: true,
      placement: 'inline',
      onSelect: () => void handleMovePhase(index, dir === 'up' ? -1 : 1),
      ...(atLimit
        ? { disabled: true }
        : lockedInitial
          ? { disabled: true, disabledReason: LOCK }
          : { disabled: busy }),
    });
    return [
      move('up', atTop),
      move('down', atBottom),
      {
        key: 'edit',
        id: phaseActionId(phase.id, 'edit'),
        label: 'Editar',
        placement: 'inline',
        disabled: busy,
        onSelect: () => openEditPhase(phase),
      },
      {
        key: 'add-task',
        label: 'Agregar tarea',
        placement: 'inline',
        // Solo transitorio: una fase admite varias tareas (corrige §19.1).
        disabled: busy,
        onSelect: () => openNewTask(phase.id),
      },
      {
        key: 'delete',
        label: 'Eliminar fase',
        placement: 'menu',
        tone: 'danger',
        busy: deletingId === phase.id,
        busyLabel: 'Eliminando…',
        onSelect: () => requestDeletePhase(phase),
        ...(hasTasks
          ? { disabled: true, disabledReason: isInitial ? LOCK : PHASE_HAS_TASKS }
          : { disabled: busy }),
      },
    ];
  }

  function renderPhases(): React.ReactElement {
    return (
      <Section
        title="Fases"
        count={phases.length}
        headingRef={phasesHeadingRef}
        actions={
          canEdit ? (
            <Button type="button" size="sm" disabled={busy} onClick={openNewPhase}>
              <Plus aria-hidden="true" />
              Nueva fase
            </Button>
          ) : undefined
        }
      >
        <DataView
          state={phases.length === 0 ? 'empty' : 'ready'}
          empty={{
            icon: ClipboardList,
            title: 'Aún no hay fases.',
            description: canEdit
              ? 'Crea la primera con «Nueva fase» para empezar a planificar.'
              : 'Este plan no tiene fases.',
            size: 'compact',
          }}
        >
          <Table density="compact" scrollLabel="Tabla de fases">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right">#</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead>Fechas</TableHead>
                <TableHead>Entregable</TableHead>
                <TableHead className="text-right">Tareas</TableHead>
                {canEdit ? <TableHead className="text-right">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {phases.map((phase, index) => {
                const isInitial = phase.id === initialPhaseId;
                const count = taskCountByPhase.get(phase.id) ?? 0;
                const lockedInitial = isInitial && count > 0;
                return (
                  <TableRow key={phase.id}>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="min-w-48 max-w-[22rem]">
                      <div className="flex flex-col gap-0.5 py-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium wrap-break-word">{phase.name}</span>
                          {isInitial ? <Badge variant="neutral">Fase inicial</Badge> : null}
                        </span>
                        {lockedInitial ? (
                          <span className="flex items-start gap-1 text-meta text-muted-foreground">
                            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                            {LOCK}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {phase.startDate || phase.endDate
                        ? `${formatDateOnly(phase.startDate)} – ${formatDateOnly(phase.endDate)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="min-w-40 max-w-[20rem] text-muted-foreground">
                      {phase.deliverable ? (
                        <span className="line-clamp-2 wrap-break-word" title={phase.deliverable}>
                          {phase.deliverable}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{count}</TableCell>
                    {canEdit ? (
                      <RowActionsCell>
                        <RowActions rowLabel={phase.name} actions={phaseActions(phase, index)} />
                      </RowActionsCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DataView>
      </Section>
    );
  }

  function renderTasks(): React.ReactElement {
    let viewState: DataViewState;
    if (taskTable.total === 0) viewState = 'empty';
    else if (taskTable.filtered === 0) viewState = 'no-results';
    else viewState = 'ready';

    // Motivo del responsable deshabilitado (plan no editable): se calcula aquí
    // una sola vez y se pasa al kanban para no duplicar `planStatePhrase`.
    const responsibleDisabledReason =
      !canEdit && plan
        ? `El plan está ${planStatePhrase(plan.status)}; las fases y tareas no se pueden editar.`
        : undefined;

    return (
      <Section
        title="Tareas"
        headingRef={tasksHeadingRef}
        actions={
          <div className="flex items-center gap-2">
            <span id="plan-tasks-view-label" className="text-meta text-muted-foreground">
              Vista
            </span>
            <SegmentedRadio
              id="plan-tasks-view"
              name="plan-tasks-view"
              labelledBy="plan-tasks-view-label"
              value={tasksView}
              onValueChange={(value) => setTasksView(value === 'kanban' ? 'kanban' : 'table')}
              options={[
                { value: 'table', label: 'Tabla' },
                { value: 'kanban', label: 'Kanban' },
              ]}
            />
          </div>
        }
      >
        <Toolbar
          label="Filtros de tareas"
          end={<ResultCount loading={false} total={taskTable.total} filtered={taskTable.filtered} noun={TASK_NOUN} />}
        >
          <SearchInput
            id="task-q"
            placeholder="Título de la tarea"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <div className="grid w-full gap-1.5 sm:w-auto">
            <Label htmlFor="task-status">Estado</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="task-status" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {TASK_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {taskStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-1.5 sm:w-auto">
            <Label htmlFor="task-phase">Fase</Label>
            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
              <SelectTrigger id="task-phase" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {phases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex h-9 w-full items-center gap-2 sm:w-auto">
            <Switch
              id="task-mine"
              checked={mine}
              onCheckedChange={setMine}
              disabled={permissions === null}
            />
            <Label htmlFor="task-mine" className="font-normal">
              Solo mis tareas
            </Label>
          </div>
        </Toolbar>

        {tasksView === 'kanban' ? (
          <PlanTasksKanban
            tasks={taskTable.pageRows}
            plan={plan!}
            people={people}
            peopleState={peopleState}
            permissions={permissions}
            isPlanManager={isPlanManager}
            canEdit={canEdit}
            phaseNameById={phaseNameById}
            initialPhaseId={initialPhaseId}
            inlineBusy={inlineBusy}
            rowBusyId={rowBusyId}
            busy={busy}
            deletingId={deletingId}
            viewState={viewState}
            responsibleDisabledReason={responsibleDisabledReason}
            onInlineStatusChange={handleInlineStatusChange}
            onInlineResponsibleChange={handleInlineResponsibleChange}
            onNewTask={openNewTask}
            onEditTask={openEditTask}
            onRequestDeleteTask={requestDeleteTask}
          />
        ) : (
        <DataView
          state={viewState}
          empty={{
            icon: ListChecks,
            title: 'Aún no hay tareas.',
            description: canEdit
              ? 'Agrega tareas desde cada fase con «Agregar tarea».'
              : 'Este plan no tiene tareas.',
            size: 'compact',
          }}
        >
          <Table scrollLabel="Tabla de tareas del plan">
            <TableHeader>
              <TableRow>
                <TableHead>Tarea</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead>Responsable</TableHead>
                <SortableTableHead label="Inicio" sortKey="start" sort={taskTable.sort} onSort={taskTable.toggleSort} />
                <SortableTableHead label="Vence" sortKey="end" sort={taskTable.sort} onSort={taskTable.toggleSort} />
                <TableHead className="text-right">Esfuerzo</TableHead>
                <TableHead className="text-right">Predecesoras</TableHead>
                <SortableTableHead label="Estado" sortKey="status" sort={taskTable.sort} onSort={taskTable.toggleSort} />
                {canEdit ? <TableHead className="text-right">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {taskTable.pageRows.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="min-w-56 max-w-[28rem]">
                    <div className="flex items-center gap-2">
                      <CellTitle onOpen={() => setDetailTaskId(task.id)}>
                        {task.title}
                      </CellTitle>
                      {task.isMilestone ? (
                        <Badge variant="outline" className="shrink-0">
                          Hito
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-32 text-muted-foreground">
                    {phaseNameById.get(task.phaseId) ?? '—'}
                  </TableCell>
                  <TableCell className="min-w-36">
                    <TaskResponsibleControl
                      value={task.responsibleUserId}
                      people={people}
                      loadError={peopleState === 'error'}
                      busy={rowBusyId === task.id}
                      disabled={!canEdit || permissions === null || inlineBusy(task.id)}
                      disabledReason={
                        !canEdit && plan
                          ? `El plan está ${planStatePhrase(plan.status)}; las fases y tareas no se pueden editar.`
                          : undefined
                      }
                      taskTitle={task.title}
                      onChange={(userId) => handleInlineResponsibleChange(task, userId)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDateOnly(task.startDate)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDateOnly(task.endDate)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {task.isMilestone || task.estimateHours === null ? '—' : formatHours(task.estimateHours)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{task.predecessors.length}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {/*
                      Cambiar estado NO depende de `canEdit` (plan editable): el
                      backend (TaskService.changeStatus) solo exige ser el
                      responsable —o jefe/líder— y una transición válida, nunca
                      que el plan esté en borrador/devuelto. Así los miembros
                      actualizan sus estados también en ejecución. Misma
                      expresión en la tabla y en el kanban (fuente única).
                    */}
                    <TaskStatusControl
                      status={task.status}
                      progress={task.progress}
                      busy={rowBusyId === task.id}
                      disabled={
                        permissions === null ||
                        inlineBusy(task.id) ||
                        (!isPlanManager && task.responsibleUserId !== permissions?.userId)
                      }
                      disabledReason={
                        !isPlanManager && task.responsibleUserId !== permissions?.userId
                          ? 'Solo puedes cambiar el estado de tus propias tareas.'
                          : undefined
                      }
                      taskTitle={task.title}
                      onChange={(next) => handleInlineStatusChange(task, next)}
                    />
                  </TableCell>
                  {canEdit ? (
                    <RowActionsCell>
                      <RowActions
                        rowLabel={task.title}
                        actions={[
                          {
                            key: 'edit',
                            id: taskActionId(task.id),
                            label: 'Editar',
                            disabled: busy,
                            onSelect: () => openEditTask(task),
                          },
                          {
                            key: 'delete',
                            label: 'Eliminar tarea',
                            placement: 'menu',
                            tone: 'danger',
                            busy: deletingId === task.id,
                            busyLabel: 'Eliminando…',
                            disabled: busy,
                            onSelect: () => requestDeleteTask(task),
                          },
                        ]}
                      />
                    </RowActionsCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataView>
        )}
      </Section>
    );
  }
  function renderPlan(): React.ReactNode {
    if (planState === 'loading' || planState === 'idle') {
      return (
        <div aria-busy="true" className="flex flex-col gap-6">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      );
    }
    if (planState === 'error') {
      return (
        <div className="rounded-lg border bg-card">
          <ErrorState title="No fue posible cargar el plan." onRetry={() => void loadPlan(selectedId)} />
        </div>
      );
    }
    if (planState === 'missing' || !plan) {
      return (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={ClipboardList}
            title="Esta solicitud aún no tiene un plan."
            description="Crea el plan para definir fases y tareas."
            action={
              <Button type="button" loading={busy} onClick={() => void handleCreatePlan()}>
                {busy ? null : <Plus aria-hidden="true" />}
                Crear plan
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <>
        {plan.status === 'DEVUELTO' ? (
          <InlineNotice tone="warning">
            {plan.returnReason
              ? // El motivo puede traer su propio punto final: no se duplica.
                `Plan devuelto: ${plan.returnReason.trim().replace(/[.\s]+$/, '')}. Corrige lo indicado y vuelve a enviarlo.`
              : 'Plan devuelto. Corrige lo indicado y vuelve a enviarlo.'}
          </InlineNotice>
        ) : null}
        {!canEdit ? (
          <InlineNotice tone="info">
            {`El plan está ${planStatePhrase(plan.status)}; las fases y tareas no se pueden editar.`}
          </InlineNotice>
        ) : null}
        <PlanSummary plan={plan} />
        {renderPlanActions()}
        {importErrors.length > 0 ? (
          <InlineNotice tone="danger" title={`No se importó el archivo: se encontraron ${importErrors.length} error(es).`}>
            <ul className="list-disc pl-5 text-sm">
              {importErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </InlineNotice>
        ) : null}
        {renderPhases()}
        {renderTasks()}
        {/* PLA-06: el bloque de envío va al final, después de fases y tareas. La guía solo se muestra si el plan es editable (§11.9); getPlanGuide se sigue llamando. */}
        {canEdit && guide ? (
          <PlanGuidePanel
            guide={guide}
            phases={phases}
            tasks={tasks}
            phaseNameById={phaseNameById}
            taskTitleById={taskTitleById}
            initialPhaseId={initialPhaseId}
            busy={busy}
            onNewPhase={openNewPhase}
            onNewTask={openNewTask}
            onEditPhase={openEditPhase}
            onEditTask={openEditTask}
            onSubmit={() => setSubmitOpen(true)}
          />
        ) : null}
      </>
    );
  }

  /**
   * Barra de acciones del plan (design §7.3): exportar plan (JSON), exportar
   * tareas (CSV) e importar plan (JSON). El gating es cosmético; el backend es
   * el control real (p. ej. 409 si el plan no es editable).
   */
  function renderPlanActions(): React.ReactElement {
    const noTasks = taskTable.pageRows.length === 0;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void handleExportPlan()}
        >
          <Download aria-hidden="true" />
          Exportar plan (Excel)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void handleDownloadTemplate()}
        >
          <FileSpreadsheet aria-hidden="true" />
          Descargar plantilla
        </Button>
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            unavailable={noTasks}
            disabled={!noTasks && busy}
            aria-describedby={noTasks ? 'plan-export-tasks-reason' : undefined}
            onClick={handleExportTasks}
          >
            <FileSpreadsheet aria-hidden="true" />
            Exportar tareas (CSV)
          </Button>
          {noTasks ? (
            <DisabledReason id="plan-export-tasks-reason">
              Agrega al menos una tarea para exportarlas.
            </DisabledReason>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            unavailable={!canEdit}
            disabled={canEdit && busy}
            aria-describedby={!canEdit ? 'plan-import-reason' : undefined}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload aria-hidden="true" />
            Importar plan (Excel)
          </Button>
          {!canEdit ? (
            <DisabledReason id="plan-import-reason">
              Solo puedes importar sobre un plan en borrador o devuelto.
            </DisabledReason>
          ) : null}
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => void handleImportFileChange(event)}
        />
      </div>
    );
  }

  if (forbidden) {
    return (
      <PageLayout>
        <PageHeader title={TITLE} description={PLAN_DESCRIPTION} />
        <InlineNotice
          tone="neutral"
          title="Esta pantalla no está disponible para tu rol."
          action={
            allowedModules.has('assigned') ? (
              <Link href="/mi-trabajo" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Ir a Mi trabajo
              </Link>
            ) : undefined
          }
        >
          <p className="text-muted-foreground">
            Planificar fases y tareas corresponde al jefe de área y a los líderes de proceso. Tus
            tareas asignadas están en Mi trabajo.
          </p>
        </InlineNotice>
      </PageLayout>
    );
  }

  let content: React.ReactNode;
  if (requestsState === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  } else if (requestsState === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar las solicitudes."
          message={requestsError}
          onRetry={() => void loadRequests()}
        />
      </div>
    );
  } else if (requests.length === 0) {
    content = (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={ClipboardList}
          title="No hay solicitudes comprometidas, en planificación o en ejecución en tu alcance."
          description="Una solicitud llega aquí cuando se aprueba su compromiso en Aprobaciones."
        />
      </div>
    );
  } else {
    content = (
      <>
        <RequestContextBar
          id="plan-request"
          requests={requests}
          value={selectedId}
          onValueChange={handlePick}
          groups={GROUPS}
          summary={
            plan && planState === 'success' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-meta text-muted-foreground">Estado del plan</span>
                <StatusBadge kind="plan" value={plan.status} />
              </div>
            ) : null
          }
          actions={
            selected && allowedModules.has('requests') ? (
              <Link
                href={`/demanda/solicitudes/${encodeURIComponent(selected.id)}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ver ficha completa
              </Link>
            ) : null
          }
        />
        {notice ? <InlineNotice tone="info">{notice}</InlineNotice> : null}
        {selected ? (
          // eslint-disable-next-line react-hooks/refs -- falso positivo: la función solo lee el ref dentro de un manejador o callback, nunca durante el render.
          renderPlan()
        ) : (
          <RequestInbox
            requests={requests}
            groups={GROUPS}
            show={['state', 'priority', 'registered']}
            onPick={handlePick}
          />
        )}
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={TITLE} description={PLAN_DESCRIPTION} />
      {content}

      {plan ? (
        <>
          <PhaseDialog
            open={phaseDialog.open}
            phase={phaseDialog.phase}
            planId={plan.id}
            onOpenChange={(open) => setPhaseDialog((prev) => ({ ...prev, open }))}
            onSaved={() => {
              setPhaseDialog({ open: false, phase: null });
              void refreshPlanData();
            }}
          />
          <Sheet open={detailTaskId !== null} onOpenChange={(open) => !open && setDetailTaskId(null)}>
            <SheetContent
              side="right"
              closeLabel="Cerrar detalle"
              className="w-[36rem] max-w-[95vw] gap-4 overflow-y-auto bg-background p-5"
            >
              <SheetTitle className="pr-10">
                {tasks.find((t) => t.id === detailTaskId)?.title ?? 'Detalle de la tarea'}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Detalle de la tarea: estado, predecesoras y evidencia.
              </SheetDescription>
              {detailTaskId ? (
                <TaskDetail
                  key={detailTaskId}
                  taskId={detailTaskId}
                  embedded
                  onSelectTask={setDetailTaskId}
                  onChanged={() => void refreshPlanData()}
                />
              ) : null}
            </SheetContent>
          </Sheet>
          <TaskDialog
            open={taskDialog.open}
            task={taskDialog.task}
            phaseId={taskDialog.phaseId}
            allTasks={tasks}
            phases={phases}
            onOpenChange={(open) => setTaskDialog((prev) => ({ ...prev, open }))}
            onSaved={() => {
              setTaskDialog({ open: false, task: null, phaseId: null });
              void refreshPlanData();
            }}
          />
          <ConfirmDialog
            open={submitOpen}
            onOpenChange={setSubmitOpen}
            tone="default"
            title="¿Enviar el plan a autorización?"
            description="Mientras esté en autorización no podrás editar fases ni tareas."
            confirmLabel="Enviar a autorización"
            onConfirm={handleSubmitPlan}
          />
          <ConfirmDialog
            open={phaseConfirmOpen}
            onOpenChange={setPhaseConfirmOpen}
            title={`¿Eliminar la fase «${phaseToDelete?.name ?? ''}»?`}
            description="Esta acción no se puede deshacer."
            confirmLabel="Eliminar fase"
            onConfirm={async () => {
              if (phaseToDelete) await handleDeletePhase(phaseToDelete);
            }}
            returnFocusTo={returnFocusToPhases}
          />
          <ConfirmDialog
            open={importConfirmOpen}
            onOpenChange={setImportConfirmOpen}
            tone="danger"
            title="¿Importar y reemplazar el plan?"
            description="Importar reemplaza las fases, tareas y dependencias actuales por las del archivo. Esta acción no se puede deshacer."
            confirmLabel="Importar y reemplazar"
            onConfirm={handleImportPlan}
          />
          <ConfirmDialog
            open={taskConfirmOpen}
            onOpenChange={setTaskConfirmOpen}
            title={`¿Eliminar la tarea «${taskToDelete?.title ?? ''}»?`}
            description="Esta acción no se puede deshacer. Si otra tarea depende de esta, no se podrá eliminar."
            confirmLabel="Eliminar tarea"
            onConfirm={async () => {
              if (taskToDelete) await handleDeleteTask(taskToDelete);
            }}
            returnFocusTo={returnFocusToTasks}
          />
        </>
      ) : null}
    </PageLayout>
  );
}
