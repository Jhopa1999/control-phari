'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LabelTooltip } from '@/components/ui/tooltip';
import { NAV_UPCOMING_APPS, type NavApp } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export interface AppSwitcherProps {
  /** Aplicaciones visibles para la persona (al menos una). */
  apps: readonly NavApp[];
  activeApp: NavApp;
  /** Pantalla de inicio efectiva de cada app (según sus permisos). */
  homeHrefFor: (app: NavApp) => string;
  /** Menú en riel: el panel se abre a la derecha y el botón solo muestra la baldosa. */
  isRail: boolean;
  variant: 'desktop' | 'drawer';
  /** Se llama al elegir un destino (el cajón móvil se cierra). */
  onNavigate?: () => void;
}

/**
 * Selector de aplicaciones del workspace (spec: docs/design/workspace-apps-gibo.md §3).
 * Vive bajo la marca del menú lateral y fuera de su zona con scroll. Es un
 * DropdownMenu de Radix cuyos ítems son enlaces reales; con una sola app sigue
 * activo porque el panel también lleva al inicio del workspace.
 *
 * El aspecto en riel lo resuelve CSS (`rail:` con `data-sidebar`); `isRail`
 * solo decide el tooltip, el nombre accesible y el lado del panel, que va en
 * un portal fuera de `[data-sidebar]`.
 */
export function AppSwitcher({
  apps,
  activeApp,
  homeHrefFor,
  isRail,
  variant,
  onNavigate,
}: AppSwitcherProps): React.ReactElement {
  const ActiveIcon = activeApp.icon;
  const idPrefix = React.useId();

  return (
    <div className="shrink-0 px-2 pb-2 rail:flex rail:justify-center rail:px-0">
      <DropdownMenu>
        <LabelTooltip label={isRail ? `Aplicación: ${activeApp.name}` : null} side="right">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={isRail ? `Aplicación: ${activeApp.name}. Cambiar de aplicación` : undefined}
              className="group flex h-12 w-full items-center gap-2.5 rounded-lg border border-sidebar-field-border px-2 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring data-[state=open]:bg-sidebar-accent pointer-coarse:min-h-12 forced-colors:border-[ButtonText] rail:size-10 rail:justify-center rail:border-0 rail:px-0"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-active text-sidebar-accent-foreground"
              >
                <ActiveIcon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1 rail:sr-only">
                <span className="block text-xs leading-4 text-sidebar-muted-foreground">Aplicación</span>
                <span className="block truncate text-sm leading-5 font-semibold">{activeApp.name}</span>
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="size-4 shrink-0 text-sidebar-muted-foreground rail:hidden"
              />
            </button>
          </DropdownMenuTrigger>
        </LabelTooltip>
        <DropdownMenuContent
          loop
          side={isRail ? 'right' : 'bottom'}
          align="start"
          sideOffset={isRail ? 8 : 6}
          collisionPadding={8}
          className={cn(
            'max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] max-w-80 overflow-y-auto p-1.5',
            isRail ? 'w-72' : 'w-(--radix-dropdown-menu-trigger-width) min-w-64',
            variant === 'drawer' && 'min-w-0',
          )}
        >
          <DropdownMenuLabel>Aplicaciones</DropdownMenuLabel>
          {apps.map((app) => {
            const Icon = app.icon;
            const active = app.id === activeApp.id;
            const descId = `${idPrefix}-${app.id}`;
            return (
              <DropdownMenuItem
                key={app.id}
                asChild
                className="items-start gap-3 py-2 pointer-coarse:min-h-11"
              >
                <Link
                  href={homeHrefFor(app)}
                  aria-current={active ? 'true' : undefined}
                  aria-labelledby={`${descId}-name`}
                  aria-describedby={descId}
                  onClick={onNavigate}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-link"
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      id={`${descId}-name`}
                      className={cn('text-sm', active ? 'font-semibold' : 'font-medium')}
                    >
                      {app.name}
                      {active ? <span className="sr-only">, aplicación actual</span> : null}
                    </span>
                    <span id={descId} className="line-clamp-2 text-meta text-muted-foreground">
                      {app.shortDescription}
                    </span>
                  </span>
                  {active ? <Check aria-hidden="true" className="mt-1 text-link" /> : null}
                </Link>
              </DropdownMenuItem>
            );
          })}
          {NAV_UPCOMING_APPS.map((app) => {
            const Icon = app.icon;
            const descId = `${idPrefix}-upcoming-${app.id}`;
            return (
              <DropdownMenuItem
                key={app.id}
                disabled
                aria-describedby={descId}
                className="items-start gap-3 py-2 text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {app.name}
                    <span className="sr-only">(próximamente, no disponible)</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Próximamente
                    </span>
                  </span>
                  <span id={descId} className="line-clamp-2 text-meta text-muted-foreground">
                    {app.shortDescription}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="gap-3 pointer-coarse:min-h-11">
            <Link href="/aplicaciones" onClick={onNavigate}>
              <LayoutGrid aria-hidden="true" />
              Inicio del workspace
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
