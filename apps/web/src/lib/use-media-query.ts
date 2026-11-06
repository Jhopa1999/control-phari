'use client';

import * as React from 'react';

/**
 * Coincidencia de una media query en el cliente. En el servidor devuelve
 * `serverValue` (sin desajuste de hidratación). Úsalo solo para elegir QUÉ se
 * renderiza; lo que solo cambia el aspecto se resuelve con clases.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
