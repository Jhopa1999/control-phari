'use client';

import * as React from 'react';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Retraso antes de mostrar la barra de recarga (docs/design/oleada-3-listados.md §5.4). */
const PROGRESS_DELAY_MS = 400;

export interface ServerListBodyProps {
  /** Hay una recarga en curso con filas ya visibles. */
  reloading: boolean;
  /** Falló la última recarga: se muestran las filas anteriores con un aviso. */
  reloadFailed: boolean;
  onRetry: () => void;
  /** El servidor cortó el listado en el tope (cabecera X-Truncated). */
  truncated: boolean;
  /** Destino del foco programático (tabIndex -1), p. ej. tras «Limpiar». */
  containerRef?: React.Ref<HTMLDivElement>;
  /** Tabla, tarjetas móviles y paginación. */
  children: React.ReactNode;
}

/**
 * Cuerpo de un listado paginado en el servidor. Durante una recarga la tabla
 * NO se vacía ni se atenúa (sin opacity ni velo: el contraste del texto no
 * cambia); se marca con aria-busy, cursor de progreso, filas sin puntero y,
 * si tarda, una barra fina. El estado de carga lo anuncia el contador
 * (ResultCount, role=status) de la barra de herramientas.
 */
export function ServerListBody({
  reloading,
  reloadFailed,
  onRetry,
  truncated,
  containerRef,
  children,
}: ServerListBodyProps): React.ReactElement {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    if (!reloading) return;
    const timer = window.setTimeout(() => setSlow(true), PROGRESS_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [reloading]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      aria-busy={reloading || undefined}
      className={cn('relative focus-visible:outline-none', reloading && 'cursor-progress')}
    >
      {reloading && slow ? (
        <div
          aria-hidden="true"
          data-testid="recarga-listado"
          className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary motion-reduce:animate-none"
        />
      ) : null}
      {reloadFailed ? (
        <div className="px-3 pt-3">
          <InlineNotice
            tone="danger"
            role="alert"
            title="No se pudo actualizar la lista."
            action={
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            }
          >
            Se muestran los resultados anteriores, que pueden no corresponder a la búsqueda actual.
          </InlineNotice>
        </div>
      ) : null}
      {truncated ? (
        <div className="px-3 pt-3">
          <InlineNotice tone="warning" role="status" title="Mostramos solo las primeras 1.000 filas.">
            Hay más resultados. Afina la búsqueda o los filtros para verlos.
          </InlineNotice>
        </div>
      ) : null}
      {/* Las filas obsoletas no se abren durante la recarga. */}
      <div className={cn(reloading && 'pointer-events-none')}>{children}</div>
    </div>
  );
}
