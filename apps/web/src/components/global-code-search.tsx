'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CircleAlert,
  FolderKanban,
  Layers,
  ListChecks,
  Loader2,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { IdChip } from '@/components/id-chip';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import {
  CODE_SEARCH_ROLES,
  isVisibleCode,
  normalizeCode,
  resolveCode,
  resolveDestination,
  searchText,
  TEXT_SEARCH_MIN,
  type CodeResolution,
} from '@/lib/code-search';
import {
  getVisibleNavApps,
  getVisibleNavGroups,
  searchScreens,
  type ScreenEntry,
} from '@/lib/navigation';
import { useMediaQuery } from '@/lib/use-media-query';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { cn } from '@/lib/utils';

/*
 * Paleta de búsqueda Ctrl/⌘+K (design/oleada4-a-busqueda.md). Un solo campo y dos
 * grupos: «Pantallas» (local, instantáneo) y «Solicitudes y tareas» (API: un
 * código completo con GET /codes/{code}, otro texto con GET /search). Solo la
 * instancia visible (escritorio o móvil) se monta; el menú lateral y el atajo
 * la abren con un evento de ventana.
 */

/** A partir de aquí manda la barra de escritorio (lg); igual que MobileNav. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
const DEBOUNCE_MS = 300;
const OPEN_EVENT = 'search-palette:open';
const TOGGLE_EVENT = 'search-palette:toggle';
const PALETTE_ATTR = 'data-search-palette';
const PLACEHOLDER = 'Buscar pantallas, solicitudes o tareas…';
const PLACEHOLDER_SCREENS = 'Buscar pantallas…';

/** Abre la paleta desde cualquier parte (p. ej. el botón del menú lateral). */
export function openSearchPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

const TYPE_META = {
  REQUEST: { label: 'Solicitud', icon: FolderKanban },
  PHASE: { label: 'Fase', icon: Layers },
  TASK: { label: 'Tarea', icon: ListChecks },
} as const;

function isOtherDialogOpen(): boolean {
  return Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
  ).some((dialog) => !dialog.hasAttribute(PALETTE_ATTR));
}

/**
 * Atajos globales: `Ctrl+K` / `⌘+K` abre (o cierra) la paleta, también con el
 * foco en un campo editable; `/` la abre salvo en campos editables. Ninguno
 * actúa si hay otro diálogo modal abierto.
 */
export function CodeSearchShortcut(): null {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
        if (isOtherDialogOpen()) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
        return;
      }
      if (event.key !== '/' || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(OPEN_EVENT));
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return null;
}

export interface GlobalCodeSearchProps {
  /** `desktop` en la barra superior; `mobile` dentro de MobileNav. */
  placement: 'desktop' | 'mobile';
}

export function GlobalCodeSearch({ placement }: GlobalCodeSearchProps): React.ReactElement | null {
  const { state } = useActor();
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  const active = placement === 'desktop' ? isDesktop : !isDesktop;
  // Sin actor resuelto no se monta ningún disparador.
  if (state !== 'success' || !active) return null;
  return <PaletteHost placement={placement} />;
}

function PaletteHost({ placement }: GlobalCodeSearchProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const previousFocusRef = React.useRef<Element | null>(null);
  const pendingFocusRef = React.useRef(false);
  const skipRestoreRef = React.useRef(false);

  const remember = React.useCallback(() => {
    previousFocusRef.current = document.activeElement;
  }, []);

  React.useEffect(() => {
    function onOpen(): void {
      remember();
      setOpen(true);
    }
    function onToggle(): void {
      remember();
      setOpen((prev) => !prev);
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener(TOGGLE_EVENT, onToggle);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener(TOGGLE_EVENT, onToggle);
    };
  }, [remember]);

  // Foco en el contenido nuevo tras navegar desde la paleta.
  const searchKey = searchParams.toString();
  React.useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    document.getElementById('contenido')?.focus();
  }, [pathname, searchKey]);

  const navigate = React.useCallback(
    (href: string) => {
      const current = `${pathname}${searchKey ? `?${searchKey}` : ''}`;
      if (href !== current) {
        pendingFocusRef.current = true;
        skipRestoreRef.current = true;
      }
      setOpen(false);
      router.push(href);
    },
    [pathname, router, searchKey],
  );

  return (
    <>
      {placement === 'desktop' ? (
        <DesktopTrigger
          onOpen={() => {
            remember();
            setOpen(true);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Buscar"
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K /"
          onClick={() => {
            remember();
            setOpen(true);
          }}
        >
          <Search aria-hidden="true" />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          {...{ [PALETTE_ATTR]: '' }}
          size="lg"
          className="left-0 top-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 motion-reduce:animate-none md:top-[12vh] md:left-1/2 md:h-auto md:max-h-[min(34rem,76dvh)] md:w-[calc(100%-2rem)] md:max-w-[640px] md:-translate-x-1/2 md:translate-y-0 md:rounded-xl md:border md:border-border"
          aria-describedby="search-palette-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (skipRestoreRef.current) {
              skipRestoreRef.current = false;
              return;
            }
            const previous = previousFocusRef.current;
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Buscar en el portal</DialogTitle>
            <DialogDescription id="search-palette-description">
              Escribe para buscar pantallas, solicitudes y tareas. Usa las flechas para moverte e
              Intro para abrir.
            </DialogDescription>
          </DialogHeader>
          <PaletteBody onNavigate={navigate} />
        </DialogContent>
      </Dialog>
    </>
  );
}

const subscribeNever = (): (() => void) => () => undefined;
const isMacPlatform = (): boolean => /Mac|iPhone|iPad/i.test(navigator.platform);

function ShortcutKey({ className }: { className?: string }): React.ReactElement {
  // Se decide tras montar para no desajustar la hidratación (servidor: Ctrl).
  const mac = React.useSyncExternalStore(subscribeNever, isMacPlatform, () => false);
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        'ml-auto rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5 text-muted-foreground pointer-coarse:hidden',
        className,
      )}
    >
      {mac ? '⌘K' : 'Ctrl K'}
    </kbd>
  );
}

function DesktopTrigger({ onOpen }: { onOpen: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      aria-label="Buscar en el portal"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K /"
      onClick={onOpen}
      className="inline-flex h-8 w-56 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-10 xl:w-72"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">Buscar…</span>
      <ShortcutKey />
    </button>
  );
}

/** Disparador del menú lateral (expandido o riel). */
export function SidebarSearchTrigger({
  variant,
  onBeforeOpen,
}: {
  variant: 'field' | 'rail';
  /** Cajón móvil: se cierra antes de abrir la paleta para no apilar dos diálogos. */
  onBeforeOpen?: () => void;
}): React.ReactElement {
  function open(): void {
    if (!onBeforeOpen) {
      openSearchPalette();
      return;
    }
    onBeforeOpen();
    window.setTimeout(openSearchPalette, 150);
  }
  if (variant === 'rail') {
    return (
      <Button
        type="button"
        variant="sidebar"
        size="icon-sm"
        aria-label="Buscar (Ctrl K)"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K /"
        onClick={open}
      >
        <Search aria-hidden="true" />
      </Button>
    );
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K /"
      onClick={open}
      className="inline-flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-field-border bg-sidebar-field px-2.5 text-sm text-sidebar-muted-foreground transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring pointer-coarse:h-10"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">Buscar…</span>
      <ShortcutKey className="border-sidebar-field-border bg-transparent text-sidebar-muted-foreground" />
    </button>
  );
}

type ApiStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

type PaletteItem =
  | { key: string; kind: 'screen'; entry: ScreenEntry }
  | { key: string; kind: 'result'; resolution: CodeResolution; href: string | null };

function PaletteBody({ onNavigate }: { onNavigate: (href: string) => void }): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const canSearchApi = (permissions?.roleCodes ?? []).some((role) =>
    CODE_SEARCH_ROLES.includes(role),
  );
  const id = React.useId();
  const listboxId = `${id}-listbox`;
  const optionId = (index: number): string => `${id}-opt-${index}`;
  const screensHeadingId = `${id}-g-screens`;
  const resultsHeadingId = `${id}-g-results`;

  const inputRef = React.useRef<HTMLInputElement>(null);
  const immediateRef = React.useRef(false);
  const [text, setText] = React.useState('');
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<ApiStatus>('idle');
  const [items, setItems] = React.useState<CodeResolution[] | null>(null);
  const [truncated, setTruncated] = React.useState(false);
  const [forbidden, setForbidden] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [notice, setNotice] = React.useState('');

  const trimmed = text.trim();
  const codeQuery = canSearchApi && isVisibleCode(trimmed);
  const apiEnabled = canSearchApi && !forbidden && trimmed.length >= TEXT_SEARCH_MIN;

  const visibleGroups = React.useMemo(() => getVisibleNavGroups(allowedModules), [allowedModules]);
  const visibleApps = React.useMemo(() => getVisibleNavApps(allowedModules), [allowedModules]);
  const screens = React.useMemo(
    () => searchScreens(visibleGroups, visibleApps, trimmed),
    [visibleGroups, visibleApps, trimmed],
  );

  // Consulta a la API: 300 ms tras la última tecla; cancela la anterior.
  useResetOnChange([apiEnabled, codeQuery, trimmed, retry], () => {
    if (apiEnabled) {
      setStatus('loading');
    } else {
      setStatus('idle');
      setItems(null);
      setTruncated(false);
    }
  });
  React.useEffect(() => {
    if (!apiEnabled) return;
    const controller = new AbortController();
    const immediate = immediateRef.current;
    immediateRef.current = false;
    const timer = window.setTimeout(
      () => {
        void (async () => {
          try {
            if (codeQuery) {
              const result = await resolveCode(trimmed, controller.signal);
              if (controller.signal.aborted) return;
              if (result.kind === 'found') {
                setItems([result.resolution]);
                setTruncated(false);
                setStatus('ready');
                if (immediate) {
                  const href = resolveDestination(result.resolution, allowedModules);
                  if (href) onNavigate(href);
                  else setNotice('Encontrado, pero tu rol no puede abrirlo.');
                }
              } else if (result.kind === 'not-found') {
                setItems([]);
                setStatus('not-found');
              } else if (result.kind === 'forbidden') {
                setForbidden(true);
              } else {
                setStatus('error');
              }
              return;
            }
            const result = await searchText(trimmed, controller.signal);
            if (controller.signal.aborted) return;
            if (result.kind === 'ok') {
              setItems([...result.data.requests, ...result.data.tasks]);
              setTruncated(result.data.truncated);
              setStatus('ready');
            } else if (result.kind === 'forbidden') {
              setForbidden(true);
            } else {
              setStatus('error');
            }
          } catch {
            // Petición cancelada: la respuesta tardía se descarta.
          }
        })();
      },
      immediate ? 0 : DEBOUNCE_MS,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiEnabled, codeQuery, trimmed, retry, allowedModules, onNavigate]);

  const resultItems = React.useMemo<PaletteItem[]>(
    () =>
      status === 'not-found' || items === null
        ? []
        : items.map((resolution) => ({
            key: `r:${resolution.type}:${resolution.id}`,
            kind: 'result',
            resolution,
            href: resolveDestination(resolution, allowedModules),
          })),
    [items, status, allowedModules],
  );
  const screenItems = React.useMemo<PaletteItem[]>(
    () => screens.map((entry) => ({ key: `s:${entry.item.href}`, kind: 'screen', entry })),
    [screens],
  );
  const showResultsGroup = canSearchApi;
  const emptyBlock =
    trimmed !== '' &&
    screenItems.length === 0 &&
    (!canSearchApi || forbidden || (status === 'ready' && resultItems.length === 0));
  const resultsFirst = codeQuery;
  const flat = React.useMemo<PaletteItem[]>(
    () => (resultsFirst ? [...resultItems, ...screenItems] : [...screenItems, ...resultItems]),
    [resultsFirst, resultItems, screenItems],
  );

  // La activa se conserva mientras exista; si no, la primera habilitada.
  const firstEnabled = flat.findIndex((item) => item.kind === 'screen' || item.href !== null);
  const found = flat.findIndex((item) => item.key === activeKey);
  const activeIndex = found >= 0 ? found : firstEnabled >= 0 ? firstEnabled : flat.length > 0 ? 0 : -1;

  React.useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    // optionId depende solo de `id`, estable durante la vida del cuerpo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, id]);

  function activate(item: PaletteItem): void {
    if (item.kind === 'screen') {
      onNavigate(item.entry.item.href);
    } else if (item.href) {
      onNavigate(item.href);
    } else {
      setNotice('Encontrado, pero tu rol no puede abrirlo.');
    }
  }

  function move(delta: 1 | -1): void {
    if (flat.length === 0) return;
    const base = activeIndex < 0 ? (delta === 1 ? -1 : 0) : activeIndex;
    const next = (base + delta + flat.length) % flat.length;
    setActiveKey(flat[next].key);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.nativeEvent.isComposing) return;
      const active = activeIndex >= 0 ? flat[activeIndex] : null;
      if (codeQuery && status !== 'ready' && status !== 'not-found') {
        // Código completo sin respuesta todavía: resuelve ya y navega al llegar.
        immediateRef.current = true;
        setRetry((n) => n + 1);
      } else if (active) {
        activate(active);
      }
    }
  }

  const loadingNoResults = status === 'loading' && items === null;
  const busy = status === 'loading' && items !== null;

  // Mensaje de la región viva: se anuncia al asentarse la búsqueda, no en cada tecla.
  const settled = ((): string => {
    if (trimmed === '') return '';
    if (status === 'loading') return '';
    if (status === 'error') return 'No se pudo buscar solicitudes y tareas.';
    if (status === 'not-found') return `No encontramos ${normalizeCode(trimmed)}, o no tienes acceso.`;
    const requests = resultItems.filter((i) => i.kind === 'result' && i.resolution.type === 'REQUEST').length;
    const tasks = resultItems.filter((i) => i.kind === 'result' && i.resolution.type === 'TASK').length;
    if (flat.length === 0) return 'Sin resultados.';
    const parts = [
      `${screenItems.length} ${screenItems.length === 1 ? 'pantalla' : 'pantallas'}`,
      `${requests} ${requests === 1 ? 'solicitud' : 'solicitudes'}`,
      `${tasks} ${tasks === 1 ? 'tarea' : 'tareas'}`,
    ];
    return `${parts.join(', ')}.${truncated ? ' Hay más resultados.' : ''}`;
  })();

  function renderScreenGroup(startIndex: number): React.ReactNode {
    if (screenItems.length === 0) return null;
    return (
      <div role="group" aria-labelledby={screensHeadingId} className="mb-1 last:mb-0">
        <GroupHeading id={screensHeadingId}>Pantallas</GroupHeading>
        {screenItems.map((item, i) =>
          item.kind === 'screen' ? (
            <ScreenRow
              key={item.key}
              id={optionId(startIndex + i)}
              entry={item.entry}
              active={activeIndex === startIndex + i}
              onSelect={() => activate(item)}
              onPointerMove={() => setActiveKey(item.key)}
            />
          ) : null,
        )}
      </div>
    );
  }

  function renderResultsGroup(startIndex: number): React.ReactNode {
    if (!showResultsGroup) return null;
    let body: React.ReactNode;
    if (forbidden) {
      body = <Note icon>Tu rol no puede buscar solicitudes ni tareas.</Note>;
    } else if (trimmed === '') {
      body = <Note>Escribe un código (PRY-0012) o parte del título para buscar solicitudes y tareas.</Note>;
    } else if (trimmed.length < TEXT_SEARCH_MIN) {
      body = <Note>Escribe al menos 2 caracteres para buscar solicitudes y tareas.</Note>;
    } else if (loadingNoResults) {
      body = (
        <div aria-hidden="true" className="space-y-1 px-1 py-1">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-12 rounded-lg animate-none" />
          ))}
        </div>
      );
    } else if (status === 'error') {
      body = (
        <div className="flex items-start gap-2 px-3 py-2 text-sm text-foreground">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-2">
            <p>No se pudo buscar solicitudes y tareas. Inténtalo de nuevo.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRetry((n) => n + 1);
                inputRef.current?.focus();
              }}
            >
              Reintentar
            </Button>
          </div>
        </div>
      );
    } else if (status === 'not-found') {
      body = (
        <Note icon>
          No encontramos {normalizeCode(trimmed)}, o no tienes acceso. Revisa que esté completo.
        </Note>
      );
    } else if (resultItems.length === 0) {
      body = <Note>No hay solicitudes ni tareas que coincidan.</Note>;
    } else {
      body = (
        <>
          {resultItems.map((item, i) =>
            item.kind === 'result' ? (
              <ResultRow
                key={item.key}
                id={optionId(startIndex + i)}
                resolution={item.resolution}
                disabled={item.href === null}
                active={activeIndex === startIndex + i}
                onSelect={() => activate(item)}
                onPointerMove={() => setActiveKey(item.key)}
              />
            ) : null,
          )}
          {truncated ? <Note>Hay más resultados. Escribe más para acotar.</Note> : null}
        </>
      );
    }
    return (
      // Sin opciones no es un grupo del listbox (ARIA): queda como texto de ayuda.
      <div
        role={resultItems.length > 0 ? 'group' : undefined}
        aria-labelledby={resultItems.length > 0 ? resultsHeadingId : undefined}
        aria-busy={busy || undefined}
        className="mb-1 last:mb-0"
      >
        <GroupHeading id={resultsHeadingId}>Solicitudes y tareas</GroupHeading>
        {body}
      </div>
    );
  }

  const screensStart = resultsFirst ? resultItems.length : 0;
  const resultsStart = resultsFirst ? 0 : screenItems.length;
  const activeId = activeIndex >= 0 ? optionId(activeIndex) : undefined;

  return (
    <>
      <div className="relative flex h-14 shrink-0 items-center border-b border-border md:h-12">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 size-4 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={text}
          autoFocus
          placeholder={canSearchApi ? PLACEHOLDER : PLACEHOLDER_SCREENS}
          aria-label={canSearchApi ? 'Buscar pantallas, solicitudes o tareas' : 'Buscar pantallas'}
          aria-expanded={flat.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={emptyBlock ? undefined : activeId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => {
            setText(event.target.value);
            setNotice('');
          }}
          onKeyDown={handleKeyDown}
          className="h-full w-full bg-transparent pl-11 pr-20 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:text-sm"
        />
        {busy ? (
          <Loader2
            aria-hidden="true"
            className="pointer-events-none absolute right-[4.5rem] size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : text !== '' ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setText('');
              setNotice('');
              inputRef.current?.focus();
            }}
            className="absolute right-12 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-10"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {emptyBlock ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-subtle">
              <SearchX aria-hidden="true" className="size-5 text-link" />
            </span>
            <p className="text-sm font-medium text-foreground">
              No encontramos resultados para «{trimmed}»
            </p>
            <p className="text-xs text-muted-foreground">
              {canSearchApi
                ? 'Revisa la ortografía y las tildes, o prueba con otra parte del título. Para ir directo, escribe el código completo.'
                : 'Revisa la ortografía o prueba con otra parte del nombre de la pantalla.'}
            </p>
          </div>
        ) : null}
        <div
          id={listboxId}
          role={flat.length > 0 ? 'listbox' : undefined}
          aria-label={flat.length > 0 ? 'Resultados' : undefined}
          hidden={emptyBlock}
        >
          {resultsFirst ? (
            <>
              {renderResultsGroup(resultsStart)}
              {renderScreenGroup(screensStart)}
            </>
          ) : (
            <>
              {renderScreenGroup(screensStart)}
              {renderResultsGroup(resultsStart)}
            </>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="hidden shrink-0 items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground pointer-fine:md:flex"
      >
        <span className="inline-flex items-center gap-1.5">
          <Kbd>↑↓</Kbd> moverse
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Intro</Kbd> abrir
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Esc</Kbd> cerrar
        </span>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {notice || settled}
      </div>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5 text-muted-foreground">
      {children}
    </kbd>
  );
}

function GroupHeading({ id, children }: { id: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div
      id={id}
      className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {children}
    </div>
  );
}

function Note({
  children,
  icon = false,
}: {
  children: React.ReactNode;
  icon?: boolean;
}): React.ReactElement {
  return (
    <p className="flex items-start gap-2 px-3 py-2 text-xs text-muted-foreground">
      {icon ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
      <span>{children}</span>
    </p>
  );
}

const ROW_CLASS =
  'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left pointer-coarse:min-h-14 hover:bg-accent data-[active=true]:bg-primary-subtle data-[active=true]:hover:bg-primary-subtle before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full data-[active=true]:before:bg-link aria-disabled:cursor-default forced-colors:data-[active=true]:bg-[Highlight] forced-colors:data-[active=true]:text-[HighlightText]';

function ScreenRow({
  id,
  entry,
  active,
  onSelect,
  onPointerMove,
}: {
  id: string;
  entry: ScreenEntry;
  active: boolean;
  onSelect: () => void;
  onPointerMove: () => void;
}): React.ReactElement {
  const Icon = entry.item.icon;
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-active={active}
      onClick={onSelect}
      onMouseMove={onPointerMove}
      className={cn(ROW_CLASS, 'flex-col items-start gap-0.5 md:flex-row md:items-center md:gap-3')}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">{entry.item.label}</span>
      </span>
      {entry.hint ? (
        <span className="truncate pl-7 text-xs text-muted-foreground md:ml-auto md:pl-0">
          {entry.hint}
        </span>
      ) : null}
      {active ? (
        <span aria-hidden="true" className="hidden shrink-0 text-xs text-muted-foreground md:block pointer-coarse:hidden">
          Intro
        </span>
      ) : null}
    </div>
  );
}

function ResultRow({
  id,
  resolution,
  disabled,
  active,
  onSelect,
  onPointerMove,
}: {
  id: string;
  resolution: CodeResolution;
  disabled: boolean;
  active: boolean;
  onSelect: () => void;
  onPointerMove: () => void;
}): React.ReactElement {
  const meta = TYPE_META[resolution.type];
  const Icon = meta.icon;
  const context =
    resolution.type === 'TASK'
      ? [resolution.phaseName, resolution.requestCode, resolution.requestTitle]
      : resolution.type === 'PHASE'
        ? [resolution.requestCode, resolution.requestTitle]
        : [resolution.processName];
  const noun =
    resolution.type === 'TASK' ? 'esta tarea' : resolution.type === 'PHASE' ? 'esta fase' : 'esta solicitud';
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      data-active={active}
      onClick={onSelect}
      onMouseMove={onPointerMove}
      className={cn(ROW_CLASS, 'items-start')}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          {meta.label}
          <IdChip code={resolution.code} variant="full" copyable={false} />
        </p>
        <p
          className={cn(
            'line-clamp-2 break-words text-sm font-medium md:line-clamp-1',
            disabled ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {resolution.title}
        </p>
        <p className="line-clamp-1 break-words text-xs text-muted-foreground">
          {disabled
            ? `Tu rol no tiene una pantalla para abrir ${noun}.`
            : context.filter(Boolean).join(' · ')}
        </p>
      </div>
      {resolution.type !== 'PHASE' && resolution.status ? (
        <StatusBadge kind={resolution.type === 'TASK' ? 'task' : 'request'} value={resolution.status} />
      ) : null}
    </div>
  );
}
