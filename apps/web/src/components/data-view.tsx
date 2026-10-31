'use client';

import * as React from 'react';
import { CardListSkeleton } from '@/components/data-card-list';
import { EmptyState, type EmptyStateProps } from '@/components/empty-state';
import { ErrorState, type ErrorStateProps } from '@/components/error-state';
import { TableSkeleton } from '@/components/table-skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export { TableSkeleton };

export type DataViewState = 'loading' | 'error' | 'empty' | 'no-results' | 'ready';

const NO_RESULTS_TITLE = 'Ningún resultado coincide con los filtros.';
const NO_RESULTS_DESCRIPTION = 'Cambia o limpia los filtros para ver más resultados.';

export interface DataViewProps {
  state: DataViewState;
  /** Tamaño del esqueleto; por defecto 5 × 4. */
  loading?: { rows?: number; columns?: number };
  error?: ErrorStateProps;
  empty?: EmptyStateProps;
  /**
   * `onClear` solo en vistas SIN Toolbar: con Toolbar, «Limpiar filtros» vive en
   * su `end` y aparecerían dos botones con el mismo nombre (design §7.2).
   */
  noResults?: { title?: string; description?: string; onClear?: () => void };
  /**
   * Texto sr-only con role=status («Cargando solicitudes…», «25 solicitudes»,
   * «Sin resultados»). Nunca repite un texto visible; si la vista muestra
   * ResultCount, no lo pasa.
   */
  statusText?: string;
  /** Contenedor con borde; por defecto true. */
  bordered?: boolean;
  /**
   * La vista ofrece tarjetas en móvil (BL-024): en carga se muestra el esqueleto
   * de tarjetas por debajo de md y el de tabla desde md.
   */
  mobileCards?: boolean;
  /** La tabla (y su paginación); solo se renderiza en 'ready'. */
  children?: React.ReactNode;
}

/**
 * Estados de un bloque de datos (design §7.2): carga, error, vacío, sin
 * resultados y listo. En 'ready' pinta `children` tal cual: la tabla aporta su
 * región desplazable con `scrollLabel`.
 */
export function DataView({
  state,
  loading,
  error,
  empty,
  noResults,
  statusText,
  bordered = true,
  mobileCards = false,
  children,
}: DataViewProps): React.ReactElement {
  let content: React.ReactNode;
  if (state === 'loading') {
    const table = <TableSkeleton rows={loading?.rows} columns={loading?.columns} />;
    content = mobileCards ? (
      <div aria-busy="true">
        <div className="hidden md:block">{table}</div>
        <CardListSkeleton />
      </div>
    ) : (
      <div aria-busy="true">{table}</div>
    );
  } else if (state === 'error') {
    content = <ErrorState {...error} />;
  } else if (state === 'empty') {
    content = empty ? <EmptyState {...empty} /> : null;
  } else if (state === 'no-results') {
    const onClear = noResults?.onClear;
    content = (
      <EmptyState
        title={noResults?.title ?? NO_RESULTS_TITLE}
        description={noResults?.description ?? NO_RESULTS_DESCRIPTION}
        action={
          onClear ? (
            <Button type="button" variant="outline" size="sm" onClick={onClear}>
              Limpiar filtros
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = children;
  }
  return (
    <div className={cn(bordered && 'overflow-hidden rounded-xl border bg-card shadow-card')}>
      {statusText !== undefined ? (
        <p role="status" className="sr-only">
          {statusText}
        </p>
      ) : null}
      {content}
    </div>
  );
}
