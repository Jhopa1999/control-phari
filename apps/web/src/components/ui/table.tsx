import * as React from 'react';
import { cn } from '@/lib/utils';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Filas de 40 px (por defecto) o de 32 px en tablas de una sola línea por celda. */
  density?: 'default' | 'compact';
  /**
   * Nombre de la región desplazable (p. ej. "Tabla de solicitudes"). La hace
   * enfocable para desplazarla con el teclado (WCAG 2.1.1).
   */
  scrollLabel?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'default', scrollLabel, ...props }, ref) => (
    <div
      className={cn(
        'relative w-full overflow-x-auto',
        scrollLabel &&
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
      )}
      role={scrollLabel ? 'region' : undefined}
      aria-label={scrollLabel}
      tabIndex={scrollLabel ? 0 : undefined}
    >
      <table
        ref={ref}
        data-density={density}
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

// [&_tr]:h-9 deja el encabezado en 36 px en las dos densidades (§5.3).
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('bg-muted/50 [&_tr]:h-9 [&_tr]:border-b', className)} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'h-10 border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary-subtle [[data-density=compact]_&]:h-8',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

// En compacta, py-1: 20 + 8 + 1 px de borde caben en los 32 px de la fila
// (con py-1.5 la fila crecería a 33 px).
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('px-3 py-1.5 align-middle [[data-density=compact]_&]:py-1', className)}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';

// Caption solo para lectores de pantalla; no se usa caption visible.
const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('sr-only', className)} {...props} />
  ),
);
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableCaption };
