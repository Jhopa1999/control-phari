'use client';

import * as React from 'react';
import { EmptyState } from '@/components/empty-state';
import { IdChip } from '@/components/id-chip';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { RequestInbox } from '@/components/request-inbox';
import {
  groupRequests,
  RequestContextBar,
  type RequestPickerGroup,
  type RequestSummaryItem,
} from '@/components/request-context-bar';
import { Badge } from '@/components/ui/badge';
import type { Request } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { getStatus } from '@/lib/status-presentation';
import { useMediaQuery } from '@/lib/use-media-query';

/** Desde `lg` la lista de solicitudes reemplaza al selector desplegable (design §9). */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** Verdadero desde lg: la vista decide con él dónde pinta su acción principal. */
export function useWorkbenchDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
/** Tope de ítems por grupo en la lista; el elegido siempre se incluye. */
const MAX_PER_GROUP = 50;

export interface RequestWorkbenchProps {
  /** Id del selector de la barra de contexto (solo se pinta debajo de lg). */
  id: string;
  requests: Request[];
  groups: RequestPickerGroup[];
  /** '' sin selección. */
  value: string;
  /** Selección del usuario: estado y URL (misma función que usaba el selector). */
  onValueChange: (id: string) => void;
  /** Autoselección inicial (solo estado local, sin tocar la URL). */
  onAutoSelect: (id: string) => void;
  /** Falso cuando la URL ya trae ?requestId=, que manda sobre la autoselección. */
  autoSelect: boolean;
  /** Solicitud elegida (null si no hay). */
  selected: Request | null;
  /** «3 pendientes de triage». */
  helper?: React.ReactNode;
  /** Resumen de la solicitud elegida (badges). */
  summary?: React.ReactNode;
  /** Enlaces contextuales («Ver ficha completa»). */
  actions?: React.ReactNode;
  /** Acción principal del detalle: va en la barra superior en escritorio. */
  primaryAction?: React.ReactNode;
  /** Aviso (p. ej. «La solicitud indicada no está disponible aquí»). */
  notice?: React.ReactNode;
  /** Badges de la bandeja que se muestra debajo de lg sin selección. */
  inboxShow: RequestSummaryItem[];
  /** Nombre accesible de la lista de solicitudes. */
  listTitle?: string;
  /** Detalle de la solicitud elegida (se pinta solo si hay selección). */
  children: React.ReactNode;
}

/**
 * Mesa de trabajo por solicitud con maestro-detalle (design §9, H-09). Desde lg:
 * lista de solicitudes agrupada a la izquierda y detalle a la derecha, con la
 * primera pendiente preseleccionada y una barra superior con las acciones.
 * Debajo de lg conserva el apilado de siempre: selector, resumen y bandeja.
 */
export function RequestWorkbench({
  id,
  requests,
  groups,
  value,
  onValueChange,
  onAutoSelect,
  autoSelect,
  selected,
  helper,
  summary,
  actions,
  primaryAction,
  notice,
  inboxShow,
  listTitle = 'Solicitudes',
  children,
}: RequestWorkbenchProps): React.ReactElement {
  const isDesktop = useWorkbenchDesktop();
  const buckets = React.useMemo(() => groupRequests(requests, groups), [requests, groups]);
  const firstPendingId =
    buckets.length > 0 && buckets[0].label === groups[0]?.label ? buckets[0].items[0]?.id : undefined;

  // Primera pendiente según el orden de la API; no mueve el foco ni la URL.
  React.useEffect(() => {
    if (!isDesktop || !autoSelect || value || !firstPendingId) return;
    onAutoSelect(firstPendingId);
  }, [isDesktop, autoSelect, value, firstPendingId, onAutoSelect]);

  if (!isDesktop) {
    return (
      <>
        <RequestContextBar
          id={id}
          requests={requests}
          value={value}
          onValueChange={onValueChange}
          groups={groups}
          helper={helper}
          summary={summary}
          actions={actions}
        />
        {notice}
        {selected ? (
          children
        ) : (
          <RequestInbox requests={requests} groups={groups} show={inboxShow} onPick={onValueChange} />
        )}
      </>
    );
  }

  const list = (
    <div>
      {helper ? (
        <p className="border-b px-3 py-2 text-meta text-muted-foreground">{helper}</p>
      ) : null}
      {buckets.map((bucket) => {
        const visible = bucket.items.slice(0, MAX_PER_GROUP);
        const picked = bucket.items.find((request) => request.id === value);
        if (picked && !visible.includes(picked)) visible.push(picked);
        const hidden = bucket.items.length - visible.length;
        return (
          <div key={bucket.label}>
            <h3 className="flex items-center justify-between gap-2 border-b bg-surface-subtle px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {bucket.label}
              <Badge variant="neutral" className="tabular-nums">
                {bucket.items.length}
              </Badge>
            </h3>
            <SelectableList
              label={bucket.label}
              selectedId={value || null}
              onSelect={onValueChange}
              items={visible.map((request) => ({
                id: request.id,
                title: (
                  <span className="flex min-w-0 items-center gap-1.5" title={request.title}>
                    <IdChip code={request.code} copyable={false} />
                    <span className="min-w-0 truncate">{request.title}</span>
                  </span>
                ),
                meta: `${getStatus('request', request.operationalState).label} · ${formatDate(request.registeredAt)}`,
              }))}
            />
            {hidden > 0 ? (
              <p className="border-t px-3 py-2 text-meta text-muted-foreground">
                {`Hay ${hidden} más. Búscalas en Solicitudes.`}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const detail = selected ? (
    <div className="flex flex-col gap-4">
      <div className="sticky top-12 z-10 -mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b bg-background py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <IdChip code={selected.code} />
          <p className="min-w-0 max-w-[28rem] truncate text-sm font-semibold" title={selected.title}>
            {selected.title}
          </p>
          {summary}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {primaryAction}
        </div>
      </div>
      {notice}
      {children}
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      {notice}
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState
          size="compact"
          title="Elige una solicitud de la lista."
          description="Aquí verás su ficha y podrás registrar la decisión."
        />
      </div>
    </div>
  );

  return <MasterDetail listTitle={listTitle} list={list} detail={detail} />;
}
