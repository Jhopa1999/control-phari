'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { createLocalPrefStore, type LocalPrefStore } from '@/lib/local-pref-store';

type FoldPref = 'abierto' | 'cerrado';

/** Claves de las colas plegables de Mi trabajo (cada una recuerda su estado). */
export type QueueFoldKey = 'por-aprobar' | 'recurrentes' | 'compromisos';

const STORAGE_KEYS: Record<QueueFoldKey, string> = {
  'por-aprobar': 'miTrabajoPorAprobarAbierto',
  recurrentes: 'miTrabajoRecurrentesAbierto',
  compromisos: 'miTrabajoCompromisosAbierto',
};

function makeStore(key: QueueFoldKey): LocalPrefStore<FoldPref> {
  const storageKey = STORAGE_KEYS[key];
  return createLocalPrefStore<FoldPref>(
    () => {
      try {
        return window.localStorage.getItem(storageKey) === 'abierto' ? 'abierto' : 'cerrado';
      } catch {
        return 'cerrado';
      }
    },
    (value) => {
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        // Sin almacenamiento: la elección vive en memoria hasta recargar.
      }
    },
    'cerrado',
  );
}

// Un almacén por cola, creado una sola vez (useSyncExternalStore exige identidad estable).
const STORES: Record<QueueFoldKey, LocalPrefStore<FoldPref>> = {
  'por-aprobar': makeStore('por-aprobar'),
  recurrentes: makeStore('recurrentes'),
  compromisos: makeStore('compromisos'),
};

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export interface QueueFoldProps {
  foldKey: QueueFoldKey;
  title: string;
  /** Recuento para el encabezado; null mientras carga o si falló (no se muestra). */
  count: number | null;
  /** Ancla (hash de la URL) que abre la cola al llegar, sin cambiar la preferencia guardada. */
  openOnHash?: string;
  /** Oculta toda la cola cuando no tiene elementos (las que no pintan estado vacío). */
  hideWhenEmpty?: boolean;
  children: React.ReactNode;
}

/**
 * Cola plegable de «Mi trabajo»: encabezado con título y recuento, cerrada por
 * defecto y con la preferencia recordada en localStorage. El contenido sigue
 * montado cuando está cerrada (atributo `hidden`) para que cargue y el recuento
 * del encabezado sea real.
 */
export function QueueFold({
  foldKey,
  title,
  count,
  openOnHash,
  hideWhenEmpty = false,
  children,
}: QueueFoldProps): React.ReactElement {
  const store = STORES[foldKey];
  const pref = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const contentId = `mt-cola-${foldKey}`;
  // Llegada con ancla (/mi-trabajo#por-aprobar): se abre sin tocar la preferencia guardada.
  const hashMatches = React.useSyncExternalStore(
    subscribeHash,
    () => openOnHash !== undefined && window.location.hash === `#${openOnHash}`,
    () => false,
  );
  // Si la persona la cierra con el ancla en la URL, se respeta su decisión.
  const [hashDismissed, setHashDismissed] = React.useState(false);

  const open = pref === 'abierto' || (hashMatches && !hashDismissed);
  const empty = hideWhenEmpty && count === 0;

  function toggle(): void {
    setHashDismissed(true);
    store.set(open ? 'cerrado' : 'abierto');
  }

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="flex flex-col gap-2" hidden={empty || undefined} data-testid={`cola-${foldKey}`}>
      <button
        type="button"
        id={`${contentId}-toggle`}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={toggle}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-card px-4 py-2 text-left font-heading text-base font-semibold shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:min-h-10"
      >
        <Chevron className="size-4 shrink-0" aria-hidden="true" />
        <span>{title}</span>
        {count !== null ? (
          <span className="rounded-md bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
            <span className="sr-only">{count === 1 ? ' elemento' : ' elementos'}</span>
          </span>
        ) : null}
      </button>
      <div id={contentId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
