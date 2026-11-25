'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  /** `header`: barra superior de escritorio; `drawer`: cabecera del cajón móvil (sobre fondo marino). */
  placement: 'header' | 'drawer';
  /** Se llama al elegir un destino (el cajón móvil se cierra). */
  onNavigate?: () => void;
}

/**
 * Selector de aplicaciones del workspace (spec: docs/design/ux-cromo-discreto.md §4).
 * Botón-icono con nombre accesible «Aplicaciones» que abre un DropdownMenu de
 * Radix cuyos ítems son enlaces reales; con una sola app sigue activo porque el
 * panel también lleva al inicio del workspace. La app actual la nombra la miga
 * «Workspace › App» de la barra superior.
 */
export function AppSwitcher({
  apps,
  activeApp,
  homeHrefFor,
  placement,
  onNavigate,
}: AppSwitcherProps): React.ReactElement {
  const idPrefix = React.useId();
  const isDrawer = placement === 'drawer';
  return (
    <DropdownMenu>
      <LabelTooltip label={isDrawer ? null : 'Aplicaciones'} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={isDrawer ? 'sidebar' : 'ghost'}
            size="icon-sm"
            aria-label="Aplicaciones"
            className={cn(
              'shrink-0',
              isDrawer
                ? 'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
            )}
          >
            <LayoutGrid aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </LabelTooltip>
      <DropdownMenuContent
        loop
        side="bottom"
        align={isDrawer ? 'end' : 'start'}
        sideOffset={6}
        collisionPadding={8}
        className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto p-1.5"
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
                  <span className="sr-only">(no disponible)</span>
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
  );
}
