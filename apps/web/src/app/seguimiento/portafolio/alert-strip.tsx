'use client';

import * as React from 'react';
import { InlineNotice } from '@/components/inline-notice';
import { StatStrip, StatTile } from '@/components/stat-tile';
import { FilterNote } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import type { PortfolioAlert, PortfolioSummary } from '@/lib/portfolio';

interface AlertDef {
  key: PortfolioAlert;
  /** Campo de GET /portfolio/summary que alimenta el contador. */
  field: 'overdue' | 'dueSoon' | 'withVariance' | 'blocked';
  label: string;
  hint: string;
  tone: 'danger' | 'warning';
}

export const ALERT_DEFS: readonly AlertDef[] = [
  { key: 'VENCIDA', field: 'overdue', label: 'Vencidas', hint: 'pasaron su fecha', tone: 'danger' },
  { key: 'PROXIMA', field: 'dueSoon', label: 'Próximas a vencer', hint: 'vencen pronto', tone: 'warning' },
  { key: 'CON_DESVIACION', field: 'withVariance', label: 'Con desviación', hint: 'terminan después del plan', tone: 'warning' },
  { key: 'BLOQUEADA', field: 'blocked', label: 'Bloqueadas', hint: 'esperan algo', tone: 'danger' },
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

function AlertSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border xl:grid-cols-4">
      {ALERT_DEFS.map((def) => (
        <div key={def.key} className="flex h-16 flex-col justify-center gap-2 bg-card px-3 py-2">
          <div className="h-3 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-5 w-1/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * Franja de cuatro contadores del Portafolio (selección única). Las cifras salen
 * de GET /portfolio/summary con los filtros vigentes y sin la alerta; al activar
 * una cambia el listado, no las cifras. Las aclaraciones («Una iniciativa puede
 * aparecer en más de un grupo») van en el icono Info, no en una línea fija.
 */
export function AlertStrip({
  summary,
  loading,
  failed,
  active,
  onSelect,
  onRetry,
  trailing,
}: {
  summary: PortfolioSummary | null;
  loading: boolean;
  failed: boolean;
  active: PortfolioAlert | undefined;
  onSelect: (alert: PortfolioAlert | undefined) => void;
  onRetry: () => void;
  /** Notas e iconos a la derecha de la franja (alcance, leyenda de prioridades). */
  trailing?: React.ReactNode;
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
    <div aria-busy={loading} className="flex items-center gap-2">
      <div role="group" aria-label="Filtrar por alerta" className="min-w-0 flex-1">
        {summary === null ? (
          <AlertSkeleton />
        ) : (
          <StatStrip label="Alertas del portafolio">
            {ALERT_DEFS.map((def) => (
              <StatTile
                key={def.key}
                label={def.label}
                value={summary[def.field]}
                hint={def.hint}
                tone={def.tone}
                pressed={active === def.key}
                disabled={summary[def.field] === 0}
                onToggle={() => onSelect(active === def.key ? undefined : def.key)}
              />
            ))}
          </StatStrip>
        )}
      </div>
      <FilterNote label="Cómo se cuentan las alertas">
        <p className="max-w-xs">
          {allZero
            ? 'Ninguna iniciativa tiene alertas con los filtros actuales.'
            : 'Una iniciativa puede aparecer en más de un grupo.'}
          {summary?.truncated ? ' Las cifras consideran las primeras 1000 iniciativas.' : ''}
        </p>
      </FilterNote>
      {trailing}
    </div>
  );
}