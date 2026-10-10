# Verificacion - iteracion 3 (resolucion de review APPROVED)

Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\web-login`
Rama: `feat/web-login`. Backend NO modificado.

El `review.json` de esta ronda tiene veredicto **APPROVED** con 3 findings de
severidad **Baja** (no bloqueantes). Esta iteracion los resuelve todos y cierra
la verificacion funcional con un **navegador real** (Playwright), que en rondas
previas no estuvo disponible.

## Findings resueltos

### Finding 3 (Baja) - centinela `__jwt__` en `actor-context.tsx`
`apps/web/src/lib/actor-context.tsx`: se extrajo el valor magico a la constante
documentada `JWT_IDENTITY_SENTINEL = '__jwt__'` con comentario que explica que
es un centinela interno (token presente pero `authUser` ausente/corrupto en
storage) usado solo para disparar la carga de `/me/permissions`, y que NUNCA se
envia como cabecera (en jwt onRequest solo manda `Authorization: Bearer`). Cambio
puramente documental: no altera comportamiento. `npm run typecheck` en verde.

### Finding 1 (Baja) - guard de cliente y logout observados en navegador real
### Finding 2 (Baja) - regresion dev-header en navegador real
Ambos findings eran limitaciones de entorno (en rondas previas no habia navegador
y los puertos 3000/3001 estaban ocupados por el repo principal). Se resolvieron
levantando los servidores del **worktree en puertos alternativos** (API 3100,
web 3200), **sin tocar** los servidores del repo principal en 3000/3001, y
condujendo un **Chromium real** con Playwright (ya instalado: chromium-1243).

## Comandos ejecutados y resultado real (todos desde la raiz del worktree)

1. `npm run typecheck` (api + api-client + web) -> OK, sin errores.
2. `npm run test:unit` -> **51 suites / 426 tests, todos verdes** (ejecutado 2 veces).
3. `npm run contracts:generate` (con `DATABASE_URL` por entorno) -> OK. Regenero
   `openapi.json` y `schema.d.ts`; `git diff --ignore-all-space` = **sin diff de
   contenido** (solo normalizacion LF->CRLF en Windows). Se restauraron ambos
   archivos con `git checkout` para no introducir churn de saltos de linea. El
   contrato y el api-client quedan **intactos**, confirmado.
4. `npm run build:api-client` -> OK (dist + schema copiado).
5. `npm run build` del frontend (produccion Next), con `NEXT_PUBLIC_API_BASE_URL`
   y `NEXT_PUBLIC_AUTH_MODE` por entorno -> OK. La ruta `/login` aparece listada.
   (Sin la variable el build falla en prerender por el guard de config de
   `api-client.ts`; es requisito de build-time, no defecto. El worktree no tiene
   `apps/web/.env.local` y no se creo.)
6. `npm run build --workspace apps/api` -> OK (necesario para `node dist/main.js`).

## Verificacion funcional REAL con navegador (Chromium / Playwright)

Scripts de evidencia (no forman parte de la suite e2e del repo):
`.agents/tasks/web-login/browser-verify.mjs` (jwt) y `browser-verify-dev.mjs`
(dev-header). Se ejecutan con `node` contra los servidores levantados.

### Entorno de la corrida
- PostgreSQL: contenedor `plantilla-portales-postgres-1`, puerto 5433 (Docker).
- `DATABASE_URL` pasada por entorno al proceso de la API (el worktree no tiene
  `.env` propio); Prisma client regenerado en `apps/api/src/generated/prisma`.
- API jwt: `AUTH_MODE=jwt`, `JWT_SECRET=test-jwt-secret-local-verification-only`,
  `PORT=3100`, `CORS_ORIGINS=http://localhost:3200`, `ENABLE_SWAGGER_UI=false`.
  Log: `.agents/tasks/web-login/api-jwt.log` -> "API escuchando en http://localhost:3100".
- Web jwt: `next start -p 3200` con `NEXT_PUBLIC_API_BASE_URL=http://localhost:3100`
  y `NEXT_PUBLIC_AUTH_MODE=jwt`.

### Flujo jwt - cadena HTTP (replica exacta del cliente), API 3100
```
POST /auth/login {identifier:"jefe@demo.local",password:"wrong"} -> 401 (body vacio, generico)
POST /auth/login {identifier:"jefe@demo.local",password:"dev1234"} -> 200 token (3 segmentos), expiresIn=8h, user=jefe@demo.local / Ana Jefa
GET  /me/permissions  (sin Authorization)                        -> 401
GET  /me/permissions  Authorization: Bearer <token valido>       -> 200, allowedModules.count=21
GET  /me/permissions  Authorization: Bearer not.a.valid.token    -> 401
GET  /dev/actors      (modo jwt)                                 -> 404 (selector dev no disponible)
```

### Flujo jwt - NAVEGADOR REAL (Chromium) contra web 3200 -> API 3100
`node .agents/tasks/web-login/browser-verify.mjs` -> **11/11 PASS**:
```
PASS  ruta protegida sin sesion redirige a /login :: http://localhost:3200/login
PASS  formulario de login visible (labels + boton)
PASS  credenciales malas muestran error generico :: "Usuario o contrasena incorrectos."
PASS  error NO filtra existencia del usuario :: "Usuario o contrasena incorrectos."
PASS  tras error sigue en /login :: http://localhost:3200/login
PASS  login valido abandona /login :: http://localhost:3200/inicio
PASS  token guardado en localStorage[authToken]
PASS  shell muestra usuario autenticado :: "Ana Jefa"
PASS  permisos cargados (nav con modulos, no "Cargando tu sesion")
PASS  logout redirige a /login :: http://localhost:3200/login
PASS  logout limpia el token de localStorage
```
Esto observa en un navegador real: (a) el `RouteGuard` de cliente redirige a
`/login` sin sesion; (b) el formulario accesible se renderiza; (c) 401 ->
mensaje generico sin filtrar existencia; (d) login valido entra a `/inicio`,
guarda `authToken` en localStorage y pinta al usuario; (e) permisos cargados
(nav con modulos); (f) logout limpia el token y vuelve a `/login`. Cierra el
finding 1.

### Flujo dev-header - regresion en NAVEGADOR REAL (Chromium)
Se reinicio el worktree en dev-header: API `AUTH_MODE=dev-header` en 3100
(`/dev/actors` -> 200, 5 actores) y web `NEXT_PUBLIC_AUTH_MODE=dev-header` en 3200.
`node .agents/tasks/web-login/browser-verify-dev.mjs` -> **4/4 PASS**:
```
PASS  dev-header: /inicio NO redirige a /login :: http://localhost:3200/inicio
PASS  dev-header: selector de usuario presente
PASS  dev-header: NO hay boton "Cerrar sesion"
PASS  dev-header: no muestra pantalla de login en rutas protegidas
```
Confirma que el worktree NO rompe el modo dev-header: sin login, sin guard, el
selector dev sigue presente y no aparece el logout de jwt. Cierra el finding 2.

### Deteccion de modo
`NEXT_PUBLIC_AUTH_MODE` (variable publica build-time). `getAuthMode()` devuelve
`'jwt'` solo con el valor exacto `'jwt'`; cualquier otro valor o ausencia ->
`'dev-header'` (default seguro). El frontend no conoce el `AUTH_MODE` del backend;
deben coincidir por configuracion de despliegue.

### Donde se guarda el token
`localStorage`, clave `TOKEN_STORAGE_KEY='authToken'`. El usuario autenticado en
`authUser` (JSON). Confirmado en navegador real: tras login
`localStorage['authToken']` es un JWT de 3 segmentos; tras logout queda vacio.
Sin refresh tokens.

## Procesos
Todos los procesos arrancados en esta iteracion (API 3100 jwt y dev-header, web
3200 jwt y dev-header) fueron **detenidos** al terminar. Verificado: 3100/3200
sin listeners. Los servidores del repo PRINCIPAL en 3000/3001 se dejaron
intactos a proposito (nunca se tocaron).
