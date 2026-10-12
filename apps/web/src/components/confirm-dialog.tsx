'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Control que abrió el diálogo. Desde un ítem de menú (RowActions), el
 * disparador real es el botón del menú, que Radix enlaza con aria-labelledby.
 */
function resolveTrigger(element: Element | null): HTMLElement | null {
  if (!(element instanceof HTMLElement) || element === document.body) return null;
  const triggerId = element.closest('[role="menu"]')?.getAttribute('aria-labelledby');
  const menuTrigger = triggerId ? document.getElementById(triggerId) : null;
  return menuTrigger ?? element;
}

/**
 * Devolución del foco de los diálogos controlados (sin DialogTrigger), NIT 4.
 * Radix solo sabe devolver el foco a un DialogTrigger, así que el disparador se
 * registra al abrir (`captureTrigger`, desde onOpenAutoFocus) y, al cerrar
 * (`handleCloseAutoFocus`, en onCloseAutoFocus), recibe el foco si sigue en el
 * DOM. Si la acción lo retiró (la fila se eliminó), se llama a e.preventDefault()
 * y el foco va a `returnFocusTo()`: en tablas, la fila siguiente o el
 * encabezado de la Section; en maestro‑detalle, el encabezado del detalle.
 */
export function useDialogReturnFocus(returnFocusTo?: () => HTMLElement | null): {
  captureTrigger: () => void;
  handleCloseAutoFocus: (event: Event) => void;
} {
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const captureTrigger = React.useCallback(() => {
    triggerRef.current = resolveTrigger(document.activeElement);
  }, []);
  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => {
      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger?.isConnected) {
        event.preventDefault();
        trigger.focus();
        return;
      }
      const target = returnFocusTo?.() ?? null;
      if (target) {
        event.preventDefault();
        target.focus();
      }
    },
    [returnFocusTo],
  );
  return { captureTrigger, handleCloseAutoFocus };
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «¿Eliminar la fase «Diseño»?» */
  title: string;
  /** Consecuencia concreta. */
  description: React.ReactNode;
  /** «Eliminar fase» */
  confirmLabel: string;
  /** Por defecto «Cancelar». */
  cancelLabel?: string;
  /** Por defecto 'danger' (botón destructive). */
  tone?: 'danger' | 'default';
  busy?: boolean;
  /** El handler existente de la vista, sin cambios (toast incluido). */
  onConfirm: () => void | Promise<void>;
  /** Destino del foco si el disparador ya no está en el DOM al cerrar (NIT 4). */
  returnFocusTo?: () => HTMLElement | null;
}

/**
 * Confirmación de una acción (design §7.5): alertdialog pequeño con el foco
 * inicial en Cancelar. El clic fuera no lo cierra y Escape lo cierra salvo
 * mientras la acción está en curso. Al confirmar se ejecuta `onConfirm` y el
 * diálogo se cierra al terminar, con éxito o error.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'danger',
  busy = false,
  onConfirm,
  returnFocusTo,
}: ConfirmDialogProps): React.ReactElement {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const [running, setRunning] = React.useState(false);
  const isBusy = busy || running;
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus(returnFocusTo);

  function handleOpenChange(next: boolean): void {
    if (!next && isBusy) return;
    onOpenChange(next);
  }

  async function handleConfirm(): Promise<void> {
    setRunning(true);
    try {
      await onConfirm();
    } catch {
      // El handler de la vista ya informa el error (toast); el diálogo se cierra igual.
    } finally {
      setRunning(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        role="alertdialog"
        onOpenAutoFocus={(event) => {
          captureTrigger();
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => handleOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            loading={isBusy}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
