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
}: PeriodFieldsetProps): React.ReactElement {
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
