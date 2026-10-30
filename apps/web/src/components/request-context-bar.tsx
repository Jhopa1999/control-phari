'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { DescriptionList, type DescriptionItem } from '@/components/description-list';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Request } from '@/lib/api-client';
import { formatDate, formatDateOnly } from '@/lib/format';
import { getStatus } from '@/lib/status-presentation';

export interface RequestPickerGroup {
  label: string;
  match: (request: Request) => boolean;
}

export interface RequestContextBarProps {
  /** Id del SelectTrigger: 'triage-request' | 'priority-request' | 'plan-request' | 'governance-request'. */
  id: string;
  /** Por defecto «Solicitud». */
  label?: string;
  requests: Request[];
  /** '' sin selección. */
  value: string;
  onValueChange: (id: string) => void;
  /** Cada solicitud cae en el primer grupo que la acepta; el resto, en «Otras solicitudes». */
  groups?: RequestPickerGroup[];
  /** Por defecto «Elige una solicitud». */
  placeholder?: string;
  /** Bajo el selector: «3 pendientes de triage». */
  helper?: React.ReactNode;
  /** A la derecha: <RequestSummary/> u otros badges. */
  summary?: React.ReactNode;
  /** Acción contextual de la página (p. ej. «Crear plan»). */
  actions?: React.ReactNode;
}

const OTHER_GROUP_LABEL = 'Otras solicitudes';

export interface RequestBucket {
  label: string;
  items: Request[];
}

/**
 * Reparte las solicitudes en los grupos dados: cada una cae en el primer grupo
 * que la acepta y el resto va a «Otras solicitudes». Sin grupos devuelve un
 * único bloque con `fallbackLabel`. Los bloques vacíos se omiten. Lo comparten
 * el selector de la barra y la bandeja.
 */
export function groupRequests(
  requests: Request[],
  groups: RequestPickerGroup[] | undefined,
  fallbackLabel = 'Solicitudes',
): RequestBucket[] {
  if (!groups || groups.length === 0) {
    return requests.length > 0 ? [{ label: fallbackLabel, items: requests }] : [];
  }
  const lists: RequestBucket[] = groups.map((group) => ({ label: group.label, items: [] }));
  const others: Request[] = [];
  for (const request of requests) {
    const index = groups.findIndex((group) => group.match(request));
    if (index >= 0) lists[index].items.push(request);
    else others.push(request);
  }
  lists.push({ label: OTHER_GROUP_LABEL, items: others });
  return lists.filter((list) => list.items.length > 0);
}

function optionLabel(request: Request): string {
  return `${request.title} · ${getStatus('request', request.operationalState).label}`;
}

/**
 * Barra de contexto de las mesas de trabajo por solicitud (design §7.8):
 * selector agrupado + resumen + acción contextual. Las opciones son
 * «{título} · {estado}».
 */
export function RequestContextBar({
  id,
  label = 'Solicitud',
  requests,
  value,
  onValueChange,
  groups,
  placeholder = 'Elige una solicitud',
  helper,
  summary,
  actions,
}: RequestContextBarProps): React.ReactElement {
  const helperId = `${id}-helper`;
  const buckets = React.useMemo(
    () => (groups && groups.length > 0 ? groupRequests(requests, groups) : null),
    [groups, requests],
  );

  return (
    <div className="grid gap-3 rounded-lg border bg-surface-subtle p-3 lg:grid-cols-[minmax(0,28rem)_1fr_auto] lg:items-end">
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger id={id} aria-describedby={helper ? helperId : undefined}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {buckets
              ? buckets.map((bucket, index) => (
                  <React.Fragment key={bucket.label}>
                    {index > 0 ? <SelectSeparator /> : null}
                    <SelectGroup>
                      <SelectLabel>{bucket.label}</SelectLabel>
                      {bucket.items.map((request) => (
                        <SelectItem key={request.id} value={request.id}>
                          {optionLabel(request)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </React.Fragment>
                ))
              : requests.map((request) => (
                  <SelectItem key={request.id} value={request.id}>
                    {optionLabel(request)}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
        {helper ? (
          <p id={helperId} className="text-meta text-muted-foreground">
            {helper}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">{summary}</div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type RequestSummaryItem = 'state' | 'triage' | 'priority' | 'registered';

/** Resumen de la solicitud elegida, en el orden de `show` (por defecto, solo el estado). */
export function RequestSummary({
  request,
  show = ['state'],
}: {
  request: Request;
  show?: RequestSummaryItem[];
}): React.ReactElement {
  // <span>, no <div>: la bandeja lo coloca dentro de un <button>.
  return (
    <span className="flex flex-wrap items-center gap-2">
      {show.map((item) => {
        switch (item) {
          case 'state':
            return <StatusBadge key={item} kind="request" value={request.operationalState} />;
          case 'triage':
            return request.currentTriageDecision ? (
              <StatusBadge key={item} kind="triage" value={request.currentTriageDecision} />
            ) : (
              <span key={item} className="text-meta text-muted-foreground">
                Sin triage
              </span>
            );
          case 'priority':
            return (
              <PriorityBadge
                key={item}
                variant="compact"
                score={request.currentScore}
                label={request.priorityLabel}
              />
            );
          case 'registered':
            return (
              <span key={item} className="text-meta text-muted-foreground">
                {`Registro: ${formatDate(request.registeredAt)}`}
              </span>
            );
          default:
            return null;
        }
      })}
    </span>
  );
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Ficha de la solicitud (DescriptionList). El enlace de referencia solo es un
 * enlace si es http o https; se abre en una pestaña nueva sin dar acceso a la
 * página de origen.
 */
export function RequestFacts({
  request,
  processName,
}: {
  request: Request;
  processName?: string | null;
}): React.ReactElement {
  const reference = request.referenceUrl;
  const referenceValue: React.ReactNode =
    reference && isWebUrl(reference) ? (
      <a
        href={reference}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-start gap-1 rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="break-all">{reference}</span>
        <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    ) : (
      reference
    );
  const items: DescriptionItem[] = [
    { term: 'Proceso principal', value: processName },
    { term: 'Registro', value: formatDate(request.registeredAt) },
    { term: 'Área solicitante', value: request.requesterArea },
    { term: 'Solicitante', value: request.requesterName },
    { term: 'Dueño funcional', value: request.functionalOwner },
    { term: 'Fecha objetivo', value: formatDateOnly(request.targetDate) },
    { term: 'Enlace de referencia', value: referenceValue },
    { term: 'Resultado esperado', value: request.expectedResult, span: 2 },
  ];
  return <DescriptionList items={items} columns={2} />;
}
