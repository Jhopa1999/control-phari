'use client';

import * as React from 'react';
import { toast } from 'sonner';

/*
 * Acción reversible con «Deshacer» (oleada 3, PR-D; criterio en
 * docs/design/confirmacion-deshacer.md). Se ejecuta de inmediato y aparece un
 * toast neutro con la acción «Deshacer» durante 8 s. «Deshacer» llama a la
 * acción inversa del servidor (no restaura datos en el cliente).
 *
 * Reglas:
 * - Un solo toast de este tipo a la vez (`id` fijo): una acción nueva reemplaza
 *   al toast anterior, así que «Deshacer» siempre revierte la última acción.
 * - Un segundo clic en «Deshacer» mientras corre el primero se ignora.
 * - Si falla la acción, el toast de error nombra el motivo y no hay «Deshacer».
 *   Si falla «Deshacer», el error indica la otra vía (el menú de la fila).
 * - Se usa `toast()` neutro y no `toast.success`: el botón de acción mide 3,18:1
 *   contra el toast oscuro y quedaría por debajo de 3:1 sobre el fondo verde.
 */

/** Id fijo del toast: garantiza un único aviso «Deshacer» a la vez. */
export const UNDO_TOAST_ID = 'accion-deshacer';
/** Duración del aviso (ms), igual que el resto del portal (Mi trabajo). */
export const UNDO_TOAST_DURATION = 8000;

const UNDO_BUTTON_CLASS =
  'h-8! rounded-md! bg-primary! px-3! text-sm! font-medium! text-primary-foreground! hover:bg-primary-hover! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-11!';

export interface UndoableActionOptions {
  /** Ejecuta la acción en el servidor. Si rechaza, no hay «Deshacer». */
  run: () => Promise<void>;
  /** Acción inversa en el servidor (el mismo endpoint con el estado contrario). */
  undo: () => Promise<void>;
  /** Resultado en pasado: «ACT-0007 retirado.» */
  message: string;
  /** Estado actual y la otra vía para revertir. */
  description?: string;
  /** Completa «Deshacer» para el lector de pantalla: «el retiro de ACT-0007». */
  undoLabelHidden?: string;
  /** Resultado tras deshacer: «ACT-0007 recuperado.» */
  undoneMessage: string;
  /** Mensaje de error de la acción; recibe el motivo del servidor si lo hay. */
  errorMessage: (reason: string | null) => string;
  /** Mensaje de error de «Deshacer». */
  undoErrorMessage: string;
  /** Se llama tras cada resultado (hecho, deshecho o con error) para refrescar la vista. */
  onSettled?: (outcome: 'done' | 'undone' | 'failed' | 'undo-failed') => void | Promise<void>;
}

function reasonOf(err: unknown): string | null {
  return err instanceof Error && err.message ? err.message : null;
}

export function useUndoableAction(): {
  /** Devuelve `true` si la acción se ejecutó (aunque luego se deshaga). */
  execute: (options: UndoableActionOptions) => Promise<boolean>;
} {
  const undoing = React.useRef(false);

  const execute = React.useCallback(async (options: UndoableActionOptions): Promise<boolean> => {
    try {
      await options.run();
    } catch (err) {
      toast.error(options.errorMessage(reasonOf(err)));
      await options.onSettled?.('failed');
      return false;
    }

    const handleUndo = async (): Promise<void> => {
      if (undoing.current) return;
      undoing.current = true;
      try {
        await options.undo();
        toast.success(options.undoneMessage);
        await options.onSettled?.('undone');
      } catch {
        toast.error(options.undoErrorMessage);
        await options.onSettled?.('undo-failed');
      } finally {
        undoing.current = false;
      }
    };

    toast(options.message, {
      id: UNDO_TOAST_ID,
      description: options.description,
      duration: UNDO_TOAST_DURATION,
      action: {
        label: (
          <>
            Deshacer
            {options.undoLabelHidden ? (
              <span className="sr-only"> {options.undoLabelHidden}</span>
            ) : null}
          </>
        ),
        onClick: () => void handleUndo(),
      },
      classNames: { actionButton: UNDO_BUTTON_CLASS },
    });
    await options.onSettled?.('done');
    return true;
  }, []);

  return { execute };
}
