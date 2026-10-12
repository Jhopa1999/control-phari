'use client';

import * as React from 'react';
import { EmptyState, type EmptyStateProps } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Avisa a MasterDetail de que el usuario eligió un ítem (no la autoselección). */
const UserSelectContext = React.createContext<(() => void) | null>(null);

/** Por debajo de 1024 px la lista y el detalle van uno sobre otro. */
const STACKED_QUERY = '(max-width: 1023.98px)';

export interface MasterDetailProps {
  /** h2 visible: «Mis diarios», «Novedades». */
  listTitle: string;
  /** Normalmente <SelectableList/>. */
  list: React.ReactNode;
  detail: React.ReactNode;
  /** Encabezado del detalle (tabIndex -1): recibe el foco tras elegir en <1024 px. */
  detailHeadingRef?: React.RefObject<HTMLHeadingElement | null>;
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
}: MasterDetailProps): React.ReactElement {
  const listTitleId = React.useId();
  const detailRef = React.useRef<HTMLDivElement>(null);
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
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <section
          aria-labelledby={listTitleId}
          className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6"
        >
          <h2 id={listTitleId} className="text-base font-semibold">
            {listTitle}
          </h2>
          <div className="overflow-y-auto rounded-lg border bg-card lg:max-h-[calc(100dvh-8rem)]">
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
  /** 4 esqueletos de 56 px. */
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
          <div key={index} className="flex h-14 flex-col justify-center gap-2 px-3">
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
                'relative flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                selected ? 'bg-primary-subtle' : 'hover:bg-muted/40',
              )}
            >
              {selected ? (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="line-clamp-2 text-sm font-medium wrap-break-word">{item.title}</span>
                {item.meta ? (
                  <span className="text-meta text-muted-foreground">{item.meta}</span>
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
