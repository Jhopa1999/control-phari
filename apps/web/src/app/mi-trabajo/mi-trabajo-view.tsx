'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CircleCheck, ListChecks, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { ResultCount } from '@/components/data-table';
import { SearchInput, Toolbar } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { MyWorkItem, Task, TaskStatus } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { formatPercent } from '@/lib/format';
import { createLocalPrefStore } from '@/lib/local-pref-store';
import {
  countMyWork,
  groupMyWork,
  isProjectClosed,
  MY_WORK_GROUP_ORDER,
  type MyWorkGroupKey,
} from '@/lib/my-work-groups';
import { boardColumns } from '@/lib/my-work-board';
import { listMyWork } from '@/lib/my-work';
import { matchesSearch } from '@/lib/table-sort';
import { listTaskEvidence } from '@/lib/task-evidence';
import { TASK_STATUSES, taskStatusLabel } from '@/lib/tasks';
import { useMyWorkView, type MyWorkView } from '@/lib/use-my-work-view';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useTodayLocal } from '@/lib/use-today-local';
import { BlockReasonDialog } from '../seguimiento/plan/block-reason-dialog';
import { useInlineTaskActions } from '../seguimiento/plan/use-inline-task-actions';
import { TaskDetail } from '../seguimiento/tareas/task-detail';
import { CLOSED_PROJECT_REASON } from './mi-trabajo-chips';
import {
  COUNTERS,
  CounterCard,
  GROUP_META,
  GroupSection,
  type CounterKey,
  type RowActions,
} from './mi-trabajo-parts';
import { findControl, focusControl, restoreFocus, type FocusTarget } from './mi-trabajo-focus';
import { boardHeadingId, boardTabId, columnLabel, MyWorkBoard } from './my-work-board';

type LoadState = 'loading' | 'success' | 'error';

/** Centinela de «Todos» en el filtro de estado. */
const ALL = 'ALL';
const NOUN = { one: 'tarea', other: 'tareas' };
/** Identificador de tarea admitido en ?taskId= (cualquier otra cosa se ignora). */
const VALID_TASK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PENDING_GROUPS = MY_WORK_GROUP_ORDER.filter((key) => key !== 'done' && key !== 'closed');
/** Vistas del conmutador. */
const VIEW_OPTIONS: { value: MyWorkView; label: string }[] = [
  { value: 'lista', label: 'Lista' },
  { value: 'tablero', label: 'Tablero' },
];

// Pliegue de «Terminadas»: colapsada por defecto, se recuerda en localStorage.
const DONE_PREF_KEY = 'miTrabajoTerminadasAbierto';
type DonePref = 'abierto' | 'cerrado';
const donePrefStore = createLocalPrefStore<DonePref>(
  () => {
    try {
      return window.localStorage.getItem(DONE_PREF_KEY) === 'abierto' ? 'abierto' : 'cerrado';
    } catch {
      return 'cerrado';
    }
  },
  (value) => {
    try {
      window.localStorage.setItem(DONE_PREF_KEY, value);
    } catch {
      // Sin almacenamiento: la elección vive en memoria hasta recargar.
    }
  },
  'cerrado',
);

// Pliegue de «De proyectos cerrados»: plegado por defecto, se recuerda en localStorage.
const CLOSED_PREF_KEY = 'miTrabajoCerradosAbierto';
const closedPrefStore = createLocalPrefStore<DonePref>(
  () => {
    try {
      return window.localStorage.getItem(CLOSED_PREF_KEY) === 'abierto' ? 'abierto' : 'cerrado';
    } catch {
      return 'cerrado';
    }
  },
  (value) => {
    try {
      window.localStorage.setItem(CLOSED_PREF_KEY, value);
    } catch {
      // Sin almacenamiento: la elección vive en memoria hasta recargar.
    }
  },
  'cerrado',
);

/** Cómo queda un elemento de Mi trabajo tras cambiar estado o avance (incluye el motivo). */
function mergeMyWork(item: MyWorkItem, updated: Task): MyWorkItem {
  return {
    ...item,
    status: updated.status,
    progress: updated.progress,
    blockedReason: updated.blockedReason,
  };
}

function hasEvidenceNote(evidenceUrl: string | null | undefined): boolean {
  return Boolean(evidenceUrl && evidenceUrl.trim() !== '');
}

/**
 * Mi trabajo, «Mi día»: tareas del actor agrupadas por urgencia (función pura
 * `groupMyWork`), contadores-interruptor, terminadas plegadas y estado/avance
 * editables en la propia fila (hook compartido con Planificación). El agrupamiento
 * es presentación; el backend manda en permisos y transiciones (403/409).
 */
export function MiTrabajoView(): React.ReactElement {
  const { actorId, allowedModules } = useActor();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = useTodayLocal();
  const canOpenRequest = allowedModules.has('requests');

  const [items, setItems] = React.useState<MyWorkItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState(ALL);
  const [counter, setCounter] = React.useState<CounterKey | null>(null);
  const [expandedGroups, setExpandedGroups] = React.useState<ReadonlySet<MyWorkGroupKey>>(new Set());
  const [keepVisibleId, setKeepVisibleId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  // Panel lateral: la URL (?taskId=) manda; estos estados solo recuerdan cómo se abrió.
  const [openedFromList, setOpenedFromList] = React.useState(false);
  const [returnFocusId, setReturnFocusId] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const pendingFocus = React.useRef<FocusTarget | null>(null);
  // Destino del foco tras confirmar el diálogo de motivo (se aplica al cerrarse).
  const blockFocus = React.useRef<FocusTarget | null>(null);
  const [boardExpanded, setBoardExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const [blockAnchorId, setBlockAnchorId] = React.useState<string | null>(null);
  const { view, setView } = useMyWorkView();
  const boardMode = view === 'tablero';
  const donePref = React.useSyncExternalStore(
    donePrefStore.subscribe,
    donePrefStore.getSnapshot,
    donePrefStore.getServerSnapshot,
  );
  const closedPref = React.useSyncExternalStore(
    closedPrefStore.subscribe,
    closedPrefStore.getSnapshot,
    closedPrefStore.getServerSnapshot,
  );

  const fetchItems = React.useCallback(() => {
    return listMyWork()
      .then((data) => {
        setItems(data);
        setState('success');
        setRefreshFailed(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : null;
        setErrorMessage(message);
        setRefreshFailed(true);
        // Con datos ya cargados se conservan; sin ellos se muestra el error.
        setState((prev) => (prev === 'success' ? 'success' : 'error'));
        toast.error(message ?? 'No se pudo actualizar. Revisa tu conexión e inténtalo de nuevo.');
      });
  }, []);

  const refresh = React.useCallback(() => {
    if (state !== 'success') setState('loading');
    setRefreshing(true);
    void fetchItems().finally(() => setRefreshing(false));
  }, [fetchItems, state]);

  // Al cambiar de usuario se vuelve a mostrar la carga y se recarga.
  useResetOnChange([actorId], () => setState('loading'));
  React.useEffect(() => {
    void fetchItems();
  }, [fetchItems, actorId]);

  // --- Derivados (solo con «hoy» ya conocido: en servidor/hidratación es '') ---
  const ready = state === 'success' && today !== '';
  const allGroups = React.useMemo(
    () => (ready ? groupMyWork(items, today) : null),
    [ready, items, today],
  );
  const counts = React.useMemo(
    () => (ready ? countMyWork(items, today) : { overdue: 0, today: 0, inProgress: 0, blocked: 0 }),
    [ready, items, today],
  );

  // El contador activo se apaga solo cuando su propio conteo llega a 0.
  const counterEmpty = counter !== null && counts[counter] === 0;
  useResetOnChange([counterEmpty], () => {
    if (counterEmpty) setCounter(null);
  });

  const filteredItems = React.useMemo(() => {
    if (!allGroups) return [] as MyWorkItem[];
    const counterIds: Set<string> | null =
      counter === 'overdue'
        ? new Set(allGroups.overdue.map((i) => i.taskId))
        : counter === 'today'
          ? new Set(allGroups.today.map((i) => i.taskId))
          : null;
    return items.filter((item) => {
      if (!matchesSearch(item.title, query)) return false;
      if (status !== ALL && item.status !== status) return false;
      if (counterIds && !counterIds.has(item.taskId)) return false;
      if (counter === 'inProgress' && item.status !== 'EN_CURSO') return false;
      if (counter === 'blocked' && item.status !== 'BLOQUEADA') return false;
      return true;
    });
  }, [allGroups, items, query, status, counter]);

  const boardItems = React.useMemo(() => boardColumns(filteredItems), [filteredItems]);

  const groups = React.useMemo(
    () => (ready ? groupMyWork(filteredItems, today) : null),
    [ready, filteredItems, today],
  );

  const hasFilters = query.trim() !== '' || status !== ALL || counter !== null;
  const doneForcedOpen = query.trim() !== '' || status === 'TERMINADA';
  const doneOpen = doneForcedOpen || donePref === 'abierto';
  const closedForcedOpen = query.trim() !== '';
  const closedOpen = closedForcedOpen || closedPref === 'abierto';

  // --- Acciones en línea ---
  const announce = React.useCallback((message: string) => setAnnouncement(message), []);

  const inline = useInlineTaskActions<MyWorkItem>({
    setItems,
    getId: (item) => item.taskId,
    merge: mergeMyWork,
    onStatusError: (message) => {
      toast.error(message);
      announce(message);
    },
  });

  /** Grupo de una tarea ya actualizada, para decir dónde quedó. */
  function groupLabelOf(item: MyWorkItem): string {
    if (boardMode) return `la columna ${columnLabel(item.status)}`
    const g = groupMyWork([item], today);
    const key = MY_WORK_GROUP_ORDER.find((k) => g[k].length > 0) ?? 'noDate';
    return GROUP_META[key].title;
  }

  function focusTargetFor(item: MyWorkItem, control: string): FocusTarget | null {
    if (boardMode) {
      // Tablero: la columna de origen manda (en móvil, su pestaña).
      const list = boardItems.find((c) => c.key === item.status)?.items ?? [];
      const index = list.findIndex((i) => i.taskId === item.taskId);
      if (index < 0) return null;
      return {
        taskId: item.taskId,
        control,
        fallbackIds: list.slice(index + 1).map((i) => i.taskId),
        headingIds: [boardHeadingId(item.status), boardTabId(item.status)],
      };
    }
    if (!groups) return null;
    const originKey = MY_WORK_GROUP_ORDER.find((k) => groups[k].some((i) => i.taskId === item.taskId));
    if (!originKey) return null;
    const list = groups[originKey];
    const index = list.findIndex((i) => i.taskId === item.taskId);
    return {
      taskId: item.taskId,
      control,
      fallbackIds: list.slice(index + 1).map((i) => i.taskId),
      headingIds: [`mt-h-${originKey}`],
    };
  }

  /** Marca dónde debe quedar el foco al terminar la acción (regla única de foco). */
  function planFocus(item: MyWorkItem, control: string): void {
    pendingFocus.current = focusTargetFor(item, control);
  }

  async function runStatus(
    item: MyWorkItem,
    next: TaskStatus,
    control: string,
    restoreProgress?: number,
  ): Promise<void> {
    const adjustTo100 = next === 'TERMINADA' && item.progress < 100;
    const extra =
      restoreProgress !== undefined ? { progress: restoreProgress } : adjustTo100 ? { progress: 100 } : undefined;
    planFocus(item, control);
    const updated = await inline.changeStatus(item, next, extra);
    if (!updated) return;

    const merged: MyWorkItem = { ...item, status: updated.status, progress: updated.progress };
    const where = groupLabelOf(merged);
    const title = item.title;
    if (next === 'TERMINADA') {
      const text = adjustTo100
        ? `“${title}” terminada. Avance ajustado a 100 %.`
        : `“${title}” terminada.`;
      toast.success(text, {
        duration: 8000,
        action: {
          label: 'Reabrir',
          onClick: () => void runStatus(merged, 'EN_CURSO', 'title', adjustTo100 ? item.progress : undefined),
        },
      });
    } else if (next === 'EN_REVISION') {
      toast.success(
        item.progress < 100
          ? `“${title}” enviada a revisión. Avance al ${formatPercent(item.progress)}.`
          : `“${title}” enviada a revisión.`,
      );
    } else if (item.status === 'TERMINADA' && next === 'EN_CURSO') {
      toast.success(`“${title}” vuelve a En curso.`);
    } else {
      toast.success(`Estado actualizado: ${taskStatusLabel(next)}.`);
    }
    announce(`“${title}” pasó a ${taskStatusLabel(next)}. Ahora está en ${where}.`);

    if (next === 'EN_REVISION' || next === 'TERMINADA') {
      void listTaskEvidence(item.taskId)
        .then((files) => {
          if (files.length === 0 && !hasEvidenceNote(updated.evidenceUrl)) {
            toast.warning('Sin evidencia registrada.', {
              action: {
                label: 'Añadir evidencia',
                onClick: () => openPanel(item.taskId),
              },
            });
          }
        })
        .catch(() => {
          // Si la consulta falla no se muestra aviso: no se inventa.
        });
    }
    // Si el destino cae tras el corte de «Ver las N restantes», que siga visible.
    setKeepVisibleId(item.taskId);
  }

  async function runProgress(item: MyWorkItem, value: number): Promise<string | null> {
    const result = await inline.changeProgress(item, value);
    if ('error' in result) return result.error;
    toast.success(`Avance de “${item.title}” actualizado a ${formatPercent(result.task.progress)}.`);
    announce(`Avance de “${item.title}” actualizado a ${formatPercent(result.task.progress)}.`);
    return null;
  }

  // --- Panel lateral (la URL manda: ?taskId=) ---
  const rawTaskId = searchParams.get('taskId');
  const panelTaskId = rawTaskId !== null && VALID_TASK_ID.test(rawTaskId) ? rawTaskId : null;
  const panelItem = panelTaskId ? items.find((i) => i.taskId === panelTaskId) : undefined;

  function openPanel(taskId: string): void {
    setOpenedFromList(true);
    setReturnFocusId(taskId);
    router.push(`${pathname}?taskId=${encodeURIComponent(taskId)}`, { scroll: false });
  }

  function closePanel(): void {
    if (openedFromList) {
      setOpenedFromList(false);
      router.back();
    } else {
      router.replace(pathname, { scroll: false });
    }
  }

  /** Refleja en la lista, sin recargar, el estado y avance cambiados desde el panel. */
  function handleDetailChanged(task: Task): void {
    setItems((prev) =>
      prev.map((i) =>
        i.taskId === task.id ? mergeMyWork(i, task) : i,
      ),
    );
    setKeepVisibleId(task.id);
  }

  function restoreFocusAfterPanel(event: Event): void {
    event.preventDefault();
    if (returnFocusId && focusControl(returnFocusId, 'title')) return;
    const heading = document.querySelector('h1');
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  const actions: RowActions = {
    busyId: inline.rowBusyId,
    onOpen: (item) => openPanel(item.taskId),
    onStatus: (item, next) => {
      // «Marcar como bloqueada» abre antes el diálogo de motivo (hook compartido).
      if (next === 'BLOQUEADA') setBlockAnchorId(item.taskId);
      inline.requestStatus(item, next, (target, to) => {
        const control = to === 'EN_CURSO' || to === 'EN_REVISION' || to === 'TERMINADA' ? 'title' : 'status';
        void runStatus(target, to, control);
      });
    },
    onProgress: runProgress,
  };

  /** Confirma el diálogo de motivo: devuelve el error del servidor o null si salió bien. */
  async function confirmBlock(reason: string): Promise<string | null> {
    const item = inline.blockPrompt;
    if (!item) return 'La tarea ya no está disponible.';
    blockFocus.current = focusTargetFor(item, 'title');
    const result = await inline.tryChangeStatus(item, 'BLOQUEADA', { blockedReason: reason });
    if ('error' in result) return result.error;
    const merged = mergeMyWork(item, result.task);
    toast.success(`“${item.title}” marcada como bloqueada.`);
    announce(`“${item.title}” pasó a Bloqueada. Ahora está en ${groupLabelOf(merged)}.`);
    setKeepVisibleId(item.taskId);
    return null;
  }

  /** Foco de regreso del diálogo si se cancela: el control que lo abrió, aún en pantalla. */
  function blockReturnFocus(): HTMLElement | null {
    if (!blockAnchorId) return null;
    return findControl(blockAnchorId, 'status') ?? findControl(blockAnchorId, 'title');
  }

  /** Tras cerrarse por éxito, el foco sigue a la tarea a su nuevo lugar. */
  function handleBlockClosed(): void {
    const target = blockFocus.current;
    blockFocus.current = null;
    if (target) restoreFocus(target);
  }

  // Restaura el foco si el navegador lo soltó al reordenar filas (regla única de foco).
  React.useEffect(() => {
    const target = pendingFocus.current;
    if (!target || inline.rowBusyId !== null) return;
    pendingFocus.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    restoreFocus(target);
  }, [groups, inline.rowBusyId]);

  /** Cambia entre Lista y Tablero: solo la presentación; en Tablero el filtro de estado no aplica. */
  function changeView(next: MyWorkView): void {
    if (next === view) return;
    const hadStatus = next === 'tablero' && status !== ALL;
    if (hadStatus) setStatus(ALL);
    setView(next);
    announce(
      next === 'lista'
        ? 'Vista Lista.'
        : hadStatus
          ? 'Vista Tablero. Se quitó el filtro de estado.'
          : `Vista Tablero: ${filteredItems.length} tareas en 5 columnas.`
    );
  }

  function clearFilters(): void {
    setQuery('');
    setStatus(ALL);
    setCounter(null);
    // «Limpiar filtros» desaparece al no quedar filtros: el foco pasa a la
    // búsqueda en lugar de perderse (NIT 4, plan D9).
    searchRef.current?.focus();
  }

  function expandGroup(key: MyWorkGroupKey, firstHiddenId: string, hidden: number): void {
    setExpandedGroups((prev) => new Set(prev).add(key));
    announce(`Se muestran ${hidden} tareas más en ${GROUP_META[key].title}.`);
    pendingFocus.current = {
      taskId: firstHiddenId,
      control: 'title',
      fallbackIds: [],
      headingIds: [`mt-h-${key}`],
    };
  }

  function expandColumn(key: string, firstHiddenId: string, hidden: number): void {
    setBoardExpanded((prev) => new Set(prev).add(key));
    announce(`Se muestran ${hidden} tareas más en ${columnLabel(key)}.`);
    pendingFocus.current = {
      taskId: firstHiddenId,
      control: 'title',
      fallbackIds: [],
      headingIds: [boardHeadingId(key)],
    };
  }

  const allDone = ready && items.length > 0 && items.every((i) => i.status === 'TERMINADA');
  const noPending = groups ? PENDING_GROUPS.every((key) => groups[key].length === 0) : true;
  const noResults = ready && items.length > 0 && filteredItems.length === 0;

  let body: React.ReactElement;
  if (state === 'error') {
    body = (
      <div className="rounded-xl bg-card shadow-card">
        <ErrorState title="No fue posible cargar tu trabajo." message={errorMessage} onRetry={refresh} />
      </div>
    );
  } else if (!ready || !groups) {
    body = <MyWorkSkeleton />;
  } else if (items.length === 0) {
    body = (
      <div className="rounded-xl bg-card shadow-card">
        <EmptyState
          icon={ListChecks}
          title="No tienes tareas asignadas."
          description="Las tareas de las que seas responsable aparecerán aquí."
        />
      </div>
    );
  } else {
    body = (
      <>
        <section aria-label="Resumen de tu trabajo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {COUNTERS.map((def) => (
            <CounterCard
              key={def.key}
              def={def}
              value={counts[def.key]}
              active={counter === def.key}
              onToggle={() => setCounter((prev) => (prev === def.key ? null : def.key))}
            />
          ))}
          <p className="sr-only">Los conteos pueden solaparse.</p>
        </section>

        <div className="flex items-center gap-2 sm:justify-end">
          <span id="mt-vista-label" className="text-meta text-muted-foreground">
            Vista
          </span>
          <SegmentedRadio
            id="mt-vista"
            name="mt-vista"
            labelledBy="mt-vista-label"
            options={VIEW_OPTIONS}
            value={view}
            onValueChange={(value) => changeView(value as MyWorkView)}
            optionClassName="max-md:h-11 max-md:min-w-20 pointer-coarse:h-11 pointer-coarse:min-w-20"
          />
        </div>

        {refreshFailed ? (
          <InlineNotice
            tone="warning"
            role="status"
            action={
              <Button type="button" variant="outline" size="sm" onClick={refresh}>
                Reintentar
              </Button>
            }
          >
            No se pudo actualizar. Mostrando los datos de la última carga.
          </InlineNotice>
        ) : null}

        <Toolbar
          label="Filtros de mi trabajo"
          collapseOnMobile
          end={
            <>
              <ResultCount loading={false} total={items.length} filtered={filteredItems.length} noun={NOUN} />
              {hasFilters ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              ) : null}
            </>
          }
        >
          <SearchInput
            ref={searchRef}
            id="mt-buscar"
            placeholder="Título de la tarea"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {boardMode ? null : (
          <div className="grid w-full gap-1.5 sm:w-auto">
            <Label htmlFor="mt-filtro-estado">Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="mt-filtro-estado" className="w-full sm:w-44">
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
          )}
        </Toolbar>

        {noResults ? (
          <div className="rounded-xl bg-card shadow-card">
            <EmptyState
              icon={ListChecks}
              title="Ninguna tarea coincide con los filtros."
              description="Prueba con otra búsqueda o quita un filtro."
              action={
                <Button type="button" variant="outline" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {allDone && !hasFilters && noPending ? (
              <div className="rounded-xl bg-card shadow-card">
                <EmptyState
                  icon={CircleCheck}
                  size="compact"
                  title="Estás al día: no tienes tareas pendientes."
                />
              </div>
            ) : null}
            {boardMode ? (
              <MyWorkBoard
                items={filteredItems}
                today={today}
                actions={actions}
                filtered={hasFilters}
                keepVisibleId={keepVisibleId}
                expanded={boardExpanded}
                onExpand={expandColumn}
              />
            ) : null}
            {boardMode ? null : PENDING_GROUPS.map((key) =>
              groups[key].length > 0 ? (
                <GroupSection
                  key={key}
                  groupKey={key}
                  items={groups[key]}
                  today={today}
                  canOpenRequest={canOpenRequest}
                  actions={actions}
                  expanded={expandedGroups.has(key)}
                  keepVisibleId={keepVisibleId}
                  onExpand={expandGroup}
                />
              ) : null,
            )}
            {!boardMode && groups.done.length > 0 ? (
              <GroupSection
                groupKey="done"
                items={groups.done}
                today={today}
                canOpenRequest={canOpenRequest}
                actions={actions}
                expanded={expandedGroups.has('done')}
                keepVisibleId={keepVisibleId}
                onExpand={expandGroup}
                open={doneOpen}
                foldable={!doneForcedOpen}
                onToggleOpen={() => donePrefStore.set(donePref === 'abierto' ? 'cerrado' : 'abierto')}
              />
            ) : null}
            {!boardMode && groups.closed.length > 0 ? (
              <GroupSection
                groupKey="closed"
                items={groups.closed}
                today={today}
                canOpenRequest={canOpenRequest}
                actions={actions}
                expanded={expandedGroups.has('closed')}
                keepVisibleId={keepVisibleId}
                onExpand={expandGroup}
                open={closedOpen}
                foldable={!closedForcedOpen}
                onToggleOpen={() => closedPrefStore.set(closedPref === 'abierto' ? 'cerrado' : 'abierto')}
              />
            ) : null}
          </div>
        )}
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Mi trabajo"
        description="Tus tareas ordenadas por urgencia: lo vencido y lo de hoy primero."
        actions={
          <Button type="button" variant="outline" loading={refreshing} onClick={refresh}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        }
      />
      <p role="status" aria-live="polite" className="sr-only">
        {state === 'loading' || (state === 'success' && today === '') ? 'Cargando tus tareas…' : announcement}
      </p>
      <div className="@container flex flex-col gap-4" aria-busy={state === 'loading' || undefined}>
        {body}
      </div>
      <Sheet open={panelTaskId !== null} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent
          side="right"
          closeLabel="Cerrar detalle"
          closeClassName="max-md:min-h-11 max-md:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          className="w-[40rem] max-w-full gap-4 overflow-y-auto bg-background p-5"
          onCloseAutoFocus={restoreFocusAfterPanel}
        >
          <SheetTitle className="pr-10">{panelItem?.title ?? 'Detalle de la tarea'}</SheetTitle>
          <SheetDescription className="sr-only">
            Detalle de la tarea: estado, avance, historial de cambios, predecesoras y evidencia.
          </SheetDescription>
          {panelTaskId ? (
            <TaskDetail
              key={panelTaskId}
              taskId={panelTaskId}
              embedded
              readOnlyReason={panelItem && isProjectClosed(panelItem) ? CLOSED_PROJECT_REASON : undefined}
              onSelectTask={(id) =>
                router.replace(`${pathname}?taskId=${encodeURIComponent(id)}`, { scroll: false })
              }
              onChanged={handleDetailChanged}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <BlockReasonDialog
        open={inline.blockPrompt !== null}
        taskTitle={inline.blockPrompt?.title ?? ''}
        onOpenChange={(open) => {
          if (!open) inline.closeBlockPrompt();
        }}
        onConfirm={confirmBlock}
        onClosedAfterSuccess={handleBlockClosed}
        returnFocusTo={blockReturnFocus}
      />
    </PageLayout>
  );
}

/** Esqueleto de carga: 4 contadores y dos grupos con tres filas. */
function MyWorkSkeleton(): React.ReactElement {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {[0, 1].map((g) => (
        <div key={g} className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((r) => (
            <Skeleton key={r} className="h-14" />
          ))}
        </div>
      ))}
    </>
  );
}
