'use client';

import * as React from 'react';
import {
  AlarmClock,
  CalendarClock,
  Check,
  OctagonAlert,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import type { PortfolioAlert, PortfolioSummary } from '@/lib/portfolio';
import { cn } from '@/lib/utils';

interface AlertDef {
  key: PortfolioAlert;
  /** Campo de GET /portfolio/summary que alimenta el contador. */
  field: 'overdue' | 'dueSoon' | 'withVariance' | 'blocked';
  label: string;
  hint: string;
  icon: LucideIcon;
  topBorder: string;
  valueClass: string;
}

export const ALERT_DEFS: readonly AlertDef[] = [
  { key: 'VENCIDA', field: 'overdue', label: 'Vencidas', hint: 'pasaron su fecha', icon: AlarmClock, topBorder: 'border-t-danger', valueClass: 'text-danger' },
  { key: 'PROXIMA', field: 'dueSoon', label: 'Próximas a vencer', hint: 'vencen pronto', icon: CalendarClock, topBorder: 'border-t-warning', valueClass: 'text-warning' },
  { key: 'CON_DESVIACION', field: 'withVariance', label: 'Con desviación', hint: 'terminan después del plan', icon: TrendingUp, topBorder: 'border-t-warning', valueClass: 'text-warning' },
  { key: 'BLOQUEADA', field: 'blocked', label: 'Bloqueadas', hint: 'esperan algo', icon: OctagonAlert, topBorder: 'border-t-danger', valueClass: 'text-danger' },
];

/** Etiqueta de una alerta (chip y anuncio del conteo). */
export function alertLabel(alert: PortfolioAlert): string {
  return ALERT_DEFS.find((def) => def.key === alert)?.label ?? alert;
}

const ALERT_KEYS: readonly string[] = ALERT_DEFS.map((def) => def.key);

/** Valor de `?alert=` válido o undefined (un valor desconocido se ignora). */
export function parseAlert(value: string | null): PortfolioAlert | undefined {
  return value !== null && ALERT_KEYS.includes(value) ? (value as PortfolioAlert) : undefined;
}

function AlertCard({
  def,
  value,
  active,
  onToggle,
}: {
  def: AlertDef;
  value: number;
  active: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const Icon = def.icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={value === 0 && !active}
      onClick={onToggle}
      className={cn(
        'flex min-h-20 min-w-0 flex-col gap-0.5 rounded-xl border-t-2 bg-card p-4 text-left shadow-card transition-colors motion-reduce:transition-none hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default disabled:hover:bg-card',
        value > 0 ? def.topBorder : 'border-t-border',
        active && 'bg-primary-subtle/60 ring-2 ring-primary',
      )}
    >
      <span className="flex items-center gap-1.5 text-meta text-muted-foreground wrap-break-word">
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

function AlertSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ALERT_DEFS.map((def) => (
        <div key={def.key} className="flex min-h-20 flex-col gap-2 rounded-xl bg-card p-4 shadow-card">
          <div className="h-3 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-7 w-1/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * Franja de cuatro contadores del Portafolio (selección única). Las cifras salen
 * de GET /portfolio/summary con los filtros vigentes y sin la alerta; al activar
 * una cambia el listado, no las cifras.
 */
export function AlertStrip({
  summary,
  loading,
  failed,
  active,
  onSelect,
  onRetry,
}: {
  summary: PortfolioSummary | null;
  loading: boolean;
  failed: boolean;
  active: PortfolioAlert | undefined;
  onSelect: (alert: PortfolioAlert | undefined) => void;
  onRetry: () => void;
}): React.ReactElement {
  if (failed && summary === null) {
    return (
      <InlineNotice
        tone="danger"
        role="alert"
        action={
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        }
      >
        No fue posible calcular los contadores. El listado sigue disponible.
      </InlineNotice>
    );
  }
  const allZero =
    summary !== null && ALERT_DEFS.every((def) => summary[def.field] === 0) && active === undefined;
  return (
    <section aria-label="Alertas del portafolio" aria-busy={loading} className="flex flex-col gap-2">
      {summary === null ? (
        <AlertSkeleton />
      ) : (
        <div role="group" aria-label="Filtrar por alerta" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ALERT_DEFS.map((def) => (
            <AlertCard
              key={def.key}
              def={def}
              value={summary[def.field]}
              active={active === def.key}
              onToggle={() => onSelect(active === def.key ? undefined : def.key)}
            />
          ))}
        </div>
      )}
      <p className="text-meta text-muted-foreground">
        {allZero
          ? 'Ninguna iniciativa tiene alertas con los filtros actuales.'
          : 'Una iniciativa puede aparecer en más de un grupo.'}
        {summary?.truncated ? ' Las cifras consideran las primeras 1000 iniciativas.' : ''}
      </p>
    </section>
  );
}
