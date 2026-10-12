'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, align = 'end', sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-44 max-w-72 rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

interface DropdownMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  tone?: 'default' | 'danger';
  /**
   * Acción no disponible por una regla (§6). No usa `disabled` de Radix, que
   * la sacaría del recorrido de teclado y dejaría el motivo inaccesible: el
   * ítem lleva `aria-disabled="true"`, no ejecuta `onSelect`, el menú sigue
   * abierto y el motivo se muestra en una segunda línea.
   */
  unavailableReason?: string | null;
  /**
   * Acción en curso (transitoria, §10.3): `disabled` de Radix, LoaderCircle en
   * lugar del contenido y el texto de progreso de `busyLabel` ("Eliminando…").
   */
  busy?: boolean;
  busyLabel?: string;
}

// La altura es mínima, no fija: un ítem de dos líneas crece sin recortarse.
const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(
  (
    { className, tone = 'default', unavailableReason, busy = false, busyLabel, disabled, onSelect, children, ...props },
    ref,
  ) => {
    const unavailable = !busy && Boolean(unavailableReason);
    return (
      <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn(
          'relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
          tone === 'danger' && 'text-danger focus:bg-danger-subtle',
          unavailable && 'items-start text-muted-foreground',
          className,
        )}
        disabled={busy || (!unavailable && disabled)}
        {...props}
        {...(unavailable
          ? { 'aria-disabled': 'true' as const, onSelect: (event: Event) => event.preventDefault() }
          : { onSelect })}
      >
        {busy ? (
          <>
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {busyLabel ?? children}
          </>
        ) : unavailable ? (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">{children}</span>
            <span className="text-xs">{unavailableReason}</span>
          </span>
        ) : (
          children
        )}
      </DropdownMenuPrimitive.Item>
    );
  },
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
};
