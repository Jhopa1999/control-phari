import * as React from 'react';
import { IdChip } from '@/components/id-chip';

/*
 * Celdas de «lo referenciado» (BL-039, docs/design/oleada-3-listados.md §8):
 * la persona ve el nombre (y el código, si existe) y nunca un UUID ni «null».
 */

/** Dato ausente: guion largo con el sustantivo para lectores de pantalla. */
export function RefMissing({ label }: { label: string }): React.ReactElement {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface ProcessRefCellProps {
  name: string | null | undefined;
  code: string | null | undefined;
  /** Texto si no hay proceso (p. ej. «Sin proceso aún»). */
  missingLabel: string;
  /** Muestra el texto de ausencia visible en lugar del guion. */
  missingVisible?: boolean;
}

/** Proceso: nombre y, debajo, su código en texto secundario (sin chip: no se cita). */
export function ProcessRefCell({
  name,
  code,
  missingLabel,
  missingVisible = false,
}: ProcessRefCellProps): React.ReactElement {
  if (!name) {
    return missingVisible ? (
      <span className="text-muted-foreground">{missingLabel}</span>
    ) : (
      <RefMissing label={missingLabel} />
    );
  }
  return (
    // Una línea: nombre y código en la misma fila, para no pasar de la altura de fila (design §3.1).
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="line-clamp-1 min-w-[8ch]" title={name}>
        {name}
      </span>
      {code ? <span className="min-w-0 shrink-[4] truncate text-meta whitespace-nowrap text-muted-foreground" title={code}>{code}</span> : null}
    </span>
  );
}

export interface RequestRefCellProps {
  code: string | null | undefined;
  title: string | null | undefined;
  /** Hay un id de solicitud pero el servidor no la nombra (eliminada o fuera de alcance). */
  unavailable?: boolean;
  missingLabel: string;
}

/** Solicitud referenciada: chip corto con el código y el título debajo. */
export function RequestRefCell({
  code,
  title,
  unavailable = false,
  missingLabel,
}: RequestRefCellProps): React.ReactElement {
  if (!code) {
    return unavailable ? (
      <span className="text-muted-foreground">No disponible</span>
    ) : (
      <RefMissing label={missingLabel} />
    );
  }
  return (
    // Código y título en una línea (design §3.1): la fila no pasa de 52 px.
    <span className="flex min-w-0 items-center gap-2">
      <IdChip code={code} />
      {title ? (
        <span className="line-clamp-1 text-meta text-muted-foreground" title={title}>
          {title}
        </span>
      ) : null}
    </span>
  );
}
