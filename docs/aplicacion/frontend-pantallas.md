# Frontend y pantallas

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

El frontend (Next.js, App Router) vive en `apps/web/src/app/`. Cada `page.tsx` es una
envoltura delgada que delega en su componente de vista (`*-view.tsx`) y consume la API
del backend. El frontend no accede a la base de datos ni usa Prisma.

El menú lateral se define en `apps/web/src/lib/navigation.ts`: 7 grupos y 23 ítems.
Cada ítem declara una `moduleKey` que coincide con las claves de `MODULE_MATRIX` del
backend; el menú se filtra de forma **cosmética** según `allowedModules` de
`GET /me/permissions`. El control real de acceso lo hace siempre el servidor. Ver
[autenticación y autorización](./autenticacion-autorizacion.md).

Las URL de las carpetas no coinciden 1:1 con los grupos del menú: el menú está
reagrupado por flujo de trabajo. Abajo se agrupa por área del árbol de rutas
(`src/app/<área>/...`) y se indica a qué grupo del menú pertenece cada pantalla.

## Entrada y sesión

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/` | Raíz | Punto de entrada de la app (redirección/arranque). |
| `/login` | Inicio de sesión | Autenticación del usuario (modo JWT). |
| `/inicio` | Panel del área | Tablero de inicio del actor (menú: *Panel del área*, `dashboard`). |
| `/mi-trabajo` | Mi trabajo | Tareas asignadas al usuario actual; enlaza al detalle de tarea (menú: *Mi trabajo*, `assigned`). |

## Demanda (`/demanda/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/demanda/solicitudes` | Solicitudes | Registrar y consultar solicitudes de demanda (menú grupo *Demanda*, `requests`). |
| `/demanda/triage` | Triage | Clasificar la solicitud y decidir su ruta (`triage`). |
| `/demanda/priorizacion` | Priorización | Evaluar con los criterios ponderados y ordenar el backlog (`priority`). |
| `/demanda/resumen` | Indicadores | Panorama/indicadores de demanda (menú grupo *Ejecución* como *Indicadores*, `demandOverview`). |

## Seguimiento y ejecución (`/seguimiento/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/seguimiento/plan` | Planificación | Gestionar el plan, fases, tareas y dependencias (menú grupo *Ejecución* como *Planificación*, `plan`). |
| `/seguimiento/portafolio` | Portafolio | Vista de solo lectura del portafolio de iniciativas (`portfolio`). |
| `/seguimiento/proyectos` | Proyectos | Área de proyectos (marcada *Próximamente* en el menú, `project`). |
| `/seguimiento/tareas` | Tarea | Detalle de una tarea (lee `?taskId=`); se llega desde *Mi trabajo* y *Planificación*; no es un ítem de menú. |
| `/seguimiento/bitacora` | Bitácora | Registrar/consultar el trabajo diario (menú grupo *Seguimiento*, `log`). |
| `/seguimiento/semanal` | Reporte semanal | Consolidar el reporte semanal del proceso (`log`). |
| `/seguimiento/novedades` | Novedades | Registrar y seguir incidencias/bloqueos (`log`). |
| `/seguimiento/reuniones` | Reuniones | Crear y gestionar reuniones con participantes (`meeting`). |
| `/seguimiento/compromisos` | Compromisos | Registrar y dar seguimiento a compromisos (`meeting`). |

## Activos y conocimiento (`/activos/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/activos/capacidad` | Capacidad | Registrar disponibilidad y asignaciones de horas por mes (menú grupo *Ejecución* como *Capacidad*, `capacity`). |
| `/activos/catalogo` | Activos | Inventario de activos analíticos (menú grupo *Activos y conocimiento*, `asset`). |
| `/activos/documentos` | Documentos | Documentación Markdown versionada de los activos (`docs`). |

## Gobierno (`/gobierno/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/gobierno/auditoria` | Auditoría | Consultar la bitácora de eventos de auditoría (menú grupo *Gobierno*, `audit`). |
| `/gobierno/mis-permisos` | Mis permisos | Ver el rol, el alcance y los módulos permitidos del propio usuario (`permissions`). |
| `/gobierno/equipo` | Equipo y permisos | Gestionar usuarios y conceder/revocar grants (menú grupo *Administración*, `team`). |

## Administración (`/administracion/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/administracion/revision` | Aprobaciones | Cola de aprobación: aprobar el compromiso o devolver a triage (menú grupo *Demanda* como *Aprobaciones*, `review`). |
| `/administracion/frameworks` | Controles | Ciclo de control de gobierno (gates GC1–GC5) y validaciones (menú grupo *Gobierno* como *Controles*, `frameworks`). |
| `/administracion/maestras` | Maestras | Administrar las maestras/catálogos (`admin`); también marca activa la ruta `/catalogs`. |

## Catálogos (`/catalogs`) — funcionalidad base

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/catalogs` | Maestras (operativa) | Pantalla operativa de catálogos de la plantilla; fuera del menú, el ítem *Maestras* la marca como activa. |

## Estados de pantalla

Las vistas que consumen datos contemplan, cuando corresponde, los estados de carga,
vacío, éxito y error, y los formularios muestran labels, validaciones junto al campo y
estado de envío (ver el *steering* de frontend). Esos detalles viven en cada
`*-view.tsx`.
