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
| POST | `/areas` | Crea un área (ADMIN o JEFE_AREA). |
| PATCH | `/areas/:id` | Edita `name`/`active`/`sortOrder` (ADMIN o JEFE_AREA). |

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

## requester — Maestro de solicitantes
Administra los solicitantes de las solicitudes; cada uno pertenece obligatoriamente a un área activa del maestro de áreas. Lectura para cualquier actor autenticado; escritura ADMIN y JEFE_AREA.
| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requesters` | Lista solicitantes (filtros opcionales `active`, `areaId`). |
| GET | `/requesters/:id` | Consulta un solicitante (`404` si no existe). |
| POST | `/requesters` | Crea un solicitante (`name` + `areaId` obligatorios; `400` si el área no existe o está inactiva). |
| PATCH | `/requesters/:id` | Edita nombre/área o activa/inactiva el solicitante. |
Reglas: el nombre es único sin distinguir mayúsculas ni tildes (`409` si se repite). Cada alta/edición se audita como `REQUESTER`. En `POST/PATCH /requests` el campo `requesterId` fija el solicitante y el backend copia su nombre y su área a `requesterName`/`requesterArea`; las solicitudes históricas conservan su texto original.

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
triage/priorización exigen `JEFE_AREA` o `LIDER_PROCESO`. En aprobación, la cola y el
histórico los ven `JEFE_AREA` y `LIDER_PROCESO`, pero la **decisión** de aprobar o
devolver es exclusiva de `JEFE_AREA`.

### Solicitud (`request.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/requests` | Lista solicitudes dentro del alcance del actor (filtros `state`, `mainProcessId`). |
| GET | `/requests/:id` | Obtiene una solicitud por id (`404` fuera de alcance). |
| POST | `/requests` | Crea una solicitud (estado `REGISTRADA`). |
| PATCH | `/requests/:id` | Edita la ficha (no el estado); conserva fechas iniciales. |
| DELETE | `/requests/:id` | Eliminación lógica (`deletedAt`/`deletedByUserId`, auditada como `DELETE`). Solo `JEFE_AREA`/`LIDER_PROCESO` dentro de su alcance; `409` si la solicitud está en ejecución o cerrada. Las solicitudes eliminadas dejan de aparecer en listados y consultas. |

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
| GET | `/requests/pending-approval` | Cola de solicitudes en backlog priorizado del alcance (`JEFE_AREA`/`LIDER_PROCESO`). |
| GET | `/requests/:id/approval` | Histórico de decisiones de compromiso (`JEFE_AREA`/`LIDER_PROCESO`). |
| POST | `/requests/:id/approval` | Aprueba (→ *Comprometida*) o devuelve (→ *En triage*, motivo requerido). **Solo `JEFE_AREA`** (un líder recibe `403`). |

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
| GET | `/requests/:requestId/plan/export-excel` | Exporta fases, tareas, responsables, fechas y dependencias a un archivo Excel (.xlsx). |
| GET | `/requests/:requestId/plan/template-excel` | Descarga la plantilla Excel con la misma estructura y un ejemplo. |
| POST | `/requests/:requestId/plan/import-excel` | Importa el Excel (`fileBase64`) y reemplaza el contenido. Valida todas las filas antes de guardar: `400` con la lista `errors` por hoja/fila (fechas, rango de fase, responsables, referencias); `409` si el plan no está en borrador/devuelto. |
| POST | `/requests/:requestId/plan/import` | Importa un plan desde un documento y reemplaza su contenido (`409` si no está en borrador/devuelto; `400` si el documento es inválido). |
| POST | `/requests/:requestId/plan/submit` | Envía el plan a autorización (`409` si hay pendientes). |
| POST | `/requests/:requestId/plan/authorize` | Autoriza el plan (→ *Autorizado*; Request → *En ejecución*). |
| POST | `/requests/:requestId/plan/return` | Devuelve el plan con motivo (→ *Devuelto*). |

Validaciones de fechas (backend y formularios): la fecha de fin de una fase o tarea no puede ser anterior a la de inicio; las fechas de cada tarea deben estar dentro del rango de su fase; al cambiar las fechas de una fase se comprueba que sus tareas sigan dentro. Aplican al crear, editar e importar (JSON o Excel). El formulario de tarea ya no ofrece la opción *Es un hito* (el campo se conserva en datos históricos).

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
| PATCH | `/tasks/:id/accept` | Acepta/retira la aceptación (precondición TERMINADA). Ya no es requisito del gate de predecesoras ni se muestra en la UI; se conserva por compatibilidad. |
| GET | `/tasks/:taskId/evidence` | Lista los archivos de evidencia de la tarea. |
| POST | `/tasks/:taskId/evidence` | Adjunta un archivo (multipart, campo `file`) y lo guarda en el bucket S3 maestro (`proyectos/{requestId}/tareas/{taskId}/evidencias/…`). Solo el responsable de la tarea o jefe/líder; `400` si está vacío, supera `EVIDENCE_MAX_BYTES` (8 MB) o su tipo no está permitido; `409` en proyecto cerrado. |
| GET | `/tasks/:taskId/evidence/:evidenceId/download` | URL prefirmada de descarga (vigencia `STORAGE_PRESIGN_TTL_SECONDS`). |
| DELETE | `/tasks/:taskId/evidence/:evidenceId` | Quita la evidencia (BD y objeto S3). |

### Dependencias (`dependency/dependency.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/tasks/:id/dependencies` | Lista las predecesoras de una tarea. |
| POST | `/tasks/:id/dependencies` | Añade una predecesora (valida auto/mismo-plan/ciclo/duplicado). |
| DELETE | `/tasks/:id/dependencies/:predecessorTaskId` | Quita una predecesora. |

Reglas clave: el envío del plan exige la guía sin pendientes; la transición de una
tarea respeta el gate de predecesoras (una dependiente avanza solo si su predecesora
está TERMINADA; la aceptación ya no es requisito); una dependencia no puede ser circular ni cruzar planes
distintos; el integrante solo opera el estado de su propia tarea.

## portfolio — Portafolio e indicadores del área

Vistas de solo lectura: el portafolio de iniciativas y el control del área
(indicadores y panorama de demanda). El alcance se aplica en el `where` del service.

### Portafolio (`portfolio.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/portfolio` | Listado del portafolio en alcance (filtros `mainProcessId`, `state`, `band`). Cada ítem incluye `progressPercent` (promedio del avance de las tareas del plan, `TERMINADA` = 100; `null` sin tareas) y la alerta de fecha objetivo `dueStatus` (`SIN_FECHA`, `EN_TIEMPO`, `PROXIMO_A_VENCER`, `VENCIDO`, `NO_APLICA` en cerradas/rechazadas/retiradas) con `daysToTarget`. El umbral de «próximo a vencer» es `PORTFOLIO_DUE_SOON_DAYS` (7 por defecto). |

### Control del área (`area-control.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/area-control/indicators` | Indicadores del área para el periodo (jefe/líder; integrante → `403`). |
| GET | `/area-control/demand-summary` | Panorama de demanda en alcance (los 3 roles). |
| GET | `/area-control/attention` | Conteos «Requiere tu atención» a hoy y en alcance (los 3 roles): solicitudes `REGISTRADA` (triage), `EN_TRIAGE` con triage `CONTINUAR` vigente (priorizar), `BACKLOG_PRIORIZADO` (aprobar) y tareas no terminadas con `endDate` anterior a hoy de solicitudes no cerradas, retiradas ni rechazadas. |

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
| GET | `/issues` | Lista novedades en alcance (filtros opcionales: `state`, `typeCode`, `processId`, `requestId` = solicitud relacionada). |
| POST | `/issues` | Crea una novedad (tipo por defecto BLOQUEO). |
| GET | `/issues/:id` | Detalle de una novedad. |
| PATCH | `/issues/:id` | Edita una novedad (un registro por incidente). |
| POST | `/issues/:id/transition` | Transiciona el estado (máquina mínima). |
| DELETE | `/issues/:id` | Borra una novedad en alcance. |

### Meetings — Reuniones (`meeting/meeting.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/meetings` | Lista reuniones en alcance (filtros opcionales: `processId`, `state`, `requestId` = solicitud relacionada o proyecto relacionado). |
| POST | `/meetings` | Crea una reunión (estado inicial BORRADOR). |
| GET | `/meetings/:id` | Detalle del acta: participantes y sus compromisos (`commitments`, `commitmentsTotal`, `commitmentsOpen`, `closed`). |
| PATCH | `/meetings/:id` | Edita un acta abierta (incluye el set de participantes); `409` si está cerrada. |
| POST | `/meetings/:id/close` | Cierra el acta (responsable, líder del proceso o jefe); exige decisiones o al menos un compromiso. |
| POST | `/meetings/:id/reopen` | Reabre un acta cerrada (líder del proceso o jefe). |
| DELETE | `/meetings/:id` | Borra un acta abierta sin compromisos (cascade de participantes); `409` si no. |

### Commitments — Compromisos (`commitment/commitment.controller.ts`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/commitments` | Lista compromisos en alcance (filtros opcionales: `state`, `processId`, `assignedUserId`, `requestId` = solicitud relacionada o proyecto relacionado). |
| POST | `/commitments` | Crea un compromiso (vencimiento requerido). |
| GET | `/commitments/:id` | Detalle de un compromiso. |
| PATCH | `/commitments/:id` | Edita un compromiso. |
| POST | `/commitments/:id/transition` | Transiciona el estado (máquina mínima). |
| DELETE | `/commitments/:id` | Borra un compromiso en alcance. |

Reglas: los diarios/semanales son propios del autor; los participantes de una reunión
deben estar dentro del alcance; las novedades y compromisos usan máquinas de estado
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
| GET | `/requests/:id/closure` | Estado funcional del cierre, validaciones (tareas, documentación), solicitud pendiente e historial. |
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
Notificaciones por usuario generadas por eventos reales del backend; cada usuario solo
ve y marca las suyas.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/notifications` | Notificaciones del usuario actual y contador de no leídas (`take`, `unreadOnly`). |
| POST | `/notifications/:id/read` | Marca una notificación propia como leída (`404` si es ajena). |
| POST | `/notifications/read-all` | Marca todas como leídas. |

Eventos: compromiso pendiente de aprobación (jefes del área), plan pendiente de
autorización (jefes y líderes), plan autorizado o devuelto (quien lo envió y líderes),
tarea asignada (responsable), documentación pendiente de aprobación (jefes),
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
costo `null`. Antes de invocar, el triage (y en adelante el asistente) llama a `assertWithinBudget`:
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

Configuración de IA (`ai-config.controller.ts`), base `/admin/ai`, solo `ADMIN`
(`@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(ADMIN)`, PATCH no PUT):

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/admin/ai/config` | Estado global + lista de agentes + catálogo de modelos permitidos (`models`: modelos habilitados con `id`, `label`, `tier` y capacidades; viene de la tabla `ai_model`) para alimentar el selector del Admin. Nunca incluye el secret ni el ciphertext (solo `secretSet` y `accessKeyIdLast4`). |
| GET | `/admin/ai/usage` | Consumo de IA del mes (`?month=YYYY-MM`, UTC): llamadas, tokens, costo estimado, desglose por agente y por modelo, llamadas sin precio y estado del presupuesto (`budget`: tope, gasto, `usedPct`, `alert`, `exceeded`). |
| GET | `/admin/ai/models` | Catálogo completo de modelos de IA con sus capacidades (`supportsTemperature`, `supportsTools`, `supportsVision`, `supportsDocuments`, `enabled`), precios (`inputUsdPerMTok`, `outputUsdPerMTok`, `null` = sin precio) y `sortOrder`, incluidos los deshabilitados. |
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
| POST | `/requests/:id/ai/triage-suggestion` | Sugiere (no persiste) campos de triage, banda de prioridad `P1`–`P4` y posibles duplicados. Reutiliza el alcance por proceso (`404` fuera de alcance). Degrada: apagado → `409` sin invocar Bedrock, descifrado fallido → `409`, timeout → `503`, fallo de dependencia → `503`, salida no‑JSON o que no valida → `422`. Nunca persiste ni devuelve `500` con stack. |

Reglas clave: el secret de AWS se guarda cifrado (AES‑256‑GCM, se reutiliza
`settings-crypto.ts` de system-settings vía `ai-crypto.ts`, misma clave
`SETTINGS_ENCRYPTION_KEY`); el contrato del secret es determinista (ausente conserva, no
vacío cifra, `''` → `400`, `clearCredentials` limpia y no se combina con un secret no
vacío). En modo `iam-role` no se guardan claves (el SDK resuelve el rol de la instancia).
La sugerencia valida cada `suggested*Code` contra las maestras activas (code inválido →
`null` + nota) y descarta duplicados cuyo `requestId` no estaba en el contexto. Los cambios
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
| GET | `/assistant/status` | `{ available, reason }`: disponible si el MCP está configurado (`ASSISTANT_MCP_URL`), la IA y el agente `ASISTENTE` están encendidos y el presupuesto no se agotó. |
| POST | `/assistant/chat` | Envía `{ conversationId?, message }` (1..4000) y responde `text/event-stream` con los eventos `conversation`, `text`, `tool`, `done` y `error`. `409` si está desactivado, sin presupuesto o sin sesión con token; `404` si la conversación no es de la persona. |
| GET | `/assistant/conversations` | Las 50 conversaciones más recientes **de la persona**. |
| GET | `/assistant/conversations/:id` | Conversación propia con sus mensajes y las herramientas consultadas por turno. `404` si no es suya. |
| DELETE | `/assistant/conversations/:id` | Elimina una conversación propia (`204`). |
| POST | `/assistant/proposals/:id/confirm` | Confirma una propuesta de acción y la **ejecuta** con el token y los permisos de la persona. Responde la propuesta resuelta: `CONFIRMADA` (con `resultId`/`resultTitle`) o `FALLIDA` (con el motivo de la API). `404` si no es suya; `409` si ya no está pendiente (vencida, confirmada, descartada o en ejecución). |
| POST | `/assistant/proposals/:id/discard` | Descarta una propuesta pendiente sin ejecutarla. |

**Propuestas de acción (F3).** El asistente nunca escribe datos: solo puede *proponer* con una lista
cerrada de tools de escritura (`request.create`, `request.update`, `request.triage.create`,
`request.priority.create`, `plan.create`, `task.create`, `task.update`, `task.status.update`,
`issue.create`, `issue.update`, `issue.transition`, `meeting.create`, `meeting.update`,
`commitment.create`, `commitment.update`, `commitment.transition`). Quedan
fuera las decisiones (aprobar, autorizar o devolver, aceptar tareas, compuertas de gobierno), el borrado
y la administración. Al pedir una de esas tools el modelo debe rellenar `resumen_para_la_persona` (frase
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
- `occurrence-status.ts`: enum `OccurrenceStatus` (PENDIENTE, EN_CURSO, COMPLETADA,
  VENCIDA) y sus transiciones permitidas; COMPLETADA es terminal, VENCIDA puede cerrarse
  tarde a COMPLETADA.
- `responsible-kind.ts`: enum `ResponsibleKind` (USER, AREA) y la validación "exactamente
  un responsable" (persona o área, nunca ambos ni ninguno), espejo del CHECK de BD.

Motor (`recurring-activity.service.ts` + `recurring-activity.scheduler.service.ts`): dos
operaciones idempotentes que corren como crons in-process (`@nestjs/schedule`,
`ScheduleModule.forRoot()` en `app.module.ts`):

- Generación: por cada definición activa inserta las ocurrencias futuras dentro de su
  ventana de anticipación con `createMany` + `skipDuplicates` sobre el par único
  `(activityId, targetDate)`; correrla dos veces no duplica.
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
| PATCH | `/recurring-activities/:id` | Edita una definición (datos, responsable, pausa). |
| DELETE | `/recurring-activities/:id` | Pausa la definición (soft-delete `active=false`; no borra ni elimina ocurrencias). |
| GET | `/recurring-activities/occurrences` | Lista ocurrencias por alcance (`scope=mine` por defecto; `all` solo JEFE_AREA/ADMIN). Filtros por estado, cadencia, tipo, rango de fechas y responsable; paginación `page/pageSize` (≤100). |
| GET | `/recurring-activities/occurrences/:id` | Detalle de una ocurrencia dentro de alcance. |
| POST | `/recurring-activities/occurrences/:id/start` | Toma una ocurrencia (PENDIENTE → EN_CURSO). |
| POST | `/recurring-activities/occurrences/:id/complete` | Completa una ocurrencia; comentario/evidencia opcional. |

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
por cada ocurrencia del rango, su clasificación: completada **a tiempo** (`completedAt`
dentro del día objetivo), **a destiempo** (`completedAt` posterior), **vencida** (estado
VENCIDA) o **pendiente** (PENDIENTE/EN_CURSO). Devuelve los totales de la ventana y los
desgloses por actividad y por responsable. El alcance lo acota el service: ADMIN sin
restricción; JEFE_AREA solo sus áreas.
