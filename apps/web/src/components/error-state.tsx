'use client';

import * as React from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_TITLE = 'No fue posible cargar la información.';
const DEFAULT_MESSAGE =
  'Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.';

export interface ErrorStateProps {
  /** Qué pasó; por defecto «No fue posible cargar la información.». */
  title?: string;
  /** Mensaje del wrapper de la API; si falta, qué hacer en general. */
  message?: string | null;
  /** Normalmente la misma función `load` de la vista. */
  onRetry?: () => void;
  /** Por defecto «Reintentar». */
  retryLabel?: string;
  size?: 'default' | 'compact';
}

/** Error de carga (design §7.2): qué pasó, qué hacer y «Reintentar». */
export function ErrorState({
  title = DEFAULT_TITLE,
  message,
  onRetry,
  retryLabel = 'Reintentar',
  size = 'default',
}: ErrorStateProps): React.ReactElement {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 px-4 text-center',
        size === 'compact' ? 'py-6' : 'py-10',
      )}
    >
      <CircleAlert className="size-5 text-danger" aria-hidden="true" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message || DEFAULT_MESSAGE}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-2" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
