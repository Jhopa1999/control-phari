'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/*
 * ID visible de solicitud, fase o tarea (PRY-0012, PRY-0012-F2, PRY-0012-T07).
 * Solo lectura: lo asigna el sistema. Chip discreto en monoespaciada (el
 * código se lee carácter a carácter), copiable con clic o teclado. El código
 * COMPLETO es siempre lo que se copia; la forma corta (T07, F2) es solo para
 * pantallas donde el proyecto ya está a la vista (el Plan).
 */

export type IdChipVariant = 'short' | 'full';

/** Forma corta de un código: `PRY-0012-T07` → `T07`; un código de solicitud queda igual. */
export function shortCode(code: string): string {
  const match = /-([FT]\d+)$/.exec(code);
  return match ? match[1] : code;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Contextos sin Clipboard API (http, permisos): copia con un textarea.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export interface IdChipProps {
  /** Código completo. Si falta (dato antiguo o sin cargar) no se pinta nada. */
  code: string | null | undefined;
  /** `short` (T07) solo donde el proyecto ya es evidente; `full` en vistas mixtas. */
  variant?: IdChipVariant;
  /**
   * `false` pinta el ID sin acción de copiar. Obligatorio dentro de otro
   * control (un botón o enlace de fila) para no anidar interactivos.
   */
  copyable?: boolean;
  className?: string;
}

const CHIP_CLASS =
  'inline-flex h-5 shrink-0 items-center rounded-md border border-border-strong/60 bg-muted px-1.5 font-mono text-xs font-medium whitespace-nowrap text-foreground tabular-nums';

export function IdChip({
  code,
  variant = 'full',
  copyable = true,
  className,
}: IdChipProps): React.ReactElement | null {
  if (!code) return null;
  const shown = variant === 'short' ? shortCode(code) : code;

  if (!copyable) {
    return (
      <span data-id-chip={code} title={code} className={cn(CHIP_CLASS, className)}>
        <span className="sr-only">Código </span>
        {shown}
      </span>
    );
  }

  async function handleCopy(event: React.MouseEvent<HTMLButtonElement>): Promise<void> {
    // El chip vive dentro de filas y tarjetas con acciones propias.
    event.stopPropagation();
    const ok = await copyText(code as string);
    if (ok) {
      // El toast se anuncia en su región aria-live (feedback accesible).
      toast.success(`Copiado ${code}`);
    } else {
      toast.error('No se pudo copiar el código.');
    }
  }

  return (
    <button
      type="button"
      data-id-chip={code}
      title={`${code} · clic para copiar`}
      aria-label={`Código ${shown}, copiar`}
      onClick={(event) => void handleCopy(event)}
      className={cn(
        CHIP_CLASS,
        'cursor-pointer',
        'hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      {shown}
    </button>
  );
}
