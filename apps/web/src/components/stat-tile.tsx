import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Columnas desde lg según el número de tiles, para no dejar celdas vacías con
// el fondo del separador. Desde xl la franja pasa a una sola fila.
const LG_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-3',
};

export interface StatStripProps {
  /** Nombre de la franja («Resumen general»). */
  label: string;
  /** De 2 a 6 StatTile. */
  children: React.ReactNode;
}

/**
 * Franja de indicadores clave (design desktop §5): un solo borde exterior y
 * separadores de 1 px hechos con el hueco de la rejilla (gap-px sobre
 * bg-border). Desde xl todos los tiles van en una fila (grid-flow-col
 * auto-cols-fr), sin celdas vacías. Con un número impar de tiles en 2
 * columnas, el último ocupa la fila entera. Seguro para servidor.
 */
export function StatStrip({ label, children }: StatStripProps): React.ReactElement {
  const count = React.Children.toArray(children).length;
  return (
    <section
      aria-label={label}
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-card',
        'max-lg:[&>:last-child:nth-child(odd)]:col-span-2',
        LG_COLUMNS[Math.min(Math.max(count, 1), 6)],
        'xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none',
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

const ACCENT_TONES = {
  default: 'border-t-primary',
  danger: 'border-t-danger',
  warning: 'border-t-warning',
  success: 'border-t-success',
} as const;

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** Pista breve: va en la misma línea que el valor y se trunca. */
  hint?: React.ReactNode;
  tone?: keyof typeof VALUE_TONES;
  /** Si se indica, el tile entero es un enlace con chevron. */
  href?: string;
}

function isZero(value: React.ReactNode): boolean {
  return value === 0 || value === '0';
}

/**
 * Un indicador compacto de 64 px: etiqueta, valor de 20 px en tabular-nums y
 * pista opcional en la línea del valor. Un valor 0 se atenúa y pierde el tono:
 * el color solo marca lo que requiere atención.
 */
export function StatTile({ label, value, hint, tone = 'default', href }: StatTileProps): React.ReactElement {
  const zero = isZero(value);
  const body = (
    <>
      <p className="truncate text-meta text-muted-foreground" title={label}>
        {label}
      </p>
      <div className="flex min-w-0 items-baseline gap-2">
        <p
          className={cn(
            'text-xl leading-6 font-semibold tabular-nums',
            zero ? 'text-muted-foreground' : VALUE_TONES[tone],
          )}
        >
          {value}
        </p>
        {hint ? <div className="min-w-0 truncate text-xs text-muted-foreground">{hint}</div> : null}
        {href ? (
          <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 self-center text-muted-foreground" />
        ) : null}
      </div>
    </>
  );
  const classes = cn(
    'flex h-16 min-w-0 flex-col justify-center gap-0 border-t-2 bg-linear-to-b from-primary-subtle/60 to-card px-3 py-2',
    ACCENT_TONES[tone],
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          classes,
          'transition-colors hover:bg-primary-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
