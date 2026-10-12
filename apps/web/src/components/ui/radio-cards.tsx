'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}

export interface RadioCardsProps {
  name: string;
  /** Los ids de las opciones son `${idPrefix}-${value}`. */
  idPrefix: string;
  options: ChoiceOption[];
  /** `''` significa sin elección. */
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /** Con `invalid` y sin elección, las tarjetas se marcan en rojo. */
  invalid?: boolean;
}

/**
 * Radios nativos con forma de tarjeta (decisiones con descripción). No tiene
 * rol propio: el `radiogroup` lo aporta el `FieldSet kind="radio"` que lo
 * envuelve. Teclado nativo: Tab entra al grupo y las flechas cambian la opción.
 */
function RadioCards({
  name,
  idPrefix,
  options,
  value,
  onValueChange,
  disabled = false,
  invalid = false,
}: RadioCardsProps): React.ReactElement {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;
        // Con descripción, el nombre es solo la etiqueta y la descripción se
        // anuncia como tal (si no, el label envolvente uniría las dos).
        const labelId = option.description ? `${id}-label` : undefined;
        const descriptionId = option.description ? `${id}-description` : undefined;
        return (
          <label
            key={option.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-background p-3 text-sm transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
              invalid && value === '' && 'border-danger',
            )}
          >
            <input
              type="radio"
              name={name}
              id={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              disabled={disabled}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span id={labelId} className="font-medium">
                {option.label}
              </span>
              {option.description ? (
                <span id={descriptionId} className="text-meta text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export { RadioCards };
