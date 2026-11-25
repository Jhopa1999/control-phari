# Plan de mejora módulo a módulo

Resultado de la auditoría de módulos del 2026-11-15 (base `1970740`, rama `docs/auditoria-modulos`). Se recorrieron 32 módulos con capturas, pruebas contra la API y axe, y se evaluó cada uno en funcionalidad, UX, UI y marca, y técnica. El informe completo con las 471 capturas está en el equipo de quien auditó (`.agents/tasks/auditoria-modulos/informe.md`, no versionado); este documento conserva lo accionable. Este plan **no implementa nada**: cada módulo con estatus Amarillo o Rojo tiene su fila en [`docs/BACKLOG.md`](../BACKLOG.md) (BL-055 a BL-080) para tomarla cuando se decida.

## Resumen ejecutivo

- **32 módulos**: 4 Rojo (Panel del área, Triage, Controles, Equipo y permisos), 21 Amarillo y 7 Verde. Opciones registradas: 21 P1, 86 P2 y 69 P3.
- **Cinco problemas principales.** (1) `GET /users` entrega el `passwordHash` de todas las personas, un líder puede crear y desactivar usuarios, y login y recuperación no tienen límite de intentos. (2) Reglas de integridad que solo vive la interfaz: plan editable por API tras enviarlo o autorizarlo, altas de Seguimiento en un proceso ajeno, controles y proyectos cerrados reescribibles, GC5 que cierra sin cierre formal, documentos «Vigente» sin aprobación. (3) Salidas rotas en la demanda: «Devuelta» sin regreso ni motivo, priorización guardada sin evaluar, Aprobar sin confirmación. (4) Pantallas que prometen lo que no hacen o muestran un error falso: periodo del Panel, Panel de errores 403 para el admin con «Revisa tu conexión», Maestras abierta a todos. (5) Cifras de decisión poco fiables: el plan no fija periodo ni compromiso y Capacidad cuenta borradores como horas planificadas.
- **Primera oleada recomendada** (Oleada 1, casi toda de esfuerzo S, sin decisión de producto): quitar `passwordHash` y cerrar permisos de `/users`, límite de intentos, motivo obligatorio en devolver y rechazar, priorización sin valores por defecto, confirmación en Aprobar, bloqueo de edición del plan enviado en la API, validar el proceso del actor en las altas de Seguimiento y destino post-login según el rol.
- **Lo que necesito de ti**: 24 decisiones (sección «Decisiones que necesita el usuario»), cada una con una recomendación por defecto.
- Lo que funciona y hay que proteger: accesibilidad (axe sin violaciones en casi todas las pantallas), auditoría, alcance único de solicitudes, mensajes de recuperación que no revelan cuentas, secretos SMTP cifrados.

## Tabla resumen

Estatus: Verde cumple, Amarillo funciona con huecos, Rojo tiene un fallo de proceso o de seguridad. La primera columna enlaza a la sección del módulo y «BL» a su fila del backlog (los Verde no tienen fila).

| Módulo | Estatus | P1 | P2 | P3 | Siguiente paso recomendado | Oleada | BL |
|---|---|---|---|---|---|---|---|
| [1.1 Login](#11-login) | Amarillo | 1 | 1 | 1 | Límite de intentos y auditoría de fallos (D1) | 1 | BL-055 |
| [1.2 Recuperar contraseña](#12-recuperar-y-restablecer-contraseña) | Amarillo | 1 | 2 | 1 | Mismo límite en `forgot-password`, en el mismo cambio que Login | 1 | BL-056 |
| [1.3 Selector de apps](#13-selector-de-apps) | Amarillo | 0 | 1 | 1 | Mensaje correcto para el administrador | 3 | BL-057 |
| [1.4 Service Desk (placeholder)](#14-placeholder-service-desk) | Verde | 0 | 0 | 1 | Quitar el texto duplicado «Próximamente» | 5 | n/a |
| [1.5 Panel del área](#15-panel-del-área) | **Rojo** | 2 | 4 | 2 | Quitar el selector de periodo (D2) y enrutar al admin | 1 | BL-058 |
| [1.6 Búsqueda global por ID](#16-búsqueda-global-por-id) | Verde | 0 | 1 | 1 | Búsqueda por título tras cerrar los P1 (D18) | 4 | n/a |
| [1.7 Asistente](#17-asistente) | Amarillo | 0 | 1 | 1 | Modo de simulación del modelo en ambientes no productivos (D19) | 4 | BL-059 |
| [2.1 Mi trabajo](#21-mi-trabajo) | Amarillo | 0 | 3 | 2 | Área de toque de 24 px en título e `IdChip` | 3 | BL-060 |
| [2.2 Solicitudes](#22-solicitudes) | Amarillo | 1 | 4 | 3 | Política de edición de la solicitud (D4) | 2 | BL-061 |
| [2.3 Triage](#23-triage) | **Rojo** | 2 | 3 | 3 | Motivo obligatorio y salida de «Devuelta» (D3) | 1 y 2 | BL-062 |
| [2.4 Priorización](#24-priorización) | Amarillo | 1 | 3 | 1 | Sin valores por defecto en los ocho criterios | 1 | BL-063 |
| [2.5 Aprobaciones](#25-aprobaciones) | Amarillo | 1 | 3 | 2 | Confirmación al aprobar con resumen | 1 | BL-064 |
| [3.1 Planificación](#31-planificación) | Amarillo | 2 | 5 | 4 | Bloqueo de edición del plan en la API (D5) | 1 y 2 | BL-065 |
| [3.2 Capacidad](#32-capacidad) | Amarillo | 0 | 3 | 3 | Contar solo planes autorizados (D7) | 2 | BL-066 |
| [3.3 Portafolio](#33-portafolio) | Amarillo | 0 | 3 | 3 | Franja de contadores clicables | 4 | BL-067 |
| [3.4 Indicadores](#34-indicadores) | Verde | 0 | 2 | 3 | Validar el periodo junto al campo | 3 | n/a |
| [4.1 Bitácora](#41-bitácora) | Amarillo | 1 | 2 | 3 | Validar que el autor pertenece al proceso | 1 | BL-068 |
| [4.2 Reporte semanal](#42-reporte-semanal) | Amarillo | 0 | 3 | 2 | Rechazar semana futura y reporte vacío (D16) | 2 | BL-069 |
| [4.3 Reuniones y compromisos](#43-reuniones-y-compromisos) | Amarillo | 0 | 4 | 2 | Validar asignado y responsable; contraste de «Vencido» | 3 | BL-070 |
| [4.4 Actividades recurrentes](#44-actividades-recurrentes) | Verde | 0 | 2 | 4 | Alinear el rol del administrador (D14) | 3 | n/a |
| [5.1 Activos](#51-activos) | Amarillo | 1 | 4 | 3 | El estado del activo gobierna las asociaciones (D8) | 2 | BL-071 |
| [5.2 Documentos](#52-documentos) | Amarillo | 1 | 3 | 4 | «Vigente» exige aprobación (D9) | 2 | BL-072 |
| [5.3 Controles](#53-controles) | **Rojo** | 2 | 4 | 3 | Un solo camino de cierre y congelar lo decidido (D10) | 2 | BL-073 |
| [5.4 Auditoría](#54-auditoría) | Amarillo | 1 | 3 | 3 | Etiqueta de objeto y filtro por código | 4 | BL-074 |
| [5.5 Mis permisos](#55-mis-permisos) | Verde | 0 | 1 | 2 | Explicar acciones por rol (campo `capabilities`) | 5 | n/a |
| [6.1 Equipo y permisos](#61-equipo-y-permisos) | **Rojo** | 3 | 5 | 2 | Quitar `passwordHash` y cerrar permisos de `/users` | 1 | BL-075 |
| [6.2 Maestras](#62-maestras) | Amarillo | 1 | 4 | 2 | Bloqueo por rol de la pantalla | 1 | BL-076 |
| [6.3 Áreas](#63-áreas) | Amarillo | 0 | 3 | 1 | Bloquear desactivar con procesos activos (D21) | 3 | BL-077 |
| [6.4 Procesos](#64-procesos) | Amarillo | 0 | 3 | 1 | Avisar con recuento al desactivar (D21) | 3 | BL-078 |
| [6.5 Solicitantes](#65-solicitantes) | Verde | 0 | 1 | 2 | Unicidad por nombre y área (D23) | 5 | n/a |
| [6.6 Configuración SMTP y administradores](#66-configuración-smtp-y-administradores) | Amarillo | 0 | 3 | 1 | Confirmación al dar o quitar el rol de administrador | 1 | BL-079 |
| [6.7 Agentes de IA](#67-agentes-de-ia) | Verde | 0 | 2 | 2 | Etiquetas de los campos de presupuesto | 3 | n/a |
| Hallazgos transversales | n/a | n/a | n/a | n/a | Ver «Hallazgos transversales» | 1 a 3 | BL-080 |
| **Total** | 4 Rojo, 21 Amarillo, 7 Verde | **21** | **86** | **69** | | | |

Convenciones de las secciones: **P1** integridad, seguridad o usuario sin salida; **P2** mejora clara; **P3** pulido. **Arreglo** corrige algo que hoy no hace lo que promete; **mejora** añade valor. El esfuerzo es S (horas a un día), M (varios días) o L (más de una semana). Los cambios de API llevan contrato, MCP y documentación en el mismo PR (regla 55). «D#» remite a la tabla de decisiones. «Sin decisión» significa que se puede hacer sin consultarte.

## Orden de ejecución propuesto

| Oleada | Qué contiene | Valor | Riesgo | Depende de |
|---|---|---|---|---|
| **0. Habilitadores** (opcional) | Seed de demostración ([BL-040](../BACKLOG.md)) y un e2e del flujo feliz registro → triage → priorización → aprobación. Un e2e por rol que abra las siete rutas de Administración. | Alto: red de seguridad antes de tocar el proceso; cifras creíbles en demos | Bajo | Nada |
| **1. Seguridad y correcciones pequeñas** | Equipo P1 (hashes, roles, rol en asignaciones); límite de intentos en Login y Recuperar (D1); auditoría real de `invite` y `admin-flag`; confirmación al dar rol de administrador; gating de Maestras; destino post-login por rol y estado «Sin acceso» en el Panel; Panel sin selector de periodo (D2); Triage motivo obligatorio; Priorización sin valores por defecto; Aprobar con confirmación; bloqueo de edición del plan en la API (D5, parte `EN_AUTORIZACION`); validar el proceso del actor en las altas de Seguimiento | Alto: cierra exposición de datos y las reglas que el MCP y el asistente hoy se saltan | Bajo a medio (Plan: algún flujo podría depender de editar durante la ejecución) | D1, D2, D5 |
| **2. Integridad del proceso (requieren decisión)** | «Devuelta» con salida (D3); política de edición de solicitudes (D4); datos del plan y compromiso obligatorio (D6, con BL-051 y BL-052); Capacidad solo planes autorizados (D7); estado del activo (D8); documento Vigente (D9); GC5 como reflejo del cierre formal y congelar lo decidido (D10, D11); validaciones de entrada que hoy solo vigila la web; reporte semanal y diario sin contenido (D16) | Alto: «aprobado», «vigente» y «cerrado» vuelven a significar lo que dicen | Medio: cambian estados que otras reglas dan por finales; activos en borrador bloquearían el triage si no se activan en el despliegue | Oleada 1 (e2e del flujo feliz), decisiones D3 a D11 |
| **3. Consistencia transversal** | Componente único «Sin acceso» y `DisabledReason`; `ErrorState` que distingue 403 de red; filtro global de mensajes de la API en español con tildes; patrón de listado paginado en servidor; tarjetas móviles en las tablas pendientes; contraste de la campana y de «Vencido»; `target-size` del `IdChip`; códigos visibles en Activos, Documentos y Auditoría; criterio de confirmación para acciones no reversibles; validaciones de formato de códigos | Medio a alto: elimina de una vez problemas que se repiten en 20 pantallas | Bajo (patrones sin cambio de reglas); el filtro de mensajes toca a todos los clientes | Oleada 1 para el componente de acceso |
| **4. Mejoras de valor** | Búsqueda por texto (D18); ficha del activo; Auditoría que permite investigar; resumen y ficha de ejecución del Portafolio; borrador del reporte semanal; aprobar en lote (D20); modo de simulación del Asistente (D19); «Mis tareas» primero | Alto en uso diario | Medio: más superficie de API, MCP y documentación | Oleadas 2 y 3 (listados paginados, IDs visibles); especificación visual del agente `disenador` para vistas nuevas |
| **5. Pulido y estratégico** | Los P3, cronograma de Planificación (L), SSO (L), comparativos, exportaciones, política de contraseñas | Bajo a medio | Bajo, salvo SSO (medio) | Decisión de producto (D20) |

Notas de dependencia: el e2e del flujo feliz debe existir antes de modificar Triage, Priorización y Aprobaciones; el patrón de listado paginado (oleada 3) antecede a la búsqueda por texto y a las cifras navegables; el P1 de Triage («Devuelta») debe cerrarse antes de ajustar el texto de «Devolver» en Aprobaciones; Planificación P1 (bloqueo y datos del plan) antecede al cronograma y a BL-052; si se elige quitar el periodo del Panel (D2), desaparecen su validación de rango y su comparativo.

## Decisiones que necesita el usuario

Cada fila trae la recomendación por defecto: es lo que se aplicaría si no hay otra instrucción.

| # | Decisión | Recomendación por defecto | Módulos |
|---|---|---|---|
| D1 | Umbrales del límite de intentos | 5 intentos en 15 minutos por identificador y 30 por IP en login; 3 por hora en `forgot-password`; valores gestionables desde la plataforma con un valor seguro por defecto en el código; respuesta 204 uniforme | 1.1, 1.2 |
| D2 | Periodo del Panel | Camino A: quitar el selector y los textos «en el periodo» y rotular «Estado actual, a hoy»; las series por periodo están en Indicadores | 1.5, 3.4 |
| D3 | Solicitud «Devuelta» | Sí: transición `DEVUELTA → REGISTRADA` al editar y «Reenviar a triage» para el creador, líder o jefe, con aviso al jefe, auditoría y conservación del historial de triages | 2.3, 2.2, 2.5 |
| D4 | Quién edita una solicitud y cuándo | Creador, líder o jefe en `REGISTRADA`/`DEVUELTA`; después solo líder o jefe y con justificación obligatoria desde `COMPROMETIDA`. En la ficha, mostrar al solicitante la decisión del triage y su motivo, sin notas internas | 2.2 |
| D5 | Edición del plan enviado o autorizado | Bloquear siempre con el plan `EN_AUTORIZACION`; con `AUTORIZADO` permitir solo responsable, fechas y horas, con auditoría, hasta que exista BL-052 | 3.1 |
| D6 | Compromiso del plan | Obligatorio para enviar el plan; precargar la fecha fin de la última tarea como valor editable | 3.1 |
| D7 | Horas «planificadas» y personas en Capacidad | Contar solo tareas de planes autorizados en solicitudes vivas; listar a todas las personas con asignación activa, con filtro por defecto «Solo con carga o sin disponibilidad registrada» | 3.2 |
| D8 | Estado del activo | Solo los `ACTIVO` se ofrecen y aceptan al asociar; `BORRADOR` visible solo para el jefe; activar en el despliegue los activos que ya tienen solicitudes; no tocar las asociaciones existentes | 5.1 |
| D9 | Documento «Vigente» | Regla simple: versionar un vigente lo devuelve a borrador en toda categoría; «Publicar» directo solo para el jefe; más adelante, versión publicada y borrador en paralelo | 5.2 |
| D10 | Cierre del proyecto por GC5 | GC5 pasa a reflejar el cierre formal (solicitud de cierre del líder y aprobación del jefe); la aprobación manual de GC5 se retira o exige el cierre completo | 5.3 |
| D11 | Quién registra validaciones aprobatorias de GC4 | El ejecutor, el líder o el jefe; el integrante no las registra a nombre de otra persona | 5.3 |
| D12 | Auditoría y el administrador | Bloquear la ruta al administrador; la auditoría de administración sigue visible al jefe | 5.4 |
| D13 | Alcance del administrador | Solo configuración técnica (Áreas, Procesos, Solicitantes, SMTP, IA); no gestiona personas ni maestras desde el menú, y se revisan los permisos de API que hoy sí le dejan crear usuarios | 6.1, 6.2, 6.6, 1.3 |
| D14 | Actividades recurrentes y el administrador | Dar el módulo al administrador solo para *Gestión* y *Cumplimiento* y ocultarle *Qué me toca* | 4.4 |
| D15 | Maestras de sistema | Lista cerrada en la API de las maestras que usa el código; en ellas solo se edita etiqueta, orden y activo; el alta de ítems queda para las de negocio | 6.2 |
| D16 | Diario y semanal vacíos o futuros | Exigir al menos una actividad (el día libre se registra como actividad «Interna» con nota) o una sección con texto; rechazar fechas posteriores a hoy | 4.1, 4.2 |
| D17 | Motivo al bloquear un compromiso y horas mínimas | Pedir motivo igual que en tareas (BL-036); exigir al menos 0,25 h al crear una actividad nueva | 4.3, 4.1 |
| D18 | Búsqueda por texto del título | Sí, tras cerrar los P1; sobre el alcance único y con límite de resultados; unificar después los dos buscadores y añadir `Ctrl/⌘+K` | 1.6 |
| D19 | Modo de simulación del modelo del Asistente | Sí, seleccionable solo en ambientes no productivos por variable de entorno | 1.7 |
| D20 | Mejoras de producto | «Mi trabajo» con contadores propios arriba y colas plegables: sí. Aprobar en lote: sí, tras la confirmación individual. Cronograma de Planificación: posponer. SSO: no ahora. Contraseña: mínimo 10 y bloqueo de contraseñas comunes. Separación de funciones del jefe: no cambiar y registrar «aprobada por el creador» en la auditoría | 2.1, 2.5, 3.1, 1.1, 1.2 |
| D21 | Desactivar áreas y procesos | Área: bloquear con 409 y el recuento si tiene procesos activos. Proceso: advertir con recuento de asignaciones, solicitudes y tareas abiertas y exigir confirmación | 6.3, 6.4 |
| D22 | Responsable en Portafolio | El responsable del triage como respaldo del líder del proceso principal | 3.3 |
| D23 | Unicidad de solicitantes | Por nombre y área, no por nombre global | 6.5 |
| D24 | Administradores del sistema | Pantalla propia «Administradores» en el grupo de Administración, con buscador | 6.6 |

## Plan por módulo

Cada sección lista las opciones priorizadas. El detalle de problema, impacto y riesgo está en el informe local. Los enlaces apuntan al código implicado.

### Parte 1. Acceso y shell

#### 1.1 Login
Amarillo (1/1/1). Código: [`login-form.tsx`](../../apps/web/src/app/login/login-form.tsx), [`auth-login.controller.ts`](../../apps/api/src/modules/auth/auth-login.controller.ts), [`safe-redirect.ts`](../../apps/web/src/lib/safe-redirect.ts).
- **P1 · Arreglo · M** Sin límite de intentos: 12 fallos seguidos sin 429, sin bloqueo ni auditoría. Limitar por IP e identificador, mensaje 429 en la web y evento `LOGIN_FAILED` en la auditoría. Decisión: D1.
- **P2 · Mejora · S** Botón «Mostrar» con `aria-pressed` para la contraseña. Sin decisión.
- **P3 · Mejora · L** Acceso con la identidad corporativa (OIDC). D20: no ahora.

#### 1.2 Recuperar y restablecer contraseña
Amarillo (1/2/1). Código: [`forgot-password-form.tsx`](../../apps/web/src/app/olvide-contrasena/forgot-password-form.tsx), [`set-password-form.tsx`](../../apps/web/src/components/set-password-form.tsx), [`auth-reset.controller.ts`](../../apps/api/src/modules/auth/auth-reset.controller.ts), [`reset-password.dto.ts`](../../apps/api/src/modules/auth/dto/reset-password.dto.ts).
- **P1 · Arreglo · S** `forgot-password` sin límite: permite saturar el buzón de una persona y desgasta el SMTP. Mismo mecanismo que Login, manteniendo el 204 uniforme. Decisión: D1.
- **P2 · Arreglo · S–M** Un solo error para token vencido y contraseña débil. Códigos distintos en la API y mensaje específico junto al campo. Sin decisión.
- **P2 · Mejora · S** Ver u ocultar contraseña y coincidencia en vivo. Sin decisión.
- **P3 · Mejora · M** Política y medidor de fortaleza (mínimo configurable). Decisión: D20.

#### 1.3 Selector de apps
Amarillo (0/1/1). Código: [`aplicaciones-view.tsx`](../../apps/web/src/app/aplicaciones/aplicaciones-view.tsx), [`app-switcher.tsx`](../../apps/web/src/components/app-switcher.tsx), [`navigation.ts`](../../apps/web/src/lib/navigation.ts).
- **P2 · Arreglo · S** El administrador ve «Pide acceso al jefe de área». Mostrar que su rol administra el workspace y ocultar el vacío. Sin decisión; se relaciona con D13.
- **P3 · Mejora · sin trabajo** Paso intermedio con una sola app. Recomendación: no cambiar hasta que exista la segunda app.

#### 1.4 Placeholder Service Desk
Verde (0/0/1). Código: [`navigation.ts`](../../apps/web/src/lib/navigation.ts) (`NAV_UPCOMING_APPS`).
- **P3 · Mejora · S** Quitar la frase final «Próximamente» de `description`; la insignia ya lo dice. Sin decisión. **Hecho (oleada 5, PR B).**

#### 1.5 Panel del área
**Rojo** (2/4/2). Código: [`dashboard-view.tsx`](../../apps/web/src/app/inicio/dashboard-view.tsx), [`attention-section.tsx`](../../apps/web/src/app/inicio/attention-section.tsx), [`area-control.service.ts`](../../apps/api/src/modules/portfolio/area-control.service.ts), [`error-state.tsx`](../../apps/web/src/components/error-state.tsx), [`safe-redirect.ts`](../../apps/web/src/lib/safe-redirect.ts).
- **P1 · Arreglo · S (camino A) o M (camino B)** El selector de periodo no filtra: el servidor ignora el periodo y la interfaz lo ofrece. Decisión: D2 (camino A).
- **P1 · Arreglo · S–M** El administrador aterriza en un Panel de dos errores 403. Destino post-login según `allowedModules` (reutilizando `getAppHomeHref`) y estado «Sin acceso a este panel» ante 403. Sin decisión.
- **P2 · Arreglo · S** El 403 se presenta como «Revisa tu conexión». Mostrar el mensaje de la API y distinguir 403 de red (transversal, T7).
- **P2 · Mejora · S** Validar el rango de fechas junto al campo; desaparece con el camino A.
- **P2 · Mejora · M** Tarjetas, indicadores y filas navegables hacia Solicitudes filtrada (depende de BL-039). Sin decisión.
- **P2 · Mejora · S** Aclarar «1 sin proceso (de las 40)» y «Sin priorizar» frente a «lista para priorizar». Sin decisión.
- **P3 · Mejora · S** Tarjetas de atención compactas en móvil.
- **P3 · Mejora · M** Comparativo con el periodo anterior; solo tiene sentido con el camino B. Recomendación: posponer.

#### 1.6 Búsqueda global por ID
Verde (0/1/1). Código: [`global-code-search.tsx`](../../apps/web/src/components/global-code-search.tsx), [`code-search.ts`](../../apps/web/src/lib/code-search.ts), [`code-resolution.controller.ts`](../../apps/api/src/modules/plan/code-resolution/code-resolution.controller.ts).
- **P2 · Mejora · M** Búsqueda por título y solicitante sobre `RequestScopeService`, con endpoint y tool de MCP nuevos. Decisión: D18.
- **P3 · Mejora · M** Atajo `Ctrl/⌘+K` y unificación con «Buscar pantalla…». Decisión: D18.

#### 1.7 Asistente
Amarillo (0/1/1; verificación incompleta, sin fallos detectados). Código: [`assistant-empty-state.tsx`](../../apps/web/src/components/assistant/assistant-empty-state.tsx), [`assistant.controller.ts`](../../apps/api/src/modules/assistant/assistant.controller.ts). Se relaciona con [BL-032](../BACKLOG.md) y [BL-046](../BACKLOG.md).
- **P2 · Mejora · M** Proveedor «simulado» para validar el chat sin AWS en local y CI. Decisión: D19.
- **P3 · Mejora · S–M** Preguntas sugeridas y nota de confianza gestionables desde Administración. Recomendación: cuando se cierre BL-032.

### Parte 2. Demanda y trabajo diario

#### 2.1 Mi trabajo
Amarillo (0/3/2). Código: [`mi-trabajo-parts.tsx`](../../apps/web/src/app/mi-trabajo/mi-trabajo-parts.tsx), [`mi-trabajo-view.tsx`](../../apps/web/src/app/mi-trabajo/mi-trabajo-view.tsx), [`id-chip.tsx`](../../apps/web/src/components/id-chip.tsx).
- **P2 · Arreglo · S** Objetivos táctiles de 24 px (WCAG 2.2, 2.5.8) en título e `IdChip`; se corrige una vez en `IdChip`. Sin decisión.
- **P2 · Mejora · M** «Mis tareas» primero y las colas de aprobación y recurrentes plegadas. Decisión: D20.
- **P2 · Mejora · M** Aprobar tareas en lote con confirmación que liste las tareas. Decisión: D20.
- **P3 · Mejora · S** Un solo aviso de error (no toast más tarjeta).
- **P3 · Mejora · S** Quitar el texto repetido «Esta tarea espera la aprobación…».

#### 2.2 Solicitudes
Amarillo (1/4/3). Código: [`ficha-view.tsx`](../../apps/web/src/app/demanda/solicitudes/[id]/ficha-view.tsx), [`request.service.ts`](../../apps/api/src/modules/request/request.service.ts), [`request-state.ts`](../../apps/api/src/modules/request/request-state.ts).
- **P1 · Arreglo · M** Cualquiera con alcance edita título, resultado y fecha objetivo en cualquier estado salvo `CERRADA`. Política por rol y estado, con justificación desde `COMPROMETIDA`. Decisión: D4.
- **P2 · Arreglo · S–M** La ficha afirma «no registrada» ante un 403 del triage. Mostrar decisión y motivo sin notas internas. Decisión: D4.
- **P2 · Arreglo · M** Listado completo en cada visita (263 KB, 300 filas). Paginar y filtrar en el servidor; unifica con [BL-039](../BACKLOG.md). Sin decisión de producto.
- **P2 · Mejora · S** Una sola columna de estado (hoy «Estado» y «Decisión de triage» duplican).
- **P2 · Mejora · M** Ficha con «Etapa actual y siguiente paso» y etapas cumplidas plegadas.
- **P3 · Mejora · S** Formulario más corto y decisión sobre «Compromiso inicial» ([BL-051](../BACKLOG.md)).
- **P3 · Arreglo · S** Texto del error de carga sin la frase ambigua.
- **P3 · Mejora · S–M** Búsqueda en servidor y por solicitante, junto con la paginación.

#### 2.3 Triage
**Rojo** (2/3/3). Código: [`triage-view.tsx`](../../apps/web/src/app/demanda/triage/triage-view.tsx), [`triage.service.ts`](../../apps/api/src/modules/request/triage/triage.service.ts), [`request-state.ts`](../../apps/api/src/modules/request/request-state.ts).
- **P1 · Arreglo · M** «Devuelta» es un callejón sin salida: no hay transición de regreso ni «Reenviar a triage». Decisión: D3.
- **P1 · Arreglo · S** `DEVOLVER` y `RECHAZAR` se aceptan sin motivo. Motivo obligatorio (mínimo 10 caracteres) en API y formulario, visible en la ficha y en la notificación. Sin decisión.
- **P2 · Arreglo · S** Sin bloqueo por rol: el integrante ve el formulario completo y la API responde 403 después. Componente «Sin acceso» por `allowedModules`.
- **P3 · Arreglo · S** La regla del activo vive en dos sitios (API permite «Continuar» sin activo, la web lo exige). Recomendación: exigirlo en `POST /triage`.
- **P2 · Mejora · M** Decisión primero y detalle después; clasificaciones en sección plegable. Recomendación: sí, junto con BL-014.
- **P2 · Mejora · S–M** Bandeja paginada y ordenada por antigüedad, sin el bloque «Otras solicitudes (260)».
- **P3 · Mejora · M** Dividir `triage-view.tsx` ([BL-014](../BACKLOG.md)) y añadir un e2e de la decisión.
- **P3 · Arreglo · S** Título duplicado en «Procesos que intervienen».

#### 2.4 Priorización
Amarillo (1/3/1). Código: [`priorizacion-view.tsx`](../../apps/web/src/app/demanda/priorizacion/priorizacion-view.tsx), [`priority.service.ts`](../../apps/api/src/modules/request/priority/priority.service.ts).
- **P1 · Arreglo · S** Se guarda una evaluación sin evaluar: los ocho criterios en 3 por defecto dan un score 60 (P3). Sin valor preseleccionado, o confirmación mínima. Sin decisión.
- **P2 · Arreglo · S** Dos definiciones de «lista para priorizar» (Panel y bandeja). Predicado compartido y bandeja con «Por evaluar» y «Evaluadas, esperan aprobación».
- **P2 · Arreglo · S** Sin bloqueo por rol, igual que Triage.
- **P2 · Mejora · M** Vista previa del score y descripción de la escala (`POST /requests/:id/priority/preview`, escala configurable en Maestras). Recomendación: sí.
- **P3 · Mejora · S** Justificación obligatoria cuando el score es P1 o se cambia una evaluación previa. Recomendación: sí para re-evaluaciones.

#### 2.5 Aprobaciones
Amarillo (1/3/2). Código: [`revision-view.tsx`](../../apps/web/src/app/administracion/revision/revision-view.tsx).
- **P1 · Arreglo · S** Aprobar sin confirmación y con aspecto de enlace. Botones con forma y confirmación que muestre ID, título y score, o «Deshacer». Sin decisión.
- **P2 · Arreglo · S–M** Aprobar y Devolver quedan fuera de la pantalla a 390 px. Tarjetas móviles con las dos acciones.
- **P2 · Mejora · M** Contexto para decidir (proceso, solicitante, esfuerzo, desglose del score).
- **P2 · Arreglo · S** Verificar y alinear el texto «devolver la regresa a triage» con lo que ocurre tras resolver D3.
- **P3 · Mejora · M** Aprobar en lote. Decisión: D20.
- **P3 · Mejora · sin trabajo** Separación de funciones del jefe. Decisión: D20 (no cambiar, registrar «aprobada por el creador»).

### Parte 3. Ejecución

#### 3.1 Planificación
Amarillo (2/5/4). Código: [`plan-view.tsx`](../../apps/web/src/app/seguimiento/plan/plan-view.tsx), [`plan.service.ts`](../../apps/api/src/modules/plan/plan.service.ts), [`phase.service.ts`](../../apps/api/src/modules/plan/phase/phase.service.ts), [`task.service.ts`](../../apps/api/src/modules/plan/task/task.service.ts). Relacionado: [BL-051](../BACKLOG.md), [BL-052](../BACKLOG.md), [BL-014](../BACKLOG.md).
- **P1 · Arreglo · M** La API no bloquea editar un plan enviado o autorizado (la web sí). Un `assertPlanEditable` en fase, tarea y dependencia. Decisión: D5.
- **P1 · Arreglo · M** La web no permite fijar periodo, compromiso, riesgos ni mitigaciones (`updatePlan` sin uso); la línea base queda como la última fecha de tarea. Tarjeta «Datos del plan». Decisión: D6.
- **P2 · Arreglo · S** Validaciones solo en la web: `periodEnd` anterior a `periodStart` y nombre de fase vacío se aceptan.
- **P2 · Mejora · M** Aviso no bloqueante cuando el responsable supera su disponibilidad del mes.
- **P2 · Mejora · M** La bandeja descarga listados completos; usar el patrón de listado paginado.
- **P2 · Mejora · L** Vista de cronograma por fase con la línea base. Decisión: D20 (posponer).
- **P2 · Mejora · M** Tarjetas móviles para fases y tareas (ampliación de BL-024).
- **P3 · Mejora · S** «En autorización» sin enlace a Aprobaciones.
- **P3 · Arreglo · S** El ciclo de dependencias muestra UUID en vez de `T01` y `T02`.
- **P3 · Arreglo · S** La puntuación de la bandeja carece de etiqueta.
- **P3 · Arreglo · S** Mensajes de la API sin tildes.

#### 3.2 Capacidad
Amarillo (0/3/3). Código: [`capacidad-view.tsx`](../../apps/web/src/app/activos/capacidad/capacidad-view.tsx), [`capacity.service.ts`](../../apps/api/src/modules/capacity/capacity.service.ts).
- **P2 · Arreglo · S–M** «Planificado» cuenta borradores, solicitudes eliminadas o rechazadas y planes devueltos. Decisión: D7.
- **P2 · Arreglo · S** Disponibilidad de 99999 h y asignación de 0 h aceptadas: `@Max(744)` y `@Min(1)`.
- **P2 · Mejora · M** «de N personas en tu alcance» no es el alcance: mostrar a todas las personas con asignación activa. Decisión: D7.
- **P3 · Mejora · S** Selector de mes con ← → y «mes actual».
- **P3 · Mejora · M** Cargar solicitudes y personas bajo demanda en el diálogo.
- **P3 · Mejora · M** Tarjetas móviles en las tres tablas.

#### 3.3 Portafolio
Amarillo (0/3/3). Código: [`portafolio-view.tsx`](../../apps/web/src/app/seguimiento/portafolio/portafolio-view.tsx), [`portfolio.service.ts`](../../apps/api/src/modules/portfolio/portfolio.service.ts). Relacionado: [BL-053](../BACKLOG.md), [BL-039](../BACKLOG.md).
- **P2 · Mejora · M** Franja de cuatro contadores clicables (vencidas, próximas, con desviación, bloqueadas). Sin decisión.
- **P2 · Mejora · M** La ficha no muestra la ejecución: sección «Ejecución» de solo lectura con enlace a Planificación. Recomendación: solo lectura.
- **P2 · Mejora · S–M** «Responsable» vacío en 294 de 300 iniciativas. Decisión: D22.
- **P3 · Mejora · M** Listado completo en cliente (172 a 205 KB para 25 filas); patrón de listado paginado.
- **P3 · Arreglo · S** Doble `GET /portfolio` al abrir; verificar en compilación de producción.
- **P3 · Mejora · M** Exportación a Excel del listado filtrado. Recomendación: sí.

#### 3.4 Indicadores
Verde (0/2/3). Código: [`demand-overview-view.tsx`](../../apps/web/src/app/demanda/resumen/demand-overview-view.tsx).
- **P2 · Mejora · S** Un periodo inválido borra la pantalla: validar `Desde ≤ Hasta` junto al campo y conservar el resultado anterior.
- **P2 · Mejora · M–L** Cifras con comparación y enlace «Ver solicitudes». Recomendación: empezar por los enlaces.
- **P3 · Arreglo · S** Etiqueta cruda «S» en «Por complejidad»: mostrar el nombre del catálogo.
- **P3 · Arreglo · S** `frontend-pantallas.md` describe el panorama aquí y vive en el Panel; ajustar el texto.
- **P3 · Mejora · S** «Hasta» exclusivo mostrado como inclusivo.

### Parte 4. Seguimiento

#### 4.1 Bitácora
Amarillo (1/2/3). Código: [`bitacora-view.tsx`](../../apps/web/src/app/seguimiento/bitacora/bitacora-view.tsx), [`worklog.service.ts`](../../apps/api/src/modules/coordination/worklog/worklog.service.ts).
- **P1 · Arreglo · M** Las altas de diario, semanal, reunión y compromiso aceptan cualquier `processId` (un id inexistente da 500). Un helper `assertActorInProcess` aplicado a los cuatro. Sin decisión; recomendación: aplicar. Afecta también a 4.2 y 4.3.
- **P2 · Arreglo · S** Diario vacío enviable y fecha futura aceptada. Decisión: D16.
- **P2 · Arreglo · S** El panel de un diario ajeno se abre sobre «Mis diarios».
- **P3 · Mejora · M** Marcar como revisados en lote.
- **P3 · Mejora · S** Horas obligatorias (≥ 0,25) en actividades nuevas. Decisión: D17.
- **P3 · Mejora · M** «Copiar actividades de ayer».

#### 4.2 Reporte semanal
Amarillo (0/3/2). Código: [`semanal-view.tsx`](../../apps/web/src/app/seguimiento/semanal/semanal-view.tsx). Hereda el P1 de Bitácora.
- **P2 · Arreglo · S** Rechazar semanas futuras y exigir contenido para enviar. Decisión: D16.
- **P2 · Arreglo · S** Retirar el envío (`recall`) como el diario, con tool de MCP.
- **P2 · Mejora · M** «Proponer borrador» determinista desde las bitácoras, siempre editable. Recomendación: sí.
- **P3 · Mejora · S–M** Nombre del proceso en el DTO (hoy se ve un UUID), filtros y enlace directo `?id=`.
- **P3 · Mejora · S** e2e de crear, enviar, devolver y revisar.

#### 4.3 Reuniones y compromisos
Amarillo (0/4/2). Código: [`reuniones-view.tsx`](../../apps/web/src/app/seguimiento/reuniones/reuniones-view.tsx), [`meeting.service.ts`](../../apps/api/src/modules/coordination/meeting/meeting.service.ts), [`commitment.service.ts`](../../apps/api/src/modules/coordination/commitment/commitment.service.ts).
- **P2 · Arreglo · S** Validar `assignedUserId` y `responsibleUserId` fuera de alcance.
- **P2 · Arreglo · S** Las pestañas ensanchan la página a 581 px en móvil.
- **P2 · Arreglo · S** Contraste de «Vencido hace N d» en claro (4,41:1); se corrige una vez en la insignia.
- **P2 · Arreglo · S** Motivo al bloquear un compromiso. Decisión: D17.
- **P3 · Mejora · S** Límites de fecha del compromiso (un año atrás, cinco adelante).
- **P3 · Mejora · M** Búsqueda, filtros y paginación en Actas.

#### 4.4 Actividades recurrentes
Verde (0/2/4). Código: [`actividades-recurrentes-view.tsx`](../../apps/web/src/app/actividades-recurrentes/actividades-recurrentes-view.tsx), [`recurring-activity.service.ts`](../../apps/api/src/modules/recurring-activity/recurring-activity.service.ts), [`module-matrix.ts`](../../apps/api/src/modules/auth/module-matrix.ts). Relacionado: [BL-054](../BACKLOG.md).
- **P2 · Arreglo · S** El administrador gestiona pero no «tiene» el módulo. Alinear matriz, menú y pantalla. Decisión: D14.
- **P2 · Arreglo · S–M** Tabla de Gestión en móvil: tarjetas por fila.
- **P3 · Mejora · S** Avisar que las ocurrencias anteriores a la fecha de inicio no se generan.
- **P3 · Mejora · M** Cumplimiento del equipo para el líder (solo lectura). Recomendación: sí.
- **P3 · Mejora · S** Reconciliar las ocurrencias pendientes de definiciones pausadas al arrancar el cron.
- **P3 · Mejora · S** Mensaje específico para el tipo de actividad inválido.

### Parte 5. Activos y conocimiento, y Gobierno

#### 5.1 Activos
Amarillo (1/4/3). Código: [`activos-view.tsx`](../../apps/web/src/app/activos/catalogo/activos-view.tsx), [`historial-view.tsx`](../../apps/web/src/app/activos/catalogo/[id]/historial/historial-view.tsx), [`asset.service.ts`](../../apps/api/src/modules/knowledge/asset/asset.service.ts). Relacionado: [BL-029](../BACKLOG.md), [BL-038](../BACKLOG.md).
- **P1 · Arreglo · M** El estado del activo no gobierna nada (`BORRADOR`, `ACTIVO` y `RETIRADO` se asocian por igual; los 252 activos del entorno están en borrador). Decisión: D8.
- **P2 · Arreglo · S** Duplicados de nombre por proceso: índice único `(proceso, lower(nombre))` y revisión previa de los existentes.
- **P2 · Arreglo · S** Código `PRY-XXXX` ausente en la columna, el filtro y el historial. Sin decisión.
- **P2 · Arreglo · S** Retirar sin confirmación ni aviso de dependientes.
- **P2 · Mejora · M** Ficha del activo con estado, propietario, descripción, dependencias y pestañas Solicitudes y Documentos. Requiere la especificación del agente `disenador`.
- **P3 · Mejora · M** Usar los filtros del servidor y un selector «Solicitud» con búsqueda (304 opciones hoy).
- **P3 · Arreglo · S** e2e del ciclo y alinear contrato (201 frente a 200) y comentario obsoleto.
- **P3 · Mejora · sin trabajo** Acciones de fila: se resuelve con BL-029.

#### 5.2 Documentos
Amarillo (1/3/4). Código: [`documentos-view.tsx`](../../apps/web/src/app/activos/documentos/documentos-view.tsx), [`document.service.ts`](../../apps/api/src/modules/knowledge/document/document.service.ts), [`documents.ts`](../../apps/web/src/lib/documents.ts).
- **P1 · Arreglo · S–M** «Vigente» no garantiza aprobación (versionar un vigente no la pide y el líder publica de borrador a vigente). Decisión: D9.
- **P2 · Arreglo · S** Los errores de crear, editar y versionar pierden el motivo del servidor; usar `serverDocumentError`.
- **P2 · Arreglo · S** Acciones ofrecidas que el servidor niega: `disabledReason`.
- **P2 · Arreglo · S** Categoría inexistente aceptada y títulos duplicados por activo.
- **P3 · Mejora · M** Contexto del documento, comparación y restauración de versiones.
- **P3 · Mejora · S** Acciones principales visibles según estado y rol, con confirmación en Aprobar ([BL-029](../BACKLOG.md)).
- **P3 · Mejora · M** Proyecto y `PRY-XXXX` visibles; menos peticiones auxiliares ([BL-038](../BACKLOG.md), [BL-014](../BACKLOG.md)).
- **P3 · Mejora · S** e2e del ciclo de aprobación y Jest que fije la decisión de D9.

#### 5.3 Controles
**Rojo** (2/4/3). Código: [`frameworks-view.tsx`](../../apps/web/src/app/administracion/frameworks/frameworks-view.tsx), [`gate-check.service.ts`](../../apps/api/src/modules/governance/gate-check/gate-check.service.ts), [`closure.service.ts`](../../apps/api/src/modules/closure/closure.service.ts), [`governance.ts`](../../apps/web/src/lib/governance.ts), [`governance.ts` del MCP](../../apps/mcp/src/tools/specs/governance.ts).
- **P1 · Arreglo · M** GC5 lleva a `CERRADA` sin tareas terminadas ni cierre formal. Un solo camino de cierre. Decisión: D10.
- **P1 · Arreglo · S–M** Se puede declarar «No aplica» un control `CUMPLIDO`, cambiar la ruta y registrar validaciones en una solicitud `CERRADA`. `waive` solo sobre `PENDIENTE`; congelar las mutaciones de una solicitud cerrada. Sin decisión.
- **P2 · Arreglo · S** Botones activos fuera de su etapa; deshabilitar con razón visible.
- **P2 · Arreglo · S** Aprobar GC4 y GC5 sin confirmación ni mención del cambio de estado.
- **P2 · Arreglo · S–M** Ejecutor inexistente produce 500, fecha futura aceptada y el integrante registra la validación de GC4 de otra persona. Decisión: D11.
- **P2 · Mejora · M** Faltantes y bloqueo sin pantalla: registrar, resolver, bloquear y desbloquear con `ReasonDialog`. Recomendación: incluirlas.
- **P3 · Mejora · M** Bandeja con filtros y paginación.
- **P3 · Mejora · S** Alias `/gobierno/controles` con redirección de la ruta actual.
- **P3 · Mejora · S** Jest por regla y e2e del camino hasta el cierre.

#### 5.4 Auditoría
Amarillo (1/3/3). Código: [`auditoria-view.tsx`](../../apps/web/src/app/gobierno/auditoria/auditoria-view.tsx), [`audit.service.ts`](../../apps/api/src/modules/audit/audit.service.ts). Relacionado: [BL-028](../BACKLOG.md).
- **P1 · Mejora · L** La auditoría no permite investigar un objeto, una persona o un periodo. Por fases: `objectLabel` con `IdChip` y filtro por código primero; después actor, fechas y proceso; enlace «Ver historial» desde ficha, activo y documento. Sin decisión.
- **P2 · Arreglo · S** Tipos y etiquetas incompletos (`AI_CONFIG`, `SMTP_CONFIG`, `DAILY_LOG_SUGGESTION`) y actor fuera de alcance como UUID.
- **P2 · Mejora · M** Detalle legible con solo los campos que cambian (BL-028).
- **P2 · Arreglo · S** Acceso del administrador por URL. Decisión: D12.
- **P3 · Mejora · S** Tarjetas por evento en móvil.
- **P3 · Mejora · M** Exportación a CSV del resultado filtrado.
- **P3 · Mejora · S** e2e de alcance por rol.

#### 5.5 Mis permisos
Verde (0/1/2). Código: [`mis-permisos-view.tsx`](../../apps/web/src/app/gobierno/mis-permisos/mis-permisos-view.tsx), [`module-matrix.ts`](../../apps/api/src/modules/auth/module-matrix.ts).
- **P2 · Mejora · M** Explicar qué puedo hacer, no solo qué puedo abrir, desde un campo `capabilities` en `GET /me/permissions`. Hay que acordar el texto por rol. **Hecho (oleada 5, PR B).**
- **P3 · Mejora · S** Mensaje para el administrador y corregir los nombres de rol «Jefe de área» y «Líder de proceso» con una migración (como BL-026).
- **P3 · Mejora · S** Mostrar solo los módulos que aparecen en el menú. **Hecho (oleada 5, PR B).**

### Parte 6. Administración

#### 6.1 Equipo y permisos
**Rojo** (3/5/2). Código: [`equipo-view.tsx`](../../apps/web/src/app/gobierno/equipo/equipo-view.tsx), [`user.controller.ts`](../../apps/api/src/modules/user/user.controller.ts), [`user.service.ts`](../../apps/api/src/modules/user/user.service.ts), [`grant.service.ts`](../../apps/api/src/modules/grant/grant.service.ts).
- **P1 · Arreglo · S** `GET /users` y `/users/:id` devuelven `passwordHash` e `isAdmin` de todos. Devolver `UserResponseDto` y un Jest que falle si aparece `passwordHash`. Antes de cerrar, revisar si hubo exposición real en producción y, si la hay, rotar contraseñas. Sin decisión.
- **P1 · Arreglo · S** El líder crea y desactiva usuarios (`@Roles` de clase), el jefe desactiva administradores y `PATCH active=false` salta el guard del último administrador. `@Roles(JEFE_AREA, ADMIN)` en `POST` y `PATCH` y rechazo de desactivar rango igual o superior. Se relaciona con D13.
- **P1 · Arreglo · M** «Roles asignados» no muestra el rol: añadir `roleCode` y `roleName` a la respuesta de asignaciones y una columna «Rol».
- **P2 · Arreglo · S** Validar el formato del identificador (hoy entra `aud adm raro <>`).
- **P2 · Arreglo · S** Auditar `invite` y `admin-flag` con `before/after` reales.
- **P2 · Arreglo · S** Revocar una asignación ya revocada no debe escribir otro evento.
- **P2 · Arreglo · M** «Reenviar invitación» debe informar si no hay SMTP efectivo o el envío falló.
- **P2 · Mejora · M** Búsqueda, filtro por estado, paginación y acciones Desactivar, Activar y Editar nombre en la fila ([BL-029](../BACKLOG.md)).
- **P3 · Mejora · M** Tarjetas móviles en lugar de una lista de 11 000 px.
- **P3 · Arreglo · S** Mensajes de validación en español.

#### 6.2 Maestras
Amarillo (1/4/2). Código: [`catalogs-view.tsx`](../../apps/web/src/app/catalogs/catalogs-view.tsx), [`catalog.service.ts`](../../apps/api/src/modules/catalog/catalog.service.ts). Relacionado: [BL-028](../BACKLOG.md), [BL-050](../BACKLOG.md).
- **P1 · Arreglo · S** La pantalla no hace gating por rol: integrante, líder y admin ven «Nuevo elemento», «Editar» y «Desactivar» y reciben 403. Usar `allowedModules.has('admin')` con el aviso de Equipo; la lectura sigue abierta a los formularios. Sin decisión.
- **P2 · Arreglo · M** Proteger las maestras de sistema. Decisión: D15.
- **P2 · Arreglo · S** Validar el formato de `catalog` y `code`.
- **P2 · Mejora · M** Selector del catálogo, filtro en vivo y nombres legibles (BL-028); «Maestra nueva» como acción explícita.
- **P2 · Mejora · M** Al desactivar, mostrar cuántos registros usan el ítem. Define la política de conservación en históricos.
- **P3 · Mejora · S** Retirar o archivar las maestras de funciones retiradas (`TRIAGE_ROUTE`, `ISSUE_TYPE`).
- **P3 · Mejora · S** Eliminar la ruta alias `/catalogs` cuando no haya enlaces.

#### 6.3 Áreas
Amarillo (0/3/1). Código: [`areas-view.tsx`](../../apps/web/src/app/administracion/areas/areas-view.tsx), [`area.service.ts`](../../apps/api/src/modules/area/area.service.ts).
- **P2 · Arreglo · S** Bloquear la desactivación con procesos activos. Decisión: D21.
- **P2 · Arreglo · S** Formato del código (`^[A-Z0-9_]+$`).
- **P2 · Mejora · S** Número de procesos y solicitantes asociados en cada fila.
- **P3 · Mejora · S** Explicar o retirar el «Orden» numérico (todas valen 0).

#### 6.4 Procesos
Amarillo (0/3/1). Código: [`procesos-view.tsx`](../../apps/web/src/app/administracion/procesos/procesos-view.tsx), [`process.service.ts`](../../apps/api/src/modules/process/process.service.ts).
- **P2 · Arreglo · M** Avisar o bloquear al desactivar con asignaciones, solicitudes abiertas o tareas sin cerrar. Decisión: D21.
- **P2 · Arreglo · S** Formato del código.
- **P2 · Mejora · S** Marcadores de campo con menor contraste o con «p. ej.».
- **P3 · Mejora · S** El campo «Marco» como lista tomada de las maestras.

#### 6.5 Solicitantes
Verde (0/1/2). Código: [`requesters-view.tsx`](../../apps/web/src/app/administracion/solicitantes/requesters-view.tsx), [`requester.service.ts`](../../apps/api/src/modules/requester/requester.service.ts).
- **P2 · Mejora · S** Unicidad por (nombre, área). Decisión: D23. **Hecho (oleada 5, PR B).**
- **P3 · Mejora · S** Búsqueda y paginación cuando crezca la lista.
- **P3 · Arreglo · S** Mensajes de validación en español.

#### 6.6 Configuración SMTP y administradores
Amarillo (0/3/1). Código: [`configuracion-smtp-view.tsx`](../../apps/web/src/app/administracion/configuracion-smtp/configuracion-smtp-view.tsx).
- **P2 · Arreglo · S** `ConfirmDialog` antes de dar o quitar el rol de administrador.
- **P2 · Arreglo · S** Auditoría real de `admin-flag` (ver 6.1).
- **P2 · Mejora · M** Separar «Administradores del sistema» en su propia pantalla con buscador. Decisión: D24.
- **P3 · Arreglo · S** `PATCH` con cuerpo parcial (o `PUT`) y mensajes en español.

#### 6.7 Agentes de IA
Verde (0/2/2). Código: [`ia-agentes-view.tsx`](../../apps/web/src/app/administracion/ia/ia-agentes-view.tsx). Relacionado: [BL-014](../BACKLOG.md).
- **P2 · Arreglo · S** Asociar `htmlFor` e `id` a los dos campos de presupuesto (único hallazgo de axe).
- **P2 · Mejora · M** Historial de versiones del prompt base y «restaurar el predeterminado». Recomendación: guardar las últimas 5.
- **P3 · Mejora · M** Dividir la vista de 680 líneas (BL-014).
- **P3 · Mejora · S** Mostrar el proveedor y el costo estimado por solicitud de triage.

## Hallazgos transversales

Se resuelven una sola vez y benefician a varios módulos; la fila [BL-080](../BACKLOG.md) los agrupa.

| Tema | Qué hacer | Módulos |
|---|---|---|
| Control de abuso | Política única de límite de intentos por IP y usuario y presupuesto de uso de IA | 1.1, 1.2, 1.7 |
| Reglas solo en la web | Pasar a la API las validaciones de plan, fechas, formatos, contenido mínimo y proceso del actor; «estado terminal o aprobado bloquea lo que cuelga de él» con una prueba por módulo | 3.1, 4.1 a 4.3, 5.1 a 5.3, 6.2 a 6.4 |
| Un servicio de transición | Un solo camino para cerrar proyectos y para publicar documentos | 5.2, 5.3 |
| Predicados y conceptos únicos | «Lista para priorizar» compartido entre Panel y bandeja; un solo concepto de horas | 1.5, 2.4, 3.1, 3.2 |
| Componente «Sin acceso» y destino por rol | Una función de destino post-login por `allowedModules`; un componente de ruta con `DisabledReason` | 1.5, 2.3, 2.4, 4.1, 4.4, 5.4, 6.2 |
| Errores | `ErrorState` que distingue 403 de red; la web muestra el mensaje del servidor (`serverError`) | todas |
| Mensajes de la API | Filtro global en español con tildes y sin UUID | todos los módulos con API |
| Listados | Patrón único con límite, cursor, total, filtros y `q`; los DTO traen nombre y código de lo referenciado ([BL-039](../BACKLOG.md)) | 2.2, 3.1 a 3.3, 4.2, 4.3, 5.1 a 5.4 |
| Móvil | Tarjetas en las tablas que faltan (continuación de BL-024) | 2.5, 3.1, 3.2, 4.3, 4.4, 5.4, 6.1 |
| Accesibilidad | `IdChip` a 24 px, contraste de la campana en oscuro y de «Vencido», etiquetas de IA, e2e de axe | 2.1, 4.3, 6.7 y el shell |
| Confirmación | Criterio común de confirmación o «Deshacer» para acciones no reversibles | 2.5, 5.1, 5.3, 6.6 |
| IDs visibles | Fase de IDs para Activos, Documentos y Auditoría y campo `code` en los DTO de lectura (continuación de BL-042, BL-044 y BL-049) | 5.1, 5.2, 5.4 |
| Pruebas y datos | e2e del flujo feliz, del plan, del ciclo de documentos y de Administración por rol; seed de demostración ([BL-040](../BACKLOG.md)) | todos |
| Permisos documentados | Una prueba que compare los controladores con una tabla de permisos esperada; documentación alineada | 6.1, 6.2 |
| Capacidades sin pantalla | Faltantes y bloqueo de gobierno existen en API y MCP sin interfaz; revisar código muerto en `lib/*.ts` | 5.3 |
| Navegación | Rutas que no coinciden con el grupo del menú (Aprobaciones, Controles, Capacidad, Equipo); alias; dos buscadores. La validación del agrupamiento está en [BL-030](../BACKLOG.md) | 1.6, 2.5, 3.2, 5.3, 6.1 |

Pendientes que ya existen y no se duplican: [BL-014](../BACKLOG.md) (dividir vistas grandes), [BL-028](../BACKLOG.md) (Auditoría y Maestras legibles), [BL-029](../BACKLOG.md) (acciones de fila), [BL-030](../BACKLOG.md) (agrupación del menú), [BL-032](../BACKLOG.md) (Asistente), [BL-038](../BACKLOG.md) y [BL-039](../BACKLOG.md) (filtros), [BL-040](../BACKLOG.md) (seed), [BL-041](../BACKLOG.md) (alcance), [BL-046](../BACKLOG.md) (Asistente cita IDs), [BL-050](../BACKLOG.md) (datos de Novedades), [BL-051](../BACKLOG.md) y [BL-052](../BACKLOG.md) (compromiso del plan), [BL-053](../BACKLOG.md) (Portafolio «Entrega») y [BL-054](../BACKLOG.md) (datos de referencia).
