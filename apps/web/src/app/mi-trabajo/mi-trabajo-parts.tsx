'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlarmClock,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Check,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  Clock,
  Flag,
  Lock,
  OctagonAlert,
  type LucideIcon,
} from 'lucide-react';
import { BlockedReasonBox, BlockedReasonLine } from '@/components/blocked-reason';
import { progressTone } from '@/components/task-progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import type { MyWorkItem, TaskStatus } from '@/lib/api-client';
import { formatDateOnly, formatDateOnlyWithWeekday } from '@/lib/format';
import { isProjectClosed, weekEndOf, type MyWorkGroupKey } from '@/lib/my-work-groups';
import { nextStepFor, transitionVerb } from '@/lib/task-next-step';
import { dueLabel, taskDueInfo } from '@/lib/task-due';
import { cn } from '@/lib/utils';
import { TaskProgressControl } from '../seguimiento/plan/task-progress-control';
import { TaskStatusControl } from '../seguimiento/plan/task-status-control';
import {
  CLOSED_PROJECT_REASON,
  ClosedChip,
  ClosedNotice,
  PredecessorChip,
  startWarning,
} from './mi-trabajo-chips';

/** Máximo de filas visibles por grupo antes de «Ver las N restantes». */
export const GROUP_LIMIT = 20;
export const DONE_LIMIT = 10;

export interface GroupMeta {
  title: string;
  icon: LucideIcon;
  /** Clase del texto del título. */
  titleClass: string;
  /** Texto de la tabla para lectores («Tareas vencidas»). */
  caption: string;
}

export const GROUP_META: Record<MyWorkGroupKey, GroupMeta> = {
  overdue: { title: 'Vencidas', icon: AlarmClock, titleClass: 'text-danger', caption: 'Tareas vencidas' },
  today: { title: 'Hoy', icon: CalendarClock, titleClass: 'text-foreground', caption: 'Tareas que vencen hoy' },
  week: { title: 'Esta semana', icon: CalendarDays, titleClass: 'text-foreground', caption: 'Tareas de esta semana' },
  later: { title: 'Más adelante', icon: CalendarRange, titleClass: 'text-foreground', caption: 'Tareas para más adelante' },
  noDate: { title: 'Sin fecha', icon: CalendarOff, titleClass: 'text-foreground', caption: 'Tareas sin fecha' },
  done: { title: 'Terminadas', icon: CircleCheck, titleClass: 'text-muted-foreground', caption: 'Tareas terminadas' },
  closed: { title: 'De proyectos cerrados', icon: Lock, titleClass: 'text-muted-foreground', caption: 'Tareas de proyectos cerrados' },
};

// ---------------------------------------------------------------------------
// Contadores
// ---------------------------------------------------------------------------

export type CounterKey = 'overdue' | 'today' | 'inProgress' | 'blocked';

interface CounterDef {
  key: CounterKey;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Filete superior cuando el valor es > 0. */
  topBorder: string;
  /** Color del valor cuando es > 0. */
  valueClass: string;
}

export const COUNTERS: readonly CounterDef[] = [
  { key: 'overdue', label: 'Vencidas', hint: 'pasaron su fecha', icon: AlarmClock, topBorder: 'border-t-danger', valueClass: 'text-danger' },
  { key: 'today', label: 'Para hoy', hint: 'vencen hoy', icon: CalendarClock, topBorder: 'border-t-warning', valueClass: 'text-warning' },
  { key: 'inProgress', label: 'En curso', hint: 'en las que trabajas', icon: CirclePlay, topBorder: 'border-t-primary', valueClass: 'text-foreground' },
  { key: 'blocked', label: 'Bloqueadas', hint: 'esperan algo', icon: OctagonAlert, topBorder: 'border-t-danger', valueClass: 'text-danger' },
];

export interface CounterCardProps {
  def: CounterDef;
  value: number;
  active: boolean;
  onToggle: () => void;
}

/** Contador-interruptor de la cabecera (filtro de selección única). */
export function CounterCard({ def, value, active, onToggle }: CounterCardProps): React.ReactElement {
  const Icon = def.icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={value === 0 && !active}
      onClick={onToggle}
      className={cn(
        'flex min-h-20 flex-col gap-0.5 rounded-xl border-t-2 bg-card p-4 text-left shadow-card transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default disabled:hover:bg-card',
        value > 0 ? def.topBorder : 'border-t-border',
        active && 'ring-2 ring-primary',
      )}
    >
      <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {def.label}
        {active ? <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" /> : null}
        {active ? <span className="sr-only">Filtro activo</span> : null}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums',
          value > 0 ? def.valueClass : 'text-muted-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-meta text-muted-foreground">{def.hint}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Piezas de fila
// ---------------------------------------------------------------------------

export interface RowActions {
  /** Fila con una acción en curso. */
  busyId: string | null;
  onStatus: (item: MyWorkItem, next: TaskStatus) => void;
  onProgress: (item: MyWorkItem, value: number) => Promise<string | null>;
  /** Abre el panel lateral con el detalle de la tarea. */
  onOpen: (item: MyWorkItem) => void;
}

interface RowCommon {
  item: MyWorkItem;
  today: string;
  groupKey: MyWorkGroupKey;
  /** El actor puede abrir Solicitudes: la solicitud se enlaza; si no, texto plano. */
  canOpenRequest: boolean;
  actions: RowActions;
}

export const TOUCH = 'max-lg:min-h-11 max-lg:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11';

/** Título de la tarea: abre el panel lateral sin salir de la lista. */
export function TitleLink({
  item,
  touch,
  onOpen,
}: {
  item: MyWorkItem;
  touch?: boolean;
  onOpen: (item: MyWorkItem) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      data-control="title"
      title={item.title}
      onClick={() => onOpen(item)}
      className={cn(
        'min-w-0 rounded-sm text-left text-sm font-medium wrap-break-word text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        touch && 'inline-flex min-h-11 items-center',
      )}
    >
      <span className="line-clamp-2">{item.title}</span>
    </button>
  );
}

export function MilestoneBadge(): React.ReactElement {
  return (
    <Badge variant="outline" className="shrink-0 gap-1">
      <Flag className="size-3" aria-hidden="true" />
      Hito
    </Badge>
  );
}

export function Subline({
  item,
  canOpenRequest,
  lines = 1,
}: {
  item: MyWorkItem;
  canOpenRequest: boolean;
  lines?: 1 | 2;
}): React.ReactElement {
  const commitment =
    item.status !== 'TERMINADA' && item.requestCommitmentDate
      ? `Compromiso ${formatDateOnly(item.requestCommitmentDate)}`
      : null;
  const full = [item.requestTitle, item.phaseName, commitment].filter(Boolean).join(' · ');
  const request =
    canOpenRequest && item.requestId ? (
      <Link
        href={`/demanda/solicitudes/${encodeURIComponent(item.requestId)}`}
        className="rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {item.requestTitle}
      </Link>
    ) : (
      item.requestTitle
    );
  return (
    <p
      title={full}
      className={cn(
        'text-meta text-muted-foreground',
        lines === 1 ? 'line-clamp-1' : 'line-clamp-2',
      )}
    >
      {request}
      {item.requestTitle && item.phaseName ? ' · ' : null}
      {item.phaseName}
      {commitment ? <span className="whitespace-nowrap">{(item.requestTitle || item.phaseName) ? ' · ' : null}{commitment}</span> : null}
    </p>
  );
}

/** Fecha de vencimiento y chip (el chip se omite en el grupo «Hoy»). */
function DueCell({
  item,
  today,
  groupKey,
  idPrefix,
}: {
  item: MyWorkItem;
  today: string;
  groupKey: MyWorkGroupKey;
  idPrefix: string;
}): React.ReactElement {
  const closed = isProjectClosed(item);
  // Un proyecto cerrado nunca pide urgencia: sin chip de vencimiento.
  const due = taskDueInfo(item, today);
  const label = groupKey === 'today' || closed ? null : dueLabel(due);
  return (
    <div className="flex flex-col items-start gap-1">
      {item.endDate ? (
        <span className="whitespace-nowrap text-sm tabular-nums">{formatDateOnly(item.endDate)}</span>
      ) : (
        <span className="text-sm text-muted-foreground">Sin fecha</span>
      )}
      {label ? (
        <Badge variant={due.kind === 'overdue' ? 'danger' : 'warning'} className="gap-1">
          {due.kind === 'overdue' ? (
            <AlarmClock className="size-3" aria-hidden="true" />
          ) : (
            <Clock className="size-3" aria-hidden="true" />
          )}
          {label}
        </Badge>
      ) : null}
      <PredecessorChip item={item} id={`${idPrefix}-pred-${item.taskId}`} />
      {closed ? <ClosedChip /> : null}
    </div>
  );
}

function ProgressCell({
  item,
  today,
  actions,
  wide,
}: Pick<RowCommon, 'item' | 'today' | 'actions'> & { wide?: boolean }): React.ReactElement {
  const closed = isProjectClosed(item);
  const overdue = !closed && taskDueInfo(item, today).kind === 'overdue';
  return (
    <span data-control="progress" className="block">
      <TaskProgressControl
        value={item.progress}
        status={item.status}
        taskTitle={item.title}
        tone={progressTone(item.status, overdue)}
        disabled={closed}
        disabledReason={closed ? CLOSED_PROJECT_REASON : undefined}
        busy={actions.busyId === item.taskId}
        wide={wide}
        className={wide ? TOUCH : undefined}
        onSave={(value) => actions.onProgress(item, value)}
      />
    </span>
  );
}

function StatusCell({
  item,
  actions,
  touch,
  idPrefix,
}: Pick<RowCommon, 'item' | 'actions'> & { touch?: boolean; idPrefix: string }): React.ReactElement {
  const closed = isProjectClosed(item);
  // En un proyecto cerrado no hay «Siguiente paso»: el servidor respondería 409.
  const step = closed ? null : nextStepFor(item.status);
  const busy = actions.busyId === item.taskId;
  const waiting = step?.to === 'EN_CURSO' && startWarning(item, 'EN_CURSO') !== undefined;
  return (
    <>
      <span data-control="status">
        <TaskStatusControl
          status={item.status}
          progress={item.progress}
          showProgress={false}
          disabled={closed}
          disabledReason={closed ? CLOSED_PROJECT_REASON : undefined}
          describedById={closed ? `${idPrefix}-closed-${item.taskId}` : undefined}
          busy={busy}
          taskTitle={item.title}
          optionLabel={(next) => transitionVerb(item.status, next)}
          optionHint={(next) => startWarning(item, next)}
          triggerClassName={touch ? TOUCH : undefined}
          onChange={(next) => actions.onStatus(item, next)}
        />
      </span>
      {step ? (
        <Button
          type="button"
          size="sm"
          variant={step.to === 'TERMINADA' ? 'default' : 'outline'}
          data-control="next"
          loading={busy}
          aria-describedby={waiting ? `${idPrefix}-pred-${item.taskId}` : undefined}
          className={cn(touch ? cn(TOUCH, 'flex-1 whitespace-normal') : 'min-w-36')}
          aria-label={`${step.label}: ${item.title}`}
          onClick={() => actions.onStatus(item, step.to)}
        >
          {step.label}
        </Button>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Fila de tabla y tarjeta
// ---------------------------------------------------------------------------

function MyWorkTableRow(props: RowCommon): React.ReactElement {
  const { item, today, groupKey, canOpenRequest, actions } = props;
  const overdue = groupKey === 'overdue';
  const done = groupKey === 'done';
  const closed = isProjectClosed(item);
  return (
    <TableRow data-task-id={item.taskId} aria-busy={actions.busyId === item.taskId || undefined}>
      <TableCell className={cn('py-3 align-top', overdue && 'shadow-[inset_3px_0_0_0_var(--color-danger)]')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TitleLink item={item} onOpen={actions.onOpen} />
          {item.isMilestone ? <MilestoneBadge /> : null}
        </div>
        <Subline item={item} canOpenRequest={canOpenRequest} />
      </TableCell>
      <TableCell className="py-3 align-top">
        {done ? (
          <div className="flex flex-col items-start gap-1">
            <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
              {item.endDate ? formatDateOnly(item.endDate) : 'Sin fecha'}
            </span>
            {closed ? <ClosedChip /> : null}
          </div>
        ) : (
          <DueCell item={item} today={today} groupKey={groupKey} idPrefix="row" />
        )}
      </TableCell>
      <TableCell className="py-3 align-top">
        <ProgressCell item={item} today={today} actions={actions} />
      </TableCell>
      <TableCell className="py-3 align-top">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <StatusCell item={item} actions={actions} idPrefix="row" />
          </div>
          {closed ? (
            <ClosedNotice id={`row-closed-${item.taskId}`} />
          ) : item.status === 'BLOQUEADA' ? (
            <BlockedReasonLine reason={item.blockedReason} />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function MyWorkCard(props: RowCommon): React.ReactElement {
  const { item, today, groupKey, canOpenRequest, actions } = props;
  const overdue = groupKey === 'overdue';
  const done = groupKey === 'done';
  const closed = isProjectClosed(item);
  return (
    <li
      data-task-id={item.taskId}
      aria-busy={actions.busyId === item.taskId || undefined}
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-xl bg-card p-4 shadow-card',
        overdue && "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-danger before:content-['']",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TitleLink item={item} touch onOpen={actions.onOpen} />
        {item.isMilestone ? <MilestoneBadge /> : null}
      </div>
      <Subline item={item} canOpenRequest={canOpenRequest} lines={2} />
      {done ? (
        <div className="flex flex-col items-start gap-1">
          <span className="text-sm tabular-nums text-muted-foreground">
            {item.endDate ? formatDateOnly(item.endDate) : 'Sin fecha'}
          </span>
          {closed ? <ClosedChip /> : null}
        </div>
      ) : (
        <DueCell item={item} today={today} groupKey={groupKey} idPrefix="card" />
      )}
      {!closed && item.status === 'BLOQUEADA' ? <BlockedReasonBox reason={item.blockedReason} /> : null}
      <ProgressCell item={item} today={today} actions={actions} wide />
      {item.status === 'TERMINADA' ? (
        <p className="text-meta text-muted-foreground">
          La tarea está terminada. Reábrela para cambiar su avance.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <StatusCell item={item} actions={actions} touch idPrefix="card" />
      </div>
      {closed ? <ClosedNotice id={`card-closed-${item.taskId}`} /> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sección de grupo
// ---------------------------------------------------------------------------

export interface GroupSectionProps {
  groupKey: MyWorkGroupKey;
  items: MyWorkItem[];
  today: string;
  canOpenRequest: boolean;
  actions: RowActions;
  /** Muestra todas las filas del grupo (tras «Ver las N restantes»). */
  expanded: boolean;
  /** Fila que debe seguir visible aunque caiga tras el corte. */
  keepVisibleId: string | null;
  onExpand: (groupKey: MyWorkGroupKey, firstHiddenId: string, hiddenCount: number) => void;
  /** Solo «Terminadas»: abierta/cerrada y alternar. `foldable=false` = título fijo. */
  open?: boolean;
  foldable?: boolean;
  onToggleOpen?: () => void;
}

/** Un grupo de tareas: cabecera, tabla (≥ 920 px de contenedor) o tarjetas. */
export function GroupSection({
  groupKey,
  items,
  today,
  canOpenRequest,
  actions,
  expanded,
  keepVisibleId,
  onExpand,
  open = true,
  foldable = false,
  onToggleOpen,
}: GroupSectionProps): React.ReactElement {
  const meta = GROUP_META[groupKey];
  const Icon = meta.icon;
  const headingId = `mt-h-${groupKey}`;
  const bodyId = `mt-grupo-${groupKey}`;
  const limit = groupKey === 'done' ? DONE_LIMIT : GROUP_LIMIT;
  const keepIndex = keepVisibleId ? items.findIndex((i) => i.taskId === keepVisibleId) : -1;
  const showAll = expanded || items.length <= limit || keepIndex >= limit;
  const visible = showAll ? items : items.slice(0, limit);
  const hidden = items.length - visible.length;

  const heading = (
    <>
      <Icon className={cn('size-4 shrink-0', meta.titleClass)} aria-hidden="true" />
      <h2
        id={headingId}
        tabIndex={-1}
        className={cn('font-heading text-base font-semibold', meta.titleClass)}
      >
        {meta.title}
      </h2>
      <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
        {items.length}
      </span>
      {groupKey === 'closed' ? (
        <span className="text-meta text-muted-foreground">No cuentan en tus resúmenes.</span>
      ) : null}
      {groupKey === 'week' ? (
        <span className="text-meta text-muted-foreground">
          hasta {formatDateOnlyWithWeekday(weekEndOf(today))}
        </span>
      ) : null}
    </>
  );

  return (
    <section
      aria-labelledby={headingId}
      className="@[920px]:overflow-hidden @[920px]:rounded-xl @[920px]:bg-card @[920px]:shadow-card"
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b px-4 py-3',
          'sticky top-14 z-10 bg-background lg:static @[920px]:bg-card',
        )}
      >
        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggleOpen}
            className="-mx-1 flex min-h-11 items-center gap-2 rounded-sm px-1 pointer-fine:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronRight
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
                open && 'rotate-90',
              )}
              aria-hidden="true"
            />
            {heading}
          </button>
        ) : (
          heading
        )}
      </div>
      <div id={bodyId} hidden={!open} className={cn(open && 'pt-3 @[920px]:pt-0')}>
        {open ? (
          <>
            <div className="hidden @[920px]:block">
              <Table className="table-fixed">
                <caption className="sr-only">{meta.caption}</caption>
                <colgroup>
                  <col />
                  <col className="w-44" />
                  <col className="w-44" />
                  <col className="w-72" />
                </colgroup>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Tarea</th>
                    <th scope="col">Vencimiento</th>
                    <th scope="col">Avance</th>
                    <th scope="col">Estado y siguiente paso</th>
                  </tr>
                </thead>
                <TableBody>
                  {visible.map((item) => (
                    <MyWorkTableRow
                      key={item.taskId}
                      item={item}
                      today={today}
                      groupKey={groupKey}
                      canOpenRequest={canOpenRequest}
                      actions={actions}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-3 @[920px]:hidden">
              {visible.map((item) => (
                <MyWorkCard
                  key={item.taskId}
                  item={item}
                  today={today}
                  groupKey={groupKey}
                  canOpenRequest={canOpenRequest}
                  actions={actions}
                />
              ))}
            </ul>
            {hidden > 0 ? (
              <div className="px-4 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onExpand(groupKey, items[visible.length].taskId, hidden)}
                >
                  Ver las {hidden} restantes
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
