import * as React from 'react';
import { CircleCheck, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AiBudgetStatus } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { budgetState, formatPct, formatUsd, type BudgetState } from './ia-format';

const STATES: Record<
  BudgetState,
  { label: string; text: string; Icon: LucideIcon; variant: 'success' | 'warning' | 'danger'; fill: string }
> = {
  ok: { label: 'Dentro del tope', text: 'dentro del tope', Icon: CircleCheck, variant: 'success', fill: 'bg-success' },
  alert: { label: 'Cerca del tope', text: 'en alerta', Icon: TriangleAlert, variant: 'warning', fill: 'bg-warning' },
  exceeded: { label: 'Tope agotado', text: 'tope agotado', Icon: OctagonX, variant: 'danger', fill: 'bg-danger' },
};

interface BudgetProgressProps {
  budget: AiBudgetStatus;
}

/**
 * Barra del presupuesto mensual de IA: estado con icono, etiqueta y texto (nunca
 * solo color), relleno hasta el porcentaje usado y marca del umbral de alerta.
 * Solo se pinta si hay tope; role="progressbar" con valor y texto equivalente.
 */
export function BudgetProgress({ budget }: BudgetProgressProps): React.ReactElement | null {
  if (budget.budgetUsd === null || budget.usedPct === null) return null;
  const state = STATES[budgetState(budget)];
  const used = budget.usedPct;
  const width = Math.min(Math.max(used, 0), 100);
  const alertLeft = Math.min(Math.max(budget.alertPct, 0), 100);
  const valueText = `${formatPct(used)} usado; alerta al ${formatPct(budget.alertPct)}; estado: ${state.text}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={state.variant}>
          <state.Icon aria-hidden="true" />
          {state.label}
        </Badge>
        <span className="text-sm tabular-nums">
          {formatUsd(budget.spentUsd)} de {formatUsd(budget.budgetUsd)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Consumo del presupuesto"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width * 10) / 10}
        aria-valuetext={valueText}
        className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] motion-reduce:transition-none',
            state.fill,
          )}
          style={{ width: `${width}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-foreground"
          style={{ left: `${alertLeft}%` }}
        />
      </div>
      <div className="relative h-4 text-meta text-muted-foreground" aria-hidden="true">
        <span
          className={cn(
            'absolute whitespace-nowrap',
            alertLeft < 12 ? 'left-0' : alertLeft > 88 ? 'right-0' : '-translate-x-1/2',
          )}
          style={alertLeft < 12 || alertLeft > 88 ? undefined : { left: `${alertLeft}%` }}
        >
          Alerta al {formatPct(budget.alertPct)}
        </span>
      </div>
      {used > 100 ? (
        <p className="text-meta text-danger">{formatPct(used)} del tope</p>
      ) : null}
    </div>
  );
}
