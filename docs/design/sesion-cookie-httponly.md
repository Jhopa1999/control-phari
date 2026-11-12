# Diseño: sesión en cookie `HttpOnly` y cabeceras de seguridad (BL-013 y BL-017)

- Estado: propuesto (pendiente de revisión independiente).
- Base: `main` en `a50714a`, rama `feat/seguridad-sesion-cookies-cabeceras`.
- Cierra: BL-013 (token de sesión de `localStorage` a cookie `HttpOnly`) y BL-017 (cabeceras de seguridad HTTP).
- Alcance de este documento: decisiones y plan. No incluye código.

## 1. Resumen

Hoy el JWT de la sesión vive en `localStorage` (`apps/web/src/lib/actor-context.tsx:77,131,185`; clave `authToken` definida en `apps/web/src/lib/api-client.ts:275`) y el cliente lo manda como `Authorization: Bearer` (`api-client.ts:303-311`). Cualquier XSS lo puede leer y exfiltrar.

El diseño mueve el token del navegador a una cookie `HttpOnly` que emite la API, sin quitar el soporte de `Authorization: Bearer` (lo usan el MCP, el asistente, los scripts y la verificación de despliegue). La API sigue siendo la fuente de verdad: el guard acepta Bearer o cookie, y solo cuando la identidad vino por cookie exige una cabecera propia en los métodos de escritura (CSRF). En paralelo se añaden cabeceras de seguridad en Next (CSP, anti-iframe, etc.) y un middleware pequeño en la API.

Decisiones clave, en una línea cada una:

| Tema | Decisión |
|------|----------|
| Cookie | `portal_session`; `HttpOnly`; `SameSite=Lax`; `Path=/`; sin `Domain`; `Max-Age` = `exp` del JWT − ahora |
| `Secure` | Variable `COOKIE_SECURE` = `auto` por defecto: `Secure` solo si la petición llegó por https (`req.secure` con `trust proxy`). Sin editar `.env.production` |
| Refresco | No existe y no se añade: la sesión dura lo que el JWT (`JWT_EXPIRES_IN`, 8 h) |
| Emisión | `POST /auth/login` y `POST /auth/reset-password` (autologin) ponen la cookie. El cuerpo no cambia (sigue trayendo `accessToken`) |
| Logout | Nuevo `POST /auth/logout` (204, idempotente) que borra la cookie |
| Guard | `CurrentUserGuard`: si hay `Authorization` lo usa (Bearer); si no, lee la cookie. Dev-header intacto |
| CSRF | `SameSite=Lax` + cabecera propia obligatoria `X-Portal-Csrf: 1` en `POST/PUT/PATCH/DELETE` cuando la identidad vino por cookie. Bearer no la exige |
| CORS | `credentials: true` solo con `CORS_ORIGINS` explícito; `*` se descarta con log de error en producción (sin abortar el arranque) y falla el arranque fuera de producción |
| Web | `credentials: 'include'` en modo jwt; el cliente ya no guarda el token; al recargar recupera el usuario con `GET /me/permissions` |
| Migración | Al cargar la nueva versión se borran `authToken` y `authUser` de `localStorage` y se pide login una vez. No se canjea el token viejo |
| CSP | En Next (`headers()`), aplicada (no solo reporte), con `'unsafe-inline'` en scripts y estilos (justificado en 9.2) |
| Otras cabeceras | Next: anti-iframe, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS condicionado a https. API: middleware propio y `x-powered-by` fuera |
| nginx | El del repo no cambia. Lo que convendría en el nginx del servidor se documenta (sección 9.5) |

## 2. Estado actual (evidencia)

- Login: `apps/api/src/modules/auth/auth-login.controller.ts:18-25` devuelve `LoginResponseDto` (`accessToken`, `expiresIn`, `user`). El JWT lo firma `AuthLoginService.issueSessionForUser` (`auth-login.service.ts:57-81`) con `{ sub: identifier }` y `expiresIn = JWT_EXPIRES_IN ?? '8h'` (línea 10 y 60).
- Restablecer/activar con autologin: `auth-reset.controller.ts:36-52` devuelve el mismo `LoginResponseDto`; el servicio reutiliza `issueSessionForUser` (`auth-reset.service.ts:150`). Son dos puntos de emisión, una sola fuente de firma.
- No existe endpoint de logout ni de refresco (búsqueda de `refresh` en `apps/api/src` sin resultados relevantes). El logout actual solo borra `localStorage` (`actor-context.tsx:130-137,193-197`).
- Guard: `current-user.guard.ts:48-50` elige la cabecera según el modo: en jwt lee `authorization` completo; si no, `x-actor-id`. Pasa el valor crudo a `ActorResolver.resolve(string)`. `JwtActorResolver` (`jwt-actor.resolver.ts:35-59`) exige el prefijo `Bearer `, verifica firma y expiración y carga el actor por `sub`. El guard se aplica por controlador (`@UseGuards(CurrentUserGuard)`, 39 usos en `apps/api/src`), nunca como `APP_GUARD`; las rutas públicas son `login`, `forgot-password`, `reset-password` y `/dev/actors`.
- Recuperar usuario: `GET /me/permissions` (`me.controller.ts:18-37`) ya devuelve `userId`, `name`, `identifier`, `roleCodes`, `allowedModules`. No hace falta `GET /auth/me`.
- CORS: `app.config.ts:20-30` (`parseCorsOrigins`) y `62-68` (`enableCors({ origin, methods })`); el comentario de la línea 59-61 dice explícitamente «no se habilitan credentials». Sin `CORS_ORIGINS` no se habilita CORS. `compose.prod.yaml` pasa `CORS_ORIGINS: ${CORS_ORIGINS:-}`, y `.env.production.example` pide dejarlo vacío porque web y API van bajo el mismo dominio.
- Topología de producción: `NEXT_PUBLIC_API_BASE_URL` es `/api` (`compose.prod.yaml`, args del servicio `web`; `apps/web/Dockerfile:22`), y `infra/nginx/nginx.conf` enruta `/api/` → `api:3001` (quitando el prefijo), `/mcp/` → `mcp:3002` y `/` → `web:3000`, todo con `X-Forwarded-Proto $scheme`. Es mismo origen: sin CORS. En desarrollo la web (3100) y la API (3101) son orígenes distintos pero del mismo sitio (`localhost`), por lo que sí hay CORS.
- El nginx HTTPS de producción es un archivo solo-servidor (`docs/despliegue-produccion-aws.md:84-85`, `docs/deployment.md:177-184`). No se puede asumir qué cabeceras pone; solo se sabe que el del repo sí pasa `X-Forwarded-Proto`.
- Asistente: `assistant.controller.ts:117` y `:211` pasan `req.headers.authorization` al servicio, que lo reenvía al MCP (`assistant-tools.ts:39-40`; `assistant-proposals.service.ts:230` exige el prefijo `Bearer `; `assistant.service.ts:420`). **Con cookie no habrá cabecera `Authorization`, así que el asistente se rompería si no se trata** (sección 8).
- Web que hace `fetch` fuera del cliente tipado: `assistant.ts:153` (SSE, `fetch`) y `assistant.ts:228-231` (subida de adjuntos por `XMLHttpRequest`); ambos usan `authHeaders()`. Evidencias de tarea usan el cliente tipado (`task-evidence.ts:44-86`), y la descarga abre una URL prefirmada de S3 con `window.open` (`task-evidence.ts:82`).
- Logs: `apps/api/src/observability/logger.config.ts:85-87` ya censura `req.headers.authorization` y `req.headers.cookie`.
- e2e: `e2e/jwt-session.spec.ts` (solo con `E2E_AUTH_MODE=jwt`) siembra `authToken`/`authUser` en `localStorage` (líneas 136-142) y afirma `authToken` nulo (195-197, 215-217); `e2e/reset-password-autologin.spec.ts` (134, 150, 170) afirma que `authToken` quedó en `localStorage`. La suite normal corre en dev-header con `localStorage.actorId` (`e2e/global-setup.ts`) y no se ve afectada.
- Next 16.4.3, sin `proxy.ts`/middleware, sin CSP ni cabeceras (`apps/web/next.config.ts`). Hay un script en línea de `next-themes` (`layout.tsx`, `suppressHydrationWarning`) y `react-markdown` sin plugin HTML, que renderiza `<img>` con URLs `http(s)` del Markdown (`markdown-view-content.tsx`).

## 3. La cookie

### 3.1 Atributos

| Atributo | Valor | Razón |
|----------|-------|-------|
| Nombre | `portal_session` | Simple y estable. No se usa el prefijo `__Host-`: exige `Secure` siempre y rompería el stack por red en http |
| Valor | El JWT que hoy se devuelve en `accessToken` | Un solo formato de token para cookie y Bearer; el resolver no cambia |
| `HttpOnly` | Sí | Es el objetivo de BL-013: JS no la lee |
| `Secure` | Según `COOKIE_SECURE` (3.2) | Debe funcionar en https y en http |
| `SameSite` | `Lax` | Ver 3.3 |
| `Path` | `/` | Ver 3.4 |
| `Domain` | Ausente (cookie ligada al host) | No se comparte con subdominios |
| `Max-Age` | `exp − ahora` del JWT recién firmado (3.5) | Misma vida que el token |

### 3.2 `Secure` con valor por defecto seguro

Variable nueva `COOKIE_SECURE` con tres valores:

- `auto` (**por defecto si no está definida**): `Secure` si la petición llegó por https, es decir, `req.secure`. Para que `req.secure` refleje el `X-Forwarded-Proto` del nginx, `configureApp` fija `trust proxy` en `loopback, linklocal, uniquelocal` (loopback y redes privadas, que cubre la red de Docker). La API no se publica al host en producción (`compose.prod.yaml`, comentario «No se publica al host»), así que solo habla con nginx.
- `true`: siempre `Secure`.
- `false`: nunca `Secure`.

Por qué `auto` y no `true`: con `true` en el stack por red (`http://192.168.0.116:8080`) o en `localhost` el navegador descarta la cookie y el login entra en bucle. Con `auto`:

- Producción detrás de nginx HTTPS que pasa `X-Forwarded-Proto: https` → `Secure`.
- Stack por red y desarrollo en http → sin `Secure`, funciona.
- No hace falta editar `.env.production`. `compose.prod.yaml` añadirá `COOKIE_SECURE: ${COOKIE_SECURE:-auto}` solo para que el valor sea visible y sobreescribible; sin esa línea el código ya usa `auto`.

Riesgo residual (hay que comprobarlo al desplegar): no se puede leer el nginx HTTPS del servidor. Si no enviara `X-Forwarded-Proto: https`, la cookie saldría sin `Secure` en producción: seguiría siendo `HttpOnly` y funcional, pero sin el atributo. La verificación posterior al despliegue debe hacer `curl -i` del login por https y comprobar `; Secure`. Si falta, la solución es añadir `COOKIE_SECURE=true` a `.env.production` (única acción posible, documentada en `PR_BODY.md` y en el runbook). Un valor desconocido de `COOKIE_SECURE` se trata como `auto` y se registra un aviso al arrancar.

### 3.3 `SameSite=Lax` (no `Strict`)

- Las páginas las sirve Next, que no usa la cookie, y la sesión se comprueba con un `fetch` same-origin posterior que sí la lleva; por tanto `Strict` tampoco rompería la primera carga desde un enlace externo. Se elige `Lax` porque la cookie viaja en las navegaciones GET de nivel superior (menos casos límite y menor fricción) sin perder protección real: lo que protege las escrituras es la cabecera propia (sección 6), no el atributo.
- `Lax` no se envía en `POST/PUT/PATCH/DELETE` entre sitios, que es lo que importa. Sí se envía en navegaciones GET de nivel superior. Condición: ningún `GET` de la API produce efectos de escritura. Se comprueba en la fase 1 (revisar los controladores `@Get`); la descarga de evidencias (`GET .../download`) solo devuelve una URL prefirmada.
- En desarrollo, `localhost:3100` y `localhost:3101` son el mismo sitio (el esquema y el dominio registrable coinciden; el puerto no cuenta), por lo que la cookie viaja con `Lax`.

### 3.4 `Path=/`

La API cuelga de `/api/` en producción y de la raíz en desarrollo (otro puerto). Una `Path=/api` no serviría en desarrollo ni en pruebas locales. Con `Path=/` la cookie también viaja a Next y a `/mcp/` del mismo host. Es inocuo: Next no la usa, el MCP solo lee `Authorization`, y nginx por defecto no registra la cookie. Se descarta una variable `COOKIE_PATH` (complejidad sin beneficio claro).

### 3.5 Vida: `Max-Age` frente a la expiración del JWT

No hay endpoint de refresco, así que no hay sesión deslizante: el JWT dura `JWT_EXPIRES_IN` (8 h) desde el login. La cookie se fija como persistente (para no cambiar el comportamiento actual, en que `localStorage` sobrevive al cierre del navegador), con `Max-Age = exp − floor(ahora)`, leyendo `exp` del token recién firmado (`JwtService.decode`). Así cookie y token caducan a la vez aunque cambie `JWT_EXPIRES_IN`, sin parsear el formato `8h`. Si por algún motivo `exp` no estuviera presente, se emite cookie de sesión (sin `Max-Age`) y se registra un aviso; el guard sigue verificando la expiración del JWT, que es lo que manda. Un refresco queda fuera de alcance (sección 14).

Cuando la cookie caduca el navegador deja de enviarla y la API responde 401 sin cookie, igual que hoy con un token ausente.

## 4. Emisión y cierre en la API

Un servicio pequeño `SessionCookieService` (en `apps/api/src/modules/auth/`, ligado a `Response`) concentra: `issue(res, accessToken)`, `clear(res)` y `readToken(req)`. No se añade `cookie-parser` ni otra dependencia: Express ya ofrece `res.cookie()`/`res.clearCookie()` para escribir, y la lectura se resuelve con un parser mínimo del encabezado `Cookie` (separar por `;`, primer `=`, decodificar con `decodeURIComponent`, buscar `portal_session`; ~15 líneas, con prueba). No se importa el paquete transitivo `cookie` de Express.

- `POST /auth/login` (`auth-login.controller.ts:23`): el método pasa a usar `@Res({ passthrough: true })`, llama a `issue(res, result.accessToken)` solo si el login tuvo éxito. Cuerpo y código (200) sin cambios.
- `POST /auth/reset-password` (`auth-reset.controller.ts:50`): igual. El autologin queda con la misma cookie que el login. Como los dos pasan por `issueSessionForUser`, no se duplica la firma.
- `POST /auth/logout` (nuevo, en `AuthLoginController`): público, `204`, idempotente. Llama a `clear(res)`, que emite `Set-Cookie` con los **mismos** `Path`, `Secure`, `SameSite` y `HttpOnly` y `Max-Age=0`/`Expires` pasado (si los atributos no coinciden, el navegador no borra la cookie). No exige sesión: se puede cerrar con una cookie caducada. Para que otro sitio no pueda forzar un cierre, si la petición trae la cookie exige la cabecera CSRF (3.6); sin cookie no hay nada que cerrar.
- Todas las respuestas que llevan `Set-Cookie` añaden `Cache-Control: no-store`.
- El logout no puede revocar el JWT (es sin estado): un token copiado antes sigue valiendo hasta `exp`. Revocar exigiría una lista de denegación en BD (migración), que queda fuera de alcance y se documenta como riesgo (sección 14).

Fallos y respuestas:

| Caso | Resultado | ¿Cookie? | Log |
|------|-----------|----------|-----|
| Login con credenciales inválidas | 401 (igual que hoy) | No se emite | Los existentes |
| Reset con token inválido (400) o caducado (410) | Igual que hoy | No se emite | Los existentes |
| Logout sin cookie | 204 | Se emite el borrado (inofensivo) | Ninguno |
| Logout con cookie y sin cabecera CSRF | 403 | No se toca | `warn` sin valores |
| Fallo al leer `exp` | La respuesta sale 200 con cookie de sesión | Sin `Max-Age` | `warn` |

## 5. Guard: cookie, Bearer y dev-header

Cambio acotado en `current-user.guard.ts:39-61`; la interfaz `ActorResolver` y `JwtActorResolver` no cambian (siguen recibiendo `"Bearer <token>"`).

Orden en modo jwt:

1. Si hay cabecera `Authorization`: se usa tal cual. Origen = `bearer`. No se mira la cookie. Si el Bearer es inválido, responde 401; no se «cae» a la cookie (evita ambigüedad de identidad).
2. Si no hay `Authorization` y hay cookie `portal_session`: el guard compone `Bearer <valor>`, origen = `cookie`, y aplica CSRF (sección 6) antes de resolver el actor (así no se consulta la BD si falta la protección).
3. Si no hay ninguna: se resuelve con `undefined` y el resolver devuelve `null` → 401, como hoy.

Modo `dev-header` (cualquier modo distinto de jwt): se conserva exactamente `X-Actor-Id` (`current-user.guard.ts:48-50`). La cookie se ignora por completo, así que el entorno de desarrollo y los specs que no definen `AUTH_MODE` no cambian.

El guard anota en la petición el origen de la identidad (`authSource`) y el valor normalizado `Bearer <token>` en un campo que el asistente reutiliza (sección 8). `RequestWithActor` (`current-user.guard.ts:23-26`) ampliará `method`, `authSource` y `bearer`. Valores: `authSource` es `'bearer'`, `'cookie'` o `'dev-header'`. En dev-header `bearer` queda `undefined`, igual que hoy el asistente recibe `req.headers.authorization` ausente, salvo que llegue un `Authorization` explícito (entonces se conserva tal cual). Caso de prueba del asistente en dev-header: sin `Authorization` reenvía `undefined`; con `Authorization` explícito lo reenvía.

Consecuencia: la protección CSRF vive en el único punto que conoce el origen de la identidad. Toda ruta autenticada la obtiene sin tocar controladores. Las rutas públicas no usan la cookie.

## 6. CSRF

Amenaza: otro sitio hace que el navegador de la víctima mande una escritura a la API; el navegador adjunta la cookie sola.

Defensa en dos capas:

1. `SameSite=Lax`: el navegador no envía la cookie en `POST/PUT/PATCH/DELETE` iniciados desde otro sitio.
2. Cabecera propia obligatoria: en `POST`, `PUT`, `PATCH` y `DELETE` autenticados por cookie, el guard exige `X-Portal-Csrf: 1`; si falta responde `403 Forbidden` («Falta la cabecera de protección CSRF.»). Un formulario o una imagen de otro sitio no pueden añadir cabeceras personalizadas; `fetch`/XHR de otro origen sí, pero antes lanzan un preflight CORS que la API solo aprueba para `CORS_ORIGINS`. En producción (mismo origen, sin CORS) el preflight siempre falla.

Alternativas descartadas:

- Doble envío de token (token en cookie legible + cabecera): exigiría una cookie legible por JS y generar/rotar tokens; no aporta frente a la cabecera propia con CORS estricto.
- Comprobar `Origin`/`Referer`: detrás de nginx el `Host` llega sin puerto (`proxy_set_header Host $host`, `infra/nginx/nginx.conf`), así que comparar con el origen exacto del stack por red (`:8080`) es frágil. Se omite.
- `SameSite=Strict` como única defensa: ver 3.3.

El valor `1` es fijo y no secreto: lo que protege es que debe ser una cabecera personalizada. Bearer no exige la cabecera: el navegador no adjunta `Authorization` de forma automática, por lo que no es susceptible a CSRF. Los métodos seguros (`GET`, `HEAD`, `OPTIONS`) no la exigen.

Prueba de cobertura (Jest): enumerar las rutas `POST/PUT/PATCH/DELETE` de la aplicación y comprobar que todas llevan `CurrentUserGuard` salvo una lista permitida explícita (`login`, `logout`, `forgot-password`, `reset-password`), para que una ruta nueva de escritura sin guard no quede fuera de la protección.

## 7. CORS

Cambios en `app.config.ts:59-68`:

- `credentials: true`, solo cuando hay `CORS_ORIGINS` (el bloque sigue condicionado a `corsOrigins.length > 0`). `origin` sigue siendo la lista exacta; nunca `*`.
- `parseCorsOrigins` descarta las entradas vacías y `*`. Hoy (`app.config.ts:20-30`) acepta cualquier cadena y la API arranca; el `.env.production` del servidor no está en el repo y `compose.prod.yaml:43` pasa `${CORS_ORIGINS:-}` (vacío por defecto), así que no se puede asegurar que no tenga `*`, y el despliegue no puede editarlo. Por eso el comportamiento depende del entorno:
  - `NODE_ENV=production`: se descarta `*` con log `error` (motivo: incompatible con credenciales) y CORS se habilita solo con las entradas válidas restantes; si no queda ninguna, no se habilita CORS. **No se aborta el arranque**, para no provocar un bucle de reinicio de la API en el despliegue.
  - Fuera de producción: `*` hace fallar el arranque con un mensaje claro (configuración engañosa detectada pronto).
  - Con credenciales el navegador ya ignoraría `*`; descartarlo no cambia lo que funciona hoy.
- `allowedHeaders` explícito: `Content-Type`, `Authorization`, `X-Actor-Id`, `X-Portal-Csrf`. Son las únicas cabeceras que manda la web (`authHeaders()` más `Content-Type`/`Accept`, que son seguras en CORS).
- `methods` se mantiene (`GET, POST, PUT, PATCH, DELETE`); las preflight `OPTIONS` las gestiona el middleware de CORS.
- Las respuestas CORS ya añaden `Vary: Origin`.

Producción no necesita `CORS_ORIGINS` (mismo origen). Desarrollo (`localhost:3100` → `localhost:3101`) sí, y el `.env.example` ya lo declara.

## 8. Asistente (SSE y adjuntos) y evidencias

Problema de fondo: el asistente reenvía el `Authorization` del usuario al MCP para actuar con sus permisos (`assistant.controller.ts:117,211`; `assistant-proposals.service.ts:230`; `assistant.service.ts:420`). Con cookie, el navegador no envía esa cabecera.

Decisión: el guard ya deja el `Bearer <token>` normalizado en la petición (sección 5). `assistant.controller.ts` pasa ese valor en lugar de `req.headers.authorization` (la interfaz `SseRequest`, línea 47-49, se actualiza). Los servicios del asistente no cambian de firma: siguen recibiendo `"Bearer …"`. El token nunca sale de la API hacia el navegador y viaja solo a la URL interna `ASSISTANT_MCP_URL`, igual que hoy. Las pruebas del asistente que simulan `authorization` se mantienen y se añade un caso con cookie.

- SSE (`assistant.ts:153`): el `fetch` añade `credentials: 'include'` y `authHeaders()` aporta `X-Portal-Csrf`. La respuesta `text/event-stream` y `X-Accel-Buffering: no` (`assistant.controller.ts:122-126`) no cambian; el middleware de cabeceras de la API (sección 9.4) no debe pisar las que ya puso el controlador. Es un `POST`, así que lleva la cabecera CSRF.
- Adjuntos del chat (`assistant.ts:228`, `XMLHttpRequest`): se añade `xhr.withCredentials = true` y la cabecera CSRF por `authHeaders()`.
- Evidencias de tarea: usan el cliente tipado (`task-evidence.ts`), que recibirá `credentials: 'include'` y el middleware de cabeceras (sección 10), así que listar, subir (multipart) y borrar funcionan sin más cambios. La descarga obtiene una URL prefirmada de S3 (`evidence.service.ts:207`) y la abre en pestaña nueva; esa URL no necesita ni lleva la cookie, y es una navegación (no la regula `connect-src`).
- Otras `fetch` directas: solo estas dos (`grep` de `fetch(`/`XMLHttpRequest` en `apps/web/src`). Todo lo demás pasa por el cliente tipado.

## 9. Cabeceras de seguridad (BL-017)

### 9.1 Dónde va cada una

| Capa | Cabeceras | Razón |
|------|-----------|-------|
| Next (`headers()` en `next.config.ts`) | CSP, anti-iframe, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS condicionado | Llegan a producción porque Next va en el contenedor `web`; no dependen del nginx del servidor |
| API (middleware propio) | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP de API, HSTS si `req.secure`, `Cache-Control: no-store` en respuestas de auth | Cubre las respuestas JSON de la API, que no pasan por Next |
| nginx del repo | Sin cambios | No llega a producción (nginx HTTPS es solo-servidor) |
| nginx del servidor | Recomendación documentada (9.5) | No se puede editar desde el repo |

### 9.2 CSP de la web

Aplicada (`Content-Security-Policy`), no `Report-Only`. Valor base, en producción:

```text
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' <origen de la API si es absoluto>;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
worker-src 'self' blob:
```

Justificación directiva a directiva:

- `script-src 'self' 'unsafe-inline'`: Next emite scripts en línea para el arranque y la hidratación, y `next-themes` inyecta un script anti-parpadeo (`layout.tsx`). Quitar `'unsafe-inline'` obliga a usar nonces por petición, lo que fuerza a que todas las rutas se rendericen dinámicamente (un `proxy.ts` más renderizado por petición) y es un cambio de arquitectura de rendimiento y de riesgo para esta tarea. Se acepta `'unsafe-inline'` en scripts como primera iteración: el objetivo principal de BL-013 (que un XSS no pueda leer el token) lo cubre la cookie `HttpOnly`, no la CSP. Endurecer con nonces queda en el backlog (sección 14). En desarrollo se añade además `'unsafe-eval'` (lo requiere React/Next en `next dev`) y `connect-src` con `ws:`/`wss:` para HMR; **nunca en producción**.
- `style-src 'unsafe-inline'`: Tailwind, Radix/shadcn y Next usan atributos `style` y estilos en línea; sin esto se rompe la interfaz.
- `img-src 'self' data: blob: https:`: `data:` por imágenes embebidas; `blob:` por la vista previa de adjuntos (`attachment-text-dialog.tsx:134`, `<img src={previewUrl}>`); `https:` porque `react-markdown` renderiza imágenes `![](https://…)` que los usuarios ponen en los documentos y porque las imágenes prefirmadas del bucket de evidencias (S3) tienen host variable por región/cuenta. `http:` queda fuera.
- `connect-src 'self'`: en producción la API está en `/api` (mismo origen) y el SSE del asistente es `fetch` same-origin. Si `NEXT_PUBLIC_API_BASE_URL` es absoluta (desarrollo, `http://localhost:3101`), `next.config.ts` añade su origen. Bedrock no se llama desde el navegador. La subida a S3 no es directa desde el navegador (pasa por la API).
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`: sin coste funcional.
- No se incluye `upgrade-insecure-requests`: rompería el stack por red en http.
- Las fuentes son `next/font` (autohospedadas, `layout.tsx` importa `./fonts`), por lo que `font-src 'self'` basta.

Dependencia al endurecer con nonces: el acta imprimible de reuniones (`apps/web/src/lib/minutes.ts:83-117`) abre `window.open('')` y escribe con `document.write` un `<style>` y un `<script>` en línea (`window.print()`). Funciona con `'unsafe-inline'` porque la ventana hereda la CSP; al quitarlo habrá que rehacer ese flujo (p. ej. sin script en línea).

Verificación obligatoria antes de dar la CSP por buena: recorrer en navegador, en modo jwt, Panel, Solicitudes, Plan, Mi trabajo, Bitácora, Asistente (SSE y adjunto), Documentos con Markdown, evidencias y Reuniones → imprimir acta, con la consola abierta, sin violaciones de CSP. Si una pantalla exigiera relajar algo, se documenta qué y por qué. Plan B ya decidido: si una violación no se puede resolver sin una relajación inaceptable, la CSP se publica como `Content-Security-Policy-Report-Only` en esta iteración, con la razón anotada en el PR.

### 9.3 Otras cabeceras de la web

- `X-Frame-Options: DENY` (compatibilidad con navegadores que no leen `frame-ancestors`).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()` (el portal no usa ninguna de esas capacidades).
- `Strict-Transport-Security: max-age=15552000` (180 días), **sin** `includeSubDomains` ni `preload`: el dominio de producción es provisional (`sslip.io`, `docs/despliegue-produccion-aws.md:81`). Se emite solo en peticiones que llegan por https mediante la condición `has` de `headers()` de Next sobre `x-forwarded-proto: https` (el nginx del repo la envía; el del servidor se verificará). Así no se rompe el stack por red en http ni `localhost`. Si el nginx del servidor no enviara esa cabecera, no habría HSTS: es una pérdida de seguridad, no de funcionalidad, y se anota para el servidor (9.5).
- `poweredByHeader: false` en `next.config.ts` para quitar `x-powered-by: Next.js`.

### 9.4 Cabeceras de la API

Middleware propio y pequeño (`apps/api/src/security/security-headers.middleware.ts`), registrado desde `configureApp` para que lo vean las pruebas con supertest y el runtime, y sin tocar el generador de OpenAPI (el registro se protege con el mismo `typeof` que ya usa `useBodyParser`). No se añade `helmet`: son cinco cabeceras.

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (la API solo devuelve JSON o SSE). **No se aplica a `/docs`** (Swagger UI, solo si `ENABLE_SWAGGER_UI=true`), que necesita cargar scripts y estilos.
- `Strict-Transport-Security: max-age=15552000` solo si `req.secure`.
- Se fijan con `setHeader` antes de la ruta, sin pisar las que el controlador ya defina (SSE).
- `x-powered-by`: `expressApp.disable('x-powered-by')` en `configureApp`, con el mismo guard `typeof`.
- Registro: añadir `res.headers["set-cookie"]` a las rutas censuradas de `logger.config.ts:86` para que la cookie emitida nunca aparezca en logs.

### 9.5 Qué haría falta en el nginx del servidor (solo documentación)

Nada es imprescindible para que funcione; son mejoras:

- Confirmar `proxy_set_header X-Forwarded-Proto $scheme;` en el `server` 443 (de ello dependen `Secure` y HSTS).
- Opcional: `add_header Strict-Transport-Security "max-age=15552000" always;` en el bloque 443 (si se añade allí, quitar la de Next para no duplicar) y `server_tokens off;`.
- No añadir CSP en nginx: ya la emite Next, y duplicarla produciría políticas que se intersectan.
- No tocar `Cookie`/`Set-Cookie` (por defecto pasan tal cual).

## 10. Cliente web

### 10.1 Qué guarda el cliente

- **Nunca el token.** No existe la clave `authToken` ni se lee/escribe en `localStorage`/`sessionStorage`.
- El usuario autenticado (id, nombre, identifier) vive solo en memoria, derivado de la respuesta de `GET /me/permissions`.
- Una pista no sensible, `authSessionHint = '1'` en `localStorage`, se marca al iniciar sesión y se borra al cerrar sesión o al detectar 401. No concede nada: solo permite distinguir «la sesión caducó» (había pista y la API da 401 → `?expired=1` / `sessionExpired`) de «nunca hubo sesión» (sin pista, 401 → login normal). El `signedOut` existente se mantiene.
- `ACTOR_STORAGE_KEY` (`actorId`) de dev-header no cambia.

### 10.2 Recuperar el usuario al recargar

En modo jwt, al montar `ActorProvider` (`actor-context.tsx:117-129`) se llama a `getMyPermissions()` (ya existe, `lib/me`), que viaja con la cookie. Con 200 se rellenan `permissions`, `authUser` (`userId`, `name`, `identifier`) y `actorId = identifier`, y `identityReady = true`. Con 401 se limpia la pista y se publica «sin sesión» (o `sessionExpired` si había pista); `identityReady = true`. Hasta que responda, `identityReady` sigue en `false`, y `route-guard.tsx` (líneas 83, 127) ya no decide nada mientras tanto; el shell muestra su estado de carga. Se elimina el centinela `JWT_IDENTITY_SENTINEL` (`actor-context.tsx:21`) y la lectura de `authUser` desde `localStorage` (líneas 75-95), porque ya no hace falta un valor sintético para disparar la carga de permisos.

Costo: una petición por carga completa antes de pintar el shell (se pinta ya hoy `/me/permissions` tras cada carga). Un 401 en la consola del navegador al visitar `/login` sin sesión es esperado. No se crea `GET /auth/me`.

### 10.3 Cambios por archivo

- `api-client.ts`: se retira `TOKEN_STORAGE_KEY` como clave activa (queda una constante `LEGACY_TOKEN_STORAGE_KEY = 'authToken'` solo para purgar). `authHeaders()` (303-311) en jwt devuelve `{ 'X-Portal-Csrf': '1' }` (sin `Authorization`); en dev-header, `X-Actor-Id` como hoy. El middleware de `api.use` (316-322) lo aplica a todas las peticiones.
- `packages/api-client/src/client.ts`: nueva opción `credentials?: RequestCredentials`, pasada a `openapi-fetch` (v0.17.0, `package-lock.json`; sus opciones extienden `RequestInit`; se comprueba en la fase 2). `apps/web` crea el cliente con `credentials: 'include'` solo en modo jwt. Se usa `'include'` y no `'same-origin'` porque en desarrollo la API está en otro origen; en producción (mismo origen) es equivalente.
- `auth.ts`: `logout()` nuevo que hace `POST /auth/logout` con el cliente tipado.
- `actor-context.tsx`: `login(token, user)` pasa a `login(user)` (`login-form.tsx:75` y `set-password-form.tsx:111` dejan de pasar el token y marcan la pista); `logout` pasa a asíncrono: llama a `POST /auth/logout`, borra la pista y el estado, y solo entonces resuelve; `user-menu.tsx:57` espera el resultado antes de navegar a `/login` (si no, una recarga inmediata podría llevar aún la cookie). Si el logout falla por red, se limpia igualmente el estado local y se muestra el aviso existente de error genérico (la cookie caduca sola por `Max-Age`).
- `assistant.ts`: `credentials: 'include'` en el `fetch` (153) y `xhr.withCredentials = true` (228).
- Otras pestañas: un evento `storage` sobre la pista lleva a las demás pestañas a `/login` al cerrar sesión.

### 10.4 Migración de sesiones existentes

Al cargar la nueva versión en modo jwt, antes de la primera llamada, el cliente ejecuta `localStorage.removeItem('authToken')` y `removeItem('authUser')` en un `try/catch` (almacenamiento no disponible = nada que borrar). La persona ve el login y entra una vez; no se canjea el token viejo por cookie.

Razón: canjear exigiría un endpoint que acepte un token que se asumía expuesto y dejaría la ventana de exposición que se quiere cerrar; el costo de pedir login una vez es mínimo y es lo más simple y seguro. Esa persona inicia sesión de nuevo (una vez) tras el despliegue; se avisa en `PR_BODY.md`. Una pestaña con el bundle viejo abierto durante el despliegue seguirá usando su Bearer hasta recargar, porque la API sigue aceptando Bearer. El JWT viejo permanece válido en el servidor hasta su `exp` (no se puede revocar; sección 14).

## 11. Contrato, MCP y documentación (regla 55)

- **API/OpenAPI**: `POST /auth/logout` nuevo con `@ApiOperation` en español, `@ApiResponse` 204/403. `POST /auth/login` y `POST /auth/reset-password` documentan la cabecera `Set-Cookie` en sus respuestas 200 (`@ApiResponse({ headers: { 'Set-Cookie': … } })`). `GET /me/permissions` no cambia. Orden obligatorio: `npm run build:api` y luego `npm run contracts:generate`; versionar `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts` y `packages/api-client/src/generated/openapi.json`.
- **MCP**: el MCP se autentica por Bearer y sigue igual (su login en `apps/mcp/src/api.ts:91` ignora `Set-Cookie`). `POST /auth/logout` se añade como exclusión permanente con motivo a la lista de `apps/mcp/src/tools/exclusions.ts:67-69` (junto a login y reset: «gestión de sesión de navegador; el MCP usa Bearer sin estado»). No hay tool nueva. `MAX_PENDIENTES` no cambia. El test de cobertura debe quedar verde.
- **Docs de aplicación**: `autenticacion-autorizacion.md` (cookie, atributos, CSRF, Bearer, dev-header, `COOKIE_SECURE`), `modulos-backend.md` (logout y emisión de cookie), `frontend-pantallas.md` (inicio de sesión y recarga), `changelog.json` (UTF-8 sin BOM, nueva entrada), `docs/deployment.md` y `docs/despliegue-produccion-aws.md` (variable nueva, comprobación `Secure`, nginx del servidor), `apps/mcp/README.md` solo si la exclusión lo amerita.
- **Variables**: `.env.example` y `.env.production.example` documentan `COOKIE_SECURE=auto` (sin secretos). `compose.prod.yaml`: `COOKIE_SECURE: ${COOKIE_SECURE:-auto}` en el servicio `api`.
- **Backlog**: marcar BL-013 y BL-017 como hecho en `docs/BACKLOG.md` (cuidando los conflictos entre PR en ese archivo).
- Esta iteración no requiere migraciones de esquema.

## 12. Impacto en pruebas

### Jest (API)

- Login emite `Set-Cookie` con `portal_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` coherente con `exp`, y `Secure` según `COOKIE_SECURE` (`auto` con y sin `X-Forwarded-Proto: https`, `true`, `false`).
- Login fallido y reset con token inválido/caducado: sin `Set-Cookie`.
- Reset con autologin: emite cookie.
- Logout: `204`, borra con los mismos atributos; sin cookie también 204; con cookie y sin cabecera CSRF, 403.
- Guard: acepta cookie, acepta Bearer, rechaza sin nada, rechaza cookie inválida, Bearer inválido con cookie válida → 401, dev-header ignora la cookie y conserva `X-Actor-Id`.
- CSRF: escritura por cookie sin `X-Portal-Csrf` → 403; con ella → pasa; Bearer sin ella → pasa; `GET` por cookie sin ella → pasa. Prueba de cobertura de rutas de escritura (sección 6).
- CORS: preflight desde origen permitido con `Access-Control-Allow-Credentials: true`; origen no permitido sin cabeceras CORS; `CORS_ORIGINS` con `*`: en producción se descarta con log de error y no entra en `origin` (la API arranca), fuera de producción falla al arrancar.
- Cabeceras de seguridad presentes en respuestas de la API; `x-powered-by` ausente; CSP de API no aplicada a `/docs`; HSTS solo con `req.secure`; SSE conserva sus cabeceras.
- Parser de cookies: vacía, varias, valor con `=`, valor codificado, nombre repetido.
- Asistente: `chat` y `confirm` con cookie reenvían `Bearer <token>` al gateway.

### `node --test` (MCP)

Cobertura frente al contrato con la exclusión nueva; la autenticación Bearer del MCP no cambia.

### Playwright

- `e2e/jwt-session.spec.ts`: el caso de sesión rechazada (líneas 128-150) deja de sembrar `authToken` y siembra la cookie `portal_session=invalido` con `context.addCookies` (`url` de la web; las cookies no distinguen puerto) más la pista; el caso `next` externo (162) limpia también las cookies (`context.clearCookies()`); las afirmaciones `authToken === null` (195-197, 215-217) se conservan y se añade que la cookie es `httpOnly`, `sameSite: 'Lax'` y que `document.cookie` no la contiene. Casos nuevos: tras login no hay token en `localStorage`; recargar mantiene la sesión; cerrar sesión borra la cookie y una recarga no la recupera; un `authToken` heredado en `localStorage` se purga y lleva al login.
- `e2e/reset-password-autologin.spec.ts` (134, 150, 170): afirmar la cookie de sesión y una petición autenticada exitosa en lugar de `authToken`.
- Nuevo `e2e/security-headers.spec.ts` (corre en cualquier modo): CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y `Permissions-Policy` en la web; HSTS ausente en http y presente con `x-forwarded-proto: https`; `x-powered-by` ausente; cabeceras de la API en `/health`.
- Asistente SSE y subida de evidencia: si algún e2e los cubre, se ejecuta en la corrida jwt; si ninguno los cubre en jwt, se hace comprobación manual y se registra el resultado en la tabla de verificación del PR.
- `e2e/jwt-session.spec.ts` se omite salvo con `E2E_AUTH_MODE=jwt` (líneas 28-34); la suite completa corre en dev-header (`global-setup.ts`) y omitiría los specs que cambian. Por eso la fase 6 exige dos corridas separadas (jwt para los specs afectados y dev-header para la suite completa).

## 13. Plan de implementación por fases

1. **API**: `SessionCookieService` (+ parser y tests); `trust proxy` y `x-powered-by`; emisión en login/reset; `POST /auth/logout`; guard con cookie y CSRF; CORS con credenciales y `allowedHeaders`; middleware de cabeceras; redacción de `set-cookie`; asistente con `Bearer` normalizado; `Cache-Control: no-store` en auth; revisión de que no hay `GET` con escritura; tests Jest.
2. **Contrato y MCP**: `npm run build:api` → `npm run contracts:generate`; versionar los tres archivos; opción `credentials` en `packages/api-client`; `npm run build --workspace packages/api-client`; exclusión del MCP y tests.
3. **Web**: `api-client.ts`, `auth.ts`, `assistant.ts`, `actor-context.tsx`, `login-form.tsx`, `set-password-form.tsx`, `user-menu.tsx`; purga de `authToken`/`authUser`; `next.config.ts` (`headers()`, `poweredByHeader: false`); lint con `--max-warnings 0` y typecheck.
4. **E2E**: actualizar los specs de la sección 12 y añadir `security-headers.spec.ts`.
5. **Documentación y configuración**: docs de aplicación, despliegue, `changelog.json`, `.env.example`, `.env.production.example`, `compose.prod.yaml`, BACKLOG.
6. **Verificación**: manual contra la API real en modo jwt (usuarios demo `jefe@/lider@/integrante@/admin@demo.local`): login, recarga, logout, una escritura, `curl` con Bearer, consola sin violaciones de CSP en las pantallas listadas en 9.2; build web sin `apps/web/.env.local`. Además, dos corridas e2e:
   - **Corrida jwt** (API y web en jwt): API con `cmd /c "set AUTH_MODE=jwt&& set PORT=3101&& set CORS_ORIGINS=http://localhost:3100&& npm run start:dev --workspace apps/api"`, web con `NEXT_PUBLIC_AUTH_MODE=jwt` y `NEXT_PUBLIC_API_BASE_URL=http://localhost:3101`, y luego `cmd /c "set E2E_WEB_URL=http://localhost:3100&& set E2E_API_URL=http://localhost:3101&& set E2E_AUTH_MODE=jwt&& npx playwright test e2e/jwt-session.spec.ts e2e/reset-password-autologin.spec.ts e2e/security-headers.spec.ts"`. Ningún spec afectado puede quedar omitido (`skipped`).
   - **Corrida dev-header** (modo por defecto): suite e2e completa una vez.
   - SSE del asistente y subida de evidencia: comprobación manual en jwt si ningún e2e los cubre en esa corrida; el resultado se registra en la tabla del PR.

Despliegue (lo ejecuta el orquestador, no esta tarea):

- Orden seguro: la API primero y la web después. API nueva + web vieja funciona (la API sigue aceptando Bearer y devolviendo `accessToken`); web nueva + API vieja no (necesita `/auth/logout` y la emisión de cookie), así que no se invierte el orden.
- Tras desplegar: `curl -i` del login por https para comprobar `Set-Cookie ... Secure; HttpOnly; SameSite=Lax`, la verificación de producción por Bearer y la comprobación de cabeceras de la web.
- Rollback: volver a las imágenes anteriores. El front anterior vuelve a usar Bearer en `localStorage` (cada persona inicia sesión de nuevo). La cookie que quede es ignorada por la API anterior. No hay cambios de esquema que deshacer.

## 14. Riesgos y fuera de alcance

- Sin revocación: cerrar sesión borra la cookie pero un JWT copiado sigue siendo válido hasta `exp`. Una lista de denegación o versión de sesión requiere migración; queda como pendiente en el backlog.
- Sin refresco ni sesión deslizante: a las 8 h hay que iniciar sesión de nuevo, como hoy.
- CSP con `'unsafe-inline'` en scripts: endurecimiento con nonces como pendiente del backlog (impacto en renderizado dinámico).
- `Secure` y HSTS dependen de `X-Forwarded-Proto` del nginx del servidor, no verificable desde el repo (3.2 y 9.3).
- `img-src https:` permite imágenes remotas desde Markdown: es un canal de exfiltración menor; aceptado por compatibilidad.
- Login CSRF y limitación de intentos de login: fuera de alcance.
- Fuera de alcance: cambiar el nginx del servidor, migraciones de esquema, MCP con cookies, `helmet`, `cookie-parser`.

## 15. Supuestos a confirmar en la implementación

- `openapi-fetch` 0.17.0 acepta `credentials` en las opciones de `createClient`.
- `@ApiResponse({ headers })` de `@nestjs/swagger` genera el contrato sin romper `contracts:generate`.
- Ningún `GET` de la API produce escrituras.
- Un `GET /me/permissions` por carga completa no empeora de forma apreciable el tiempo hasta pintar.
