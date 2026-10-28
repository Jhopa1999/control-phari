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

---

## auth — Identidad y acceso

Resuelve el actor por petición y expone sus permisos. Soporta dos modos configurables
por `AUTH_MODE`: `dev-header` (header `X-Actor-Id`) y `jwt` (login real).

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/auth/login` | Autentica por `identifier` y contraseña, devuelve un JWT (ruta pública). |
| POST | `/auth/forgot-password` | Solicita el reestablecimiento de contraseña; responde `204` exista o no el usuario (ruta pública). |
| POST | `/auth/reset-password` | Define una nueva contraseña consumiendo un token de reset o de activación y devuelve la sesión del login para entrar directo (`200` con `LoginResponseDto`; `400` token/contraseña inválidos, `410` token caducado/usado). |
| GET | `/dev/actors` | Lista usuarios activos para el selector de desarrollo (solo con `AUTH_MODE=dev-header`; si no, `404`). |
| GET | `/me/permissions` | Permisos del usuario actual: rol, alcance y módulos permitidos. |

Reglas relevantes: el login real vive solo en modo `jwt`; el selector dev solo existe
en modo `dev-header`. La lógica de carga del actor y sus grants es común a ambos modos
(no se duplica la autorización). `forgot-password`/`reset-password` usan tokens de un
solo uso (`AuthToken`): el valor en claro solo viaja en el correo y en BD se guarda su
SHA-256; el envío del correo ocurre fuera de la transacción (ver
`autenticacion-autorizacion.md`).

## user — Identidades funcionales

Administra las identidades funcionales de las personas del área. Solo `JEFE_AREA`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/users` | Lista todos los usuarios (solo JEFE_AREA). |
| GET | `/users/:id` | Obtiene un usuario con sus grants (solo JEFE_AREA). |
| POST | `/users` | Crea una identidad funcional (solo JEFE_AREA). |
| PATCH | `/users/:id` | Edita `name`/`active` (solo JEFE_AREA). |
| POST | `/users/:id/invite` | Emite y envía la invitación de activación; el reenvío invalida el enlace previo (solo JEFE_AREA; `204`, `404` si no existe). |

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
| GET | `/areas` | Lista áreas (filtro opcional `active`). |
| GET | `/areas/:id` | Obtiene un área por id (`404` si no existe). |
| POST | `/areas` | Crea un área (solo ADMIN). |
| PATCH | `/areas/:id` | Edita `name`/`active`/`sortOrder` (solo ADMIN). |

Reglas: `code` se normaliza a MAYÚSCULAS y es único (`409` si se repite al crear); el
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
| PATCH | `/processes/:id` | Edita `name`/`framework`/`active`/`sortOrder` (ADMIN o JEFE_AREA). |

Reglas: `code` es único (`409` si se repite al crear); al crear, `areaId` es requerido
(UUID) y debe apuntar a un área existente (`404` si no existe). El `areaId` no se edita
en el PATCH.

## catalog — Maestras genéricas (funcionalidad base)

`CatalogItem` es la maestra genérica reutilizable de la plantilla (prioridades,
estados, tipos, etc.). La aplicación la reutiliza para validar códigos de catálogo en
sus flujos. Lectura con actor; escritura solo `JEFE_AREA`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/catalog-items` | Crea un elemento de catálogo (solo JEFE_AREA). |
| GET | `/catalog-items` | Lista elementos, con filtros opcionales (`catalog`, `active`). |
| GET | `/catalog-items/:id` | Obtiene un elemento por id. |
| PATCH | `/catalog-items/:id` | Actualiza `label`/`active`/`sortOrder` (solo JEFE_AREA). |

## request — Solicitud y flujo de demanda

Núcleo del flujo de demanda. Reúne la ficha de la solicitud y los subflujos de triage,
priorización y aprobación. Accesible a los 3 roles con alcance por proceso principal;
triage/priorización/aprobación exigen `JEFE_AREA` o `LIDER_PROCESO`.

### Solicitud (`request.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests` | Lista solicitudes dentro del alcance del actor (filtros `state`, `mainProcessId`). |
| GET | `/requests/:id` | Obtiene una solicitud por id (`404` fuera de alcance). |
| POST | `/requests` | Crea una solicitud (estado `REGISTRADA`). |
| PATCH | `/requests/:id` | Edita la ficha (no el estado); conserva fechas iniciales. |

### Triage (`triage/triage.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/triage` | Triage de la solicitud (0 o 1 fila) y candidatos a responsable. |
| POST | `/requests/:id/triage` | Registra el triage (solo desde `REGISTRADA`; segundo POST → `409`). |
| POST | `/requests/:id/asset` | Asocia un activo base **existente** (`assetId`, requerido); solo en estados tempranos (`409` fuera, o si el activo no está habilitado para el proceso de la solicitud). |

El triage **no crea activos**: solo asocia uno existente que esté visible para el actor.
La creación de activos vive en el módulo de Activos y la realiza el jefe de área. El
service valida el alcance de lectura del activo (`404` si no accesible) y que esté
habilitado para el proceso principal de la solicitud (`409` si no). `JEFE_AREA`/
`LIDER_PROCESO` (más `ADMIN`) pueden asociar.

### Priorización (`priority/priority.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/priority` | Histórico de evaluaciones (vigente = la última). |
| POST | `/requests/:id/priority` | Guarda una evaluación (requiere triage=Continuar y estado válido; criterios 1–5). |

### Aprobación (`approval/approval.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/pending-approval` | Cola de solicitudes en backlog priorizado del alcance. |
| GET | `/requests/:id/approval` | Histórico de decisiones de compromiso. |
| POST | `/requests/:id/approval` | Aprueba (→ *Comprometida*) o devuelve (→ *En triage*, motivo requerido). |

Reglas clave: el triage solo se registra desde `REGISTRADA`; priorizar exige triage con
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
| PATCH | `/requests/:requestId/plan` | Edita datos del plan (no el estado). |
| GET | `/requests/:requestId/plan/guide` | Guía de pendientes del plan (gate de envío). |
| GET | `/requests/:requestId/plan/export` | Exporta el plan a un documento JSON portable (solo lectura; cualquier estado). |
| POST | `/requests/:requestId/plan/import` | Importa un plan desde un documento y reemplaza su contenido (`409` si no está en borrador/devuelto; `400` si el documento es inválido). |
| POST | `/requests/:requestId/plan/submit` | Envía el plan a autorización (`409` si hay pendientes). |
| POST | `/requests/:requestId/plan/authorize` | Autoriza el plan (→ *Autorizado*; Request → *En ejecución*). |
| POST | `/requests/:requestId/plan/return` | Devuelve el plan con motivo (→ *Devuelto*). |

### Fases (`phase/phase.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/plans/:planId/phases` | Lista las fases del plan ordenadas. |
| POST | `/plans/:planId/phases` | Crea una fase (`order` al final si falta). |
| PATCH | `/plans/:planId/phases/reorder` | Reordena las fases (protege la fase inicial con tareas). |
| PATCH | `/plans/:planId/phases/:phaseId` | Edita nombre/fechas/entregable de una fase. |
| DELETE | `/plans/:planId/phases/:phaseId` | Borra una fase (`409` si tiene tareas). |

### Tareas (`task/task.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/my-work` | Tareas asignadas al usuario actual (dentro de alcance). |
| GET | `/plans/:planId/tasks` | Lista las tareas de un plan (filtros opcionales). |
| POST | `/phases/:phaseId/tasks` | Crea una tarea en una fase (regla de hito). |
| GET | `/tasks/:id` | Detalle de una tarea con sus predecesoras. |
| PATCH | `/tasks/:id` | Edita una tarea (no estado/aceptación; regla de hito). |
| DELETE | `/tasks/:id` | Borra una tarea (`409` si es predecesora de otra). |
| PATCH | `/tasks/:id/status` | Cambia el estado (gate de predecesoras). |
| PATCH | `/tasks/:id/accept` | Acepta/retira la aceptación (precondición TERMINADA). |

### Dependencias (`dependency/dependency.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/tasks/:id/dependencies` | Lista las predecesoras de una tarea. |
| POST | `/tasks/:id/dependencies` | Añade una predecesora (valida auto/mismo-plan/ciclo/duplicado). |
| DELETE | `/tasks/:id/dependencies/:predecessorTaskId` | Quita una predecesora. |

Reglas clave: el envío del plan exige la guía sin pendientes; la transición de una
tarea respeta el gate de predecesoras (una dependiente avanza solo si su predecesora
está TERMINADA y aceptada); una dependencia no puede ser circular ni cruzar planes
distintos; el integrante solo opera el estado de su propia tarea.

## portfolio — Portafolio e indicadores del área

Vistas de solo lectura: el portafolio de iniciativas y el control del área
(indicadores y panorama de demanda). El alcance se aplica en el `where` del service.

### Portafolio (`portfolio.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/portfolio` | Listado del portafolio en alcance (filtros `mainProcessId`, `state`, `band`). |

### Control del área (`area-control.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/area-control/indicators` | Indicadores del área para el periodo (jefe/líder; integrante → `403`). |
| GET | `/area-control/demand-summary` | Panorama de demanda en alcance (los 3 roles). |

## capacity — Capacidad (disponibilidad y asignaciones)

Reparto de horas por persona y mes. Los 3 roles con alcance por proceso.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/capacity/summary` | Resumen de carga por persona para un mes (en alcance). |
| GET | `/capacity/people` | Personas en alcance para los selectores. |
| GET | `/capacity/availability` | Disponibilidades del mes en alcance. |
| POST | `/capacity/availability` | Registra disponibilidad de una persona para un mes. |
| PATCH | `/capacity/availability/:id` | Edita las horas disponibles. |
| GET | `/capacity/assignments` | Asignaciones del mes en alcance (filtros opcionales). |
| POST | `/capacity/assignments` | Crea una asignación de horas (proceso requerido). |
| PATCH | `/capacity/assignments/:id` | Edita una asignación. |
| DELETE | `/capacity/assignments/:id` | Borra una asignación. |

Reglas: la disponibilidad es por persona/mes (una fila única); las asignaciones se
agregan por periodo/proceso (varias filas por persona/mes). El mes se maneja como
`YYYY-MM` en el contrato externo.

## coordination — Trabajo diario y coordinación

Agrupa cuatro submódulos: bitácora/semanal (worklog), novedades (issues), reuniones
(meetings) y compromisos (commitments). Los 3 roles, con alcance por proceso.

### Worklog — Bitácora y reporte semanal (`worklog/worklog.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/coordination/people` | Personas en alcance para los selectores. |
| GET | `/worklog/daily` | Lista diarios en alcance (filtros opcionales). |
| POST | `/worklog/daily` | Crea la cabecera de un diario (autor = actor). |
| GET | `/worklog/daily/:id` | Detalle de un diario con sus actividades. |
| PATCH | `/worklog/daily/:id` | Edita la cabecera (notas) de un diario propio. |
| DELETE | `/worklog/daily/:id` | Borra un diario propio (cascade de actividades). |
| POST | `/worklog/daily/:id/submit` | Envía un diario a revisión (`BORRADOR → ENVIADO`). |
| POST | `/worklog/daily/:id/activities` | Agrega una actividad al diario (valida clasificación). |
| PATCH | `/worklog/activities/:id` | Edita una actividad del diario. |
| DELETE | `/worklog/activities/:id` | Borra una actividad del diario. |
| GET | `/weekly-reports` | Lista semanales en alcance (filtros opcionales). |
| POST | `/weekly-reports` | Crea un semanal (se ancla al lunes ISO). |
| GET | `/weekly-reports/:id` | Detalle de un semanal con conteos de consolidación. |
| PATCH | `/weekly-reports/:id` | Edita las secciones de texto de un semanal propio. |
| POST | `/weekly-reports/:id/submit` | Envía un semanal a revisión (`BORRADOR → ENVIADO`). |

### Issues — Novedades (`issue/issue.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/issues` | Lista novedades en alcance (filtros opcionales). |
| POST | `/issues` | Crea una novedad (tipo por defecto BLOQUEO). |
| GET | `/issues/:id` | Detalle de una novedad. |
| PATCH | `/issues/:id` | Edita una novedad (un registro por incidente). |
| POST | `/issues/:id/transition` | Transiciona el estado (máquina mínima). |
| DELETE | `/issues/:id` | Borra una novedad en alcance. |

### Meetings — Reuniones (`meeting/meeting.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/meetings` | Lista reuniones en alcance (filtros opcionales). |
| POST | `/meetings` | Crea una reunión (estado inicial BORRADOR). |
| GET | `/meetings/:id` | Detalle de una reunión con participantes. |
| PATCH | `/meetings/:id` | Edita una reunión (incluye el set de participantes). |
| DELETE | `/meetings/:id` | Borra una reunión (cascade de participantes). |

### Commitments — Compromisos (`commitment/commitment.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/commitments` | Lista compromisos en alcance (filtros opcionales). |
| POST | `/commitments` | Crea un compromiso (vencimiento requerido). |
| GET | `/commitments/:id` | Detalle de un compromiso. |
| PATCH | `/commitments/:id` | Edita un compromiso. |
| POST | `/commitments/:id/transition` | Transiciona el estado (máquina mínima). |
| DELETE | `/commitments/:id` | Borra un compromiso en alcance. |

Reglas: los diarios/semanales son propios del autor; los participantes de una reunión
deben estar dentro del alcance; las novedades y compromisos usan máquinas de estado
mínimas reversibles.

## knowledge — Activos y documentos

Inventario de activos genéricos, compartidos y gobernados, y su documentación en
Markdown versionada. Los 3 roles de área **leen** con alcance por proceso (propietario ∪
visibilidad); la **escritura** del activo (crear/editar/cambiar estado) es exclusiva del
jefe de área (`requireAssetGovernor` + `@Roles(JEFE_AREA)` en los handlers de
escritura). La máquina de estado se aplica en el service.

### Activos (`asset/asset.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/assets` | Lista activos en alcance (filtros opcionales). Los 3 roles de área. |
| POST | `/assets` | Crea un activo (nace BORRADOR). Solo `JEFE_AREA`. |
| GET | `/assets/:id` | Detalle de un activo. |
| GET | `/assets/:id/requests` | Historial de solicitudes que tienen el activo como base (más reciente primero). |
| PATCH | `/assets/:id` | Edita atributos de un activo (no el estado). Solo `JEFE_AREA`. |
| POST | `/assets/:id/status` | Cambia el estado de un activo (transición válida). Solo `JEFE_AREA`. |

El activo es genérico: ya no tiene tipo/tecnología/fuente/frecuencia (esos atributos
pertenecen a cada solicitud). `generalDescription` lo describe en general. El jefe define
con `visibleProcessIds` qué procesos pueden ver/usar el activo (tabla puente
`AssetProcessVisibility`); el proceso propietario (`processId`) siempre es visible. El
líder solo **asocia** activos visibles a sus solicitudes y gestiona los documentos
vinculados.

### Documentos (`document/document.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/documents` | Lista documentos en alcance (sin contenido). |
| POST | `/documents` | Crea un documento + versión 1 (contenido Markdown). |
| GET | `/documents/:id` | Metadatos del documento + versión vigente (sin contenido). |
| PATCH | `/documents/:id` | Edita metadatos (título/categoría; no estado ni contenido). |
| POST | `/documents/:id/versions` | Editar contenido = crear una nueva versión. |
| GET | `/documents/:id/versions` | Historial de versiones (sin contenido). |
| GET | `/documents/:id/versions/:versionId/content` | Contenido Markdown de una versión. |
| GET | `/documents/:id/content` | Contenido Markdown de la versión vigente (atajo). |
| POST | `/documents/:id/status` | Cambia el estado del documento (líder/jefe). |

Reglas: el contenido de un documento es inmutable por versión (editar crea una nueva
versión y conserva la previa); el estado y la aceptación los mueven solo los helpers de
estado, no un DTO libre; retirar un activo es un cambio de estado (sin borrado físico).

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
| POST | `/requests/:id/gates/:gateCode/approve` | Aprueba un gate por la autoridad (solo GC4/GC5; GC1–GC3 → `409`). |
| POST | `/requests/:id/gates/:gateCode/waive` | Marca un gate `NO_APLICA` (requiere motivo y ruta compatible). |
| POST | `/requests/:id/block` | Bloquea la solicitud (flag transversal; no cambia el estado). |
| POST | `/requests/:id/unblock` | Desbloquea la solicitud (flag transversal). |
| PUT | `/requests/:id/governance-route` | Fija/cambia la ruta proporcional (manual, auditada). |

### Validaciones y evidencias (`validation/validation.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests/:id/validations` | Historial de validaciones de la solicitud. |
| POST | `/requests/:id/validations` | Registra una validación/evidencia (no aprueba el gate). |
| PATCH | `/requests/:id/validations/:validationId/resolve-blocking` | Resuelve un defecto bloqueante (no aprueba el gate). |

Reglas clave: registrar una validación nunca aprueba un gate (son operaciones
distintas); GC1–GC3 no se aprueban por autoridad; una solicitud bloqueada no se puede
liberar; la evidencia puede fijar una versión concreta de documento (evidencia
inmutable). El estado del gate solo lo escribe el servicio de estado dentro de su
transacción.

## audit — Auditoría (registro append-only)

Lectura de la bitácora inmutable de mutaciones, con alcance por rol aplicado en el
service.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/audit-events` | Lista paginada de eventos con alcance por rol. Filtros `objectType` y `action`; paginación `page`/`pageSize` (pageSize ≤ 100, por defecto 25). Devuelve `{ data, page, pageSize, total, hasMore }`; el alcance por rol se aplica antes de paginar. |

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
