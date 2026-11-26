import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** 20 px dentro de un círculo primary-subtle (text-link). */
  icon?: LucideIcon;
  /** Qué es o qué pasa: «Aún no hay solicitudes.». */
  title: string;
  /** Cómo empezar. */
  description?: React.ReactNode;
  /** Solo si la pantalla ya ofrece esa acción. */
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /**
   * py-6 (por defecto), py-4 (compact) o una sola línea (inline): para bloques
   * secundarios donde un vacío grande empuja el contenido útil hacia abajo.
   */
  size?: 'default' | 'compact' | 'inline';
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
  if (size === 'inline') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-4 text-center text-sm">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        <p className="font-semibold">{title}</p>
        {description ? <div className="text-muted-foreground">{description}</div> : null}
        {action || secondaryAction ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-4 text-center',
        size === 'compact' ? 'py-4' : 'py-6',
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className={cn(
          'flex items-center justify-center rounded-full bg-primary-subtle text-link',
          size === 'compact' ? 'size-8' : 'size-10',
        )}
        >
          <Icon className={size === 'compact' ? 'size-4' : 'size-5'} />
        </span>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
