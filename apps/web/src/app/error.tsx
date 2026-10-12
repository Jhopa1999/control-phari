'use client';

import * as React from 'react';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';

interface RouteErrorProps {
  error: Error & { digest?: string };
  /** Vuelve a pedir y a pintar el segmento (estable desde Next 16.3). */
  retry: () => void;
}

/**
 * Error de ejecución de una pantalla (design §8.6). Se pinta dentro del shell,
 * porque RouteGuard vive en el layout raíz. No muestra `error.message` (en
 * producción es genérico) ni lo registra: el portal no tiene logging en el
 * cliente (§16). No se llama `Error` para no ocultar el global.
 */
export default function RouteError({ retry }: RouteErrorProps): React.ReactElement {
  return (
    <PageLayout>
      <PageHeader title="No fue posible mostrar esta pantalla" />
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="Ocurrió un error inesperado."
          message="Inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal."
          onRetry={retry}
        />
      </div>
    </PageLayout>
  );
}
