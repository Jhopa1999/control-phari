import * as React from 'react';
import { cn } from '@/lib/utils';

// Columnas en lg según el número de tiles (2 a 4), para no dejar celdas vacías
// con el fondo del separador.
const LG_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

export interface StatStripProps {
  /** Nombre de la franja («Resumen general»). */
  label: string;
  /** De 2 a 4 StatTile. */
  children: React.ReactNode;
}

/**
 * Franja de indicadores clave (design §7.6, con la corrección del NIT 8): un
 * solo borde exterior y separadores de 1 px hechos con el hueco de la rejilla
 * (gap-px sobre bg-border), sin bordes dobles en 2 columnas. Con un número impar
 * de tiles en 2 columnas, el último ocupa la fila entera. Seguro para servidor.
 */
export function StatStrip({ label, children }: StatStripProps): React.ReactElement {
  const count = React.Children.toArray(children).length;
  return (
    <section
      aria-label={label}
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border',
        'max-lg:[&>:last-child:nth-child(odd)]:col-span-2',
        LG_COLUMNS[Math.min(Math.max(count, 1), 4)],
      )}
    >
      {children}
    </section>
  );
}

const VALUE_TONES = {
  default: '',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
} as const;

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof VALUE_TONES;
}

/** Un indicador: etiqueta, valor de 24 px en tabular-nums y pista opcional. */
export function StatTile({ label, value, hint, tone = 'default' }: StatTileProps): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-4">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-semibold tabular-nums', VALUE_TONES[tone])}>{value}</p>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
