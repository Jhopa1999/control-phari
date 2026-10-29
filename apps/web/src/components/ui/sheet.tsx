'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Cajón lateral sobre @radix-ui/react-dialog (menú en pantallas < 1024 px).
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed inset-y-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col bg-sidebar p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
  {
    variants: {
      side: {
        left: 'left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        right:
          'right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
      },
    },
    defaultVariants: {
      side: 'left',
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Texto accesible del botón cerrar. */
  closeLabel?: string;
}

/**
 * Requiere un `SheetTitle` (puede ser `sr-only`). El contenido que empiece
 * arriba debe reservar `pr-12` para el botón cerrar.
 */
const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'left', className, children, closeLabel = 'Cerrar menú', ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      <SheetPrimitive.Close asChild>
        <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3">
          <X aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </Button>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold', className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-meta text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetTitle,
  SheetDescription,
};
