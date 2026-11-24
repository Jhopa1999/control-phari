import * as React from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SIMULATION_BADGE_TEXT =
  'Modo de simulación: las respuestas no vienen de un modelo real';

/**
 * Insignia del modo de simulación del modelo (solo ambientes no productivos).
 * Lleva icono y texto (no depende solo del color) con los tokens de aviso.
 */
export function SimulationBadge({ className }: { className?: string }): React.ReactElement {
  return (
    <p
      data-testid="assistant-simulation-badge"
      className={cn(
        'inline-flex items-center gap-1.5 self-center rounded-full border border-warning-border bg-warning-subtle px-2.5 py-1 text-meta font-medium text-warning',
        className,
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
      {SIMULATION_BADGE_TEXT}
    </p>
  );
}
