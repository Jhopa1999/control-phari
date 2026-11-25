'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useActor } from '@/lib/actor-context';
import {
  getAppHomeHref,
  getVisibleNavApps,
  getVisibleNavGroups,
  resolveActiveApp,
  type NavApp,
} from '@/lib/navigation';
import { useLastAppId } from '@/lib/use-active-app';

/**
 * Apps del workspace visibles para la persona, app activa (la dueña de la ruta o
 * la última usada) y la pantalla de inicio de cada app según sus permisos.
 * Lo comparten el menú lateral, el cajón móvil y el selector de la barra superior.
 */
export function useWorkspaceApps(): {
  permState: ReturnType<typeof useActor>['state'];
  visibleGroups: ReturnType<typeof getVisibleNavGroups>;
  visibleApps: NavApp[];
  activeApp: NavApp | null;
  lastAppId: string | null;
  setLastAppId: (id: string) => void;
  homeHrefFor: (app: NavApp) => string;
} {
  const pathname = usePathname();
  const { allowedModules, state: permState } = useActor();
  const [lastAppId, setLastAppId] = useLastAppId();

  const visibleGroups = React.useMemo(
    () => (permState === 'success' ? getVisibleNavGroups(allowedModules) : []),
    [permState, allowedModules],
  );
  const visibleApps = React.useMemo(
    () => (permState === 'success' ? getVisibleNavApps(allowedModules) : []),
    [permState, allowedModules],
  );
  const activeApp = React.useMemo(
    () => resolveActiveApp(pathname, visibleApps, visibleGroups, lastAppId),
    [pathname, visibleApps, visibleGroups, lastAppId],
  );
  const homeHrefFor = React.useCallback(
    (app: NavApp) => getAppHomeHref(app, allowedModules),
    [allowedModules],
  );

  return { permState, visibleGroups, visibleApps, activeApp, lastAppId, setLastAppId, homeHrefFor };
}
