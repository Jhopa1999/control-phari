import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Tonos semánticos: el tono expresa nivel de atención, no identidad (§1).
// Marca GIBO: fondo translúcido del propio tono y texto saturado. Los
// porcentajes están verificados a ≥4.5:1 sobre fondo y tarjeta, en claro y
// oscuro (steering 25-marca-gibo.md); si se cambian, volver a medir.
const badgeTones = {
  neutral: 'bg-neutral/10 text-neutral',
  info: 'bg-info/12 text-info',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/14 text-warning',
  danger: 'bg-danger/12 text-danger',
  accent: 'bg-primary/12 text-link',
  outline: 'border-border-strong text-foreground',
} as const;

// No es interactivo: sin estilos de foco. El borde transparente se vuelve
// visible en forced-colors.
const badgeVariants = cva(
  'inline-flex h-5 items-center gap-1 rounded-md border border-transparent px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
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
