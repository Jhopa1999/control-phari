import * as React from 'react';
import { cn } from '@/lib/utils';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /**
   * Filas de 40 px (por defecto), 32 px en tablas de una sola línea por celda o
   * 52 px (twoline) cuando la celda de título lleva una segunda línea.
   */
  density?: 'default' | 'compact' | 'twoline';
  /**
   * Nombre de la región desplazable (p. ej. "Tabla de solicitudes"). La hace
   * enfocable para desplazarla con el teclado (WCAG 2.1.1).
   */
  scrollLabel?: string;
  /**
   * Clases extra de la región desplazable (p. ej. un max-h menor cuando hay
   * contenido fijo encima y la paginación debe quedar a la vista).
   */
  regionClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'default', scrollLabel, regionClassName, ...props }, ref) => (
    <div
      className={cn(
        '@container relative w-full overflow-x-auto',
        // Con scrollLabel la región se desplaza y la cabecera queda fija (§3.3).
        // bg-surface-subtle es opaco: las filas no se ven bajo la cabecera.
        scrollLabel &&
          'max-h-[calc(100dvh-15rem)] overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-surface-subtle',
        scrollLabel && regionClassName,
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
    <thead ref={ref} className={cn('bg-surface-subtle [&_tr]:h-9 [&_tr]:border-b', className)} {...props} />
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
        'h-10 border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary-subtle [[data-density=compact]_&]:h-8 [[data-density=twoline]_&]:h-[52px]',
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
// (con py-1.5 la fila crecería a 33 px). En dos líneas, py-1: título (20) +
// hueco (2) + segunda línea (18) + 8 + 1 de borde caben en los 52 px.
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        'px-3 py-1.5 align-middle [[data-density=compact]_&]:py-1 [[data-density=twoline]_&]:py-1',
        className,
      )}
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
