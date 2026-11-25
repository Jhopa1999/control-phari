'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ListPagerProps {
  /** Nombre de la paginación: «Paginación de actas». */
  label: string;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  /** Hay una carga en curso: los botones se marcan `aria-disabled` y no actúan. */
  busy: boolean;
  onPageChange: (page: number) => void;
}

/**
 * Paginación compacta de la columna de 320 px. Con una sola página muestra solo
 * la posición. Durante la carga usa `aria-disabled` (no `disabled`) para que el
 * botón pulsado conserve el foco; `disabled` real solo en el límite natural.
 */
export function ListPager({
  label,
  page,
  pageCount,
  from,
  to,
  total,
  busy,
  onPageChange,
}: ListPagerProps): React.ReactElement | null {
  if (total <= 0) return null;
  const position = total > 0 && to > 0 ? `Mostrando ${from}–${to} de ${total}` : 'Sin resultados';
  const atFirst = page <= 1;
  const atLast = page >= pageCount;
  return (
    <nav
      aria-label={label}
      className="sticky bottom-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t bg-card px-3 py-2 text-meta text-muted-foreground"
    >
      <span className="tabular-nums">{position}</span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="max-md:size-11"
            aria-label="Página anterior"
            disabled={atFirst}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (!busy) onPageChange(page - 1);
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="px-1 tabular-nums">{`Página ${page} de ${pageCount}`}</span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="max-md:size-11"
            aria-label="Página siguiente"
            disabled={atLast}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (!busy) onPageChange(page + 1);
            }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
