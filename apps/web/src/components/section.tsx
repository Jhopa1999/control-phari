'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface SectionProps {
  title: string;
  /** Nivel del encabezado; por defecto 2. */
  headingLevel?: 2 | 3;
  description?: React.ReactNode;
  /** Pill neutra junto al título. */
  count?: number;
  /** Acciones de la sección (p. ej. «Nueva fase»). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /**
   * Ref del encabezado, que pasa a tener tabIndex -1: destino del foco cuando
   * una acción retira el control enfocado y la tabla queda vacía (NIT 4).
   */
  headingRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * Sección rotulada de una página (design §7.1): section[aria-labelledby] con el
 * id de React.useId(), cabecera con título, contador y acciones, y 12 px hasta
 * el contenido.
 */
export function Section({
  title,
  headingLevel = 2,
  description,
  count,
  actions,
  children,
  className,
  headingRef,
}: SectionProps): React.ReactElement {
  const headingId = React.useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Heading
              id={headingId}
              ref={headingRef}
              tabIndex={headingRef ? -1 : undefined}
              className="rounded-sm text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {title}
            </Heading>
            {count !== undefined ? (
              <Badge variant="neutral" className="tabular-nums">
                {count}
              </Badge>
            ) : null}
          </div>
          {description ? (
            <div className="text-meta text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
