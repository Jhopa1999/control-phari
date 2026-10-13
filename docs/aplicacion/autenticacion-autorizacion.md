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

## Credenciales por correo (reset e invitación)

Rutas **públicas** (sin `CurrentUserGuard`) para gestionar la contraseña por correo
(`auth/auth-reset.controller.ts`). Usan tokens de un solo uso (`AuthToken`): el valor en
claro viaja solo en el correo y en BD se guarda únicamente su SHA-256
(`auth/auth-token.util.ts`, `auth/auth-token.service.ts`).

- `POST /auth/forgot-password` (`204`): solicita el reestablecimiento. Responde **igual
  exista o no el usuario** (no revela existencia, mismo criterio que el login). Si el
  usuario existe y está activo, emite un token `PASSWORD_RESET` y envía el correo con el
  enlace `APP_WEB_URL/restablecer-contrasena?token=...`.
- `POST /auth/reset-password` (`204`): define una nueva contraseña consumiendo un token.
  Acepta tokens `PASSWORD_RESET` **y** `USER_INVITATION`, por lo que también completa la
  activación de cuenta invitada. Token inválido/purpose no permitido → `400`; token
  caducado o ya usado → `410`; contraseña por debajo del mínimo → `400`.
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

## Grants y alcance

Un **grant** asigna a un usuario un rol dentro de un proceso (`Grant`: `userId` ×
`roleId` × `processId`, único). Es el corazón del alcance:

- Solo `JEFE_AREA` concede/revoca grants (`grant.controller.ts`), y la lectura se
  filtra al alcance del jefe (procesos donde él tiene grant).
- Conceder un grant ya activo → `409`; conceder uno revocado lo reactiva.
- Revocar es *soft* (`active=false`), para conservar trazabilidad.
- Cada alta/baja queda en auditoría (`AuditEvent` con acción `CREATE`/`REVOKE`).

El **alcance por proceso** se aplica dentro de cada service: un `JEFE_AREA` ve todo
(`{}`); el resto solo las filas cuyo proceso esté en `scopedProcessIds`. Una fila fuera
de alcance responde `404` (no revela su existencia).

## Guards: cómo se protege cada endpoint

Dos guards, en este orden (`auth/current-user.guard.ts`, `auth/roles.guard.ts`):

1. **`CurrentUserGuard`** resuelve el actor y lo adjunta; sin actor válido → `401`. Se
   aplica por módulo, nunca como guard global.
2. **`RolesGuard` + `@Roles(...)`**: exige que el actor tenga al menos uno de los roles
   declarados; si no → `403`. Si no hay `@Roles`, deja pasar (el control fino queda al
   service).

El `@Roles` puede estar a nivel de controller (todo el controller) o por endpoint. Por
ejemplo, en `tasks` el ver/estado lo tienen los 3 roles, pero crear/editar/borrar exige
`JEFE_AREA`/`LIDER_PROCESO`.

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
