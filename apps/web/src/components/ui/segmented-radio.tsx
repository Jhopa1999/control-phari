'use client';

import * as React from 'react';

export interface SegmentedRadioProps {
  id: string;
  name: string;
  /** Los ids de las opciones son `${id}-${value}`. */
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  /** Id de la etiqueta visible del grupo (p. ej. el criterio en su fila). */
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}

/**
 * Control segmentado de radios nativos (p. ej. valoraciones de 1 a 5). Es su
 * propio `radiogroup` porque su etiqueta visible vive fuera (no puede ser una
 * `legend`). El seleccionado usa el acento y peso 600, una pista que no
 * depende solo del color. Teclado nativo: flechas para cambiar de opción.
 */
function SegmentedRadio({
  id,
  name,
  options,
  value,
  onValueChange,
  labelledBy,
  describedBy,
  disabled = false,
}: SegmentedRadioProps): React.ReactElement {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="inline-flex gap-0.5 rounded-md border border-border-strong bg-background p-0.5"
    >
      {options.map((option) => {
        const optionId = `${id}-${option.value}`;
        return (
          <label
            key={option.value}
            className="relative inline-flex h-8 min-w-9 cursor-pointer items-center justify-center rounded-sm px-2 text-sm tabular-nums transition-colors hover:bg-accent has-[:checked]:bg-primary has-[:checked]:font-semibold has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:opacity-50"
          >
            <input
              type="radio"
              id={optionId}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              disabled={disabled}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export { SegmentedRadio };
