'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import type { ButtonProps } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTarget,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/*
 * Acciones no disponibles (design §7.4 y §10.3). Las dos piezas usan
 * aria-disabled mediante la prop `unavailable` de Button: el control conserva
 * su rol, su nombre y su lugar en el orden de tabulación, y el lector anuncia
 * «no disponible» seguido del motivo. Nunca se envuelve el control en un span
 * enfocable.
 */

export interface DisabledReasonProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Motivo VISIBLE junto a una acción principal. La acción es
 * <Button unavailable aria-describedby={id}>; dentro de RequirementsPanel,
 * aria-describedby={`${panelId}-summary ${id}`} (§10.1). En PageHeader, la
 * acción y su motivo van juntos en un div flex-col items-start gap-1
 * md:items-end, con el motivo en max-w-xs md:text-right.
 */
export function DisabledReason({ id, children, className }: DisabledReasonProps): React.ReactElement {
  return (
    <p id={id} className={cn('flex items-start gap-1.5 text-meta text-muted-foreground', className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export interface DisabledHintProps {
  /** Sin motivo, devuelve children tal cual. */
  reason?: string | null;
  /** Solo controles solo icono: su nombre, como primera línea del tooltip. */
  label?: string;
  /** Siempre un <Button>. */
  children: React.ReactElement<ButtonProps>;
}

/**
 * Motivo de una acción no disponible en una fila densa: tooltip al pasar el
 * puntero, al enfocar con teclado y al pulsar (también en táctil, donde Radix
 * no abre por hover), y el motivo como única descripción accesible.
 *
 * Secuencia (TooltipTrigger 1.3.0): Radix cierra en pointerdown y en click; ese
 * click lo descarta Button por ser `unavailable` y onUnavailableClick vuelve a
 * abrirlo, así que pulsar siempre deja visible el motivo. TooltipTarget quita
 * la descripción que suma Radix: el motivo se anuncia una sola vez.
 */
export function DisabledHint({ reason, label, children }: DisabledHintProps): React.ReactElement {
  const hintId = React.useId();
  const [open, setOpen] = React.useState(false); // tooltip controlado: también se abre al pulsar
  if (!reason) return children;
  const describedBy = [children.props['aria-describedby'], hintId].filter(Boolean).join(' ');
  return (
    <>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          asChild
          onFocus={(e) => {
            // NIT 3: solo se abre por foco cuando el foco es visible (teclado); el
            // foco que se mueve por script tras un clic no deja un tooltip suelto.
            if (!e.currentTarget.matches(':focus-visible')) e.preventDefault();
          }}
        >
          <TooltipTarget>
            {React.cloneElement(children, {
              disabled: false,
              unavailable: true, // aria-disabled; el clic no ejecuta la acción ni envía el formulario
              onUnavailableClick: () => setOpen(true), // ratón, teclado y táctil
              'aria-describedby': describedBy, // única descripción: TooltipTarget descarta la de Radix
            })}
          </TooltipTarget>
        </TooltipTrigger>
        <TooltipContent>
          {label ? <span className="block font-medium">{label}</span> : null}
          {reason}
        </TooltipContent>
      </Tooltip>
      <span id={hintId} hidden>
        {reason}
      </span>
    </>
  );
}
