'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Boxes, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import { listDevActors } from '@/lib/dev-actors';
import { NAV_GROUPS, type NavGroup } from '@/lib/navigation';
import type { DevActor } from '@/lib/api-client';
type ActorsState = 'loading' | 'success' | 'error';
/**
 * Sidebar del portal: navegacion agrupada filtrada por allowedModules
 * (design 5.2 / 5.3). El filtrado del menu es cosmetico; el control efectivo es
 * server-side.
 *
 * Cabecera de identidad segun el modo:
 * - 'dev-header': selector de usuario (dev), comportamiento historico intacto.
 * - 'jwt': usuario autenticado + boton "Cerrar sesion"; el selector dev se
 *   oculta.
 */
export function AppSidebar(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const {
    authMode,
    actorId,
    setActorId,
    allowedModules,
    state: permState,
    authUser,
    logout,
  } = useActor();
  const isJwt = authMode === 'jwt';
  const [actors, setActors] = React.useState<DevActor[]>([]);
  const [actorsState, setActorsState] = React.useState<ActorsState>('loading');
  React.useEffect(() => {
    // El selector dev solo existe en dev-header; en jwt no se consulta
    // /dev/actors (devolveria 404) para no romper nada.
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
  // Solo se muestran los grupos con al menos un item permitido. Mientras los
  // permisos cargan o no hay actor, el menu queda vacio (gating real).
  const visibleGroups: NavGroup[] = React.useMemo(() => {
    if (permState !== 'success') return [];
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedModules.has(item.moduleKey)),
    })).filter((group) => group.items.length > 0);
  }, [permState, allowedModules]);
  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  function handleLogout(): void {
    logout();
    router.replace('/login');
  }
  return (
    <aside className="flex shrink-0 flex-col border-b bg-card md:w-72 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-6 py-4">
        <Boxes className="size-5 text-primary" aria-hidden="true" />
        <span className="font-semibold">Portal del area</span>
      </div>
      {isJwt ? (
        <div className="grid gap-2 px-4 pb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sesion
          </p>
          <p className="text-sm font-medium" aria-label="Usuario autenticado">
            {authUser?.name ?? 'Usuario'}
          </p>
          {authUser?.identifier ? (
            <p className="text-xs text-muted-foreground">
              {authUser.identifier}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="mt-1 justify-start"
          >
            <LogOut aria-hidden="true" />
            Cerrar sesion
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 px-4 pb-4">
          <Label htmlFor="actor-select">Usuario actual (dev)</Label>
          {actorsState === 'loading' ? (
            <Skeleton className="h-9 w-full" />
          ) : actorsState === 'error' ? (
            <p className="text-sm text-muted-foreground" role="alert">
              No fue posible cargar los usuarios.
            </p>
          ) : (
            <Select
              value={actorId ?? ''}
              onValueChange={(value) => setActorId(value)}
            >
              <SelectTrigger id="actor-select" aria-label="Usuario actual">
                <SelectValue placeholder="Selecciona un usuario" />
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
      )}
      <nav
        aria-label="Navegacion principal"
        className="flex-1 overflow-y-auto px-3 pb-6"
      >
        {!actorId ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {isJwt
              ? 'Cargando tu sesion...'
              : 'Selecciona un usuario para ver tus modulos.'}
          </p>
        ) : permState === 'loading' ? (
          <div className="flex flex-col gap-2 px-1 py-2" aria-live="polite">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : permState === 'error' ? (
          <p className="px-3 py-2 text-sm text-destructive" role="alert">
            No fue posible cargar tus permisos.
          </p>
        ) : visibleGroups.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No tienes modulos habilitados.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {visibleGroups.map((group) => (
              <li key={group.label}>
                <h2 className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h2>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={
                            active
                              ? 'flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground'
                              : 'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground'
                          }
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
