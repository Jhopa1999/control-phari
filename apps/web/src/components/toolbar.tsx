'use client';

import * as React from 'react';
import { ChevronDown, Info, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface ToolbarProps {
  /** Nombre del grupo (p. ej. «Filtros de mi trabajo»). */
  label: string;
  /** Búsqueda y filtros frecuentes (FilterField, MultiSelectFilter) en una fila. */
  children: React.ReactNode;
  /** A la derecha: contador (ResultCount) y acciones secundarias («Limpiar filtros»). */
  end?: React.ReactNode;
  /**
   * En móvil (< sm) deja visible solo el primer hijo (la búsqueda) y pliega el
   * resto de filtros bajo un botón «Filtros». Desde sm no cambia nada. Auditoría
   * UX A3: cuatro filtros apilados ocupaban más de media pantalla en móvil.
   */
  collapseOnMobile?: boolean;
  /**
   * Filtros menos frecuentes (design §6): quedan bajo el botón «Más filtros»,
   * que despliega un panel en línea bajo la barra.
   */
  more?: React.ReactNode;
  /** Filtros activos dentro de `more`; se muestran como contador en el botón. */
  moreActiveCount?: number;
}

/**
 * Barra de búsqueda y filtros de un listado (design §6). Siempre es un
 * div[role=group] rotulado; los filtros se aplican al cambiar, salvo que la
 * vista lo envuelva en un <form onSubmit> con «Aplicar». Desde md va en una
 * fila; en móvil cada filtro ocupa una fila (cada filtro lleva w-full sm:w-auto).
 */
export function Toolbar({
  label,
  children,
  end,
  collapseOnMobile = false,
  more,
  moreActiveCount = 0,
}: ToolbarProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const panelId = React.useId();
  const morePanelId = React.useId();
  const items = React.Children.toArray(children);
  const [first, ...rest] = items;
  const collapsible = collapseOnMobile && rest.length > 0;
  const hasMore = more !== undefined && more !== null && more !== false;
  const moreButton = hasMore ? (
    <Button
      key="more-button"
      type="button"
      variant="outline"
      className="w-full max-sm:h-11 sm:w-auto"
      aria-expanded={moreOpen}
      aria-controls={morePanelId}
      onClick={() => setMoreOpen((value) => !value)}
    >
      <SlidersHorizontal aria-hidden="true" />
      Más filtros
      {moreActiveCount > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-foreground tabular-nums">
          {moreActiveCount}
          <span className="sr-only">{moreActiveCount === 1 ? ' activo' : ' activos'}</span>
        </span>
      ) : null}
      <ChevronDown
        aria-hidden="true"
        className={cn('transition-transform motion-reduce:transition-none', moreOpen && 'rotate-180')}
      />
    </Button>
  ) : null;
  const morePanel = hasMore ? (
    <div
      key="more-panel"
      id={morePanelId}
      className={cn('w-full flex-wrap items-center gap-2 border-t pt-2', moreOpen ? 'flex' : 'hidden')}
    >
      {more}
    </div>
  ) : null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {collapsible ? (
        <>
          {first}
          <Button
            type="button"
            variant="outline"
            className="w-full max-sm:h-11 sm:hidden"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filtros
            <ChevronDown
              aria-hidden="true"
              className={cn('ml-auto transition-transform motion-reduce:transition-none', open && 'rotate-180')}
            />
          </Button>
          {/* sm:contents: desde sm el contenedor no genera caja y los filtros
              vuelven a ser hijos directos del flex. */}
          <div id={panelId} className={cn('w-full flex-col gap-2 sm:contents', open ? 'flex' : 'hidden')}>
            {rest}
            {moreButton}
          </div>
        </>
      ) : (
        <>
          {children}
          {moreButton}
        </>
      )}
      {end ? (
        <div className="ml-auto flex min-h-9 flex-wrap items-center justify-end gap-2">{end}</div>
      ) : null}
      {morePanel}
    </div>
  );
}

export interface FilterFieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FilterFieldProps {
  /** Id del control (SelectTrigger o Input); el Label usa htmlFor={id}. */
  id: string;
  /** Etiqueta VISIBLE dentro del campo (WCAG 3.3.2, 2.5.3). */
  label: string;
  /** Ayuda breve: la lee el lector de pantalla y sale como título del campo. */
  help?: string;
  /** Error de una regla del campo; sale bajo el campo y marca aria-invalid. */
  error?: string | null;
  /**
   * Un SelectTrigger o un Input (el campo le quita borde y fondo), o una función
   * que recibe id, aria-describedby y aria-invalid para esparcirlos en el control.
   */
  children: React.ReactNode | ((control: FilterFieldControlProps) => React.ReactNode);
  /** Ancho desde sm (por omisión sm:w-52). */
  className?: string;
}

/**
 * Campo de filtro con la etiqueta dentro (design §6): 36 px de alto con la
 * etiqueta incluida; el foco se dibuja en el contenedor. En móvil ocupa la fila
 * completa y mide 44 px.
 */
export function FilterField({
  id,
  label,
  help,
  error,
  children,
  className,
}: FilterFieldProps): React.ReactElement {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const control: FilterFieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  };
  return (
    <div className={cn('grid w-full min-w-0 gap-1 sm:w-52', className)}>
      <div
        title={help}
        className={cn(
          'flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-background transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[[aria-invalid=true]]:border-danger max-sm:h-11',
          '[&>button]:h-full [&>button]:flex-1 [&>button]:rounded-l-none [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-1.5 [&>button]:shadow-none [&>button]:focus-visible:border-0 [&>button]:focus-visible:outline-0',
          '[&>input]:h-full [&>input]:flex-1 [&>input]:rounded-l-none [&>input]:border-0 [&>input]:bg-transparent [&>input]:px-1.5 [&>input]:shadow-none [&>input]:focus-visible:border-0 [&>input]:focus-visible:outline-0',
        )}
      >
        <Label htmlFor={id} className="shrink-0 pl-3 pr-1.5 font-normal whitespace-nowrap text-muted-foreground">
          {label}
        </Label>
        {typeof children === 'function' ? children(control) : children}
      </div>
      {help ? (
        <span id={helpId} className="sr-only">
          {help}
        </span>
      ) : null}
      {error ? (
        <p id={errorId} className="text-meta text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface FilterNoteProps {
  /** Nombre accesible del botón (p. ej. «Qué significan P1 a P4»). */
  label: string;
  /** Texto de la nota; sale del flujo de la barra y se ve en un tooltip. */
  children: React.ReactNode;
}

/** Nota larga de una barra de filtros en un icono «Info» con tooltip (design §6). */
export function FilterNote({ label, children }: FilterNoteProps): React.ReactElement {
  return (
    <LabelTooltip label={children}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
        <Info aria-hidden="true" />
      </Button>
    </LabelTooltip>
  );
}

export interface SearchInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'id' | 'placeholder'> {
  id: string;
  /** Nombre accesible del campo (oculto); por defecto «Buscar». */
  label?: string;
  /** Obligatorio: dice por qué campo se busca (p. ej. «Título de la tarea»). */
  placeholder: string;
}

/**
 * Campo de búsqueda del Toolbar. La lupa y el marcador dicen qué se busca; la
 * etiqueta es solo para lectores de pantalla (design §6, punto 1).
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ id, label = 'Buscar', placeholder, className, ...props }, ref) => (
    <div className="relative w-full sm:w-auto">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={ref}
        id={id}
        type="search"
        placeholder={placeholder}
        className={cn('w-full pl-8 max-sm:h-11 sm:w-64 xl:w-72', className)}
        {...props}
      />
    </div>
  ),
);
SearchInput.displayName = 'SearchInput';

export { SearchInput };
