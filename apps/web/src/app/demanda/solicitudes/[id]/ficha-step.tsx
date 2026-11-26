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
    <li className="flex gap-4 lg:mb-4 lg:break-inside-avoid lg:gap-0 lg:rounded-xl lg:border lg:bg-card lg:p-4 lg:shadow-card">
      <div className="flex flex-col items-center lg:hidden">
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
        className={cn('flex min-w-0 flex-1 flex-col gap-3', last ? 'pb-0' : 'pb-8 lg:pb-0')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'hidden size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums lg:flex',
              MARKER_TONE[state],
            )}
          >
            {index}
          </span>
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

export interface FichaStripStep {
  title: string;
  headingId: string;
  state: StepState;
}

/**
 * Recorrido horizontal de la solicitud (solo desde lg): una línea con las
 * etapas y su estado; cada una enlaza con su tarjeta. En pantallas menores el
 * stepper vertical ya muestra el mismo recorrido.
 */
export function FichaStrip({ steps }: { steps: FichaStripStep[] }): React.ReactElement {
  return (
    <nav aria-label="Etapas de la solicitud" className="hidden lg:block">
      <ol className="flex items-stretch divide-x overflow-hidden rounded-xl border bg-card shadow-card">
        {steps.map((step, index) => {
          const Icon = MARKER_ICON[step.state];
          return (
            <li key={step.headingId} className="min-w-0 flex-1">
              <a
                href={`#${step.headingId}`}
                className="flex min-h-9 items-center justify-center gap-1.5 px-2 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    step.state === 'completado' && 'text-success',
                    step.state === 'en-curso' && 'text-info',
                    step.state === 'pendiente' && 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{`${index + 1}. ${step.title}`}</span>
                <span className="sr-only">{`Estado: ${STEP_STATE_LABELS[step.state]}.`}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
