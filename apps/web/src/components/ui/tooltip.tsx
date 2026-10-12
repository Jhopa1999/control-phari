'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

/*
 * Regla de uso (§6): ningún control va directamente dentro de
 * `TooltipTrigger asChild`. O usa `LabelTooltip` (el tooltip repite el nombre
 * del control) o `DisabledHint` (motivo de una acción no disponible, §7.4),
 * que describe con su propio id. En puntero táctil Radix no abre tooltips por
 * hover: ningún dato puede depender solo de un tooltip.
 */

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md duration-150 animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Va entre `TooltipTrigger asChild` y el control. Mientras el tooltip está
 * abierto, Radix suma el id del contenido al `aria-describedby` del control;
 * esta pieza descarta solo esa descripción (deja pasar eventos, `data-state` y
 * la `ref` del disparador), así que el control conserva la suya.
 */
function TooltipTarget(props: React.ComponentPropsWithRef<typeof Slot>): React.ReactElement {
  return <Slot {...props} aria-describedby={undefined} />;
}

interface LabelTooltipProps {
  /** Texto del tooltip; con `null` no se muestra nada y el control no se remonta. */
  label: React.ReactNode | null;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactElement;
}

/**
 * Tooltip que nunca describe al control: para cuando su texto repite el nombre
 * del control (botones solo icono, ítems del menú en riel) o ya está en el
 * árbol de accesibilidad por otra vía.
 */
function LabelTooltip({ label, side, children }: LabelTooltipProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        asChild
        onFocus={(e) => {
          // Solo se abre por foco cuando el foco es visible (teclado): el foco
          // que se mueve por script tras un clic no deja un tooltip suelto.
          if (!e.currentTarget.matches(':focus-visible')) e.preventDefault();
        }}
      >
        <TooltipTarget>{children}</TooltipTarget>
      </TooltipTrigger>
      {label != null ? <TooltipContent side={side}>{label}</TooltipContent> : null}
    </Tooltip>
  );
}

export {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipTarget,
  LabelTooltip,
};
