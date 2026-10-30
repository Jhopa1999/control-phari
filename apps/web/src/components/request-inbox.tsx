'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import {
  groupRequests,
  RequestSummary,
  type RequestPickerGroup,
  type RequestSummaryItem,
} from '@/components/request-context-bar';
import { Badge } from '@/components/ui/badge';
import type { Request } from '@/lib/api-client';

/*
 * Bandeja de las mesas de trabajo por solicitud (docs/design/bandeja-solicitudes.md).
 * Se muestra cuando todavía no hay solicitud elegida y reparte las solicitudes
 * en los mismos grupos del selector, para abrir la que toca con un clic. Solo
 * presentación: la elección la resuelve la vista (misma función que el selector).
 */

const MAX_PER_GROUP = 12;

export interface RequestInboxProps {
  requests: Request[];
  /** Los mismos grupos que el selector de la barra de contexto. */
  groups?: RequestPickerGroup[];
  /** Badges de cada fila, en orden (por defecto estado y fecha de registro). */
  show?: RequestSummaryItem[];
  /** Mismo manejador que `onValueChange` del selector. */
  onPick: (id: string) => void;
}

export function RequestInbox({
  requests,
  groups,
  show = ['state', 'registered'],
  onPick,
}: RequestInboxProps): React.ReactElement {
  const buckets = React.useMemo(() => groupRequests(requests, groups), [requests, groups]);
  const headingBase = React.useId();

  return (
    <div className="flex flex-col gap-6">
      {buckets.map((bucket, index) => {
        const headingId = `${headingBase}-${index}`;
        const visible = bucket.items.slice(0, MAX_PER_GROUP);
        const hidden = bucket.items.length - visible.length;
        return (
          <section key={bucket.label} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
              {bucket.label}
              <Badge variant="neutral">{bucket.items.length}</Badge>
            </h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
              {visible.map((request) => (
                <li key={request.id}>
                  <button
                    type="button"
                    onClick={() => onPick(request.id)}
                    className="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="line-clamp-2 font-medium wrap-break-word">{request.title}</span>
                      <RequestSummary request={request} show={show} />
                    </span>
                    <span className="hidden text-meta text-muted-foreground group-hover:text-foreground sm:inline">
                      Abrir
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                    />
                  </button>
                </li>
              ))}
            </ul>
            {hidden > 0 ? (
              <p className="text-meta text-muted-foreground">
                {`Hay ${hidden} más. Búscalas en el selector de arriba.`}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
