# Autenticación y autorización

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

La identidad y el control de acceso viven en el backend (`apps/api/src/modules/auth` y
`apps/api/src/modules/grant`). El frontend solo filtra el menú de forma cosmética; el
servidor es siempre quien decide.

## Modos de autenticación

El modo se configura por la variable de entorno `AUTH_MODE` (`apps/api/.../auth/
dev-actor.resolver.ts`):

- **`dev-header`** (desarrollo): la identidad llega en el header `X-Actor-Id` con el
  `identifier` del usuario. El endpoint `GET /dev/actors` lista los usuarios activos
  para el selector de desarrollo; fuera de este modo responde `404`.
- **`jwt`** (autenticación real): el usuario obtiene un token con
  `POST /auth/login` (identifier + contraseña, verificada contra `User.passwordHash`
  con bcrypt). El token viaja en el header `Authorization: Bearer <token>`.

El `CurrentUserGuard` es el único punto que conoce el request HTTP: según el modo lee
`Authorization` (jwt) o `X-Actor-Id` (resto) y pasa el valor crudo al *resolver*. La
carga del actor y sus grants (`load-actor.ts`) es **común a ambos modos**, de modo que
la lógica de autorización no se duplica entre modos de autenticación.

## Sesión del navegador: cookie `HttpOnly` (modo `jwt`)

Diseño y decisiones: `docs/design/sesion-cookie-httponly.md`. Cierra BL-013 y BL-017.

El navegador ya **no guarda el token** (ni `authToken` ni `authUser` en `localStorage`).
`POST /auth/login` y `POST /auth/reset-password` (autologin) siguen devolviendo
`accessToken` en el cuerpo (lo usan Bearer, MCP y scripts; la web lo descarta) y además
emiten la cookie de sesión:

| Atributo | Valor |
| --- | --- |
| Nombre | `portal_session` (contiene el mismo JWT) |
| `HttpOnly` | Sí: JavaScript no puede leerla |
| `SameSite` | `Lax` |
| `Path` | `/` (sin `Domain`) |
| `Max-Age` | `exp` del JWT − ahora (misma vida que el token, `JWT_EXPIRES_IN`, 8 h por defecto). No hay refresco |
| `Secure` | Según `COOKIE_SECURE` (ver abajo) |

`COOKIE_SECURE` admite `auto` (por defecto), `true` o `false`. Con `auto` la cookie lleva
`Secure` solo si la petición llegó por https: la API fija `trust proxy`
(`loopback, linklocal, uniquelocal`) y lee `X-Forwarded-Proto` del nginx. Así funciona en
producción (https) y en el stack por red / `localhost` (http) sin editar `.env.production`.
Un valor desconocido se trata como `auto` y se avisa al arrancar.

**Cierre de sesión:** `POST /auth/logout` (público, `204`, idempotente) borra la cookie con
los mismos atributos de emisión. Si la petición trae la cookie, exige la cabecera CSRF
(`403` si falta). No revoca tokens: un JWT copiado sigue siendo válido hasta `exp`.

**Guard (`CurrentUserGuard`) en modo `jwt`:**

1. Si llega `Authorization`, se usa como Bearer (no se cae a la cookie si es inválido: `401`).
2. Si no, se lee la cookie `portal_session`; en `POST/PUT/PATCH/DELETE` se exige antes la
   cabecera `X-Portal-Csrf: 1` (`403 Forbidden` si falta).
3. Si no hay ninguna, `401`.

El guard deja en la petición el origen de la identidad (`authSource`: `bearer`, `cookie` o
`dev-header`) y el `Bearer <token>` normalizado, que el asistente reenvía al MCP.

**CSRF:** `SameSite=Lax` más la cabecera propia `X-Portal-Csrf: 1`, obligatoria solo cuando
la identidad vino por cookie y el método es de escritura. Bearer no la necesita (el navegador
no lo adjunta solo). Los `GET` no la exigen.

**CORS:** `credentials: true` únicamente cuando `CORS_ORIGINS` lista orígenes explícitos
(`allowedHeaders`: `Content-Type`, `Authorization`, `X-Actor-Id`, `X-Portal-Csrf`). Un `*` en
`CORS_ORIGINS` se descarta con un log de error en producción (la API arranca) y hace fallar
el arranque fuera de producción. En producción web y API comparten origen (`/api`), sin CORS.

**Recuperar al usuario al recargar:** la web llama a `GET /me/permissions` con la cookie; no
existe `GET /auth/me`. Solo queda en `localStorage` la pista no sensible `authSessionHint`
(distingue «sesión caducada» de «nunca hubo sesión»). Al cargar la nueva versión se purgan
`authToken` y `authUser` heredados y cada persona inicia sesión una vez.

**`dev-header`:** sin cambios; la cookie se ignora por completo.

**Cabeceras de seguridad (BL-017):** Next envía CSP (con `'unsafe-inline'` en scripts y
estilos, y `'unsafe-eval'`/`ws:` solo en desarrollo), `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima y HSTS
(`max-age=15552000`) solo si `X-Forwarded-Proto` es `https`; sin `x-powered-by`. La API
añade con un middleware propio `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
no-referrer`, CSP `default-src 'none'` (excepto `/docs`) y HSTS si `req.secure`; sin
`x-powered-by`; `set-cookie` y `cookie` se censuran en logs.

## Credenciales por correo (reset e invitación)

Rutas **públicas** (sin `CurrentUserGuard`) para gestionar la contraseña por correo
(`auth/auth-reset.controller.ts`). Usan tokens de un solo uso (`AuthToken`): el valor en
claro viaja solo en el correo y en BD se guarda únicamente su SHA-256
(`auth/auth-token.util.ts`, `auth/auth-token.service.ts`).

- `POST /auth/forgot-password` (`204`): solicita el reestablecimiento. Responde **igual
  exista o no el usuario** (no revela existencia, mismo criterio que el login). Si el
  usuario existe y está activo, emite un token `PASSWORD_RESET` y envía el correo con el
  enlace `APP_WEB_URL/restablecer-contrasena?token=...`.
- `POST /auth/reset-password` (`200`): define una nueva contraseña consumiendo un token.
  Acepta tokens `PASSWORD_RESET` **y** `USER_INVITATION`, por lo que también completa la
  activación de cuenta invitada. En caso de éxito devuelve la **misma sesión que el login**
  (`LoginResponseDto`: `{ accessToken, expiresIn, user }`), reutilizando la emisión de JWT
  del login, de modo que el usuario queda autenticado y entra directo sin volver a iniciar
  sesión. Token inválido/purpose no permitido → `400`; token caducado o ya usado → `410`;
  contraseña por debajo del mínimo → `400`.
- `POST /users/{id}/invite` (`204`): protegido por `JEFE_AREA`. Emite un token
  `USER_INVITATION` y envía la invitación con el enlace `APP_WEB_URL/activar-cuenta?
  token=...`. El reenvío invalida el token previo no usado (queda un único enlace
  vigente).

El token se emite/consume dentro de una transacción junto con la auditoría
(`AuditEvent`, acción `UPDATE` sobre `USER`, sin incluir nunca el token) y la
actualización del `passwordHash`; el envío del correo ocurre **fuera** de la
transacción. Vigencias y mínimo configurables por entorno: `PASSWORD_RESET_TTL`
(default `1h`), `USER_INVITATION_TTL` (default `72h`), `PASSWORD_MIN_LENGTH` (default
`8`).

## El actor (`CurrentActor`)

Resuelto por petición y adjuntado a `request.actor`, se inyecta en los controllers con
`@CurrentActor()`. Contiene (`auth/current-actor.ts`):

- `userId`, `name`, `identifier`.
- `grants`: lista de grants activos, cada uno con `processId`/`processCode`/
  `processName` y `roleCode`/`roleName`.
- `roleCodes`: unión de roles sobre todos los grants activos.
- `scopedProcessIds`: procesos con grant activo (el **alcance**).
- `isJefeArea`: si tiene algún grant `JEFE_AREA`.
- `isLiderProceso`: si tiene algún grant `LIDER_PROCESO`. Abre la **visibilidad de
  lectura** de las solicitudes (ver «Visibilidad de solicitudes» abajo).

Si no hay identidad, o el usuario no existe o está inactivo, el *resolver* devuelve
`null` y el guard responde `401`. Un grant cuyo `role.code` no pertenezca al conjunto
cerrado se ignora (no se propaga un rol no tipado).

## Roles

Catálogo cerrado de 3 perfiles (`auth/role-code.ts`), cuyo `code` gobierna la
autorización:

- `JEFE_AREA`
- `LIDER_PROCESO`
- `INTEGRANTE`

La tabla `roles` espeja estos mismos códigos. No son administrables como las maestras
de negocio.

Además existe el rol de **sistema** `ADMIN`, GLOBAL e independiente del área: no se
concede por grant ni por proceso y no tiene fila en `roles`. Su único origen es la columna
booleana `User.isAdmin`; cuando es `true`, `load-actor.ts` añade `RoleCode.ADMIN` a
`roleCodes` sin ampliar `scopedProcessIds`, de modo que `@Roles(ADMIN)` funciona igual que
con los demás roles. `ADMIN` es ortogonal a `JEFE_AREA`: un admin sin grants no es jefe, y
un jefe sin `isAdmin` no ve la configuración del sistema. El actor expone `isAdmin:
boolean`. Se siembra un administrador inicial (`admin@demo.local`); los demás se gestionan
con `PATCH /admin/users/:id/admin-flag` (no se puede degradar al último admin activo).

## Grants y alcance

Un **grant** asigna a un usuario un rol dentro de un proceso (`Grant`: `userId` ×
`roleId` × `processId`, único). Es el corazón del alcance:

- Al endpoint de grants acceden `ADMIN`, `JEFE_AREA` y `LIDER_PROCESO`
  (`grant.controller.ts`); la jerarquía y el alcance los decide el service.
- **Jerarquía de asignación** (`auth/role-hierarchy.ts`): cada rol tiene un rango
  (`ADMIN=4`, `JEFE_AREA=3`, `LIDER_PROCESO=2`, `INTEGRANTE=1`). Un actor solo concede o
  revoca un grant cuyo rol esté **estrictamente por debajo** de su rango máximo
  (`canAssignRole`). Conceder/revocar un rol igual o superior → `403`. Por eso un
  `roleCode ADMIN` responde `403` (la jerarquía se evalúa **antes** de resolver el rol,
  no `500`).
- **Alcance por proceso**: un actor no-admin solo concede/revoca grants en procesos
  dentro de su `scopedProcessIds`; fuera de alcance → `403`. `ADMIN` está exento
  (alcance global).
- Conceder un grant ya activo → `409`; conceder uno revocado lo reactiva.
- Revocar es *soft* (`active=false`), para conservar trazabilidad.
- Cada alta/baja queda en auditoría (`AuditEvent` con acción `CREATE`/`REVOKE`).

En la **lectura** de grants (`findMany`): `ADMIN` ve todos (`{}`); el resto solo las
filas cuyo proceso esté en `scopedProcessIds`.

## Guards: cómo se protege cada endpoint

Dos guards, en este orden (`auth/current-user.guard.ts`, `auth/roles.guard.ts`):

1. **`CurrentUserGuard`** resuelve el actor y lo adjunta; sin actor válido → `401`. Se
   aplica por módulo, nunca como guard global.
2. **`RolesGuard` + `@Roles(...)`**: exige que el actor tenga al menos uno de los roles
   declarados; si no → `403`. Si no hay `@Roles`, deja pasar (el control fino queda al
   service).

El `@Roles` puede estar a nivel de controller (todo el controller) o por endpoint; el
`RolesGuard` usa `getAllAndOverride`, de modo que el `@Roles` del método **sobreescribe**
al de la clase. Por ejemplo, en `tasks` el ver/estado lo tienen los 3 roles, pero
crear/editar/borrar exige `JEFE_AREA`/`LIDER_PROCESO`. En `approval`, la clase permite
`JEFE_AREA`/`LIDER_PROCESO` (ver cola e histórico), pero `POST /requests/:id/approval`
declara `@Roles(JEFE_AREA)`: la **decisión** de aprobar o devolver es exclusiva del jefe
de área y un líder recibe `403`.
También es exclusiva del jefe de área la gestión de los procesos que intervienen en el plan (GET/PUT /requests/:requestId/plan/participants, @Roles(JEFE_AREA) por handler sobre un controller que admite jefe y líder): el líder, el integrante y ADMIN (ortogonal a JEFE_AREA) reciben 403.

En `assets` la lectura (`GET`) la tienen los 3 roles de área (`JEFE_AREA`,
`LIDER_PROCESO`, `INTEGRANTE`); `ADMIN` no figura en el `@Roles` del controller y por
tanto no accede al módulo de activos. La **escritura** (crear/editar/cambiar estado)
está reservada al jefe de área: los handlers `POST/PATCH/POST :id/status` llevan
`@Roles(JEFE_AREA)` y el service lo reafirma con `requireAssetGovernor` (403 para
líder/integrante/admin). El activo es genérico y compartido; el jefe define qué procesos
pueden verlo/usarlo (tabla puente `AssetProcessVisibility`), y el líder solo **asocia**
activos visibles a sus solicitudes y gestiona los documentos vinculados
(`requireAssetWritable`/`requireProcessManager`, sin cambios).

**Cierre de tareas (BL-036 E3, cambio de reglas).** En `PATCH /tasks/:id/status` el
permiso sobre el estado depende además de la transición: **terminar** una tarea
(`EN_REVISION → TERMINADA`, es decir, aprobarla) y **reabrirla** (`TERMINADA → EN_CURSO`)
solo pueden hacerlo `JEFE_AREA` y `LIDER_PROCESO`; un integrante, aunque sea el
responsable, recibe `403` con un mensaje en español (debe enviarla a revisión y esperar
la aprobación). Enviar a revisión y devolver siguen siendo del responsable, el líder y el
jefe, y enviar a revisión exige avance 100 % y la evidencia que pida la tarea (`409`). La
cola de aprobación `GET /tasks/pending-review` es exclusiva de `JEFE_AREA` y
`LIDER_PROCESO`. La interfaz solo refleja este permiso con los `roleCodes` del actor; el
servidor es quien decide.

## Matriz de módulos (`auth/module-matrix.ts`)

`MODULE_MATRIX` mapea cada clave de módulo a los roles permitidos. Es la **única fuente
de verdad** compartida con el frontend: el menú usa las mismas claves para filtrarse.

| Módulo | Integrante | Líder | Jefe |
| --- | :---: | :---: | :---: |
| `demandOverview` | — | ✓ | ✓ |
| `dashboard` | ✓ | ✓ | ✓ |
| `requests` | ✓ | ✓ | ✓ |
| `triage` | — | ✓ | ✓ |
| `priority` | — | ✓ | ✓ |
| `plan` | — | ✓ | ✓ |
| `portfolio` | ✓ | ✓ | ✓ |
| `project` | ✓ | ✓ | ✓ |
| `assigned` | ✓ | ✓ | ✓ |
| `task` | ✓ | ✓ | ✓ |
| `log` | ✓ | ✓ | ✓ |
| `meeting` | ✓ | ✓ | ✓ |
| `asset` | ✓ | ✓ | ✓ |
| `docs` | ✓ | ✓ | ✓ |
| `capacity` | ✓ | ✓ | ✓ |
| `admin` | — | — | ✓ |
| `frameworks` | ✓ | ✓ | ✓ |
| `review` | — | ✓ | ✓ |
| `audit` | ✓ (alcance propio) | ✓ | ✓ |
| `team` | — | — | ✓ |
| `permissions` | ✓ | ✓ | ✓ |
| `systemSettings` | — | — | — |
| `areas` | — | — | ✓ |
| `processesAdmin` | — | — | ✓ |
| `requesters` | — | — | ✓ |
| `aiSettings` | — | — | — |
| `recurring` | ✓ | ✓ | ✓ |

> `systemSettings` (configuración del sistema: SMTP y administradores), `areas`
> (gestión de áreas organizativas) y `aiSettings` (configuración de los agentes de
> IA) son exclusivos del rol de **sistema** `ADMIN`: ningún rol de área los ve.
> `areas` (gestión de áreas organizativas), `processesAdmin` (administración de procesos) y `requesters` (maestro de solicitantes) los ven `ADMIN` y `JEFE_AREA`.
> `MODULE_MATRIX` tiene por tanto 26 claves; un `JEFE_AREA` ve todas menos
> `systemSettings` y `aiSettings`.
>
> `recurring` (actividades recurrentes) lo ven los tres roles de area para la
> operacion (ver "que me toca" y completar ocurrencias); la gestion de definiciones
> la acota el service a `JEFE_AREA`/`ADMIN`.

`GET /me/permissions` también devuelve `roleCodes` (los códigos de rol efectivos del
actor, incluido `ADMIN` si aplica); el frontend los usa para ofrecer en «Equipo y
permisos» únicamente los roles que el actor puede asignar según la jerarquía, pero el
backend sigue siendo la autoridad (`POST /grants` responde `403` ante un rol igual o
superior).

`allowedModulesFor(roles)` deriva la unión de módulos visibles para el actor; un módulo
se muestra si alguno de sus roles lo permite. `GET /me/permissions` devuelve rol,
alcance y módulos permitidos; el frontend usa `allowedModules` para esconder ítems del
menú, pero el servidor sigue validando cada operación.

## Resumen de cómo se decide el acceso

1. El guard resuelve el actor (header según `AUTH_MODE`) → `401` si no es válido.
2. `@Roles` + `RolesGuard` filtran por rol → `403` si falta el rol.
3. El service aplica el alcance por proceso → `404` para filas fuera de alcance.
4. El service aplica reglas finas por rol/estado → `400`/`409` cuando la operación no
   procede (p. ej. el integrante solo opera su propia tarea; registrar una validación
   no aprueba un gate).

## Visibilidad de solicitudes

El alcance de **lectura** de las solicitudes tiene **una sola definición**:
`requestScopeWhere` / `RequestScopeService` (`apps/api/src/modules/request/request-scope.service.ts`,
exportado por `RequestModule`). La usan Solicitudes, Triage, Priorización, Aprobaciones
(cola `pending-approval`), Planificación, **Portafolio** (`GET /portfolio`) y el **Panel del
área** (`/area-control/*`, incluidos sus conteos de tareas), de modo que las cifras de todas
las pantallas coinciden para el mismo usuario. Los filtros de cada pantalla (proceso,
estado, banda) solo **intersectan** este alcance: nunca lo amplían.
- `ADMIN` conserva su comportamiento: no amplía este alcance (sin grants solo ve lo que
  creó).
- Excepciones deliberadas (flujos de escritura de jefatura): cierre de proyectos
  (`closure`) y controles de gobierno (`governance`) siguen limitados al jefe de área o a
  los procesos con grant.

> **Cambio de visibilidad.** Antes el Portafolio y el Panel restringían al líder y al
> integrante a `mainProcessId ∈ scopedProcessIds`. Ahora **amplían** lo que ven: el
> **líder** ve en Portafolio y Panel todas las solicitudes (también las de otros procesos y
> las sin proceso, como ya ocurría en Solicitudes) y el **integrante** ve también las que
> creó aunque no tengan proceso. Los conteos del Panel (p. ej. «Solicitudes en alcance»,
> «pendientes de triage») pasan a coincidir con los de Solicitudes y Triage.

Regla:

- `JEFE_AREA` **o** `LIDER_PROCESO`: ven **todas** las solicitudes (sin filtro por
  `mainProcessId`), incluidas las que **aún no tienen proceso principal** (recién
  registradas, antes del triage). Así cualquiera de ellos puede tomarlas y triarlas.
- `INTEGRANTE` puro (sin ninguno de esos roles): las de sus `scopedProcessIds`
  **y siempre las que él mismo registró** (`createdByUserId = su usuario`). El
  `scopeWhere` aplica un `OR` entre `mainProcessId in scopedProcessIds` y
  `createdByUserId`, de modo que el creador ve su solicitud aunque **aún no tenga
  proceso principal** (`mainProcessId = null`, antes del triage). Una solicitud
  sin proceso creada por **otro** sigue sin ser visible para él. Al fijarse el
  proceso en el triage, el alcance pasa a comportarse como el del resto de
  solicitudes.

La apertura al líder es **solo de lectura/visibilidad**. Las escrituras siguen protegidas
por los gates de cada etapa (`requireInScope`, que reutiliza el mismo `scopeWhere`): por
diseño eso habilita al líder a hacer triage y avanzar el flujo sobre cualquier solicitud
que ahora ve, pero las decisiones con `@Roles` más estrictos (p. ej. aprobar, exclusivo de
`JEFE_AREA`) no cambian. `GET /my-work` («mis tareas») no se amplía: sigue mostrando solo
las tareas del propio usuario.

Las lecturas por ID visible (`GET /codes/:code`, `GET /requests/by-code/:code`, `GET /plan-phases/by-code/:code`, junto con `GET /tasks/by-code/:code`) usan esa misma definición (`requestScopeWhere`) y los roles `JEFE_AREA`, `LIDER_PROCESO` e `INTEGRANTE`: un código inexistente o fuera de alcance responde `404` con el mismo mensaje, sin revelar que existe.

## Bitácora y reporte semanal: escritura y revisión

- **Escribir** (crear, editar, enviar, retirar el envío, eliminar) un diario o un semanal es solo del **autor**; el jefe de área y el líder ya no editan registros ajenos.
- **Leer**: el integrante ve lo suyo, el líder lo de sus procesos y el jefe todo.
- **Qué puede imputar cada rol en una actividad planificada** (lo valida la API, no solo la interfaz): el **integrante** solo tareas donde es responsable y sus proyectos activos; el **líder** sus tareas y, en los procesos que lidera, las de los planes de esos procesos; el **jefe de área** sus tareas y las de todo su alcance (la interfaz propone «Mis proyectos» y permite «Todos del área»). En todos los roles el proyecto debe estar activo (o cerrado dentro de la ventana de gracia) y pertenecer al proceso del diario. Detalle en `modulos-backend.md`.
- **Revisar o devolver** (`/review`, `/return`): jefe de área o líder del proceso del registro, nunca el propio autor (403); solo desde `ENVIADO`. `REVISADO` es terminal. Devolver exige un motivo de 10 a 1000 caracteres y avisa al autor.
- **Sugerencias del día** (`/worklog/daily/:id/suggestions*`): solo el **autor** del diario las consulta y gestiona (403 «Solo el autor del diario puede gestionar sus sugerencias.» a cualquier otro rol, incluido el jefe); aceptar, descartar y restaurar solo en `BORRADOR` (409). Las tareas sugeridas respetan la misma regla de imputación por rol.

## Reuniones y compromisos: seguimiento

- **Duración de un acta cerrada**: el PATCH que solo completa `durationMinutes` lo pueden hacer el responsable de la reunión, el líder del proceso o el jefe de área (403 a otros). Cualquier otro cambio sobre un acta cerrada sigue en 409.
- **Compromisos abiertos de mis reuniones** (`GET /meetings/commitments-open`): cada persona ve solo los compromisos de las reuniones donde es **responsable**; no amplía la visibilidad de nadie (el seguimiento general sigue en `GET /commitments`, con su alcance por rol).
- **Compromisos de Mi trabajo** (`GET /commitments/my-work`): los del propio actor (asignado, o responsable si no hay asignado) dentro de su alcance; completarlos usa la transición existente.
