'use client';

import * as React from 'react';
import { CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Piezas de los formularios de página con varias secciones (design §7.3 y §7.4):
 * Configuración del sistema y Agentes de IA.
 */

export interface FormSectionLink {
  /** Id del elemento ancla (la sección lleva `scroll-mt-20`). */
  id: string;
  label: string;
}

export interface FormSectionsLayoutProps {
  sections: readonly FormSectionLink[];
  children: React.ReactNode;
}

/**
 * Columna de contenido con navegación interna a la izquierda desde `xl`
 * (enlaces de ancla, `sticky top-16`). Debajo de `xl` la navegación desaparece
 * y las secciones se apilan. El enlace de la sección a la vista lleva
 * `aria-current="location"`; el seguimiento no mueve el foco.
 */
export function FormSectionsLayout({
  sections,
  children,
}: FormSectionsLayoutProps): React.ReactElement {
  const [active, setActive] = React.useState<string>(sections[0]?.id ?? '');
  const key = sections.map((s) => s.id).join('|');

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ids = key.split('|');
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-80px 0px -55% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);

  return (
    <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[200px_minmax(0,1fr)] xl:items-start xl:gap-6">
      <nav aria-label="Secciones del formulario" className="hidden xl:sticky xl:top-16 xl:block">
        <ul className="flex flex-col gap-0.5">
          {sections.map((section) => {
            const current = section.id === active;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={current ? 'location' : undefined}
                  onClick={() => setActive(section.id)}
                  className={cn(
                    'flex min-h-8 items-center rounded-md px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    current
                      ? 'bg-primary-subtle font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {section.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}

export interface FormCardProps {
  /** Id del ancla de la navegación interna. */
  id: string;
  children: React.ReactNode;
  className?: string;
}

/** Tarjeta de una sección del formulario (`rounded-xl border bg-card shadow-card p-4`). */
export function FormCard({ id, children, className }: FormCardProps): React.ReactElement {
  return (
    <div id={id} className={cn('scroll-mt-20 rounded-xl border bg-card p-4 shadow-card', className)}>
      {children}
    </div>
  );
}

export interface FormActionBarProps {
  /** Hay cambios sin guardar en este formulario. */
  dirty: boolean;
  /** Botones: «Cancelar» (outline) y la acción principal, en ese orden. */
  children: React.ReactNode;
  /** P. ej. lg:col-span-2 cuando el formulario es una rejilla. */
  className?: string;
}

/**
 * Barra de acciones fija al pie del formulario (design §7.4): `sticky bottom-0`
 * dentro de la tarjeta, así los botones se ven aunque el formulario sea más
 * alto que la pantalla. A la izquierda, el estado «Cambios sin guardar»
 * (`role="status"`, con icono y texto: no depende del color).
 */
export function FormActionBar({
  dirty,
  children,
  className,
}: FormActionBarProps): React.ReactElement {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur',
        className,
      )}
    >
      <p role="status" className="flex min-h-6 items-center gap-1.5 text-meta text-muted-foreground">
        {dirty ? (
          <>
            <CircleDot className="size-3.5 text-warning" aria-hidden="true" />
            Cambios sin guardar
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
