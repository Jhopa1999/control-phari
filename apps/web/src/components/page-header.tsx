import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Texto del único <h1> de la página. */
  title: React.ReactNode;
  /** Una línea bajo el título. */
  description?: React.ReactNode;
  /** Solo los ancestros: la página actual es el título. */
  breadcrumbs?: Crumb[];
  /** Fila bajo el título (badges, metadatos) en páginas de detalle. */
  meta?: React.ReactNode;
  /** A la derecha; la acción principal va al final. */
  actions?: React.ReactNode;
}

/**
 * Cabecera de página (design §7.1): emite el único <h1>. En móvil las acciones
 * bajan debajo de la descripción y conservan su ancho natural. Seguro para
 * servidor (sin hooks ni Radix).
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  meta,
  actions,
}: PageHeaderProps): React.ReactElement {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Ruta de navegación">
            <ol className="flex flex-wrap items-center gap-1 text-meta text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                  {index > 0 ? (
                    <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
                  ) : null}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight wrap-break-word">{title}</h1>
        {description ? (
          <div className="max-w-prose text-sm text-muted-foreground">{description}</div>
        ) : null}
        {meta ? <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
