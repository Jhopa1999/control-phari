'use client';

import * as React from 'react';

/**
 * Preferencia de presentación de la sección «Tareas» de Planificación:
 * - 'table': la tabla de tareas (comportamiento actual, por defecto).
 * - 'kanban': el tablero por estado.
 *
 * Solo cambia la presentación; datos, filtros y acciones son los mismos.
 * Molde SSR-safe calcado de use-sidebar-mode.ts: estado inicial neutro ('table')
 * y lectura de la preferencia guardada tras montar (evita desajuste de
 * hidratación), todo dentro de try/catch por si localStorage no está disponible.
 */
export type PlanTasksView = 'table' | 'kanban';

/** Clave de localStorage: 'table' | 'kanban'; cualquier otro valor ⇒ 'table'. */
const STORAGE_KEY = 'planTasksView';

function readPref(): PlanTasksView {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'kanban') return 'kanban';
    if (stored === 'table') return 'table';
    return 'table';
  } catch {
    // localStorage no disponible: se queda en la tabla.
    return 'table';
  }
}

function writePref(view: PlanTasksView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Sin persistencia: la preferencia dura hasta recargar.
  }
}

export interface PlanTasksViewMode {
  /** Presentación activa. */
  view: PlanTasksView;
  /** Fija y persiste la preferencia. */
  setView: (view: PlanTasksView) => void;
}

/**
 * El SSR y el primer render usan 'table' (sin desajuste de hidratación); la
 * preferencia guardada se lee después del montaje.
 */
export function usePlanTasksView(): PlanTasksViewMode {
  const [view, setViewState] = React.useState<PlanTasksView>('table');

  React.useEffect(() => {
    setViewState(readPref());
  }, []);

  const setView = React.useCallback((next: PlanTasksView) => {
    writePref(next);
    setViewState(next);
  }, []);

  return { view, setView };
}
