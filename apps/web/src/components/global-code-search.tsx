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
import { useActor } from '@/lib/actor-context';
import {
  CODE_SEARCH_ROLES,
  isVisibleCode,
  normalizeCode,
  resolveCode,
  resolveDestination,
  type CodeResolution,
} from '@/lib/code-search';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/*
 * Búsqueda global por ID visible (design/busqueda-global-id.md). Campo de
 * resultado único: el usuario escribe un código completo (PRY-0012,
 * PRY-0012-F2, PRY-0012-T07), la API lo resuelve y la fila navega. Solo la
 * instancia visible (escritorio o móvil) se monta (B13).
 */

/** A partir de aquí manda la barra de escritorio (lg); igual que MobileNav. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
const DEBOUNCE_MS = 400;
const SHORTCUT_EVENT = 'code-search:focus';
const EXAMPLES = 'PRY-0012, PRY-0012-F2 o PRY-0012-T07';

type View =
  | { kind: 'help' }
  | { kind: 'invalid' }
  | { kind: 'loading'; code: string }
  | { kind: 'found'; code: string; resolution: CodeResolution }
  | { kind: 'not-found'; code: string }
  | { kind: 'forbidden' }
  | { kind: 'error'; code: string };

const TYPE_META = {
  REQUEST: { label: 'Solicitud', icon: FolderKanban },
  PHASE: { label: 'Fase', icon: Layers },
  TASK: { label: 'Tarea', icon: ListChecks },
} as const;

/** `/` enfoca la búsqueda salvo en campos editables o con un diálogo abierto (B7). */
export function CodeSearchShortcut(): null {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== '/' || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT));
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return null;
}

export interface GlobalCodeSearchProps {
  /** `desktop` en la barra superior; `mobile` dentro de MobileNav. */
  placement: 'desktop' | 'mobile';
  /** Móvil: avisa a MobileNav de que el modo búsqueda cambió. */
  onModeChange?: (open: boolean) => void;
}

export function GlobalCodeSearch(props: GlobalCodeSearchProps): React.ReactElement | null {
  const { state, permissions } = useActor();
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  const allowed =
    state === 'success' &&
    (permissions?.roleCodes ?? []).some((role) => CODE_SEARCH_ROLES.includes(role));
  const active = props.placement === 'desktop' ? isDesktop : !isDesktop;
  if (!allowed || !active) return null;
  return <SearchBox {...props} />;
}

function SearchBox({ placement, onModeChange }: GlobalCodeSearchProps): React.ReactElement {
  const mobile = placement === 'mobile';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { allowedModules } = useActor();
  const id = React.useId();
  const listboxId = `${id}-listbox`;
  const optionId = `${id}-option`;
  const helpId = `${id}-help`;

  const formRef = React.useRef<HTMLFormElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const openButtonRef = React.useRef<HTMLButtonElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const pendingFocusRef = React.useRef(false);
  const navigateOnFoundRef = React.useRef(false);
  const toggleRef = React.useRef(false);

  const [open, setOpen] = React.useState(!mobile);
  const [text, setText] = React.useState('');
  const [view, setView] = React.useState<View>({ kind: 'help' });
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState('');

  const announce = React.useCallback((message: string) => {
    // Alterna un carácter invisible para re-anunciar un texto idéntico.
    toggleRef.current = !toggleRef.current;
    setAnnouncement(toggleRef.current ? message : `${message}\u200B`);
  }, []);

  const cancelPending = React.useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  React.useEffect(() => cancelPending, [cancelPending]);

  // Foco en el contenido nuevo tras navegar (B11).
  const searchKey = searchParams.toString();
  React.useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    document.getElementById('contenido')?.focus();
  }, [pathname, searchKey]);

  const closeMobile = React.useCallback(
    (restoreFocus: boolean) => {
      if (!mobile) return;
      setOpen(false);
      onModeChange?.(false);
      if (restoreFocus) window.setTimeout(() => openButtonRef.current?.focus(), 0);
    },
    [mobile, onModeChange],
  );

  const reset = React.useCallback(() => {
    cancelPending();
    setText('');
    setView({ kind: 'help' });
    setPanelOpen(false);
  }, [cancelPending]);

  // Atajo `/`: enfoca el campo; en móvil abre primero el modo búsqueda.
  React.useEffect(() => {
    function onShortcut(): void {
      if (mobile && !open) {
        setOpen(true);
        onModeChange?.(true);
        return;
      }
      inputRef.current?.focus();
    }
    window.addEventListener(SHORTCUT_EVENT, onShortcut);
    return () => window.removeEventListener(SHORTCUT_EVENT, onShortcut);
  }, [mobile, open, onModeChange]);

  React.useEffect(() => {
    if (mobile && open) inputRef.current?.focus();
  }, [mobile, open]);

  const go = React.useCallback(
    (resolution: CodeResolution): boolean => {
      const destination = resolveDestination(resolution, allowedModules);
      if (!destination) {
        announce('Encontrado, pero tu rol no puede abrirlo.');
        return false;
      }
      pendingFocusRef.current = true;
      reset();
      inputRef.current?.blur();
      closeMobile(false);
      router.push(destination);
      return true;
    },
    [allowedModules, announce, closeMobile, reset, router],
  );

  const run = React.useCallback(
    async (raw: string, navigate: boolean) => {
      cancelPending();
      const code = normalizeCode(raw);
      const controller = new AbortController();
      abortRef.current = controller;
      navigateOnFoundRef.current = navigate;
      // Conserva el resultado anterior mientras llega el nuevo (B9).
      setView((prev) => (prev.kind === 'found' ? prev : { kind: 'loading', code }));
      setPanelOpen(true);
      let result;
      try {
        result = await resolveCode(code, controller.signal);
      } catch {
        return; // petición cancelada: la respuesta tardía se descarta
      }
      if (controller.signal.aborted) return;
      switch (result.kind) {
        case 'found': {
          const { resolution } = result;
          setView({ kind: 'found', code, resolution });
          if (navigateOnFoundRef.current) {
            go(resolution);
          } else {
            const meta = TYPE_META[resolution.type];
            announce(
              `Encontrado: ${meta.label.toLowerCase()} ${resolution.code}, ${resolution.title}. Pulsa Intro para abrir.`,
            );
          }
          break;
        }
        case 'not-found':
          setView({ kind: 'not-found', code });
          announce(`No se encontró ${code} o no tienes acceso.`);
          break;
        case 'invalid':
          setView({ kind: 'invalid' });
          announce('Código no válido.');
          break;
        case 'forbidden':
          setView({ kind: 'forbidden' });
          announce('Tu rol no puede buscar por código.');
          break;
        default:
          setView({ kind: 'error', code });
          announce('Error al buscar. Inténtalo de nuevo.');
      }
    },
    [announce, cancelPending, go],
  );

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setText(next);
    cancelPending();
    if (next.trim() === '') {
      setView({ kind: 'help' });
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
    if (!isVisibleCode(next)) {
      setView({ kind: 'help' });
      return;
    }
    timerRef.current = window.setTimeout(() => void run(next, false), DEBOUNCE_MS);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (text.trim() === '') return;
    if (!isVisibleCode(text)) {
      cancelPending();
      setView({ kind: 'invalid' });
      setPanelOpen(true);
      announce('Código no válido.');
      return;
    }
    if (view.kind === 'found' && view.code === normalizeCode(text)) {
      go(view.resolution);
      return;
    }
    void run(text, true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (panelOpen) {
      setPanelOpen(false);
    } else if (text !== '') {
      reset();
    } else {
      inputRef.current?.blur();
      closeMobile(true);
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLFormElement>): void {
    if (formRef.current?.contains(event.relatedTarget as Node | null)) return;
    setFocused(false);
    setPanelOpen(false);
  }

  if (mobile && !open) {
    return (
      <Button
        ref={openButtonRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Buscar por código"
        aria-expanded={false}
        aria-keyshortcuts="/"
        onClick={() => {
          setOpen(true);
          onModeChange?.(true);
        }}
      >
        <Search aria-hidden="true" />
      </Button>
    );
  }

  const found = view.kind === 'found' ? view : null;
  const foundDestination = found ? resolveDestination(found.resolution, allowedModules) : null;
  const busy = view.kind === 'loading' || (found !== null && found.code !== normalizeCode(text));
  const showListbox = found !== null && panelOpen;
  const invalid = view.kind === 'invalid' || view.kind === 'not-found';
  const showHint = !mobile && !focused && text === '';

  return (
    <form
      ref={formRef}
      role="search"
      aria-label="Búsqueda por código"
      onSubmit={handleSubmit}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={cn(mobile ? 'flex min-w-0 flex-1 items-center gap-2' : 'relative shrink-0')}
    >
      <div className={cn('relative', mobile && 'min-w-0 flex-1')}>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => text !== '' && setPanelOpen(true)}
          placeholder="Buscar código (PRY-0012)"
          aria-label="Buscar por código"
          aria-describedby={helpId}
          aria-keyshortcuts="/"
          aria-haspopup="listbox"
          aria-autocomplete="none"
          aria-expanded={showListbox}
          aria-controls={listboxId}
          aria-activedescendant={found && panelOpen ? optionId : undefined}
          aria-invalid={invalid || undefined}
          aria-busy={busy || undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          className={cn(
            'w-full min-w-0 rounded-md border border-input bg-background pl-8 pr-9 text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
            mobile ? 'h-11 text-base sm:text-sm' : 'h-8 w-56 text-sm pointer-coarse:h-10 xl:w-72',
          )}
        />
        {view.kind === 'loading' ? (
          <Loader2
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : text !== '' ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              reset();
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : showHint ? (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5 text-muted-foreground"
          >
            /
          </kbd>
        ) : null}
      </div>
      {mobile ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Cerrar búsqueda"
          onClick={() => {
            reset();
            closeMobile(true);
          }}
        >
          Cerrar
        </Button>
      ) : null}

      <span id={helpId} className="sr-only">
        Escribe un código completo, por ejemplo PRY-0012-T07. Pulsa / para llegar aquí desde
        cualquier página.
      </span>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {panelOpen ? (
        <div
          className={cn(
            'absolute top-full mt-1.5 max-h-[min(20rem,60dvh)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-card',
            mobile ? 'inset-x-2' : 'right-0 w-[min(28rem,calc(100vw-1.5rem))]',
          )}
        >
          {found ? (
            <>
              <ul id={listboxId} role="listbox" aria-label="Resultado de la búsqueda">
                <FoundRow
                  id={optionId}
                  resolution={found.resolution}
                  destination={foundDestination}
                  busy={busy}
                  onOpen={() => go(found.resolution)}
                />
              </ul>
              {!mobile && foundDestination ? (
                <p className="px-3 pb-1 text-right text-xs text-muted-foreground">Intro para abrir</p>
              ) : null}
            </>
          ) : (
            <Notice view={view} onRetry={() => void run(text, true)} />
          )}
        </div>
      ) : null}
    </form>
  );
}

function FoundRow({
  id,
  resolution,
  destination,
  busy,
  onOpen,
}: {
  id: string;
  resolution: CodeResolution;
  destination: string | null;
  busy: boolean;
  onOpen: () => void;
}): React.ReactElement {
  const meta = TYPE_META[resolution.type];
  const Icon = meta.icon;
  const context =
    resolution.type === 'TASK'
      ? [resolution.phaseName, resolution.requestCode, resolution.requestTitle]
      : resolution.type === 'PHASE'
        ? [resolution.requestCode, resolution.requestTitle]
        : [resolution.processName];
  return (
    <li
      id={id}
      role="option"
      aria-selected="true"
      aria-disabled={destination ? undefined : true}
      aria-busy={busy || undefined}
      data-disabled={destination ? undefined : 'true'}
      data-href={destination ?? undefined}
      onClick={onOpen}
      className="relative flex min-h-12 cursor-pointer items-start gap-3 rounded-lg bg-primary-subtle px-3 py-2 text-left before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-primary data-[disabled=true]:cursor-default"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon aria-hidden="true" className="size-3.5" />
          {meta.label}
          <IdChip code={resolution.code} variant="full" copyable={false} />
        </p>
        <p className="line-clamp-3 break-words text-sm font-medium text-foreground">
          {resolution.title}
        </p>
        <p className="break-words text-xs text-muted-foreground">
          {context.filter(Boolean).join(' · ')}
        </p>
        {destination ? null : (
          <p className="text-xs text-foreground">
            Tu rol no tiene una pantalla para abrir {resolution.type === 'TASK' ? 'esta tarea' : resolution.type === 'PHASE' ? 'esta fase' : 'esta solicitud'}.
          </p>
        )}
      </div>
      {resolution.type !== 'PHASE' && resolution.status ? (
        <StatusBadge kind={resolution.type === 'TASK' ? 'task' : 'request'} value={resolution.status} />
      ) : null}
    </li>
  );
}

function Notice({
  view,
  onRetry,
}: {
  view: View;
  onRetry: () => void;
}): React.ReactElement {
  const base = 'flex items-start gap-2 px-3 py-2 text-sm text-foreground';
  switch (view.kind) {
    case 'loading':
      return (
        <p className={base}>
          <Loader2 aria-hidden="true" className="mt-0.5 size-4 animate-spin motion-reduce:animate-none" />
          Buscando {view.code}…
        </p>
      );
    case 'invalid':
      return (
        <p className={base}>
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          No es un código válido. Usa {EXAMPLES}.
        </p>
      );
    case 'not-found':
      return (
        <div className={base}>
          <SearchX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>No encontramos {view.code}, o no tienes acceso.</p>
            <p className="text-xs text-muted-foreground">Revisa el código; debe escribirse completo.</p>
          </div>
        </div>
      );
    case 'forbidden':
      return (
        <p className={base}>
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Tu rol no puede buscar por código.
        </p>
      );
    case 'error':
      return (
        <div className={base}>
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-2">
            <p>No se pudo buscar. Inténtalo de nuevo.</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        </div>
      );
    default:
      return (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          Escribe el código completo. Ejemplos: {EXAMPLES}.
        </p>
      );
  }
}
