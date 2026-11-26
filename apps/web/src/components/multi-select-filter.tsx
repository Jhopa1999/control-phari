'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  announceSelection,
  normalizeSelection,
  summarizeSelection,
  toggleValue,
  type MultiFilterOption,
} from '@/lib/multi-filter';
import { cn } from '@/lib/utils';

export type MultiSelectOption = MultiFilterOption;

export interface MultiSelectFilterProps {
  /** Id del disparador; el Label usa htmlFor={id}. */
  id: string;
  /** Etiqueta visible dentro del campo, antes del valor. */
  label: string;
  options: MultiSelectOption[];
  /** Valores seleccionados; vacío = sin restricción. */
  selected: string[];
  /** Recibe la selección completa, en el orden de `options`, sin duplicados. */
  onChange: (next: string[]) => void;
  /** Texto con la selección vacía: «Todos» (por omisión) o «Todas». */
  placeholder?: string;
  /** Género del «N seleccionados/seleccionadas». Por omisión 'm'. */
  gender?: 'm' | 'f';
  /** Ancho del campo desde sm, p. ej. 'sm:w-44' (por omisión sm:w-52). */
  className?: string;
  /** Aviso de apertura/cierre del panel (p. ej. para aplicar la selección al cerrar). */
  onOpenChange?: (open: boolean) => void;
}

// Evita que Radix cierre el panel al alternar una opción (spec §3.1).
function keepOpen(event: Event) {
  event.preventDefault();
}

/**
 * Filtro de selección múltiple sobre el DropdownMenu de Radix (spec
 * docs/design/filtros-seleccion-multiple.md). O dentro del filtro; sin
 * selección = sin restricción. La opción «Todos» limpia la selección.
 */
export function MultiSelectFilter({
  id,
  label,
  options,
  selected,
  onChange,
  placeholder = 'Todos',
  gender = 'm',
  className,
  onOpenChange,
}: MultiSelectFilterProps) {
  const labelId = `${id}-etiqueta`;
  const valueId = `${id}-valor`;
  const summary = summarizeSelection(options, selected, placeholder, gender);
  const active = normalizeSelection(options, selected);
  const hasSelection = active.length > 0;

  // Segmentos por grupo: un cambio de grupo pinta separador y, si lo tiene, encabezado.
  const segments: { group: string | undefined; items: MultiSelectOption[] }[] = [];
  for (const option of options) {
    const last = segments[segments.length - 1];
    if (last && last.group === option.group) last.items.push(option);
    else segments.push({ group: option.group, items: [option] });
  }

  return (
    <div
      className={cn(
        'flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-background transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring max-sm:h-11 sm:w-52',
        className,
      )}
    >
      <Label
        id={labelId}
        htmlFor={id}
        className="shrink-0 pl-3 pr-1.5 font-normal whitespace-nowrap text-muted-foreground"
      >
        {label}
      </Label>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          id={id}
          aria-labelledby={`${labelId} ${valueId}`}
          className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 rounded-r-md bg-transparent px-1.5 text-left text-sm whitespace-nowrap focus-visible:outline-0 disabled:cursor-not-allowed disabled:text-muted-foreground"
        >
          <span
            id={valueId}
            className={cn(
              'line-clamp-1 min-w-0',
              hasSelection ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {summary}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] min-w-[max(14rem,var(--radix-dropdown-menu-trigger-width))] max-w-[min(18rem,calc(100vw-1rem))] overflow-y-auto"
        >
          <div role="status" className="sr-only">
            {announceSelection(label, options, selected, gender)}
          </div>
          <DropdownMenuCheckboxItem
            checked={!hasSelection}
            textValue={placeholder}
            onSelect={keepOpen}
            onCheckedChange={() => onChange([])}
          >
            {placeholder}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {segments.map((segment, index) => {
            const headingId = segment.group ? `${id}-grupo-${index}` : undefined;
            return (
              <React.Fragment key={`${segment.group ?? ''}-${index}`}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuGroup aria-labelledby={headingId}>
                  {segment.group ? (
                    <DropdownMenuLabel id={headingId}>{segment.group}</DropdownMenuLabel>
                  ) : null}
                  {segment.items.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={active.includes(option.value)}
                      textValue={option.label}
                      onSelect={keepOpen}
                      onCheckedChange={() => onChange(toggleValue(options, selected, option.value))}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </React.Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
