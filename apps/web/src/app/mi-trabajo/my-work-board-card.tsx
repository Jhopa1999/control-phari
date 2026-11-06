'use client';

import * as React from 'react';
import { AlarmClock, Clock } from 'lucide-react';
import { BlockedReasonBox } from '@/components/blocked-reason';
import { progressTone } from '@/components/task-progress';
import { Button } from '@/components/ui/button';
import type { MyWorkItem } from '@/lib/api-client';
import { formatDateOnly } from '@/lib/format';
import { isProjectClosed } from '@/lib/my-work-groups';
import { dueLabel, taskDueInfo } from '@/lib/task-due';
import { nextStepFor, transitionVerb } from '@/lib/task-next-step';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TaskProgressControl } from '../seguimiento/plan/task-progress-control';
import { TaskStatusControl } from '../seguimiento/plan/task-status-control';
import {
  CLOSED_PROJECT_REASON,
  ClosedChip,
  ClosedNotice,
  PredecessorChip,
  startWarning,
} from './mi-trabajo-chips';
import { MilestoneBadge, type RowActions } from './mi-trabajo-parts';

const TOUCH = 'max-md:min-h-11 max-md:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11';

export interface MyWorkBoardCardProps {
  item: MyWorkItem;
  today: string;
  actions: RowActions;
}

/**
 * Tarjeta del tablero de Mi trabajo. Propia (no reutiliza el tablero de
 * Planificación, que exige plan, personas y permisos de líder). Sin arrastre:
 * «Siguiente paso» y «Mover a…» son el único camino y solo ofrecen transiciones válidas.
 */
export function MyWorkBoardCard({ item, today, actions }: MyWorkBoardCardProps): React.ReactElement {
  const closed = isProjectClosed(item);
  const busy = actions.busyId === item.taskId;
  const due = closed ? { kind: 'none' as const, days: 0 } : taskDueInfo(item, today);
  const dueText = dueLabel(due);
  const step = closed ? null : nextStepFor(item.status);
  const blocked = item.status === 'BLOQUEADA' && !closed;
  const waiting = step?.to === 'EN_CURSO' && startWarning(item, 'EN_CURSO') !== undefined;
  const predId = `board-pred-${item.taskId}`;
  const closedId = `board-closed-${item.taskId}`;
  const commitment = item.status !== 'TERMINADA' ? item.requestCommitmentDate : null;
  const context = [item.requestTitle, item.phaseName].filter(Boolean).join(' · ');

  return (
    <li data-task-id={item.taskId}>
      <article
        aria-busy={busy || undefined}
        aria-label={item.title}
        className={cn(
          'flex flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground shadow-card ring-1 ring-border transition-shadow hover:shadow-md',
          due.kind === 'overdue' && 'border-l-4 border-l-danger',
          blocked && due.kind !== 'overdue' && 'border-l-4 border-l-warning',
        )}
      >
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            data-control="title"
            title={item.title}
            onClick={() => actions.onOpen(item)}
            className={cn(
              'min-w-0 flex-1 rounded-sm text-left text-sm leading-snug font-medium wrap-break-word underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              'max-md:inline-flex max-md:min-h-11 max-md:items-center pointer-coarse:min-h-11',
            )}
          >
            <span className="line-clamp-3">{item.title}</span>
          </button>
          {item.isMilestone ? <MilestoneBadge /> : null}
        </div>

        {context ? (
          <p title={context} className="line-clamp-2 text-meta text-muted-foreground">
            {context}
          </p>
        ) : null}

        {dueText || item.pendingPredecessors?.length || closed ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {dueText ? (
              <Badge variant={due.kind === 'overdue' ? 'danger' : 'warning'}>
                {due.kind === 'overdue' ? <AlarmClock aria-hidden="true" /> : <Clock aria-hidden="true" />}
                {dueText}
              </Badge>
            ) : null}
            <PredecessorChip item={item} id={predId} />
            {closed ? <ClosedChip /> : null}
          </div>
        ) : null}

        {blocked ? <BlockedReasonBox reason={item.blockedReason} /> : null}

        <span data-control="progress" className="block">
          <TaskProgressControl
            wide
            value={item.progress}
            status={item.status}
            taskTitle={item.title}
            tone={progressTone(item.status, due.kind === 'overdue')}
            disabled={closed}
            disabledReason={closed ? CLOSED_PROJECT_REASON : undefined}
            busy={busy}
            className={TOUCH}
            onSave={(value) => actions.onProgress(item, value)}
          />
        </span>

        <div className="flex flex-col gap-0.5 text-meta tabular-nums text-muted-foreground">
          <span>{item.endDate ? `Vence ${formatDateOnly(item.endDate)}` : 'Sin fecha de vencimiento'}</span>
          {commitment ? <span>Compromiso {formatDateOnly(commitment)}</span> : null}
        </div>

        {closed ? (
          <ClosedNotice id={closedId} />
        ) : (
          <div className="flex items-center gap-2">
            {step ? (
              <Button
                type="button"
                size="sm"
                variant={step.to === 'TERMINADA' ? 'default' : 'outline'}
                data-control="next"
                loading={busy}
                aria-describedby={waiting ? predId : undefined}
                aria-label={`${step.label}: ${item.title}`}
                className={cn('h-auto min-h-8 min-w-0 flex-1 whitespace-normal py-1 leading-tight', TOUCH)}
                onClick={() => actions.onStatus(item, step.to)}
              >
                {step.label}
              </Button>
            ) : (
              <span className="flex-1" />
            )}
            <span data-control="status" className="shrink-0">
              <TaskStatusControl
                triggerVariant="move"
                status={item.status}
                progress={item.progress}
                showProgress={false}
                disabled={false}
                busy={busy}
                taskTitle={item.title}
                optionLabel={(next) => transitionVerb(item.status, next)}
                optionHint={(next) => startWarning(item, next)}
                triggerClassName={cn('max-md:size-11 pointer-coarse:size-11')}
                onChange={(next) => actions.onStatus(item, next)}
              />
            </span>
          </div>
        )}
      </article>
    </li>
  );
}
