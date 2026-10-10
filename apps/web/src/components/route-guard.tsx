'use client';
import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { useActor } from '@/lib/actor-context';
/** Ruta publica de login. */
const LOGIN_ROUTE = '/login';
/**
 * Shell del portal: sidebar + area principal. Es el layout historico; se extrae
 * aqui para que el guard decida cuando montarlo (p.ej. no en `/login`).
 */
function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar />
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
function CenteredMessage({ text }: { text: string }): React.ReactElement {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      aria-live="polite"
    >
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
/**
 * Guard de rutas del lado cliente (App Router).
 *
 * - En 'dev-header': passthrough total. Siempre se monta el shell y la identidad
 *   la da el selector dev (comportamiento historico intacto).
 * - En 'jwt':
 *   - `/login` se renderiza SIN shell, con o sin sesion.
 *   - Sin sesion en una ruta protegida -> redirige a `/login` y no monta el
 *     shell ni el contenido protegido.
 *   - Si la sesion expiro (401 al cargar permisos) -> redirige a
 *     `/login?expired=1`.
 *   - Con sesion y permisos aun cargando -> estado de carga accesible.
 */
export function RouteGuard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const { authMode, isAuthenticated, sessionExpired, state } = useActor();
  const isLoginRoute = pathname === LOGIN_ROUTE;
  React.useEffect(() => {
    if (authMode !== 'jwt') return;
    if (isLoginRoute) return;
    if (!isAuthenticated) {
      router.replace(sessionExpired ? `${LOGIN_ROUTE}?expired=1` : LOGIN_ROUTE);
    }
  }, [authMode, isLoginRoute, isAuthenticated, sessionExpired, router]);
  // dev-header: sin guard, shell historico.
  if (authMode !== 'jwt') {
    return <AppShell>{children}</AppShell>;
  }
  // /login siempre accesible y sin shell.
  if (isLoginRoute) {
    return <>{children}</>;
  }
  // Ruta protegida sin sesion: no se monta el shell (el efecto redirige).
  if (!isAuthenticated) {
    return <CenteredMessage text="Redirigiendo al inicio de sesion..." />;
  }
  // Con sesion pero permisos aun cargando: estado accesible, evita parpadeo.
  if (state === 'loading' || state === 'none') {
    return <CenteredMessage text="Cargando tu sesion..." />;
  }
  return <AppShell>{children}</AppShell>;
}
