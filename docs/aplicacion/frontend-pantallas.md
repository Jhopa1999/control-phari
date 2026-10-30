# Frontend y pantallas

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

El frontend (Next.js, App Router) vive en `apps/web/src/app/`. Cada `page.tsx` es una
envoltura delgada que delega en su componente de vista (`*-view.tsx`) y consume la API
del backend. El frontend no accede a la base de datos ni usa Prisma.

El menú lateral se define en `apps/web/src/lib/navigation.ts`: 7 grupos y 27 ítems.
Cada ítem declara una `moduleKey` que coincide con las claves de `MODULE_MATRIX` del
backend; el menú se filtra de forma **cosmética** según `allowedModules` de
`GET /me/permissions`. El control real de acceso lo hace siempre el servidor. Ver
[autenticación y autorización](./autenticacion-autorizacion.md).

Las URL de las carpetas no coinciden 1:1 con los grupos del menú: el menú está
reagrupado por flujo de trabajo. Abajo se agrupa por área del árbol de rutas
(`src/app/<área>/...`) y se indica a qué grupo del menú pertenece cada pantalla.

## Centro de notificaciones

La barra superior (escritorio y móvil) muestra una campana con el contador de
notificaciones no leídas. Al abrirla lista las últimas notificaciones del usuario, permite
marcarlas como leídas (una o todas) y navegar al elemento relacionado. Se actualiza al
abrir, cada minuto y al volver a la pestaña.

## Entrada y sesión

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/` | Raíz | Punto de entrada de la app (redirección/arranque). |
| `/login` | Inicio de sesión | Autenticación del usuario (modo JWT); enlaza a *¿Olvidaste tu contraseña?*. |
| `/olvide-contrasena` | Recuperar contraseña | Solicita el reestablecimiento (`POST /auth/forgot-password`); muestra siempre un mensaje genérico que no revela si la cuenta existe. Pública. |
| `/restablecer-contrasena` | Restablecer contraseña | Define una nueva contraseña con el token del correo (`?token=`, `POST /auth/reset-password`). Al confirmar inicia sesión automáticamente y redirige al módulo (`/inicio` o `next` seguro), sin volver a `/login`. Pública. |
| `/activar-cuenta` | Activar cuenta | Establece la contraseña inicial de una cuenta invitada con el token del correo (`?token=`, mismo `POST /auth/reset-password`). Al confirmar la cuenta queda activa, inicia sesión automáticamente y redirige a `/inicio`. Pública. |
| `/inicio` | Panel del área | Tablero de inicio del actor (menú: *Panel del área*, `dashboard`). Las distribuciones por estado y por banda de prioridad listan solo los valores con solicitudes; los valores en cero se pliegan bajo *Sin solicitudes (N)*. El pie del menú lateral reúne en una fila al usuario autenticado y los botones de icono *Contraer menú* y *Cerrar sesión*. |
| `/mi-trabajo` | Mi trabajo | Tareas asignadas al usuario actual; enlaza al detalle de tarea (menú: *Mi trabajo*, `assigned`). |
| `/actividades-recurrentes` | Actividades recurrentes | Actividades que se repiten (reportes, validaciones, revisiones). Vista *Qué me toca* por defecto (ocurrencias del actor, `scope=mine`, agrupadas por periodo) con acciones *Tomar* y *Completar* (comentario opcional) y detalle de solo lectura de las completadas. Para JEFE_AREA/ADMIN, una pestaña *Gestión* con el alta/edición/pausa de definiciones y una pestaña *Cumplimiento* (panel con totales y desgloses a tiempo/destiempo/vencidas por actividad y responsable, filtrable por rango de fechas). Menú: *Actividades recurrentes*, `recurring`. |

## Demanda (`/demanda/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/demanda/solicitudes` | Solicitudes | Registrar y consultar solicitudes de demanda; cada fila ofrece la acción *Ver detalle* que abre la ficha de la solicitud (menú grupo *Demanda*, `requests`). La columna *Decisión de triage* muestra el resultado del triage, y la leyenda de bandas P1 a P4 es un desplegable (*¿Qué significan P1 a P4?*) que también usan Portafolio y Aprobaciones. |
| `/demanda/solicitudes/[id]` | Detalle de la solicitud | Ficha de **solo lectura** que reúne el recorrido completo de la solicitud en un stepper vertical con todas las etapas visibles (Solicitud, Triage, Priorización, Aprobación/Compromiso, Planificación, Gobierno y validación, Estabilización/Cierre); cada etapa muestra su estado derivado y, cuando el módulo y el estado lo permiten, un enlace *Ir a actuar* hacia la bandeja correspondiente. Se llega desde la acción *Ver detalle* de Solicitudes (no es ítem de menú, `requests`). Incluye el panel *Cierre del proyecto*: estado funcional, validaciones de tareas y documentación, carga y envío a aprobación de la documentación de cierre, *Solicitar cierre*, aprobación o rechazo (jefe), reapertura (jefe) e historial. |
| `/demanda/triage` | Triage | Clasificar la solicitud, decidir su ruta y asociar su **activo base** (solo un activo **existente** visible para el proceso; el triage no crea activos y enlaza al módulo de Activos), requisito para priorizar (`triage`). Sin solicitud elegida muestra una **bandeja** con las pendientes de triage (un clic abre el formulario; el selector sigue disponible). La columna lateral incluye un panel **Sugerencia de IA**: un botón pide la sugerencia (no persiste nada), muestra los cinco codes orientativos con botones para **prefijar** los selects del formulario, la banda de prioridad `P1`–`P4` orientativa, posibles duplicados enlazados e información faltante; si la IA está apagada o falla, muestra un aviso y el triage manual sigue operativo. |
| `/demanda/priorizacion` | Priorización | Evaluar con los criterios ponderados y ordenar el backlog (`priority`). Sin solicitud elegida muestra una **bandeja** con las solicitudes listas para priorizar (un clic abre la evaluación). |
| `/demanda/resumen` | Indicadores | Panorama/indicadores de demanda (menú grupo *Ejecución* como *Indicadores*, `demandOverview`). Solo muestra indicadores calculables; los que dependen de datos futuros (cambios fallidos, recuperación, adopción y valor) no se listan. |

## Seguimiento y ejecución (`/seguimiento/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/seguimiento/plan` | Planificación | Gestionar el plan, fases, tareas y dependencias; importar/exportar en Excel (.xlsx) con plantilla descargable y lista de errores por fila; el bloque de envío a autorización va al final de la pantalla (menú grupo *Ejecución* como *Planificación*, `plan`). Sin solicitud elegida muestra una **bandeja** agrupada (comprometidas, en planificación, en ejecución). |
| `/seguimiento/portafolio` | Portafolio | Vista consolidada de solo lectura de todas las iniciativas en alcance: el título abre la ficha del proyecto (`/demanda/solicitudes/:id`); muestra el **avance** (barra, promedio de sus tareas) y la **alerta de fecha objetivo** (*En tiempo*, *Vence en N días*, *Vencido hace N días*; sin alerta si el proyecto está cerrado, rechazado o retirado) (`portfolio`). |
| `/seguimiento/proyectos` | Proyectos | Área de proyectos, **sin ítem en el menú** mientras no exista (la ruta se conserva; módulo `project`). Objetivo: la **ficha operativa de un proyecto** (detalle, plan, tareas, documentos, bitácoras y avance); hoy esa ficha vive en `/demanda/solicitudes/:id`. |
| `/seguimiento/tareas` | Tarea | Detalle de una tarea (lee `?taskId=`); se llega desde *Mi trabajo*; no es un ítem de menú. Sin `taskId`, quien tiene el módulo *Mi trabajo* es redirigido a `/mi-trabajo`. En *Planificación* el mismo detalle se abre como **panel lateral derecho** al hacer clic en el título de la tarea (con botón cerrar). Incluye estado, predecesoras (basta con que estén *Terminadas*; ya no existe la aceptación) y **archivos de evidencia** (adjuntar, descargar y quitar; PDF, imágenes, texto, Office o ZIP, máx. 8 MB). |
| `/seguimiento/bitacora` | Bitácora | Registrar/consultar el trabajo diario (menú grupo *Seguimiento*, `log`). |
| `/seguimiento/semanal` | Reporte semanal | Consolidar el reporte semanal del proceso (`log`). Mientras es borrador sus secciones se editan en cajas de texto; una vez enviado se muestran como texto de solo lectura. |
| `/seguimiento/novedades` | Novedades | Registrar y seguir incidencias/bloqueos (`log`). |
| `/seguimiento/reuniones` | Reuniones y compromisos | Módulo unificado de control de actas (`meeting`), con dos pestañas. **Actas**: lista de reuniones; el acta muestra participantes, responsable, agenda, decisiones y observaciones, y debajo sus compromisos (agregar, editar y cambiar estado). Se cierra como registro (*Cerrar acta*), se reabre (líder o jefe) y se descarga en Markdown o se imprime/guarda como PDF. **Compromisos**: seguimiento consolidado de todos los compromisos en alcance, con filtros de estado (abiertos, vencidos, terminados), persona y acta (incluido *Sin acta*); permite registrar compromisos sin acta. Admite `?tab=compromisos`, `?meetingId=` y `?commitmentId=` para los enlaces de las notificaciones. |
| `/seguimiento/compromisos` | — | Ruta antigua: redirige a la pestaña *Compromisos* de *Reuniones y compromisos*. |

## Activos y conocimiento (`/activos/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/activos/capacidad` | Capacidad | Registrar disponibilidad y asignaciones de horas por mes (menú grupo *Ejecución* como *Capacidad*, `capacity`). |
| `/activos/catalogo` | Activos | Inventario de activos genéricos; cada fila ofrece *Ver historial*. Crear/editar y cambiar estado solo los ve el **jefe de área** (el diálogo define nombre, descripción general y los procesos que pueden ver el activo); los demás roles ven la tabla en modo lectura (menú grupo *Activos y conocimiento*, `asset`). |
| `/activos/catalogo/[id]/historial` | Historial por activo | Vista de solo lectura de las solicitudes que tienen el activo como base, con su estado y proceso, ordenadas por fecha de registro; se llega desde la acción *Ver historial* del catálogo (no es ítem de menú, `asset`). |
| `/activos/documentos` | Documentos | Documentación Markdown versionada de los activos (`docs`). Incluye el flujo de aprobación (enviar, aprobar/rechazar con motivo, reenviar) y abre directamente un documento con `?documentId=`. |

## Gobierno (`/gobierno/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/gobierno/auditoria` | Auditoría | Consultar la bitácora de eventos de auditoría con filtros «Objeto» y «Acción» y paginación contra el servidor (menú grupo *Gobierno*, `audit`). |
| `/gobierno/mis-permisos` | Mis permisos | Ver el rol, el alcance y los módulos permitidos del propio usuario (`permissions`). |
| `/gobierno/equipo` | Equipo y permisos | Gestionar usuarios y conceder/revocar grants (menú grupo *Administración*, `team`). Cada usuario tiene un botón de icono *Reenviar invitación* (con tooltip), porque la API no expone si ya activó su cuenta. |

## Administración (`/administracion/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/administracion/revision` | Aprobaciones | Colas de aprobación (con un único botón *Actualizar* en la cabecera y los vacíos en una línea): compromisos, planes por autorizar, documentación por aprobar y cierres de proyecto por aprobar; el título de cada fila enlaza a la solicitud, al plan, al documento o al resumen del proyecto. Solo `JEFE_AREA` puede aprobar el compromiso o devolver a triage; `LIDER_PROCESO` ve la cola en modo lectura (menú grupo *Demanda* como *Aprobaciones*, `review`). |
| `/administracion/frameworks` | Controles | Ciclo de control de gobierno (gates GC1–GC5) y validaciones (menú grupo *Gobierno* como *Controles*, `frameworks`). Sin solicitud elegida muestra una **bandeja** con las solicitudes en alcance. |
| `/administracion/maestras` | Maestras | Administrar las maestras/catálogos (`admin`); también marca activa la ruta `/catalogs`. |
| `/administracion/solicitantes` | Solicitantes | Maestro de solicitantes: listado, alta, edición y activar/inactivar; cada solicitante se asocia a un área activa (`requesters`, `ADMIN` y `JEFE_AREA`). |
| `/administracion/areas` | Áreas | Crear y editar áreas organizativas (por ejemplo, Analítica) que agrupan procesos: listado, alta y edición de nombre/estado/orden. Roles ADMIN y jefe de área (`areas`). |
| `/administracion/procesos` | Procesos | Crear y editar procesos (por ejemplo, BI, Integraciones, IA) agrupados por área: el alta exige un área activa y la edición no mueve el proceso de área. Rol ADMIN o jefe de área (`processesAdmin`). |
| `/administracion/configuracion-smtp` | Configuración SMTP | Configurar el servidor SMTP en runtime (host, puerto, remitente, contraseña write-only) con prueba de envío, y gestionar los administradores del sistema (toggle `isAdmin`). Solo rol ADMIN (`systemSettings`). |
| `/administracion/ia` | Agentes de IA | Configurar los agentes de IA (credenciales de AWS Bedrock, modelo, prompt y parámetros) desde la plataforma. Solo rol ADMIN (`aiSettings`). |

## Catálogos (`/catalogs`) — funcionalidad base

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/catalogs` | Maestras (operativa) | Pantalla operativa de catálogos de la plantilla; fuera del menú, el ítem *Maestras* la marca como activa. |

## Estados de pantalla

Las vistas que consumen datos contemplan, cuando corresponde, los estados de carga,
vacío, éxito y error, y los formularios muestran labels, validaciones junto al campo y
estado de envío (ver el *steering* de frontend). Esos detalles viven en cada
`*-view.tsx`.
