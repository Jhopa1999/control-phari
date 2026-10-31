'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Info, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { BrandMark, BrandName } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { LabelTooltip } from '@/components/ui/tooltip';
import { useActor } from '@/lib/actor-context';
import { listDevActors } from '@/lib/dev-actors';
import {
  getVisibleNavGroups,
  isNavItemActive,
  searchNavItems,
  type NavItem,
} from '@/lib/navigation';
import { useCollapsedNavGroups } from '@/lib/use-collapsed-nav-groups';
import { initialsOf } from '@/lib/user-initials';
import { useSidebarMode } from '@/lib/use-sidebar-mode';
import { cn } from '@/lib/utils';
import type { DevActor } from '@/lib/api-client';

type ActorsState = 'loading' | 'success' | 'error';
type MenuState = 'loading' | 'no-actor' | 'error' | 'empty' | 'ready';

export interface AppSidebarProps {
  /** 'desktop': aside fijo (≥1024 px) con riel; 'drawer': dentro del cajón móvil, siempre expandido. */
  variant: 'desktop' | 'drawer';
  /** Se llama al pulsar cualquier enlace del menú o la marca (el cajón se cierra). */
  onNavigate?: () => void;
}

/** Primer elemento de la lista que se ve (los botones alternados se ocultan con display: none). */
function firstVisible(...elements: Array<HTMLElement | null>): HTMLElement | null {
  return elements.find((el) => el !== null && el.offsetParent !== null) ?? null;
}

function NavLink({
  item,
  active,
  isRail,
  onNavigate,
  hint,
}: {
  item: NavItem;
  active: boolean;
  isRail: boolean;
  onNavigate?: () => void;
  /** Grupo del ítem, solo en los resultados de la búsqueda. */
  hint?: string | null;
}): React.ReactElement {
  const Icon = item.icon;
  // El tooltip repite el nombre del enlace (no lo describe) y solo existe en riel.
  const tooltip = isRail ? (item.badge ? `${item.label} · ${item.badge}` : item.label) : null;
  return (
    <li>
      <LabelTooltip label={tooltip} side="right">
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
          className={cn(
            'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm pointer-coarse:min-h-10 hover:bg-sidebar-accent/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring rail:justify-center rail:px-0',
            active &&
              'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary hover:bg-sidebar-accent',
          )}
        >
          <Icon
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0',
              active ? 'text-sidebar-accent-foreground' : 'text-sidebar-muted-foreground',
            )}
          />
          <span className="min-w-0 truncate rail:sr-only">{item.label}</span>
          {hint ? (
            <span className="ml-auto shrink-0 truncate pl-2 text-xs text-sidebar-muted-foreground rail:sr-only">
              {hint}
            </span>
          ) : null}
          {item.badge ? (
            <>
              {' '}
              <span className="ml-auto shrink-0 rounded-sm border border-sidebar-border px-1.5 text-xs text-sidebar-muted-foreground rail:sr-only">
                {item.badge}
              </span>
            </>
          ) : null}
        </Link>
      </LabelTooltip>
    </li>
  );
}

/**
 * Menú lateral del portal (design §8.4): marca, navegación por grupos filtrada
 * por allowedModules (cosmético; el control efectivo es del servidor) y, al
 * pie, el botón del riel y la identidad (usuario autenticado en jwt, selector
 * de usuario en dev-header).
 *
 * Lo que cambia entre riel y expandido (ancho, textos, botones alternados, el
 * selector o su avatar y los avisos) lo resuelve CSS con `data-sidebar` y la
 * variante `rail:`; el que no se ve tiene display: none y sale del árbol de
 * accesibilidad, así que el nombre accesible sigue al modo visible sin depender
 * de la hidratación. En JS, `isRail` solo decide si los ítems llevan tooltip.
 *
 * Las dos variantes pueden estar montadas a la vez (el aside sigue en el DOM,
 * oculto, con el cajón abierto): ningún id es fijo sin el prefijo de variante.
 */
export function AppSidebar({ variant, onNavigate }: AppSidebarProps): React.ReactElement {
  const pathname = usePathname();
  const {
    authMode,
    actorId,
    setActorId,
    allowedModules,
    state: permState,
    reload,
    identityReady,
  } = useActor();
  const mode = useSidebarMode();
  const isDrawer = variant === 'drawer';
  // El cajón siempre está expandido: con la preferencia 'rail' guardada, sus
  // ítems no deben llevar un tooltip que repita la etiqueta que ya se ve.
  const isRail = isDrawer ? false : mode.isRail;
  const isJwt = authMode === 'jwt';

  const actorSelectId = isDrawer ? 'drawer-actor-select' : 'actor-select';
  const groupLabelId = (group: string): string => `${isDrawer ? 'drawer-' : ''}nav-g-${group}`;
  const searchId = isDrawer ? 'drawer-nav-search' : 'nav-search';

  const router = useRouter();
  const { collapsed, toggle, expand } = useCollapsedNavGroups();
  const [query, setQuery] = React.useState('');
  // Pestaña del grupo ya desplegado para la ruta actual (ver el efecto de abajo).
  const expandedForPathRef = React.useRef<string | null>(null);

  const collapseRef = React.useRef<HTMLButtonElement>(null);
  const expandRef = React.useRef<HTMLButtonElement>(null);
  const actorSelectRef = React.useRef<HTMLButtonElement>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);
  const focusActorSelectRef = React.useRef(false);

  const [actors, setActors] = React.useState<DevActor[]>([]);
  const [actorsState, setActorsState] = React.useState<ActorsState>('loading');

  React.useEffect(() => {
    // El selector dev solo existe en dev-header: en jwt no se consulta
    // /dev/actors (respondería 404). El cajón monta su propio sidebar, así que
    // vuelve a pedir la lista cada vez que se abre; la llamada es idempotente y
    // solo ocurre en dev-header, por eso se acepta.
    if (isJwt) return;
    let cancelled = false;
    void (async () => {
      setActorsState('loading');
      try {
        const data = await listDevActors();
        if (cancelled) return;
        setActors(data);
        setActorsState('success');
      } catch {
        if (cancelled) return;
        setActorsState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isJwt]);

  // Tras pulsar el avatar del riel, el selector recibe el foco en cuanto vuelve
  // a verse (pref ya es 'expanded' y CSS lo muestra). Si todavía no hay
  // selector (lista cargando o con error), el foco va al botón del riel.
  React.useEffect(() => {
    if (mode.pref !== 'expanded' || !focusActorSelectRef.current) return;
    focusActorSelectRef.current = false;
    firstVisible(actorSelectRef.current, collapseRef.current)?.focus();
  }, [mode.pref]);

  const visibleGroups = React.useMemo(
    () => (permState === 'success' ? getVisibleNavGroups(allowedModules) : []),
    [permState, allowedModules],
  );

  // Con texto en el buscador el menú pasa a una lista plana de coincidencias.
  // En riel no hay buscador, así que tampoco se filtra.
  const searching = !isRail && query.trim() !== '';
  const results = React.useMemo(
    () => (searching ? searchNavItems(visibleGroups, query) : []),
    [searching, visibleGroups, query],
  );

  // Al llegar a una pantalla de un grupo plegado (enlace, buscador, URL directa),
  // el grupo se despliega para que la página actual no quede oculta. Solo una
  // vez por ruta: si el usuario pliega después ese grupo, se respeta.
  React.useEffect(() => {
    if (visibleGroups.length === 0 || expandedForPathRef.current === pathname) return;
    expandedForPathRef.current = pathname;
    const active = visibleGroups.find((group) =>
      group.items.some((item) => isNavItemActive(item, pathname)),
    );
    if (active) expand(active.id);
  }, [pathname, visibleGroups, expand]);

  function handleNavigate(): void {
    setQuery('');
    onNavigate?.();
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
    } else if (event.key === 'Enter' && results.length > 0) {
      event.preventDefault();
      router.push(results[0].item.href);
      handleNavigate();
    }
  }

  // Mismas condiciones que antes del rediseño. Mientras la identidad no se ha
  // leído o los permisos aún no empezaron a cargar ('none' con actor), se
  // muestra la carga en lugar de un aviso que duraría un instante.
  const menuState: MenuState = !identityReady
    ? 'loading'
    : !actorId
      ? 'no-actor'
      : permState === 'loading' || permState === 'none'
        ? 'loading'
        : permState === 'error'
          ? 'error'
          : visibleGroups.length === 0
            ? 'empty'
            : 'ready';

  function handleToggle(): void {
    mode.toggle();
    // El botón pulsado pasa a display: none; el foco va al que quedó visible.
    window.requestAnimationFrame(() => {
      firstVisible(collapseRef.current, expandRef.current)?.focus();
    });
  }

  function expandToNotice(): void {
    mode.setPref('expanded');
    window.requestAnimationFrame(() => noticeRef.current?.focus());
  }

  function handleAvatarClick(): void {
    focusActorSelectRef.current = true;
    mode.setPref('expanded');
  }

  function renderNotice(message: string, options?: { alert?: boolean; retry?: boolean }): React.ReactElement {
    return (
      <div className="flex flex-col gap-2 rail:items-center">
        <div
          ref={noticeRef}
          tabIndex={-1}
          className="flex flex-col items-start gap-2 rounded-md px-2.5 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring rail:p-0"
        >
          {/* rail:sr-only y no rail:hidden: en riel el aviso sigue en el árbol de accesibilidad. */}
          <p
            role={options?.alert ? 'alert' : undefined}
            className="text-sm text-sidebar-muted-foreground rail:sr-only"
          >
            {message}
          </p>
          {options?.retry ? (
            <Button type="button" variant="outline" size="sm" className="rail:hidden" onClick={reload}>
              Reintentar
            </Button>
          ) : null}
        </div>
        <LabelTooltip label={message} side="right">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="hidden rail:inline-flex"
            aria-label="Expandir el menú para ver el aviso"
            onClick={expandToNotice}
          >
            <Info aria-hidden="true" />
          </Button>
        </LabelTooltip>
      </div>
    );
  }

  function renderMenu(): React.ReactNode {
    switch (menuState) {
      case 'loading':
        return (
          <div className="flex flex-col gap-1">
            <p role="status" className="sr-only">
              Cargando menú…
            </p>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        );
      case 'no-actor':
        return renderNotice(
          isJwt
            ? 'Cargando tu sesión…'
            : 'Elige un usuario en «Usuario actual (dev)», al final de este menú, para ver tus módulos.',
        );
      case 'error':
        return renderNotice('No fue posible cargar tus permisos.', { alert: true, retry: true });
      case 'empty':
        return renderNotice('No tienes módulos habilitados. Pide acceso al jefe de área.');
      default:
        return (
          <div className="flex flex-col gap-4 rail:gap-2">
            {/* Buscador de pantallas (BL-027): solo con el menú expandido. */}
            <div className="flex flex-col gap-1 px-0.5 rail:hidden">
              <Label htmlFor={searchId} className="sr-only">
                Buscar pantalla
              </Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-sidebar-muted-foreground"
                />
                <Input
                  id={searchId}
                  type="search"
                  value={query}
                  placeholder="Buscar pantalla…"
                  autoComplete="off"
                  className="h-8 bg-background pl-8 text-sm"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
              {/* Región viva: anuncia cuántas pantallas coinciden. */}
              <p role="status" className="sr-only">
                {searching
                  ? results.length === 0
                    ? 'Sin resultados'
                    : `${results.length} ${results.length === 1 ? 'pantalla' : 'pantallas'}`
                  : ''}
              </p>
            </div>

            {searching ? (
              results.length === 0 ? (
                <p className="px-2.5 text-sm text-sidebar-muted-foreground">
                  Ninguna pantalla coincide con «{query.trim()}». Prueba con otra palabra.
                </p>
              ) : (
                <ul aria-label="Resultados de la búsqueda" className="flex flex-col gap-0.5">
                  {results.map(({ item, groupLabel }) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={isNavItemActive(item, pathname)}
                      isRail={isRail}
                      hint={groupLabel}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </ul>
              )
            ) : (
              visibleGroups.map((group, index) => {
                // El grupo de entrada no tiene título y no se pliega. En riel
                // todos los grupos se ven (solo iconos): el plegado no aplica.
                const foldable = group.label !== null && !isRail;
                const isCollapsed = foldable && collapsed.has(group.id);
                const listId = `${groupLabelId(group.id)}-list`;
                return (
                  <div
                    key={group.id}
                    className={cn(index > 0 && 'rail:border-t rail:border-sidebar-border rail:pt-2')}
                  >
                    {group.label ? (
                      foldable ? (
                        <button
                          type="button"
                          id={groupLabelId(group.id)}
                          aria-expanded={!isCollapsed}
                          aria-controls={listId}
                          onClick={() => toggle(group.id)}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-0.5 text-left text-xs font-medium text-sidebar-muted-foreground hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10"
                        >
                          {group.label}
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              'size-3.5 shrink-0 transition-transform motion-reduce:transition-none',
                              isCollapsed && '-rotate-90',
                            )}
                          />
                        </button>
                      ) : (
                        <span
                          id={groupLabelId(group.id)}
                          className="block px-2.5 text-xs font-medium text-sidebar-muted-foreground rail:sr-only"
                        >
                          {group.label}
                        </span>
                      )
                    ) : null}
                    <ul
                      id={listId}
                      aria-labelledby={group.label ? groupLabelId(group.id) : undefined}
                      className={cn(
                        'flex flex-col gap-0.5',
                        group.label && 'mt-1 rail:mt-0',
                        isCollapsed && 'hidden',
                      )}
                    >
                      {group.items.map((item) => (
                        <NavLink
                          key={item.href}
                          item={item}
                          active={isNavItemActive(item, pathname)}
                          isRail={isRail}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        );
    }
  }

  const selectedActor = actors.find((actor) => actor.identifier === actorId);
  const actorDisplay = selectedActor?.name ?? actorId;

  // Controles del pie: botón de icono con nombre accesible y tooltip (el riel
  // los apila). La identidad y el cierre de sesión viven en UserMenu.
  const footerControls = (
    <div className="flex shrink-0 items-center gap-0.5 rail:flex-col">
      {!isDrawer ? (
        <>
          <LabelTooltip label="Contraer menú">
            <Button
              ref={collapseRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-sidebar-foreground rail:hidden"
              aria-label="Contraer menú"
              onClick={handleToggle}
            >
              <PanelLeftClose aria-hidden="true" />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Expandir menú" side="right">
            <Button
              ref={expandRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden rail:inline-flex"
              aria-label="Expandir menú"
              onClick={handleToggle}
            >
              <PanelLeftOpen aria-hidden="true" />
            </Button>
          </LabelTooltip>
        </>
      ) : null}
    </div>
  );

  const content = (
    <>
      <div className={cn('flex h-14 shrink-0 items-center px-3 rail:justify-center rail:px-0', isDrawer && 'pr-12')}>
        <Link
          href="/inicio"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BrandMark className="hidden rail:flex" />
          <BrandName className="rail:sr-only" />
        </Link>
        {/* En riel (solo escritorio) se oculta para no estrechar la columna; el
            control sigue disponible en la barra móvil y en el menú expandido. */}
        <ThemeToggle className="ml-auto rail:hidden" />
      </div>

      <nav
        aria-label="Navegación principal"
        className="nav-scroll-shadow no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3"
      >
        {renderMenu()}
      </nav>

      <div className={cn('flex flex-col gap-1 border-t border-sidebar-border p-2 rail:items-center', isDrawer && isJwt && 'hidden')}>
        <div className="flex w-full items-center gap-1 rail:flex-col">
          <span className="flex-1 rail:hidden" />
          {footerControls}
        </div>

        {isJwt ? null : (
          <>
            <div className="flex w-full flex-col gap-1.5 px-1 pb-1 pt-1.5 rail:hidden">
              <Label htmlFor={actorSelectId} className="text-xs">
                Usuario actual (dev)
              </Label>
              {actorsState === 'loading' ? (
                <Skeleton className="h-8 w-full" />
              ) : actorsState === 'error' ? (
                <p role="alert" className="text-xs text-sidebar-muted-foreground">
                  No fue posible cargar los usuarios.
                </p>
              ) : (
                <Select value={actorId ?? ''} onValueChange={(value) => setActorId(value)}>
                  {/* Sin aria-label: el nombre accesible es el de la etiqueta visible. */}
                  <SelectTrigger ref={actorSelectRef} id={actorSelectId} className="h-8 bg-background">
                    <SelectValue placeholder="Elige un usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {actors.map((actor) => (
                      <SelectItem key={actor.identifier} value={actor.identifier}>
                        {actor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <LabelTooltip label={actorDisplay ?? 'Ningún usuario elegido'} side="right">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="hidden rounded-full rail:inline-flex"
                aria-label={`Usuario actual (dev): ${actorDisplay ?? 'ninguno'}. Expandir el menú para cambiarlo`}
                onClick={handleAvatarClick}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-link">
                  {selectedActor ? initialsOf(selectedActor.name) : '?'}
                </span>
              </Button>
            </LabelTooltip>
          </>
        )}
      </div>
    </>
  );

  if (isDrawer) {
    // Dentro del diálogo del cajón: sin id ni landmark propio.
    return (
      <div data-sidebar="expanded" className="flex min-h-0 w-full flex-1 flex-col text-sidebar-foreground">
        {content}
      </div>
    );
  }

  // La columna exterior se estira con la fila del shell (todo el alto de la
  // página) y lleva el fondo y el borde; el aside, dentro, queda fijo al
  // viewport (sticky + h-dvh) y su menú tiene scroll propio. Sin la columna,
  // en páginas más altas que el viewport el fondo del menú terminaba en la
  // primera pantalla (visible en capturas de página completa).
  return (
    <div className="hidden shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
      <aside
        id="app-sidebar"
        aria-label="Menú lateral"
        data-sidebar={mode.pref}
        className="sticky top-0 hidden h-dvh w-60 flex-col text-sidebar-foreground transition-[width] duration-150 lg:flex rail:w-14"
      >
        {content}
      </aside>
    </div>
  );
}
