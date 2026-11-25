'use client';

import * as React from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ListSearchBarProps {
  /** Nombre accesible (oculto): «Buscar actas». */
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Texto del contador («12 de 300 actas»). */
  countText: string;
  /** Hay una recarga en curso: el contador muestra «Cargando…». */
  busy?: boolean;
  /** Solo en la carga inicial; en las recargas el campo sigue activo. */
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const MAX_LENGTH = 100;

/**
 * Búsqueda de las listas de la columna de 320 px (patrón de la oleada 3 en
 * versión estrecha): campo, botón de borrar y contador. Escape limpia el campo.
 */
export function ListSearchBar({
  label,
  placeholder,
  value,
  onChange,
  countText,
  busy = false,
  disabled = false,
  inputRef,
}: ListSearchBarProps): React.ReactElement {
  const id = React.useId();
  const countId = `${id}-count`;
  const helpId = `${id}-help`;
  return (
    <div role="search" className="sticky top-0 z-10 grid gap-1.5 border-b bg-card p-3">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          maxLength={MAX_LENGTH}
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-describedby={`${countId} ${helpId}`}
          className="h-9 pl-9 pr-10 max-md:h-11 [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && value !== '') {
              event.preventDefault();
              event.stopPropagation();
              onChange('');
            }
          }}
        />
        {value !== '' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 max-md:size-11"
            aria-label="Borrar búsqueda"
            onClick={() => {
              onChange('');
              inputRef?.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <span id={helpId} className="sr-only">
        La lista se actualiza mientras escribes. Máximo 100 caracteres.
      </span>
      <p
        id={countId}
        role="status"
        className="flex items-center gap-1.5 text-meta tabular-nums text-muted-foreground"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : null}
        {busy ? 'Cargando…' : countText}
      </p>
    </div>
  );
}
