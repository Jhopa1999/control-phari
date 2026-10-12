import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Casilla nativa con el color de acento (§6). Úsala siempre dentro de
 * `<label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">`
 * junto a su texto: el label da el nombre accesible sin `htmlFor` y un objetivo
 * de al menos 24 px de alto (WCAG 2.5.8).
 */
const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<'input'>, 'type'>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'size-4 shrink-0 cursor-pointer accent-primary rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
