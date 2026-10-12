'use client';
import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { BrandMark } from '@/components/brand';
import { useActor } from '@/lib/actor-context';
import { postLoginPath } from '@/lib/safe-redirect';
/** Ruta publica de login. */
const LOGIN_ROUTE = '/login';
/** Destino por defecto tras iniciar sesion: no hace falta enviarlo en `next`. */
const HOME_ROUTE = '/inicio';
/**
 * Estado de pantalla completa del guard (design §8.1): marca, spinner y el
 * texto en role="status". Ningun texto puede contener «expir»: el aviso de
 * sesion expirada del login se reconoce por esa raiz.
 */
function CenteredMessage({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <BrandMark />
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {text}
      </p>
    </div>
  );
}
/**
 * Guard de rutas del lado cliente (App Router).
 *
 * - En 'dev-header': passthrough total. Siempre se monta el shell y la identidad
 *   la da el selector dev (comportamiento historico intacto).
 * - En 'jwt' (design 8.7):
 *   - Mientras la identidad persistida no se ha leido (`identityReady`), en
 *     cualquier ruta: estado de carga y ninguna redireccion. Asi una recarga
 *     con sesion valida no termina en `/login`.
 *   - `/login` se renderiza SIN shell. Con sesion guardada se comprueba con el
 *     backend antes de mostrar nada: si es valida, se redirige a `next` (si es
 *     una ruta interna segura) o a `/inicio`; con 401 o error de carga se deja
 *     ver el formulario.
 *   - Sin sesion en una ruta protegida -> `/login?next=<ruta>` (sin `next` para
 *     `/inicio` o tras un cierre de sesion explicito) y `expired=1` si la
 *     sesion expiro (401 al cargar permisos). No monta el shell ni el
 *     contenido protegido.
 *   - Con sesion y permisos aun cargando -> estado de carga accesible.
 */
export function RouteGuard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const {
    authMode,
    identityReady,
    isAuthenticated,
    sessionExpired,
    signedOut,
    state,
  } = useActor();
  const isLoginRoute = pathname === LOGIN_ROUTE;
  React.useEffect(() => {
    if (authMode !== 'jwt') return;
    if (!identityReady) return;
    if (isLoginRoute) {
      // Sesion guardada y aceptada por el backend: fuera de /login.
      if (isAuthenticated && state === 'success') {
        router.replace(
          postLoginPath(new URLSearchParams(window.location.search)),
        );
      }
      return;
    }
    if (isAuthenticated) return;
    // La busqueda se lee aqui (no con useSearchParams) para no obligar a
    // envolver toda la app en un Suspense desde el layout.
    const params = new URLSearchParams();
    const current = `${pathname}${window.location.search}`;
    if (!signedOut && current !== HOME_ROUTE) {
      params.set('next', current);
    }
    if (sessionExpired) {
      params.set('expired', '1');
    }
    const query = params.toString();
    router.replace(query ? `${LOGIN_ROUTE}?${query}` : LOGIN_ROUTE);
  }, [
    authMode,
    identityReady,
    isLoginRoute,
    isAuthenticated,
    state,
    pathname,
    signedOut,
    sessionExpired,
    router,
  ]);
  // dev-header: sin guard, shell historico.
  if (authMode !== 'jwt') {
    return <AppShell>{children}</AppShell>;
  }
  // Identidad persistida aun sin leer (SSR y primer render): no se decide nada.
  if (!identityReady) {
    return <CenteredMessage text="Cargando tu sesión…" />;
  }
  if (isLoginRoute) {
    if (isAuthenticated) {
      // 'none' cubre el render entre la lectura de la identidad y el inicio de
      // la carga: sin el, el formulario parpadearia.
      if (state === 'none' || state === 'loading') {
        return <CenteredMessage text="Comprobando tu sesión…" />;
      }
      if (state === 'success') {
        return <CenteredMessage text="Redirigiendo…" />;
      }
      // state === 'error': se deja ver el formulario, sin redirigir.
    }
    // /login sin sesion (o tras 401, que ya limpio la sesion): sin shell, pero
    // con el landmark principal que en las demas rutas aporta el shell (§11.2).
    return (
      <main id="contenido" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
    );
  }
  // Ruta protegida sin sesion: no se monta el shell (el efecto redirige).
  if (!isAuthenticated) {
    return <CenteredMessage text="Redirigiendo al inicio de sesión…" />;
  }
  // Con sesion pero permisos aun cargando: estado accesible, evita parpadeo.
  if (state === 'loading' || state === 'none') {
    return <CenteredMessage text="Cargando tu sesión…" />;
  }
  return <AppShell>{children}</AppShell>;
}
