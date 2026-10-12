'use client';

import * as React from 'react';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const FILL_TONES = {
  default: 'bg-primary',
  danger: 'bg-danger',
  warning: 'bg-warning',
} as const;

export interface UtilizationBarProps {
  /** Porcentaje en 0–100 (puede superar 100); null sin dato. */
  value: number | null;
  tone: keyof typeof FILL_TONES;
  /** Alimenta el texto sr-only («Utilización: 45 %»). */
  label: string;
}

/**
 * Utilización (design §7.6): «45 %» + barra de 48×6 px decorativa, con el
 * relleno acotado a 100 %. Para lectores de pantalla solo cuenta el texto
 * sr-only con la etiqueta. Sin dato: «—» y sin barra.
 */
export function UtilizationBar({ value, tone, label }: UtilizationBarProps): React.ReactElement {
  if (value === null) {
    return (
      <span>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{`${label}: —`}</span>
      </span>
    );
  }
  const text = formatPercent(value);
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="tabular-nums" aria-hidden="true">
        {text}
      </span>
      <span aria-hidden="true" className="relative h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', FILL_TONES[tone])}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="sr-only">{`${label}: ${text}`}</span>
    </span>
  );
}
