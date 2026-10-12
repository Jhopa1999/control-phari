'use client';

import * as React from 'react';

/**
 * Preferencia del menú lateral (design §8.3):
 * - 'auto': expandido desde 1280 px y riel de 56 px entre 1024 y 1279 px.
 * - 'rail' / 'expanded': lo que eligió el usuario con el botón del riel.
 */
export type SidebarPref = 'auto' | 'rail' | 'expanded';

/** Clave de localStorage: 'true' = riel, 'false' = expandido, sin valor = auto. */
const STORAGE_KEY = 'sidebarCollapsed';
/** Mismo intervalo que la variante `rail:` de globals.css. */
const AUTO_RAIL_QUERY = '(min-width: 1024px) and (max-width: 1279.98px)';

function readPref(): SidebarPref {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return 'rail';
    if (stored === 'false') return 'expanded';
    return 'auto';
  } catch {
    // localStorage no disponible: se queda en automático.
    return 'auto';
  }
}

function writePref(pref: SidebarPref): void {
  try {
    if (pref === 'auto') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, pref === 'rail' ? 'true' : 'false');
  } catch {
    // Sin persistencia: la preferencia dura hasta recargar.
  }
}

export interface SidebarMode {
  /** Va en `data-sidebar`; CSS resuelve con él el ancho, los textos y los botones. */
  pref: SidebarPref;
  /** Modo efectivo; en JS solo decide si los ítems llevan tooltip. */
  isRail: boolean;
  /** Pasa al modo opuesto del efectivo y lo persiste. */
  toggle: () => void;
  /** Fija y persiste la preferencia ('auto' borra la clave). */
  setPref: (pref: SidebarPref) => void;
}

/**
 * El SSR y el primer render usan 'auto' (sin desajuste de hidratación); la
 * preferencia guardada se lee después del montaje. Con 'rail' o 'expanded'
 * guardados, el ancho se ajusta tras ese efecto (una transición de 150 ms al
 * cargar); se acepta en lugar de un script en <head>.
 */
export function useSidebarMode(): SidebarMode {
  const [pref, setPrefState] = React.useState<SidebarPref>('auto');
  const [autoRail, setAutoRail] = React.useState(false);

  React.useEffect(() => {
    setPrefState(readPref());
  }, []);

  React.useEffect(() => {
    const query = window.matchMedia(AUTO_RAIL_QUERY);
    const update = (): void => setAutoRail(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const isRail = pref === 'rail' || (pref === 'auto' && autoRail);

  const setPref = React.useCallback((next: SidebarPref) => {
    writePref(next);
    setPrefState(next);
  }, []);

  const toggle = React.useCallback(() => {
    setPref(isRail ? 'expanded' : 'rail');
  }, [isRail, setPref]);

  return { pref, isRail, toggle, setPref };
}
