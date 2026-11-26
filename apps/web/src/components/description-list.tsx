import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DescriptionItem {
  term: string;
  value: React.ReactNode;
  /** 2 = ocupa dos columnas (p. ej. «Resultado esperado»). */
  span?: 1 | 2;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  /**
   * 1 y 2 siguen el ancho de la ventana. 3 y 4 siguen el ancho del propio
   * contenedor (2 desde 28 rem, 3 desde 42 rem y, con 4, 4 desde 56 rem), de modo
   * que una ficha en media columna no se estrecha de más.
   */
  columns?: 1 | 2 | 3 | 4;
  /**
   * Agrupa los datos vacíos en una sola línea «Sin datos: …» en lugar de repetir
   * una celda con «—» por cada uno.
   */
  collapseEmpty?: boolean;
  className?: string;
}

function isEmptyValue(value: React.ReactNode): boolean {
  return value === null || value === undefined || value === '' || value === false;
}

const GRID_COLUMNS = {
  1: '',
  2: 'sm:grid-cols-2',
  3: '@md:grid-cols-2 @2xl:grid-cols-3',
  4: '@md:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4',
} as const;

/**
 * Pares término/valor (design §7.6). Un valor vacío o null se muestra «—», o
 * se agrupa en una línea «Sin datos» con `collapseEmpty`.
 * Seguro para servidor (sin hooks ni Radix).
 */
export function DescriptionList({
  items,
  columns = 1,
  collapseEmpty = false,
  className,
}: DescriptionListProps): React.ReactElement {
  const shown = collapseEmpty ? items.filter((item) => !isEmptyValue(item.value)) : items;
  const empty = collapseEmpty ? items.filter((item) => isEmptyValue(item.value)) : [];
  const spanClass = columns >= 3 ? '@md:col-span-2' : 'sm:col-span-2';
  const list =
    shown.length > 0 ? (
      <dl className={cn('grid gap-x-6 gap-y-3', GRID_COLUMNS[columns], className)}>
        {shown.map((item, index) => (
          <div
            key={`${index}-${item.term}`}
            className={cn(
              'flex min-w-0 flex-col gap-0.5',
              columns >= 2 && item.span === 2 && spanClass,
            )}
          >
            <dt className="text-meta text-muted-foreground">{item.term}</dt>
            <dd className="text-sm whitespace-pre-wrap wrap-break-word">
              {isEmptyValue(item.value) ? '—' : item.value}
            </dd>
          </div>
        ))}
      </dl>
    ) : null;
  if (!collapseEmpty && columns < 3) return list as React.ReactElement;
  return (
    <div className="@container flex min-w-0 flex-col gap-2">
      {list}
      {empty.length > 0 ? (
        <p className="text-meta text-muted-foreground">
          {`Sin datos: ${empty.map((item) => item.term).join(', ')}.`}
        </p>
      ) : null}
    </div>
  );
}
