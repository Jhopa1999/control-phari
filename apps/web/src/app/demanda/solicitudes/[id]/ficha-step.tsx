import * as React from 'react';
import { CircleCheck, CircleDashed, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_STATE_LABELS, type StepState } from './ficha-steps';

export interface FichaStepProps {
  /** Número del paso (1-based) que se muestra en el marcador. */
  index: number;
  /** Título de la etapa; se usa como encabezado de la sección. */
  title: string;
  /** Estado derivado del paso (pendiente/en curso/completado). */
  state: StepState;
  /** Id del encabezado, para `aria-labelledby` de la sección. */
  headingId: string;
  /** Badge de estado de dominio junto al título (opcional). */
  stateBadge?: React.ReactNode;
  /** Último paso: oculta la línea de conexión inferior. */
  last?: boolean;
  /** Contenido de la etapa (DescriptionList, listas, avisos…). */
  children: React.ReactNode;
  /** Pie del paso: enlace «Ir a actuar» o motivo de bloqueo. */
  actionSlot?: React.ReactNode;
}

const MARKER_ICON: Record<StepState, typeof CircleCheck> = {
  pendiente: CircleDashed,
  'en-curso': CircleDot,
  completado: CircleCheck,
};

const MARKER_TONE: Record<StepState, string> = {
  pendiente: 'border-border bg-card text-muted-foreground',
  'en-curso': 'border-info-border bg-info-subtle text-info',
  completado: 'border-success-border bg-success-subtle text-success',
};

/**
 * Un paso del stepper vertical de la ficha. Renderiza un `<li>` con un marcador
 * (número + icono de estado) a la izquierda, unido por una línea vertical al
 * siguiente paso, y a la derecha una sección rotulada con el contenido de la
 * etapa y, al pie, la acción «Ir a actuar».
 *
 * Server-safe (sin hooks ni Radix): el `headingId` lo provee el contenedor para
 * mantener `aria-labelledby` estable. Todos los pasos quedan visibles a la vez
 * (no Tabs), como pide el encargo.
 */
export function FichaStep({
  index,
  title,
  state,
  headingId,
  stateBadge,
  last = false,
  children,
  actionSlot,
}: FichaStepProps): React.ReactElement {
  const Icon = MARKER_ICON[state];
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums',
            MARKER_TONE[state],
          )}
        >
          <span aria-hidden="true">{index}</span>
        </span>
        {!last ? (
          <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
        ) : null}
      </div>
      <section
        aria-labelledby={headingId}
        className={cn('flex min-w-0 flex-1 flex-col gap-3', last ? 'pb-0' : 'pb-8')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={headingId} className="text-base font-semibold">
            {title}
          </h2>
          <Icon
            className={cn(
              'size-4',
              state === 'completado' && 'text-success',
              state === 'en-curso' && 'text-info',
              state === 'pendiente' && 'text-muted-foreground',
            )}
            aria-hidden="true"
          />
          <span className="sr-only">{`Estado del paso: ${STEP_STATE_LABELS[state]}.`}</span>
          {stateBadge ? <span className="flex items-center gap-2">{stateBadge}</span> : null}
        </div>
        <div className="flex flex-col gap-3">{children}</div>
        {actionSlot ? <div className="flex flex-col gap-2">{actionSlot}</div> : null}
      </section>
    </li>
  );
}
