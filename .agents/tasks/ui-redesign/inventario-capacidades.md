# Inventario de capacidades (baseline UI)

Contrato de "ninguna capacidad perdida" para la renovacion de UI. Baseline: commit `0918f1b` (rama `feat/ui-redesign`).
Cada accion, filtro, campo, dialogo, tabla y condicion listada aqui debe seguir existiendo (con igual comportamiento funcional) tras el rediseño. La presentacion puede reorganizarse.

Convenciones:
- `perm:X` = condicionado a `allowedModules.has('X')` de `GET /me/permissions` (cosmetico; el backend es la autoridad).
- `dev-header` / `jwt` = condicionado por `NEXT_PUBLIC_AUTH_MODE` (`getAuthMode()`).
- Estados estandar de carga en casi todas las vistas: skeleton (cargando), error + boton "Reintentar", vacio con texto guia. Se listan solo cuando difieren.

---

## Shell global (layout, RouteGuard, AppSidebar)

Fuentes: `components/route-guard.tsx`, `components/app-sidebar.tsx`, `lib/navigation.ts`, `lib/actor-context.tsx`, `app/page.tsx`.

- `/` redirige a `/inicio`.
- RouteGuard:
  - dev-header: siempre monta shell (sidebar + main), sin guard ni login.
  - jwt: `/login` sin shell; ruta protegida sin sesion -> `router.replace('/login')` y mensaje "Redirigiendo al inicio de sesion..."; sesion expirada (401 en /me/permissions) -> `/login?expired=1`; permisos cargando -> "Cargando tu sesion...".
- Sidebar:
  - Marca "Portal del area" con icono.
  - dev-header: label "Usuario actual (dev)" + Select `id=actor-select`, `aria-label="Usuario actual"`, opciones desde `GET /dev/actors` (nombre; value=identifier); persiste en `localStorage.actorId`. Estados: skeleton, error "No fue posible cargar los usuarios.".
  - jwt: bloque "Sesion" con nombre (`aria-label="Usuario autenticado"`), identifier, boton "Cerrar sesion" (logout -> `/login`). No consulta /dev/actors.
  - Nav `aria-label="Navegacion principal"`, grupos/items filtrados por `allowedModules` (grupo oculto si no tiene items). Item activo con `aria-current="page"` (match exacto o prefijo).
  - Estados de nav: sin actor ("Selecciona un usuario para ver tus modulos." / jwt "Cargando tu sesion..."), cargando (5 skeletons), error ("No fue posible cargar tus permisos."), sin modulos ("No tienes modulos habilitados.").
- Mapa de navegacion (href -> label -> moduleKey):
  - Inicio: `/inicio` Control del area `dashboard`; `/mi-trabajo` Mi trabajo `assigned`.
  - Demanda: `/demanda/resumen` Resumen de demanda `demandOverview`; `/demanda/solicitudes` Solicitudes `requests`; `/demanda/triage` Triage `triage`; `/demanda/priorizacion` Priorizacion `priority`.
  - Seguimiento: `/seguimiento/plan` Plan `plan`; `/seguimiento/portafolio` Portafolio `portfolio`; `/seguimiento/proyectos` Proyectos `project`; `/seguimiento/tareas` Tareas `task`; `/seguimiento/bitacora` Bitacora `log`; `/seguimiento/semanal` Semanal `log`; `/seguimiento/novedades` Novedades `log`; `/seguimiento/reuniones` Reuniones `meeting`; `/seguimiento/compromisos` Compromisos `meeting`.
  - Activos: `/activos/catalogo` Activos `asset`; `/activos/documentos` Documentos `docs`; `/activos/capacidad` Capacidad `capacity`.
  - Administracion: `/administracion/maestras` Configuracion / maestras `admin`; `/administracion/frameworks` Frameworks `frameworks`; `/administracion/revision` Revision `review`.
  - Gobierno: `/gobierno/equipo` Equipo y permisos `team`; `/gobierno/auditoria` Auditoria `audit`; `/gobierno/mis-permisos` Mis permisos `permissions`.
  - `/catalogs` no esta en el menu (ruta heredada, operativa).
- Toasts globales (sonner) para exito/error en mutaciones.

---

## /login

Fuentes: `app/login/page.tsx`, `app/login/login-form.tsx`.

- Relevante en jwt (en dev-header la ruta existe pero se renderiza dentro del shell, sin efecto de guard).
- Card "Iniciar sesion" / "Accede con tu usuario o correo del portal."
- Aviso `role=status` si `?expired=1`: "La sesion expiro, vuelve a iniciar sesion.".
- Formulario (`noValidate`): "Usuario o correo" (`id=identifier`, autocomplete username), "Contrasena" (`id=password`, type password, autocomplete current-password).
- Validacion por campo con `role=alert` + `aria-describedby`/`aria-invalid`: "Ingresa tu usuario o correo." / "Ingresa tu contrasena.".
- Error de formulario: 401 -> "Usuario o contrasena incorrectos."; otro ApiError -> mensaje del backend; otro -> generico.
- Boton "Ingresar" (deshabilitado + spinner "Ingresando..." al enviar; campos deshabilitados). Exito -> `login(token,user)` y `router.replace('/inicio')`.

---

## /inicio (Control del area) — perm:dashboard

Fuente: `app/inicio/dashboard-view.tsx`.

- Filtros: fieldset "Periodo" con "Desde" (`dashboard-from`, date, max=to) y "Hasta" (`dashboard-to`, date, min=from). Default: primer dia del mes actual -> primer dia del mes siguiente (UTC). Recarga automatica al cambiar (ignora valor vacio).
- Datos: `GET` resumen de demanda (`getDemandSummary({from,to})`).
- KPIs: "Solicitudes en alcance" (total), "Bloqueadas activas" (blockedActive).
- Tablas: "Por estado operativo" (Estado | Solicitudes, etiquetas via `requestStateLabel`); "Por banda de prioridad" (Banda | Solicitudes; P1..P4 badge outline, "Sin priorizar" badge secondary). Captions sr-only.
- Estados: skeleton; error con mensaje del backend + "Reintentar"; vacio "No hay solicitudes en tu alcance para este periodo." + "Ajusta el periodo...".

---

## /mi-trabajo — perm:assigned

Fuente: `app/mi-trabajo/mi-trabajo-view.tsx`.

- Accion: "Actualizar" (recarga). Recarga tambien al cambiar actorId.
- Tabla: Tarea (+ badge "Hito" si isMilestone) | Solicitud | Fase | Vence (endDate) | Estado (badge `taskStatusLabel (progress%)`) | Accion "Abrir" -> link `/seguimiento/tareas?taskId=<id>`.
- Estados: skeleton; error "No fue posible cargar tu trabajo." + Reintentar; vacio "No tienes tareas asignadas." + guia.

---

## /catalogs (ruta heredada, sin item de menu) y /administracion/maestras — perm:admin (solo menu)

Fuentes: `app/catalogs/catalogs-view.tsx`, `app/catalogs/catalog-form-dialog.tsx`, `app/administracion/maestras/page.tsx` (reutiliza `CatalogsView`, mismo componente). Titulo de documento distinto: maestras "Configuracion / maestras | Portal del area"; catalogs "Maestras | Plantilla de Portales".

- Accion principal: "Nuevo elemento" (header y en estado vacio).
- Filtros (form con boton "Aplicar", no auto): "Catalogo" (`filter-catalog`, texto, placeholder "Todos"); "Estado" (`filter-active`: Todos/Activos/Inactivos). Carga inicial sin filtros.
- Tabla: Catalogo | Codigo | Etiqueta | Estado (badge Activo success / Inactivo secondary) | Orden | Actualizado (fecha+hora) | Acciones.
- Acciones por fila: "Editar" (abre dialogo); "Activar"/"Desactivar" (toggle `active` via PATCH, boton deshabilitado mientras procesa esa fila; toasts).
- Dialogo CatalogFormDialog (crear/editar): Catalogo (`catalog`, placeholder PRIORITY; readOnly+disabled en edicion), Codigo (`code`, placeholder HIGH; readOnly+disabled en edicion), Etiqueta (`label`), Orden (`sortOrder`, number min 0), Activo (Switch `active`). Validacion: crear exige catalogo+codigo; etiqueta obligatoria (`role=alert`). Botones Cancelar / "Crear"|"Guardar cambios" ("Guardando..."). Descripcion editar: "Catalogo y codigo son estables y no se pueden modificar.".
- Edicion envia solo label/active/sortOrder.
- Estados: skeleton; error "No fue posible comunicarse con el servidor." + Reintentar; vacio "No hay elementos todavia." + CTA.

---

## /demanda/resumen (Resumen de demanda) — perm:demandOverview

Fuente: `app/demanda/resumen/demand-overview-view.tsx`.

- Gating en vista: si permisos cargados y NO `demandOverview` -> estado `forbidden` sin llamar al backend; 403 del backend -> mismo estado. Aviso `role=note`: "Esta pantalla no esta disponible para tu rol." + explicacion (jefe de area y lideres de proceso; panorama en Inicio). En forbidden se oculta el filtro de periodo.
- Filtros: "Periodo" Desde (`indicadores-from`) / Hasta (`indicadores-to`), mismos defaults y reglas que /inicio.
- Datos: `getAreaIndicators({from,to})`.
- Grupos e indicadores (cada indicador no aplicable muestra badge "No aplica" + motivo `reason`/`futureDataNote`, nunca 0):
  - Evaluacion de demanda: "Tiempo de evaluacion inicial" (medianDays, sampleSize decisiones; siempre "Pendientes de decision inicial (a hoy): pendingCount").
  - Seguimiento de entrega: "Cumplimiento de hitos" (percentage %, met de due); "Tiempo de entrega" (medianDays, count cerradas medibles, unmeasurableClosed sin compromiso; tablas Grupo | Mediana (dias) | Cerradas por ruta de gobierno y por complejidad, ocultas si vacias).
  - Portafolio y cambios: "Bloqueos activos" (blockedRequests, openBlockingIssues; tabla Causa | Origen (Novedad / Marca de solicitud) | Casos | Dias acum.); "Cambios fallidos" (No aplica).
  - Revision operativa: "Recuperacion" (No aplica).
  - Revision de valor: "Adopcion y valor" (No aplica).
- Estados: skeleton; error + Reintentar.

---

## /demanda/solicitudes — perm:requests

Fuentes: `app/demanda/solicitudes/solicitudes-view.tsx`, `solicitud-form-dialog.tsx`.

- Datos: `listRequests()` + `listProcesses()` (si procesos falla, lista vacia).
- Accion principal: "Nueva solicitud" (header y estado vacio).
- Tabla: Titulo | Estado (badge `requestStateLabel(operationalState)`) | Triage (`triageDecisionLabel` o "-") | Score (`currentScore (priorityLabel)` o "-") | Registro (registeredAt) | Acciones: "Editar".
- Dialogo SolicitudFormDialog (crear/editar, `max-h-[90vh]` scroll, `sm:max-w-2xl`):
  - Descripcion: crear "...El proceso principal participa siempre (BR-001)."; editar "...Las fechas iniciales no se modifican (BR-017).".
  - Indicador de fases (nav "Fases del flujo", informativo): 1. Solicitud (actual, `aria-current=step`), 2. Triage, 3. Priorizacion, 4. Aprobacion (con candado). Texto de precondiciones: editar "Triage disponible tras registrar; Priorizacion solo si el triage es Continuar; Aprobacion tras priorizar..."; crear "Al registrar quedara en estado Registrada y habilitara el Triage.".
  - Campos: Titulo * (`sol-title`, autofocus); Fecha de registro (solo lectura); Estado operativo (badge solo lectura, BR-022); Proceso principal * (`sol-main-process` Select de procesos activos; en edicion input deshabilitado con nombre); Participantes (fieldset: principal checkbox marcado+deshabilitado con badge "Principal"; checkboxes `sol-participant-<id>` para el resto de procesos activos; al cambiar principal se quita de participantes); Area solicitante (`sol-area`); Solicitante (`sol-requester`); Dueno funcional (`sol-owner`); Fecha objetivo (`sol-target`, date); Ficha / enlace de referencia (`sol-url`, url); Resultado esperado (`sol-result`, textarea). Solo edicion: Compromiso inicial (solo lectura, BR-017) y Justificacion del cambio (`sol-justification`, textarea).
  - Validacion cliente: titulo obligatorio; proceso principal obligatorio. Error del backend en linea (`role=alert`) + toast; ante fallo el dialogo queda abierto con valores (AC-031).
  - Botones: Cancelar / "Registrar solicitud" | "Guardar cambios" ("Guardando...").
  - Crear envia mainProcessId; editar envia changeJustification y no mainProcessId.
- Estados: skeleton; error + Reintentar; vacio "No hay solicitudes todavia." + CTA.

---

## /seguimiento/proyectos — perm:project

Fuente: `app/seguimiento/proyectos/page.tsx` (componente `UnderConstruction`).

- Placeholder: titulo "Proyectos", descripcion "Seguimiento de proyectos en curso.", bloque "En construccion" con icono y texto explicativo. Sin acciones ni datos.

---

## /demanda/triage — perm:triage

Fuente: `app/demanda/triage/triage-view.tsx`.

- Datos: `listRequests()` + catalogos activos `TRIAGE_ROUTE`, `DEMAND_TYPE`, `CRITICALITY`, `TRIAGE_SIZE`, `DATA_AVAILABILITY` (cada uno degrada a vacio si falla).
- Selector principal: "Solicitud" (`triage-request`), opciones "titulo - estado". Al cambiar resetea formulario.
- Bloqueo: formulario solo si `operationalState === 'REGISTRADA'`; si no, panel con candado "Triage no disponible" + estado actual (badge) + explicacion ("solo puede registrarse cuando la solicitud esta Registrada; una vez decidido no se vuelve a ejecutar").
- Formulario: Ruta (`triage-route`), Tipo de demanda (`triage-type`), Criticidad (`triage-criticality`), Tamano (`triage-size`), Disponibilidad de datos (`triage-data`) — Selects de catalogo con opcion "Sin especificar"; Esfuerzo (horas) (`triage-effort`, number min 0); Responsable principal (`triage-responsible`); Dependencias (`triage-dependencies`, textarea); Observaciones (`triage-notes`, textarea); Decision * (`triage-decision`: Continuar / Devolver / Rechazar) con ayuda "Solo Continuar habilita la priorizacion.".
- Validacion: decision obligatoria. Error backend en linea + toast; exito: toast "Triage registrado.", reset y recarga.
- Boton "Guardar triage" ("Guardando...").
- Estados: skeleton; error + Reintentar; vacio "No hay solicitudes en tu alcance." + guia.

---

## /demanda/priorizacion — perm:priority

Fuente: `app/demanda/priorizacion/priorizacion-view.tsx`.

- Datos: `listRequests()`.
- Selector: "Solicitud" (`priority-request`), opciones "titulo - estado"; muestra "Score vigente: N (label)" si existe.
- Bloqueo: formulario solo si triage vigente `CONTINUAR` y estado `EN_TRIAGE` o `BACKLOG_PRIORIZADO`; si no, panel con candado "Priorizacion no disponible" + explicacion + estado actual (badge) + "triage X" / "sin triage".
- Formulario: 8 criterios (Select 1-5, default 3; ids `priority-<key>`) con peso visible: Impacto 25, Alineacion 15, Control del riesgo 15, Urgencia 10, Alcance 10, Disponibilidad de datos 10, Factibilidad 10, Reutilizacion 5. Justificacion (`priority-justification`, textarea, opcional).
- Aviso fijo: "Guardar la evaluacion no aprueba el compromiso (BR-006). La aprobacion se decide por separado en Revision.".
- Boton "Guardar evaluacion" ("Guardando..."). Exito: toast "Evaluacion guardada. Score N (thresholdLabel)." (score lo calcula el backend), limpia justificacion y recarga. Error en linea + toast.
- Estados: skeleton; error + Reintentar; vacio "No hay solicitudes en tu alcance.".

---

## /seguimiento/plan — perm:plan

Fuentes: `app/seguimiento/plan/plan-view.tsx`, `phase-dialog.tsx`, `task-dialog.tsx`. Titulo H1 "Planificacion".

- Selector "Solicitud" (`plan-request`): solicitudes en estados `COMPROMETIDA`, `EN_PLANIFICACION`, `EN_EJECUCION` (una llamada por estado); opcion "titulo (estado)". Recarga al cambiar actor. Estados propios: skeleton, error + Reintentar, vacio "No hay solicitudes comprometidas, en planificacion o en ejecucion en tu alcance.".
- Panel de plan: cargando; error "No fue posible cargar el plan." + Reintentar; sin plan (404) -> "Esta solicitud aun no tiene un plan." + boton "Crear plan" (toast "Plan creado. La solicitud pasa a En planificacion."); con plan -> "Estado del plan" (`planStatusLabel`) y, si DEVUELTO, "Devuelto: <returnReason>".
- `canEdit` = plan en `BORRADOR` o `DEVUELTO` (controla todas las acciones de edicion).
- Guia "Resuelve el siguiente paso" (`aria-live`): badge "Listo para enviar" (success) o "N pendiente(s)"; pendientes agrupados por categoria (mensaje + destino: nombre de fase para `datesPhases`, titulo de tarea para otras); sin pendientes -> texto; `futureCategories` -> "Se evaluaran en una fase posterior: ...". Si canEdit: boton "Enviar a autorizacion" (deshabilitado si `!canSubmit`, con title y texto "Resuelve los pendientes para habilitar el envio."). En 409 muestra toast y refresca guia.
- Seccion "Fases": boton "Nueva fase" (canEdit). Lista de fases con nombre, badge "Fase inicial" (menor `order`), rango de fechas. Acciones por fase (canEdit): "↑" (`aria-label="Subir fase"`) / "↓" (`aria-label="Bajar fase"`) reordenan (deshabilitados en extremos o si fase inicial con tareas); "Editar"; "+ Tarea" (deshabilitado si la fase ya tiene tareas); "Eliminar" (deshabilitado si tiene tareas) o, para fase inicial con tareas, aviso con candado "Fase inicial con tareas: no se mueve ni se borra.". Vacio: "Aun no hay fases...".
- Seccion "Tareas": filtros cliente: Buscar (`task-q`, icono, por titulo), Estado (`task-status`: Todos/Por hacer/En curso/Bloqueada/En revision/Terminada), Fase (`task-phase`: Todas + fases), Switch "Solo mis tareas" (responsable = actorId). Tabla: Tarea (+ badge Hito) | Fase | Inicio | Vence | Esfuerzo ("-" en hito, "N h") | Predecesoras (conteo) | Estado (badge estado + progreso %) | Acciones: "Abrir" (link `/seguimiento/tareas?taskId=`), y si canEdit "Editar" y "Eliminar". Vacios: "Aun no hay tareas..." / "Ninguna tarea coincide con los filtros.".
- Dialogo PhaseDialog (crear/editar): Nombre * (`phase-name`), Inicio (`phase-start`), Fin (`phase-end`), Entregable (`phase-deliverable`). Validacion nombre. Error en linea, conserva valores. Cancelar / Guardar.
- Dialogo TaskDialog (crear en fase / editar; scroll `max-h-[90vh]`): Titulo * (`task-title`), Responsable (`task-responsible`, personas de `/coordination/people`, placeholder "Sin asignar"), Switch "Es un hito (una sola fecha, sin esfuerzo)" (fuerza 0 h), Inicio / "Fecha del hito" (`task-start`), Vencimiento (`task-end`, oculto en hito), Esfuerzo (horas) (`task-hours`, oculto en hito), Descripcion (`task-desc`), Criterios de aceptacion (`task-criteria`). Solo edicion: "Predecesoras" (checkboxes de otras tareas del plan; sincroniza delta add/remove de dependencias). Crear: nota "Las predecesoras se gestionan tras crear la tarea.". Validaciones: titulo obligatorio; horas numero >= 0; falta fase. Cancelar / Guardar.

---

## /seguimiento/tareas (detalle de tarea) — perm:task

Fuentes: `app/seguimiento/tareas/page.tsx` (Suspense), `tareas-view.tsx`.

- Entrada por query `?taskId=<id>` (desde Mi trabajo y Plan). Sin param: "Abre una tarea desde la lista del plan para ver su detalle.". Error: "No fue posible cargar la tarea." + Reintentar.
- Ficha: titulo, badge estado (progreso %), badge "Hito", descripcion, "Criterios de aceptacion" (pre-wrap), "Evidencia: <url/texto>", "Aceptada" (badge success) o "Sin aceptar".
- Seccion "Predecesoras" (si hay): lista con badge estado (+ " · aceptada"; success si terminada y aceptada) y titulo; aviso "No puede pasar a En curso hasta que estas predecesoras esten terminadas y aceptadas." si alguna bloquea.
- Seccion "Actualizar estado" (form): "Nuevo estado" (`task-next-status`) solo con transiciones permitidas: POR_HACER->EN_CURSO,BLOQUEADA; EN_CURSO->POR_HACER,BLOQUEADA,EN_REVISION; BLOQUEADA->POR_HACER,EN_CURSO; EN_REVISION->EN_CURSO,BLOQUEADA,TERMINADA; TERMINADA->EN_CURSO (si no hay: opcion deshabilitada "Sin transiciones disponibles"); "Progreso (0-100)" (`task-progress`); "Evidencia (URL o texto)" (`task-evidence`). Validaciones: elegir estado; progreso 0-100. Error backend (p.ej. 409 por predecesora) en linea + toast, conserva valores. Boton "Guardar cambios" (deshabilitado si busy o sin transiciones).
- Seccion "Aceptacion" — condicionada a perm:plan (`canManage`): texto explicativo; "Aceptar tarea" o "Retirar aceptacion" segun `accepted`.

---

## /seguimiento/portafolio — perm:portfolio

Fuente: `app/seguimiento/portafolio/portafolio-view.tsx`.

- Filtros (auto-aplican al cambiar, `aria-label="Filtros del portafolio"`): Proceso (`portafolio-proceso`: Todos + procesos de `listProcesses`), Estado operativo (`portafolio-estado`: Todos + todos los `REQUEST_STATE_LABELS`), Banda de prioridad (`portafolio-banda`: Todas, P1..P4, Sin priorizar).
- Tabla (scroll horizontal, caption sr-only): Titulo | Proceso | Estado | Banda (badge: P1 destructive, P2 default, P3 secondary, P4 outline, null "Sin priorizar") | Ruta | Responsable | Registro | Objetivo | Compromiso | Bloqueo (badge "Bloqueada" destructive con aria-label que incluye `blockedReason`, o "—"). Valores nulos como "—". Solo lectura.
- Estados: skeleton; error con mensaje + Reintentar; vacio "No hay iniciativas en tu alcance con estos filtros." + guia.

---

## /seguimiento/bitacora — perm:log

Fuentes: `app/seguimiento/bitacora/bitacora-view.tsx`, `diario-form-dialog.tsx`, `actividad-form-dialog.tsx`.

- Datos: `listDailyLogs()`, `listProcesses()`, `listRequests()`, `listMyWork()` (los tres ultimos degradan a vacio). Detalle: `getDailyLog(id)` + `listIssues()` filtradas por proceso del diario.
- Accion principal: "Nuevo diario" (header, deshabilitado mientras carga; tambien en vacio de lista).
- Layout maestro-detalle (lg: 320px + resto):
  - "Mis diarios": lista de botones (fecha, badge Borrador outline / Enviado secondary, nombre de proceso), seleccion con `aria-current`; auto-selecciona el primero o mantiene la seleccion. Vacio "Aun no hay diarios." + boton.
  - "Detalle del diario": sin seleccion -> guia; cargando; error + Reintentar. Card con fecha + badge, proceso; acciones solo en BORRADOR: "Enviar a revision" (icono Send), "Editar notas", "Borrar". Notas del dia. Bloque "Dedicacion del dia: N h" (`aria-live`) + nota BR-013.
  - "Actividades": "Agregar actividad" (solo borrador; tambien en vacio). Si enviado: "El diario fue enviado a revision; las actividades ya no se editan.". Tabla: Clasificacion (badge) | Descripcion (truncada) | Horas | Acciones (solo borrador): "Editar", "Borrar" ("Borrando...").
- Dialogo DiarioFormDialog: crear: Proceso * (`diario-process` Select), Fecha * (`diario-date`, default hoy), Notas del dia (`diario-notes`). Editar: proceso y fecha deshabilitados, solo notas. Validaciones: proceso y fecha (crear). Botones Cancelar / "Crear diario" | "Guardar cambios". Error en linea + toast, conserva valores.
- Dialogo ActividadFormDialog (scroll, `sm:max-w-xl`): Clasificacion * (`act-class`: Planificada/Soporte/Interna/Extraordinaria, con texto de ayuda por opcion). Campos condicionales: PLANIFICADA -> Proyecto (solicitud) (`act-project`, "Sin proyecto" + solicitudes) y Tarea (`act-task`, "Sin tarea" + mis tareas) con ayuda "al menos uno"; SOPORTE -> Activo * (`act-asset`); EXTRAORDINARIA -> Solicitante * (`act-requester`) y Justificacion * (`act-justification`). Comunes: Horas (dedicacion) (`act-hours`, entero >= 0, ayuda), Descripcion (`act-description`), Resultado (`act-result`), Novedad relacionada (`act-issue`, "Sin novedad" + novedades del proceso), Siguiente paso (`act-next`), Fecha del siguiente paso (`act-next-date`), Evidencia (`act-evidence`). Validaciones cliente: horas entero >= 0; planificada requiere proyecto o tarea; soporte requiere activo; extraordinaria requiere solicitante y justificacion. Botones Cancelar / "Agregar" | "Guardar cambios".

---

## /seguimiento/semanal — perm:log

Fuentes: `app/seguimiento/semanal/semanal-view.tsx`, `semanal-form-dialog.tsx`.

- Datos: `listWeeklyReports()`, `listProcesses()`; detalle `getWeeklyReport(id)`.
- Accion principal: "Nuevo semanal" (header, deshabilitado mientras carga; tambien en vacio).
- Maestro-detalle: "Mis semanales" (botones "Semana <weekStart>", badge Borrador/Enviado, proceso; `aria-current`; auto-seleccion del primero). Vacio "Aun no hay semanales.".
- Detalle (Card): "Semana X" + badge, proceso; boton "Enviar" (icono Send, solo borrador). Bloque "Consolidado (bitacoras de respaldo)" (`aria-live`): Diarios, Actividades, Dedicacion (h), Extraordinarias; o "Sin bitacoras de respaldo para esta semana...".
- Secciones (textarea, deshabilitadas si no borrador): Resultados (`sem-results`), Propuestas (`sem-proposals`, ayuda "no cambian prioridades ni crean compromisos"), Bloqueos (`sem-blockers`), Compromisos proxima semana (`sem-commitments`), Decisiones (`sem-decisions`). Boton "Guardar secciones" (solo borrador; conserva lo tecleado ante error) o texto "El semanal fue enviado; las secciones ya no se editan.".
- Dialogo SemanalFormDialog "Nuevo registro semanal": Proceso * (`sem-process`), Semana (dia cualquiera) * (`sem-week`, default lunes actual; ayuda "Se usara el lunes..."). Validaciones proceso y fecha. Botones Cancelar / "Crear semanal" ("Creando...").
- Estados: lista skeleton; error global "No fue posible cargar los registros semanales." + Reintentar; detalle cargando / error + Reintentar; sin seleccion -> guia.

---

## /seguimiento/novedades — perm:log

Fuentes: `app/seguimiento/novedades/novedades-view.tsx`, `novedad-form-dialog.tsx`, `lib/record-state.ts`.

- Datos: `listIssues()`, `listProcesses()`, `listCoordinationPeople()`.
- Accion principal: "Nueva novedad" (header, deshabilitado mientras carga; tambien en vacio).
- Maestro-detalle: "Lista" (botones: titulo, badge estado `stateLabel`, "tipo · proceso"; `aria-current`; auto-seleccion). Vacio "Aun no hay novedades.".
- Ficha (Card): titulo + badge estado, "tipo · proceso · fecha", boton "Editar". Datos: Responsable, Fecha objetivo, Detalle, Impacto, Resolucion ("—" si vacio).
- "Cambiar estado": un boton por cada estado destino de `nextStates(state)` (toast "Novedad movida a X."); si no hay: "No hay transiciones disponibles desde este estado.".
- Tipos: Bloqueo, Incidente, Calidad de datos, Solicitud de apoyo.
- Dialogo NovedadFormDialog (scroll): Proceso * (`nov-process`; deshabilitado en edicion), Fecha * (`nov-date`, default hoy; deshabilitada en edicion), Tipo (`nov-type`, default Bloqueo), Titulo * (`nov-title`), Detalle (`nov-detail`), Impacto (`nov-impact`), Responsable (`nov-resolver`, "Sin asignar" + personas), Fecha objetivo (`nov-target`), Resolucion (`nov-resolution`). Validaciones: proceso, fecha (crear), titulo. Botones Cancelar / "Crear novedad" | "Guardar cambios". Edicion no envia proceso/fecha.
- Estados: skeleton; error "No fue posible cargar las novedades." + Reintentar; sin seleccion -> guia.

---

## /seguimiento/reuniones — perm:meeting

Fuentes: `app/seguimiento/reuniones/reuniones-view.tsx`, `reunion-form-dialog.tsx`.

- Datos: `listMeetings()`, `listProcesses()`, `listCoordinationPeople()`.
- Accion principal: "Nueva reunion" (header, deshabilitado mientras carga; tambien en vacio).
- Maestro-detalle: "Lista" (titulo, badge estado, "fecha · hora · proceso"; `aria-current`; auto-seleccion). Vacio "Aun no hay reuniones.".
- Detalle (Card): titulo + badge estado, "fecha · hora · proceso"; acciones "Editar" y "Borrar" ("Borrando..."). "Participantes" (badges con nombre o "Sin participantes registrados."). Agenda, Decisiones, Observaciones ("—" si vacio).
- Dialogo ReunionFormDialog (scroll): Proceso * (`reu-process`; deshabilitado en edicion), Titulo * (`reu-title`), Fecha * (`reu-date`, default hoy), Hora (HH:mm) (`reu-time`, type time), Responsable (`reu-responsible`, "Sin responsable" + personas), Participantes (checkboxes de personas en alcance, lista con scroll; vacio "No hay personas en tu alcance para agregar."), Agenda (`reu-agenda`), Decisiones (`reu-decisions`), Observaciones (`reu-notes`). Validaciones: proceso (crear), titulo, fecha, hora HH:mm. Descripcion: "La reunion inicia en estado Borrador.". Botones Cancelar / "Crear reunion" | "Guardar cambios".
- Estados: skeleton; error "No fue posible cargar las reuniones." + Reintentar; sin seleccion -> guia.

---

## /seguimiento/compromisos — perm:meeting

Fuentes: `app/seguimiento/compromisos/compromisos-view.tsx`, `compromiso-form-dialog.tsx`.

- Datos: `listCommitments()`, `listProcesses()`, `listCoordinationPeople()`, `listMeetings()`.
- Accion principal: "Nuevo compromiso" (header, deshabilitado mientras carga; tambien en vacio).
- Maestro-detalle: "Lista" (titulo, badge estado, "Vence <fecha> · proceso"; `aria-current`; auto-seleccion). Vacio "Aun no hay compromisos.".
- Detalle (Card): titulo + badge estado, "Vence X · proceso", boton "Editar". Datos: Asignado, Responsable, Reunion fuente, Resultado esperado, Bloqueos.
- "Cambiar estado": botones por `nextStates(state)` (EN_CURSO->BLOQUEADO/COMPLETADO; BLOQUEADO->EN_CURSO/COMPLETADO; COMPLETADO->ARCHIVADO/EN_CURSO; ARCHIVADO->EN_CURSO); toast "Compromiso movido a X."; sin transiciones -> texto.
- Dialogo CompromisoFormDialog (scroll): Proceso * (`com-process`; deshabilitado en edicion), Titulo * (`com-title`), Vencimiento * (`com-due`, default hoy), Asignado (`com-assigned`, "Sin asignar" + personas), Responsable (`com-responsible`, "Sin responsable" + personas), Reunion fuente (`com-meeting`, "Sin reunion" + "titulo (fecha)"), Resultado esperado (`com-result`), Bloqueos (`com-blockers`). Validaciones: proceso (crear), titulo, vencimiento. Botones Cancelar / "Crear compromiso" | "Guardar cambios".
- Estados: skeleton; error "No fue posible cargar los compromisos." + Reintentar; sin seleccion -> guia.

---

## /activos/catalogo (Activos) — perm:asset

Fuentes: `app/activos/catalogo/activos-view.tsx`, `activo-form-dialog.tsx`.

- Datos: `listAssets()`, `listProcesses()`, `listRequests()`, `listCoordinationPeople()`, catalogos activos `ASSET_TYPE`, `TECHNOLOGY`, `SOURCE`, `FREQUENCY` (todos salvo assets degradan a vacio).
- Accion principal: "Nuevo activo" (header, deshabilitado mientras carga; tambien en vacio).
- Filtros cliente (auto, `aria-label="Filtros de activos"`): Proceso (`filtro-proceso`), Solicitud (`filtro-solicitud`), Estado (`filtro-estado`: Todos/Borrador/Activo/Retirado).
- Tabla (caption sr-only): Nombre | Proceso | Solicitud | Responsable | Tipo (label de catalogo) | Estado (badge: ACTIVO default, RETIRADO destructive, otro secondary; muestra el codigo crudo) | Acciones.
- Acciones por fila: "Editar"; transicion de estado condicionada por grants (`permissions.grants`): visible si rol `JEFE_AREA` o `LIDER_PROCESO` del proceso del activo. BORRADOR -> "Activar"; ACTIVO -> "Retirar"; RETIRADO -> "Recuperar" (texto "..." mientras procesa; toast "Activo movido a X.").
- Dialogo ActivoFormDialog (scroll, `sm:max-w-xl`): Proceso * (`activo-process`, procesos activos; deshabilitado en edicion con nota "El proceso de un activo no se puede cambiar."), Nombre * (`activo-name`), Tipo (`activo-type`), Tecnologia (`activo-technology`), Fuente (`activo-source`), Frecuencia (`activo-frequency`) — Selects de catalogo con opcion "Sin X"; Solicitud de origen (`activo-request`, "Sin solicitud"), Responsable (`activo-owner`, "Sin responsable"); Referencia documental (`activo-doc-ref`); Descripcion funcional (`activo-functional`); Dependencias (`activo-dependencies`). Descripcion: nace en BORRADOR, estado se cambia desde la tabla. Validaciones: proceso (crear), nombre. En edicion vaciar solicitud/responsable envia `null` (desligar). Botones Cancelar / "Crear activo" | "Guardar cambios".
- Estados: skeleton; error "No fue posible cargar los activos." + Reintentar; vacio "Aun no hay activos registrados." + CTA; sin coincidencias "Ningun activo coincide con los filtros.".

---

## /activos/documentos — perm:docs

Fuentes: `app/activos/documentos/documentos-view.tsx`, `documento-editor-dialog.tsx`, `historial-dialog.tsx`.

- Datos: `listDocuments()`, `listAssets()`, `listProcesses()`, `listRequests()`, `listCoordinationPeople()`, catalogo activo `DOC_CATEGORY`.
- Accion principal: "Nuevo documento" (deshabilitado mientras carga o si no hay activos no retirados; tambien en vacio). Vacio sin activos: "Primero crea un activo (no retirado) para asociarle documentos.".
- Filtros cliente (`aria-label="Filtros de documentos"`): Proceso (`doc-filtro-proceso`, via activo), Solicitud (`doc-filtro-solicitud`, via activo), Activo (`doc-filtro-activo`), Estado (`doc-filtro-estado`: Todos/Borrador/Vigente/Archivada), Buscar (`doc-filtro-busqueda`, por titulo).
- Tabla (caption sr-only): Titulo | Activo | Proceso | Version ("vN" o "—") | Estado (badge: VIGENTE default, ARCHIVADA destructive, otro secondary; codigo crudo) | Acciones.
- Acciones por fila: "Editar" (abre editor y carga contenido vigente); "Historial" (icono); ".md" descargar version vigente (icono; deshabilitado sin version; "..." mientras descarga); transiciones condicionadas por grants (JEFE_AREA o LIDER_PROCESO del proceso del activo; si el activo no se conoce, solo jefe): BORRADOR -> "Publicar"; VIGENTE -> "Archivar" y "Pasar a borrador"; ARCHIVADA -> "Reactivar". Toast "Documento movido a X.".
- Dialogo DocumentoEditorDialog (`sm:max-w-3xl`, scroll): Activo * (`doc-asset`, solo activos no retirados; deshabilitado en edicion con nota), Titulo * (`doc-title`), Categoria (`doc-category`, "Sin categoria"), Contenido (Markdown) * (`doc-content`, textarea monoespaciada, deshabilitada mientras carga contenido). Tabs `role=tablist` "Modo de edicion": Editor / Vista previa (pre con texto plano). Contador `N/200.000` (`aria-live`, rojo + " — supera el limite" si excede). Atajo Ctrl/Cmd+S para guardar. Validaciones: activo (crear), titulo, contenido no vacio, limite 200.000. Editar: PATCH metadatos si cambian + nueva version (toast "Nueva version guardada."). Botones Cancelar / Guardar (deshabilitado si excede limite o cargando).
- Dialogo HistorialDialog "Historial de versiones — <titulo>": tabla Version ("vN (vigente)") | Autor | Fecha | "Ver contenido"; panel "Contenido vN" en `pre` + "Descargar .md". Estados: skeleton, error "No fue posible cargar el historial.", vacio "Este documento no tiene versiones.". Boton Cerrar.
- Estados: skeleton; error "No fue posible cargar los documentos." + Reintentar; sin coincidencias "Ningun documento coincide con los filtros.".

---

## /activos/capacidad — perm:capacity

Fuentes: `app/activos/capacidad/capacidad-view.tsx`, `disponibilidad-form-dialog.tsx`, `asignacion-form-dialog.tsx`.

- Filtro: "Mes" (`capacidad-month`, type month, default mes actual UTC; recarga al cambiar).
- Datos por mes: `listCapacitySummary(month)`, `listAvailability(month)`, `listAssignments(month)`; ademas `listCapacityPeople()`, `listProcesses()`, `listRequests()`.
- Condicion por grants: `lockPerson` = todos los grants son `INTEGRANTE` -> la persona queda fija en el propio `permissions.userId` en ambos dialogos (nota "Solo puedes registrar tu propia disponibilidad.").
- Bloque explicativo "Como leer el resumen" (disponibilidad, asignaciones, comprometido, utilizacion, libre, planificado vs comprometido).
- "Resumen de carga": tabla Persona | Disponible | Comprometido | Utilizacion % | Libre | Planificado (+ badge "Plan > disponible" con aria-label explicativo si `planSobreDisponible`) | Utilizacion plan % | Senal (badges: "Sobrecarga" destructive, "Sin disponibilidad" secondary, "Carga parcial" outline + texto "asignaciones en procesos fuera de tu alcance...", "OK"). Nulos como "—". Estados: skeleton; error "No fue posible cargar el resumen de capacidad." + Reintentar; vacio "Aun no hay disponibilidad ni asignaciones este mes." + guia.
- "Disponibilidad": boton "Registrar disponibilidad" (deshabilitado cargando; tambien en vacio). Tabla Persona | Horas disponibles | "Editar". Vacio "Aun no hay disponibilidad este mes.".
- "Asignaciones": boton "Nueva asignacion" (deshabilitado cargando; tambien en vacio). Tabla Persona | Proceso | Solicitud | Horas | Descripcion (truncada) | "Editar" / "Borrar" ("Borrando..."). Vacio "Aun no hay asignaciones este mes.".
- Dialogo DisponibilidadFormDialog: Mes (`disp-month`, solo lectura, "Fijado por el selector de mes"), Persona * (`disp-person`, Select "nombre (identifier)"; solo lectura en edicion o lockPerson), Horas disponibles * (`disp-hours`, entero >= 0, autofocus, ayuda "0 significa sin disponibilidad"). Validaciones persona/horas. Botones Cancelar / "Registrar" | "Guardar cambios". Ante 409 al crear: toast "Ya hay disponibilidad para esa persona y mes." con accion "Editar la existente".
- Dialogo AsignacionFormDialog (scroll): Mes (`asig-month`, solo lectura), Persona * (`asig-person`; solo lectura en edicion o lockPerson), Proceso * (`asig-process`, procesos activos), Solicitud (`asig-request`, "Sin solicitud"; ayuda alcance; en edicion vaciar envia null), Horas comprometidas * (`asig-hours`, entero >= 0), Descripcion (`asig-description`). Validaciones persona, proceso, horas. Botones Cancelar / "Crear asignacion" | "Guardar cambios".

---

## /administracion/revision — perm:review

Fuentes: `app/administracion/revision/revision-view.tsx`, `plan-authorization-section.tsx`, `devolver-dialog.tsx`.

- Accion global: "Actualizar" (recarga cola de aprobacion).
- Aviso BR-006: aprobar -> Comprometida; devolver -> triage con motivo.
- Cola de aprobacion de compromiso (`listPendingApproval()`): tabla Titulo | Score | Prioridad (badge priorityLabel) | Registro | Acciones: "Aprobar" (toast "Solicitud aprobada. Pasa a Comprometida.") y "Devolver" (abre dialogo). Botones deshabilitados mientras actua sobre la fila. Estados: skeleton; error + Reintentar; vacio "No hay solicitudes pendientes de aprobacion." + guia.
- Seccion "Autorizacion de planes" (PlanAuthorizationSection) — condicionada a perm:review (si no, no se renderiza): boton "Actualizar"; aviso; deriva planes de solicitudes `EN_PLANIFICACION` cuyo plan esta `EN_AUTORIZACION`. Tabla Solicitud | Estado del plan (badge "En autorizacion") | "Autorizar" (toast "Plan autorizado. La solicitud pasa a En ejecucion.") / "Devolver" (dialogo; toast "Plan devuelto para correccion."). Estados: skeleton; error "No fue posible cargar los planes." + Reintentar; vacio "No hay planes pendientes de autorizacion.". Recarga al cambiar actor.
- Dialogo DevolverDialog (compartido por ambas colas): titulo "Devolver solicitud", descripcion "Devolver «titulo» a triage..." (mismo texto tambien para planes), Motivo * (`devolver-reason`, textarea, autofocus). Validacion motivo obligatorio. Error backend en linea (conserva). Botones Cancelar / "Devolver" (destructive, "Devolviendo...").

---

## /administracion/frameworks (Gobierno y cumplimiento) — perm:frameworks

Fuente: `app/administracion/frameworks/frameworks-view.tsx`. H1 "Gobierno y cumplimiento".

- Condicion por grants: `canReview` = algun grant `JEFE_AREA` o `LIDER_PROCESO` (acciones de autoridad). Sin canReview: nota al pie con candado "Tu rol permite consultar y registrar validaciones. Las acciones de autoridad (aprobar, ruta, waive) requieren rol de revision.".
- Datos: `listRequests()` + catalogos activos `GOVERNANCE_ROUTE`, `VALIDATION_TYPE`, `VALIDATION_RESULT`. Detalle: `getGovernanceBoard(id)` + `listValidations(id)`.
- Selector "Solicitud" (`governance-request`, "titulo - estado"); muestra "Estado: X" + badge de banda derivada del score (P1>=80, P2>=65, P3>=45, P4; + label). Sin seleccion: "Selecciona una solicitud para ver su tablero de gobierno.".
- Alerta `role=alert` "Solicitud bloqueada" + motivo si `board.blocked`.
- Card "Ruta proporcional": Select "Ruta" (`governance-route`, catalogo; deshabilitado sin canReview), boton "Guardar ruta" (solo canReview; deshabilitado si sin cambio), badge "Actual: X" o "Sin ruta asignada.".
- Card "Avance de etapas" (solo canReview): "Enviar a validacion", "Marcar lista para liberar", "Confirmar estabilizacion" (cada uno con su toast).
- Tablero de gates (`role=list`, "Controles de gobierno GC1 a GC5"): GateCard por gate con titulo "GCn · titulo", badge estado con icono (Pendiente / Cumplido / No aplica), Condicion, Autoridad, "No aplica: motivo", "Faltantes" (lista con "(resuelto)"), para GC4 resumen de validaciones (total, bloqueantes sin resolver, validacion obligatoria presente/falta), alerta "Aprobar deshabilitado: <motivos>" (enlazada por `aria-describedby`). Acciones solo GC4/GC5 y canReview: "Aprobar GCn" (deshabilitado si busy, NO_APLICA o GC4 no aprobable) y "Marcar no aplica" (pide motivo via `window.prompt`; oculto si ya NO_APLICA). GC1-GC3: "Este control se deriva de fases previas y no se aprueba desde gobierno.".
- Card "Registro de validaciones": tabla Tipo | Caso | Version | Ambiente | Fecha | Resultado | Bloqueante (No / "Resuelto" / "Sin resolver" destructive) | Evidencia (link "Enlace" si http(s), texto, "Documento del expediente" o "-") | Acciones (solo canReview: "Resolver bloqueo" si bloqueante sin resolver). Vacio "Aun no hay validaciones registradas.".
- Formulario "Registrar validacion" (todos los roles con acceso): Tipo (`val-type`), Resultado (`val-result`), Caso de prueba (`val-case`), Version de la solucion (`val-version`), Ambiente (`val-env`), Ejecutor (id de usuario) (`val-executor`, texto libre), Fecha de ejecucion (`val-executed-at`, datetime-local), Evidencia (URL o nota) (`val-evidence`), Notas (`val-notes`), checkbox "Defecto bloqueante". Validacion: tipo, caso, resultado, ejecutor y fecha obligatorios. Boton "Registrar validacion" (toast "...no aprueba el control, BR-008"). Debajo "Resumen GC4" (total, bloqueantes, aprobable o no).
- Estados: lista skeleton; error + Reintentar; vacio "No hay solicitudes en tu alcance."; detalle skeleton; error "No fue posible cargar el tablero de gobierno." + Reintentar.

---

## /gobierno/equipo (Equipo y permisos) — perm:team

Fuentes: `app/gobierno/equipo/equipo-view.tsx`, `create-user-dialog.tsx`, `create-grant-dialog.tsx`.

- Datos: `listUsers()`, `listGrants()`, `listProcesses()` (si falla cualquiera: error global).
- Acciones header: "Nuevo usuario" (outline) y "Asignar grant" (primaria; deshabilitada si no hay usuarios o procesos).
- Seccion "Usuarios": tabla Nombre | Identificador | Estado (Activo success / Inactivo secondary). Vacio "No hay usuarios todavia." + "Nuevo usuario".
- Seccion "Grants": tabla Usuario | Proceso ("nombre (codigo)") | Estado (Activo / Revocado) | Acciones "Revocar" (deshabilitado si inactivo o procesando; toast "Grant revocado."). Nota: la tabla actual NO muestra la columna Rol. Vacio "No hay grants todavia." + guia.
- Dialogo CreateUserDialog "Nuevo usuario": Identificador (`user-identifier`, placeholder persona@demo.local), Nombre (`user-name`). Validacion ambos obligatorios (foco vuelve al identificador). Reset solo en exito; al cerrar limpia. Botones Cancelar / "Crear" ("Creando...").
- Dialogo CreateGrantDialog "Asignar grant": Usuario (`grant-user`, "nombre (identifier)"), Rol (`grant-role`: Jefe de area / Lider de proceso / Integrante), Proceso (`grant-process`, "nombre (codigo)"). Validacion los tres obligatorios. Botones Cancelar / "Asignar" ("Asignando...").
- Estados: skeleton; error "No fue posible cargar el equipo." + Reintentar.

---

## /gobierno/auditoria — perm:audit

Fuentes: `app/gobierno/auditoria/auditoria-view.tsx`, `ver-cambio-dialog.tsx`.

- Datos: `listAuditEvents()` + `listProcesses()` (degrada).
- Tabla: Fecha (fecha+hora) | Actor (`actorUserId` o "Sistema") | Proceso ("nombre (codigo)" o "—") | Accion | Objeto | Cambio: boton "Ver cambio". Sin filtros ni paginacion.
- Dialogo VerCambioDialog: "Antes" y "Despues" como JSON formateado en `pre` con scroll ("Sin datos" si null).
- Estados: skeleton; error "No fue posible cargar la auditoria." + Reintentar; vacio "No hay eventos visibles." + guia.

---

## /gobierno/mis-permisos — perm:permissions

Fuente: `app/gobierno/mis-permisos/mis-permisos-view.tsx`.

- Usa el contexto (`permissions`, `state`, `reload`), sin llamada propia.
- Sin actor: "Selecciona un usuario en la barra lateral para ver sus permisos.". Cargando: skeleton. Error: "No fue posible cargar tus permisos." + Reintentar (reload).
- Ficha: nombre e identifier del actor.
- "Roles y alcance": tabla Rol (roleName) | Proceso | Codigo; vacio "No tienes grants activos.".
- "Modulos": lista de todas las moduleKeys del menu (en orden del menu) con etiqueta "Grupo · Item" y badge "Permitido" (success) / "No permitido" (secondary); nota de control server-side. Observacion: `log` y `meeting` aparecen repetidos (3 y 2 veces) con la etiqueta del ultimo item del grupo (claves React duplicadas).

---

## Observaciones transversales para el rediseño (no son capacidades, son hechos del baseline)

- Patron repetido en todas las vistas: header (H1 + descripcion + accion principal), skeleton, error con Reintentar, vacio con guia, toasts. Candidatos a componentes compartidos (PageHeader, EmptyState, ErrorState, LoadingState, FilterBar, StatusBadge).
- Paneles de bloqueo/precondicion con candado: Triage, Priorizacion, Plan (fase inicial, guia de pendientes), Tareas (predecesoras), Frameworks (GC4 aprobar deshabilitado, GC1-3 no aprobables, nota de rol), Documentos (sin activos), Capacidad (lockPerson, carga parcial).
- Gating por permiso dentro de vistas: Tareas (seccion Aceptacion = perm:plan), Revision (autorizacion de planes = perm:review), Resumen de demanda (forbidden sin demandOverview). Gating por grants: Activos y Documentos (transiciones = JEFE_AREA o LIDER_PROCESO del proceso), Frameworks (canReview = JEFE_AREA o LIDER_PROCESO), Capacidad (lockPerson = solo INTEGRANTE).
- Dependiente de modo de auth: solo Shell (selector dev vs sesion/logout), RouteGuard y /login. Ninguna vista de modulo cambia por modo de auth.
- Badges de estado en Activos y Documentos muestran el codigo crudo (BORRADOR, ACTIVO, VIGENTE...).
- "Marcar no aplica" en Frameworks usa `window.prompt` para el motivo.
- Placeholder: `/seguimiento/proyectos` (En construccion).
- Visto en capturas baseline: en movil (390px) el sidebar completo se apila encima del contenido (sin menu colapsable) y la tabla de Solicitudes se corta por la derecha (columna Score truncada, sin scroll visible). El indicador de Next dev ("N") se superpone al sidebar (solo en dev).
- `/gobierno/mis-permisos` emite 3 errores de consola (claves React duplicadas por `log`/`meeting`).

## Baseline visual

Capturas en `.agents/tasks/ui-redesign/screenshots/baseline/` (`<ruta>--desktop.png` 1440x900, `<ruta>--mobile.png` 390x844, full page, actor jefe@demo.local "Ana Jefa", dev-header) + `manifest.json`. Script: `.agents/tasks/ui-redesign/scripts/capture-baseline.cjs [outDir]` (reutilizable para capturas post-rediseño).
