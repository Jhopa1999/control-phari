import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** 20 px, text-muted-foreground, sin círculo de fondo. */
  icon?: LucideIcon;
  /** Qué es o qué pasa: «Aún no hay solicitudes.». */
  title: string;
  /** Cómo empezar. */
  description?: React.ReactNode;
  /** Solo si la pantalla ya ofrece esa acción. */
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** py-10 (por defecto) o py-6. */
  size?: 'default' | 'compact';
}

/**
 * Estado vacío (design §7.2): qué es y cómo empezar. Seguro para servidor (sin
 * hooks ni Radix): lo usan app/not-found.tsx y los fallback de Suspense.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'default',
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-4 text-center',
        size === 'compact' ? 'py-6' : 'py-10',
      )}
    >
      {Icon ? <Icon className="size-5 text-muted-foreground" aria-hidden="true" /> : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <div className="max-w-sm text-sm text-muted-foreground">{description}</div>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
