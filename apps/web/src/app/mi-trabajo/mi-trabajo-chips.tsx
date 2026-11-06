'use client';

import * as React from 'react';
import { Link2, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MyWorkItem, TaskStatus } from '@/lib/api-client';
import { isProjectClosed } from '@/lib/my-work-groups';

export const CLOSED_PROJECT_REASON = 'Proyecto cerrado: no se puede cambiar el estado ni el avance.';

/** Predecesoras sin terminar que merecen aviso: no en terminadas ni en proyectos cerrados. */
export function pendingPredecessorsOf(item: MyWorkItem): MyWorkItem['pendingPredecessors'] {
  if (item.status === 'TERMINADA' || isProjectClosed(item)) return [];
  return item.pendingPredecessors ?? [];
}

/** «Espera a “X”» o «N predecesoras pendientes»; null si no hay nada que avisar. */
export function predecessorText(item: MyWorkItem): string | null {
  const pending = pendingPredecessorsOf(item);
  if (pending.length === 0) return null;
  return pending.length === 1 ? `Espera a “${pending[0].title}”` : `${pending.length} predecesoras pendientes`;
}

/**
 * Aviso no bloqueante del menú de estado: «Empezar» o «Retomar» puede dar 409 si
 * una predecesora no está terminada. El servidor manda; esto solo lo anticipa.
 */
export function startWarning(item: MyWorkItem, next: TaskStatus): string | undefined {
  if (next !== 'EN_CURSO' || (item.status !== 'POR_HACER' && item.status !== 'BLOQUEADA')) return undefined;
  const pending = pendingPredecessorsOf(item);
  if (pending.length === 0) return undefined;
  return pending.length === 1
    ? `Aún espera a “${pending[0].title}”. Puede que no te deje empezar.`
    : `Aún esperan ${pending.length} predecesoras. Puede que no te deje empezar.`;
}

/** Chip de predecesoras pendientes (no interactivo; el detalle vive en el panel). */
export function PredecessorChip({ item, id }: { item: MyWorkItem; id?: string }): React.ReactElement | null {
  const text = predecessorText(item);
  if (!text) return null;
  const full = pendingPredecessorsOf(item)
    .map((p) => p.title)
    .join(', ');
  return (
    <Badge id={id} variant="warning" title={full} className="max-w-full min-w-0">
      <Link2 aria-hidden="true" className="shrink-0" />
      <span className="truncate">{text}</span>
    </Badge>
  );
}

export function ClosedChip(): React.ReactElement {
  return (
    <Badge variant="neutral" className="shrink-0">
      <Lock aria-hidden="true" />
      Proyecto cerrado
    </Badge>
  );
}

/** Texto visible que explica por qué las acciones están deshabilitadas. */
export function ClosedNotice({ id }: { id: string }): React.ReactElement {
  return (
    <p id={id} className="text-meta text-muted-foreground">
      {CLOSED_PROJECT_REASON}
    </p>
  );
}
