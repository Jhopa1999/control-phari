# Frontend y pantallas

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

El frontend (Next.js, App Router) vive en `apps/web/src/app/`. Cada `page.tsx` es una
envoltura delgada que delega en su componente de vista (`*-view.tsx`) y consume la API
del backend. El frontend no accede a la base de datos ni usa Prisma.

El portal es un **workspace GIBO** con aplicaciones. Hoy existe una sola, **Demanda**, que
reúne los grupos *Entrada* (sin título), *Demanda*, *Ejecución*, *Seguimiento* y
*Activos y conocimiento*; los grupos *Gobierno* y *Administración* son **transversales**
(no pertenecen a ninguna app) y se muestran en la sección plegable **Workspace** al final
del menú (plegada por defecto; se abre sola al llegar a una de sus pantallas, y en el riel
se ven siempre como iconos). La pertenencia a una app se declara en `navigation.ts`
(`NAV_APPS` y `appId` en cada grupo); **las URLs no cambian**. Bajo la marca del menú hay un
**selector de aplicaciones** (`app-switcher.tsx`, un menú desplegable con enlaces): muestra
la app activa, las apps visibles para el usuario (las que tienen al menos un módulo
permitido) y el acceso a *Inicio del workspace* (`/aplicaciones`). La app activa es la dueña
de la ruta; en una pantalla transversal o en `/aplicaciones` se conserva la última usada
(`localStorage`, clave `activeAppId`). El logo lleva al inicio de la única app visible, o a
`/aplicaciones` si hay varias. En escritorio, la barra superior muestra migas
*Workspace › {app | Gobierno | Administración}*. El buscador de pantallas busca en todo lo
visible, también en otras apps.

El menú lateral se define en `apps/web/src/lib/navigation.ts`: 7 grupos y 27 ítems.
Con el menú expandido (no en el riel de iconos), cada grupo con título se puede
plegar con su encabezado; el navegador recuerda los grupos plegados y un grupo se
vuelve a abrir al llegar a una de sus pantallas. Arriba hay un buscador de
pantallas que filtra por nombre o por grupo sin distinguir tildes ni mayúsculas
(Enter abre la primera coincidencia, Esc limpia el texto).
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
| `/aplicaciones` | Inicio del workspace | Aplicaciones a las que el usuario tiene acceso (tarjeta grande con una sola app, rejilla con varias) y *Accesos del workspace* (Gobierno y Administración según permisos). Estados: cargando, sin usuario (dev-header), error con *Reintentar* y sin aplicaciones habilitadas. Solo requiere sesión; no tiene `moduleKey`. Especificación: `docs/design/workspace-apps-gibo.md`. |
| `/inicio` | Panel del área | Tablero de inicio del actor (menú: *Panel del área*, `dashboard`). Abre con el bloque *Requiere tu atención* (`GET /area-control/attention`, a hoy, sin depender del periodo): tarjetas con solicitudes pendientes de triage, listas para priorizar, por aprobar y tareas vencidas, cada una enlazada a su mesa y solo si el rol tiene el módulo; sin pendientes muestra *Todo al día*. Las distribuciones por estado y por banda de prioridad listan solo los valores con solicitudes; los valores en cero se pliegan bajo *Sin solicitudes (N)*. El pie del menú lateral reúne en una fila al usuario autenticado y los botones de icono *Contraer menú* y *Cerrar sesión*. |
| `/mi-trabajo` | Mi trabajo | Tareas asignadas al usuario actual; enlaza al detalle de tarea (menú: *Mi trabajo*, `assigned`). |
| `/actividades-recurrentes` | Actividades recurrentes | Actividades que se repiten (reportes, validaciones, revisiones). Vista *Qué me toca* por defecto (ocurrencias del actor, `scope=mine`, agrupadas por periodo) con acciones *Tomar* y *Completar* (comentario opcional) y detalle de solo lectura de las completadas. Para JEFE_AREA/ADMIN, una pestaña *Gestión* con el alta/edición/pausa de definiciones y una pestaña *Cumplimiento* (panel con totales y desgloses a tiempo/destiempo/vencidas por actividad y responsable, filtrable por rango de fechas). Menú: *Actividades recurrentes*, `recurring`. |

## Demanda (`/demanda/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/demanda/solicitudes` | Solicitudes | En el formulario *Nueva solicitud*, el enlace *¿No está en la lista? Crear solicitante* (administrador y jefatura de área) abre el alta en un diálogo sin perder lo digitado y deja al nuevo solicitante seleccionado; dentro de ese diálogo, *¿No está el área? Crear área* hace lo mismo con el área (administrador y jefatura); quien no tiene permiso ve a quién pedirlo. El solicitante solo elige título, solicitante, dueño funcional, fecha objetivo y resultado esperado: la ficha **ya no incluye el proceso principal ni los procesos participantes** (ambos se deciden en el triage; la solicitud se registra sin proceso). El listado muestra «Sin proceso aún» en la columna/tarjeta de proceso mientras la solicitud no tenga proceso principal. El menú lateral es fijo a la ventana (position: fixed) y no se mueve al hacer scroll. Registrar y consultar solicitudes de demanda; cada fila ofrece la acción *Ver detalle* que abre la ficha de la solicitud (menú grupo *Demanda*, `requests`). La columna *Decisión de triage* muestra el resultado del triage, y la leyenda de bandas P1 a P4 es un desplegable (*¿Qué significan P1 a P4?*) que también usan Portafolio y Aprobaciones. En móvil (< 768 px) este listado, Portafolio, Mi trabajo, Activos y Documentos muestran **tarjetas por fila** (con selector *Ordenar por* y menú «…» de 44 px) en lugar de la tabla con desplazamiento horizontal; desde 768 px vuelve la tabla. |
| `/demanda/solicitudes/[id]` | Detalle de la solicitud | Ficha de **solo lectura** que reúne el recorrido completo de la solicitud en un stepper vertical con todas las etapas visibles (Solicitud, Triage, Priorización, Aprobación/Compromiso, Planificación, Gobierno y validación, Estabilización/Cierre); cada etapa muestra su estado derivado y, cuando el módulo y el estado lo permiten, un enlace *Ir a actuar* hacia la bandeja correspondiente. Se llega desde la acción *Ver detalle* de Solicitudes (no es ítem de menú, `requests`). Incluye el panel *Cierre del proyecto*: estado funcional, validaciones de tareas y documentación, carga y envío a aprobación de la documentación de cierre, *Solicitar cierre*, aprobación o rechazo (jefe), reapertura (jefe) e historial. |
| `/demanda/triage` | Triage | Clasificar la solicitud, decidir su ruta y asociar su **activo base** (solo un activo **existente** visible para el proceso; el triage no crea activos y enlaza al módulo de Activos), requisito para priorizar (`triage`). El **Activo base** es el primer bloque del formulario, destacado: elegirlo es obligatorio para decidir *Continuar* (el error aparece junto al campo y el activo se asocia justo después de registrar el triage); el panel lateral de activo solo aparece en los estados posteriores. Los desplegables de Ruta, Tipo de demanda, Criticidad, Tamaño y Disponibilidad muestran bajo cada opción su **descripción** (editable en Maestras). El bloque **Proceso principal** (selección única de procesos activos) aparece cuando la solicitud aún no tiene proceso: aquí se fija el proceso líder, **obligatorio para decidir *Continuar*** (el error aparece junto al campo con el texto «Para continuar debes elegir el proceso principal de la solicitud.»); si la solicitud ya lo tiene, se muestra fijo. Al elegir el proceso principal en el formulario, el desplegable **Responsable principal** se recarga con los candidatos elegibles de ese proceso (líderes activos; o su equipo si no hay líder) y descarta el responsable elegido si ya no pertenece a la nueva lista; mientras no haya proceso el campo permanece deshabilitado con un texto que invita a elegir primero el proceso, y muestra «Cargando responsables…» durante la recarga. El bloque **Procesos que intervienen** (selección múltiple de casillas) decide qué procesos participan además del principal: el proceso principal efectivo (el ya fijado o el elegido en este formulario) se muestra fijo como *Principal · Líder* (siempre participa, no se puede quitar) y los demás procesos activos son seleccionables; sus responsables podrán asumir tareas en el plan. El campo **Dependencias** lleva una glosa fija de ayuda: «Indica de qué depende esta solicitud para avanzar: otras áreas o procesos, datos, accesos, decisiones o entregables previos.» Sin solicitud elegida muestra una **bandeja** con las pendientes de triage (un clic abre el formulario; el selector sigue disponible). La columna lateral termina con un panel **Sugerencia de IA** compacto: un botón pide la sugerencia (no persiste nada), muestra los cinco codes orientativos con *Usar* por fila y *Aplicar todo*, la banda `P1`–`P4` orientativa y, en secciones plegables (cerradas por defecto, con contador y scroll propio), los posibles duplicados enlazados y la información faltante; si la IA está apagada o falla, muestra un aviso y el triage manual sigue operativo. |
| `/demanda/priorizacion` | Priorización | Evaluar con los criterios ponderados y ordenar el backlog (`priority`). Sin solicitud elegida muestra una **bandeja** con las solicitudes listas para priorizar (un clic abre la evaluación). |
| `/demanda/resumen` | Indicadores | Panorama/indicadores de demanda (menú grupo *Ejecución* como *Indicadores*, `demandOverview`). Solo muestra indicadores calculables; los que dependen de datos futuros (cambios fallidos, recuperación, adopción y valor) no se listan. |

## Seguimiento y ejecución (`/seguimiento/*`)

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/seguimiento/plan` | Planificación | Gestionar el plan, fases, tareas y dependencias; **un solo Exportar y un solo Importar, ambos en Excel (.xlsx)** (la plantilla vacía es un enlace de ayuda junto a Importar; se retiró el CSV) con lista de errores por fila; la tabla de tareas muestra Tarea, Responsable, **Avance** (barra y % que abren un diálogo con deslizador, número y atajos 0/25/50/75/100 para cambiarlo sin entrar al detalle), **Plazo** (con aviso de vencida o por vencer) y Estado; el kanban abre el **detalle** desde el título o la tarjeta; el detalle (panel lateral) abre con el estado, el avance, responsable, fase y fechas, y tiene pestañas Resumen, **Historial** (línea de tiempo por día con quién, fecha y hora y cada campo con su valor anterior y nuevo) y Evidencia; el diálogo de tarea muestra la **Fase** destacada y preseleccionada; el selector de **Responsable** (tanto en el diálogo como el reasignador en línea del listado y el kanban) ofrece solo a las personas con grant activo en los procesos que intervienen en la solicitud (candidatos de `GET /plans/:planId/responsible-candidates`), no a todas las del área; el bloque de envío a autorización va al final de la pantalla (menú grupo *Ejecución* como *Planificación*, `plan`). Sin solicitud elegida muestra una **bandeja** agrupada (comprometidas, en planificación, en ejecución). |
| `/seguimiento/portafolio` | Portafolio | Vista consolidada de solo lectura de todas las iniciativas en alcance: el título abre la ficha del proyecto (`/demanda/solicitudes/:id`); muestra el **avance** (barra, promedio de sus tareas) y la **alerta de fecha objetivo** (*En tiempo*, *Vence en N días*, *Vencido hace N días*; sin alerta si el proyecto está cerrado, rechazado o retirado) (`portfolio`). La tabla tiene 7 columnas: bajo el título van el proceso y la ruta de gobierno, el bloqueo se muestra junto al estado y la fecha de compromiso junto al objetivo. En móvil, los listados con búsqueda (Solicitudes, Portafolio, Mi trabajo, Activos y Documentos) pliegan los filtros bajo un botón *Filtros* y dejan visible la búsqueda. |
| `/seguimiento/proyectos` | Proyectos | Área de proyectos, **sin ítem en el menú** mientras no exista (la ruta se conserva; módulo `project`). Objetivo: la **ficha operativa de un proyecto** (detalle, plan, tareas, documentos, bitácoras y avance); hoy esa ficha vive en `/demanda/solicitudes/:id`. |
| `/seguimiento/tareas` | Tarea | Detalle de una tarea (lee `?taskId=`); se llega desde *Mi trabajo*; no es un ítem de menú. Sin `taskId`, quien tiene el módulo *Mi trabajo* es redirigido a `/mi-trabajo`. En *Planificación* el mismo detalle se abre como **panel lateral derecho** al hacer clic en el título de la tarea (con botón cerrar). Incluye estado, predecesoras (basta con que estén *Terminadas*; ya no existe la aceptación) y **archivos de evidencia** (adjuntar, descargar y quitar; PDF, imágenes, texto, Office o ZIP, máx. 8 MB). |
| `/seguimiento/bitacora` | Bitácora | Registrar y revisar el trabajo diario (menú grupo *Seguimiento*, `log`). Pestañas **Mis diarios** y **Equipo** (esta última solo para jefe y líder), tira de indicadores (diarios, horas, por revisar/pendientes de enviar, borradores/devueltos), filtros de fechas (atajos), persona, proceso, estado, clasificación y búsqueda de texto, **todos guardados en la URL**, tabla paginada en el servidor (tarjetas en móvil) con persona, proceso, horas, distribución y estado (incluye *Devuelto*). Al abrir un diario (`?diario=<id>`) se muestra un panel lateral con notas, dedicación, actividades expandibles con toda su información (proyecto, tarea, novedad, activo, solicitante, resultado, evidencia, próximo paso), historial y las acciones que permite el servidor: editar, enviar, retirar el envío, eliminar (autor) y marcar como revisado o devolver con motivo (jefe o líder, nunca el autor). |
| `/seguimiento/semanal` | Reporte semanal | Consolidar el reporte semanal del proceso (`log`). La lista muestra la semana (lunes a domingo), el autor y el proceso, con filtros de persona (jefe y líder) y estado. Mientras es borrador sus secciones se editan en cajas de texto; una vez enviado se muestran como texto de solo lectura. El jefe o líder puede marcarlo como revisado o devolverlo con motivo; el autor ve el motivo de la devolución. |
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
| `/administracion/ia` | Agentes de IA | Configurar los agentes de IA (credenciales de AWS Bedrock, modelo, prompt y parámetros) desde la plataforma. Incluye el **consumo del mes** (selector de los últimos 12 meses, gasto, tope, porcentaje usado, llamadas y tokens, barra del presupuesto con la marca del umbral de alerta, aviso de llamadas sin precio y desglose por agente y por modelo), el **presupuesto** (tope mensual en USD, vacío = sin tope, y porcentaje de alerta; al llegar al umbral y al agotarse se notifica a los administradores) y el **catálogo de modelos** (alta, edición de nombre, nivel, capacidades y precios por millón de tokens, y habilitar o deshabilitar con confirmación si un agente lo usa). Solo rol ADMIN (`aiSettings`). |

## Asistente de IA (`/asistente/*`)

Asistente conversacional: responde preguntas sobre solicitudes y
proyectos consultando datos con herramientas del MCP, con los permisos de la persona. No hay
ítem en el menú lateral: se abre con el botón **Asistente** del encabezado (escritorio) o su
icono en la barra móvil, disponible en todo el portal. Especificación visual:
`docs/design/asistente-chat-ui.md`.

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| *(panel)* | Panel lateral del asistente | Sheet derecho (pantalla completa en móvil) con la conversación, el historial interno y el acceso a la página completa. El estado (conversación activa, borrador, respuesta en curso) vive en `AssistantProvider` del shell. |
| `/asistente` | Historial | Lista de conversaciones agrupada por fecha (en ≥1280 px, junto a la conversación en dos columnas). Abrir y eliminar con confirmación. |
| `/asistente/nueva` | Conversación nueva | Estado vacío con cinco preguntas sugeridas que se envían al pulsarlas. Al primer mensaje la URL pasa a `/asistente/{id}` sin recargar. |
| `/asistente/{id}` | Conversación | Hilo con respuestas en Markdown (tablas desplazables, enlaces a pantallas del portal), fuentes consultadas expandibles, copiar, detener y reintentar. |

**Adjuntos.** En el campo de mensaje, el botón del clip (también arrastrando archivos sobre el campo
o pegando una imagen) adjunta imágenes y documentos. Cada archivo se sube al instante y aparece como un
chip con su estado (subiendo con avance, leyendo el contenido, listo o con error y motivo; en error
recuperable se puede reintentar). Al terminar de leerlo, el chip abre **«Esto entendí del adjunto»**:
el texto extraído, editable, con contador y aviso si se recortó; los cambios se guardan o se
descartan con confirmación. No se puede enviar mientras un adjunto se sube, se lee o tiene error, y la
razón se muestra junto al campo. Se puede enviar solo con adjuntos. Los límites (5 archivos, tamaño por
tipo) vienen de la API; los archivos no permitidos se rechazan antes de subirlos explicando el motivo.
Tras enviar, el mensaje muestra los archivos como chips que abren el texto que leyó el asistente en
solo lectura (también al reabrir la conversación). Especificación: `docs/design/asistente-adjuntos.md`.

**Propuestas de acción.** Cuando el asistente prepara una escritura (crear o editar una solicitud,
registrar triage o prioridad, crear un plan o tareas) muestra una **tarjeta de propuesta** dentro de su
respuesta: título de la acción, resumen en palabras, los datos exactos plegables («Ver los datos
exactos») y los botones **Confirmar** y **Descartar**. Nunca se confirma sola. Estados: pendiente de tu
confirmación, ejecutando, confirmada (con enlace «Ver solicitud» cuando aplica), no se realizó (con el
motivo que dio la API; no se aplicó ningún cambio), descartada y vencida (a las 24 h). Las tarjetas
se conservan al reabrir la conversación. Mientras el asistente sigue respondiendo, los botones están
deshabilitados.

Comportamiento: Enter envía (Mayús+Enter salto de línea; en táctil Enter inserta salto); límite
de 4 000 caracteres con contador desde 3 500; si el asistente no está disponible (IA apagada,
presupuesto agotado o sin MCP) el botón del encabezado queda como acción no disponible con el
motivo en un tooltip y el campo se deshabilita; un fallo antes de empezar la respuesta conserva el
mensaje y ofrece «Reintentar». La región viva anuncia hitos (no el texto). Cambiar de conversación
o de pantalla durante una respuesta la detiene; lo recibido se conserva.

## Catálogos (`/catalogs`) — funcionalidad base

| Ruta | Pantalla | Qué permite hacer |
| --- | --- | --- |
| `/catalogs` | Maestras (operativa) | Pantalla operativa de catálogos de la plantilla; fuera del menú, el ítem *Maestras* la marca como activa. |

## Estados de pantalla

Las vistas que consumen datos contemplan, cuando corresponde, los estados de carga,
vacío, éxito y error, y los formularios muestran labels, validaciones junto al campo y
estado de envío (ver el *steering* de frontend). Esos detalles viven en cada
`*-view.tsx`.
