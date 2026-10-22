# Frontend y pantallas

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

El frontend (Next.js, App Router) vive en `apps/web/src/app/`. Cada `page.tsx` es una
envoltura delgada que delega en su componente de vista (`*-view.tsx`) y consume la API
del backend. El frontend no accede a la base de datos ni usa Prisma.

El menú lateral se define en `apps/web/src/lib/navigation.ts`: 7 grupos y 26 ítems.
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
| `/login` | Inicio de sesión | Autenticación del usuario (modo JWT); enlaza a *¿Olvidaste tu contraseña?*. |
| `/olvide-contrasena` | Recuperar contraseña | Solicita el reestablecimiento (`POST /auth/forgot-password`); muestra siempre un mensaje genérico que no revela si la cuenta existe. Pública. |
| `/restablecer-contrasena` | Restablecer contraseña | Define una nueva contraseña con el token del correo (`?token=`, `POST /auth/reset-password`). Al confirmar inicia sesión automáticamente y redirige al módulo (`/inicio` o `next` seguro), sin volver a `/login`. Pública. |
| `/activar-cuenta` | Activar cuenta | Establece la contraseña inicial de una cuenta invitada con el token del correo (`?token=`, mismo `POST /auth/reset-password`). Al confirmar la cuenta queda activa, inicia sesión automáticamente y redirige a `/inicio`. Pública. |
| `/inicio` | Panel del área | Tablero de inicio del actor (menú: *Panel del área*, `dashboard`). |
| `/mi-trabajo` | Mi trabajo | Tareas asignadas al usuario actual; enlaza al detalle de tarea (menú: *Mi trabajo*, `assigned`). |

## Demanda (`/demanda/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/demanda/solicitudes` | Solicitudes | Registrar y consultar solicitudes de demanda; cada fila ofrece la acción *Ver detalle* que abre la ficha de la solicitud (menú grupo *Demanda*, `requests`). |
| `/demanda/solicitudes/[id]` | Detalle de la solicitud | Ficha de **solo lectura** que reúne el recorrido completo de la solicitud en un stepper vertical con todas las etapas visibles (Solicitud, Triage, Priorización, Aprobación/Compromiso, Planificación, Gobierno y validación, Estabilización/Cierre); cada etapa muestra su estado derivado y, cuando el módulo y el estado lo permiten, un enlace *Ir a actuar* hacia la bandeja correspondiente. Se llega desde la acción *Ver detalle* de Solicitudes (no es ítem de menú, `requests`). |
| `/demanda/triage` | Triage | Clasificar la solicitud, decidir su ruta y asociar su **activo base** (existente o nuevo bajo el proceso principal), requisito para priorizar (`triage`). |
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
| `/activos/catalogo` | Activos | Inventario de activos analíticos; cada fila ofrece la acción *Ver historial* (menú grupo *Activos y conocimiento*, `asset`). |
| `/activos/catalogo/[id]/historial` | Historial por activo | Vista de solo lectura de las solicitudes que tienen el activo como base, con su estado y proceso, ordenadas por fecha de registro; se llega desde la acción *Ver historial* del catálogo (no es ítem de menú, `asset`). |
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
| `/administracion/areas` | Áreas | Crear y editar áreas organizativas (por ejemplo, Analítica) que agrupan procesos: listado, alta y edición de nombre/estado/orden. Solo rol ADMIN (`areas`). |
| `/administracion/procesos` | Procesos | Crear y editar procesos (por ejemplo, BI, Integraciones, IA) agrupados por área: el alta exige un área activa y la edición no mueve el proceso de área. Rol ADMIN o jefe de área (`processesAdmin`). |
| `/administracion/configuracion-smtp` | Configuración SMTP | Configurar el servidor SMTP en runtime (host, puerto, remitente, contraseña write-only) con prueba de envío, y gestionar los administradores del sistema (toggle `isAdmin`). Solo rol ADMIN (`systemSettings`). |

## Catálogos (`/catalogs`) — funcionalidad base

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/catalogs` | Maestras (operativa) | Pantalla operativa de catálogos de la plantilla; fuera del menú, el ítem *Maestras* la marca como activa. |

## Estados de pantalla

Las vistas que consumen datos contemplan, cuando corresponde, los estados de carga,
vacío, éxito y error, y los formularios muestran labels, validaciones junto al campo y
estado de envío (ver el *steering* de frontend). Esos detalles viven en cada
`*-view.tsx`.
