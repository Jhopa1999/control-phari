import * as React from 'react';
import { Info } from 'lucide-react';
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
    <Badge variant={status.tone} className={cn(status.className, className)}>
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
  /** priorityLabel de la API («P1 · Primera consideración para compromiso»). */
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
  // Desplegable nativo (<details>): accesible por teclado sin JavaScript. El
  // panel flota bajo el icono para no ocupar una fila de la barra de filtros
  // (design §6, notas largas fuera de la fila). Enter o Espacio lo abren y cierran.
  return (
    <details className={cn('group relative text-meta text-muted-foreground', className)}>
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-10 [&::-webkit-details-marker]:hidden">
        <Info aria-hidden="true" className="size-4" />
        {/* Texto visible corto; el nombre accesible completo lo contiene (WCAG 2.5.3). */}
        <span className="sr-only">¿Qué significan </span>
        P1–P4
        <span className="sr-only">?</span>
      </summary>
      <ul
        aria-label="Bandas de prioridad"
        className="absolute right-0 top-full z-20 mt-1 flex w-max max-w-[min(22rem,calc(100vw-2rem))] flex-col gap-1.5 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
      >
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