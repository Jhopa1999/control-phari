import * as React from 'react';
import { Hammer } from 'lucide-react';

interface UnderConstructionProps {
  title: string;
  description?: string;
}

/**
 * Placeholder claro para pantallas aun no construidas. El item de menu y el
 * gating son reales (design 5.1); solo el contenido esta pendiente.
 */
export function UnderConstruction({
  title,
  description,
}: UnderConstructionProps): React.ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card p-12 text-center">
        <Hammer className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">En construccion</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta pantalla forma parte del portal pero aun no esta disponible. El
          menu y los permisos ya son reales.
        </p>
      </section>
    </div>
  );
}
