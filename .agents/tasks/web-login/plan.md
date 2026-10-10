# Implementation Plan — Pantalla de login + sesión JWT en apps/web

Worktree (rutas absolutas, usar SIEMPRE): `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login`
Git: `git -C "c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login" ...`
Rama: `feat/web-login`. NO tocar el backend (`apps/api`). NO regenerar contratos. NO añadir dependencias nuevas.

## Decisiones de diseño (grounded en el código leído)

- **Detección de modo (NEXT_PUBLIC_AUTH_MODE).** Variable pública build-time, valores `jwt | dev-header`, default `dev-header`. La web NO conoce `AUTH_MODE` del backend. Un único helper puro `getAuthMode()` (nuevo `lib/auth-mode.ts`) lee `process.env.NEXT_PUBLIC_AUTH_MODE` y devuelve `'jwt'` solo si es exactamente `'jwt'`; cualquier otro valor o ausencia → `'dev-header'`. Es seguro en SSR y cliente (es una constante inlineada por Next en build). Regla de ramificación: en `dev-header` el sidebar sigue mostrando el selector dev y NO hay login ni guard (comportamiento actual intacto). En `jwt` se activa login, guard de rutas, envío de Bearer y logout; el selector dev se oculta.
- **Dónde se guarda el token.** `localStorage`, coherente con el patrón actual de `actorId`. Clave dedicada `TOKEN_STORAGE_KEY = 'authToken'`, declarada en `lib/api-client.ts` junto a `ACTOR_STORAGE_KEY`. Solo navegador (`typeof window === 'undefined'` ya se guarda). Sin refresh tokens (fuera de alcance).
- **Inyección de cabecera (una sola, nunca ambas).** En `api.use({ onRequest })` de `lib/api-client.ts`: si `getAuthMode() === 'jwt'` y hay token → `Authorization: Bearer <token>` y NO se pone `X-Actor-Id`; en `dev-header` → se mantiene exactamente la lógica actual de `X-Actor-Id`. Si en modo jwt no hay token, no se añade cabecera (la petición irá sin identidad y el backend responderá 401, que el guard de rutas gestiona).
- **Contrato de login (hallazgo importante).** El cliente tipado expone la ruta `POST /auth/login` y la **respuesta** tipada `LoginResponseDto` (`{ accessToken, expiresIn, user: { id, name, identifier } }`), PERO el schema generado declara `requestBody?: never` (el body `{ identifier, password }` NO está en el contrato OpenAPI). No se puede regenerar el contrato (requiere el pipeline del backend, fuera de alcance). Decisión: consumir vía `api.POST('/auth/login', ...)` reutilizando la **respuesta** tipada del cliente; para el body se define una interfaz local mínima `LoginCredentials { identifier: string; password: string }` (nombres tomados del DTO real del backend, no es lógica de negocio) y se pasa con un ÚNICO cast localizado y comentado en el wrapper (`body: credentials as never` o equivalente) para no violar TS estricto con `any`. Se documenta en comentario que es un workaround por la laguna del contrato generado, no un contrato duplicado a mano.
- **Evolución del contexto de sesión (sin duplicar permisos).** Se extiende `lib/actor-context.tsx` (NO se crea un segundo proveedor de permisos; la carga de `/me/permissions` sigue siendo la única fuente). El provider pasa a conocer el modo y la identidad activa:
  - En `dev-header`: comportamiento idéntico al actual (identidad = `actorId` de localStorage vía selector).
  - En `jwt`: la identidad activa deriva del token guardado; se expone `authUser` (el `user` del login), `login(token, user)` (guarda token+user, dispara carga de permisos, limpia `actorId`), `logout()` (borra token+user+estado). La carga de permisos sigue llamando `getMyPermissions()` una sola vez — se reutiliza, no se duplica.
  - El valor del contexto añade: `authMode`, `isAuthenticated` (solo relevante en jwt), `authUser`, `login`, `logout`. En dev-header `isAuthenticated` se trata como "no aplica" (el guard no actúa).
- **Protección de rutas (App Router, cliente).** Nuevo componente cliente `components/route-guard.tsx` montado dentro de `ActorProvider` en `layout.tsx`, envolviendo el shell. Lógica:
  - Si `authMode === 'dev-header'` → render directo, sin guard (actual).
  - Si `authMode === 'jwt'`:
    - Ruta `/login` siempre accesible sin sesión.
    - Sin token → `router.replace('/login')` para cualquier ruta protegida; no renderiza contenido protegido.
    - Con token pero permisos aún cargando → estado loading accesible (evita parpadeo del shell).
    - Si la carga de permisos devuelve 401 (token expirado/ inválido) → el provider limpia sesión y el guard redirige a `/login` con mensaje "La sesión expiró, vuelve a iniciar sesión" (vía query param `?expired=1` o toast `sonner`, ver paso 6).
- **Manejo de 401 de sesión expirada (peticiones autenticadas).** Dos capas, sin romper dev-header:
  1. `actor-context` ya captura el fallo de `getMyPermissions()`; en modo jwt, si el error es 401 (`ApiError.status === 401`) ⇒ `logout()` + señal de expiración.
  2. Las pantallas que ya consumen datos propagan `ApiError`; para no refactorizar todas, el disparador central de expiración es el guard + la recarga de permisos. (Un interceptor global de respuesta en `onResponse` del api-client queda documentado como alternativa descartada por no requerir refactor amplio ni acoplar navegación al cliente; si el implementador ve que es más limpio y no rompe dev-header, puede optar por `onResponse` que, SOLO en modo jwt y SOLO ante 401 en petición con Bearer, limpie token y redirija — decisión del implementador, documentar la elegida).
- **Login consume el cliente tipado**, estados `loading/envío · error · éxito`, 401 → mensaje genérico "Usuario o contraseña incorrectos" sin filtrar existencia del usuario. UI con `components/ui/` existentes (`card`, `input`, `label`, `button`) + Tailwind. HTML semántico (`<form>`, `<label htmlFor>`), navegable por teclado, error por campo con `aria-describedby`/`role="alert"`.

## Items

- [ ] 1. Instalar dependencias del monorepo y construir el api-client (prerequisito; `node_modules` no existe en el worktree y `apps/web` depende del `dist/` de `@plantilla-portales/api-client`).
      Files: ninguno (solo instalación/build).
      Verify: desde la raíz del worktree, `npm install` termina sin error y `npm run build:api-client` genera `packages/api-client/dist/index.d.ts`. Confirmar que `npm run typecheck:web` corre (puede pasar en verde con el código actual).

- [ ] 2. Añadir `TOKEN_STORAGE_KEY = 'authToken'` y el helper de modo, y actualizar la inyección de cabeceras en `lib/api-client.ts`. Exportar también el tipo de respuesta de login reutilizando el contrato (`type LoginResponse = components['schemas']['LoginResponseDto']`). Crear `lib/auth-mode.ts` con `getAuthMode(): 'jwt' | 'dev-header'`. En `onRequest`: rama por `getAuthMode()`; en jwt con token → `Authorization: Bearer`; en dev-header → `X-Actor-Id` (lógica actual intacta); nunca ambas.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\lib\api-client.ts`, `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\lib\auth-mode.ts` (nuevo).
      Verify: `npm run typecheck:web` pasa. Revisión manual: en `dev-header` (default) el `onRequest` sigue poniendo solo `X-Actor-Id`.

- [ ] 3. Crear el wrapper de login tipado `lib/auth.ts` siguiendo el patrón de `lib/me.ts`/`lib/catalog.ts` (uso de `api`, `ApiError`, `toApiError`). Exponer `login(credentials: { identifier: string; password: string }): Promise<LoginResponse>` que llame `api.POST('/auth/login', { body })` reutilizando la respuesta tipada del cliente; manejar el body con el cast localizado y comentado (laguna del contrato). Mapear 401 a un `ApiError` con `status 401` para que la pantalla muestre el mensaje genérico sin filtrar existencia del usuario.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\lib\auth.ts` (nuevo).
      Verify: `npm run typecheck:web` pasa (sin `any` salvo el cast justificado del body).

- [ ] 4. Evolucionar `lib/actor-context.tsx` para soportar sesión JWT sin duplicar permisos: añadir al contexto `authMode`, `authUser`, `isAuthenticated`, `login(token, user)`, `logout()`; en modo jwt la identidad activa deriva del token y la carga de permisos reutiliza `getMyPermissions()`; si esa carga falla con 401 en jwt, limpiar sesión y marcar expiración. Mantener 100% el camino dev-header actual (selector + `actorId`).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\lib\actor-context.tsx`.
      Verify: `npm run typecheck:web` pasa. Revisión manual del diff: en dev-header el estado/flujo de `actorId` y permisos no cambia de comportamiento.

- [ ] 5. Crear la pantalla de login en App Router: `app/login/page.tsx` (server component mínimo que renderiza el formulario cliente) + `app/login/login-form.tsx` (`'use client'`). Formulario con `<label>` para identifier/correo y contraseña, validación entendible (campos requeridos, email/identifier no vacío), errores junto al campo (`role="alert"`, `aria-describedby`), estado de envío (botón deshabilitado + spinner), manejo de 401 → "Usuario o contraseña incorrectos". Al autenticar: `login(accessToken, user)` del contexto y `router.replace('/inicio')`. Usar `card/input/label/button` de `components/ui/`. Leer `?expired=1` para mostrar aviso de sesión expirada. Estados: envío, error, éxito.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\app\login\page.tsx` (nuevo), `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\app\login\login-form.tsx` (nuevo).
      Verify: `npm run typecheck:web` pasa; `npm run build:web` compila la nueva ruta `/login`.

- [ ] 6. Crear el guard de rutas de cliente `components/route-guard.tsx` y montarlo en `app/layout.tsx` dentro de `<ActorProvider>` envolviendo el shell. En dev-header: passthrough. En jwt: `/login` libre; sin token → `router.replace('/login')`; con token y 401 de permisos → `logout()` + `router.replace('/login?expired=1')`; estado loading accesible mientras resuelve. No romper el render actual del shell.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\components\route-guard.tsx` (nuevo), `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\app\layout.tsx`.
      Verify: `npm run typecheck:web` pasa; `npm run build:web` compila. Revisión manual: con `NEXT_PUBLIC_AUTH_MODE` ausente (dev-header) el layout no redirige.

- [ ] 7. Añadir logout al shell en `components/app-sidebar.tsx`: en modo jwt mostrar usuario autenticado + botón "Cerrar sesión" (visible, accesible) que llama `logout()` y `router.replace('/login')`, y OCULTAR el selector dev. En dev-header: mantener el selector exactamente como hoy, sin logout. Derivar el modo del contexto (`authMode`).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\src\components\app-sidebar.tsx`.
      Verify: `npm run typecheck:web` pasa; `npm run build:web` compila. Revisión manual del diff: la rama dev-header del sidebar es idéntica en comportamiento.

- [ ] 8. Documentar `NEXT_PUBLIC_AUTH_MODE` en `apps/web/.env.example` (valores `jwt | dev-header`, default `dev-header`, con comentario de qué activa cada modo). NO crear ni modificar `apps/web/.env.local` salvo lo imprescindible para la verificación funcional (y dejarlo en el modo en que estaba al terminar). Sin secretos.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login\apps\web\.env.example`.
      Verify: lectura del archivo confirma la variable documentada; `npm run build:web` sigue compilando.

## Plan de verificación

Ejecutar desde la raíz del worktree. Usar solo scripts reales de `package.json` (regla 30-pruebas: no inventar comandos).

1. **Contratos (sanidad, sin regenerar):** confirmar que NO se tocó `apps/api` ni `packages/api-client/src/generated/schema.d.ts` (`git -C <worktree> status`). No ejecutar `contracts:generate` (requiere backend) salvo que el implementador lo justifique.
2. **Typecheck:** `npm run typecheck` (api + api-client + web) o como mínimo `npm run typecheck:web`. Esperado: sin errores; sin `any` salvo el cast comentado del body de login.
3. **Test unit (backend, no debe romperse):** `npm run test:unit`. Esperado: verde (no se modificó el backend; sirve de regresión de que nada se rompió transversalmente).
4. **Build:** `npm run build:web` (y opcional `npm run build` completo). Esperado: compila incluyendo la ruta `/login`.
5. **E2E (dev-header NO se rompe):** requiere `npm run db:up` y backend/web levantados por Playwright. Con `NEXT_PUBLIC_AUTH_MODE` ausente o `dev-header`, `npm run test:e2e` debe pasar las specs existentes (`catalogs.spec.ts`, `responsible-selector.spec.ts`) que dependen del selector dev y del `storageState` con `actorId`. Si el guard rompiera el camino dev-header, estas specs fallarían (es la red de seguridad).
6. **Verificación funcional real — modo jwt (MARCAR: el usuario pidió explícitamente correr la app y credenciales de prueba; verificar en ejecución, no solo leyendo código):**
   - Levantar PostgreSQL (`npm run db:up`), backend en modo jwt (`AUTH_MODE=jwt` en `apps/api/.env`) y web con `NEXT_PUBLIC_AUTH_MODE=jwt` (en `apps/web/.env.local`, revertir al terminar).
   - Abrir `http://localhost:3000` → debe redirigir a `/login`.
   - Login inválido → mensaje "Usuario o contraseña incorrectos", sin filtrar existencia, botón re-habilitado.
   - Login válido con credenciales del seed: `identifier = jefe@demo.local`, `password = dev1234` → guarda `authToken`, redirige a `/inicio`, el sidebar muestra el usuario + "Cerrar sesión" y los módulos según permisos (header `Authorization: Bearer` en las peticiones).
   - Logout → borra token, vuelve a `/login`.
   - Sesión expirada: con token inválido/borrado manualmente, una petición autenticada que devuelva 401 → limpia sesión y redirige a `/login` con aviso de expiración.
7. **Verificación funcional real — modo dev-header (regresión manual):** con `NEXT_PUBLIC_AUTH_MODE=dev-header` (o ausente) y backend en `AUTH_MODE=dev-header`, el sidebar muestra el selector dev, NO hay login ni redirección, y la navegación por permisos funciona como hoy.

Al terminar, dejar `apps/web/.env.local` en el modo en que estaba antes de la verificación y limpiar artefactos temporales.

## Notas / supuestos

- No hay runner de pruebas unitarias en `apps/web` (`test:unit` = Jest de `apps/api`); por regla de "no añadir dependencias" la verificación de la capa web se cubre con typecheck + build + E2E + funcional, no con nuevas unitarias web. Si el implementador considera imprescindible una unitaria del helper `getAuthMode`, documentar antes de añadir cualquier dependencia.
- Marcado para verificar en ejecución (reporte del usuario): "correr la app y dar credenciales de prueba" — el flujo jwt se valida levantando la app, no solo leyendo el código (item 6).
- El cast del body de login es el único punto con tipo forzado; va comentado y justificado por la laguna del contrato generado (`requestBody?: never`). No regenerar contratos en esta tarea.
