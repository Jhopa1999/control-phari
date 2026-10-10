# Verificación — Pantalla de login + sesión JWT en apps/web

Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login`
Rama: `feat/web-login`. Backend NO modificado.

## Resumen de lo implementado

| Paso | Archivo | Qué |
| --- | --- | --- |
| Modo | `apps/web/src/lib/auth-mode.ts` (nuevo) | `getAuthMode()`: `'jwt'` solo si `NEXT_PUBLIC_AUTH_MODE === 'jwt'`, si no `'dev-header'`. |
| Cabeceras/token | `apps/web/src/lib/api-client.ts` | `TOKEN_STORAGE_KEY='authToken'`, tipos `LoginResponse`/`AuthUser`, `onRequest` ramifica por modo: jwt→`Authorization: Bearer`, dev-header→`X-Actor-Id` (lógica histórica intacta). Nunca ambas. Solo navegador. |
| Login tipado | `apps/web/src/lib/auth.ts` (nuevo) | `login({identifier,password})` vía `api.POST('/auth/login')` reutilizando la respuesta tipada; body con cast único comentado por la laguna del contrato (`requestBody?: never`). |
| Sesión | `apps/web/src/lib/actor-context.tsx` | Añade `authMode`, `authUser`, `isAuthenticated`, `sessionExpired`, `login(token,user)`, `logout()`. En jwt la identidad deriva del token; permisos siguen cargándose por `getMyPermissions()` (NO se duplican). 401 al cargar permisos en jwt → limpia sesión + marca expiración. dev-header: comportamiento idéntico al actual. |
| Login UI | `apps/web/src/app/login/page.tsx` + `login-form.tsx` (nuevos) | `<form>` semántico, `<label htmlFor>`, errores por campo (`role="alert"`, `aria-describedby`), estado de envío (botón deshabilitado + spinner), 401→"Usuario o contrasena incorrectos" sin filtrar existencia, éxito→`login()`+`router.replace('/inicio')`. Lee `?expired=1`. |
| Guard | `apps/web/src/components/route-guard.tsx` (nuevo) + `app/layout.tsx` | dev-header: passthrough (monta shell). jwt: `/login` sin shell; sin sesión→`replace('/login')` (o `?expired=1`); con sesión y permisos cargando→estado accesible; con sesión→shell. |
| Logout/sidebar | `apps/web/src/components/app-sidebar.tsx` | jwt: usuario autenticado + "Cerrar sesión" (oculta selector dev, no consulta `/dev/actors`). dev-header: selector exactamente como antes. |
| Config | `apps/web/.env.example` | PENDIENTE: ver "Bloqueos" (regla de permisos impide escribir `.env*`). |

### Detección de modo
`NEXT_PUBLIC_AUTH_MODE` (variable pública build-time). `getAuthMode()` devuelve `'jwt'` solo con el valor exacto `'jwt'`; cualquier otro valor o ausencia → `'dev-header'` (default seguro que preserva el flujo histórico). El frontend NO conoce el `AUTH_MODE` del backend; debe coincidir por configuración de despliegue.

### Dónde se guarda el token
`localStorage`, clave `TOKEN_STORAGE_KEY='authToken'` (coherente con `ACTOR_STORAGE_KEY='actorId'`). El usuario autenticado se guarda en `authUser` (JSON) para pintar nombre/identifier sin otra petición. Al hacer `login()` se borra `actorId` para no mezclar mecanismos. `logout()`/expiración borran `authToken` + `authUser` + estado. Sin refresh tokens.

## Comandos ejecutados y resultado real

Todos desde la raíz del worktree salvo indicación.

1. `npm install` → OK (874 paquetes). Nota: el npm del entorno usa allow-scripts; se ejecutaron manualmente los postinstall necesarios (`npm run prisma:generate`, `bcrypt` verificado abajo).
2. `npm run build:api-client` → OK (`packages/api-client/dist` generado).
3. `npm run typecheck:web` → OK (baseline antes de cambios y después de cambios, sin errores).
4. `npm run prisma:generate` (en `apps/api`) → OK (Prisma Client 7.10.0 generado; el postinstall lo había omitido allow-scripts).
5. `npm run typecheck` (api + api-client + web) → OK, sin errores. Sin `any` salvo el cast comentado del body de login.
6. `npm run test:unit` → **51 suites, 426 tests, todos verdes** (no se rompió nada del backend).
7. `npm run build:web` (con `NEXT_PUBLIC_API_BASE_URL`) → OK. La ruta `/login` aparece en el listado de rutas compiladas.
8. `npm run build:api` → OK (necesario para arrancar la API compilada en la verificación funcional).

### No se tocó el contrato
No se ejecutó `contracts:generate` (requiere el pipeline del backend; fuera de alcance). `git status` no muestra cambios en `apps/api` ni en `packages/api-client/src/generated/schema.d.ts`. El login reutiliza la respuesta tipada `LoginResponseDto` del contrato ya generado; solo el body va con cast por la laguna `requestBody?: never`.

## Verificación funcional REAL (en ejecución, no solo lectura)

### Entorno
- PostgreSQL: contenedor `plantilla-portales-postgres-1` ya levantado (puerto 5433, healthy).
- Migraciones: `prisma migrate deploy` → "No pending migrations" (ya aplicadas). Seed: `prisma:seed` → "3 roles, 4 procesos, 5 usuarios, 12 grants, 96 maestras". Confirmado `jefe@demo.local` con `passwordHash` de `dev1234`.
- `DATABASE_URL` NO existe en el `.env` del worktree (solo en el `.env` del repo principal). Se pasó como variable de entorno al proceso en cada comando que la necesita (migrate/seed/arranque API). dotenv de prisma.config muestra "injected env (0)" porque el `.env` del worktree no existe; la variable de proceso toma precedencia.
- **API jwt**: `AUTH_MODE=jwt`, `JWT_SECRET=test-secret-local-verif-0001`, `CORS_ORIGINS=http://localhost:3100`, levantada con `node dist/main.js`. Se usó **puerto 3101** (no 3001) porque el 3001 ya estaba ocupado por una API del repo PRINCIPAL en modo dev-header (PID externo), que NO detuve para no interferir con el entorno del usuario. Log: `.agents/tasks/web-login/api-jwt.log` → "Nest application successfully started", "API escuchando en http://localhost:3101".
- **Web jwt**: `next dev -p 3100` con `NEXT_PUBLIC_API_BASE_URL=http://localhost:3101` y `NEXT_PUBLIC_AUTH_MODE=jwt`. Log `.agents/tasks/web-login/web-jwt.log` → "Ready".
- **Web dev-header**: `next dev -p 3100` con `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` y `NEXT_PUBLIC_AUTH_MODE=dev-header`.

Como no hay navegador real disponible, el flujo se verificó con peticiones HTTP que replican exactamente lo que hace el cliente (login → token → `/me/permissions` con Bearer) e inspeccionando el HTML servido por Next.

### Flujo jwt — backend (API 3101)
```
POST /auth/login {identifier:"nope@x",password:"bad"}      -> 401            (credenciales inválidas)
POST /auth/login {identifier:"jefe@demo.local",pwd:dev1234} -> 200           token.len=160, expiresIn=8h, user=jefe@demo.local / Ana Jefa
GET  /me/permissions  (sin Authorization)                   -> 401           (ruta protegida sin identidad)
GET  /me/permissions  Authorization: Bearer <token>         -> 200           21 módulos (demandOverview..permissions)
GET  /dev/actors      (modo jwt)                            -> 404           (selector dev no disponible → el sidebar lo oculta)
GET  /me/permissions  Authorization: Bearer not.a.valid.token -> 401         (token inválido/expirado → ruta de "sesión expirada")
```
Esto confirma, para el modo jwt:
- Credenciales malas → 401 (la pantalla muestra mensaje genérico sin filtrar existencia).
- Login válido → token + usuario; el cliente guarda `authToken` y pinta al usuario.
- La petición autenticada aplica `Authorization: Bearer` y el backend responde los permisos (que el frontend refleja; no los duplica).
- Sin token / token inválido → 401, que el provider traduce a limpiar sesión + redirigir a `/login(?expired=1)`.

### Flujo jwt — frontend (Next 3100)
- `GET /login` → 200. El HTML servido contiene el formulario completo: título "Iniciar sesion", labels "Usuario o correo" y "Contrasena", input `id="identifier"`, input `type="password"` con `autocomplete="current-password"`, y botón "Ingresar". (Confirmado por inspección del HTML.)
- `GET /inicio` → 200 (Next sirve la página; la protección de ruta es de cliente: el `RouteGuard` monta en el navegador el estado "Redirigiendo al inicio de sesión..." y hace `router.replace('/login')` al no haber token). La redirección es un efecto de cliente, por eso el HTML inicial responde 200.
- Simulación navegador contra la API que la web tiene configurada (3101): `login` OK (user=Ana Jefa) y `/me/permissions` con Bearer OK (21 módulos). Es la misma cadena que ejecutan `login-form.tsx` + el middleware de `api-client.ts`.

### Flujo dev-header — regresión (Web dev-header 3100 → API dev-header 3001)
- `GET /inicio` → 200. El HTML contiene el shell "Portal del area" y el selector "Usuario actual (dev)", y NO contiene el título de login "Iniciar sesion". Es decir: en dev-header se mantiene el selector dev, no hay login ni redirección. Comportamiento idéntico al actual.
- La API en 3001 responde `/dev/actors` → 200 con los 5 actores del seed (modo dev-header), confirmando que el selector se puebla como antes.

### Procesos
Todos los procesos que arranqué (API jwt 3101, web jwt/dev-header 3100) fueron **detenidos** al terminar. Verificado: 3100/3101/3102 libres. Los servidores del repo PRINCIPAL en 3000/3001 (que ya estaban corriendo antes y NO son del worktree) se dejaron intactos a propósito.

## Bloqueos pendientes (requieren decisión del usuario)

1. **`apps/web/.env.example` (paso 8 del plan).** La escritura está bloqueada por una regla de permisos del entorno (`deny fs_write` sobre `.env, .env.*`). No pude añadir la documentación de `NEXT_PUBLIC_AUTH_MODE`. Contenido propuesto (sin secretos):
   ```
   # Modo de autenticacion del frontend. Debe coincidir con el AUTH_MODE de la API.
   #   dev-header -> (default) selector de usuario (dev) + X-Actor-Id. Sin login ni guard.
   #   jwt        -> login, sesion con Authorization: Bearer, guard de rutas y logout. Oculta el selector dev.
   # Cualquier valor != 'jwt' (o ausencia) se trata como 'dev-header'.
   NEXT_PUBLIC_AUTH_MODE=dev-header
   ```
   Opciones: el usuario levanta la regla para este archivo, o añade la línea manualmente.

2. **E2E (`npm run test:e2e`) contra el worktree.** La config de Playwright usa puertos fijos 3000 (web) y 3001 (API) con `reuseExistingServer`. Esos puertos están ocupados por los servidores del repo PRINCIPAL, así que la suite reusó el frontend del repo principal (no el del worktree) y falló: 3 specs por timeout esperando peticiones de ese frontend ajeno, más (inicialmente) `DATABASE_URL no definida` en las test-utils porque el `.env` no existe en el worktree. Al pasar `DATABASE_URL` por entorno, 1 spec pasó y 3 siguieron fallando — pero contra el web del repo principal, no contra mi código. Para una corrida E2E válida del worktree habría que detener los servidores del repo principal (3000/3001) y dejar que Playwright levante los del worktree. No lo hice para no interferir con lo que el usuario pueda estar usando. La regresión de dev-header del worktree SÍ quedó verificada por el método HTTP/HTML descrito arriba (mi web dev-header en 3100).
