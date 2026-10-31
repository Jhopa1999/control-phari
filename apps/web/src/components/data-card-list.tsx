'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { SortState } from '@/lib/table-sort';

/*
 * Vista de tarjetas por fila para móvil (< 768 px, BL-024). Es la variante
 * `md:hidden` de una tabla: la vista monta la tabla en `hidden md:block` y esta
 * lista al lado, ambas sobre `table.pageRows`. El corte es por CSS, así que la
 * variante oculta (display:none) queda fuera del árbol de accesibilidad.
 * Especificación: docs/design/tarjetas-moviles-bl-024.md.
 */

export interface DataCardMeta {
  label: string;
  /** null, undefined, false o '' se omiten; la vista pone «—» si quiere mostrarlo. */
  value: React.ReactNode;
}

export interface DataCard {
  /** Normalmente <CellTitle touch …>. */
  title: React.ReactNode;
  /** Una línea, text-meta. */
  subtitle?: React.ReactNode;
  /** StatusBadge / PriorityBadge; máximo 3, el resto va a `meta`. */
  badges?: React.ReactNode[];
  meta?: DataCardMeta[];
  /** <RowActions menuOnly …>; sin acciones no se reserva hueco. */
  actions?: React.ReactNode;
  /** Contenido libre bajo los badges (p. ej. el motivo de un bloqueo). */
  note?: React.ReactNode;
}

export interface DataCardSortOption<K extends string> {
  key: K;
  label: string;
}

export interface DataCardSort<K extends string> {
  value: SortState<K> | null;
  onChange: (next: SortState<K> | null) => void;
  options: DataCardSortOption<K>[];
}

export interface DataCardListProps<T, K extends string> {
  /** aria-label de la lista («Solicitudes»). */
  label: string;
  rows: readonly T[];
  getKey: (row: T) => string;
  card: (row: T) => DataCard;
  /** Sin cabeceras ordenables, el orden se elige aquí. */
  sort?: DataCardSort<K>;
}

function isFilled(value: React.ReactNode): boolean {
  return value !== null && value !== undefined && value !== false && value !== '';
}

function SortControl<K extends string>({ sort }: { sort: DataCardSort<K> }): React.ReactElement {
  const selectId = React.useId();
  const current = sort.value;
  const ascending = current?.direction !== 'desc';
  return (
    <div className="flex items-end gap-2 border-b p-3">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Label htmlFor={selectId}>Ordenar por</Label>
        <Select
          value={current?.key ?? ''}
          onValueChange={(value) => {
            const option = sort.options.find((o) => o.key === value);
            if (option) sort.onChange({ key: option.key, direction: current?.direction ?? 'asc' });
          }}
        >
          <SelectTrigger id={selectId} className="h-11 w-full">
            <SelectValue placeholder="Orden original" />
          </SelectTrigger>
          <SelectContent>
            {sort.options.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant="outline"
        className="size-11 shrink-0"
        aria-label={ascending ? 'Orden ascendente, invertir' : 'Orden descendente, invertir'}
        disabled={current === null}
        onClick={() => {
          if (current) {
            sort.onChange({ key: current.key, direction: ascending ? 'desc' : 'asc' });
          }
        }}
      >
        {ascending ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
      </Button>
    </div>
  );
}

/**
 * Lista de tarjetas: ul rotulada > li > (título, subtítulo, acciones, badges,
 * dl de metadatos). La tarjeta no es clicable entera: el título es la acción
 * principal y «…» el menú, así que no hay controles anidados.
 */
export function DataCardList<T, K extends string = string>({
  label,
  rows,
  getKey,
  card,
  sort,
}: DataCardListProps<T, K>): React.ReactElement {
  return (
    <div className="md:hidden">
      {sort ? <SortControl sort={sort} /> : null}
      <ul aria-label={label} className="flex flex-col gap-3 p-3">
        {rows.map((row) => {
          const data = card(row);
          const meta = (data.meta ?? []).filter((item) => isFilled(item.value));
          const badges = (data.badges ?? []).filter(isFilled);
          return (
            <li key={getKey(row)} className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  {data.title}
                  {isFilled(data.subtitle) ? (
                    <span className="truncate text-meta text-muted-foreground">
                      {data.subtitle}
                    </span>
                  ) : null}
                </div>
                {data.actions ? <div className="-mr-1 -mt-1 shrink-0">{data.actions}</div> : null}
              </div>
              {badges.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {badges.map((badge, index) => (
                    <React.Fragment key={index}>{badge}</React.Fragment>
                  ))}
                </div>
              ) : null}
              {isFilled(data.note) ? (
                <div className="mt-2 line-clamp-2 text-meta text-muted-foreground">{data.note}</div>
              ) : null}
              {meta.length > 0 ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-meta">
                  {meta.map((item) => (
                    <div key={item.label} className="min-w-0">
                      <dt className="text-muted-foreground">{item.label}</dt>
                      <dd className="text-foreground tabular-nums wrap-break-word">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Esqueleto de la lista de tarjetas (3 tarjetas); decorativo, como TableSkeleton. */
export function CardListSkeleton({ cards = 3 }: { cards?: number }): React.ReactElement {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 p-3 md:hidden">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
          <Skeleton className="h-4 w-3/5" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
