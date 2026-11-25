# Módulos del backend

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

El backend (NestJS) es un monolito modular en `apps/api/src/modules/`. Cada módulo
agrupa controllers (reciben HTTP y delegan) y services (lógica de negocio, validación,
autorización de alcance y acceso a datos vía Prisma).

Convenciones transversales que aplican a casi todos los endpoints:

- `CurrentUserGuard` resuelve el actor y adjunta su contexto; sin actor válido → `401`.
- `RolesGuard` + `@Roles(...)` exigen al menos uno de los roles declarados; si no →
  `403`. Ver [autenticación y autorización](./autenticacion-autorizacion.md).
- El **alcance por proceso** (qué filas ve/toca cada actor) se aplica dentro del
  service; una fila fuera de alcance responde `404` (no revela su existencia).
- Las rutas de escritura validan la entrada con DTOs.

Las descripciones de endpoints provienen de los `@ApiOperation({ summary })` de cada
`*.controller.ts`.

### Listados paginados (oleada 3, PR-B)

Patrón único en `apps/api/src/common/pagination/` (`PaginationQueryDto`,
`resolvePage`, `setPaginationHeaders`), aplicado a `GET /requests`, `GET /portfolio`,
`GET /assets` y `GET /documents`:

- Parámetros opcionales: `page` (desde 1), `pageSize` (1 a 100; 25 si solo llega
  `page`), `q` (búsqueda sin distinguir mayúsculas, máximo 200 caracteres; los
  campos que cubre se indican en cada listado), `sort` (lista blanca por listado;
  otro valor → `400`) y `dir` (`asc`/`desc`). El orden desempata siempre por `id`,
  así las páginas son estables.
- La respuesta **sigue siendo un arreglo** (compatible con el MCP, el asistente y
  los clientes existentes). La paginación viaja en cabeceras, expuestas por CORS:
  `X-Total-Count` (total tras alcance, filtros y `q`), `X-Page`, `X-Page-Size` y
  `X-Truncated`.
- **Sin `page` ni `pageSize`** se devuelve el listado completo como antes, con un
  **tope de 1000 filas** (`LIST_HARD_CAP`); si el alcance filtrado tiene más,
  `X-Truncated: true`. Los selectores de la web que piden «todo» quedan bajo ese tope.
- El total se cuenta con el mismo `where` que la página (alcance incluido): un
  filtro nunca amplía lo que el actor ve. Solicitudes y Portafolio comparten la
  consulta (`request/request-list-query.ts`) sobre el alcance único
  `requestScopeWhere` (`RequestScopeService`).
- Pendientes con el mismo patrón (BL-081): bandeja del Plan, Capacidad, Reporte
  semanal, Actas/compromisos y Controles.

---

## auth — Identidad y acceso

Resuelve el actor por petición y expone sus permisos. Soporta dos modos configurables
por `AUTH_MODE`: `dev-header` (header `X-Actor-Id`) y `jwt` (login real).

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/auth/login` | Autentica por `identifier` y contraseña, devuelve un JWT y emite la cookie de sesión `portal_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` según `COOKIE_SECURE`, `Cache-Control: no-store`) (ruta pública). Límite de intentos (D1): con 5 fallos en 15 minutos por identificador o 30 por IP responde `429` con mensaje en español y cabecera `Retry-After` (segundos), aunque la contraseña sea correcta; cada fallo se audita como `LOGIN_FAILED`. |
| POST | `/auth/logout` | Cierra la sesión del navegador borrando la cookie; `204`, idempotente; con la cookie presente exige la cabecera `X-Portal-Csrf: 1` (`403` si falta). No revoca Bearer (ruta pública; excluido del MCP). |
| POST | `/auth/forgot-password` | Solicita el reestablecimiento de contraseña; responde `204` exista o no el usuario (ruta pública). Desde la 4.ª solicitud en una hora por identificador no emite token ni correo, sigue respondiendo `204` y audita una vez por ventana `PASSWORD_RESET_THROTTLED`. |
| POST | `/auth/reset-password` | Define una nueva contraseña consumiendo un token de reset o de activación y devuelve la sesión del login para entrar directo y emite también la cookie de sesión (`200` con `LoginResponseDto`; `400` token inválido o contraseña que no cumple la política, sin consumir el token; `410` token caducado/usado). La política exige longitud mínima vigente (maestra `AUTH_PARAM`, `PASSWORD_MIN_LENGTH`, 10 por defecto) y no ser una contraseña común (maestra `PASSWORD_COMMON`). |
| GET | `/auth/password-policy` | Longitud mínima vigente de la contraseña (`{ minLength }`, `PasswordPolicyResponseDto`). Pública (la usan activar cuenta y restablecer contraseña); no expone la lista de contraseñas comunes. Excluido del MCP. |
| GET | `/dev/actors` | Lista usuarios activos para el selector de desarrollo (solo con `AUTH_MODE=dev-header`; si no, `404`). |
| GET | `/me/permissions` | Permisos del usuario actual: rol, alcance, módulos permitidos, `mustChangePassword` (cambio de contraseña obligatorio pendiente) y `capabilities`: las acciones del portal (clave, etiqueta, descripción, grupo, alcance `PROCESS`/`AREA`/`SYSTEM`, `allowed` y `allowedRoles`) con todas las del catálogo en orden fijo, para explicar qué puede hacer la persona y a quién pedir lo que no. Se deriva de `capability-matrix.ts`. Responde también con el cambio pendiente. |
| POST | `/auth/change-password` | Cambia la contraseña de la sesión actual (Bearer o cookie con `X-Portal-Csrf: 1`). Exige la contraseña actual, que la nueva sea distinta y que cumpla la política de contraseñas (longitud mínima vigente (maestra `AUTH_PARAM`, `PASSWORD_MIN_LENGTH`, 10 por defecto) y no ser una contraseña común (maestra `PASSWORD_COMMON`)). Limpia `mustChangePassword` y audita `PASSWORD_CHANGED`. `204`; `400` actual incorrecta, igual, corta («La contraseña debe tener al menos {N} caracteres.») o común («Esa contraseña es muy común y fácil de adivinar. Elige otra.»); un rechazo por política no suma al límite de intentos ni limpia `mustChangePassword`; `429` con `Retry-After` (mismo límite que el login). Excluido del MCP. |

Cambio de contraseña obligatorio: con `users.must_change_password = true` y en modo
`jwt`, `CurrentUserGuard` responde `403` con `code: "PASSWORD_CHANGE_REQUIRED"` en toda
ruta autenticada salvo las marcadas con `@AllowPasswordChangePending()`: solo
`GET /me/permissions` y `POST /auth/change-password` (lista cerrada que fija
`allow-password-change-pending.spec.ts`). Las rutas públicas (`login`, `logout`,
`forgot-password`, `reset-password`, `health`) no cambian. Aplica igual a cookie y
Bearer, y a las sesiones ya abiertas desde su siguiente petición. En `dev-header` se
ignora. `reset-password` también limpia el indicador y, si la persona estaba marcada,
rechaza con `400` una contraseña igual a la actual sin consumir el token.

Transversal a la API (`app.config.ts`, `security/`): el `CurrentUserGuard` acepta
`Authorization: Bearer` o la cookie `portal_session` (con cookie, las escrituras exigen
`X-Portal-Csrf: 1`); CORS con `credentials: true` solo para `CORS_ORIGINS` explícitos
(nunca `*`); `trust proxy` para que `req.secure` refleje `X-Forwarded-Proto`; middleware
propio de cabeceras de seguridad (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
CSP `default-src 'none'` salvo `/docs`, HSTS si es https) y sin `x-powered-by`. El
asistente reenvía al MCP el `Bearer` normalizado por el guard. Detalle en
`autenticacion-autorizacion.md`.

Reglas relevantes: el login real vive solo en modo `jwt`; el selector dev solo existe
en modo `dev-header`. La lógica de carga del actor y sus grants es común a ambos modos
(no se duplica la autorización). `forgot-password`/`reset-password` usan tokens de un
solo uso (`AuthToken`): el valor en claro solo viaja en el correo y en BD se guarda su
SHA-256; el envío del correo ocurre fuera de la transacción (ver
`autenticacion-autorizacion.md`).

Política de contraseñas (D20, `auth/password-policy.service.ts` y `auth/password-policy.ts`):
se aplica en `change-password` y `reset-password` (restablecer y activar cuenta; `POST /users`
no recibe contraseña). Mínimo en `AUTH_PARAM`/`PASSWORD_MIN_LENGTH` (valor en la etiqueta,
entero de 8 a 64; ausente, inactivo o fuera de rango usa 10). Lista de comunes en la maestra
`PASSWORD_COMMON` (un ítem por contraseña; `code` es la clave en mayúsculas sin símbolos):
se compara la contraseña en minúsculas, sin tildes ni símbolos, y también sin los dígitos
finales si la base tiene al menos 4 caracteres (`Password2026*` cae por `password`). Sin ítems
activos o si la lectura falla se usa la lista del código. Caché de 30 s. Solo se evalúa al
fijar una contraseña: el login no la consulta y las contraseñas existentes siguen valiendo.
La variable de entorno `PASSWORD_MIN_LENGTH` ya no se lee.

Límite de intentos (`auth/auth-throttle.service.ts`, `auth/auth-attempt-window.ts`):
ventana deslizante **en memoria del proceso** de la API, contada por identificador
normalizado (minúsculas, sin espacios) y por IP (`req.ip`, con `trust proxy` detrás de
nginx). Los umbrales se leen de la maestra `AUTH_PARAM` (valor en la etiqueta, caché de
30 s): `LOGIN_MAX_ATTEMPTS` (5), `LOGIN_WINDOW_MINUTES` (15), `LOGIN_MAX_PER_IP` (30),
`FORGOT_MAX_ATTEMPTS` (3) y `FORGOT_WINDOW_MINUTES` (60); un valor ausente, inactivo o
inválido usa el de entre paréntesis. Un login correcto borra los fallos del
identificador, no los de la IP. Límite conocido: los contadores se pierden al reiniciar
la API y no se comparten entre réplicas; `compose.prod.yaml` corre un único contenedor
`api`, así que hoy el conteo es exacto. Si se escala a varias réplicas habrá que mover
el conteo a la BD. Los fallos de un identificador inexistente se auditan con una
huella (`identificador:<12 hex de SHA-256>`), nunca con el texto escrito; si la
auditoría falla, el login responde igual.

## user — Identidades funcionales

Administra las identidades funcionales de las personas del área. Solo `JEFE_AREA`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/users` | Lista todos los usuarios (ADMIN, JEFE_AREA y LIDER_PROCESO). Devuelve solo `id`, `identifier`, `name`, `active`, `mustChangePassword`, `createdAt` y `updatedAt` (`UserResponseDto`); nunca credenciales. |
| GET | `/users/:id` | Obtiene un usuario con sus grants (mismos campos que el listado más `grants`). |
| POST | `/users` | Crea una identidad funcional (solo JEFE_AREA). |
| PATCH | `/users/:id` | Edita `name`/`active` (solo JEFE_AREA). |
| POST | `/users/:id/invite` | Emite y envía la invitación de activación; el reenvío invalida el enlace previo (solo JEFE_AREA; `204`, `404` si no existe). |
| POST | `/users/force-password-change` | Exige el cambio de contraseña en el próximo uso (solo JEFE_AREA; líder y admin `403`). Cuerpo: exactamente uno de `all: true` o `userIds` (1 a 500); `excludeUserIds` solo con `all`; `enabled: false` retira la exigencia. `all` marca a todos los usuarios con contraseña, también inactivos, excepto a quien ejecuta; por `userIds` quien ejecuta puede incluirse. Todo o nada: un id inexistente da `404` sin cambios. Idempotente (`skipped`). Un evento `PASSWORD_CHANGE_REQUIRED` o `PASSWORD_CHANGE_CLEARED` por usuario cambiado, en la misma transacción. `200` `{ updated, skipped, excludedSelf }`. Excluido del MCP. |

## grant — Concesión de permisos (rol × proceso)

Asigna/revoca a un usuario un rol dentro de un proceso. Es el corazón del alcance.
Solo `JEFE_AREA`; la lectura se filtra al alcance del jefe.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/grants` | Lista grants del alcance del jefe (solo JEFE_AREA). |
| POST | `/grants` | Concede un grant (crea o reactiva uno revocado). |
| DELETE | `/grants/:id` | Revoca un grant (borrado lógico `active=false`). |

Reglas: conceder un grant ya activo → `409`; revocar es *soft* (conserva trazabilidad)
y queda registrado en auditoría con acción `CREATE`/`REVOKE`.

## area — Áreas organizativas

Administra las áreas (p. ej. Analítica) que agrupan procesos. Lectura para cualquier
actor; escritura solo `ADMIN` (rol de sistema).

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/areas` | Lista áreas (filtro opcional `active`). Cada área trae `processCount` (**procesos activos**; los inactivos no cuentan) y `requesterCount` (solicitantes activos), contados con `count` filtrado. |
| GET | `/areas/:id` | Obtiene un área por id (`404` si no existe). |
| POST | `/areas` | Crea un área (ADMIN o JEFE_AREA). |
| PATCH | `/areas/:id` | Edita `name`/`active`/`sortOrder` (ADMIN o JEFE_AREA). Desactivar un área activa con procesos activos responde `409` «No se puede desactivar el área: tiene N procesos activos.» (sin ids). |

Reglas: `code` se normaliza a MAYÚSCULAS y es único (`409` si se repite al crear); el **Formato del código (oleada 3, PR-E):** solo letras mayúsculas, números y guion bajo (`^[A-Z0-9_]+$`), máximo 40 caracteres; la API normaliza (recorta y pasa a mayúsculas) antes de validar y responde `400` en español («El código solo admite letras mayúsculas, números y guion bajo.», «El código admite como máximo 40 caracteres.»). Solo se valida al **crear**: los DTO de edición no reciben `code`, así que los registros existentes no se revalidan. El `409` por código repetido dice «Ya existe un área con ese código.».
`code` no es editable (enviarlo en el PATCH → `400`). Cada alta/edición se audita como
`AREA` (sin proceso de alcance).

## process — Procesos del área

Administra los procesos (BI, Integraciones, IA y la coordinación FMAA), cada uno
asociado a un área. Lectura para todos (filtrada por alcance a quien no es jefe ni
admin; `ADMIN` y `JEFE_AREA` ven todos); escritura para `ADMIN` o `JEFE_AREA`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/processes` | Lista procesos (jefe/admin: todos; no-jefe: solo su alcance). |
| GET | `/processes/:id` | Obtiene un proceso por id (`404` fuera de alcance). |
| POST | `/processes` | Crea un proceso (ADMIN o JEFE_AREA). |
| PATCH | `/processes/:id` | Edita `name`/`framework`/`active`/`sortOrder` (ADMIN o JEFE_AREA). Al desactivar (`active=false`) un proceso activo con trabajo en curso (asignaciones de capacidad del mes actual en adelante, solicitudes no cerradas/rechazadas/retiradas o tareas no terminadas) la API responde `409` con `requiresConfirmation`, `activeAssignments`, `openRequests` y `openTasks`; se reintenta con `confirmDeactivation: true` (campo opcional del DTO). Sin trabajo en curso desactiva sin confirmar. Un `count` por tabla, sin cargar filas. |

Reglas: `code` es único (`409` si se repite al crear); al crear, `areaId` es requerido El `code` sigue el mismo formato que el de las áreas (mayúsculas, números y guion bajo, máximo 40; `400` en español; solo al crear).
(UUID) y debe apuntar a un área existente (`404` si no existe). El `areaId` no se edita
en el PATCH.

## requester — Maestro de solicitantes
Administra los solicitantes de las solicitudes; cada uno pertenece obligatoriamente a un área activa del maestro de áreas. Lectura para cualquier actor autenticado; escritura ADMIN y JEFE_AREA.
| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requesters` | Lista solicitantes (filtros opcionales `active`, `areaId`). |
| GET | `/requesters/:id` | Consulta un solicitante (`404` si no existe). |
| POST | `/requesters` | Crea un solicitante (`name` + `areaId` obligatorios; `400` si el área no existe o está inactiva; `409` «Ya existe un solicitante con ese nombre en esa área.»: la unicidad es por nombre normalizado **y área**, los inactivos cuentan). |
| PATCH | `/requesters/:id` | Edita nombre/área o activa/inactiva el solicitante. Si cambia el nombre o el área se vuelve a comprobar la unicidad con los valores resultantes (`409` si mover a otra área choca con un homónimo). |
Reglas: el nombre es único sin distinguir mayúsculas ni tildes (`409` si se repite). Cada alta/edición se audita como `REQUESTER`. En `POST/PATCH /requests` el campo `requesterId` fija el solicitante y el backend copia su nombre y su área a `requesterName`/`requesterArea`; las solicitudes históricas conservan su texto original.

## catalog — Maestras genéricas (funcionalidad base)

`CatalogItem` es la maestra genérica reutilizable de la plantilla (prioridades,
estados, tipos, etc.). La aplicación la reutiliza para validar códigos de catálogo en
sus flujos. Lectura con actor; escritura solo `JEFE_AREA`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/catalog-items` | Crea un elemento de catálogo (solo los roles del módulo `admin` de `MODULE_MATRIX`, hoy JEFE_AREA; integrante, líder y administrador → `403`). |
| GET | `/catalog-items` | Lista elementos, con filtros opcionales (`catalog`, `active`). |
| GET | `/catalog-items/:id` | Obtiene un elemento por id. |
| PATCH | `/catalog-items/:id` | Actualiza `label`/`description`/`active`/`sortOrder` (mismos roles que el alta: módulo `admin`, hoy JEFE_AREA). `description` (máx. 500, opcional; vacío la borra) también se acepta al crear. |

## request — Solicitud y flujo de demanda

Núcleo del flujo de demanda. Reúne la ficha de la solicitud y los subflujos de triage,
priorización y aprobación. **Visibilidad:** `JEFE_AREA` y `LIDER_PROCESO` ven **todas**
las solicitudes (sin filtro de proceso); un `INTEGRANTE` puro las ve filtradas por sus
procesos con grant activo **y siempre las que él mismo registró** (`createdByUserId`),
de modo que el creador conserva la visibilidad de su solicitud aunque aún no tenga
proceso principal. La apertura al líder es solo de lectura; las escrituras siguen
protegidas por los gates de cada etapa (que usan el mismo alcance), de modo que el líder
puede hacer triage y avanzar el flujo sobre cualquier solicitud que ahora ve.
Triage/priorización exigen `JEFE_AREA` o `LIDER_PROCESO`. En aprobación, la cola y el
histórico los ven `JEFE_AREA` y `LIDER_PROCESO`, pero la **decisión** de aprobar o
devolver es exclusiva de `JEFE_AREA`.

### Solicitud (`request.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests` | Lista solicitudes dentro del alcance del actor con el [patrón de listado paginado](#listados-paginados-oleada-3-pr-b). Filtros `state`, `mainProcessId` (UUID o `SIN_PROCESO`) y `band` (`P1`..`P4`, `SIN_PRIORIZAR`), cada uno con uno o varios valores (`?state=A&state=B`; un valor único se comporta como antes; máximo 50); `q` busca en código, título y nombre del solicitante; `sort` ∈ `registeredAt` (por defecto, descendente), `code` (por número), `title`, `state` (orden del flujo) y `score` (sin evaluación al final). Cada fila añade `mainProcessCode`, `mainProcessName` y `assetName` (BL-039; `null` si no hay), resueltos en lote. |
| GET | `/requests/:id` | Obtiene una solicitud por id (`404` fuera de alcance). Además de `currentTriageDecision`, expone `currentTriageDecidedAt` y `currentTriageReason` (solo el motivo de la última decisión `DEVOLVER` o `RECHAZAR`; nunca notas ni dependencias del triage): es lo que la ficha muestra al solicitante, que no tiene acceso a `GET /requests/:id/triage`. La respuesta incluye `code`, el **ID visible** automático y de solo lectura (`PRY-0012`; ver «IDs visibles» en `modelo-datos.md`). `POST`/`PATCH` no aceptan `code` ni `number` (`400`). |
| GET | `/requests/by-code/:code` | Detalle de una solicitud a partir de su ID visible (`PRY-0012`). Mismo alcance y respuesta (`RequestResponseDto`) que `GET /requests/:id`; `400` si el código no es de solicitud, `404` si no existe o está fuera de alcance. Declarado antes de `:id`. Tool MCP `request.get_by_code`. |
| GET | `/plan-phases/by-code/:code` | Detalle de una fase a partir de su ID visible (`PRY-0012-F2`). Devuelve `PhaseByCodeDto`: los datos de la fase más `planId`, `requestId`, `requestCode`, `requestTitle` y `requestStatus`. Mismo alcance que la solicitud (`400` si el código no es de fase, `404` si no existe o está fuera de alcance). Tool MCP `phase.get_by_code`. |
| POST | `/requests` | Crea una solicitud (estado `REGISTRADA`). **Se registra SIN proceso principal** (`mainProcessId` opcional, nace `null`) y **sin participantes**: el proceso principal y los procesos que intervienen se deciden en el triage. Si por compatibilidad llega `mainProcessId`, se valida (existe, activo y en alcance) y se materializa como único participante (BR-001). |
| PATCH | `/requests/:id` | Edita la ficha (no el estado ni el proceso); conserva fechas iniciales. No toca los participantes. **Quién edita según el estado (oleada 2, D4):** en `REGISTRADA` y `DEVUELTA`, quien la registró (`createdByUserId`), el líder del proceso principal o el jefe; en `EN_TRIAGE`, `BACKLOG_PRIORIZADO`, `RECHAZADA` y `RETIRADA`, solo líder o jefe; desde `COMPROMETIDA` hasta `OPERATIVA`, solo líder o jefe y con `changeJustification` obligatoria (mínimo 10 caracteres tras recortar; `400` «La justificación del cambio es obligatoria desde que la solicitud está comprometida.» o «La justificación debe tener al menos 10 caracteres.»). Quien no puede recibe `403` en español. «Líder» es el que tiene grant `LIDER_PROCESO` en el proceso principal; si la solicitud aún no tiene proceso, cualquier líder. `CERRADA` sigue respondiendo `409`. Editar una solicitud `DEVUELTA` no cambia su estado. |
| POST | `/requests/:id/resubmit` | **Reenviar a triage (oleada 2, D3):** `DEVUELTA → REGISTRADA` (`409` «Solo se puede reenviar a triage una solicitud devuelta.» desde otro estado). Lo hacen quien la registró, el líder del proceso principal o el jefe (`403` para los demás). Cuerpo opcional con los mismos campos que el `PATCH` para corregir la ficha en el mismo paso. Audita `UPDATE REQUEST` con el estado antes y después, **no toca las filas de `triages`** (el historial se conserva y el siguiente triage añade una fila nueva) y avisa a los jefes de área del proceso con `REQUEST_RESUBMITTED` (a todos los jefes activos si la solicitud no tiene proceso). Tool MCP `request.resubmit`. |
| DELETE | `/requests/:id` | Eliminación lógica (`deletedAt`/`deletedByUserId`, auditada como `DELETE`). Solo `JEFE_AREA`/`LIDER_PROCESO` dentro de su alcance; `409` si la solicitud está en ejecución o cerrada. Las solicitudes eliminadas dejan de aparecer en listados y consultas. |

### Triage (`triage/triage.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/triage` | Historial de triages de la solicitud (de la más reciente a la más antigua; tras un reenvío hay varias filas) y candidatos a responsable principal. Acepta `mainProcessId` (uuid, opcional) para **previsualizar** los candidatos de un proceso aún no persistido: cuando la solicitud no tiene proceso principal, el triage lo elige en el mismo formulario y el desplegable de responsable se recarga con los elegibles de ese proceso; si se omite, los candidatos se derivan del proceso ya persistido. |
| POST | `/requests/:id/triage` | Registra el triage (solo desde `REGISTRADA`; segundo POST → `409`). Una solicitud devuelta y reenviada vuelve a `REGISTRADA` y admite un triage nuevo, que se añade al historial. **Fija el proceso principal de la solicitud**: acepta `mainProcessId` (uuid, opcional); si la solicitud aún no tiene proceso, es **obligatorio para `CONTINUAR`** (si falta → `400` «Para continuar debes elegir el proceso principal de la solicitud.»), mientras que `DEVOLVER`/`RECHAZAR` no lo exigen. El proceso elegido debe existir y estar activo (`400` si no); no se filtra por alcance. Acepta `participantProcessIds` (uuid[], opcional): los procesos que intervienen además del principal; cuando se fija proceso o llegan participantes reconcilia `RequestParticipant` (borrar y recrear) preservando siempre el principal efectivo (BR-001). El responsable principal elegible depende del proceso principal fijado en el triage. **`routeCode` está DEPRECADO** (la «Ruta» era redundante con el proceso principal): ya no se captura ni se exige; si un cliente antiguo (p. ej. MCP) lo envía se sigue validando contra la maestra `TRIAGE_ROUTE` y se guarda, y si no llega queda `null`. La respuesta mantiene `routeCode` solo como dato histórico de triages antiguos. **La coordinación multiproceso (`kind = COORDINATION`, p. ej. FMAA) no puede fijarse como proceso principal** (`400` «La coordinación multiproceso no puede ser el proceso principal…»): la coordinación entre procesos se expresa marcando `participantProcessIds`. La regla solo aplica al fijar el proceso; una solicitud que ya tiene FMAA como principal sigue funcionando. **`DEVOLVER` y `RECHAZAR` exigen `reason` (motivo, mínimo 10 caracteres tras recortar; `400` si falta o es corto)**: se guarda en `triages.decision_reason`, sale como `reason` en la respuesta, se muestra en la ficha y avisa al solicitante (quien registró la solicitud) con una notificación `REQUEST_RETURNED` o `REQUEST_REJECTED`. Con `CONTINUAR` no se guarda. |
| POST | `/requests/:id/asset` | Asocia un activo base **existente** (`assetId`, requerido); solo en estados tempranos (`409` fuera). **Orden obligatorio triage → activo**: el activo se habilita contra el proceso principal, así que si la solicitud aún no tiene proceso principal fijado responde `409` «Fija el proceso principal en el triage antes de asociar el activo.» (sin llegar a consultar el activo); con proceso ya fijado, si el activo no está habilitado para él responde `409` «El activo no está habilitado para el proceso de la solicitud.». **Estado del activo (D8):** solo un activo `ACTIVO` admite asociaciones **nuevas**; uno en `BORRADOR` responde `409` «El activo está en borrador; pide al jefe de área que lo active antes de asociarlo.» y uno `RETIRADO`, `409` «El activo está retirado; recupéralo en Activos o elige otro antes de asociarlo.». La asociación ya hecha se conserva: reenviar el mismo `assetId` que la solicitud ya tiene no falla aunque el activo siga en borrador o retirado, y las solicitudes existentes no se modifican. El listado y la ficha del activo siguen visibles para todo el alcance. |

El triage **no crea activos**: solo asocia uno existente que esté visible para el actor.
La creación de activos vive en el módulo de Activos y la realiza el jefe de área. El
service valida el alcance de lectura del activo (`404` si no accesible) y que esté
habilitado para el proceso principal de la solicitud (`409` si no). El orden es
triage → activo: primero se fija el proceso principal en el triage y luego se asocia el
activo; sin proceso fijado el `409` indica explícitamente ese paso previo. `JEFE_AREA`/
`LIDER_PROCESO` (más `ADMIN`) pueden asociar.

### Priorización (`priority/priority.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/priority` | Histórico de evaluaciones (vigente = la última). |
| POST | `/requests/:id/priority` | Guarda una evaluación (requiere triage=Continuar y estado válido; criterios 1–5). **Los ocho criterios (`impact`, `alignment`, `riskControl`, `urgency`, `scope`, `dataAvailability`, `feasibility`, `reuse`) son obligatorios (enteros de 1 a 5): la API responde `400` si falta alguno; no hay valores por defecto.** |

### Aprobación (`approval/approval.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/pending-approval` | Cola de solicitudes en backlog priorizado del alcance (`JEFE_AREA`/`LIDER_PROCESO`). |
| GET | `/requests/:id/approval` | Histórico de decisiones de compromiso (`JEFE_AREA`/`LIDER_PROCESO`). |
| POST | `/requests/:id/approval` | Aprueba (→ *Comprometida*) o devuelve (→ *En triage*, motivo requerido). **Solo `JEFE_AREA`** (un líder recibe `403`). Devolver desde Aprobaciones **no** pasa por *Devuelta* ni por la cola de triage: la solicitud queda *En triage* con su triage `CONTINUAR` y vuelve a Priorización (la pantalla lo dice así desde la oleada 2). |
| POST | `/requests/batch-approval` | **Aprueba solicitudes en lote** (oleada 4, PR E; solo `JEFE_AREA`, un líder recibe `403`). Cuerpo `{ requestIds }`: de 1 a 25 UUID sin repetidos (si no, `400`); solo aprueba (devolver exige un motivo por solicitud y sigue siendo individual). **No es atómico**: cada solicitud corre su propia transacción por el mismo camino que `POST /requests/:id/approval` (`ApprovalService.decideInTransaction`), de modo que una que ya cambió de estado no frena a las demás. Responde `200` con `{ results, approved, skipped }`; `results` trae un ítem por id, en el orden pedido: `{ id, code, status: 'APROBADA' \| 'OMITIDA', reason }`. Motivos de omisión: «Ya no está en backlog priorizado.» y «No encontrada.» (inexistente y fuera de alcance, sin distinguirlas; `code` es `null` en ese caso). Cada aprobación escribe su propio evento de auditoría. El DTO de resultado (`common/batch-result.dto.ts`) lo reutilizará la aprobación de tareas en lote. Tool MCP `request.batch_approve`. **«Aprobada por el creador»:** cuando quien aprueba (individual o en lote) es el `createdByUserId` de la solicitud, los eventos de auditoría `CREATE`/`APPROVAL` y `UPDATE`/`REQUEST` llevan `approvedByCreator: true` en `after` (informativo: no cambia permisos ni bloquea, y no aparece al devolver ni cuando aprueba otra persona). |

Reglas clave: el triage solo se registra desde `REGISTRADA` (una solicitud *Devuelta* vuelve allí con «Reenviar a triage», `DEVUELTA → REGISTRADA`, su única salida); priorizar exige triage con
decisión "Continuar", un estado válido y un activo base asociado (sin `assetId` → `409`
sin mutación); aprobar exige que la solicitud esté en backlog priorizado;
devolver exige motivo. El estado operativo lo escribe solo el helper de transición, no
un update libre.

## plan — Plan, fases, tareas y dependencias

Convierte una solicitud comprometida en un plan de trabajo. Rol `JEFE_AREA`/
`LIDER_PROCESO` para gestión; autorizar/devolver requiere capacidad `review`. Ver/
estado de tareas lo tienen los 3 roles; "mi trabajo" usa la capacidad `assigned`.

### Plan (`plan.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/requests/:requestId/plan` | Crea el plan de una solicitud comprometida (→ *En planificación*). |
| GET | `/requests/:requestId/plan` | Devuelve el plan de una solicitud. |
| PATCH | `/requests/:requestId/plan` | Edita datos del plan (no el estado). Oleada 2 (BL-065): `400` en español si el fin del periodo es anterior al inicio, comparando con el valor ya guardado cuando solo llega uno de los dos (el alta `POST /requests/:requestId/plan` aplica la misma regla). Solo en `BORRADOR`/`DEVUELTO` (`409` en autorización o autorizado). |
| GET | `/requests/:requestId/plan/guide` | Guía de pendientes del plan (gate de envío). D6 (oleada 2): suma la categoría `commitment` con el pendiente `NO_COMMITMENT` («El plan necesita la fecha de compromiso.») mientras el plan no tenga `commitmentDate`, y el campo `suggestedCommitmentDate` (la fecha fin más tardía de las tareas, o `null`), que la web precarga como valor editable sin guardarlo. |
| GET | `/requests/:requestId/plan/export` | Exporta el plan a un documento JSON portable (solo lectura; cualquier estado). |
| GET | `/requests/:requestId/plan/export-excel` | Exporta fases, tareas, responsables, fechas y dependencias a un archivo Excel (.xlsx). |
| GET | `/requests/:requestId/plan/template-excel` | Descarga la plantilla Excel con la misma estructura y un ejemplo. |
| POST | `/requests/:requestId/plan/import-excel` | Importa el Excel (`fileBase64`) y reemplaza el contenido. Los responsables siguen la misma regla de procesos participantes que `POST /phases/:phaseId/tasks` (`400` si no, salvo quienes ya eran responsables del plan). Valida todas las filas antes de guardar: `400` con la lista `errors` por hoja/fila (fechas, rango de fase, responsables, referencias); `409` si el plan no está en borrador/devuelto. |
| POST | `/requests/:requestId/plan/import` | Importa un plan desde un documento y reemplaza su contenido (`409` si no está en borrador/devuelto; `400` si el documento es inválido o si algún responsable no pertenece a un proceso interviniente de la solicitud, salvo quienes ya eran responsables de tareas del plan). |
| GET | `/requests/:requestId/plan/participants` | Procesos que intervienen en la solicitud del plan: procesos activos y participantes (el principal primero) con `isMain`, `isParticipant`, `canRemove` y `removalBlockedBy` (tareas que impedirían quitarlo). **Exclusivo de `JEFE_AREA`** (`@Roles(JEFE_AREA)` por handler; líder, integrante y `ADMIN` reciben `403`). |
| PUT | `/requests/:requestId/plan/participants` | **Corrige los procesos que intervienen después del triage** (que se registra una sola vez). Cuerpo `{ participantProcessIds: uuid[] }` = procesos participantes además del principal (que participa siempre y no se quita); reutiliza la validación del triage (`resolveParticipantProcessIds`: existen y están activos, `400` si no). **Agregar** habilita al instante a los líderes y miembros con grant activo de ese proceso como candidatos y responsables. **Quitar** responde `409` en español nombrando las tareas si alguna tarea del plan está asignada a una persona con grant activo en ese proceso que no seguiría siendo elegible por otro proceso participante. Solo con la solicitud en `EN_PLANIFICACION`, `EN_EJECUCION`, `EN_VALIDACION`, `LISTA_PARA_LIBERAR`, `EN_ESTABILIZACION` u `OPERATIVA` (`409` en las demás: no hay plan o ya no está viva); `404` sin plan o fuera de alcance. No reabre el triage ni cambia decisión, proceso principal, aprobaciones, estado ni tareas. Audita `UPDATE` `REQUEST` (`before`/`after` con `participantProcessIds`, `addedProcessIds`, `removedProcessIds` y `reason: GESTION_PROCESOS_PLAN`; quién y cuándo van en el evento); sin cambios no escribe ni audita. **No amplía la lectura**: el alcance de solicitudes se resuelve por `mainProcessId` y no por participantes, así que agregar un proceso no hace que sus integrantes vean la solicitud. Exclusivo de `JEFE_AREA` (`403` al resto, incluido `ADMIN`). |
| POST | `/requests/:requestId/plan/submit` | Envía el plan a autorización (`409` si hay pendientes). Desde D6 el compromiso es obligatorio: sin `commitmentDate` responde `409` con «El plan necesita la fecha de compromiso.» (es la misma guía que recomputa el envío; no hay validación aparte). Los planes que ya estaban en autorización o autorizados sin compromiso no se tocan; solo se exige al enviar o reenviar. No cambia la línea base (BL-051) ni añade `rebaseline` (BL-052). |
| POST | `/requests/:requestId/plan/authorize` | Autoriza el plan (→ *Autorizado*; Request → *En ejecución*). Congela la **línea base de entrega** `baselineDate` (`commitmentDate ?? periodEnd ?? última fecha fin de las tareas`), que expone `PlanResponseDto` y usa el portafolio para medir el vencimiento. |
| POST | `/requests/:requestId/plan/return` | Devuelve el plan con motivo (→ *Devuelto*). |

IDs visibles en la importación/exportación: el documento JSON exporta `code` en cada fase y tarea y el Excel añade la columna «Código (informativo)» al final de las hojas Fases y Tareas. Es solo informativo: **la importación lo ignora** (un archivo antiguo sin la columna sigue funcionando; `ref`/«Referencia» no cambia). Importar **reemplaza** el plan, así que las fases y tareas nuevas reciben códigos **nuevos que continúan el contador** del plan (los anteriores no se reutilizan).
Validaciones de fechas (backend y formularios): la fecha de fin de una fase o tarea no puede ser anterior a la de inicio; las fechas de cada tarea deben estar dentro del rango de su fase; al cambiar las fechas de una fase se comprueba que sus tareas sigan dentro. Aplican al crear, editar e importar (JSON o Excel). El formulario de tarea ya no ofrece la opción *Es un hito* (el campo se conserva en datos históricos).

**Bloqueo de edición del plan según su estado (D5, BL-065; `plan-edit-lock.ts`).** La API es el control real; la web solo oculta o deshabilita. Alcanza al plan (`PATCH`), las fases (crear, editar, reordenar, borrar), las tareas (crear, editar, borrar), las dependencias (añadir, quitar), la importación (JSON y Excel) y los procesos que intervienen. Las acciones del propio flujo (enviar, autorizar, devolver) y el trabajo de ejecución de las tareas (estado, avance, aceptación, evidencia) no se bloquean.

| Estado del plan | Qué admite |
| --- | --- |
| *Borrador* / *Devuelto* | Edición completa. |
| *En autorización* | Nada: `409` «El plan está en autorización y no admite cambios…» en todo lo anterior, incluido cambiar responsable, fechas u horas. |
| *Autorizado* | Solo `PATCH /tasks/:id` con **responsable, fechas y horas** (y `PATCH` de una fase con sus **fechas**); cada cambio queda auditado como `UPDATE` de la tarea o la fase. Cambiar otro campo de la ficha (título, descripción, criterios, evidencia, proceso, hito, nombre o entregable de la fase) responde `409` con la lista de campos; reenviar el mismo valor no cuenta como cambio. Crear, borrar, reordenar, dependencias, importar y editar los datos del plan responden `409`. Se mantiene así hasta que exista el control de cambios del plan autorizado (BL-052). Los procesos que intervienen siguen siendo corregibles (es lo que permite reasignar responsables de otro proceso). |

### Fases (`phase/phase.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/plans/:planId/phases` | Lista las fases del plan ordenadas. Cada fase trae `code`, su ID visible (`PRY-0012-F2`, solo lectura, no cambia al reordenar). `POST`/`PATCH` no aceptan `code`. |
| POST | `/plans/:planId/phases` | Crea una fase (`order` al final si falta). `400` «El nombre de la fase es obligatorio.» si el nombre queda vacío tras recortar espacios (el `PATCH` aplica lo mismo cuando envía `name`). |
| PATCH | `/plans/:planId/phases/reorder` | Reordena las fases (protege la fase inicial con tareas). |
| PATCH | `/plans/:planId/phases/:phaseId` | Edita nombre/fechas/entregable de una fase. |
| DELETE | `/plans/:planId/phases/:phaseId` | Borra una fase (`409` si tiene tareas). |

### Tareas (`task/task.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/my-work` | Tareas asignadas al usuario actual (dentro de alcance). Cada ítem trae sus IDs visibles `code`, `phaseCode` y `requestCode` (p. ej. `PRY-0012-T07`) y, además, además del contexto de fase/solicitud, `pendingPredecessors` (`{ taskId, title }[]`, predecesoras directas no terminadas, orden por título; `[]` si no hay), `blockedReason` (`string \| null`), `requestOperationalState` y `requestCommitmentDate` (compromiso vigente: `Plan.commitmentDate` si existe; si no, `Request.initialCommitmentDate`; `null` si ninguno). Se calculan en el servidor con consultas por lote (sin N+1); los campos son aditivos y siempre están presentes. Desde BL-036 E3 trae también `evidenceRequired` (la tarea tiene criterios de aceptación o fase de gobierno requerida) y `hasEvidence` (nota/enlace con texto o al menos un archivo, contado con `_count` en la misma consulta). |
| GET | `/tasks/pending-review` | Cola «Por aprobar» (BL-036 E3); cada ítem incluye `code`, `phaseCode` y `requestCode`. Solo `JEFE_AREA` y `LIDER_PROCESO` (`403` al integrante). Devuelve `{ total, items }` con las tareas `EN_REVISION` del alcance del actor (jefe sin filtro; líder, los procesos de todos sus grants, igual que el resto de lecturas de tareas), **sin** las tareas cuyo responsable es el propio actor (las ve en su lista; las que no tienen responsable sí aparecen) y **sin** las de solicitudes `CERRADA` (aprobar allí daría `409`). Hasta 100 ítems (`total` es el real), ordenados por `reviewRequestedAt` ascendente con los `null` primero y luego `updatedAt`. Cada ítem: `id`, `title`, `responsibleUserId`/`responsibleName`, `requestId`/`requestTitle`, `phaseName`, `progress`, `evidenceRequired`, `hasEvidence`, `endDate`, `isMilestone`, `reviewRequestedAt` (`null` en las tareas que ya estaban en revisión al desplegar), `waitingSince` (`reviewRequestedAt` o, si es `null`, `updatedAt`) y `waitingSinceApproximate` (`true` cuando se usó el respaldo). Sin N+1 (responsable, fase, solicitud y conteo de archivos en una consulta). Tool MCP `task.pending-review`. |
| GET | `/plans/:planId/tasks` | Lista las tareas de un plan (filtros opcionales). El filtro `q` busca por título **o por ID visible**, sin distinguir mayúsculas: código completo (`PRY-0012-T07`), parcial (`pry-0012`) o forma corta (`T07`, `t7`, `F2`). Toda tarea trae `code`, `phaseCode` y `requestCode` (solo lectura). |
| GET | `/tasks/by-code/:code` | Detalle de una tarea a partir de su ID visible (`PRY-0012-T07`, sin distinguir mayúsculas). Solo lectura, mismo alcance que `GET /tasks/:id` (`404` si no existe o está fuera de alcance). Va antes de `tasks/:id`; los parámetros `:id` UUID no cambian. Tool MCP `task.get_by_code`. |
| GET | `/codes/:code` | Resuelve cualquier ID visible en su forma completa (`PRY-0012`, `PRY-0012-F2` o `PRY-0012-T07`; sin distinguir mayúsculas; espacios, guiones bajos y guiones largos se normalizan a `-`). Devuelve `CodeResolutionDto`: `type` (`REQUEST`, `PHASE` o `TASK`), `id`, `code`, `title`, `requestId`, `requestCode`, `requestTitle`, `requestStatus` (estado operativo) y, según el tipo, `phaseId`/`phaseName` (fase y tarea), `status` (solicitud y tarea) y `processName` (solicitud, puede ser `null`). Solo lectura, roles `JEFE_AREA`, `LIDER_PROCESO` e `INTEGRANTE`, mismo alcance que el detalle por id (`requestScopeWhere`). Formato inválido → `400` sin consultar la base; no existe o fuera de alcance → `404` con el mismo mensaje. La forma corta (`T07`, `F2`) no se resuelve: sin proyecto en contexto es ambigua. Alimenta la búsqueda global de la cabecera. Tool MCP `code.resolve`. |
| GET | `/plans/:planId/responsible-candidates` | Candidatos a responsable de las tareas del plan: personas con grant activo en alguno de los procesos que intervienen en la solicitud (los `RequestParticipant`, decididos en el triage). Es la **unión** de las personas de todos los procesos participantes (el principal y los marcados en «Procesos que intervienen»); un proceso no marcado no habilita a su gente. No amplía la visibilidad de otras solicitudes. Los 3 roles, dentro del alcance del plan (`404` fuera). |
| POST | `/phases/:phaseId/tasks` | Crea una tarea en una fase (regla de hito). Si se asigna `responsibleUserId`, debe pertenecer a un proceso interviniente de la solicitud (grant activo en algún `RequestParticipant`); `400` «El responsable debe pertenecer a un proceso interviniente de la solicitud.» si no. |
| GET | `/tasks/:id` | Detalle de una tarea con sus predecesoras. Toda respuesta de tarea (detalle, listas del plan y resultados de PATCH) incluye `evidenceRequired` y `hasEvidence` (mismas reglas que en `/my-work`), `blockedReason`, `phaseName`, `requestId` y `requestTitle`, leídos en la misma consulta (sin N+1) y con el mismo alcance de visibilidad. |
| PATCH | `/tasks/:id` | Edita una tarea (no estado/aceptación; regla de hito). Al reasignar `responsibleUserId`, aplica la misma condición dura: debe pertenecer a un proceso interviniente (`400` si no). Conservar al responsable actual (mismo `responsibleUserId`) siempre se permite aunque su proceso se haya desmarcado o la persona haya perdido el grant: solo se impiden las asignaciones **nuevas** fuera de los participantes. |
| DELETE | `/tasks/:id` | Borra una tarea (`409` si es predecesora de otra). |
| PATCH | `/tasks/:id/status` | Cambia el estado (gate de predecesoras y **regla de cierre**, ver abajo). Acepta `blockedReason` opcional (1 a 500 caracteres tras recortar; vacío o solo espacios = ausente): se guarda al pasar a `BLOQUEADA` y se limpia (`null`) al salir de ese estado; con cualquier otro `status` la API responde `400` («El motivo de bloqueo solo aplica al marcar la tarea como bloqueada.») y más de 500 caracteres también `400`. El motivo anterior queda en el historial (`blockedReason` se audita). No cambia la máquina de estados. **Regla de cierre (BL-036 E3, cambio de reglas):** (1) `EN_CURSO → EN_REVISION` exige avance 100 % (el del mismo PATCH o el guardado) y, si la tarea tiene criterios de aceptación o fase de gobierno, evidencia (`evidenceUrl` con texto, el del PATCH o el guardado, o al menos un archivo de `task_evidences`); aplica a todos los roles y responde `409` con el detalle («Para enviar la tarea a revisión primero debe estar al 100 % de avance (ahora está en N %)…», «Esta tarea exige evidencia para enviarse a revisión…» o ambos). (2) `EN_REVISION → TERMINADA` y `TERMINADA → EN_CURSO` (reabrir) solo para `JEFE_AREA` y `LIDER_PROCESO`; el integrante, aunque sea el responsable, recibe `403` con mensaje en español. (3) Devolver (`EN_REVISION → EN_CURSO`) y el resto de transiciones no cambian. Orden de validación: proyecto abierto, responsable o líder, `blockedReason`, permiso de terminar/reabrir, transición, predecesoras y requisitos de revisión. Fija `reviewRequestedAt` al entrar a `EN_REVISION` y lo limpia al salir. Avisa (notificación, sin revertir si falla) a líderes y jefes al llegar a revisión (`TASK_REVIEW_REQUESTED`) y al responsable cuando otra persona aprueba (`TASK_APPROVED`) o devuelve (`TASK_RETURNED`). |
| PATCH | `/tasks/:id/progress` | Actualiza solo el avance (entero 0-100) sin cambiar el estado. Solo con la tarea En curso, Bloqueada o En revisión (`409` en Por hacer o Terminada); jefe, líder o el responsable (`403` si no). Audita el cambio. |
| GET | `/tasks/:id/history` | Traza de cambios de la tarea (de la más reciente a la más antigua, máx. 200): quién, cuándo y cada campo con su valor anterior y nuevo; fase y responsable llegan con su nombre. Se arma con la auditoría de la tarea. |
| PATCH | `/tasks/:id/accept` | Acepta/retira la aceptación (precondición TERMINADA). Ya no es requisito del gate de predecesoras ni se muestra en la UI; se conserva por compatibilidad. |
| GET | `/tasks/:taskId/evidence` | Lista los archivos de evidencia de la tarea. |
| POST | `/tasks/:taskId/evidence` | Adjunta un archivo (multipart, campo `file`) y lo guarda en el bucket S3 maestro (`proyectos/{requestId}/tareas/{taskId}/evidencias/…`). Solo el responsable de la tarea o jefe/líder; `400` si está vacío, supera `EVIDENCE_MAX_BYTES` (8 MB) o su tipo no está permitido; `409` en proyecto cerrado. |
| GET | `/tasks/:taskId/evidence/:evidenceId/download` | URL prefirmada de descarga (vigencia `STORAGE_PRESIGN_TTL_SECONDS`). |
| DELETE | `/tasks/:taskId/evidence/:evidenceId` | Quita la evidencia (BD y objeto S3). |

### Dependencias (`dependency/dependency.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/tasks/:id/dependencies` | Lista las predecesoras de una tarea. |
| POST | `/tasks/:id/dependencies` | Añade una predecesora (valida auto/mismo-plan/ciclo/duplicado). El 400 por ciclo nombra las tareas por su código visible. |
| DELETE | `/tasks/:id/dependencies/:predecessorTaskId` | Quita una predecesora. |

Reglas clave: el envío del plan exige la guía sin pendientes; la transición de una
tarea respeta el gate de predecesoras (una dependiente avanza solo si su predecesora
está TERMINADA; la aceptación ya no es requisito); una dependencia no puede ser circular ni cruzar planes
distintos; el integrante solo opera el estado de su propia tarea.

## portfolio — Portafolio e indicadores del área

Vistas de solo lectura: el portafolio de iniciativas y el control del área
(indicadores y panorama de demanda). El alcance se aplica en el `where` del service y es el
**alcance único de solicitudes** (`RequestScopeService`, módulo `request`): jefe y líder ven
todas las solicitudes no eliminadas (con o sin proceso); el integrante, las de sus procesos
más las que creó. `PortfolioScopeService` ya no define el alcance de solicitudes: lo delega
en ese servicio y solo proyecta el alcance a tareas e incidencias.

**Estados del Portafolio.** `GET /portfolio` sin parámetros devuelve todos los estados (misma
semántica para el MCP y el asistente). La pantalla *Portafolio* filtra por defecto, en la UI,
a las **iniciativas comprometidas**: `COMPROMETIDA`, `EN_PLANIFICACION`, `EN_EJECUCION`,
`BLOQUEADA`, `EN_VALIDACION`, `LISTA_PARA_LIBERAR`, `EN_ESTABILIZACION`, `OPERATIVA` y
`CERRADA`. Quedan fuera `REGISTRADA`, `EN_TRIAGE`, `DEVUELTA`, `RECHAZADA`,
`BACKLOG_PRIORIZADO` y `RETIRADA` (solicitudes sin compromiso o sin decisión); el
conmutador *Incluir pendientes de decisión* los añade.

### Portafolio (`portfolio.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/portfolio` | Listado del portafolio en alcance con el [patrón de listado paginado](#listados-paginados-oleada-3-pr-b): `q` en código y título; `sort` y `dir` como en `GET /requests`; la banda se resuelve antes de paginar, así el total ya la descuenta. Filtros `mainProcessId`, `state`, `band`. Cada filtro admite uno o varios valores como parámetro repetido (`?state=A&state=B`; un solo valor se comporta como antes), con máximo 50 valores por filtro y 400 en español si algún elemento es inválido. Semántica: O dentro de un filtro, Y entre filtros, siempre intersectando el alcance del actor (nunca lo amplía). `mainProcessId` admite UUID o el literal `SIN_PROCESO` (solicitudes sin proceso principal, aún por triar), que se combina en O con los UUID; `band` admite `P1`..`P4` y `SIN_PRIORIZAR`. Cada ítem incluye `progressPercent` (promedio del avance de las tareas del plan, `TERMINADA` = 100; `null` sin tareas) y la alerta de vencimiento `dueStatus` (`SIN_FECHA`, `EN_TIEMPO`, `PROXIMO_A_VENCER`, `VENCIDO`, `NO_APLICA` en cerradas/rechazadas/retiradas) con `daysToTarget`. El umbral de «próximo a vencer» es `PORTFOLIO_DUE_SOON_DAYS` (7 por defecto). **Fecha de referencia del vencimiento** (`computeSchedule`, `portfolio/progress.ts`): la fecha objetivo de la solicitud es solo una expectativa inicial. Con el plan en `AUTORIZADO` el vencimiento se mide contra su línea base (`Plan.baselineDate`; respaldo para planes antiguos sin ella: `commitmentDate`, luego `periodEnd`) y `referenceSource` = `PLAN`; sin plan autorizado se mide contra la fecha objetivo (`SOLICITUD`; `NINGUNA` si no hay ninguna). Cada ítem añade `referenceDate`, `referenceSource`, `forecastDate` (mayor fecha fin entre las tareas sin terminar), `requestedGapDays` (compromiso menos fecha solicitada; informativo, no es un vencimiento) y `scheduleVarianceDays` (pronóstico menos compromiso; positivo = se corrió). Las dos últimas son `null` sin plan autorizado. Filtro opcional `alert` (uno solo): `VENCIDA` (`dueStatus` `VENCIDO`), `PROXIMA` (`PROXIMO_A_VENCER`), `CON_DESVIACION` (`scheduleVarianceDays` > 0) o `BLOQUEADA` (`blocked`); se resuelve en memoria sobre el alcance filtrado (tope 1000) antes de paginar, así `X-Total-Count` ya lo descuenta; valor fuera del enum → `400`. La regla de cada alerta vive en una sola función (`matchesAlert`, `portfolio.service.ts`) que usan el listado y los contadores. |
| GET | `/portfolio/summary` | Contadores de la franja de alertas: `{ total, overdue, dueSoon, withVariance, blocked, truncated }`. Mismo alcance y filtros que el listado (`q`, `mainProcessId`, `state`, `band`) sin `alert`, orden ni paginación, y el mismo armado de filas (`itemsFor`), así cada cifra coincide con el total de `GET /portfolio?alert=…`. Una iniciativa puede contar en varios grupos. Evalúa hasta 1000 iniciativas (`truncated` = hubo más). Declarada antes de las rutas con parámetro. Los 3 roles. |
| GET | `/portfolio/:id/execution` | Ejecución de solo lectura de una iniciativa: `planStatus`, `baselineDate` (solo con plan autorizado), `forecastDate`, `scheduleVarianceDays`, `progressPercent` y `phases` en orden, cada una con `code`, `name`, estado derivado de sus tareas (`SIN_TAREAS`, `POR_HACER`, `EN_CURSO`, `TERMINADA`), avance, `tasksTotal`, `tasksDone` y `tasks` (`id`, `code`, `title`, `status`, `progress`, fechas, `responsibleName`). Sin plan: `hasPlan: false` y `phases` vacío. Alcance único de solicitudes con `404` idéntico si no existe o está fuera de alcance; `400` si el id no es UUID. Los 3 roles: no exige el módulo `plan`. |

### Control del área (`area-control.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/area-control/indicators` | Indicadores del área para el periodo (jefe/líder; integrante → `403`). |
| GET | `/area-control/demand-summary` | Panorama de demanda en alcance (los 3 roles), con **corte a hoy**: `from`/`to` solo se validan por compatibilidad y no filtran los conteos (las series por periodo están en `indicators`). Incluye `noProcess` (solicitudes sin proceso principal asignado) junto a `total`, `blockedActive`, `byState` y `byPriorityBand`. |
| POST | `/tasks/batch-approve` | Aprueba tareas en lote (BL-060, oleada 4 PR F). Solo `JEFE_AREA` y `LIDER_PROCESO` (`403` al integrante). Cuerpo `{ taskIds }`: 1 a 25 UUID sin repetidos (`400` si no). **No atómico**: cada tarea sigue el mismo camino que `PATCH /tasks/:id/status` hacia `TERMINADA` (alcance con `requireTaskInScope`, proyecto abierto, transición `EN_REVISION → TERMINADA`, auditoría `UPDATE`/`TASK` por tarea, aviso al responsable y aviso de plan completo) y una omitida no frena a las demás. Respuesta `200` con `{ results, approved, skipped }` (`BatchResultDto`, compartido con la aprobación de solicitudes): un resultado por tarea en el orden pedido, `{ id, code, status: APROBADA \| OMITIDA, reason }`. Motivos de omisión: «No encontrada.» (inexistente o fuera de alcance, sin distinguirlas), «El proyecto está cerrado.», «Tus propias tareas no se aprueban en lote.», «La tarea ya no está en revisión.». Declarada antes de `tasks/:id`. Tool MCP `task.batch_approve` (`write`). |
| GET | `/area-control/attention` | Conteos «Requiere tu atención» a hoy y en alcance (los 3 roles): solicitudes `REGISTRADA` (triage), `REGISTRADA` sin proceso principal (`pendingNoProcess`, cola de entrada por triar cuyo responsable operativo es el Jefe de Área), `EN_TRIAGE` con triage `CONTINUAR` vigente (priorizar), `BACKLOG_PRIORIZADO` (aprobar) y tareas no terminadas con `endDate` anterior a hoy de solicitudes no cerradas, retiradas ni rechazadas, y `pendingTaskReviews` (tareas por aprobar: la misma cláusula que `GET /tasks/pending-review`; `0` para el integrante). |

## capacity — Capacidad (disponibilidad y asignaciones)

Reparto de horas por persona y mes. Los 3 roles con alcance por proceso.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/capacity/summary` | Resumen de carga por persona para un mes (en alcance). D7 (oleada 2, BL-066): `planificado` suma solo las tareas de planes `AUTORIZADO` en solicitudes vivas (no eliminadas ni `RECHAZADA`, `RETIRADA` o `CERRADA`); un borrador o un plan en autorización ya no cuenta. Lista a todas las personas del alcance con asignación (grant) activa y usuario activo, también sin registros ese mes (`disponible: null`, `estado: SIN_DISPONIBILIDAD`, `comprometido`/`planificado` 0). No cambia el estado derivado ni `comprometido`. |
| GET | `/capacity/people` | Personas en alcance para los selectores. |
| GET | `/capacity/availability` | Disponibilidades del mes en alcance. |
| POST | `/capacity/availability` | Registra disponibilidad de una persona para un mes. Horas enteras de 0 a 744 (un mes completo): `400` «La disponibilidad no puede superar 744 horas al mes.» |
| PATCH | `/capacity/availability/:id` | Edita las horas disponibles (mismo tope de 744 h). Los registros ya guardados fuera del tope se conservan y se siguen listando; el tope aplica al editarlos. |
| GET | `/capacity/assignments` | Asignaciones del mes en alcance (filtros opcionales). Cada ítem trae `requestCode` y `requestTitle` (`null` si no hay solicitud ligada). |
| POST | `/capacity/assignments` | Crea una asignación de horas (proceso requerido). Mínimo 1 hora: `400` «La asignación debe ser de al menos 1 hora.» |
| PATCH | `/capacity/assignments/:id` | Edita una asignación (mismo mínimo de 1 h; las ya guardadas con 0 h se conservan hasta editarlas). |
| DELETE | `/capacity/assignments/:id` | Borra una asignación. |

Reglas: la disponibilidad es por persona/mes (una fila única); las asignaciones se
agregan por periodo/proceso (varias filas por persona/mes). El mes se maneja como
`YYYY-MM` en el contrato externo.

## coordination — Trabajo diario y coordinación

Agrupa tres submódulos: bitácora/semanal (worklog), reuniones
(meetings) y compromisos (commitments). Los 3 roles, con alcance por proceso.

### Worklog — Bitácora y reporte semanal (`worklog/worklog.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/coordination/people` | Personas en alcance para los selectores. |
| GET | `/worklog/daily` | Lista **paginada** (`{ data, page, pageSize, total, hasMore }`, 25 por defecto, máx. 100) de diarios en alcance. Filtros: `from`, `to`, `date`, `processId`, `authorUserId`, `status`, `classificationCode` (contiene al menos una actividad), `q` (notas, descripción, resultado, activo, solicitante y nombre del autor), `sort` y `page`/`pageSize`. Cada diario trae `authorName`, `processName`, `returned` y `actions` (qué puede hacer quien consulta). |
| GET | `/worklog/daily/summary` | Resumen con los mismos filtros: diarios, horas, totales por estado, por clasificación y por persona. |
| GET | `/worklog/options` | Proyectos y tareas que quien consulta puede **imputar** en el diario de un proceso y una fecha (misma regla que aplica al guardar). Query: `processId` (obligatorio), `date` (AAAA-MM-DD; referencia de la ventana de gracia, por defecto hoy), `q`, `includeTerminated`, `scope` (`mine` por defecto o `all`). Devuelve `projects` (`id, code, title, state, closedAt, hasMyTasks`), `tasks` (`id, code, title, status, phaseName, requestId, requestCode, requestTitle, isMine, responsibleName`) y `projectsTruncated`/`tasksTruncated` (tope de 200 por lista). |
| POST | `/worklog/daily` | Crea la cabecera de un diario (autor = actor). El `processId` debe ser uno de los procesos del actor: `403` si no pertenece a él; el jefe de área puede usar cualquiera, pero uno inexistente da `400` (antes `500`). Una `date` posterior a hoy (día local de la aplicación) da `400` «No puedes registrar un diario de una fecha futura.»; los diarios ya existentes no se tocan. |
| GET | `/worklog/daily/:id` | Detalle de un diario con sus actividades. |
| PATCH | `/worklog/daily/:id` | Edita la cabecera (notas) de un diario propio. |
| DELETE | `/worklog/daily/:id` | Borra un diario propio (cascade de actividades). |
| POST | `/worklog/daily/:id/submit` | Envía un diario a revisión (`BORRADOR → ENVIADO`); limpia una devolución anterior. Un diario sin actividades da `400` «Agrega al menos una actividad antes de enviar el diario.» (`dayNotes` solo no basta; un día libre se registra como actividad «Interna» con nota); crear el borrador vacío sigue permitido. |
| POST | `/worklog/daily/:id/recall` | El autor retira el envío (`ENVIADO → BORRADOR`); 409 si ya fue revisado o su semanal ya se envió. |
| POST | `/worklog/daily/:id/review` | Jefe de área o líder del proceso (nunca el autor): `ENVIADO → REVISADO`; 403 si no puede revisar. |
| POST | `/worklog/daily/:id/return` | Igual que revisar, devuelve `ENVIADO → BORRADOR` con `{ reason }` (10 a 1000 caracteres) y avisa al autor (notificación `WORKLOG_RETURNED`). 409 si su semanal ya se envió. |
| GET | `/worklog/daily/:id/suggestions` | **Sugerencias de tiempo del día** de un diario propio (403 si es de otra persona): reuniones de la fecha donde el autor es participante o responsable (`REUNION`, horas = `durationMinutes / 60` o `null` sin duración; si el acta sigue en borrador, `meeting.minutesOpen = true`), ocurrencias de actividades recurrentes que el autor **completó** ese día local (`RECURRENTE`, horas = `actualHours` redondeadas al 0,25 con `hoursAdjusted`/`originalHours`; descripción = «qué se realizó») y tareas con cambio de **avance o estado** ese día según su historial (`PLANIFICADA` con la tarea, sin horas, `task.reasons`). Devuelve `editable`, `pendingCount`, `dismissedCount`, `authorDayTotalHours`, `workdayHours` y `overWorkday`. `includeDismissed=true` agrega las descartadas. |
| POST | `/worklog/daily/:id/suggestions/accept` | Acepta 1..50 sugerencias `{ items: [{ key, hours?, description? }] }`; solo el autor y solo en `BORRADOR` (409 si no). Cada ítem crea la actividad por la misma ruta que una manual (`WorklogService.createActivity`) y su vínculo de origen en la misma transacción. Respuesta 200 parcial: `accepted` (actividades) y `failed` (`NO_DISPONIBLE`, `HORAS_REQUERIDAS`, `YA_REGISTRADA`, `NO_ELEGIBLE`, `HORAS_INVALIDAS`). |
| POST | `/worklog/daily/:id/suggestions/dismiss` | Descarta 1..50 sugerencias `{ keys }` (no reaparecen en ningún diario del autor); idempotente; 409 si ya están registradas; 404 si la clave ya no está vigente. Solo en `BORRADOR`. |
| POST | `/worklog/daily/:id/suggestions/restore` | Restaura descartadas `{ keys }` (borra la marca); idempotente. Solo en `BORRADOR`. |
| POST | `/worklog/daily/:id/activities` | Agrega una actividad al diario. Valida la clasificación y, en *Planificada*, la **regla de imputación** de abajo (404 fuera de alcance; 400 con el código visible si no es imputable). Si llega solo la tarea, el proyecto se deriva de ella. Ya no acepta `relatedIssueId` (400 por campo desconocido). |
| PATCH | `/worklog/activities/:id` | Edita una actividad del diario. Solo se revalida la referencia (proyecto/tarea) que **cambia**: si no cambia se conserva aunque el proyecto ya no sea imputable. `taskId: null` quita la tarea (omitirlo la conserva); al cambiar de proyecto, una tarea conservada debe pertenecer al nuevo (`400` si no), por eso el formulario envía `taskId: null` al vaciarla. |
| DELETE | `/worklog/activities/:id` | Borra una actividad del diario. |
| GET | `/weekly-reports` | Lista semanales en alcance (filtros: `weekStart`, `processId`, `authorUserId`, `status`); incluye `authorName` y datos de revisión. |
| POST | `/weekly-reports` | Crea un semanal (se ancla al lunes ISO). Misma validación de proceso que el diario (`403` si no pertenece al proceso; `400` si el jefe indica uno inexistente). |
| GET | `/weekly-reports/draft` | Borrador del semanal (`processId` y `weekStart`, cualquier día, anclado al lunes; declarada antes de `:id`; mismos roles que crear). Solo lectura y determinista: no escribe en base ni en auditoría. `results` = actividades de los diarios del actor en esa semana y proceso (cualquier estado), agrupadas por solicitud (`PRY-0012 · título (6,5 h)` y una línea por actividad) y «Otras actividades» sin solicitud; `blockers` = actividades con estado `BLOQUEADO` de la semana y novedades abiertas (`EN_CURSO`/`BLOQUEADO`) del proceso; `commitmentsText` = compromisos abiertos del actor (asignado o responsable) del proceso que vencen en la semana siguiente; `proposals` y `decisions` van vacías. Cada sección se recorta a 5000 caracteres. Devuelve también `sources { dailyLogs, activities }`. Semana futura `400` («No puedes registrar un semanal de una semana futura.»); proceso ajeno `403`; proceso inexistente (jefe) `400`. |
| GET | `/weekly-reports/:id` | Detalle de un semanal con conteos de consolidación. |
| PATCH | `/weekly-reports/:id` | Edita las secciones de texto de un semanal propio. |
| POST | `/weekly-reports/:id/submit` | Envía un semanal a revisión (`BORRADOR → ENVIADO`). Si ninguna de las cinco secciones (resultados, propuestas, bloqueos, compromisos, decisiones) tiene texto tras quitar espacios, da `400` «Escribe al menos una sección del semanal antes de enviarlo.»; un semanal ya enviado sigue dando `409`. |
| POST | `/weekly-reports/:id/review` | Jefe o líder del proceso (nunca el autor): `ENVIADO → REVISADO`. |
| POST | `/weekly-reports/:id/return` | Devuelve `ENVIADO → BORRADOR` con `{ reason }` y avisa al autor. |

**Regla de imputación de actividades planificadas** (`worklog/worklog-eligibility.service.ts`; la usan `GET /worklog/options` y la validación al guardar, así que la interfaz, el MCP y el asistente no pueden divergir):

- **Proyecto imputable**: solicitud en el alcance de lectura unificado (`RequestScopeService`), con plan, en estado `EN_PLANIFICACION`, `EN_EJECUCION`, `EN_VALIDACION`, `LISTA_PARA_LIBERAR` o `EN_ESTABILIZACION`, o `CERRADA` dentro de la **ventana de gracia** (7 días por defecto, contados desde `closedAt` hasta la fecha del diario; si el proyecto se reabre vuelve a ser imputable). Quedan fuera `REGISTRADA`, `EN_TRIAGE`, `DEVUELTA`, `RECHAZADA`, `BACKLOG_PRIORIZADO`, `COMPROMETIDA`, `OPERATIVA`, `RETIRADA` y `CERRADA` vencida (`BLOQUEADA` es una marca, no un estado, y no cambia nada).
- **Proceso del diario**: el proceso del diario debe ser el principal o un participante del proyecto.
- **Tarea imputable**: de un proyecto imputable. El integrante solo imputa tareas **donde es responsable**; el líder del proceso del diario y el jefe de área también las ajenas de su alcance. Una tarea terminada se acepta (la interfaz la oculta por defecto).
- **Coherencia**: si llegan proyecto y tarea, la tarea debe ser de ese proyecto (400).
- **Historia**: en `PATCH` solo se aplican las reglas a la referencia que cambia; los diarios enviados o devueltos no se vuelven inválidos. La lectura de diarios y el reporte semanal no cambian.
- **Errores**: fuera de alcance → 404; no imputable → 400 con mensaje que nombra el código (p. ej. «El proyecto PRY-0016 está cerrado y ya no admite nuevas actividades.»).
- **Ventana de gracia gestionable**: maestra `WORKLOG_PARAM`, código `CLOSED_PROJECT_GRACE_DAYS`; el valor es un entero ≥ 0 en la **etiqueta** (se edita en *Maestras*). Si la maestra no existe, está inactiva o el valor no es válido, se usan 7 días. El seed solo la crea si falta.

Reglas: la **escritura** de diarios y semanales es solo del autor (el jefe y el líder leen y revisan, no editan lo ajeno). Un diario o semanal que ya no está en borrador responde 409 a cualquier edición. `REVISADO` es terminal. Las horas de una actividad van de **0,25 a 24 en pasos de 0,25** (400 «Las horas deben ir de 0,25 a 24 en pasos de 0,25.»; se validan en el DTO y en el servicio). Omitidas se guardan en 0 («sin horas», como los registros antiguos). El alta duplicada (persona, proceso, fecha) responde 409 con `existingId`.

**Sugerencias del día e integración con Reuniones, Actividades recurrentes y Tareas** (`worklog/worklog-suggestion.service.ts`):

- **Categorías del sistema** `REUNION` («Reunión») y `RECURRENTE` («Actividad recurrente») en `ACTIVITY_CLASS`, sembradas por migración (etiquetas editables en *Maestras*). Solo se crean desde una sugerencia: a mano → 400 «Las actividades de reunión y recurrentes se agregan desde las sugerencias del día.».
- **Vínculo de origen único por autor** (`daily_log_suggestion_links`): una sugerencia aceptada en un diario desaparece de los demás diarios del autor (también de otro proceso el mismo día) y no se cuenta doble en el semanal. La clave (`MEETING:<id>`, `OCCURRENCE:<id>`, `TASK:<id>:<fecha>`) la construye el servidor; al aceptar se exige que siga vigente. Una carrera entre dos diarios responde `YA_REGISTRADA`. Borrar la actividad borra el vínculo y la sugerencia reaparece.
- Una actividad de reunión o recurrente queda **bloqueada** (`locked`): no cambia de clasificación ni de origen; sí horas y textos. Una de tarea sugerida conserva su tarea. La respuesta de cada actividad trae `source` (`kind`, ids y `label`) y `locked`.
- **Tarea trabajada el día D**: evento de auditoría `UPDATE` de `TASK` del autor cuyo día local es D y cuyo before/after cambia `progress` o `status` (`diffTaskSnapshots`). Se aplica la misma elegibilidad de imputación (`WorklogEligibilityService.eligibleTasksForLog`) y se excluye si el autor ya tiene una actividad con esa tarea en un diario de esa fecha.
- **Día local**: zona `RECURRING_ACTIVITY_TIMEZONE` (por defecto `America/Lima`), helper `coordination/local-day.ts`.
- **Jornada** (aviso, no bloquea): `GET /worklog/daily` y `GET /worklog/daily/:id` devuelven `authorDayTotalHours` (todas las actividades del autor en esa fecha, cualquier proceso y estado), `workdayHours` y `overWorkday`. El umbral es la maestra `WORKLOG_PARAM` / `WORKDAY_HOURS` (etiqueta numérica 1–24 en pasos de 0,25; inválida o inactiva → 9).
- Diarios `ENVIADO`/`REVISADO`: las sugerencias se pueden consultar (`editable = false`) para avisar que hay tiempo sin registrar, pero aceptar, descartar y restaurar responden 409.
- Auditoría: aceptar audita la actividad (`DAILY_LOG_ACTIVITY`, con `sourceKey`); descartar/restaurar auditan `DAILY_LOG_SUGGESTION`.

> **Novedades retiradas.** Los endpoints `/issues` (listar, crear, ver, editar, transicionar y borrar), `IssueService`
> y las tools `issue.*` del MCP ya no existen: cualquier `/issues` responde 404. La tabla `issues` y sus datos se
> conservan (ver `modelo-datos.md`). `record-state.ts` y `WorkflowStateService` se mantienen: los usa Compromisos.
> El indicador «Bloqueos activos» del Panel de demanda (`GET /area-control/indicators`) cuenta solo las marcas de
> bloqueo de las solicitudes: `blocks.openBlockingIssues` desapareció y `BlockCauseDto.origin` solo vale `REQUEST_FLAG`.

### Meetings — Reuniones (`meeting/meeting.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/meetings` | Lista reuniones en alcance (filtros opcionales: `processId`, `state`, `requestId` = solicitud relacionada o proyecto relacionado). |
| GET | `/meetings/commitments-open` | **Compromisos abiertos de mis reuniones**: compromisos `EN_CURSO`/`BLOQUEADO` cuya reunión de origen tiene al actor como responsable (no amplía la visibilidad). Filtros: `assignedUserId`, `dueStatus`, `meetingId`, `processId`. Devuelve `counts` (`total`, `vencido`, `venceHoy`, `proximo`, `aTiempo`), `truncated` (tope 500) e `items` con asignado (o responsable), reunión, proceso y semáforo. |
| POST | `/meetings` | Crea una reunión (estado inicial BORRADOR); `durationMinutes` opcional. El `processId` debe ser un proceso del actor (`403` si no; `400` si el jefe indica uno inexistente). El `responsibleUserId` (también en el PATCH) debe existir, estar activo y pertenecer al proceso de la reunión (grant activo en él o grant de jefe de área): si no, `400` «La persona indicada no existe o no pertenece al proceso.» (antes un id inexistente daba `500`). |
| GET | `/meetings/:id` | Detalle del acta: participantes y sus compromisos (`commitments` con `assignedUserName`, `responsibleUserName`, `dueStatus`, `daysToDue`; `commitmentsTotal`, `commitmentsOpen`, `closed`), `durationMinutes` y `meetingEndTime`. |
| PATCH | `/meetings/:id` | Edita un acta abierta (incluye el set de participantes y `durationMinutes`; `null` la borra); `409` si está cerrada, salvo un PATCH **solo de duración** del responsable, líder del proceso o jefe (para actas cerradas sin duración; 403 a otros, 400 si intenta quitarla). |
| POST | `/meetings/:id/close` | Cierra el acta (responsable, líder del proceso o jefe); exige la **duración** (400 «Indica la duración de la reunión antes de cerrar el acta.») y decisiones o al menos un compromiso (409). |
| POST | `/meetings/:id/reopen` | Reabre un acta cerrada (líder del proceso o jefe). |
| DELETE | `/meetings/:id` | Borra un acta abierta sin compromisos (cascade de participantes); `409` si no, o si tiene tiempo registrado en una bitácora («La reunión tiene tiempo registrado en una bitácora.»). |

Duración de la reunión: `durationMinutes` entero, múltiplo de 15, entre 15 y 1440 (coincide con el paso de 0,25 h de la Bitácora). Las reuniones anteriores quedan sin duración (sin backfill) y su sugerencia de bitácora sale sin horas. `meetingEndTime` (HH:mm) lo calcula la API como hora + duración; es `null` si falta alguna o si cruza la medianoche.

### Commitments — Compromisos (`commitment/commitment.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/commitments` | Lista compromisos en alcance (filtros opcionales: `state`, `processId`, `assignedUserId`, `requestId` = solicitud relacionada o proyecto relacionado). |
| POST | `/commitments` | Crea un compromiso (vencimiento requerido). El `processId` debe ser un proceso del actor (`403` si no; `400` si el jefe indica uno inexistente). `assignedUserId` y `responsibleUserId` (también en el PATCH) se validan igual que el responsable de una reunión: `400` «La persona indicada no existe o no pertenece al proceso.» (antes `500`). |
| GET | `/commitments/my-work` | Compromisos de Mi trabajo: abiertos (`EN_CURSO`/`BLOQUEADO`) del actor (asignado; si no hay asignado, responsable) que están **vencidos o vencen hoy** (vencidos primero), con `total`, `overdueCount`, `dueTodayCount`, `upcomingCount` y `canComplete`. Completar usa la transición existente (`POST /commitments/:id/transition` con `COMPLETADO`). |
| GET | `/commitments/:id` | Detalle de un compromiso. |
| PATCH | `/commitments/:id` | Edita un compromiso. |
| POST | `/commitments/:id/transition` | Transiciona el estado (máquina mínima). |
| DELETE | `/commitments/:id` | Borra un compromiso en alcance. |

Reglas: los diarios/semanales son propios del autor; los participantes de una reunión
deben estar dentro del alcance; los compromisos usan una máquina de estado
mínimas reversibles.

Actas y compromisos (módulo unificado): la reunión es el acta. Su estado reutiliza
`RECORD_STATE`: `BORRADOR` = abierta, `COMPLETADO` = cerrada, `ARCHIVADO` = archivada; el
cierre solo se hace por `POST /meetings/:id/close` (un `PATCH` de estado a cerrado → `400`).
Un acta cerrada es un registro: no se edita, no se elimina y no admite compromisos nuevos
ni re-ligados (`409`); sus compromisos siguen su propio seguimiento y no se pueden eliminar.
Un compromiso con acta debe ser del mismo proceso que ella (`400`); se permiten
compromisos sin acta. La respuesta del compromiso incluye `sourceMeetingTitle` y
`sourceMeetingDate`. Al crear un compromiso, o al cambiar su asignado o responsable, se
notifica a esas personas (`COMMITMENT_ASSIGNED`).

Semáforo de vencimiento (`commitment/commitment-due.ts`, sobre el día local de la app): `VENCIDO` (antes de hoy),
`VENCE_HOY`, `PROXIMO` (1 a 7 días) y `A_TIEMPO` (más de 7); `null` si el compromiso está `COMPLETADO` o `ARCHIVADO`.
La respuesta de cada compromiso incluye `dueStatus` y `daysToDue`.

**Avisos de vencimiento** (`CommitmentNoticeService` + `CommitmentNoticeScheduler`): cron in-process
`COMMITMENT_NOTICES_CRON` (por defecto `30 7 * * *`, zona de la app; `COMMITMENT_SCHEDULER_ENABLED=false` lo apaga).
Para compromisos abiertos avisa a la persona asignada (o, si no hay, a la responsable): `COMMITMENT_DUE_SOON`
(vence mañana), `COMMITMENT_DUE_TODAY` (vence hoy) y `COMMITMENT_OVERDUE` (vencido, una sola vez). Es idempotente:
cada aviso reclama su marca (`due_soon_notified_at`, `due_today_notified_at`, `overdue_notified_at`) con un
`updateMany` condicionado a que siga en NULL. Cambiar el vencimiento o la persona destinataria, o reabrir el
compromiso, reinicia las marcas. Sin destinatario no se avisa ni se marca; un fallo se registra y no tumba el cron.

## knowledge — Activos y documentos

Inventario de activos genéricos, compartidos y gobernados, y su documentación en
Markdown versionada. Los 3 roles de área **leen** con alcance por proceso (propietario ∪
visibilidad); la **escritura** del activo (crear/editar/cambiar estado) es exclusiva del
jefe de área (`requireAssetGovernor` + `@Roles(JEFE_AREA)` en los handlers de
escritura). La máquina de estado se aplica en el service.

### Activos (`asset/asset.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/assets` | Lista activos en alcance (filtros `processId`, `requestId`, `status`) con el [patrón de listado paginado](#listados-paginados-oleada-3-pr-b): `q` por nombre; `sort` ∈ `createdAt` (por defecto, descendente), `name`, `status`. `take` queda como alias obsoleto (primeras N filas; si llega con `pageSize`, gana `pageSize`). Cada fila añade `processCode`, `processName`, `ownerName`, `requestCode` y `requestTitle` (BL-039; la solicitud de origen eliminada o fuera del alcance de solicitudes del actor, `RequestScopeService`, no se nombra: `requestCode`/`requestTitle` llegan `null` y `requestId` se conserva). Los 3 roles de área. |
| POST | `/assets` | Crea un activo (nace BORRADOR). Solo `JEFE_AREA`. |
| GET | `/assets/:id` | Detalle de un activo. |
| GET | `/assets/:id/requests` | Historial de solicitudes que tienen el activo como base (más reciente primero). |
| PATCH | `/assets/:id` | Edita atributos de un activo (no el estado). Solo `JEFE_AREA`. |
| POST | `/assets/:id/status` | Cambia el estado de un activo (transición válida). Solo `JEFE_AREA`. |

**Código visible (oleada 3, PR-D).** `AssetResponseDto.code` (`ACT-0007`) y
`DocumentResponseDto.code` (`DOC-0012`) son de solo lectura: los asigna el sistema, no se
reutilizan y ningún DTO de entrada los acepta (enviar `code` o `number` da 400 por
`forbidNonWhitelisted`). Solo se guarda el número (`number`, secuencias
`assets_number_seq` y `documents_number_seq`); el código se calcula al mapear el DTO con
`formatAssetCode`/`formatDocumentCode` (`plan/visible-code.ts`, prefijos `ACT` y `DOC` en
una sola constante, 4 dígitos mínimo). `DocumentResponseDto.assetCode` lleva el código del
activo del documento. `AssetResponseDto.requestsCount` (solicitudes no eliminadas que
tienen el activo como base) y `documentsCount` salen de `_count` en la misma consulta, sin
N+1; la web los usa para decidir entre «Deshacer» y confirmación al retirar.
`AssetRequestHistoryItemDto.code` añade el código de cada solicitud del historial.
`GET /documents?q=` busca en el título y, si el texto parece un código (`DOC-0012`,
`doc-12`, `12`), también por el número del documento. **Decisión:** se creó un código
propio porque el único id legible existente (el `PRY-` de la solicitud de origen) puede
faltar (`requestId` es nulo), no es único por activo y no identifica un documento.
`GET /codes/{code}` no se extiende a ACT/DOC en esta oleada (BL-082).
El activo es genérico: ya no tiene tipo/tecnología/fuente/frecuencia (esos atributos
pertenecen a cada solicitud). `generalDescription` lo describe en general. El jefe define
con `visibleProcessIds` qué procesos pueden ver/usar el activo (tabla puente
`AssetProcessVisibility`); el proceso propietario (`processId`) siempre es visible. El
líder solo **asocia** activos visibles a sus solicitudes y gestiona los documentos
vinculados.

### Documentos (`document/document.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/documents` | Lista documentos en alcance (sin contenido; filtros `assetId`, `processId`, `requestId`, `categoryCode`, `status`) con el [patrón de listado paginado](#listados-paginados-oleada-3-pr-b): `q` en el título; `sort` ∈ `createdAt` (por defecto, descendente), `title`, `status`; `take` como alias obsoleto. Cada documento (también en el detalle y en `pending-approval`) añade `assetName`, `requestCode` y `requestTitle` (BL-039; el proyecto eliminado no se nombra). |
| POST | `/documents` | Crea un documento + versión 1 (contenido Markdown). La `categoryCode`, si llega, debe existir y estar activa en la maestra `DOC_CATEGORY` (`400` «La categoría del documento no existe o está inactiva.»). |
| GET | `/documents/:id` | Metadatos del documento + versión vigente (sin contenido). |
| PATCH | `/documents/:id` | Edita metadatos (título/categoría; no estado ni contenido). Una `categoryCode` nueva se valida contra `DOC_CATEGORY` (`400` si no existe o está inactiva; `null` la desliga); la categoría ya guardada no se revalida al cambiar solo el título. |
| POST | `/documents/:id/versions` | Editar contenido = crear una nueva versión. **D9:** si el documento está *Vigente* vuelve a *Borrador* en **toda categoría** (el contenido vigente debe ser el aprobado) y necesita aprobación; *Pendiente de aprobación* solo vuelve a borrador en la documentación de cierre; los demás estados conservan su estado. |
| GET | `/documents/:id/versions` | Historial de versiones (sin contenido). |
| GET | `/documents/:id/versions/:versionId/content` | Contenido Markdown de una versión. |
| GET | `/documents/:id/content` | Contenido Markdown de la versión vigente (atajo). |
| POST | `/documents/:id/status` | Cambia el estado del documento (líder/jefe). **D9:** el paso directo a *Vigente* (publicar un borrador o reactivar un archivado) es solo del **jefe de área** (`403` «Solo el jefe de área puede publicar directamente; envía el documento a aprobación.» al líder); el líder envía a aprobación, archiva o devuelve a borrador. La aprobación `PENDIENTE_APROBACION → VIGENTE` sigue siendo del jefe (`/review`) y la documentación de cierre no se publica directo (`409`). Los documentos hoy *Vigentes* sin aprobación registrada no se degradan. |
| GET | `/documents/pending-approval` | Documentos pendientes de aprobación en alcance (jefe/líder). |
| POST | `/documents/:id/submit-approval` | Envía el documento a aprobación (→ *Pendiente de aprobación*). |
| POST | `/documents/:id/review` | Aprueba (→ *Vigente*) o rechaza (→ *Rechazado*, motivo obligatorio). Solo `JEFE_AREA`. |

Reglas: el contenido de un documento es inmutable por versión (editar crea una nueva
versión y conserva la previa); el estado y la aceptación los mueven solo los helpers de
estado, no un DTO libre; retirar un activo es un cambio de estado (sin borrado físico).
Aprobación documental: `BORRADOR → PENDIENTE_APROBACION → VIGENTE | RECHAZADO`; un
rechazado puede volver a borrador o reenviarse. La documentación de cierre (categoría
`CIERRE`) no puede publicarse sin aprobación (`409`) y, si se edita estando enviada o
aprobada, vuelve a *Borrador*. Los documentos de un proyecto cerrado no admiten cambios
(`409`). El listado acepta además los filtros `requestId` (documentos vinculados al
proyecto o a su activo de origen) y `categoryCode`.

## closure — Cierre formal de proyectos
Valida y gestiona el cierre de un proyecto (solicitud con plan autorizado).

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/closure` | Estado funcional del cierre, validaciones (tareas, documentación), solicitud pendiente e historial; trae `requestCode` y `requestTitle`. |
| POST | `/requests/:id/closure` | Solicita el cierre (jefe/líder). `409` con el motivo si hay tareas sin terminar o la documentación de cierre falta o no está aprobada. |
| POST | `/requests/:id/closure/decision` | Aprueba (→ solicitud *Cerrada*, registra `closedAt`/`closedByUserId`) o rechaza con observaciones. Solo `JEFE_AREA`. |
| POST | `/requests/:id/reopen` | Reabre un proyecto cerrado con motivo (→ *En ejecución*). Solo `JEFE_AREA`. |
| GET | `/closures/pending` | Cierres pendientes de aprobación en alcance (Aprobaciones). |

Estado funcional derivado (no se persiste): *En ejecución*, *Pendiente de documentación*,
*Pendiente de aprobación documental*, *Ejecución finalizada*, *Pendiente de aprobación de
cierre* y *Cerrado*; se reutilizan los estados operativos existentes (`EN_EJECUCION`…
`CERRADA`). Tras el cierre se bloquean (`409`) la edición de la ficha, la eliminación, el
plan, fases, tareas, dependencias y la documentación del proyecto. Todas las acciones se
auditan (`PROJECT_CLOSURE` y `REQUEST`).

## notification — Centro de notificaciones
Desde BL-045 los textos incluyen el ID visible de la solicitud o tarea nombrada (módulo `notification-text.ts`): el código va al final del título (`Plan devuelto · PRY-0012`) y como `PRY-0012 «Título»` en el mensaje. Aplica a asignación, revisión, aprobación y devolución de tarea, plan pendiente/autorizado/devuelto, todas las tareas completadas, cierre (solicitado, aprobado, rechazado), reapertura y aprobación pendiente por priorización. `notify` respeta los topes (título 255, mensaje 1000) cortando por palabra y añadiendo «…». Los correos de la API (invitación, restablecer contraseña, aviso de actividad recurrente) no nombran solicitudes ni tareas y no cambian.
Notificaciones por usuario generadas por eventos reales del backend; cada usuario solo
ve y marca las suyas.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/notifications` | Notificaciones del usuario actual y contador de no leídas (`take`, `unreadOnly`). |
| POST | `/notifications/:id/read` | Marca una notificación propia como leída (`404` si es ajena). |
| POST | `/notifications/read-all` | Marca todas como leídas. |

Eventos: compromiso pendiente de aprobación (jefes del área), plan pendiente de
autorización (jefes y líderes), plan autorizado o devuelto (quien lo envió y líderes),
tarea asignada (responsable), tarea por aprobar (`TASK_REVIEW_REQUESTED`: líderes del proceso y jefes del área cuando una tarea llega a revisión), tarea aprobada o devuelta (`TASK_APPROVED` / `TASK_RETURNED`: el responsable, cuando otra persona la aprueba o la devuelve), documentación pendiente de aprobación (jefes),
documentación aprobada o rechazada (quien la envió), plan con todas sus tareas
terminadas (líderes y jefes), solicitud de cierre (jefes), cierre aprobado o rechazado
(solicitante y líderes) y reapertura (líderes). El autor de la acción no se notifica a sí
mismo; un fallo al notificar nunca revierte la acción de negocio.

## governance — Gobierno de la demanda (gates GC1–GC5)

Ciclo de control proporcional sobre cada solicitud. Lectura con capacidad `frameworks`
(3 roles); las mutaciones exigen capacidad `review` (`JEFE_AREA`/`LIDER_PROCESO`).

### Gates y bloqueo (`gate-check/gate-check.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/gates` | Tablero de los 5 gates GC1–GC5 de la solicitud. |
| POST | `/requests/:id/gates/:gateCode/pending-items` | Registra un faltante de un gate (qué/quién/fecha). |
| PATCH | `/requests/:id/gates/:gateCode/pending-items/:itemId` | Resuelve/edita un faltante. |
| POST | `/requests/:id/gates/GC4/request-validation` | Preparación GC4: `EN_EJECUCION → EN_VALIDACION`. |
| POST | `/requests/:id/gates/GC4/mark-ready` | Preparación GC4: `EN_VALIDACION → LISTA_PARA_LIBERAR`. |
| POST | `/requests/:id/gates/GC5/confirm-stabilization` | Preparación GC5: `EN_ESTABILIZACION → OPERATIVA`. |
| POST | `/requests/:id/gates/:gateCode/approve` | Aprueba **GC4** por la autoridad (`LISTA_PARA_LIBERAR → EN_ESTABILIZACION`). **GC5 ya no cierra la solicitud** (D10): sin un cierre formal aprobado responde `409` («El cierre se solicita y se aprueba desde el cierre del proyecto.»); con la solicitud `CERRADA` y un cierre `APROBADO` devuelve el control sin cambios. GC1–GC3 → `409`. |
| POST | `/requests/:id/gates/:gateCode/waive` | Marca un gate `NO_APLICA` (requiere motivo y ruta compatible). Solo sobre un control `PENDIENTE`: `CUMPLIDO` o `NO_APLICA` → `409`. |
| POST | `/requests/:id/block` | Bloquea la solicitud (flag transversal; no cambia el estado). |
| POST | `/requests/:id/unblock` | Desbloquea la solicitud (flag transversal). |
| PUT | `/requests/:id/governance-route` | Fija/cambia la ruta proporcional (manual, auditada). |

### Validaciones y evidencias (`validation/validation.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/validations` | Historial de validaciones de la solicitud. |
| POST | `/requests/:id/validations` | Registra una validación/evidencia (no aprueba el gate). El ejecutor debe existir y estar activo (`400`) y la fecha no puede ser posterior a hoy (`400`, 5 min de holgura). Quien no es jefe ni líder del proceso principal solo registra las suyas (`403`, D11). |
| PATCH | `/requests/:id/validations/:validationId/resolve-blocking` | Resuelve un defecto bloqueante (no aprueba el gate). |

Reglas clave: registrar una validación nunca aprueba un gate (son operaciones
distintas); GC1–GC3 no se aprueban por autoridad; una solicitud bloqueada no se puede
liberar; la evidencia puede fijar una versión concreta de documento (evidencia
inmutable). El estado del gate solo lo escribe el servicio de estado dentro de su
transacción.

**Un solo camino de cierre (D10).** El cierre del proyecto es el cierre formal (`closure`:
solicitud del líder, aprobación del jefe). Al aprobarlo, `ClosureService.decide` deja el
control GC5 en `CUMPLIDO` (con `decidedByUserId`/`decidedAt`, creándolo si no existía,
en la misma transacción y con auditoría `GATE_CHECK`); GC5 se muestra `CUMPLIDO` en toda
solicitud `CERRADA`. Reabrir no revierte GC5 (queda como historia). Los proyectos
ya cerrados no se reescriben, salvo la migración `20261118120000_gc5_refleja_cierre_formal`,
que solo pasa a `CUMPLIDO` los GC5 `PENDIENTE` de solicitudes cerradas con un cierre
aprobado (idempotente).

**Controles congelados (D11).** Con la solicitud `CERRADA`, `waive`, ruta, faltantes,
bloqueo y desbloqueo, avance de etapas, `approve` de GC4, registrar una validación y
resolver un bloqueo responden `409` («El proyecto está cerrado; reabre el proyecto para
modificar sus controles.»). La lectura no cambia.

## audit — Auditoría (registro append-only)

Lectura de la bitácora inmutable de mutaciones, con alcance por rol aplicado en el
service.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/audit-events` | Lista paginada de eventos con alcance por rol. Filtros `objectType`, `action` (`CREATE`, `UPDATE`, `DELETE`, `REVOKE`, `LOGIN_FAILED`, `PASSWORD_RESET_THROTTLED`) y `objectCode` (código visible completo `PRY-0012`, `PRY-0012-F2`, `PRY-0012-T07`, `ACT-0007` o `DOC-0003`, sin distinguir mayúsculas; forma inválida → 400; un código inexistente o de otro `objectType` devuelve lista vacía, nunca 404, y el alcance por rol sigue aplicándose); paginación `page`/`pageSize` (pageSize ≤ 100, por defecto 25). Cada evento trae `objectCode` y `objectLabel` (nulos si el objeto ya no existe, si su tipo no tiene etiqueta o si su `objectId` no es un UUID, como en `LOGIN_FAILED`, que guarda el identificador escrito): solicitud, fase y tarea con su código y título o nombre; activo y documento con `ACT-`/`DOC-` y su nombre o título; usuario, área, proceso y elemento de maestra solo con etiqueta. Se resuelven por lote, una consulta por tipo de objeto presente en la página (sin N+1) y solo para eventos ya visibles para el actor. **Oleada 4, PR B:** filtros de investigación `actorUserId` (uuid de quien originó el evento), `processId` (uuid, sobre `scopeProcessId`), `from` y `to` (`YYYY-MM-DD`, inclusivos en hora local del servidor: `from` desde las 00:00 y `to` hasta el fin del día; fecha irreal, `from` posterior a `to` o rango de más de 366 días → 400 en español). Se añaden en un `AND` aparte del alcance por rol, de modo que solo lo intersectan: el `OR` del líder y la restricción propia del integrante quedan intactos. Cada evento trae además `actorName` (nombre de quien actuó; nulo si fue el sistema o el usuario ya no existe), resuelto con una sola consulta de usuarios por página. Devuelve `{ data, page, pageSize, total, hasMore }`; el alcance por rol se aplica antes de paginar. |

## system-settings — Administración de sistema (rol ADMIN)

Configuración técnica del sistema, reservada al rol de sistema `ADMIN`. Agrupa la
configuración SMTP en runtime y la gestión de administradores. Todos los endpoints se
protegen a nivel de clase con `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(ADMIN)`.

Configuración SMTP (`smtp-config.controller.ts`), base `/admin/smtp-config`:

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/admin/smtp-config` | Estado de la configuración (nunca el password; devuelve `passwordSet` y `source`). 200 siempre, aunque no haya fila. |
| PATCH | `/admin/smtp-config` | Crea/actualiza la fila singleton. PATCH (no PUT) por el CORS del backend. |
| POST | `/admin/smtp-config/test` | Envía un correo de prueba con la configuración efectiva; responde 200 (nunca lanza) con `{ ok, message }` y, en fallo, `hint?`/`code?` opcionales. Los errores crudos del servidor (p. ej. el volcado de diagnóstico de Office365) se traducen a mensajes legibles vía `classify-smtp-error.ts`, sin secretos ni stack. |

Reglas clave: el password se guarda cifrado (AES-256-GCM, `settings-crypto.ts`, clave
`SETTINGS_ENCRYPTION_KEY`) y nunca se devuelve. Convención del password al actualizar:
ausente conserva; valor no vacío cifra y reemplaza; cadena vacía `''` → `400` (usar
`clearPassword`); `clearPassword:true` limpia; password no vacío + `clearPassword` → `400`.
La resolución efectiva del correo es BD > entorno > ninguna (`MailConfigResolver` del
módulo mail); `APP_WEB_URL` siempre proviene del entorno, nunca de la BD. Cada cambio se
audita como `SMTP_CONFIG` sin registrar el password ni el ciphertext.

Administradores del sistema (`admin-users.controller.ts`), base `/admin/users`:

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/admin/users` | Lista usuarios con su flag `isAdmin`. |
| PATCH | `/admin/users/:id/admin-flag` | Promueve/degrada a un usuario como ADMIN. `404` si no existe. |

Reglas clave: no se permite degradar al último administrador activo (`400`). El cambio se
audita como `USER`. El flag `isAdmin` NO se expone en el DTO del módulo `user`, para que un
`JEFE_AREA` no pueda autopromoverse.

## ai — Agentes de IA (Fase 1: triage que sugiere)

Integra IA (AWS Bedrock, familia Anthropic Claude) de forma **100% administrable desde la
plataforma**: credenciales, encendido/apagado, modelo, región y prompt se gestionan desde
el Admin, no desde código. La IA **arranca apagada**. El cliente de Bedrock vive aislado
tras una interfaz (`bedrock.client.ts`, token de inyección `BEDROCK_CLIENT`), de modo que
el resto del backend no depende del SDK y se puede sustituir por un doble en pruebas. El
catálogo de modelos permitidos es una lista **cerrada** (`bedrock-model-catalog.ts`); un
modelo fuera del catálogo → `400`.

Agentes de IA sembrados (`ai-defaults.ts`): `TRIAGE` y `ASISTENTE` (asistente conversacional del
portal; su prompt base fija el uso obligatorio de herramientas, la honestidad ante la falta de datos
y que las acciones que modifican datos se proponen y las confirma una persona). Ambos nacen apagados
y se editan desde el Admin; el chat del asistente llega en una fase posterior.

Consumo y presupuesto de IA (`ai-usage.service.ts`): cada llamada al modelo registra una fila en
`ai_usage` (agente, usuario, modelo, tokens, costo estimado, duración; nunca el contenido). El costo
usa el precio por millón de tokens del catálogo de modelos (`ai_model`); un modelo sin precio registra
costo `null`; los tokens de caché de prompt se estiman con la tarifa de Bedrock (lectura al 10 % y escritura al 125 % del precio de entrada). Antes de invocar, el triage (y en adelante el asistente) llama a `assertWithinBudget`:
si el gasto del mes alcanzó el tope → `409` sin tocar Bedrock. Al cruzar el umbral de alerta y el
tope se escribe un aviso en el log del servidor y se notifica en el centro de notificaciones a las
personas administradoras activas (`isAdmin`), una sola vez por cruce: tipos `AI_BUDGET_ALERT` (llegó
al umbral) y `AI_BUDGET_EXCEEDED` (se agotó el tope), con enlace a `/administracion/ia`. Los meses se
miden en UTC.

Cliente de IA (`bedrock.client.ts`, interno, sin endpoints nuevos): además de `invoke`/`ping`,
expone `converse` y `converseStream` (API Converse de Bedrock) para conversaciones multi-turno con
tool use, imágenes y documentos. Los tipos propios y la traducción al SDK viven en
`bedrock-converse.ts`; los nombres de tool del MCP (con punto) se codifican como `__` hacia Bedrock
y se decodifican al volver. `temperature` se omite si no se informa (modelos que la rechazan).
Con `cache: true` marca con `cachePoint` el final de las tools, del prompt de sistema y del último
mensaje, para que el asistente reutilice las ~10 mil tokens de definiciones entre rondas y turnos
(verificado en Bedrock: la primera llamada escribe en caché y la siguiente la lee). El asistente lo
activa solo si el modelo tiene `supportsPromptCache`.

Configuración de IA (`ai-config.controller.ts`), base `/admin/ai`, solo `ADMIN`
(`@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(ADMIN)`, PATCH no PUT):

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/admin/ai/config` | Estado global + lista de agentes + catálogo de modelos permitidos (`models`: modelos habilitados con `id`, `label`, `tier` y capacidades; viene de la tabla `ai_model`) para alimentar el selector del Admin. Nunca incluye el secret ni el ciphertext (solo `secretSet` y `accessKeyIdLast4`). |
| GET | `/admin/ai/usage` | Consumo de IA del mes (`?month=YYYY-MM`, UTC): llamadas, tokens, costo estimado, desglose por agente y por modelo, llamadas sin precio y estado del presupuesto (`budget`: tope, gasto, `usedPct`, `alert`, `exceeded`). |
| GET | `/admin/ai/models` | Catálogo completo de modelos de IA con sus capacidades (`supportsTemperature`, `supportsTools`, `supportsVision`, `supportsDocuments`, `supportsPromptCache`, `enabled`), precios (`inputUsdPerMTok`, `outputUsdPerMTok`, `null` = sin precio) y `sortOrder`, incluidos los deshabilitados. |
| POST | `/admin/ai/models` | Da de alta un modelo (`modelId` invocable, nombre, tier y capacidades). `409` si el id ya existe. Audita `AI_CONFIG`. |
| PATCH | `/admin/ai/models/:modelId` | Edita nombre, tier, capacidades, precios (`null` quita el precio), orden o habilitado de un modelo. `404` si no existe. Los modelos por defecto se siembran al arrancar sin pisar cambios. |
| PATCH | `/admin/ai/config` | Actualiza la configuración global (encendido, modo de credenciales, claves, tope mensual `monthlyBudgetUsd` —`null` lo quita; por defecto 100 USD— y `budgetAlertPct`, por defecto 80). Regla determinista del secret como en SMTP. |
| GET | `/admin/ai/agents/:code` | Configuración de un agente por `code` (p. ej. `TRIAGE`). `404` si no existe. |
| PATCH | `/admin/ai/agents/:code` | Actualiza un agente (encendido, región, modelo, prompt, temperatura, tokens, timeout). Valida que el modelo exista y esté habilitado en el catálogo → `400`. Si el modelo no soporta `temperature`, la invocación la omite. |
| POST | `/admin/ai/agents/:code/test` | Prueba la conexión con Bedrock; responde `{ ok, message }` sin secretos ni stack. En modo `access-keys` descifra el secret solo en ese momento; si falla → `{ ok:false }`. |

Agentes por defecto: el Admin solo EDITA agentes existentes (no hay endpoint de creación). Al arrancar, `AiConfigService.onModuleInit` llama a `ensureDefaultAgents`, que crea (apagado) el agente `TRIAGE` si falta, con `upsert` de `update` vacío: nunca pisa lo que el admin haya cambiado. Un fallo al asegurarlo se registra y no impide arrancar la API. Los valores por defecto (prompt, modelo, parámetros) viven en `ai-defaults.ts` y los comparte el seed de Prisma.
Sugerencia de triage (`triage-suggestion.controller.ts`), base `/requests/:id`, roles
`JEFE_AREA`, `LIDER_PROCESO`, `ADMIN`:

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/requests/:id/ai/triage-suggestion` | Sugiere (no persiste) campos de triage, banda de prioridad `P1`–`P4` y posibles duplicados. Reutiliza el alcance por proceso (`404` fuera de alcance). Degrada: apagado → `409` sin invocar Bedrock, descifrado fallido → `409`, timeout → `503`, fallo de dependencia → `503`, salida no‑JSON o que no valida → `422`. Nunca persiste ni devuelve `500` con stack. La sugerencia propone el **proceso principal** (`suggestedMainProcessId`, UUID de un proceso activo de tipo `PROCESS`; `null` si el id es inválido, no elegible o la solicitud ya tiene proceso) en lugar de la antigua ruta (`suggestedRouteCode`, retirada del contrato de salida). |

Reglas clave: el secret de AWS se guarda cifrado (AES‑256‑GCM, se reutiliza
`settings-crypto.ts` de system-settings vía `ai-crypto.ts`, misma clave
`SETTINGS_ENCRYPTION_KEY`); el contrato del secret es determinista (ausente conserva, no
vacío cifra, `''` → `400`, `clearCredentials` limpia y no se combina con un secret no
vacío). En modo `iam-role` no se guardan claves (el SDK resuelve el rol de la instancia).
La sugerencia valida cada `suggested*Code` (tipo de demanda, criticidad, tamaño y disponibilidad de datos) contra las maestras activas (code inválido →
`null` + nota), valida `suggestedMainProcessId` contra los procesos activos de tipo `PROCESS` (solo se ofrecen si la solicitud aún no tiene proceso principal; inválido → `null` + nota) y descarta duplicados cuyo `requestId` no estaba en el contexto. El prompt por defecto del agente `TRIAGE` describe el proceso principal en lugar de la ruta; la migración de datos `20261110120000_triage_prompt_proceso_principal` lo actualiza en una BD existente **solo si el prompt sigue siendo el original** (no pisa ediciones hechas desde Admin IA). Los cambios
de configuración se auditan como `AI_CONFIG`.

## assistant — Asistente de IA (consulta, solo lectura)

Asistente conversacional del portal (`assistant.controller.ts`, base `/assistant`, cualquier
persona autenticada). Responde preguntas sobre proyectos/solicitudes y uso del portal.
Es un **bucle de agente** sobre Bedrock Converse cuya única fuente de datos son las
**herramientas de solo lectura del MCP**, ejecutadas con el **token de la persona** (hereda su
alcance y permisos; la API reenvía el `Authorization: Bearer` del propio usuario). Nunca escribe
datos por sí solo: las escrituras son propuestas que la persona confirma. Usa el agente `ASISTENTE` (configurable en Admin IA), registra el consumo y
respeta el presupuesto mensual.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/assistant/status` | `{ available, reason, simulated, attachments }`: disponible si el MCP está configurado (`ASSISTANT_MCP_URL`), la IA y el agente `ASISTENTE` están encendidos y el presupuesto no se agotó. `simulated` es `true` cuando el modelo es el cliente simulado (`ASSISTANT_MODEL_PROVIDER=simulated`, solo con `NODE_ENV` distinto de `production`; en producción la variable se ignora y se registra un error). El simulado responde «[Simulación] …» con el eco del mensaje, sin AWS ni herramientas, y deja consumo fijo en el registro de IA; no altera `available`. La variable no está en `compose.prod.yaml` ni en `.env.production.example`. `attachments` trae los límites de los adjuntos (archivos por mensaje, tamaño máximo por tipo, caracteres del texto extraído y extensiones permitidas) para que la interfaz no los duplique. |
| POST | `/assistant/attachments` | Sube un archivo (multipart, campo `file`) y devuelve el adjunto con el **texto extraído**. `400` si el tipo o el contenido no corresponden o supera el máximo; `409` si el asistente está apagado, sin presupuesto o su modelo no lee ese tipo; `422` si no tiene contenido legible; `502` si el modelo falla. |
| PATCH | `/assistant/attachments/:id` | Corrige el texto extraído de un adjunto propio **aún sin enviar** (`409` si ya se envió). |
| DELETE | `/assistant/attachments/:id` | Quita un adjunto propio sin enviar y borra su archivo (`204`). |
| POST | `/assistant/chat` | Envía `{ conversationId?, message, attachmentIds? }` (mensaje de hasta 4000; puede ir vacío solo si hay adjuntos, máx. 5) y responde `text/event-stream` con los eventos `conversation`, `text`, `tool`, `done` y `error`. `409` si está desactivado, sin presupuesto o sin sesión con token; `404` si la conversación no es de la persona. |
| GET | `/assistant/conversations` | Las 50 conversaciones más recientes **de la persona**. |
| GET | `/assistant/conversations/:id` | Conversación propia con sus mensajes y las herramientas consultadas por turno. `404` si no es suya. |
| DELETE | `/assistant/conversations/:id` | Elimina una conversación propia (`204`). |
| POST | `/assistant/proposals/:id/confirm` | Confirma una propuesta de acción y la **ejecuta** con el token y los permisos de la persona. Responde la propuesta resuelta: `CONFIRMADA` (con `resultId`/`resultTitle`) o `FALLIDA` (con el motivo de la API). `404` si no es suya; `409` si ya no está pendiente (vencida, confirmada, descartada o en ejecución). |
| POST | `/assistant/proposals/:id/discard` | Descarta una propuesta pendiente sin ejecutarla. |

**Adjuntos (F4a).** La persona sube imágenes (PNG, JPEG, WebP, GIF; hasta 3,75 MB) y documentos (PDF,
Word, Excel; hasta 4,5 MB; CSV, Markdown y TXT hasta 1 MB, que se leen directamente), hasta 5 por
mensaje (`assistant-attachments.service.ts`). El backend valida la extensión **y la firma real del
archivo** (no acepta un ejecutable renombrado), guarda el original en S3 y pide al modelo del asistente
(con visión o lectura de documentos, según su capacidad en el catálogo) el contenido **como texto**,
recortado a 20 000 caracteres; el consumo se registra y respeta el presupuesto. La persona ve y puede
corregir ese texto antes de enviar. Al enviar, el texto viaja al modelo dentro de `<adjunto nombre=… tipo=…>`
como **dato no confiable**: el contenido no puede cerrar la etiqueta y el prompt del sistema indica que
nunca se obedecen instrucciones que aparezcan en un adjunto. Los adjuntos de mensajes anteriores se
incluyen en el historial de la conversación.

**Memoria entre turnos.** El modelo solo conserva el texto de la conversación, así que antes inventaba
identificadores y repetía acciones ya hechas. Ahora, por cada consulta correcta, el turno guarda en
`ai_message.tools` un resumen con los ids (`memory`, un renglón por registro con su id y nombre, máx. 40)
y los argumentos (`args`); al armar el historial se reinyecta como `<memoria_herramientas>` junto con
`<propuestas>`, el estado **actual** de cada propuesta del turno (confirmada con el id creado, fallida con
su motivo, pendiente, descartada o vencida). Esa memoria no se expone por la API (`GET
/assistant/conversations/:id` sigue devolviendo solo nombre, etiqueta y estado). Antes de registrar una
propuesta el servicio verifica que (1) todo identificador esté completo y haya aparecido en la
conversación (en un mensaje, un adjunto, una consulta o el resultado de una acción ya hecha) y (2) no
exista ya una propuesta idéntica pendiente o confirmada; si no, la rechaza con el motivo para que el modelo
consulte el dato correcto o no repita la acción. El prompt de sistema explica el flujo de una solicitud
(registrada → triage → priorización → aprobación humana → plan), pide consultar el estado antes de
proponer un paso, cargar cronogramas con una sola propuesta `plan.import` y no pedir lo que se puede
consultar. El agente `ASISTENTE` nace con 8192 tokens de salida (un plan largo no cabe en 2048).

**Propuestas de acción (F3).** El asistente nunca escribe datos: solo puede *proponer* con una lista
cerrada de tools de escritura (`request.create`, `request.update`, `request.triage.create`,
`request.priority.create`, `plan.create`, `task.create`, `task.update`, `task.status.update`,
`meeting.create`, `meeting.update`,
`commitment.create`, `commitment.update`, `commitment.transition`, `plan.update`, `phase.create`,
`phase.update`, `phase.reorder`, `task.dependency.add`, `asset.create`, `asset.update`,
`document.create`, `document.update`, `document.version.create` y `plan.import`, que carga un cronograma
completo —fases, tareas y dependencias— en **una sola** propuesta y es la única tool marcada como
destructiva que se admite, porque la API solo la aplica sobre un plan en borrador o devuelto). Quedan
fuera las decisiones (aprobar, autorizar o devolver, aceptar tareas, compuertas de gobierno), el borrado
y la administración. Con la regla de cierre (BL-036 E3), `task.status.update` desde el asistente está sujeta a la misma regla de la API (la llamada va con el token de la persona: `409` si faltan avance 100 % o evidencia, `403` si un integrante intenta terminar o reabrir) y el prompt del asistente le indica no proponer terminar ni reabrir a un integrante y revisar `evidenceRequired`/`hasEvidence` con `task.get`. Al pedir una de esas tools el modelo debe rellenar `resumen_para_la_persona` (frase
con nombres; no viaja a la API); el servicio valida ese resumen y los campos obligatorios del esquema, y
guarda una propuesta `PENDIENTE` (máximo 5 por turno) que emite como evento SSE `proposal`. Solo la
persona dueña puede confirmarla; la transición `PENDIENTE → EJECUTANDO` es atómica (no se ejecuta dos
veces), la llamada va por el MCP con su token, y la API aplica sus permisos y audita la escritura como
cualquier otra. Una propuesta sin respuesta vence a las 24 h (`EXPIRADA`, calculado al leer) y una
ejecución sin terminar tras 10 min se muestra como `FALLIDA`. `GET /assistant/conversations/:id` incluye
las propuestas de cada mensaje con su estado.

Reglas: máximo 8 rondas de herramientas por turno; los resultados de herramientas se recortan a
30 000 caracteres; no se ofrecen al modelo las tools `dev.*` ni `health.*`, y de las de escritura solo
las propuestas anteriores; el contexto del modelo son los últimos 30 mensajes (texto). Las conversaciones son
**privadas** (ni siquiera un administrador las ve por la API). Las rutas del asistente están
excluidas del MCP (es un cliente del MCP). Nginx da 300 s de lectura a `/api/` y el flujo envía
`X-Accel-Buffering: no`.

## help — Ayuda del portal (búsqueda en la documentación de uso)

Busca en la documentación de uso para responder «¿cómo hago X?» sin inventar (`help.controller.ts`,
base `/help`, cualquier persona autenticada; la documentación no contiene datos de negocio).

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/help/search` | `?q=` (2..200 caracteres) y `limit` (1..8, por defecto 4). Devuelve `{ query, results: [{ source, file, heading, excerpt, score }] }`; lista vacía si nada coincide. |

Cómo funciona: lee al primer uso `docs/aplicacion/README.md`, `frontend-pantallas.md` y
`autenticacion-autorizacion.md` (carpeta configurable con `HELP_DOCS_DIR`; la imagen de la API las
incluye) y las parte en secciones por encabezado `##`/`###`; **cada fila de una tabla es su propia
sección**, titulada con el nombre de la pantalla. Puntúa por coincidencia de raíz de palabra sin
distinguir tildes (el encabezado pesa más que el cuerpo). Excluye las secciones técnicas pensadas para
quien desarrolla (sincronía de documentación, límites de arquitectura, guards, actor, credenciales por
correo). Está expuesta en el MCP como la tool `help.search`; el asistente la usa para dudas de uso.

## search — Búsqueda por texto de solicitudes y tareas (oleada 4, PR A)

Búsqueda de solo lectura que alimenta la paleta `Ctrl/⌘+K` de la web (`search.controller.ts`, base
`/search`, roles `JEFE_AREA`, `LIDER_PROCESO` e `INTEGRANTE`, los mismos de `GET /codes/:code`). No
registra auditoría.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/search` | `?q=` obligatorio (de 2 a 80 caracteres tras recortar espacios; 400 en español si no) y `limit` (1 a 20, por defecto 10, **por grupo**). Devuelve `SearchResponseDto`: `{ requests: CodeResolutionDto[], tasks: CodeResolutionDto[], truncated }`, con la misma forma que `GET /codes/:code`. |

Reglas:

- **Alcance único**: parte de `requestScopeWhere(actor)` y el texto solo lo intersecta. Solicitudes con
  `buildRequestWhere(scope, { q }, { searchRequester: true })` (código, título y nombre del solicitante);
  tareas por código o título con `phase.plan.request` = mismo alcance. Las fases no se buscan por texto
  (se llega a ellas por su código con `GET /codes/:code`).
- **Orden**: la coincidencia exacta del código (normalizado como en `GET /codes`) va primero; después,
  solicitudes por `registeredAt` desc y tareas por creación desc.
- **Tope**: lee `limit + 1` filas por grupo; `truncated` es `true` si algún grupo tenía más.
- `contains` sin distinguir mayúsculas, pero **sí distingue tildes** (no se usa la extensión
  `unaccent`): «diseno» no encuentra «Diseño».
- Expuesta en el MCP como la tool `search.global` (solo lectura).

## recurring-activity — Actividades recurrentes (motor de tiempo)

Gestiona las actividades que se repiten con una cadencia (reporte semanal a presidencia,
validación semestral de OKR, etc.). Una **definición** (`RecurringActivity`) describe qué
se repite y con qué cadencia; el **motor** materializa sus **ocurrencias**
(`RecurringActivityOccurrence`), que son las instancias concretas con una fecha objetivo
que alguien realiza y marca como completada.

Helpers lógicos puros del dominio (mismo patrón que `task-status.ts`):

- `recurrence.ts`: enum `Recurrence` (SEMANAL, MENSUAL, TRIMESTRAL, SEMESTRAL, ANUAL) y la
  función pura `nextTargetDatesFrom(cadence, intervalCount, startDate, from, to)` que
  calcula las fechas objetivo dentro de una ventana. Reglas de borde: SEMANAL conserva el
  día de semana de `startDate`; la familia mensual avanza por meses anclando al día de
  `startDate` y, si el mes destino no tiene ese día (p. ej. 31 o 29 de febrero), lo ancla
  al último día del mes. Las fechas son días de calendario (`@db.Date`, medianoche UTC).
  `nextNTargetDates(cadence, intervalCount, startDate, from, n, endDate?)` devuelve las `n`
  próximas fechas objetivo (base de la vista previa del formulario).
- `occurrence-status.ts`: enum `OccurrenceStatus` (PENDIENTE, EN_CURSO, COMPLETADA,
  VENCIDA, CANCELADA) y sus transiciones permitidas; COMPLETADA es terminal, VENCIDA puede
  cerrarse tarde a COMPLETADA y PENDIENTE ↔ CANCELADA es la única arista reversible.
- `occurrence-display.ts`: estado de presentación derivado (`displayStatus`) y acciones
  permitidas. La ventana abre el día `targetDate − prepDays` (`opensOn`): antes es
  PROGRAMADA (sin acciones); con la ventana abierta es PENDIENTE (tomar y completar);
  `targetDate = hoy` es VENCE_HOY; PENDIENTE/EN_CURSO con `targetDate < hoy` se muestra
  VENCIDA aunque el cron aún no la marque y **solo se completa** (no se toma); COMPLETADA
  después del día objetivo (día local de `completedAt`) es COMPLETADA_TARDE.
- `responsible-kind.ts`: enum `ResponsibleKind` (USER, AREA) y la validación "exactamente
  un responsable" (persona o área, nunca ambos ni ninguno), espejo del CHECK de BD.

Motor (`recurring-activity.service.ts` + `recurring-activity.scheduler.service.ts`): dos
operaciones idempotentes que corren como crons in-process (`@nestjs/schedule`,
`ScheduleModule.forRoot()` en `app.module.ts`):

- Generación y reconciliación (`reconcileOccurrences`): por cada definición activa
  inserta las ocurrencias futuras dentro del horizonte `max(anticipationDays o ENV,
  prepDays)` con `createMany` + `skipDuplicates` sobre el par único
  `(activityId, targetDate)` y con el snapshot de `estimatedHours`; correrla dos veces
  no duplica. El cron solo genera. Al crear, al editar campos que mueven ocurrencias
  (cadencia, intervalo, inicio, fin, horas, días de preparación o `active`), al pausar y
  al reanudar se reconcilia además: se **cancelan** las PENDIENTE futuras que ya no
  corresponden (`cancelledAt`/`cancelReason`), se **reactivan** (mismo registro) las
  CANCELADA cuya fecha vuelve a coincidir y se actualizan las horas estimadas de las
  PENDIENTE. EN_CURSO, COMPLETADA y VENCIDA nunca se tocan. Si esa reconciliación falla,
  la definición queda guardada y el cron diario recupera la generación.
- Marcado de vencidas: pasa a VENCIDA las ocurrencias PENDIENTE/EN_CURSO cuyo
  `targetDate` ya quedó en el pasado (`updateMany` filtrado por estado, idempotente).
- Recordatorios por correo: un tercer cron busca ocurrencias PENDIENTE/EN_CURSO cuyo día
  objetivo está dentro de la ventana `RECURRING_ACTIVITY_REMINDER_DAYS` (por defecto 3) y
  cuyo `reminderSentAt` sigue en `null`, envía el aviso y marca `reminderSentAt` (no
  reenvía: idempotente por la marca). Al nacer una ocurrencia en la generación también se
  envía un aviso "nueva". Ambos avisos reutilizan `MailService` y **degradan sin lanzar**
  si no hay SMTP configurado, de modo que la generación y el recordatorio nunca se rompen.
  Destinatarios: la persona responsable (USER) o, para responsable AREA, los usuarios con
  grant activo en algún proceso de esa área (regla inversa).

El "hoy" se calcula como el día local de la zona configurada
(`RECURRING_ACTIVITY_TIMEZONE`, por defecto `America/Lima`), para no correr el día por la
zona del proceso. La configuración (zona, días de anticipación, expresiones cron e
interruptor del motor) se lee del entorno con defaults seguros
(`recurring-activity.config.ts`); con `RECURRING_ACTIVITY_SCHEDULER_ENABLED=false` el
motor no registra crons.

La API REST se reparte en dos controllers delgados que delegan en el service:

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/recurring-activities/run-generation` | Dispara manualmente la generación de ocurrencias debidas (solo ADMIN). |
| POST | `/recurring-activities` | Crea una definición (JEFE_AREA/ADMIN). |
| GET | `/recurring-activities` | Lista las definiciones gestionables por el actor (JEFE_AREA/ADMIN). |
| GET | `/recurring-activities/compliance` | Panel de cumplimiento: agregados a tiempo/destiempo/vencidas por actividad y por responsable en un rango de fechas (JEFE_AREA/ADMIN). |
| GET | `/recurring-activities/:id` | Detalle de una definición dentro de alcance. |
| PATCH | `/recurring-activities/:id` | Edita una definición (datos, responsable, horas, días de preparación, evidencia exigida, pausa). Si cambian las fechas reconcilia las ocurrencias. |
| POST | `/recurring-activities/:id/resume` | Reanuda una definición pausada (`active=true`) y regenera sus ocurrencias (reactiva las canceladas que coinciden). Idempotente; auditada. |
| DELETE | `/recurring-activities/:id` | Pausa la definición (soft-delete `active=false`): no borra la definición ni su historial, pero cancela sus ocurrencias PENDIENTE futuras. |
| GET | `/recurring-activities/occurrences` | Lista ocurrencias por alcance (`scope=mine` por defecto; `all` solo JEFE_AREA/ADMIN). Filtros por estado, cadencia, tipo, rango de fechas y responsable; paginación `page/pageSize` (≤100). Las CANCELADA solo aparecen con `status=CANCELADA`. Cada ocurrencia trae `displayStatus`, `canStart`, `canComplete`, `opensOn`, horas estimadas/reales, quién la tomó/completó y el nombre del responsable. |
| GET | `/recurring-activities/occurrences/:id` | Detalle de una ocurrencia dentro de alcance. |
| POST | `/recurring-activities/occurrences/:id/start` | Toma una ocurrencia (PENDIENTE → EN_CURSO) y registra `startedAt`/`startedByUserId`. `409` si la ventana aún no abre (el mensaje incluye la fecha de apertura) o si ya está vencida. |
| POST | `/recurring-activities/occurrences/:id/complete` | Completa una ocurrencia con `comment` («Qué se realizó», obligatorio, ≤2000) y `actualHours` (obligatorio, > 0). `409` si la ventana aún no abre o si la definición exige adjunto (`requiresEvidence`) y la ocurrencia no tiene ninguno. |
| GET | `/recurring-activities/preview` | Vista previa del formulario (JEFE_AREA/ADMIN): las 3 próximas fechas desde hoy de una recurrencia (`cadence`, `intervalCount`, `startDate`, `endDate?`, `prepDays?`) con el día en que se habilita cada una (`{ dates: [{ targetDate, opensOn }] }`). |
| GET | `/recurring-activities/occurrences/board` | Tablero «Qué me toca» (solo alcance `mine`): `today`, semana ISO en curso (`isoYear`, `number`, `startDate`, `endDate`, en la zona configurada), contadores (`overdue`, `dueToday`, `thisWeek`), `plannedHoursThisWeek` y los grupos `overdue`, `thisWeek` (abiertas con día objetivo hasta el domingo), `upcoming` (posteriores, incluidas las programadas) y `completed` (últimas `completedWeeks` semanas: 4 por defecto, 12 o 0 = todas). |
| GET | `/recurring-activities/occurrences/calendar` | Ocurrencias de un rango `from`–`to` (obligatorios, máximo 62 días; `400` si se excede) para la vista de calendario. Mismo alcance y filtros de responsable que el listado; sin canceladas; tope 500 filas. |
| GET | `/recurring-activities/occurrences/my-work` | Ocurrencias del actor que ya se pueden trabajar, para «Mi trabajo»: `{ items, total }` con las de estado de presentación VENCIDA, VENCE_HOY, EN_CURSO y PENDIENTE (ventana abierta), en ese orden. Excluye programadas, completadas y canceladas. |
| GET | `/recurring-activities/occurrences/:id/evidence` | Lista los adjuntos de la ocurrencia (metadatos). |
| POST | `/recurring-activities/occurrences/:id/evidence` | Adjunta un archivo (multipart `file`, uno por petición). Mismas reglas de tipo y tamaño que las evidencias de tareas (`EVIDENCE_MAX_BYTES`). `409` si la ocurrencia no está abierta (programada, completada o cancelada). |
| GET | `/recurring-activities/occurrences/:id/evidence/:evidenceId/download` | URL temporal (prefirmada) de descarga del adjunto. |
| DELETE | `/recurring-activities/occurrences/:id/evidence/:evidenceId` | Quita un adjunto; solo mientras la ocurrencia está abierta (`409` si no). |

Adjuntos de ocurrencias (`occurrence-evidence.service.ts`): se suben **antes** de
completar; `complete` solo comprueba que exista al menos uno cuando la definición lo
exige. Ver y descargar: cualquiera con la ocurrencia en alcance; subir y quitar: el mismo
alcance, y solo con la ocurrencia abierta (ventana abierta, en curso o vencida). El objeto
vive en S3 con la clave `actividades-recurrentes/{activityId}/{occurrenceId}/{uuid}-{nombre}`;
si falla el registro en BD se borra el objeto. Las reglas de archivo (tipos permitidos,
tamaño máximo, nombre seguro) son compartidas con las evidencias de tareas
(`storage/evidence-file.ts`). Cada alta o baja se audita sobre
`RECURRING_ACTIVITY_OCCURRENCE`. Cada ocurrencia expone `evidenceCount`.

Avisos internos (centro de notificaciones): el cron `recurring-activity:notices`
(`RECURRING_ACTIVITY_NOTICES_CRON`, por defecto `0 6 * * *`) emite
`RECURRING_WINDOW_OPEN` cuando una ocurrencia PENDIENTE entra en su ventana
(hoy ≥ día objetivo − `prepDays`) y `RECURRING_DUE_TODAY` cuando vence hoy;
`markOverdueOccurrences` emite `RECURRING_OVERDUE` al pasarla a VENCIDA. Cada aviso se
reclama una sola vez con `updateMany` sobre su marca (`windowNotifiedAt`,
`dueNotifiedAt`, `overdueNotifiedAt` en null), así que correr los crons dos veces no
duplica notificaciones. Destinatarios: la persona responsable o los usuarios activos del
área responsable. Un fallo al notificar se registra y no interrumpe el cron.

Autorización por alcance (regla única de pertenencia a área): las áreas del actor se
derivan de sus procesos con grant activo (`Process.areaId`), ya que el actor no expone
áreas directamente. `scope=mine` devuelve las ocurrencias cuya definición tiene al actor
como responsable USER o es de un área suya. La gestión de definiciones es libre para ADMIN
y, para JEFE_AREA, solo si el área objetivo (o el área del usuario responsable, derivada
con la misma consulta) está entre las suyas; si no, `403`. Errores: `404` fuera de
alcance/inexistente, `409` transición o responsable inválido, `400` DTO inválido, `403`
por rol. El tipo de actividad usa el catálogo `RECURRING_ACTIVITY_TYPE` (REPORTE,
VALIDACION, REVISION) y se valida contra `CatalogItem`. Las mutaciones de definiciones y
ocurrencias se auditan como `RECURRING_ACTIVITY` y `RECURRING_ACTIVITY_OCCURRENCE`.

El panel de cumplimiento (`GET /recurring-activities/compliance`) calcula en el backend,
por cada ocurrencia del rango (sin las CANCELADA), su clasificación: completada **a
tiempo** (día local de `completedAt` ≤ día objetivo), **a destiempo** (posterior),
**vencida** (VENCIDA persistida o derivada) o **pendiente**. Cada grupo suma además
`estimatedHours` y `actualHours` de sus ocurrencias completadas. Devuelve los totales
de la ventana y los desgloses por actividad, por responsable y por persona que completó
(`byPerson`). El alcance lo acota el service: ADMIN sin
restricción; JEFE_AREA solo sus áreas.

## Errores (transversal)

`AllExceptionsFilter` (`src/common/filters/all-exceptions.filter.ts`) se registra en `configureApp` (`app.config.ts`) y vale para toda la API, el generador de OpenAPI y los e2e de Jest.

- **Códigos HTTP sin cambios.** Una `HttpException` conserva su `statusCode` y la forma `{ statusCode, message, error }`; `message` puede seguir siendo un arreglo en el 400 de validación.
- **Mensajes en español y sin detalles internos.** Los mensajes por defecto de Nest en inglés (`Forbidden resource`, `Unauthorized`, `Not Found`, `Too Many Requests`...) se traducen; de cualquier mensaje se quitan los UUID y las rutas del servidor. Las excepciones de `src/modules/**` nombran el recurso, nunca su id, y llevan tildes; la prueba `messages-es.spec.ts` lo vigila.
- **Errores no HTTP** (Prisma, fallos inesperados) responden `500` con «Ocurrió un error interno. Inténtalo de nuevo; si continúa, avisa al administrador.», sin stack ni texto de la base; el detalle va solo al log (pino).
- **Validación en español.** El `ValidationPipe` usa `validationExceptionFactory` (`validation-messages-es.ts`): traduce las restricciones de `class-validator` con el nombre legible del campo (`FIELD_LABELS`; «El campo» si no hay) y respeta un `message` propio del DTO. Misma respuesta `400`.
- Las cabeceras ya escritas (`Retry-After` del 429 del login) y los 401 por cookie o Bearer no se alteran.
