import * as React from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getStatus,
  parseBand,
  PRIORITY_BAND_COPY,
  type PriorityBand,
  type StatusKind,
} from '@/lib/status-presentation';

/*
 * Estados de dominio (design §7.3). Seguros para servidor (sin hooks ni Radix).
 * Solo presentación: la etiqueta, el tono y el icono salen de
 * lib/status-presentation.ts y la banda nunca se deriva del score.
 */

export interface StatusBadgeProps {
  kind: StatusKind;
  value: string | null | undefined;
  /** Explicación para lectores de pantalla, en un span sr-only hermano. */
  srDescription?: string;
  className?: string;
}

/**
 * Badge de estado. El texto del badge es exactamente la etiqueta (los E2E la
 * buscan con exact: true); `srDescription` va en un span sr-only HERMANO.
 */
export function StatusBadge({
  kind,
  value,
  srDescription,
  className,
}: StatusBadgeProps): React.ReactElement {
  const status = getStatus(kind, value);
  const Icon = status.icon;
  const badge = (
    <Badge variant={status.tone} className={className}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {status.label}
    </Badge>
  );
  if (!srDescription) return badge;
  return (
    <>
      {badge}
      <span className="sr-only">{`: ${srDescription}`}</span>
    </>
  );
}

const BANDS: readonly string[] = ['P1', 'P2', 'P3', 'P4'];

function toBand(value: string): PriorityBand | null {
  return BANDS.includes(value) ? (value as PriorityBand) : null;
}

export interface PriorityBadgeProps {
  /** priorityBand o band de la API ('P1'…'P4'; 'SIN_PRIORIZAR' o null sin banda). */
  band?: string | null;
  /** priorityLabel de la API («P1 · Primera consideracion para compromiso»). */
  label?: string | null;
  /** currentScore: solo se muestra, nunca se calcula. */
  score?: number | null;
  /** 'compact' (por defecto) en tablas; 'full' añade la glosa. */
  variant?: 'compact' | 'full';
}

/**
 * Prioridad: «84 P1» en una sola línea, sin separador. Sin score, solo el badge;
 * sin banda ni score, «Sin priorizar» (outline). 'full' añade la glosa de la
 * banda (o el label de la API si no hay banda).
 */
export function PriorityBadge({
  band,
  label,
  score,
  variant = 'compact',
}: PriorityBadgeProps): React.ReactElement {
  // Banda = band ?? parseBand(label).
  const resolved = band !== null && band !== undefined && band !== '' ? toBand(band) : parseBand(label);
  const hasScore = score !== null && score !== undefined;
  let core: React.ReactNode;
  if (resolved) {
    core = (
      <>
        {hasScore ? <span className="tabular-nums">{score}</span> : null}
        <StatusBadge kind="band" value={resolved} />
      </>
    );
  } else if (hasScore) {
    core = <span className="tabular-nums">{score}</span>;
  } else {
    core = <StatusBadge kind="band" value="SIN_PRIORIZAR" />;
  }
  const compact = <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{core}</span>;
  if (variant === 'compact') return compact;
  const gloss = resolved ? PRIORITY_BAND_COPY[resolved] : (label ?? null);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {compact}
      {gloss ? <span className="text-meta text-muted-foreground">{gloss}</span> : null}
    </span>
  );
}

/**
 * Leyenda de las bandas P1–P4 con su glosa: una sola vez por tabla que muestra
 * bandas, entre el toolbar y la tabla. La glosa vive aquí y no en un tooltip,
 * porque un badge no es enfocable.
 */
export function PriorityLegend({ className }: { className?: string }): React.ReactElement {
  // Desplegable nativo (<details>): una sola línea cerrada, accesible por teclado
  // sin JavaScript. Antes la leyenda ocupaba dos líneas encima de cada tabla.
  return (
    <details className={cn('group text-meta text-muted-foreground', className)}>
      <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <Info aria-hidden="true" className="size-3.5" />
        ¿Qué significan P1 a P4?
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ul aria-label="Bandas de prioridad" className="mt-2 flex flex-col gap-1.5">
        {(['P1', 'P2', 'P3', 'P4'] as const).map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <StatusBadge kind="band" value={band} />
            {PRIORITY_BAND_COPY[band]}
          </li>
        ))}
      </ul>
    </details>
  );
}
