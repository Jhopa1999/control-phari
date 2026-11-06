import * as React from 'react';
import { OctagonAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Recuadro del motivo de bloqueo (tarjetas): truncado a 2 líneas, texto completo en el DOM. */
export function BlockedReasonBox({
  reason,
  className,
  clamp = true,
  label = 'Motivo',
}: {
  reason: string | null | undefined;
  className?: string;
  /** false: texto completo sin recorte (detalle). */
  clamp?: boolean;
  label?: string;
}): React.ReactElement {
  return (
    <p
      title={reason ?? undefined}
      className={cn('flex items-start gap-1.5 rounded-md bg-danger-subtle px-2 py-1.5 text-meta text-foreground', className)}
    >
      <OctagonAlert className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden="true" />
      {reason ? (
        <span className={cn('min-w-0 wrap-break-word', clamp && 'line-clamp-2')}>
          <span className="font-medium text-danger">{label}: </span>
          {reason}
        </span>
      ) : (
        <span className="text-muted-foreground">Sin motivo registrado.</span>
      )}
    </p>
  );
}

/** Motivo en una línea (fila de tabla): texto completo en `title` y en el DOM. */
export function BlockedReasonLine({ reason }: { reason: string | null | undefined }): React.ReactElement {
  return (
    <p title={reason ?? undefined} className="line-clamp-1 text-meta text-muted-foreground">
      {reason ? (
        <>
          <span className="font-medium">Motivo:</span> {reason}
        </>
      ) : (
        'Sin motivo registrado.'
      )}
    </p>
  );
}
