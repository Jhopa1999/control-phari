'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleAlert, Lock, LogIn, RefreshCw, SearchX, WifiOff, type LucideIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { classifyError, type ErrorKind } from '@/lib/api-error';
import { cn } from '@/lib/utils';

const SERVER_TITLE = 'No fue posible cargar la información.';
const NETWORK_TITLE = 'No hay conexión con el servidor.';
const NETWORK_MESSAGE =
  'Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.';
const FORBIDDEN_TITLE = 'No tienes permiso para ver esta información.';
const FORBIDDEN_MESSAGE =
  'Tu rol no incluye este contenido. Si lo necesitas, pídelo al jefe de área.';
const NOT_FOUND_TITLE = 'No se encontró lo que buscas.';
const NOT_FOUND_MESSAGE = 'No existe o fue removido.';
const UNAUTHORIZED_TITLE = 'Tu sesión caducó.';
const UNAUTHORIZED_MESSAGE = 'Inicia sesión de nuevo para continuar.';
const SERVER_MESSAGE =
  'Ocurrió un error interno. Inténtalo de nuevo; si continúa, avisa al administrador.';

interface Presentation {
  Icon: LucideIcon;
  tone: 'danger' | 'neutral';
  role: 'alert' | 'status';
  title: string;
  message: string;
  canRetry: boolean;
}

function presentationFor(kind: ErrorKind, serverMessage: string): Presentation {
  const text = serverMessage.trim() !== '' ? serverMessage : undefined;
  switch (kind) {
    case 'forbidden':
      return {
        Icon: Lock, tone: 'neutral', role: 'status', title: FORBIDDEN_TITLE,
        message: text ?? FORBIDDEN_MESSAGE, canRetry: false,
      };
    case 'unauthorized':
      return {
        Icon: LogIn, tone: 'neutral', role: 'status', title: UNAUTHORIZED_TITLE,
        message: UNAUTHORIZED_MESSAGE, canRetry: false,
      };
    case 'notFound':
      return {
        Icon: SearchX, tone: 'danger', role: 'alert', title: NOT_FOUND_TITLE,
        message: text ?? NOT_FOUND_MESSAGE, canRetry: true,
      };
    case 'network':
      return {
        Icon: WifiOff, tone: 'danger', role: 'alert', title: NETWORK_TITLE,
        message: NETWORK_MESSAGE, canRetry: true,
      };
    default:
      return {
        Icon: CircleAlert, tone: 'danger', role: 'alert', title: SERVER_TITLE,
        message: text ?? SERVER_MESSAGE, canRetry: true,
      };
  }
}

export interface ErrorStateProps {
  /**
   * El fallo tal cual lo lanzó el wrapper de la API. Define el tipo (403, red,
   * servidor, 404, 401) y el texto del servidor.
   */
  error?: unknown;
  /** Sustituye el título calculado. */
  title?: string;
  /** Sustituye el mensaje calculado (gana al texto del servidor). */
  message?: string | null;
  /** Normalmente la misma función `load` de la vista. No se muestra en 403 ni 401. */
  onRetry?: () => void;
  /** Por defecto «Reintentar». */
  retryLabel?: string;
  size?: 'default' | 'compact';
}

/**
 * Error de carga (design §7.2 y oleada 3 §3): distingue un 403 (sin
 * «Reintentar»), un fallo de red («Revisa tu conexión…»), un error del
 * servidor (con su mensaje) y un 404. «Revisa tu conexión» solo aparece en red.
 */
export function ErrorState({
  error,
  title,
  message,
  onRetry,
  retryLabel = 'Reintentar',
  size = 'default',
}: ErrorStateProps): React.ReactElement {
  // Sin `error`: con `message` explícito es un error de servidor (comportamiento
  // anterior); sin nada, un fallo de red.
  const hasError = error !== undefined && error !== null;
  const classified = hasError ? classifyError(error) : undefined;
  const kind: ErrorKind = classified?.kind ?? (message ? 'server' : 'network');
  const presentation = presentationFor(kind, classified?.message ?? '');
  const shownTitle = title ?? presentation.title;
  const shownMessage = message ? message : presentation.message;
  return (
    <div
      role={presentation.role}
      className={cn(
        'flex flex-col items-center gap-2 px-4 text-center',
        size === 'compact' ? 'py-6' : 'py-10',
      )}
    >
      <presentation.Icon
        className={cn('size-5', presentation.tone === 'danger' ? 'text-danger' : 'text-neutral')}
        aria-hidden="true"
      />
      <p className="text-sm font-semibold">{shownTitle}</p>
      <p className="max-w-md whitespace-pre-line break-words text-sm text-muted-foreground">
        {shownMessage}
      </p>
      {kind === 'unauthorized' ? (
        <Link
          href="/login?expired=1"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'mt-2 pointer-coarse:min-h-11',
          )}
        >
          <LogIn aria-hidden="true" />
          Iniciar sesión
        </Link>
      ) : null}
      {onRetry && presentation.canRetry ? (
        <Button
          type="button"
          variant="outline"
          className="mt-2 pointer-coarse:min-h-11"
          onClick={onRetry}
        >
          <RefreshCw aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
