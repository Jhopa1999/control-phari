'use client';

import * as React from 'react';
import { createLocalPrefStore } from './local-pref-store';

/**
 * Grupos del menú lateral que el usuario plegó (BL-027). Se recuerda por
 * navegador en localStorage, como la preferencia del riel: sin valor = los
 * grupos plegados por defecto (hoy solo la sección «workspace»). El valor
 * guardado es la lista de ids separada por comas (un primitivo, para que el
 * snapshot de useSyncExternalStore sea estable); `-` significa «ninguno
 * plegado» (el usuario abrió todo), distinto de «sin valor».
 */
const STORAGE_KEY = 'navCollapsedGroups';
/** Grupos plegados mientras el usuario no haya elegido nada. */
const DEFAULT_COLLAPSED = ['workspace'];
const NONE = '-';

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
  if (raw === '') return DEFAULT_COLLAPSED;
  if (raw === NONE) return [];
  return raw.split(',').filter((id) => id !== '' && id !== NONE);
}

function serialize(ids: Iterable<string>): string {
  const list = Array.from(ids);
  return list.length === 0 ? NONE : list.join(',');
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
    store.set(serialize(current));
  }, []);

  const expand = React.useCallback((id: string) => {
    const current = new Set(parse(store.getSnapshot()));
    if (!current.delete(id)) return;
    store.set(serialize(current));
  }, []);

  return { collapsed, toggle, expand };
}
