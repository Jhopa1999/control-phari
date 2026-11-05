'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, LayoutGrid, UserRound } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import {
  getAppHomeHref,
  getVisibleNavApps,
  getVisibleNavGroups,
  getWorkspaceGroups,
  isNavItemActive,
  NAV_UPCOMING_APPS,
  type NavApp,
  type NavGroup,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';

const DESCRIPTION = 'Elige la aplicación con la que quieres trabajar.';

/**
 * Tarjeta de una aplicación. Todo el bloque es clicable con UN solo enlace (el
 * del título, extendido con `after:absolute after:inset-0`): no hay enlaces
 * anidados y el foco se dibuja en la tarjeta.
 */
function AppCard({
  app,
  href,
  featured = false,
}: {
  app: NavApp;
  href: string;
  featured?: boolean;
}): React.ReactElement {
  const Icon = app.icon;
  const descId = `app-card-${app.id}`;
  return (
    <li
      className={cn(
        'group relative flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-card transition-colors hover:border-border-strong has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring forced-colors:border-[ButtonText]',
        featured && 'sm:col-span-full lg:flex-row lg:items-center lg:gap-5 lg:p-6',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-link',
          featured ? 'size-14' : 'size-12',
        )}
      >
        <Icon className={featured ? 'size-7' : 'size-6'} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className={cn(featured ? 'font-heading text-xl font-bold' : 'text-base font-semibold')}>
          <Link
            href={href}
            aria-describedby={descId}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {app.name}
          </Link>
        </h3>
        <p id={descId} className="text-sm text-muted-foreground">
          {app.description}
        </p>
      </div>
      {featured ? (
        <span
          aria-hidden="true"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Abrir {app.name}
          <ArrowRight className="size-4" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-link group-hover:underline"
        >
          Abrir
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
        </span>
      )}
    </li>
  );
}

/**
 * Tarjeta de una aplicación anunciada pero aún no disponible («Próximamente»).
 * No es interactiva: sin enlace, sin foco y atenuada por tokens (spec anexo A3).
 * Reserva el apartado sin alterar el estado featured de las apps reales.
 */
function UpcomingAppCard({
  app,
}: {
  app: (typeof NAV_UPCOMING_APPS)[number];
}): React.ReactElement {
  const Icon = app.icon;
  const descId = `upcoming-card-${app.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-dashed bg-card p-5 text-muted-foreground forced-colors:border-[GrayText]">
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
      >
        <Icon className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {app.name}
          <span className="sr-only">(próximamente, no disponible)</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Próximamente
          </span>
        </h3>
        <p id={descId} className="text-sm text-muted-foreground">
          {app.description}
        </p>
      </div>
    </li>
  );
}

/** Accesos transversales (Gobierno y Administración) que el usuario tiene permitidos. */
function WorkspaceLinks({ groups }: { groups: NavGroup[] }): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Accesos del workspace</CardTitle>
        <CardDescription>Disponibles desde cualquier aplicación.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            <h3 id={`ws-${group.id}`} className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {group.label}
            </h3>
            <ul
              aria-labelledby={`ws-${group.id}`}
              className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isNavItemActive(item, '/aplicaciones') ? 'page' : undefined}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0 text-link" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Inicio del workspace GIBO (/aplicaciones): las aplicaciones a las que la
 * persona tiene acceso y los accesos transversales. Spec:
 * docs/design/workspace-apps-gibo.md §4. El filtrado por permisos es cosmético;
 * el control efectivo es del servidor.
 */
export function AppLauncherView(): React.ReactElement {
  const { authMode, authUser, allowedModules, state, reload, actorId, identityReady } = useActor();

  const visibleGroups = React.useMemo(
    () => (state === 'success' ? getVisibleNavGroups(allowedModules) : []),
    [state, allowedModules],
  );
  const apps = React.useMemo(
    () => (state === 'success' ? getVisibleNavApps(allowedModules) : []),
    [state, allowedModules],
  );
  const workspaceGroups = React.useMemo(() => getWorkspaceGroups(visibleGroups), [visibleGroups]);

  const firstName = authUser?.name?.trim().split(/\s+/)[0] ?? '';
  const loading = !identityReady || (actorId !== null && (state === 'loading' || state === 'none'));

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title="Aplicaciones" description={DESCRIPTION} />
        <p role="status" className="sr-only">
          Cargando aplicaciones…
        </p>
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </PageLayout>
    );
  }

  if (!actorId) {
    return (
      <PageLayout>
        <PageHeader title="Aplicaciones" description={DESCRIPTION} />
        <Card>
          <EmptyState
            icon={UserRound}
            title="Elige un usuario para ver tus aplicaciones"
            description="Usa «Usuario actual (dev)», al final del menú lateral."
          />
        </Card>
      </PageLayout>
    );
  }

  if (state === 'error') {
    return (
      <PageLayout>
        <PageHeader title="Aplicaciones" description={DESCRIPTION} />
        <Card>
          <ErrorState
            title="No fue posible cargar tus aplicaciones"
            message="Revisa tu conexión e inténtalo de nuevo."
            onRetry={reload}
          />
        </Card>
      </PageLayout>
    );
  }

  const greeting = authMode === 'jwt' && firstName ? `Hola, ${firstName}` : 'Bienvenido a GIBO';

  return (
    <PageLayout>
      <PageHeader title={greeting} description={DESCRIPTION} />

      <section aria-labelledby="launcher-apps" className="flex flex-col gap-3">
        <h2 id="launcher-apps" className="text-base font-semibold">
          Tus aplicaciones
        </h2>
        {apps.length === 0 ? (
          <Card>
            <EmptyState
              icon={LayoutGrid}
              title="No tienes aplicaciones habilitadas"
              description="Pide acceso al jefe de área para empezar a trabajar en GIBO."
            />
          </Card>
        ) : (
          <ul
            aria-label="Aplicaciones disponibles"
            className={cn(
              'grid gap-4',
              apps.length + NAV_UPCOMING_APPS.length > 1 && 'sm:grid-cols-2 xl:grid-cols-3',
            )}
          >
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                href={getAppHomeHref(app, allowedModules)}
                featured={apps.length === 1}
              />
            ))}
            {NAV_UPCOMING_APPS.map((app) => (
              <UpcomingAppCard key={app.id} app={app} />
            ))}
          </ul>
        )}
      </section>

      {workspaceGroups.length > 0 ? <WorkspaceLinks groups={workspaceGroups} /> : null}
    </PageLayout>
  );
}
