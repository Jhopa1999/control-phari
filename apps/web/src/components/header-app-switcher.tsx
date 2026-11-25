'use client';

import * as React from 'react';
import { AppSwitcher } from '@/components/app-switcher';
import { useWorkspaceApps } from '@/lib/use-workspace-apps';

/**
 * Selector de aplicaciones de la barra superior de escritorio (spec:
 * docs/design/ux-cromo-discreto.md §4.1). Mientras cargan los permisos reserva
 * el sitio; sin actor, con error o sin apps visibles no pinta nada.
 */
export function HeaderAppSwitcher(): React.ReactElement | null {
  const { permState, visibleApps, activeApp, homeHrefFor } = useWorkspaceApps();
  if (permState === 'loading') return <div aria-hidden="true" className="size-8 shrink-0" />;
  if (permState !== 'success' || !activeApp || visibleApps.length === 0) return null;
  return (
    <AppSwitcher
      apps={visibleApps}
      activeApp={activeApp}
      homeHrefFor={homeHrefFor}
      placement="header"
    />
  );
}
