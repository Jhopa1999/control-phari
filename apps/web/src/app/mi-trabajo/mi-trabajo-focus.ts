/**
 * Búsqueda y enfoque de controles de una fila o tarjeta de «Mi trabajo»
 * (`[data-task-id]` + `[data-control]`). Solo se usa desde efectos y manejadores.
 */

function focusableIn(root: Element | null): HTMLElement | null {
  if (!root) return null;
  const el = root.matches('button, a') ? root : root.querySelector('button, a');
  return el instanceof HTMLElement && !el.hasAttribute('disabled') ? el : null;
}

/** Control `[data-control]` de la copia VISIBLE de la tarea (tabla, tarjeta o tablero). */
export function findControl(taskId: string, control: string): HTMLElement | null {
  const rows = document.querySelectorAll(`[data-task-id="${CSS.escape(taskId)}"]`);
  for (const row of rows) {
    if (row.getClientRects().length === 0) continue;
    const el = focusableIn(row.querySelector(`[data-control="${control}"]`));
    if (el) return el;
  }
  return null;
}

export function focusControl(taskId: string, control: string): boolean {
  const el = findControl(taskId, control);
  if (!el) return false;
  el.focus();
  return true;
}

/** Destino del foco tras una acción en línea. */
export interface FocusTarget {
  taskId: string;
  control: string;
  /** Ids de las tareas siguientes del mismo grupo o columna, por si la tarea desaparece. */
  fallbackIds: string[];
  /** Ids de encabezados (o pestañas) a los que ir si no queda ninguna tarea. */
  headingIds: string[];
}

/** Aplica la regla única de foco: control pulsado → título → tarea siguiente → encabezado. */
export function restoreFocus(target: FocusTarget): void {
  if (focusControl(target.taskId, target.control)) return;
  if (focusControl(target.taskId, 'title')) return;
  for (const id of target.fallbackIds) {
    if (focusControl(id, 'title')) return;
  }
  for (const id of target.headingIds) {
    const el = document.getElementById(id);
    if (el instanceof HTMLElement && el.getClientRects().length > 0) {
      if (!el.matches('button, a, [role="tab"]')) el.tabIndex = -1;
      el.focus();
      return;
    }
  }
  const h1 = document.querySelector('h1');
  if (h1 instanceof HTMLElement) {
    h1.tabIndex = -1;
    h1.focus();
  }
}
