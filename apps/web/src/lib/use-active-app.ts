'use client';

import * as React from 'react';
import { createLocalPrefStore } from './local-pref-store';

/**
 * Última aplicación del workspace usada (localStorage, por navegador). Sirve
 * para que el menú conserve su contexto en las pantallas transversales
 * (Gobierno, Administración) y en /aplicaciones. Sin valor = ninguna.
 */
const STORAGE_KEY = 'activeAppId';

const store = createLocalPrefStore<string>(readRaw, writeRaw, '');

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeRaw(value: string): void {
  try {
    if (value === '') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Sin persistencia: la elección dura hasta recargar.
  }
}

/** Devuelve la última app usada (o null) y una función para guardarla. */
export function useLastAppId(): [string | null, (id: string) => void] {
  const raw = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const set = React.useCallback((id: string) => store.set(id), []);
  return [raw === '' ? null : raw, set];
}
