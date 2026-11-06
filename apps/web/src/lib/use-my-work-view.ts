'use client';

import * as React from 'react';
import { createLocalPrefStore } from './local-pref-store';

/**
 * Preferencia de presentación de «Mi trabajo»: 'lista' (Mi día, por defecto) o
 * 'tablero' (columnas por estado). Solo cambia la presentación. Mismo molde que
 * use-plan-tasks-view.ts: el servidor y el primer render usan 'lista' y la
 * preferencia guardada se lee tras montar (sin desajuste de hidratación).
 */
export type MyWorkView = 'lista' | 'tablero';

/** Clave de localStorage; cualquier otro valor guardado se lee como 'lista'. */
export const MY_WORK_VIEW_KEY = 'miTrabajoVista';

/** Interpreta un valor guardado: solo 'tablero' es distinto del valor por defecto. */
export function parseMyWorkView(stored: string | null): MyWorkView {
  return stored === 'tablero' ? 'tablero' : 'lista';
}

function readPref(): MyWorkView {
  try {
    return parseMyWorkView(window.localStorage.getItem(MY_WORK_VIEW_KEY));
  } catch {
    return 'lista';
  }
}

function writePref(view: MyWorkView): void {
  try {
    window.localStorage.setItem(MY_WORK_VIEW_KEY, view);
  } catch {
    // Sin persistencia: la preferencia dura hasta recargar.
  }
}

const store = createLocalPrefStore<MyWorkView>(readPref, writePref, 'lista');

export function useMyWorkView(): { view: MyWorkView; setView: (view: MyWorkView) => void } {
  const view = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const setView = React.useCallback((next: MyWorkView) => store.set(next), []);
  return { view, setView };
}
