'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleCheck, CircleDashed, Lock } from 'lucide-react';
import { DisabledHint } from '@/components/disabled-reason';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

export type RequirementStatus = 'pending' | 'met';

export interface RequirementAction {
  /** Verbo + objeto: «Editar fase», «Abrir tarea», «Ir a triage». */
  label: string;
  onClick?: () => void;
  /** Ruta interna (next/link). */
  href?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface RequirementItem {
  id: string;
  /** Qué se requiere o qué falta (texto de la API cuando exista). */
  label: React.ReactNode;
  status: RequirementStatus;
  /** Contexto: estado actual, categoría, fecha de revisión. */
  detail?: React.ReactNode;
  /** Nombre del responsable, si la API lo trae. */
  owner?: string | null;
  action?: RequirementAction;
}

export interface RequirementsPanelProps {
  /**
   * Id del panel. Su cabecera (título + contador) lleva `${id}-summary`,
   * destino del aria-describedby de la acción bloqueada.
   */
  id: string;
  /** Qué está bloqueado (con pendientes); también es el respaldo de doneTitle. */
  title: string;
  /** Con pendientes; respaldo de doneDescription. */
  description?: React.ReactNode;
  items: RequirementItem[];
  groups?: { id: string; label: string; itemIds: string[] }[];
  /** Título sin pendientes: se pinta doneTitle ?? title. */
  doneTitle?: string;
  /** Descripción sin pendientes: se pinta doneDescription ?? description. */
  doneDescription?: React.ReactNode;
  /** La acción bloqueada + DisabledReason. */
  footer?: React.ReactNode;
  headingLevel?: 2 | 3;
  /** Título + contador en aria-live="polite". */
  liveUpdates?: boolean;
  /** Dentro de tarjetas (gates): sin borde propio y con padding reducido. */
  compact?: boolean;
}

const PENDING_NOUN = { one: 'pendiente', other: 'pendientes' };

function RequirementActionControl({ action }: { action: RequirementAction }): React.ReactElement {
  // Una acción no disponible es siempre un Button unavailable dentro de
  // DisabledHint, nunca un enlace: un enlace que no lleva a ninguna parte no es
  // un enlace (§7.4).
  if (action.disabled && action.disabledReason) {
    return (
      <DisabledHint reason={action.disabledReason}>
        <Button type="button" variant="ghost" size="sm">
          {action.label}
        </Button>
      </DisabledHint>
    );
  }
  if (action.href && !action.disabled) {
    return (
      <Link href={action.href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        {action.label}
      </Link>
    );
  }
  return (
    <Button type="button" variant="ghost" size="sm" disabled={action.disabled} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

function RequirementRow({ item, compact }: { item: RequirementItem; compact: boolean }): React.ReactElement {
  const pending = item.status === 'pending';
  return (
    <li
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        compact ? 'px-3 py-2' : 'px-4 py-2.5',
      )}
    >
      <div className="flex min-w-0 gap-2">
        {pending ? (
          <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        ) : (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-sm">
            <span className="sr-only">{pending ? 'Pendiente: ' : 'Cumplido: '}</span>
            {item.label}
          </div>
          {item.detail ? <div className="text-meta text-muted-foreground">{item.detail}</div> : null}
          {item.owner ? (
            <div className="text-meta text-muted-foreground">Responsable: {item.owner}</div>
          ) : null}
        </div>
      </div>
      {item.action ? (
        <div className="shrink-0 pl-6 sm:pl-0">
          <RequirementActionControl action={item.action} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Lo que falta para una acción bloqueada y cómo resolverlo (design §10.1). Va
 * junto a la acción bloqueada. La UI no evalúa reglas nuevas: los ítems vienen
 * de la API (guía del plan, gates) o de los mismos predicados que ya deciden el
 * bloqueo en cada vista.
 */
export function RequirementsPanel({
  id,
  title,
  description,
  items,
  groups,
  doneTitle,
  doneDescription,
  footer,
  headingLevel = 2,
  liveUpdates = false,
  compact = false,
}: RequirementsPanelProps): React.ReactElement {
  const pendingCount = items.filter((item) => item.status === 'pending').length;
  const hasPending = pendingCount > 0;
  const shownTitle = hasPending ? title : (doneTitle ?? title);
  const shownDescription = hasPending ? description : (doneDescription ?? description);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const padding = compact ? 'px-3 py-2' : 'px-4 py-3';

  const byId = new Map(items.map((item) => [item.id, item]));
  const grouped = new Set<string>();
  const groupBlocks = (groups ?? [])
    .map((group) => {
      const groupItems = group.itemIds
        .map((itemId) => byId.get(itemId))
        .filter((item): item is RequirementItem => item !== undefined);
      groupItems.forEach((item) => grouped.add(item.id));
      return { group, groupItems };
    })
    .filter((block) => block.groupItems.length > 0);
  const ungrouped = items.filter((item) => !grouped.has(item.id));

  return (
    <div
      id={id}
      className={cn(
        'flex flex-col',
        !compact && 'rounded-lg border bg-card',
        !compact && hasPending && 'border-warning-border',
      )}
    >
      <div className={cn('flex flex-col gap-1', padding)}>
        <div
          id={`${id}-summary`}
          className="flex flex-wrap items-center gap-2"
          aria-live={liveUpdates ? 'polite' : undefined}
          aria-atomic={liveUpdates ? true : undefined}
        >
          {hasPending ? (
            <Lock className="size-4 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          )}
          <Heading className="text-sm font-semibold">{shownTitle}</Heading>
          {hasPending ? (
            <Badge variant="warning">{formatCount(pendingCount, PENDING_NOUN)}</Badge>
          ) : (
            <Badge variant="success">Todo listo</Badge>
          )}
        </div>
        {shownDescription ? (
          <div className="text-meta text-muted-foreground">{shownDescription}</div>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div className="border-t">
          {groupBlocks.map(({ group, groupItems }) => {
            const groupLabelId = `${id}-group-${group.id}`;
            return (
              <div key={group.id} className="border-b last:border-b-0">
                <p
                  id={groupLabelId}
                  className={cn(
                    'pt-2.5 pb-1 text-xs font-medium text-muted-foreground',
                    compact ? 'px-3' : 'px-4',
                  )}
                >
                  {group.label}
                </p>
                <ul aria-labelledby={groupLabelId} className="divide-y">
                  {groupItems.map((item) => (
                    <RequirementRow key={item.id} item={item} compact={compact} />
                  ))}
                </ul>
              </div>
            );
          })}
          {ungrouped.length > 0 ? (
            // El borde inferior del último grupo ya separa esta lista.
            <ul className="divide-y">
              {ungrouped.map((item) => (
                <RequirementRow key={item.id} item={item} compact={compact} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {footer ? <div className={cn('border-t', padding)}>{footer}</div> : null}
    </div>
  );
}
