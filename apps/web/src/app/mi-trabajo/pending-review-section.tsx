'use client';

import * as React from 'react';
import { AlarmClock, Check, CircleAlert, CircleCheck, Clock, ClipboardCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { InlineNotice } from '@/components/inline-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import { formatDateOnly, formatPercent } from '@/lib/format';
import {
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

  React.useEffect(() => {
    let active = true;
    listPendingReview()
      .then((result) => {
        if (!active) return;
        setList(result);
        setState('success');
        announce(`Por aprobar: ${result.total} ${result.total === 1 ? 'tarea' : 'tareas'}.`);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMessage(messageOf(err));
        setState('error');
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
        <ul className="flex flex-col gap-3 @[920px]:gap-0">
          {visible.map((item) => (
            <PendingReviewRow
              key={item.id}
              item={item}
              now={now}
              today={today}
              busyTo={busyId === item.id ? busyTo : null}
              anyBusy={busyId !== null}
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
  onOpen: (taskId: string) => void;
  onResolve: (to: 'TERMINADA' | 'EN_CURSO') => void;
}

function PendingReviewRow({
  item,
  now,
  today,
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
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <button
          type="button"
          data-control="title"
          title={item.title}
          onClick={() => onOpen(item.id)}
          className="min-w-0 self-start rounded-sm text-left text-sm font-medium wrap-break-word text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
        >
          <span className="line-clamp-2">{item.title}</span>
        </button>
        <p title={context} className="line-clamp-1 text-meta text-muted-foreground">
          {context}
        </p>
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
