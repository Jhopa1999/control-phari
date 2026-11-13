'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Ayuda y mensaje comunes de los campos de horas de la bitácora. */
export const HOURS_STEP_HELP = 'Pasos de 0,25 h (15 min).';
export const HOURS_RANGE_MESSAGE = 'Las horas deben ir de 0,25 a 24 en pasos de 0,25.';

/**
 * Solo formato (UX): número de 0,25 a 24 en pasos de 0,25. La regla vive en la
 * API, que responde 400 con el mismo mensaje.
 */
export function isValidHoursText(text: string): boolean {
  const value = Number(text.replace(',', '.'));
  return (
    text.trim() !== '' &&
    Number.isFinite(value) &&
    value >= 0.25 &&
    value <= 24 &&
    Number.isInteger(value * 4)
  );
}

/** Texto del campo a número para la API (acepta coma decimal). */
export function hoursFromText(text: string): number {
  return Number(text.replace(',', '.'));
}

/**
 * Campo de horas decimal con sufijo «h». Pasa id y aria-* al input para que lo
 * use `Field`; las flechas del teclado cambian de a 0,25 (step nativo).
 */
export const HoursInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type' | 'step' | 'min' | 'max' | 'inputMode'>
>(({ className, ...props }, ref) => (
  <div className="relative w-28">
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      step="0.25"
      min="0.25"
      max="24"
      className={cn('pr-7 text-right tabular-nums', className)}
      {...props}
    />
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
    >
      h
    </span>
  </div>
));
HoursInput.displayName = 'HoursInput';
