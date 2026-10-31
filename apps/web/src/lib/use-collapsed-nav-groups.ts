'use client';

import * as React from 'react';
import { createLocalPrefStore } from './local-pref-store';

/**
 * Grupos del menú lateral que el usuario plegó (BL-027). Se recuerda por
 * navegador en localStorage, como la preferencia del riel: sin valor = todos
 * abiertos. El valor guardado es la lista de ids separada por comas (un
 * primitivo, para que el snapshot de useSyncExternalStore sea estable).
 */
const STORAGE_KEY = 'navCollapsedGroups';

const store = createLocalPrefStore<string>(readRaw, writeRaw, '');

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // localStorage no disponible: todos abiertos.
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

function parse(raw: string): string[] {
  return raw === '' ? [] : raw.split(',').filter((id) => id !== '');
}

export interface CollapsedNavGroups {
  /** Ids de los grupos plegados. */
  collapsed: ReadonlySet<string>;
  /** Pliega o despliega un grupo y lo recuerda. */
  toggle: (id: string) => void;
  /** Despliega un grupo (no hace nada si ya está abierto). */
  expand: (id: string) => void;
}

export function useCollapsedNavGroups(): CollapsedNavGroups {
  const raw = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const collapsed = React.useMemo<ReadonlySet<string>>(() => new Set(parse(raw)), [raw]);

  const toggle = React.useCallback((id: string) => {
    const current = new Set(parse(store.getSnapshot()));
    if (current.has(id)) current.delete(id);
    else current.add(id);
    store.set(Array.from(current).join(','));
  }, []);

  const expand = React.useCallback((id: string) => {
    const current = new Set(parse(store.getSnapshot()));
    if (!current.delete(id)) return;
    store.set(Array.from(current).join(','));
  }, []);

  return { collapsed, toggle, expand };
}
