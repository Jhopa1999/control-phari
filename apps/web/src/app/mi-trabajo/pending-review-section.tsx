'use client';

import * as React from 'react';
import { AlarmClock, Check, CircleAlert, CircleCheck, Clock, ClipboardCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { IdChip } from '@/components/id-chip';
import { InlineNotice } from '@/components/inline-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import type { BatchApprovalResult } from '@/lib/api-client';
import { formatDateOnly, formatPercent } from '@/lib/format';
import {
  MAX_TASK_BATCH,
  batchApproveTasks,
  listPendingReview,
  waitingInfo,
  type PendingReviewItem,
  type PendingReviewList,
} from '@/lib/pending-review';
import { PlanError } from '@/lib/plan';
import { dueLabel, taskDueInfo } from '@/lib/task-due';
import { updateTaskStatus } from '@/lib/tasks';
import { useTodayLocal } from '@/lib/use-today-local';
import { cn } from '@/lib/utils';
import { focusControl } from './mi-trabajo-focus';

type LoadState = 'loading' | 'success' | 'error';

/** Filas visibles antes de «Ver las N restantes». */
export const PENDING_REVIEW_LIMIT = 5;
export const PENDING_REVIEW_ANCHOR = 'por-aprobar';
const HEADING_ID = 'por-aprobar-titulo';

const TOUCH = 'max-sm:min-h-11 pointer-coarse:min-h-11';

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

export interface PendingReviewSectionProps {
  /** Tareas propias del actor en revisión (el pie aclara que se terminan desde su lista). */
  ownInReview: number;
  /** Abre el panel lateral con el detalle de la tarea. */
  onOpen: (taskId: string) => void;
  /** Mensaje para la región viva de la página. */
  announce: (message: string) => void;
  /** Informa el total real de la cola (null mientras carga o si falló) para el encabezado plegable. */
  onTotalChange?: (total: number | null) => void;
}

/**
 * «Por aprobar»: cola de tareas En revisión de tu alcance para jefes de área y
 * líderes de proceso (solo se monta para quien puede aprobar). Aprobar pasa la
 * tarea a Terminada y Devolver a En curso; el backend decide (403/409) y su
 * mensaje se muestra tal cual. Independiente de Lista/Tablero y de los filtros.
 */
export function PendingReviewSection({
  ownInReview,
  onOpen,
  announce,
  onTotalChange,
}: PendingReviewSectionProps): React.ReactElement {
  const { actorId } = useActor();
  const today = useTodayLocal();
  // «Ahora» se fija al montar: el chip de espera no necesita segundos.
  const [now] = React.useState(() => new Date());
  const [list, setList] = React.useState<PendingReviewList | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [busyTo, setBusyTo] = React.useState<'TERMINADA' | 'EN_CURSO' | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const sectionRef = React.useRef<HTMLElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // Destino del foco tras quitar o revelar filas: id de tarea o 'heading'.
  const focusAfter = React.useRef<string | 'heading' | null>(null);
  const anchorHandled = React.useRef(false);
  // Selección múltiple para aprobar en lote.
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchResult, setBatchResult] = React.useState<BatchApprovalResult | null>(null);
  const batchButtonRef = React.useRef<HTMLButtonElement>(null);
  const resultRef = React.useRef<HTMLDivElement>(null);
  // El notificador del padre puede cambiar de identidad en cada render: se guarda en un ref.
  const onTotalRef = React.useRef(onTotalChange);
  React.useEffect(() => {
    onTotalRef.current = onTotalChange;
  });

  React.useEffect(() => {
    let active = true;
    listPendingReview()
      .then((result) => {
        if (!active) return;
        setList(result);
        setState('success');
        onTotalRef.current?.(result.total);
        announce(`Por aprobar: ${result.total} ${result.total === 1 ? 'tarea' : 'tareas'}.`);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMessage(messageOf(err));
        setState('error');
        onTotalRef.current?.(null);
      });
    return () => {
      active = false;
    };
  }, [actorId, attempt, announce]);


  // Llegada desde el Panel (/mi-trabajo#por-aprobar): al salir de la carga, desplaza y enfoca el título.
  React.useEffect(() => {
    if (state === 'loading' || anchorHandled.current) return;
    anchorHandled.current = true;
    if (window.location.hash !== `#${PENDING_REVIEW_ANCHOR}`) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sectionRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    headingRef.current?.focus({ preventScroll: true });
  }, [state]);

  // Foco tras quitar o revelar filas (regla: fila siguiente → anterior → encabezado).
  React.useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === 'heading' || !focusControl(target, 'title')) headingRef.current?.focus();
  }, [list, expanded]);

  function retry(): void {
    setState('loading');
    setErrorMessage(null);
    setAttempt((value) => value + 1);
  }

  function reload(): void {
    setAttempt((value) => value + 1);
  }

  async function reopen(item: PendingReviewItem): Promise<void> {
    try {
      await updateTaskStatus(item.id, { status: 'EN_CURSO' });
      toast.success(`“${item.title}” vuelve a En curso.`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function resolve(item: PendingReviewItem, to: 'TERMINADA' | 'EN_CURSO'): Promise<void> {
    if (!list || busyId !== null) return;
    const index = list.items.findIndex((i) => i.id === item.id);
    const neighbour = list.items[index + 1] ?? list.items[index - 1];
    setBusyId(item.id);
    setBusyTo(to);
    try {
      await updateTaskStatus(item.id, { status: to });
    } catch (err) {
      const message = messageOf(err);
      toast.error(message);
      announce(message);
      // Otro líder pudo resolverla antes: se vuelve a leer la cola.
      if (err instanceof PlanError && (err.status === 409 || err.status === 404)) reload();
      setBusyId(null);
      setBusyTo(null);
      return;
    }
    focusAfter.current = neighbour ? neighbour.id : 'heading';
    const remaining = Math.max(0, list.total - 1);
    setList({ total: remaining, items: list.items.filter((i) => i.id !== item.id) });
    onTotalRef.current?.(remaining);
    setBusyId(null);
    setBusyTo(null);
    if (to === 'TERMINADA') {
      toast.success(`“${item.title}” aprobada. Quedó terminada.`, {
        duration: 8000,
        action: { label: 'Reabrir', onClick: () => void reopen(item) },
      });
      announce(`“${item.title}” aprobada. Quedan ${remaining} por aprobar.`);
    } else {
      toast.success(`“${item.title}” devuelta a En curso. El responsable la verá en su lista.`);
      announce(`“${item.title}” devuelta a En curso. Quedan ${remaining} por aprobar.`);
    }
  }

  const items = list?.items ?? [];
  const visible = expanded ? items : items.slice(0, PENDING_REVIEW_LIMIT);
  const hidden = items.length - visible.length;
  const ready = state === 'success' && list !== null && today !== '';
  // Una tarea que ya no está en la cola (resuelta por otro) deja de contar aunque su id siga en selected.
  const selectedItems = items.filter((i) => selected.has(i.id));
  const selectedCount = selectedItems.length;
  const atLimit = selectedCount >= MAX_TASK_BATCH;
  const selectableIds = visible.slice(0, MAX_TASK_BATCH).map((i) => i.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const taskNoun = (n: number): string => (n === 1 ? 'tarea' : 'tareas');

  function toggleSelected(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleBatchApprove(): Promise<void> {
    const ids = selectedItems.map((i) => i.id);
    if (ids.length === 0) return;
    setBatchBusy(true);
    setBatchResult(null);
    try {
      const result = await batchApproveTasks(ids);
      setSelected(new Set());
      setBatchResult(result);
      if (result.approved === 0) {
        toast.warning('No se aprobó ninguna tarea.');
      } else if (result.skipped > 0) {
        toast.warning(
          `${result.approved} ${taskNoun(result.approved)} ${result.approved === 1 ? 'aprobada' : 'aprobadas'}; ${result.skipped} omitida(s).`,
        );
      } else {
        toast.success(
          `${result.approved} ${taskNoun(result.approved)} ${result.approved === 1 ? 'aprobada y terminada' : 'aprobadas y terminadas'}.`,
        );
      }
      announce(`Lote: ${result.approved} aprobada(s), ${result.skipped} omitida(s).`);
      reload();
      requestAnimationFrame(() => requestAnimationFrame(() => resultRef.current?.focus()));
    } catch (err) {
      // La selección se conserva para reintentar.
      toast.error(messageOf(err));
      requestAnimationFrame(() => batchButtonRef.current?.focus());
    } finally {
      setBatchBusy(false);
    }
  }

  let body: React.ReactElement;
  if (state === 'error') {
    body = (
      <div className="px-4 pb-4 @[920px]:pt-4">
        <InlineNotice
          tone="danger"
          role="alert"
          action={
            <Button type="button" variant="outline" size="sm" className={TOUCH} onClick={retry}>
              Reintentar
            </Button>
          }
        >
          {errorMessage
            ? `No se pudieron cargar las tareas por aprobar. ${errorMessage}`
            : 'No se pudieron cargar las tareas por aprobar.'}
        </InlineNotice>
      </div>
    );
  } else if (!ready) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        <p role="status" className="sr-only">
          Cargando las tareas por aprobar…
        </p>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={CircleCheck}
        size="compact"
        title="No hay tareas por aprobar"
        description="Cuando alguien envíe una tarea a revisión, aparecerá aquí."
      />
    );
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm max-sm:min-h-11">
            <Checkbox
              checked={allSelected}
              disabled={batchBusy}
              onChange={(event) =>
                setSelected(event.target.checked ? new Set(selectableIds) : new Set())
              }
              data-testid="por-aprobar-todas"
            />
            Seleccionar todas
            {selectableIds.length === MAX_TASK_BATCH ? ` (hasta ${MAX_TASK_BATCH})` : ''}
          </label>
          {selectedCount > 0 ? (
            <div
              role="region"
              aria-label="Acciones sobre la selección"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-sm font-medium" aria-live="polite" aria-atomic="true">
                {selectedCount} {selectedCount === 1 ? 'seleccionada' : 'seleccionadas'}
                {atLimit ? ` · máximo ${MAX_TASK_BATCH}` : ''}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={TOUCH}
                disabled={batchBusy}
                onClick={() => setSelected(new Set())}
              >
                Limpiar selección
              </Button>
              <Button
                ref={batchButtonRef}
                type="button"
                size="sm"
                className={TOUCH}
                disabled={batchBusy}
                onClick={() => setBatchOpen(true)}
              >
                <Check aria-hidden="true" />
                Aprobar {selectedCount} {taskNoun(selectedCount)}
              </Button>
            </div>
          ) : null}
        </div>
        {batchResult ? (
          <div
            ref={resultRef}
            tabIndex={-1}
            className="px-4 pb-2 outline-none"
            data-testid="por-aprobar-resultado"
          >
            <InlineNotice
              tone={batchResult.skipped === 0 ? 'success' : 'warning'}
              role="status"
              title={`${batchResult.approved} ${taskNoun(batchResult.approved)} ${batchResult.approved === 1 ? 'aprobada' : 'aprobadas'}${batchResult.skipped > 0 ? ` · ${batchResult.skipped} omitida(s)` : ''}`}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={TOUCH}
                  onClick={() => setBatchResult(null)}
                >
                  Cerrar aviso
                </Button>
              }
            >
              {batchResult.skipped > 0 ? (
                <ul className="mt-2 grid gap-1.5 text-sm">
                  {batchResult.results
                    .filter((r) => r.status === 'OMITIDA')
                    .map((r) => (
                      <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                        {r.code ? <IdChip code={r.code} /> : null}
                        <span>{r.reason}</span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </InlineNotice>
          </div>
        ) : null}
        <ul className="flex flex-col gap-3 @[920px]:gap-0">
          {visible.map((item) => (
            <PendingReviewRow
              key={item.id}
              item={item}
              now={now}
              today={today}
              selected={selected.has(item.id)}
              selectDisabled={batchBusy || (atLimit && !selected.has(item.id))}
              onSelect={(checked) => toggleSelected(item.id, checked)}
              busyTo={busyId === item.id ? busyTo : null}
              anyBusy={busyId !== null || batchBusy}
              onOpen={onOpen}
              onResolve={(to) => void resolve(item, to)}
            />
          ))}
        </ul>
        {hidden > 0 ? (
          <div className="px-4 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={TOUCH}
              onClick={() => {
                focusAfter.current = items[visible.length].id;
                setExpanded(true);
                announce(`Se muestran ${hidden} tareas más por aprobar.`);
              }}
            >
              Ver las {hidden} restantes
            </Button>
          </div>
        ) : null}
        {list && list.total > items.length ? (
          <p className="px-4 py-2 text-meta text-muted-foreground">
            Se muestran las {items.length} que más esperan. Hay {list.total} por aprobar.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section
      ref={sectionRef}
      id={PENDING_REVIEW_ANCHOR}
      aria-labelledby={HEADING_ID}
      aria-busy={state === 'loading' || undefined}
      className="scroll-mt-20 @[920px]:overflow-hidden @[920px]:rounded-xl @[920px]:bg-card @[920px]:shadow-card"
    >
      <div className="flex flex-col gap-1 px-4 py-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 shrink-0 text-foreground" aria-hidden="true" />
          <h2
            ref={headingRef}
            id={HEADING_ID}
            tabIndex={-1}
            className="font-heading text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Por aprobar
          </h2>
          {ready && list ? (
            <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {list.total}
              <span className="sr-only">{list.total === 1 ? ' tarea' : ' tareas'}</span>
            </span>
          ) : null}
        </div>
        <p className="text-meta text-muted-foreground">
          Tareas de tu alcance que esperan tu decisión. Las que llevan más tiempo, primero.
        </p>
      </div>
      <div className="@[920px]:border-t">{body}</div>
      {ready && ownInReview > 0 ? (
        <p className="px-4 pb-3 text-meta text-muted-foreground">
          Tus propias tareas en revisión están en tu lista: ahí las terminas con «Terminar».
        </p>
      ) : null}
      <ConfirmDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        title={`¿Aprobar ${selectedCount} ${taskNoun(selectedCount)}?`}
        description="Quedarán terminadas. Cada una se aprueba por separado: si alguna ya cambió de estado, se omite y las demás sí se aprueban."
        confirmLabel={`Aprobar ${selectedCount} ${taskNoun(selectedCount)}`}
        tone="default"
        busy={batchBusy}
        onConfirm={handleBatchApprove}
        returnFocusTo={() => batchButtonRef.current ?? headingRef.current}
      >
        <ul
          aria-label="Tareas que se aprobarán"
          className="grid max-h-64 min-w-0 gap-2 overflow-y-auto rounded-lg bg-muted/50 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          data-testid="por-aprobar-resumen"
          tabIndex={0}
        >
          {selectedItems.map((item) => (
            <li key={item.id} className="grid min-w-0 gap-1 rounded-md bg-card p-2.5">
              <IdChip code={item.code} copyable={false} />
              <p className="line-clamp-2 break-words text-sm font-medium">{item.title}</p>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </section>
  );
}

interface PendingReviewRowProps {
  item: PendingReviewItem;
  now: Date;
  today: string;
  /** Acción en curso sobre esta fila, o null. */
  busyTo: 'TERMINADA' | 'EN_CURSO' | null;
  anyBusy: boolean;
  selected: boolean;
  selectDisabled: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: (taskId: string) => void;
  onResolve: (to: 'TERMINADA' | 'EN_CURSO') => void;
}

function PendingReviewRow({
  item,
  now,
  today,
  selected,
  selectDisabled,
  onSelect,
  busyTo,
  anyBusy,
  onOpen,
  onResolve,
}: PendingReviewRowProps): React.ReactElement {
  const busy = busyTo !== null;
  const waiting = waitingInfo(item, now);
  const due = taskDueInfo({ status: 'EN_REVISION', endDate: item.endDate }, today);
  const dueText = dueLabel(due);
  const context = [item.responsibleName ?? 'Sin responsable', item.requestTitle, item.phaseName]
    .filter(Boolean)
    .join(' · ');
  return (
    <li
      data-task-id={item.id}
      aria-busy={busy || undefined}
      className={cn(
        'flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card @[640px]:flex-row @[640px]:items-center @[640px]:justify-between',
        '@[920px]:rounded-none @[920px]:shadow-none @[920px]:not-first:border-t',
        waiting.long && 'border-l-4 border-l-warning',
      )}
    >
      <label className="flex min-h-8 shrink-0 cursor-pointer items-center max-sm:min-h-11 @[640px]:pr-1">
        <Checkbox
          checked={selected}
          disabled={selectDisabled}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`Seleccionar ${item.code}: ${item.title}`}
        />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <button
          type="button"
          data-control="title"
          title={item.title}
          onClick={() => onOpen(item.id)}
          className="inline-flex min-h-6 min-w-0 items-center self-start rounded-sm text-left text-sm font-medium wrap-break-word text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:min-h-11"
        >
          <span className="line-clamp-2">{item.title}</span>
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <IdChip code={item.code} />
          <p title={context} className="min-w-0 line-clamp-1 text-meta text-muted-foreground">
            {context}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={waiting.long ? 'warning' : 'neutral'}
            title={
              waiting.approximate
                ? 'Fecha aproximada: la tarea ya estaba en revisión antes de que el portal registrara cuándo se envió.'
                : undefined
            }
          >
            <Clock aria-hidden="true" />
            {waiting.label}
          </Badge>
          {item.evidenceRequired ? (
            item.hasEvidence ? (
              <Badge variant="success">
                <CircleCheck aria-hidden="true" />
                Con evidencia
              </Badge>
            ) : (
              <Badge variant="warning">
                <CircleAlert aria-hidden="true" />
                Falta evidencia
              </Badge>
            )
          ) : null}
          {item.progress < 100 ? <Badge variant="warning">Avance {formatPercent(item.progress)}</Badge> : null}
          {dueText ? (
            <Badge variant={due.kind === 'overdue' ? 'danger' : 'warning'}>
              {due.kind === 'overdue' ? <AlarmClock aria-hidden="true" /> : <Clock aria-hidden="true" />}
              {dueText}
            </Badge>
          ) : null}
        </div>
        <span className="text-meta tabular-nums text-muted-foreground">
          {item.endDate ? `Vence ${formatDateOnly(item.endDate)}` : 'Sin fecha'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 @[640px]:flex @[640px]:shrink-0">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={TOUCH}
          loading={busyTo === 'EN_CURSO'}
          disabled={anyBusy}
          aria-label={`Devolver a En curso: ${item.title}`}
          onClick={() => onResolve('EN_CURSO')}
        >
          <Undo2 aria-hidden="true" />
          Devolver
        </Button>
        <Button
          type="button"
          size="sm"
          className={TOUCH}
          loading={busyTo === 'TERMINADA'}
          disabled={anyBusy}
          aria-label={`Aprobar: ${item.title}`}
          onClick={() => onResolve('TERMINADA')}
        >
          <Check aria-hidden="true" />
          Aprobar
        </Button>
      </div>
    </li>
  );
}
