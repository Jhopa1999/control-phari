'use client';

import * as React from 'react';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ToolbarProps {
  /** Nombre del grupo (p. ej. «Filtros de mi trabajo»). */
  label: string;
  /** Búsqueda y filtros, cada uno con su etiqueta visible encima. */
  children: React.ReactNode;
  /** A la derecha: contador (ResultCount) y acciones secundarias («Limpiar filtros»). */
  end?: React.ReactNode;
  /**
   * En móvil (< sm) deja visible solo el primer hijo (la búsqueda) y pliega el
   * resto de filtros bajo un botón «Filtros». Desde sm no cambia nada. Auditoría
   * UX A3: cuatro filtros apilados ocupaban más de media pantalla en móvil.
   */
  collapseOnMobile?: boolean;
}

/**
 * Barra de búsqueda y filtros de un listado (design §7.1). Siempre es un
 * div[role=group] rotulado; los filtros se aplican al cambiar, salvo que la
 * vista lo envuelva en un <form onSubmit> con «Aplicar». En móvil cada filtro
 * ocupa una fila (cada filtro lleva w-full sm:w-auto).
 */
export function Toolbar({
  label,
  children,
  end,
  collapseOnMobile = false,
}: ToolbarProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const items = React.Children.toArray(children);
  const [first, ...rest] = items;
  const collapsible = collapseOnMobile && rest.length > 0;

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-end gap-2">
      {collapsible ? (
        <>
          {first}
          <Button
            type="button"
            variant="outline"
            className="w-full sm:hidden"
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
              vuelven a ser hijos directos del flex, como antes. */}
          <div id={panelId} className={cn('w-full flex-col gap-2 sm:contents', open ? 'flex' : 'hidden')}>
            {rest}
          </div>
        </>
      ) : (
        children
      )}
      {end ? (
        <div className="ml-auto flex min-h-9 flex-wrap items-center justify-end gap-2">{end}</div>
      ) : null}
    </div>
  );
}

export interface SearchInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'id' | 'placeholder'> {
  id: string;
  /** Etiqueta VISIBLE (WCAG 3.3.2); por defecto «Buscar». */
  label?: string;
  /** Obligatorio: dice por qué campo se busca (p. ej. «Título de la tarea»). */
  placeholder: string;
}

/** Campo de búsqueda del Toolbar, con la etiqueta visible alineada con los filtros. */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ id, label = 'Buscar', placeholder, className, ...props }, ref) => (
    <div className="grid w-full gap-1.5 sm:w-auto">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={ref}
          id={id}
          type="search"
          placeholder={placeholder}
          className={cn('w-full pl-8 sm:w-64', className)}
          {...props}
        />
      </div>
    </div>
  ),
);
SearchInput.displayName = 'SearchInput';

export { SearchInput };
