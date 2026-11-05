'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useActor } from '@/lib/actor-context';
import {
  findAppForPath,
  getAppHomeHref,
  getVisibleNavApps,
  getVisibleNavGroups,
  getWorkspaceGroups,
  isNavItemActive,
  resolveActiveApp,
} from '@/lib/navigation';
import { useLastAppId } from '@/lib/use-active-app';

const LINK_CLASS =
  'rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Migas del workspace en la barra superior de escritorio (spec §6.1):
 * «Workspace › {App | Gobierno | Administración}». Dicen dónde está la página;
 * el selector del menú dice qué menú de app se usa. No sustituyen a las migas de
 * `PageHeader`. Mientras no hay permisos cargados no pintan nada.
 */
export function WorkspaceCrumbs(): React.ReactElement | null {
  const pathname = usePathname();
  const { state, allowedModules } = useActor();
  const [lastAppId] = useLastAppId();

  const crumbs = React.useMemo(() => {
    if (state !== 'success') return null;
    const groups = getVisibleNavGroups(allowedModules);
    const apps = getVisibleNavApps(allowedModules);
    if (pathname === '/aplicaciones' || pathname.startsWith('/aplicaciones/')) {
      return { launcher: true as const, second: null };
    }
    const owner = findAppForPath(pathname, apps, groups);
    if (owner) {
      return {
        launcher: false as const,
        second: { label: owner.name, href: getAppHomeHref(owner, allowedModules) },
      };
    }
    const transversal = getWorkspaceGroups(groups).find((group) =>
      group.items.some((item) => isNavItemActive(item, pathname)),
    );
    if (transversal?.label) {
      return { launcher: false as const, second: { label: transversal.label, href: null } };
    }
    // Pantalla fuera del menú (p. ej. el asistente): la última app usada.
    const fallback = resolveActiveApp(pathname, apps, groups, lastAppId);
    return {
      launcher: false as const,
      second: fallback
        ? { label: fallback.name, href: getAppHomeHref(fallback, allowedModules) }
        : null,
    };
  }, [state, allowedModules, pathname, lastAppId]);

  if (!crumbs) return <span aria-hidden="true" />;

  return (
    <nav aria-label="Ubicación en el workspace" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
        <li className="flex items-center">
          {crumbs.launcher ? (
            <span aria-current="page">Workspace</span>
          ) : (
            <Link href="/aplicaciones" className={LINK_CLASS}>
              Workspace
            </Link>
          )}
        </li>
        {crumbs.second ? (
          <li className="flex min-w-0 items-center gap-1.5">
            <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
            {crumbs.second.href ? (
              <Link href={crumbs.second.href} className={`${LINK_CLASS} truncate font-medium text-foreground`}>
                {crumbs.second.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-foreground">{crumbs.second.label}</span>
            )}
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
