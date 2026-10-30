import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0 pointer-coarse:min-h-10 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      // El hover solo aplica sin aria-disabled (acción no disponible, §6).
      variant: {
        default: 'bg-primary text-primary-foreground not-aria-disabled:hover:bg-primary-hover',
        secondary:
          'bg-secondary text-secondary-foreground not-aria-disabled:hover:bg-secondary-hover',
        outline: 'border border-border-strong bg-background not-aria-disabled:hover:bg-accent',
        ghost: 'not-aria-disabled:hover:bg-accent',
        'ghost-destructive': 'text-danger not-aria-disabled:hover:bg-danger-subtle',
        destructive:
          'bg-destructive text-destructive-foreground not-aria-disabled:hover:bg-destructive-hover',
        link: 'text-link underline-offset-4 not-aria-disabled:hover:underline',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-meta',
        lg: 'h-10 px-4',
        icon: 'size-9 pointer-coarse:min-w-10',
        'icon-sm': 'size-8 pointer-coarse:min-w-10',
      },
    },
    compoundVariants: [
      // El enlace no tiene caja: anula la altura y el relleno de cualquier tamaño.
      { variant: 'link', className: 'h-auto px-0' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Acción en curso: antepone un spinner, fuerza `disabled` y `aria-busy`.
   * El texto de progreso ("Guardando…") lo decide quien llama. No se combina
   * con `asChild`.
   */
  loading?: boolean;
  /**
   * Acción no disponible por una regla (§7.4): `aria-disabled="true"`, sigue
   * enfocable y en el orden de tabulación, no recibe `disabled`, no llama al
   * `onClick` recibido y no envía el formulario (tampoco con Enter en un
   * campo). No se combina con `asChild`.
   */
  unavailable?: boolean;
  /** Se llama al pulsar un botón `unavailable` (p. ej. para mostrar el motivo). */
  onUnavailableClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      unavailable = false,
      onUnavailableClick,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size, className }));
    if (asChild) {
      return (
        <Slot className={classes} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    const unavailableProps: React.ButtonHTMLAttributes<HTMLButtonElement> | null = unavailable
      ? {
          'aria-disabled': 'true',
          onClick: (event) => {
            event.preventDefault();
            onUnavailableClick?.(event);
          },
        }
      : null;
    // aria-disabled y onClick van después de ...props para que nada los pise.
    return (
      <button
        className={classes}
        ref={ref}
        {...props}
        disabled={unavailable ? false : props.disabled || loading}
        aria-busy={loading ? true : props['aria-busy']}
        {...unavailableProps}
      >
        {loading ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
