import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Tonos semánticos: el tono expresa nivel de atención, no identidad (§1).
const badgeTones = {
  neutral: 'bg-neutral-subtle text-neutral',
  info: 'bg-info-subtle text-info',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  accent: 'bg-primary-subtle text-primary',
  outline: 'border-border-strong text-foreground',
} as const;

// No es interactivo: sin estilos de foco. El borde transparente se vuelve
// visible en forced-colors.
const badgeVariants = cva(
  'inline-flex h-5 items-center gap-1 rounded-sm border border-transparent px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: badgeTones,
    },
    defaultVariants: {
      variant: 'accent',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
