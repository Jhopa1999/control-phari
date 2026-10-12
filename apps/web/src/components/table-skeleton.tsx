import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CELL_WIDTHS = ['w-3/5', 'w-2/5', 'w-[30%]'] as const;

export interface TableSkeletonProps {
  /** Por defecto 5. */
  rows?: number;
  /** Por defecto 4. */
  columns?: number;
}

/**
 * Esqueleto de tabla (design §7.2): encabezado de 36 px y filas de 40 px con
 * celdas de anchos 60/40/30 %. Decorativo (aria-hidden): el estado lo anuncian
 * ResultCount o el statusText de DataView.
 *
 * Vive en su propio archivo para seguir siendo seguro para servidor (sin
 * 'use client', hooks ni Radix); data-view.tsx lo reexporta.
 */
export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps): React.ReactElement {
  return (
    <div aria-hidden="true">
      <div className="h-9 border-b bg-muted/50" />
      <div className="divide-y">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex h-10 items-center gap-3 px-3">
            {Array.from({ length: columns }, (_, column) => (
              <div key={column} className="flex-1">
                <Skeleton className={cn('h-4', CELL_WIDTHS[(row + column) % CELL_WIDTHS.length])} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
