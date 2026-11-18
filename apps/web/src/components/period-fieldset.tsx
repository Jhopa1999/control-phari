'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export interface PeriodFieldsetProps {
  /** Ids de los campos («dashboard-from», «dashboard-to»…), que fijan los E2E y el inventario. */
  fromId: string;
  toId: string;
  /** 'YYYY-MM-DD'; '' mientras el periodo local aún no se calculó (Skeleton). */
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  /** Periodo inválido (Desde posterior a Hasta): `aria-invalid` en ambos campos. */
  invalid?: boolean;
  /**
   * Id del aviso de error que pinta la vista (p. ej. `indicadores-periodo-error`):
   * se aplica como `aria-describedby` de ambos campos mientras `invalid`.
   */
  errorId?: string;
}

/**
 * Filtro «Periodo» de los paneles (design §11.3 y §11.13): fieldset con legend
 * visible y los campos «Desde» (max = to) y «Hasta» (min = from). Cada cambio
 * se propaga en el acto e ignora el valor vacío, como hasta ahora; la vista
 * recarga al cambiar el periodo. Mientras el valor vale '' (periodo local
 * calculado tras el montaje, §7.9 regla 2) cada campo muestra un Skeleton.
 */
export function PeriodFieldset({
  fromId,
  toId,
  from,
  to,
  onFromChange,
  onToChange,
  invalid = false,
  errorId,
}: PeriodFieldsetProps): React.ReactElement {
  const a11y = {
    'aria-invalid': invalid ? (true as const) : undefined,
    'aria-describedby': invalid ? errorId : undefined,
  };
  return (
    <fieldset className="flex flex-wrap items-end gap-3">
      <legend className="mb-1.5 text-meta font-medium">Periodo</legend>
      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={fromId}>Desde</Label>
        {from ? (
          <Input
            id={fromId}
            type="date"
            className="w-full sm:w-40"
            value={from}
            max={to}
            {...a11y}
            onChange={(e) => {
              if (e.target.value) onFromChange(e.target.value);
            }}
          />
        ) : (
          <Skeleton className="h-9 w-full sm:w-40" />
        )}
      </div>
      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={toId}>Hasta</Label>
        {to ? (
          <Input
            id={toId}
            type="date"
            className="w-full sm:w-40"
            value={to}
            min={from}
            {...a11y}
            onChange={(e) => {
              if (e.target.value) onToChange(e.target.value);
            }}
          />
        ) : (
          <Skeleton className="h-9 w-full sm:w-40" />
        )}
      </div>
    </fieldset>
  );
}
