import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DescriptionItem {
  term: string;
  value: React.ReactNode;
  /** 2 = ocupa las dos columnas (p. ej. «Resultado esperado»). */
  span?: 1 | 2;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  columns?: 1 | 2;
  className?: string;
}

function isEmptyValue(value: React.ReactNode): boolean {
  return value === null || value === undefined || value === '' || value === false;
}

/**
 * Pares término/valor (design §7.6). Un valor vacío o null se muestra «—».
 * Seguro para servidor (sin hooks ni Radix).
 */
export function DescriptionList({
  items,
  columns = 1,
  className,
}: DescriptionListProps): React.ReactElement {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', columns === 2 && 'sm:grid-cols-2', className)}>
      {items.map((item, index) => (
        <div
          key={`${index}-${item.term}`}
          className={cn(
            'flex min-w-0 flex-col gap-0.5',
            columns === 2 && item.span === 2 && 'sm:col-span-2',
          )}
        >
          <dt className="text-meta text-muted-foreground">{item.term}</dt>
          <dd className="text-sm whitespace-pre-wrap wrap-break-word">
            {isEmptyValue(item.value) ? '—' : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
