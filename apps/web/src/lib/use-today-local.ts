'use client';

import * as React from 'react';
import { localDateInputValue } from '@/lib/format';

/**
 * Se suscribe a los momentos en que «hoy» puede cambiar: la siguiente medianoche
 * local (calculada con `new Date(y, m, d + 1)`, no sumando 24 h, para respetar
 * cambios de horario), el regreso a la pestaña y el foco de la ventana.
 */
function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, Math.max(next.getTime() - now.getTime(), 1000));
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') onChange();
  };
  schedule();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onChange);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onChange);
  };
}

const getSnapshot = (): string => localDateInputValue();
/** Servidor e hidratación: cadena vacía estable; la vista pinta el esqueleto. */
const getServerSnapshot = (): string => '';

/** Fecha local de hoy (YYYY-MM-DD) que se actualiza sola al pasar la medianoche. */
export function useTodayLocal(): string {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
