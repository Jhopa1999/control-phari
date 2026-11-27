'use client';

import * as React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { EmptyState, type EmptyStateProps } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LabelTooltip } from '@/components/ui/tooltip';
import { createLocalPrefStore, type LocalPrefStore } from '@/lib/local-pref-store';
import { cn } from '@/lib/utils';

/** Avisa a MasterDetail de que el usuario eligió un ítem (no la autoselección). */
const UserSelectContext = React.createContext<(() => void) | null>(null);

/** Por debajo de 1024 px la lista y el detalle van uno sobre otro. */
const STACKED_QUERY = '(max-width: 1023.98px)';

type ListPref = 'abierta' | 'plegada';

/** Un almacén por clave: cada vista recuerda su propio pliegue. */
const listPrefStores = new Map<string, LocalPrefStore<ListPref>>();

function listPrefStore(key: string): LocalPrefStore<ListPref> {
  let store = listPrefStores.get(key);
  if (!store) {
    const storageKey = `masterDetail.${key}`;
    store = createLocalPrefStore<ListPref>(
      () => {
        try {
          return window.localStorage.getItem(storageKey) === 'plegada' ? 'plegada' : 'abierta';
        } catch {
          return 'abierta';
        }
      },
      (value) => {
        try {
          window.localStorage.setItem(storageKey, value);
        } catch {
          // Sin almacenamiento: la elección vive en memoria hasta recargar.
        }
      },
      'abierta',
    );
    listPrefStores.set(key, store);
  }
  return store;
}

/** Almacén neutro para las vistas que no pliegan la lista (los hooks no son condicionales). */
const NEVER_COLLAPSED: LocalPrefStore<ListPref> = {
  subscribe: () => () => undefined,
  getSnapshot: () => 'abierta',
  getServerSnapshot: () => 'abierta',
  set: () => undefined,
};

export interface MasterDetailProps {
  /** h2 visible: «Mis diarios», «Reuniones». */
  listTitle: string;
  /** Normalmente <SelectableList/>. */
  list: React.ReactNode;
  detail: React.ReactNode;
  /** Encabezado del detalle (tabIndex -1): recibe el foco tras elegir en <1024 px. */
  detailHeadingRef?: React.RefObject<HTMLHeadingElement | null>;
  /**
   * Ref del h2 de la lista, que pasa a tener tabIndex -1: destino del foco
   * cuando se elimina el último registro y no queda detalle (NIT 4).
   */
  listHeadingRef?: React.Ref<HTMLHeadingElement>;
  /**
   * Si se indica, desde lg la lista se puede plegar para dar todo el ancho al
   * detalle; la elección se recuerda en localStorage con esta clave. Debajo de
   * lg la lista siempre se muestra (va apilada sobre el detalle).
   */
  collapsibleKey?: string;
}

/**
 * Maestro‑detalle (design §7.6): lista de 320 px fija al desplazar en lg y
 * detalle a la derecha. En <1024 px, tras una selección del usuario (no en la
 * autoselección inicial), el detalle se desplaza a la vista y su encabezado
 * recibe el foco; el desplazamiento respeta el scroll-padding-top de §5.4.
 */
export function MasterDetail({
  listTitle,
  list,
  detail,
  detailHeadingRef,
  listHeadingRef,
  collapsibleKey,
}: MasterDetailProps): React.ReactElement {
  const listTitleId = React.useId();
  const listBodyId = React.useId();
  const detailRef = React.useRef<HTMLDivElement>(null);
  const collapseButtonRef = React.useRef<HTMLButtonElement>(null);
  const expandButtonRef = React.useRef<HTMLButtonElement>(null);
  const store = collapsibleKey ? listPrefStore(collapsibleKey) : NEVER_COLLAPSED;
  const pref = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const collapsed = Boolean(collapsibleKey) && pref === 'plegada';
  const setCollapsed = (next: boolean): void => {
    store.set(next ? 'plegada' : 'abierta');
    // El botón que se pulsó desaparece: el foco pasa al que lo reemplaza.
    requestAnimationFrame(() => (next ? expandButtonRef : collapseButtonRef).current?.focus());
  };
  const [userSelections, setUserSelections] = React.useState(0);
  const notifyUserSelect = React.useCallback(() => setUserSelections((n) => n + 1), []);

  React.useEffect(() => {
    if (userSelections === 0) return;
    if (!window.matchMedia(STACKED_QUERY).matches) return;
    detailRef.current?.scrollIntoView({ block: 'start' });
    detailHeadingRef?.current?.focus({ preventScroll: true });
  }, [userSelections, detailHeadingRef]);

  return (
    <UserSelectContext.Provider value={notifyUserSelect}>
      <div
        className={cn(
          'flex flex-col gap-4 lg:grid lg:items-start',
          collapsed
            ? 'lg:grid-cols-[2.5rem_minmax(0,1fr)]'
            : 'lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] min-[1600px]:grid-cols-[380px_minmax(0,1fr)]',
        )}
      >
        <section
          aria-labelledby={listTitleId}
          className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-16"
        >
          <div className={cn('flex items-center justify-between gap-2', collapsed && 'lg:hidden')}>
            <h2
              id={listTitleId}
              ref={listHeadingRef}
              tabIndex={listHeadingRef ? -1 : undefined}
              className="rounded-sm text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {listTitle}
            </h2>
            {collapsibleKey ? (
              <LabelTooltip label={`Plegar la lista de ${listTitle.toLowerCase()}`} side="bottom">
                <Button
                  ref={collapseButtonRef}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hidden lg:inline-flex"
                  aria-label={`Plegar la lista de ${listTitle.toLowerCase()}`}
                  aria-expanded={true}
                  aria-controls={listBodyId}
                  onClick={() => setCollapsed(true)}
                >
                  <PanelLeftClose aria-hidden="true" />
                </Button>
              </LabelTooltip>
            ) : null}
          </div>
          {collapsed ? (
            <LabelTooltip label={`Desplegar la lista de ${listTitle.toLowerCase()}`} side="right">
              <Button
                ref={expandButtonRef}
                type="button"
                variant="outline"
                size="icon-sm"
                className="hidden bg-card shadow-card lg:inline-flex"
                aria-label={`Desplegar la lista de ${listTitle.toLowerCase()}`}
                aria-expanded={false}
                aria-controls={listBodyId}
                onClick={() => setCollapsed(false)}
              >
                <PanelLeftOpen aria-hidden="true" />
              </Button>
            </LabelTooltip>
          ) : null}
          <div
            id={listBodyId}
            className={cn(
              'overflow-y-auto rounded-xl border bg-card shadow-card lg:max-h-[calc(100dvh-9rem)]',
              collapsed && 'lg:hidden',
            )}
          >
            {list}
          </div>
        </section>
        <div ref={detailRef} className="min-w-0">
          {detail}
        </div>
      </div>
    </UserSelectContext.Provider>
  );
}

export interface SelectableListItem {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface SelectableListProps {
  items: SelectableListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** aria-label del <ul>. */
  label: string;
  /** 4 esqueletos de 52 px. */
  loading?: boolean;
  /** Tamaño compacto. */
  empty?: EmptyStateProps;
}

/**
 * Lista seleccionable del maestro‑detalle. El ítem seleccionado lleva
 * bg-primary-subtle, una barra izquierda de 2 px y aria-current="true".
 */
export function SelectableList({
  items,
  selectedId,
  onSelect,
  label,
  loading = false,
  empty,
}: SelectableListProps): React.ReactElement | null {
  const notifyUserSelect = React.useContext(UserSelectContext);
  if (loading) {
    return (
      <div aria-hidden="true" className="divide-y">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex h-[52px] flex-col justify-center gap-2 px-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return empty ? <EmptyState size="compact" {...empty} /> : null;
  }
  return (
    <ul aria-label={label} className="divide-y">
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-current={selected ? 'true' : undefined}
              onClick={() => {
                onSelect(item.id);
                notifyUserSelect?.();
              }}
              className={cn(
                'relative flex min-h-[52px] w-full items-center gap-3 px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                selected ? 'bg-primary-subtle' : 'hover:bg-muted/40',
              )}
            >
              {selected ? (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium" title={typeof item.title === 'string' ? item.title : undefined}>{item.title}</span>
                {item.meta ? (
                  <span className="line-clamp-1 text-meta text-muted-foreground">{item.meta}</span>
                ) : null}
              </span>
              {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
