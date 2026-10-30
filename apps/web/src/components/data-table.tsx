'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableHead } from '@/components/ui/table';
import { LabelTooltip } from '@/components/ui/tooltip';
import { formatCount } from '@/lib/format';
import type { SortState } from '@/lib/table-sort';
import type { ClientTablePageSize } from '@/lib/use-client-table';
import { cn } from '@/lib/utils';

/*
 * Piezas de listado reutilizables (design §7.6 y §24.1). El filtrado, el orden y
 * la paginación son de presentación, en cliente (useClientTable), sobre lo que
 * ya devuelve la API.
 */

const NUMBER_FORMAT = new Intl.NumberFormat('es');

export interface CountNoun {
  one: string;
  other: string;
}

export interface SortableTableHeadProps<K extends string> {
  /** 1–2 palabras, sentence case. */
  label: string;
  sortKey: K;
  sort: SortState<K> | null;
  /** ClientTable.toggleSort */
  onSort: (key: K) => void;
  /** 'right' en columnas numéricas. */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Encabezado ordenable (patrón Carbon): un <button> dentro del <th>. aria-sort
 * solo en la columna activa; el ciclo lo decide nextSort (table-sort.ts). El
 * nombre accesible empieza por el texto visible y añade «, ordenar»
 * («Registro, ordenar»).
 */
export function SortableTableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  className,
}: SortableTableHeadProps<K>): React.ReactElement {
  const active = sort !== null && sort.key === sortKey;
  const ascending = active && sort.direction === 'asc';
  return (
    <TableHead
      aria-sort={active ? (ascending ? 'ascending' : 'descending') : undefined}
      className={cn('p-0', className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'flex h-9 w-full items-center gap-1 px-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&_svg]:size-3.5 [&_svg]:shrink-0',
          align === 'right' && 'justify-end text-right',
          active && 'text-foreground',
        )}
      >
        {/* El nombre accesible va entero en el sr-only («Registro, ordenar»): un
            sr-only suelto junto al texto visible se calcula con un espacio delante
            de la coma, porque su position:absolute lo vuelve de bloque. */}
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{`${label}, ordenar`}</span>
        {active ? (
          ascending ? (
            <ArrowUp aria-hidden="true" />
          ) : (
            <ArrowDown aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown aria-hidden="true" className="opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export interface ResultCountProps {
  loading: boolean;
  /** Filas recibidas, antes de filtrar. */
  total: number;
  /** Filas que pasan la búsqueda y los filtros. */
  filtered: number;
  noun: CountNoun;
}

/**
 * Conteo visible del listado, que además es su región viva (role=status). Va
 * en el `end` del Toolbar; si la vista lo muestra, no pasa statusText a
 * DataView. Regla del NIT 7: filtered === total → «45 solicitudes»; en otro
 * caso, «12 de 45 solicitudes».
 */
export function ResultCount({ loading, total, filtered, noun }: ResultCountProps): React.ReactElement {
  let text: string;
  if (loading) text = `Cargando ${noun.other}…`;
  else if (filtered === total) text = formatCount(total, noun);
  else text = `${NUMBER_FORMAT.format(filtered)} de ${formatCount(total, noun)}`;
  return (
    <p role="status" className="text-meta tabular-nums text-muted-foreground">
      {text}
    </p>
  );
}

const PAGE_SIZES: readonly ClientTablePageSize[] = [25, 50, 100];

export interface DataTablePaginationProps {
  /** 'mt-paginacion' → el selector de filas lleva `${id}-filas`. */
  id: string;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  filtered: number;
  pageSize: ClientTablePageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: ClientTablePageSize) => void;
  noun: CountNoun;
}

/**
 * Paginación en cliente, al pie del contenedor de DataView. Se renderiza
 * SIEMPRE que la tabla está en estado ready, haya o no más filas que el tamaño
 * de página (§24.1.4, plan D5): así el control no aparece y desaparece al
 * filtrar. Los extremos deshabilitan el botón correspondiente (límite natural,
 * sin motivo); si el botón pulsado queda deshabilitado, el foco pasa al otro.
 */
export function DataTablePagination({
  id,
  page,
  pageCount,
  from,
  to,
  filtered,
  pageSize,
  onPageChange,
  onPageSizeChange,
  noun,
}: DataTablePaginationProps): React.ReactElement {
  const previousRef = React.useRef<HTMLButtonElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const selectId = `${id}-filas`;

  function goTo(target: number, pressed: 'previous' | 'next'): void {
    onPageChange(target);
    // Tras el render, si el botón pulsado quedó deshabilitado (extremo), el
    // foco pasa al otro para que el teclado no lo pierda.
    requestAnimationFrame(() => {
      const pressedButton = pressed === 'next' ? nextRef.current : previousRef.current;
      const otherButton = pressed === 'next' ? previousRef.current : nextRef.current;
      const focusLost =
        document.activeElement === pressedButton || document.activeElement === document.body;
      if (pressedButton?.disabled && focusLost && otherButton && !otherButton.disabled) {
        otherButton.focus();
      }
    });
  }

  return (
    <nav
      id={id}
      aria-label={`Paginación de ${noun.other}`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-3 py-2 text-meta text-muted-foreground"
    >
      <p className="tabular-nums">
        {`${NUMBER_FORMAT.format(from)}–${NUMBER_FORMAT.format(to)} de ${formatCount(filtered, noun)}`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={selectId} className="font-normal text-muted-foreground">
            Filas por página
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const size = PAGE_SIZES.find((option) => String(option) === value);
              if (size !== undefined) onPageSizeChange(size);
            }}
          >
            <SelectTrigger id={selectId} className="h-8 w-20 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="tabular-nums">{`Página ${NUMBER_FORMAT.format(page)} de ${NUMBER_FORMAT.format(pageCount)}`}</p>
        <div className="flex items-center gap-1">
          <LabelTooltip label="Página anterior">
            <Button
              ref={previousRef}
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => goTo(page - 1, 'previous')}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Página siguiente">
            <Button
              ref={nextRef}
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Página siguiente"
              disabled={page >= pageCount}
              onClick={() => goTo(page + 1, 'next')}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </LabelTooltip>
        </div>
      </div>
    </nav>
  );
}

export interface CellTitleProps {
  /** Texto completo; también va en `title`. */
  children: string;
  /** Con onOpen → <button>. */
  onOpen?: () => void;
  /** Con href → <Link>. Sin ninguno → <span>. */
  href?: string;
  /** Segunda línea en text-meta. */
  meta?: React.ReactNode;
}

const CELL_TITLE_CONTROL =
  'inline-block min-h-6 max-w-full rounded-sm text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Celda de título: identificador legible y acción principal de la fila. El
 * recorte a dos líneas va en un span interior, no en el control, para que el
 * outline de foco rodee las dos líneas. La celda que lo contiene lleva
 * "min-w-56 max-w-[28rem]".
 */
export function CellTitle({ children, onOpen, href, meta }: CellTitleProps): React.ReactElement {
  const text = <span className="line-clamp-2 wrap-break-word">{children}</span>;
  let control: React.ReactElement;
  if (onOpen) {
    control = (
      <button type="button" onClick={onOpen} title={children} className={CELL_TITLE_CONTROL}>
        {text}
      </button>
    );
  } else if (href) {
    control = (
      <Link href={href} title={children} className={CELL_TITLE_CONTROL}>
        {text}
      </Link>
    );
  } else {
    control = (
      <span title={children} className="inline-block max-w-full text-left font-medium text-foreground">
        {text}
      </span>
    );
  }
  if (meta === undefined || meta === null) return control;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {control}
      <span className="text-meta text-muted-foreground">{meta}</span>
    </div>
  );
}
