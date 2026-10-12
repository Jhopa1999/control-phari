'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
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
}

/**
 * Barra de búsqueda y filtros de un listado (design §7.1). Siempre es un
 * div[role=group] rotulado; los filtros se aplican al cambiar, salvo que la
 * vista lo envuelva en un <form onSubmit> con «Aplicar». En móvil cada filtro
 * ocupa una fila (cada filtro lleva w-full sm:w-auto).
 */
export function Toolbar({ label, children, end }: ToolbarProps): React.ReactElement {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-end gap-2">
      {children}
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
