# Bitácora y Reporte semanal: especificación UX/UI

> **Actualización (selectores de proyecto y tarea).** El campo «Novedad relacionada» ya no existe en el formulario ni en la fila de detalle de la actividad, y los selectores de Proyecto y Tarea pasaron a un combobox con buscador alimentado por `GET /worklog/options`. Lo que describe este documento sobre la novedad relacionada está superado; ver `docs/design/bitacora-selectores.md`.

Especificación visual, de interacción y de contrato de datos (rol Diseñador). No toca código de la aplicación ni
el backend: describe lo que se debe construir y en qué orden.

Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md`, `55-sincronia-api-mcp-docs.md` y la identidad de
`docs/design/identidad-color-menu.md` (menú marino, lienzo `#EBF0F7`, filete degradado). Solo tokens semánticos,
texto azul con `text-link`, foco con `--ring`, textos en español con tildes. Formato y nivel de detalle: los de
`docs/design/planeacion-ux.md`.

Los contrastes de la sección 12 están **medidos** (WCAG 2.2, luminancia relativa sRGB; los tokens OKLCH de
`globals.css` se convirtieron a sRGB y lo translúcido se compuso sobre su fondo real, en claro y oscuro). Las
capturas citadas están en `docs/design/capturas-bitacora/` (se usan las copias `a-*`).

---

## 0. Resumen ejecutivo

El dueño del producto dice que ambos módulos están «muy flojos». Tiene razón y el problema es de fondo, no de
pintura: hoy son un **formulario de captura** con una lista lateral, y no una herramienta de **seguimiento**. Quien
más los necesita (jefe y líder) no puede responder ninguna de sus tres preguntas: *¿quién registró y quién no?*,
*¿qué hizo cada quien y cuánto tiempo?* y *¿qué me falta por revisar?*.

| # | Problema | Decisión |
| --- | --- | --- |
| 1 | No se sabe **quién** hizo cada diario | La API entrega `authorName` y `processName`. La lista muestra **persona con iniciales**. Título según la pestaña: «Mis diarios» o «Diarios del equipo». |
| 2 | Sin filtros, búsqueda ni paginación | **Tabla paginada en el servidor** (25/50/100) con búsqueda, rango de fechas con atajos, persona, proceso, estado y clasificación; **chips** de filtros activos; filtros **en la URL**; ordenación por columna. |
| 3 | Nadie revisa | Flujo **Borrador → Enviado → Revisado**, con **«Devolver con motivo»** (vuelve a Borrador, notifica) y **«Retirar envío»** para el autor. Revisan el jefe y el líder del proceso, nunca el autor. Línea de tiempo con persona y fecha-hora. |
| 4 | La actividad solo muestra 3 datos | Fila **expandible** (densa al cerrar, completa al abrir) con referencia, resultado, evidencia, novedad, estado y próximo paso. |
| 5 | Horas enteras | Se **mantiene entero** en esta entrega; recomendación documentada para pasar a pasos de 0,25 h (sección 13). |
| 6 | Semanal pobre | Pantalla **centrada en la semana** (anterior/siguiente), guía por sección con ejemplos, **sugerencias desde la bitácora**, diarios que faltan, avance de llenado y **vista de cumplimiento** del equipo. |
| 7 | Sin vista de equipo | Pestaña **Equipo** con lista y con **cuadrícula persona × día** (cobertura), horas por persona y pendientes de revisar. |
| 8 | Captura lenta | **«Registrar hoy»** en un clic, proceso recordado, aviso con enlace si ya existe el diario, **copiar actividades** del día anterior, atajos y banner de solo lectura con motivo. |
| 9 | (nuevo) El jefe puede editar, enviar y eliminar diarios **ajenos** | Se **restringe la escritura al autor**; el jefe y el líder solo leen y revisan (sección 2.2, H1). |
| 10 | (nuevo) Móvil: 80 filas ≈ 5 000 px y el detalle queda al final | Tarjetas con `DataCardList`, paginadas, y detalle en `Sheet` a pantalla completa. |

Decisión de arquitectura de pantalla: **tabla paginada + panel lateral (`Sheet`)**, no maestro-detalle de 320 px
(sección 3.1). Todo se construye con los componentes que ya existen (`Toolbar`, `SearchInput`, `StatStrip`,
`SortableTableHead`, `DataTablePagination`, `ResultCount`, `DataCardList`, `EmptyState`, `ErrorState`, `Sheet`,
`Tabs`, `ReasonDialog`, `StatusBadge`, `Badge`); los componentes nuevos son pequeños y se listan en la sección 5.13.

---

## 1. Para qué sirven (modelo mental)

Antes de rediseñar hay que fijar qué es cada cosa, porque la confusión entre «bitácora», «tarea» y «reporte» es
parte de por qué los módulos parecen flojos.

| Concepto | Qué es | Quién lo escribe | Para qué sirve | Lo que **no** es |
| --- | --- | --- | --- | --- |
| **Bitácora (diario)** | El registro de **lo que hice un día** en un proceso, con las horas que le dediqué. Un diario por persona + proceso + fecha. | Cada persona, sobre sí misma. | Dar visibilidad al líder y al jefe; sustentar el reporte semanal; evidenciar soporte y trabajo extraordinario; saber en qué se va el tiempo del equipo. | No cambia el avance de ninguna tarea (el % se actualiza en *Mi trabajo* o *Planificación*). No es un plan ni un compromiso. |
| **Actividad** | Una línea del diario: qué hice, de qué tipo, cuántas horas. | Quien escribe el diario. | Es la unidad que se clasifica y se suma. | No es una tarea del plan. |
| **Reporte semanal** | El **resumen narrativo de la semana** de una persona en un proceso, con un consolidado automático de sus diarios. | Cada persona, sobre sí misma. | Comunicar resultados, bloqueos, compromisos y decisiones sin reunión; dar base a la revisión del jefe. | No crea compromisos ni cambia prioridades (son texto). No reemplaza los diarios: los resume. |
| **Novedad** (módulo retirado) | Un incidente o bloqueo puntual con seguimiento propio. | Quien lo detecta. | Gestionar el problema hasta resolverlo. | No es el registro del día; una actividad puede *apuntar* a una novedad. |

Quién ve y quién puede hacer qué (alcance real del código en `coordination-scope.service.ts`, con el cambio
propuesto en H1 marcado):

| Acción | Integrante | Líder de proceso | Jefe de área |
| --- | --- | --- | --- |
| Ver diarios | Solo los suyos | Los de **sus procesos** (todas las personas) | Todos |
| Crear / editar / enviar / eliminar un diario | Los suyos | Los suyos | Hoy: **cualquiera** (defecto). Propuesto: solo los suyos |
| **Revisar o devolver** | No | Sí, en sus procesos, **nunca el propio** | Sí, **nunca el propio** |
| Ver cobertura y KPI de equipo | No | Sí (sus procesos) | Sí |
| Ver semanales | Los suyos | Los de sus procesos | Todos |

Escalas de confianza: un integrante no ve la pestaña *Equipo* ni los filtros de persona; un líder ve solo las
personas de sus procesos; el jefe ve todo. La interfaz **solo refleja** esto (decide con las banderas `actions`
que entrega la API, sección 14); la autoridad es el backend.

---

## 2. Diagnóstico

### 2.1 Por captura

Capturas tomadas en 1280×900 y 375 con el entorno local (≈ 80 diarios `[demo-bitacora]` de 3 personas).

**a-jefe-lista (1280×900)** — jefe con el menú completo.
- La lista lateral mide 320 px y cada ítem dice **«fecha + proceso + estado»**. Las tres primeras filas son
  idénticas: «2 nov 2026 · BI · Borrador». Es imposible saber de quién es cada una. La API ni siquiera devuelve el
  nombre: solo `authorUserId`.
- El título de la lista dice **«Mis diarios»** aunque el jefe ve los de todo su alcance. Engaña.
- El jefe ve en el detalle «Eliminar», «Editar notas» y «Enviar a revisión» de un diario que quizá no es suyo
  (`dailyLogWriteWhere` devuelve `{}` para el jefe). Es un riesgo de integridad, no solo de diseño.
- El panel de detalle tiene demasiado aire arriba (dos líneas de explicación de «dedicación») y la tabla de
  actividades llega a la mitad de la pantalla. El primer dato útil (las actividades) queda a ~480 px.
- No hay ningún resumen: horas totales, cuántos pendientes, cuántos sin enviar.

**a-integrante-lista (1280×900)** — integrante.
- Una fila por fecha, así que la ambigüedad desaparece, pero sigue la lista infinita sin agrupar ni filtrar.
- «Enviado» es un callejón sin salida: no se explica qué sigue, quién lo mira ni cuándo. El estado `REVISADO`
  existe en la base de datos pero ninguna pantalla lo produce.
- El botón «Nuevo diario» abre un diálogo que pide proceso y fecha cada vez, aunque casi siempre es *hoy* y *mi
  único proceso*.

**a-jefe-semanal (1280×900)**
- Tres filas «Semana del 26 oct 2026 · BI · Borrador» idénticas (tres personas). Mismo defecto que en diarios.
- Título «Mis reportes» para una lista de equipo.
- Las cinco secciones son cajas de texto vacías sin explicación (salvo una nota en *Propuestas*). Con cinco cajas
  iguales de 4 líneas el usuario no sabe qué se espera, cuán largo ni con qué ejemplo.
- El consolidado (3 diarios · 7 actividades · 17 h · 1 extraordinaria) está bien pensado pero **no dice qué falta**:
  no avisa de diarios en borrador ni de días sin registrar, que es justo lo que explica un consolidado bajo.
- El texto de las cajas fue pegado con el fondo de campo (`bg-muted`), de modo que el área de escritura parece
  deshabilitada. Debe parecer un campo editable.

**a-jefe-movil (375×5 828)**
- La lista de diarios mide **≈ 5 000 px** y el detalle aparece al final, tras desplazar toda la lista. Sin filtros
  ni paginación el móvil es inutilizable.
- La tabla de actividades se corta en horizontal (la columna «Descripción» se desborda y «Horas» queda fuera de
  la vista). Las acciones «Editar / Eliminar» quedan aún más a la derecha.

### 2.2 Hallazgos de código (confirmados al leer los archivos)

Prioridad: **P0** bloquea la utilidad o la integridad; **P1** mejora clara; **P2** pulido.

| ID | Prio. | Hallazgo | Evidencia |
| --- | --- | --- | --- |
| H1 | **P0** | El jefe puede editar, enviar y borrar diarios **ajenos**. | `dailyLogWriteWhere`: `if (actor.isJefeArea) return {}`. |
| H2 | **P0** | La lista devuelve **todos** los diarios con **todas** sus actividades, sin filtros ni paginación. | `listDailyLogs`: `findMany` con `include: { activities }`. |
| H3 | **P0** | No hay autor legible: solo `authorUserId`. | `DailyLogResponseDto` / `WeeklyReportResponseDto`. |
| H4 | **P0** | `REVISADO` existe y cuenta para la consolidación, pero **ninguna acción lo produce**. No hay devolución ni observaciones. | `DailyLogStatus.REVISADO` sin endpoint. |
| H5 | P1 | La UI no expone `activityStatus`, `nextStep`, `nextStepDate`, y de las referencias solo muestra el id (no el nombre). | `ActivityResponseDto`; `actividad-form-dialog.tsx`. |
| H6 | P1 | `listIssues()` (todas las novedades del portal) se vuelve a pedir **cada vez que se cambia de diario**. | `fetchDetail` en `bitacora-view.tsx`. |
| H7 | P1 | La clasificación se elige en un `Select` y su ayuda cambia debajo, oculta hasta elegir. | `actividad-form-dialog.tsx`. |
| H8 | P1 | `hours` no tiene máximo: se puede registrar 400 h en un día. | `CreateActivityDto` (`@Min(0)`, sin `@Max`). |
| H9 | P1 | El error 409 por diario duplicado es genérico («Ya hay un registro para esa persona, proceso y fecha») y no ofrece el enlace al existente. | `messageForStatus(409)`. |
| H10 | P1 | El consolidado semanal ignora los diarios en Borrador y no dice cuáles faltan. | `consolidate` filtra `ENVIADO`/`REVISADO`. |
| H11 | P1 | El autor no puede retirar un envío por error. Un diario enviado es definitivo. | `submitDailyLog` es de una sola vía. |
| H12 | P1 | `activityStatus` es texto libre sin validar: no sirve para sugerir bloqueos en el semanal. | `activityStatus?: string` sin `@IsIn`. |
| H13 | P1 | El diálogo «Nuevo reporte semanal» pide al usuario una fecha cualquiera «que el sistema ajusta al lunes»: concepto interno expuesto. | `semanal-form-dialog.tsx`. |
| H14 | P2 | El mismo `Select` de proyecto/tarea mezcla cientos de opciones sin búsqueda. | `actividad-form-dialog.tsx`. |
| H15 | P2 | Las fechas se ven como «2 nov 2026» sin día de la semana; en un registro diario el día de la semana es información clave (¿falta el lunes?). | `formatDateOnly`. |
| H16 | P2 | Sin estado «Devuelto» ni motivo visible en un diario de solo lectura. | `InlineNotice` genérica en `bitacora-view.tsx`. |

Los problemas 1 a 8 que el dueño del producto había detectado quedan **todos confirmados**; H1, H6, H8, H9,
H11 y H12 son hallazgos adicionales.

### 2.3 Qué se conserva (lo que ya está bien)

- Las reglas de actividad por clasificación (planificada exige proyecto o tarea; soporte exige activo;
  extraordinaria exige solicitante y justificación) y el aviso de que las horas no cambian el avance.
- El gestor de foco tras eliminar y enviar (NIT 4) y los diálogos de confirmación.
- La consolidación por lectura (no copia) y que las propuestas del semanal sean texto.
- Los componentes `StatusBadge kind="log"`, `ConfirmDialog`, `Field`, `Section`.

---

## 3. Decisiones de arquitectura y alternativas descartadas

### 3.1 (a) Patrón de pantalla para cientos de diarios

| Opción | Veredicto |
| --- | --- |
| Maestro-detalle de 320 px (actual) | **Descartada.** 320 px no caben persona + proceso + n.º de actividades + horas + distribución + estado. Con cientos de ítems una lista sin paginar es un scroll infinito; en móvil el detalle queda a unos 5 000 px. No se puede ordenar ni comparar filas. |
| Tabla paginada + **página de detalle** (`/seguimiento/bitacora/[id]`) | Descartada para la primera entrega. Da URL propia y espacio completo, pero obliga a salir de la lista (se pierde posición de scroll y contexto) y al revisor le toca ir y volver 15 veces. Se recoge como **alternativa de fase 3** si el panel resulta estrecho. |
| **Tabla paginada + panel lateral (`Sheet` derecho)** | **Elegida.** Se explora y compara en la tabla y se abre el detalle sin perder el sitio. Es el patrón que ya usa el portal (detalle de tarea en planificación). Con `?diario=<id>` en la URL el panel es enlazable (las notificaciones de devolución apuntan a él) y el botón «Atrás» lo cierra. |
| Acordeón de diarios con las actividades dentro | Descartada: con 25 filas abiertas la página mide miles de píxeles y se mezclan edición y exploración. |
| Calendario mensual | Descartado como vista principal (poca información por celda, mala en móvil). Su parte útil —ver huecos por día— la cubre la cuadrícula de cobertura (3.5). |

Ancho del panel: pantalla completa por debajo de 640 px y `sm:max-w-2xl` (672 px) desde 640. A 1024 con el menú
en riel (56 px) la tabla conserva ≈ 330 px visibles junto al panel abierto, suficiente para no perder la
referencia; por eso el panel es modal (superpone y bloquea la tabla) en lugar de empujar el contenido: evita
reflujos de la tabla.

### 3.2 (b) Pestañas «Mis diarios · Equipo»

- **Elegido:** `Tabs` (ya existe) con **«Mis diarios»** para todos y **«Equipo»** solo para jefe y líder, con
  `?vista=mis|equipo` en la URL. Los dos casos de uso son distintos y merecen columnas y KPI distintos: quien
  escribe su día no necesita la columna *Persona*; quien revisa no necesita «Registrar hoy» como acción principal.
- Descartado: un solo listado con filtro «Persona: yo» por defecto. Mezcla tareas (captura y supervisión), el
  título seguiría siendo ambiguo y el integrante vería un filtro que no puede usar.
- Dentro de *Equipo* hay un **interruptor «Lista · Cobertura»** (`SegmentedRadio`) y no una tercera pestaña,
  porque ambas son lentes sobre los mismos datos y comparten filtros de rango y proceso.
- Un líder que además escribe diarios usa *Mis diarios* para lo suyo. Quien solo tiene rol de integrante no ve
  pestañas: el encabezado es simplemente «Mis diarios».
- La visibilidad de la pestaña sale de los roles de la sesión (presentación); si un integrante forzara
  `?vista=equipo`, la API responde 403 y la pantalla vuelve a *Mis diarios* con un aviso.

### 3.3 (c) Filtros

| Filtro | Control | Notas |
| --- | --- | --- |
| Búsqueda de texto | `SearchInput` | Notas del día, descripción, resultado, activo, solicitante y nombre de la persona. `q`. Con retardo de 300 ms. |
| Rango de fechas | `Select` de atajos + dos `<input type="date">` si «Personalizado» | Hoy · Esta semana · Semana pasada · Este mes · Últimos 30 días · Todo el historial · Personalizado. |
| Persona | `Select` | Solo en *Equipo*; sale de `GET /coordination/people`. |
| Proceso | `Select` | Solo si la persona tiene más de un proceso en alcance. |
| Estado | `Select` | Todos · Borrador · Devuelto · Enviado · Revisado. |
| Clasificación | `Select` | Diarios que **contienen** al menos una actividad de ese tipo. |

Reglas:
- **Persisten en la URL** (`router.replace`, sin llenar el historial) con nombres en español:
  `?vista=equipo&rango=semana&persona=<uuid>&proceso=<uuid>&estado=ENVIADO&clase=SOPORTE&q=texto&orden=fecha&dir=desc&pagina=2&tam=25&diario=<uuid>`.
  Para los atajos se guarda **el atajo** (`rango=semana`) y no las fechas, así un enlace guardado sigue siendo
  «esta semana» mañana. Con «Personalizado» se guardan `desde` y `hasta`.
- Los filtros activos se muestran como **chips** debajo de la barra, cada uno con su botón de quitar
  (`aria-label="Quitar filtro Estado: Enviado"`), y «Limpiar filtros» a la derecha del contador. Limpiar vuelve al
  **valor por defecto**, no a «sin filtro».
- **Valores por defecto:** *Mis diarios* → «Últimos 30 días»; *Equipo* → «Esta semana». Un filtro por defecto
  nunca es invisible: el atajo se ve en su `Select` y, como chip, con el estilo atenuado «(predeterminado)».
- Cambiar cualquier filtro vuelve a `pagina=1`.
- En móvil `Toolbar collapseOnMobile`: queda visible la búsqueda y el resto bajo «Filtros»; el botón muestra un
  contador (`Filtros · 2`).

Descartado: filtros en un panel lateral permanente (roba ancho a la tabla en 1024) y filtros con botón «Aplicar»
(los filtros del portal se aplican al cambiar; el retardo solo existe en la búsqueda).

### 3.4 (d) Tira de resumen (KPI)

`StatStrip` con 4 `StatTile`, que **responden a los filtros**, salvo el de *estado* (si no, «Por revisar» valdría
siempre 0 al filtrar por Revisado):

| Tile | Valor | Pista | Tono |
| --- | --- | --- | --- |
| Diarios | n.º | «de 14 personas» (Equipo) | default |
| Horas | `formatHours` | Distribución por clasificación en texto («Planificada 62 %…») | default |
| Por revisar | n.º de `ENVIADO` | enlace «Ver pendientes» (`text-link`) que aplica `estado=ENVIADO` | warning si > 0 |
| Borradores | n.º de `BORRADOR` | «2 devueltos» | default (warning si hay devueltos) |

En *Mis diarios* el tercer tile cambia a **«Pendientes de enviar»** (mis borradores) y el cuarto a **«Devueltos»**
(los que requieren mi atención). Los tiles no son interactivos (`StatTile` no lo es), para no inventar un
componente: la acción vive en el enlace de la pista.

Alternativa descartada: tiles clicables que filtran. Es más directo, pero exige modificar `StatTile` y su patrón
de foco para un uso que un enlace en la pista resuelve.

### 3.5 (e) Qué muestra cada fila

Columnas de la tabla (ver 5.5 para clases):

| Columna | Contenido | Visible desde |
| --- | --- | --- |
| Fecha | **«lun 2 nov 2026»** (día de la semana + fecha) + chip «Hoy» / «Ayer» | siempre |
| Persona | Avatar con iniciales + nombre. Debajo, `text-meta`, el proceso cuando la columna Proceso está oculta | *Equipo*, siempre |
| Proceso | Nombre | `lg` |
| Actividades | n.º | siempre |
| Horas | `1 h` alineada a la derecha, `tabular-nums` | siempre |
| Distribución | Minibarra por clasificación (5.8) | `lg` |
| Estado | `StatusBadge` («Devuelto» incluido) | siempre |
| Notas | Vista previa de una línea (`truncate`) | `xl` |

En *Mis diarios* no hay columna *Persona* y la fecha lleva el proceso debajo. Se ordena por **Fecha** (por defecto,
descendente), **Persona**, **Horas** y **Estado**. Cada fila es un botón (fecha) y, además, toda la fila es
clicable; el arrastre de texto no la dispara.

Descartado: agrupar las filas por semana con subtítulos. Duplica la información del día de la semana, rompe la
ordenación por otras columnas y complica la paginación del servidor.

### 3.6 (f) Unificación con el resto del portal

| Necesidad | Componente existente | Qué se agrega |
| --- | --- | --- |
| Barra de filtros | `Toolbar`, `SearchInput` | nada |
| Contador | `ResultCount` (`noun`: diario/diarios) | nada |
| Tabla | `Table` + `SortableTableHead` | orden en servidor (controlado) |
| Móvil | `DataCardList` | nada |
| Paginación | `DataTablePagination` (25/50/100) | modo servidor (ya lo usa Auditoría) |
| KPI | `StatStrip`/`StatTile` | nada |
| Vacío / error / carga | `EmptyState`, `ErrorState`, `Skeleton`, `TableSkeleton` | nada |
| Detalle | `Sheet` | override de ancho |
| Devolver con motivo | `ReasonDialog` | nada |
| Estados | `StatusBadge kind="log"` | valor presentacional «DEVUELTO» (warning) |
| Pestañas / interruptor | `Tabs`, `SegmentedRadio` | nada |
| Clasificación en el formulario | `RadioCards` | nada |

Componentes nuevos (todos pequeños, ver 5.13): `PersonAvatar`, `ClassificationBar`, `DateRangeSelect`,
`FilterChips`, `CoverageGrid`, `ActivityRow`, `TimelineList` y el hook `useUrlFilters`.

---

## 4. Estructura de las pantallas

### 4.1 Bitácora: *Mis diarios* (1280)

```
┌ PageHeader ────────────────────────────────────────────────────────────┐
│ Bitácora                                    [ Registrar hoy ]  [ ⋯ Otro día ] │
│ Lo que hiciste cada día, con sus horas. La ve tu líder y tu jefatura.          │
│ ▸ ¿Para qué sirve la bitácora?   (details)                                      │
├ Tabs ──────────────────────────────────────────────────────────────────┤
│ [Mis diarios]  [Equipo]                                                         │
├ StatStrip ─────────────────────────────────────────────────────────────┤
│ Diarios 18 │ Horas 96 h │ Pendientes de enviar 2 │ Devueltos 1                   │
├ Toolbar ───────────────────────────────────────────────────────────────┤
│ Buscar [______] Rango [Últimos 30 días▾] Proceso [Todos▾] Estado [Todos▾]       │
│ Clasificación [Todas▾]                           18 diarios  Limpiar filtros    │
│ chips: (Últimos 30 días · predeterminado) (Estado: Devuelto ✕)                   │
├ Tabla (tarjeta flotante) ──────────────────────────────────────────────┤
│ Fecha ▾          Proceso   Act.  Horas  Distribución   Estado      Notas        │
│ lun 2 nov [Hoy]  BI         3    6 h    ▇▇▇▇▇▇▇        Borrador    Día con…     │
│ vie 30 oct       BI         2    3 h    ▇▇▇▇           ↩ Devuelto  …            │
├ DataTablePagination ───────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Bitácora: *Equipo* — lista y cobertura

Lista: igual a la anterior más la columna **Persona** y filtro **Persona**. KPI: Diarios · Horas · **Por revisar** ·
Borradores. Orden por defecto: Fecha ↓, después Persona ↑.

Cobertura (interruptor «Lista · **Cobertura**»): selector de semana (anterior / siguiente / «Esta semana») y
la cuadrícula persona × día:

```
 Semana del 2 al 8 nov 2026    [‹] [Esta semana] [›]     Proceso [Todos▾]
 ┌──────────────────┬─────┬─────┬─────┬─────┬─────┬ sáb ┬ dom ┬───────┬───────┐
 │ Persona          │Lun 2│Mar 3│Mié 4│Jue 5│Vie 6│  7  │  8  │ Horas │ Días  │
 ├──────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼───────┼───────┤
 │ (AP) Ana Pérez   │ ✓ 6h│ ● 7h│ ● 6h│ ✎ 4h│  ·  │     │     │ 23 h  │ 4/4   │
 │ (LM) Luis Mora   │ ✓ 8h│ — 　│ ↩ 5h│ — 　│  ·  │     │     │ 13 h  │ 2/4   │
 └──────────────────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴───────┴───────┘
 Leyenda: ✓ Revisado  ● Enviado  ✎ Borrador  ↩ Devuelto  — Sin registro (día hábil pasado)  · Aún no corresponde
```

- Las columnas de fin de semana son estrechas y atenuadas; solo se exigen lunes a viernes (ver riesgos: festivos).
- El **día actual** lleva encabezado `bg-primary-subtle`. Los días futuros se muestran vacíos (`·`), no como falta.
- Una celda es un botón que abre el `Sheet` del diario; en celdas «Sin registro» es solo informativa.
- Si una persona tiene dos procesos el mismo día, la celda muestra el **peor estado** (Devuelto > Sin registro >
  Borrador > Enviado > Revisado) y un contador «2».
- Pie de cuadrícula: totales por día (horas y personas que registraron).
- Debajo, el KPI: **Registraron hoy** (4 de 6), **Horas de la semana**, **Por revisar**, **Personas con días sin
  registro**.

### 4.3 Panel de detalle del diario (`Sheet`)

```
┌ Cabecera (sticky) ──────────────────────────────────────────┐
│ ‹ ›  lunes 2 de noviembre de 2026            [Borrador]  ✕   │
│ (AP) Ana Pérez · BI · 3 actividades · 6 h                    │
├ Banner de estado (si aplica) ───────────────────────────────┤
│ ↩ Devuelto por Luis Mora el 3 nov, 9:40: «Faltan los…»       │
│   [Corregir y reenviar]                                      │
├ Cuerpo con scroll ──────────────────────────────────────────┤
│ Notas del día                              [✎ Editar]         │
│ Día con foco en soporte…                                      │
│                                                               │
│ Dedicación  6 h   ▇▇▇▇▇▇▇▇▇▇▇▇▇  Planificada 3 h · Soporte 2 h…│
│                                                               │
│ Actividades (3)              [Expandir todo]  [+ Actividad]   │
│  ▸ (Planificada) Modelo de ventas · Proyecto BI Ventas  3 h   │
│  ▾ (Soporte) Carga nocturna · Activo: data lake          2 h  │
│       Resultado · Evidencia · Estado · Próximo paso …         │
│                                                               │
│ Historial                                                     │
│  ● Creado — Ana Pérez · 2 nov 8:05                            │
│  ● Enviado — Ana Pérez · 2 nov 17:40                          │
│  ● Devuelto — Luis Mora · 3 nov 9:40 · «Faltan los…»          │
├ Pie de acciones (sticky) ───────────────────────────────────┤
│ [Eliminar]                    [Editar notas?] [Enviar a revisión]│
└──────────────────────────────────────────────────────────────┘
```

Las acciones del pie dependen de quién mira y del estado (5.10).

### 4.4 Reporte semanal: *Mi reporte* (1280)

Centrada en la **semana**, no en una lista de reportes (una persona escribe un reporte por semana y proceso, no
decenas):

```
┌ PageHeader ────────────────────────────────────────────────────────────┐
│ Reporte semanal                                                              │
│ El resumen de tu semana: resultados, bloqueos, compromisos y decisiones.    │
│ ▸ ¿Para qué sirve el reporte semanal?                                        │
├ Tabs ──────────────────────────────────────────────────────────────────┤
│ [Mi reporte]  [Equipo]                                                       │
├ Selector de semana ────────────────────────────────────────────────────┤
│ [‹]  Semana del 26 oct al 1 nov 2026 ▾  [›]   [Esta semana]   Proceso [BI▾] │
├ Cabecera del reporte ──────────────────────────────────────────────────┤
│ [Borrador]  3 de 5 secciones completas ▓▓▓▓▓░░░   Guardado hace 2 min        │
├──────────────────────────────────────────────┬─────────────────────────────┤
│ SECCIONES (max-w-[720px])                    │ RESPALDO DE LA SEMANA       │
│  Resultados            [Traer de la bitácora]│ 3 diarios · 7 act. · 17 h   │
│  ¿Qué va aquí? …ejemplo                      │ ▇▇▇▇ por clasificación      │
│  [ textarea ]                                │ L M X J V   días enviados   │
│  …                                           │ ⚠ Faltan por enviar: mié 4  │
│                                              │ [Ver en la bitácora]        │
│                          [Guardar] [Enviar]  │ (sticky)                    │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

Por debajo de `xl` el panel «Respaldo de la semana» pasa **arriba** de las secciones como franja compacta
(colapsable con `<details>`).

Si no existe aún el reporte de esa semana y proceso: tarjeta con `EmptyState` «Aún no empiezas el reporte de esta
semana» y un único botón **«Crear el reporte de la semana»** (un clic, sin diálogo). Debajo, el panel de respaldo
ya se ve, para que el usuario sepa con qué cuenta.

Debajo del editor, `Section` **«Reportes anteriores»**: tabla paginada compacta (semana, proceso, estado, enviado
el) con enlace a cada semana.

### 4.5 Reporte semanal: *Equipo* — cumplimiento

```
 Semana del 26 oct al 1 nov 2026   [‹][Esta semana][›]   Proceso [Todos▾]     [Cumplimiento | Historial]
 StatStrip: Esperados 6 │ Enviados 3 │ En borrador 2 │ Sin crear 1
 ┌ Persona ────────┬ Proceso ┬ Estado     ┬ Diarios (L–V) ┬ Horas ┬ Secciones ┬ Enviado el ┐
 │ (AP) Ana Pérez  │ BI      │ ● Enviado  │ ● ● ● ● ●     │ 38 h  │ 5/5       │ vie 17:02  │
 │ (LM) Luis Mora  │ BI      │ ✎ Borrador │ ● ● — — —     │ 13 h  │ 2/5       │ —          │
 │ (JR) Julia Ríos │ Integ.  │ — Sin crear│ — — — — —     │ 0 h   │ —         │ —          │
 └─────────────────┴─────────┴────────────┴───────────────┴───────┴───────────┴────────────┘
```

«Historial» es la tabla paginada con los filtros (rango de semanas, persona, proceso, estado, texto). Clic en una
fila abre el `Sheet` con el reporte en solo lectura, su respaldo y —en fase 2— «Marcar como revisado» / «Devolver».

---

## 5. Especificación por componente

Convención: clases Tailwind con **tokens semánticos**; `text-meta` = 13/18 px.

### 5.1 `PageHeader` y ayuda inicial

- Título «Bitácora» (acción primaria **«Registrar hoy»**, botón primario; secundaria **«Otro día»**, `outline`, que
  abre el diálogo de diario).
- Descripción de una línea: «Lo que hiciste cada día y cuánto tiempo le dedicaste. La ven tu líder y tu jefatura.»
  (la frase sobre horas y avance de tareas sale de la descripción y pasa a la ayuda y al panel).
- Debajo, `<details>` «¿Para qué sirve la bitácora?» con el patrón de `PriorityLegend`
  (`text-meta text-muted-foreground`, `summary` con `focus-visible:outline-ring`). **Abierto la primera vez** (clave
  `localStorage` `bitacora:ayuda-vista`) y replegado después. Contenido en la sección 8.1.
- En móvil «Registrar hoy» ocupa el ancho completo bajo la descripción; «Otro día» pasa al menú «⋯» de la barra.

### 5.2 Pestañas y modo de equipo

`Tabs` con `TabsList` en `overflow-x-auto`. Cada pestaña `h-9` (como el componente). La pestaña activa usa
`border-primary text-foreground`. Etiquetas con contador solo en *Equipo*: «Equipo · 7 por revisar» (`text-meta`,
nunca solo color). El interruptor «Lista · Cobertura» es `SegmentedRadio` con `aria-label="Vista del equipo"`.

### 5.3 `Toolbar` de filtros

- `Toolbar label="Filtros de la bitácora" collapseOnMobile`. Primer hijo: `SearchInput`
  (`id="bit-q"`, `placeholder="Notas, actividades, personas…"`, etiqueta visible «Buscar»).
- Cada filtro lleva `Label` visible encima y `w-full sm:w-auto`; anchos: rango `sm:w-48`, persona `sm:w-56`,
  proceso `sm:w-44`, estado `sm:w-40`, clasificación `sm:w-44`.
- `end`: `ResultCount` (`aria-live="polite"`: «12 de 87 diarios») y «Limpiar filtros» (`Button variant="ghost"
  size="sm"`, solo cuando hay filtros que no son los predeterminados).
- Con «Personalizado» aparecen dos `Input type="date"` con etiquetas «Desde» / «Hasta» (`sm:w-40`); `hasta` no
  puede ser anterior a `desde` (error `Field`: «La fecha final no puede ser anterior a la inicial.»).

### 5.4 `FilterChips`

```
<ul aria-label="Filtros aplicados" className="flex flex-wrap gap-2">
  <li> <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-3 pr-1 text-meta text-foreground">
         Estado: Enviado
         <button aria-label="Quitar filtro Estado: Enviado"
                 className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
           <X aria-hidden className="size-3.5" />
         </button></span></li>
```

El chip del valor predeterminado lleva `bg-transparent border border-dashed border-border-strong` y el texto
«(predeterminado)»; no tiene botón de quitar (se cambia desde su `Select`). Si no hay chips, el `<ul>` no se
renderiza (no se reserva hueco).

### 5.5 Tabla de diarios

- Contenedor: tarjeta flotante estándar (`bg-card rounded-xl shadow-card`, borde de baja opacidad). Con
  `Table scrollLabel="Tabla de diarios"`, `TableCaption` `sr-only` («Diarios del equipo, ordenados por fecha de
  forma descendente») que se actualiza con el orden.
- Cabeceras: `SortableTableHead` con `aria-sort`. Las no ordenables (Actividades, Distribución, Notas) son
  `TableHead` simples.
- Fila: `h-12` (≈ 48 px, objetivo táctil ≥ 44 px), `hover:bg-muted/40`, separadores sutiles. Fila abierta en el
  panel: `bg-primary-subtle` + barra izquierda de 2 px `bg-primary` + `aria-current="true"`.
- Celda **Fecha**: `CellTitle` (botón) con `id="diario-row-<id>"` (destino del foco al cerrar el panel).
  Texto `text-sm font-medium`; el día de la semana en minúscula («lun») y la fecha; si es hoy o ayer, `Badge
  variant="info"` «Hoy»/«Ayer».
- Celda **Persona**: `PersonAvatar` + nombre (`truncate`, `max-w-[14rem]`).
- Celda **Estado**: `StatusBadge kind="log"`; «Devuelto» (valor derivado) = `warning` con icono `Undo2`.
- Celda **Notas**: `truncate text-muted-foreground max-w-[18rem]`, `title` con el texto completo.
- Estados de fila: sin `onClick` en Notas largas; el clic en cualquier punto abre el panel salvo texto
  seleccionado (`window.getSelection()?.toString()` vacío).

### 5.6 Tarjetas móviles (< 768 px)

`DataCardList label="Diarios"` con:
- `title`: `CellTitle touch` con «lun 2 nov 2026»;
- `subtitle`: «Ana Pérez · BI» (en *Mis diarios* solo el proceso);
- `badges`: `[StatusBadge]` y, si hay, el chip «Hoy»;
- `meta`: `Actividades`, `Horas`;
- `note`: `ClassificationBar` (ancho completo, `h-2`) y la vista previa de notas a 2 líneas.
Ordenar: `DataCardSort` (Fecha, Persona, Horas, Estado). Paginación idéntica a la de tabla, con tamaño por defecto
**25**.

### 5.7 `PersonAvatar`

`inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-meta font-semibold
text-link` con las iniciales (máx. 2) y `aria-hidden`; el nombre va al lado como texto. Contraste `text-link` sobre
`primary-subtle`: 4,98:1 (claro) y 5,99:1 (oscuro). Para sustituir un avatar roto no se usa imagen.

### 5.8 `ClassificationBar` (minidistribución)

```
<div role="img" aria-label="Planificada 3 h, Soporte 2 h, Interna 1 h"
     className="flex h-2 w-24 gap-px overflow-hidden rounded-full bg-muted">
  <span className="bg-info"    style={{ width: '50%' }} />   // Planificada
  <span className="bg-success" style={{ width: '33%' }} />   // Soporte
  <span className="bg-neutral" style={{ width: '17%' }} />   // Interna
  <span className="bg-warning" style={{ width: '…%' }} />    // Extraordinaria
</div>
```

- Ancho proporcional a las **horas** (si el diario tiene 0 h, a la cantidad de actividades; un segmento con valor
  mínimo del 8 % para que se vea). Se envuelve en `Tooltip` con el mismo texto del `aria-label`.
- El color nunca es el único portador: el texto (`aria-label`, tooltip y la leyenda del panel) y, en el panel, el
  icono del tipo. Los tonos distinguen tipos; el único con carga semántica es *Extraordinaria* (`warning`, pide
  atención). Son tonos de categoría, no de «bueno/malo».
- Contraste del segmento contra la tarjeta (≥ 3:1 exigido): ver tabla 12.2.

### 5.9 Panel `Sheet` (cabecera, cuerpo y pie)

- `SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl"` con `bg-card`. Cabecera sticky
  (`border-b`), cuerpo `overflow-y-auto`, pie sticky (`border-t bg-card/95 backdrop-blur`) con
  `pb-[max(0.75rem,env(safe-area-inset-bottom))]`.
- Cabecera: `‹` `›` (`Button variant="ghost" size="icon-sm"`, `aria-label="Diario anterior de la lista"` /
  `"Diario siguiente de la lista"`; se deshabilitan en los extremos del **resultado filtrado de la página
  actual** y recorren solo la página cargada), título `h2` con la fecha larga (`text-lg font-semibold`,
  `tabIndex={-1}`, recibe el foco al abrir), `StatusBadge`, y bajo el título persona + proceso + n.º de
  actividades + horas (`text-meta text-muted-foreground`).
- Bloque **Notas del día**: `Section` con botón «Editar» (`variant="ghost" size="sm"`, icono lápiz) que cambia la
  nota a un `Textarea` en el mismo lugar con «Guardar» y «Cancelar». Vacío para el autor: enlace-botón «Añadir
  una nota del día (opcional)». Vacío para otros: no se muestra el bloque.
- Bloque **Dedicación**: número `text-2xl font-semibold tabular-nums` + `ClassificationBar` a ancho completo
  (`h-2.5`) + leyenda en lista (icono + nombre + horas + porcentaje). Una sola línea de ayuda: «Es dedicación: no
  cambia el avance de las tareas.» (`text-meta`), con enlace «Actualizar avance en Mi trabajo» (`text-link`) solo
  para el autor.
- Aviso de exceso: si `totalHours > 12` se muestra `InlineNotice tone="warning"` «Registraste 14 h en un día.
  Revisa que sea correcto.» (aviso, no bloqueo; el máximo duro es 24 h por actividad, H8).

### 5.10 Banners de estado y acciones por rol

| Estado / quién mira | Banner (`InlineNotice`) | Acciones del pie |
| --- | --- | --- |
| **Borrador**, autor | Ninguno (si es nuevo sin actividades, `EmptyState` del bloque) | `Eliminar` · `Enviar a revisión` (primaria) |
| **Devuelto**, autor | `tone="warning"`: «Tu jefatura devolvió este diario el 3 nov, 9:40: «motivo». Corrígelo y vuelve a enviarlo.» | `Eliminar` · `Enviar a revisión` |
| **Enviado**, autor | `tone="neutral"`: «Enviado a revisión el 2 nov, 17:40. Mientras lo revisan no se puede editar. Si fue un error, retira el envío.» | `Retirar envío` (`outline`) |
| **Enviado**, revisor | `tone="info"`: «Esperando tu revisión.» | `Devolver con motivo` (`outline`) · `Marcar como revisado` (primaria) |
| **Revisado**, todos | `tone="success"`: «Revisado por Luis Mora el 3 nov, 10:12. Ya no se puede modificar.» | ninguna |
| **Enviado/Revisado/Borrador**, otro rol sin permisos | Solo estado | ninguna |

- Los botones **salen de las banderas `actions`** de la API (`edit`, `delete`, `submit`, `recall`, `review`,
  `return`): la interfaz no recalcula permisos.
- `Marcar como revisado` pide confirmación **solo** si el diario tiene 0 actividades o 0 horas
  (`ConfirmDialog`: «Este diario no tiene actividades. ¿Marcarlo como revisado de todos modos?»); en el caso normal
  es un clic y un toast, para que revisar 20 diarios sea rápido.
- `Devolver con motivo` abre `ReasonDialog` (`fieldId="devolver-reason"`, título «Devolver el diario a Ana
  Pérez», descripción «Ana recibirá una notificación y podrá corregir y volver a enviar», campo «Motivo» obligatorio
  de 10 a 1000 caracteres, `confirmLabel="Devolver diario"`, `tone="default"`).
- Tras revisar o devolver, el foco pasa al `h2` del panel y, si el revisor llegó por «siguiente», **avanza al
  siguiente diario «Enviado»** de la página (opcional, activable con la casilla «Pasar al siguiente por revisar»
  recordada en `localStorage`).

### 5.11 Actividades: fila expandible

Cada actividad es un `li` dentro de `<ul aria-label="Actividades del diario">` con una tarjeta
`rounded-lg border bg-card` (no una tabla: el contenido es heterogéneo y un panel de 672 px no alberga 8 columnas).

Fila cerrada (`min-h-14`):

```
[▸]  [◔ Planificada]  Construir el modelo de datos de ventas        ·  Proyecto BI Ventas    3 h   [⋯]
     (Badge+icono)    (descripción, line-clamp-2)                      (referencia, text-meta)
```

- Botón de disclosure: el título/descripción es un `<button aria-expanded aria-controls>` ocupando la fila.
- **Referencia** según la clasificación: Planificada → «Proyecto X · Tarea Y»; Soporte → «Activo: nombre»;
  Extraordinaria → «Pidió: nombre»; Interna → nada. En <640 px la referencia baja a una segunda línea.
- Insignia de tipo: `Badge` con icono (`CalendarCheck` planificada `info`, `LifeBuoy` soporte `success`,
  `Building2` interna `neutral`, `Zap` extraordinaria `warning`). Etiqueta siempre visible.
- Si `activityStatus = BLOQUEADA`: chip `danger` «Bloqueada» junto al tipo (es la señal que alimenta las
  sugerencias del semanal).
- Menú `RowActions menuOnly` (Editar · Eliminar) solo cuando `actions.edit` es verdadero.

Fila abierta: `DescriptionList` en dos columnas desde 520 px, sin los campos vacíos:

| Campo | Presentación |
| --- | --- |
| Descripción completa | texto con `whitespace-pre-wrap` |
| Referencia completa | proyecto, tarea, activo, solicitante según tipo |
| Justificación | solo extraordinaria |
| Resultado | texto |
| Evidencia | si es URL válida: enlace `text-link` con `target="_blank" rel="noopener noreferrer"` e icono `ExternalLink` (`aria-label="Abrir evidencia (se abre en otra pestaña)"`); si no, texto |
| Novedad relacionada | título (enlace a `/seguimiento/novedades`) + `StatusBadge` del estado de la novedad |
| Estado de la actividad | badge: En curso (`info`), Terminada (`success`), Bloqueada (`danger`) |
| Próximo paso | texto + «para el vie 6 nov» |

**Densidad con muchas actividades:** por defecto todas cerradas salvo cuando hay una sola (abierta). Con 4 o más
aparece «Expandir todo / Contraer todo» (botón `ghost sm`, `aria-pressed`). Con más de 15 actividades se agrupan
por tipo con subtítulo (`h4`: «Soporte · 5 · 7 h») para escanear.

Pie de la lista: línea de totales «6 actividades · 14 h» (`aria-live="polite"`).

### 5.12 Formulario de actividad (diálogo, `size="md"`)

Se reordena para que lo obligatorio quede arriba y lo opcional plegado. Dos bloques:

1. **Qué hiciste** (visible siempre)
   - **Clasificación** como `RadioCards` 2×2 (en <480 px una columna). Cada tarjeta: icono, nombre, una frase de
     qué es y **un ejemplo** (sección 8.2), y un texto pequeño «Requiere: …». La ayuda deja de estar oculta tras un
     `Select`.
   - Campos condicionados (igual que hoy, con los mismos mensajes), pero con `Field help` que dice *por qué* se
     pide: p. ej. Activo → «Así sabemos qué servicio se atendió y podemos medir el soporte por activo.».
   - **Descripción** (`Textarea`, 3 filas, `maxLength` 2000, contador `text-meta` solo desde 1 800).
   - **Horas** con `Input type="number"` y atajos `1 h · 2 h · 4 h · 8 h` (chips `Button variant="outline"
     size="sm"`, `aria-label="Poner 2 horas"`); ayuda: «Dedicación, no avance de tarea.»
2. **Más detalle (opcional)** — `<details>` (cerrado al crear; abierto al editar si hay algún dato):
   Resultado, Evidencia (URL), Novedad relacionada, Estado de la actividad (`Select`: En curso / Terminada /
   Bloqueada), Próximo paso, Fecha del próximo paso.

Reglas del formulario:
- Validación sin cambios (cliente solo UX, backend autoritativo) y el foco al primer campo con error.
- **Guardar** `Ctrl/⌘ + Enter` (indicado como `kbd` en el tooltip del botón). Al crear, el botón secundario
  **«Guardar y agregar otra»** conserva clasificación y deja el foco en Descripción: es la forma rápida de
  registrar varias actividades seguidas.
- Proyecto / Tarea: `Select` con la opción «Sin …» y, para las tareas, el texto «Tarea — Proyecto». Con más de
  ~50 opciones se agrega búsqueda (P2, H14); no se bloquea la entrega.

### 5.13 Componentes nuevos y su alcance

| Componente | Ubicación sugerida | Responsabilidad |
| --- | --- | --- |
| `PersonAvatar` | `components/person-avatar.tsx` | Iniciales + nombre accesible. |
| `ClassificationBar` | `components/classification-bar.tsx` | Minibarra + etiqueta accesible. Datos: `[{code, hours, count}]`. |
| `DateRangeSelect` | `components/date-range-select.tsx` | Atajos de rango + personalizado; devuelve `{rango, desde, hasta}`. |
| `FilterChips` | `components/filter-chips.tsx` | Lista de chips con quitar. |
| `useUrlFilters` | `lib/use-url-filters.ts` | Lee/escribe parámetros con `router.replace`, valida y normaliza. |
| `CoverageGrid` | `app/seguimiento/bitacora/coverage-grid.tsx` | Cuadrícula persona × día. |
| `ActivityRow` | `app/seguimiento/bitacora/activity-row.tsx` | Fila expandible. |
| `TimelineList` | `components/timeline-list.tsx` | Línea de tiempo vertical (la reutiliza el historial de tareas si se desea). |
| Helper `formatDateOnlyWithWeekday` | `lib/format.ts` | Mismo tratamiento UTC de `formatDateOnly` (evita el desfase de un día). |

### 5.14 Línea de tiempo (`TimelineList`)

`<ol aria-label="Historial del diario" className="relative flex flex-col gap-4 border-l pl-5">`. Cada `li`: punto de
10 px (`absolute -left-[1.6rem] size-2.5 rounded-full`) con el tono del hito (`bg-border-strong` creado,
`bg-info` enviado, `bg-warning` devuelto, `bg-success` revisado), título («Enviado»), persona, fecha-hora
(`<time dateTime>` con `formatDateTime`) y, si es devolución, el motivo en cita (`blockquote border-l-2
border-warning pl-3 text-sm`). El tono no sustituye al texto: cada hito dice su nombre. Hitos del primer MVP:
*Creado, Enviado, Devuelto (el último), Revisado*; historial completo de ciclos en fase 2 (endpoint de historial
sobre auditoría, patrón de `GET /tasks/{id}/history`).

### 5.15 «Registrar hoy», «Otro día» y duplicados

**Registrar hoy** (acción primaria):
1. Calcula `hoy = localDateInputValue()`.
2. Si la persona tiene **un solo proceso**, consulta si ya existe (`GET /worklog/daily?scope=mine&desde=hoy&hasta=hoy&proceso=…&pageSize=1`).
   - Existe → abre su panel y muestra toast informativo: «Ya tenías un diario de hoy; lo abrimos para que sigas.»
   - No existe → `POST /worklog/daily` (sin notas), abre el panel y enfoca «Agregar actividad».
3. Con **varios procesos**, abre un diálogo breve «¿Para qué proceso?» con `RadioCards` (proceso recordado desde
   `localStorage` `bitacora:ultimo-proceso`, preseleccionado). Los procesos con diario de hoy llevan la etiqueta
   «Ya existe» y su botón dice «Abrir».
4. Si falla la creación: toast de error y el botón vuelve a habilitarse (sin estado a medias).

**Otro día** (secundaria): el diálogo existente, con tres mejoras: proceso **preseleccionado** si solo hay uno o
el último usado; fecha por defecto = hoy (máx. = hoy, `max` del input; no se permiten fechas futuras en la
primera entrega, regla a confirmar con el dueño); y **verificación de duplicado en vivo**: al cambiar proceso o
fecha consulta el servidor y, si existe, muestra `InlineNotice tone="warning"` «Ya tienes un diario del lun 2 nov
en BI.» con botón **«Abrir ese diario»**, y el botón principal cambia a «Abrir diario». Si aun así se llega al
409, la API devuelve `existingId` y la pantalla abre ese diario en lugar de mostrar el error genérico (H9).

**Copiar del día anterior** (P1): en el estado vacío de actividades y en el menú «⋯» del panel: botón «Copiar
actividades de otro día». Abre un `Select` con los últimos 10 diarios propios del mismo proceso (el más reciente
preseleccionado) y una vista previa (`n` actividades, horas). Copia clasificación, referencias, descripción y horas;
**no** copia resultado, evidencia, estado ni próximo paso. Es una sola llamada atómica a la API (sección 14).

**Atajos** (documentados en un `Tooltip` y en la ayuda; ninguno es el único camino):
`N` = nueva actividad (cuando el foco no está en un campo y el panel está abierto), `Ctrl/⌘ + Enter` = guardar en
el diálogo de actividad, `Esc` = cerrar panel o diálogo. No se usa `Alt + ←/→` (choca con el historial del
navegador).

**Guardado:** cada acción guarda explícitamente y confirma con toast; el panel muestra «Última modificación: hace 5
min» (`updatedAt`, `<time>`). No hay autoguardado en diarios (cada actividad ya se guarda sola al agregarla).

**Solo lectura:** un diario Enviado o Revisado muestra siempre el banner con el motivo (5.10); los botones no
aparecen en vez de quedar deshabilitados sin explicación.

---

## 6. Reglas del flujo de revisión

Estados persistidos: `BORRADOR`, `ENVIADO`, `REVISADO`. «Devuelto» **no es un estado nuevo**: es `BORRADOR` con
una devolución vigente (campo derivado `returned`, sección 14.1). Así no se rompe la consolidación ni la máquina
de estados existente.

```
BORRADOR ──enviar──▶ ENVIADO ──revisar──▶ REVISADO
   ▲                    │
   ├────── devolver ────┘   (con motivo, notifica al autor)
   └────── retirar envío ───┘   (solo el autor, mientras siga ENVIADO)
```

| Transición | Quién | Condiciones | Efecto |
| --- | --- | --- | --- |
| BORRADOR → ENVIADO | Autor | — | `submittedAt = ahora`. Igual que hoy. |
| ENVIADO → REVISADO | Jefe de área o líder del proceso; **no el autor** | El diario es de su alcance | `reviewedAt`, `reviewedByUserId`. |
| ENVIADO → BORRADOR («Devolver») | Jefe o líder; **no el autor** | Motivo de 10 a 1000 caracteres; el semanal del autor+proceso+semana **no** está Enviado/Revisado | `returnedAt`, `returnedByUserId`, `returnReason`; notificación `DAILY_LOG_RETURNED` al autor. |
| ENVIADO → BORRADOR («Retirar envío») | Autor | Aún no revisado; mismo control del semanal | Limpia nada (conserva `submittedAt`). |
| REVISADO → cualquier otro | Nadie | — | Es terminal. |

Casos límite:
- **Semanal ya enviado:** devolver o retirar un diario cuya semana ya consolidó un semanal Enviado/Revisado cambiaría
  el consolidado a posteriori. La API responde **409** «Primero devuelve el reporte semanal de esa semana.» y la
  interfaz lo muestra en el diálogo.
- **El jefe es el autor:** no puede revisarse a sí mismo. Con otro jefe o con el líder del proceso sí. Si es el único
  jefe, su diario queda en *Enviado* (estado final aceptable); se anota como pregunta abierta (sección 15).
- **El líder escribe su propio diario:** lo revisa el jefe; en *Equipo* sus filas se ven normales, y el botón
  «Marcar como revisado» no aparece para él.
- **Editar tras devolver:** vuelve a ser editable por el autor; los datos anteriores se conservan. Al reenviar,
  `submittedAt` se actualiza; el hito «Devuelto» sigue en la línea de tiempo como antecedente.
- **Reenvío vs. devolución simultánea:** la API usa actualización condicional por estado (`status = ENVIADO`); si
  dos revisores actúan a la vez, el segundo recibe 409 «Este diario ya fue revisado o devuelto.» y la interfaz
  recarga el panel.
- **Eliminar:** solo el autor y solo en Borrador (incluido Devuelto). Un Enviado/Revisado nunca se elimina.
- **Notificación:** al autor cuando le devuelven; la campana enlaza a `/seguimiento/bitacora?diario=<id>`. No se
  notifica el envío ni la revisión (evita ruido); el revisor se guía por «Por revisar».
- **Nada de esto cambia tareas, solicitudes, aprobaciones ni compromisos** (BR-013/023 se mantienen).

---

## 7. Reporte semanal: reglas de interacción

### 7.1 Selector de semana

- Control compuesto: `[‹]` botón «Semana anterior», un `Select` central con las últimas 12 semanas
  («26 oct – 1 nov 2026 · actual») y `[›]` «Semana siguiente» (deshabilitado en la semana actual), más el botón
  «Esta semana».
- Rótulo siempre con **rango completo** («Semana del 26 oct al 1 nov 2026»), nunca solo «lunes».
- Parámetros de URL: `?semana=2026-10-26&proceso=<uuid>&vista=mi|equipo`. La fecha se normaliza al lunes en el
  cliente (el usuario nunca ve la regla del lunes; H13).
- Cambiar de semana con cambios sin guardar pide confirmación («Tienes cambios sin guardar. ¿Descartarlos?»).

### 7.2 Editor de secciones

Cinco `Field`, cada uno con: etiqueta, **línea «¿Qué va aquí?»** (`text-meta text-muted-foreground`, sección 8.3),
`Textarea` de 5 filas (`min-h-28`, fondo `bg-card` con borde `border-input` para que parezca editable; el fondo
`bg-muted` actual induce a creerlo deshabilitado), placeholder con ejemplo y contador `n / 5000` desde 4 500.

- **Avance de llenado:** «3 de 5 secciones completas» con barra `role="progressbar"`
  (`aria-valuemin=0 aria-valuemax=5 aria-valuenow=3 aria-label="Secciones completas del reporte"`,
  `h-2 rounded-full bg-muted` con relleno `bg-primary`). Una sección cuenta si tiene texto no vacío. **No bloquea
  el envío**: al enviar con secciones vacías el diálogo avisa «Quedan sin completar: Bloqueos, Decisiones. Si no
  aplican, escribe «Ninguno».»
- **Guardado:** botón «Guardar» (`Ctrl/⌘ + S`), indicador «Cambios sin guardar» (punto `bg-warning` + texto) y
  «Guardado hace 2 min». `beforeunload` solo con cambios pendientes. Autoguardado: fase 3.
- **Sugerencias desde la bitácora:** botón «Traer de la bitácora» (`variant="outline" size="sm"`, icono
  `Sparkles` no se usa para no confundir con la IA; icono `NotebookPen`) en *Resultados*, *Bloqueos* y
  *Compromisos de la próxima semana*. Abre un diálogo con casillas agrupadas:
  - Resultados: el campo `result` de cada actividad con texto («lun 2 nov · Modelo de ventas: tablero publicado»).
  - Bloqueos: actividades con estado «Bloqueada» y novedades relacionadas aún abiertas.
  - Compromisos: `nextStep` de las actividades con su fecha («Entregar inventarios — mié 4 nov»).
  Acción «Agregar seleccionadas»: **añade al final** del texto actual como viñetas `• …`, nunca reemplaza. Si no hay
  nada que sugerir: «No hay resultados, bloqueos ni próximos pasos en los diarios de esta semana. Agrégalos al
  registrar tus actividades.»
- **Reglas de solo lectura:** Enviado/Revisado se muestra con `DescriptionList` (como hoy), con banner de estado y
  motivo (misma lógica de 5.10).

### 7.3 Panel «Respaldo de la semana»

- Consolidado: Diarios · Actividades · Dedicación · Extraordinarias (`StatStrip` vertical en `xl`, 2×2 en menos) y
  la `ClassificationBar` con leyenda.
- **Cinco píldoras L-M-X-J-V** (cada una con `aria-label` «lunes 26 oct: enviado, 7 h»): `Revisado`, `Enviado`,
  `Borrador`, `Devuelto`, `Sin registro`. Clic en una con diario lleva a la bitácora en ese día (`/seguimiento/bitacora?rango=personalizado&desde=…&hasta=…&diario=<id>`).
- Aviso: `InlineNotice tone="warning"` **«Faltan por enviar 2 diarios: mié 4 nov y jue 5 nov. El consolidado solo
  cuenta diarios enviados o revisados.»** con botón «Ver en la bitácora». Si además hay días hábiles sin diario:
  «No registraste actividad el lun 2 nov.» en `tone="neutral"`.
- Si no hay respaldo: «Sin bitácoras de respaldo esta semana» con enlace «Registrar hoy».

### 7.4 Cumplimiento del equipo (jefe/líder)

KPI: **Esperados · Enviados · En borrador · Sin crear**. «Esperado» = persona con rol activo (integrante o líder) en
un proceso del alcance. Columnas: Persona, Proceso, Estado del reporte (`StatusBadge`; «Sin crear» como badge
`neutral` con icono), Diarios L-V (cinco píldoras), Horas, Secciones completas (n/5), Enviado el.
Ordenado por defecto: primero quienes **faltan** (Sin crear, Borrador), luego Enviados. Filtros: semana, proceso,
persona, estado. Clic en fila: panel con el reporte, su respaldo y, en fase 2, revisión/devolución con las mismas
reglas y componentes que el diario.

---

## 8. Textos y descripciones

Todo en español con tildes y en tono cercano, sin tecnicismos.

### 8.1 Ayuda de la bitácora («¿Para qué sirve la bitácora?»)

> **Qué es.** Tu registro del día: qué hiciste, de qué tipo fue y cuántas horas le dedicaste. Se hace un diario por
> proceso y por día.
> **Para qué sirve.** Tu líder y tu jefatura ven en qué se invierte el tiempo del equipo, y tu reporte semanal se
> arma con lo que registras aquí.
> **Quién la ve.** Tú, el líder de tu proceso y la jefatura del área.
> **Cómo funciona.** Registras → *Envías a revisión* → tu líder o jefatura lo *revisa* o te lo *devuelve* con una
> observación para que lo corrijas.
> **Importante.** Las horas son dedicación. No cambian el avance de las tareas: para eso actualiza el % en
> *Mi trabajo*.

Para jefe y líder se añade una línea: «En la pestaña **Equipo** ves quién registró cada día y qué falta por
revisar.»

### 8.2 Clasificaciones

| Clasificación | Qué es | Ejemplo | Requiere |
| --- | --- | --- | --- |
| **Planificada** | Trabajo que avanza un proyecto o una tarea del plan. | «Construí el modelo de datos de ventas.» | Un proyecto o una tarea |
| **Soporte** | Atención de incidentes, consultas o mantenimiento sobre un activo o servicio. | «Reinicié la carga nocturna del data lake.» | El activo atendido |
| **Interna** | Trabajo del área que no pertenece a un proyecto: reuniones, capacitación, documentación, mejoras. | «Reunión semanal del equipo.» | Nada |
| **Extraordinaria** | Trabajo no previsto que alguien pidió y que desplazó lo planificado. | «Reporte urgente para gerencia.» | Quién lo pidió y por qué |

(Las frases de `CLASSIFICATIONS.hint` del código se sustituyen por estas.)

### 8.3 Secciones del reporte semanal («¿Qué va aquí?»)

| Sección | Qué va aquí | Ejemplo (placeholder) |
| --- | --- | --- |
| **Resultados** | Lo que lograste esta semana: entregables, hitos, cifras. | «Quedó publicado el tablero de ventas v2; lo validaron 3 usuarios.» |
| **Propuestas** | Ideas de mejora o cambios que sugieres. Son solo texto: no cambian prioridades ni crean compromisos. | «Automatizar la carga de inventarios para evitar el reproceso de los lunes.» |
| **Bloqueos** | Qué te impidió avanzar y qué necesitas para destrabarlo. Si se repite, regístralo en *Novedades*. | «Sin acceso al servidor de pruebas desde el martes; necesito que TI lo habilite.» |
| **Compromisos de la próxima semana** | Qué te comprometes a entregar la semana siguiente. Para compromisos formales con responsable y fecha usa *Reuniones y compromisos*. | «Entregar el modelo de datos de inventarios el miércoles.» |
| **Decisiones** | Decisiones tomadas o pendientes que afectan al equipo, y con quién. | «Se acordó con la jefatura posponer la migración a diciembre.» |

Línea común bajo las secciones: «Si una sección no aplica, escribe “Ninguno”.»

### 8.4 Otros textos

| Elemento | Texto |
| --- | --- |
| Horas (ayuda) | «Cuánto tiempo dedicaste. No cambia el avance de la tarea.» |
| Estados (tooltip/leyenda) | Borrador: «Aún lo estás escribiendo.» · Devuelto: «Tu jefatura pidió correcciones.» · Enviado: «Esperando revisión.» · Revisado: «Revisado; ya no se modifica.» |
| Confirmar envío | Título «¿Enviar el diario a revisión?». Descripción «Tu líder o jefatura lo revisará. Mientras tanto no podrás editarlo; si fue un error, puedes retirar el envío.» |
| Confirmar eliminación | «¿Eliminar el diario del lun 2 nov? Se borran sus 3 actividades y 6 h. Esta acción no se puede deshacer.» |
| Retirar envío | Título «¿Retirar el envío?». «Volverá a Borrador y podrás editarlo.» |
| Toast revisar | «Diario de Ana Pérez revisado.» |
| Toast devolver | «Diario devuelto. Ana Pérez recibirá una notificación.» |
| Toast duplicado | «Ya tenías un diario de hoy; lo abrimos para que sigas.» |

---

## 9. Estados de cada vista

| Vista | Cargando | Vacío | Sin resultados | Error | Éxito |
| --- | --- | --- | --- | --- | --- |
| **Mis diarios** (tabla) | `TableSkeleton` de 8 filas; `StatStrip` con `Skeleton`; `aria-busy` en el contenedor | `EmptyState` (icono `NotebookPen`): «Aún no has registrado tu primer diario» / «Anota lo que hiciste hoy y cuánto tiempo le dedicaste. Toma un par de minutos.» / acción **Registrar hoy** | `EmptyState compact` dentro de la tarjeta: «No hay diarios con estos filtros» / «Prueba con otro rango de fechas o quita algún filtro.» / **Limpiar filtros** | `ErrorState` dentro de la tarjeta: «No fue posible cargar la bitácora.» + causa + **Reintentar**. El KPI falla aparte: tiles con «—» y pista «No se pudo calcular», la tabla sigue funcionando | Tabla; toast tras cada acción |
| **Equipo** (lista) | igual | «Nadie del equipo ha registrado actividad en este periodo.» / «Cuando tu equipo registre diarios, aparecerán aquí.» | igual que arriba | igual | — |
| **Equipo** (cobertura) | cuadrícula de `Skeleton` 6×7 | «No hay personas asignadas a tus procesos.» / «Pide a la administración que asigne personas al proceso.» | — | `ErrorState` compacto con reintento | — |
| **Panel de diario** | Esqueleto de cabecera, bloque y 3 filas; el `h2` ya muestra la fecha si viene de la fila | «Aún no hay actividades en este diario.» / acciones **Agregar actividad** y **Copiar de otro día** (si es borrador del autor); si no, solo el texto | — | `ErrorState compact` con reintento; **404**: «Este diario ya no existe o no tienes acceso.» + botón «Cerrar» que borra `?diario` | Panel completo |
| **Mi reporte** | Esqueleto del editor y del respaldo | `EmptyState`: «Aún no empiezas el reporte de esta semana» / «Se llena con lo que pasó en la semana del 26 oct al 1 nov.» / **Crear el reporte de la semana** | — | `ErrorState` con reintento; el respaldo falla aparte («No se pudo cargar el respaldo de la semana» + reintento) | Editor + toast «Reporte guardado.» |
| **Cumplimiento** | filas `Skeleton` | «No hay personas esperadas para esta semana.» | filtros sin coincidencias: igual que arriba | `ErrorState` | — |
| **Sugerencias** | Esqueleto de lista en el diálogo | «No hay resultados, bloqueos ni próximos pasos en los diarios de esta semana.» | — | «No se pudieron traer las sugerencias.» + reintento (el editor sigue usable) | Casillas |

Reglas comunes: nunca se muestra un error técnico (se usan los mensajes de `WorklogError`); los errores 403 de
vistas de equipo reconducen a *Mis diarios* con un `InlineNotice`; la página conserva su estructura (cabecera,
pestañas) mientras carga.

---

## 10. Accesibilidad

- **Estructura:** un solo `h1` (título de la página); `h2` por sección (KPI no lleva título visible pero sí
  `aria-label`); el panel tiene su `h2` con el foco. Tablas con `<caption>`, `scope="col"/"row"` y `aria-sort`.
- **Teclado:** todo se opera sin ratón. Orden de tabulación: ayuda → pestañas → filtros → chips → tabla → paginación.
  `Tabs` con flechas (Radix). Cada fila abre el panel con `Enter` o `Espacio` en su botón de fecha; las filas no son
  trampas de foco.
- **Foco del panel:** al abrir, el foco va al `h2` (`onOpenAutoFocus`); `Tab` queda atrapado en el panel (Radix);
  `Esc` cierra y el foco vuelve al botón de la fila (`#diario-row-<id>`) con `onCloseAutoFocus` controlado; si la
  fila ya no existe (se eliminó), vuelve al `h2` de la lista. Los diálogos abiertos desde el panel devuelven el
  foco a su botón de origen dentro del panel.
- **Tras acciones:** al enviar, retirar, revisar o devolver (el botón pulsado desaparece) el foco pasa al `h2` del
  panel; al eliminar una actividad, a la siguiente o al encabezado «Actividades» (comportamiento actual, se
  mantiene).
- **Anuncios:** `ResultCount` y el total de horas con `aria-live="polite"`; los toasts de `sonner` son `role=status`;
  el cambio de filtros anuncia «12 diarios» sin mover el foco; los errores de formulario llevan `aria-invalid` y
  `aria-describedby` (como ya hace `Field`).
- **Cobertura:** `<table>` con `<th scope="row">` por persona y `<th scope="col">` por día (con `abbr` o texto
  `sr-only` «lunes 2 de noviembre»). Cada celda-botón: `aria-label="Ana Pérez, lunes 2 de noviembre: Enviado, 6
  horas"`. La leyenda es texto visible, no solo color.
- **Barras y avatares:** `ClassificationBar` con `role="img"` y descripción textual; `PersonAvatar` `aria-hidden`
  (el nombre está al lado). Iconos decorativos `aria-hidden`.
- **Color y significado:** todo estado lleva etiqueta e icono (`StatusBadge`), nunca solo color.
- **Objetivos táctiles ≥ 44 px** en filas, celdas de cobertura y botones de icono en móvil; foco visible con `--ring`
  (`focus-visible:outline-2 outline-ring`).
- **Movimiento:** transiciones del `Sheet` y del chevron con `motion-reduce:transition-none`.
- **Cumplimiento WCAG:** esta especificación aplica criterios AA y mide contrastes, pero la conformidad total exige
  pruebas manuales con lector de pantalla y revisión de un experto en accesibilidad.

---

## 11. Modo oscuro (Dark Tech)

Los componentes usan solo tokens, de modo que el cambio de tema es automático. Puntos a verificar al implementar:
`bg-primary-subtle` de la fila abierta (en oscuro es azul profundo `oklch(0.31 0.09 262)`; `text-link` cian lo
supera 5,99:1); los tonos translúcidos de las insignias sobre `--card` (medidos abajo); la minibarra, cuyo riel
`bg-muted` queda por encima de la tarjeta; los chips `bg-muted`; el banner `InlineNotice`. El borde de los campos
(`border-strong`) mide 3,51:1 sobre la tarjeta oscura (≥ 3:1). Capturas de aceptación en claro y oscuro a 375, 768,
1024 y 1280.

---

## 12. Contrastes medidos

### 12.1 Texto

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| `foreground` sobre `card` | 14,75:1 | 14,98:1 | 4,5:1 |
| `muted-foreground` sobre `card` | 7,13:1 | 7,62:1 | 4,5:1 |
| `muted-foreground` sobre `background` | 6,22:1 | 8,47:1 | 4,5:1 |
| `muted-foreground` sobre `muted` (chips, riel) | 5,72:1 | 6,95:1 | 4,5:1 |
| `foreground` sobre `muted` (texto del chip) | 11,83:1 | 13,67:1 | 4,5:1 |
| `muted-foreground` sobre `primary-subtle` (fila abierta) | 5,79:1 | 6,21:1 | 4,5:1 |
| `foreground` sobre `primary-subtle` | 11,97:1 | 12,20:1 | 4,5:1 |
| `text-link` sobre `card` | 6,14:1 | 7,35:1 | 4,5:1 |
| `text-link` sobre `background` | 5,36:1 | 8,17:1 | 4,5:1 |
| `text-link` sobre `primary-subtle` (iniciales, enlaces en fila abierta) | 4,98:1 | 5,99:1 | 4,5:1 |
| Texto de insignia `info` sobre `info/12` sobre card | 5,77:1 | 6,43:1 | 4,5:1 |
| Texto de insignia `success` sobre `success/12` | 5,62:1 | 7,17:1 | 4,5:1 |
| Texto de insignia `warning` sobre `warning/14` | 5,47:1 | 7,19:1 | 4,5:1 |
| Texto de insignia `danger` sobre `danger/12` | 5,40:1 | 5,95:1 | 4,5:1 |
| Texto de insignia `neutral` sobre `neutral/10` | 7,24:1 | 7,60:1 | 4,5:1 |
| `primary-foreground` sobre `primary` (botón) | 4,84:1 | 4,84:1 | 4,5:1 |

### 12.2 Elementos gráficos y bordes (mínimo 3:1)

| Elemento | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Segmento `info` sobre `card` | 6,91:1 | 8,17:1 | 3:1 |
| Segmento `success` | 6,74:1 | 9,19:1 | 3:1 |
| Segmento `warning` | 6,76:1 | 9,57:1 | 3:1 |
| Segmento `neutral` | 8,47:1 | 9,36:1 | 3:1 |
| `border-strong` (campos) sobre `card` | 3,64:1 | 3,51:1 | 3:1 |
| `border-strong` sobre `background` | 3,18:1 | 3,90:1 | 3:1 |
| Anillo de foco (`primary`) sobre `card` | 4,84:1 | 3,37:1 | 3:1 |
| Anillo de foco sobre `background` | 4,22:1 | 3,75:1 | 3:1 |

Todos los pares cumplen. El margen más estrecho es el anillo de foco en oscuro sobre tarjeta (3,37:1): no
aclarar la tarjeta oscura sin volver a medir. Los estados de la cuadrícula de cobertura reutilizan los pares de
insignia de 12.1 (misma composición `tono/12` sobre `card`).

---

## 13. Horas: ¿admitir fracciones?

**Estado actual:** `daily_log_activities.hours` es `Int` (`@default(0)`), validado con `@IsInt @Min(0)`, sin
máximo. Los consumidores son solo la bitácora, la consolidación semanal y la tool del MCP: **ningún** módulo de
capacidad, portafolio ni indicadores lee estas horas (verificado con búsqueda en `apps/api`, `apps/web` y
`apps/mcp`).

**Recomendación:** **admitir fracciones en pasos de 0,25 h** (15 minutos), en una **fase aparte**, no en esta
entrega. Motivos: la mayoría de las actividades de soporte duran menos de una hora, y con enteros la gente
redondea a 1 h, lo que infla el total; sumar 6 actividades de 15 min como «6 h» distorsiona el consolidado. En
contra: exige migración y cambia el contrato.

| Opción | Impacto | Veredicto |
| --- | --- | --- |
| Mantener entero | Cero cambios. Total inflado en actividades cortas. | Válida para esta entrega. |
| `Decimal(4,2)` en horas, paso 0,25 | Migración `Int → Decimal`; DTO `@IsNumber({maxDecimalPlaces:2})` y múltiplo de 0,25; Prisma devuelve `Decimal` (convertir a `number` en el mapeo); `reduce` y la consolidación suman decimales (redondear a 2); OpenAPI `number`; UI: `step=0.25`, `formatHours` con «1,5 h»; MCP y docs. | **Recomendada** si el dueño confirma que se registran actividades cortas. |
| Guardar **minutos** (`Int minutes`) y mostrar horas | Sin problemas de coma flotante; migración `hours*60`; contrato en minutos (cambio visible). | Alternativa más robusta, pero cambia la unidad del contrato y de todas las pantallas. |

Cualquiera de las dos debe ir **con un máximo de 24 h por actividad** (hoy no existe, H8) y un aviso suave por
encima de 12 h de total diario. Cambiar a decimal es compatible hacia atrás: los enteros existentes siguen siendo
válidos. **No se asume**: queda como decisión del dueño (sección 15).

---

## 14. Contrato de datos propuesto a la API

Marca: **[I]** imprescindible para la primera versión útil; **[F2]** segunda fase; **[F3]** opcional.
Convenciones: fechas `YYYY-MM-DD`, marcas de tiempo ISO, paginación `page/pageSize` base 1 con respuesta
`{ data, page, pageSize, total, hasMore }` (el patrón de `GET /audit-events`), `pageSize ≤ 100`. Todo con `@ApiProperty`
y `summary` en español (regla 55).

### 14.1 Diarios

**Cambio de esquema Prisma [I]** (`daily_logs`):

| Columna | Tipo | Nota |
| --- | --- | --- |
| `reviewed_at` | `timestamp?` | |
| `reviewed_by_user_id` | `uuid?` FK `users` `Restrict` | |
| `returned_at` | `timestamp?` | |
| `returned_by_user_id` | `uuid?` FK `users` `Restrict` | |
| `return_reason` | `text?` | 10 a 1000 caracteres, validado en DTO |

Índices nuevos: `(status, date)` para la cola de revisión. `activityStatus` en actividades se valida con `@IsIn(['EN_CURSO','TERMINADA','BLOQUEADA'])` [I]; los valores previos desconocidos se muestran tal cual en la UI.

**`GET /worklog/daily` — filtros y paginación [I]** (devuelve `PaginatedDailyLogsResponseDto`):

| Parámetro | Tipo | Notas |
| --- | --- | --- |
| `scope` | `mine` \| `team` | Defecto `mine`. `team` exige jefe o líder, si no 403. |
| `q` | string ≤ 100 | Notas, descripción/resultado/activo/solicitante de actividades y nombre del autor (`contains`, insensible a mayúsculas). |
| `from`, `to` | `YYYY-MM-DD` | Rango inclusivo. `to ≥ from`, si no 400. |
| `date` | `YYYY-MM-DD` | Se conserva por compatibilidad. |
| `processId`, `authorUserId` | uuid | Se intersectan con el alcance, nunca lo amplían. |
| `status` | `BORRADOR` \| `ENVIADO` \| `REVISADO` | |
| `returned` | boolean | `true` = borradores devueltos. |
| `classificationCode` | enum | Diarios con al menos una actividad de ese tipo. |
| `sort` | `date` \| `author` \| `hours` \| `status` | Defecto `date`. |
| `order` | `asc` \| `desc` | Defecto `desc`. Desempate estable por `id`. |
| `page`, `pageSize` | int | Defecto 1 y 25. |

**Cada elemento de la lista** (`DailyLogListItemDto`, **sin** actividades) **[I]**:

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id`, `date`, `status` | | |
| `authorUserId`, `authorName` | uuid, string | |
| `processId`, `processName` | uuid, string | |
| `activityCount` | int | |
| `totalHours` | number | |
| `byClassification` | `[{ classificationCode, count, hours }]` | Para la minibarra. Una sola consulta `groupBy` sobre los ids de la página. |
| `notesPreview` | string \| null | Primeros 160 caracteres de `dayNotes`. |
| `submittedAt`, `reviewedAt` | timestamp \| null | |
| `reviewedByName` | string \| null | |
| `returned` | boolean | `status = BORRADOR` y `returnedAt` no nulo y (`submittedAt` nulo o `returnedAt ≥ submittedAt`). |
| `updatedAt` | timestamp | |

**Detalle `GET /worklog/daily/{id}` — campos nuevos [I]:** `authorName`, `processName`, `reviewedAt`,
`reviewedByUserId`, `reviewedByName`, `returnedAt`, `returnedByUserId`, `returnedByName`, `returnReason`,
`returned`, y las banderas
`actions: { edit, delete, submit, recall, review, return }` (booleanas, calculadas por el servidor con el alcance y
el estado; la web las usa tal cual). Cada actividad añade **[I]**: `projectRequestTitle` (la solicitud directa o,
si falta, la del plan de la tarea), `taskTitle`, `relatedIssueTitle`, `relatedIssueState`.

**Endurecer la escritura [I]:** `dailyLogWriteWhere` devuelve siempre `{ authorUserId: actor.userId }` (H1). Cambio de
comportamiento visible: el jefe deja de poder editar/enviar/eliminar diarios ajenos. Actualizar pruebas existentes.

**Resumen `GET /worklog/summary` [I]** — mismos filtros que la lista excepto `status`, `returned`, `sort` y
paginación; mismo alcance:

```json
{ "dailyLogCount": 87, "totalHours": 412, "personCount": 6,
  "byStatus": { "BORRADOR": 5, "DEVUELTO": 1, "ENVIADO": 7, "REVISADO": 74 },
  "byClassification": [{ "classificationCode": "SOPORTE", "count": 40, "hours": 120 }] }
```

(`BORRADOR` excluye los devueltos; `DEVUELTO` los cuenta aparte.) `personCount` solo con `scope=team`.

**Acciones nuevas:**

| Método y ruta | Cuerpo | Efecto | Prio. |
| --- | --- | --- | --- |
| `POST /worklog/daily/{id}/review` | — | `ENVIADO → REVISADO`. 403/404 por alcance o si es el autor; 409 si no está `ENVIADO`. | **[I]** |
| `POST /worklog/daily/{id}/return` | `{ reason }` | `ENVIADO → BORRADOR` con `returned*`. Notifica `DAILY_LOG_RETURNED` (`NotificationService.notify`). 409 por estado o por semanal ya enviado. | **[I]** |
| `POST /worklog/daily/{id}/recall` | — | Autor: `ENVIADO → BORRADOR`. 409 si no es `ENVIADO` o por semanal ya enviado. | **[I]** |
| `POST /worklog/daily/{id}/activities/copy` | `{ sourceDailyLogId }` | Copia atómica de clasificación, referencias, descripción y horas desde un diario propio. Devuelve las actividades creadas. Solo en Borrador. | [F2] |
| `GET /worklog/daily/{id}/history` | — | Historial completo desde auditoría (patrón de `GET /tasks/{id}/history`). | [F2] |

Todas con transacción + `AuditEvent` (snapshot incluye los campos nuevos), actualización condicional por estado
para las carreras y mensajes de error en español. **Creación duplicada [I]:** el 409 devuelve
`{ message, existingId }` (H9).

**Cobertura `GET /worklog/coverage` [F2 para la API; necesaria para la vista de Cobertura]**

Parámetros: `weekStart` (se normaliza al lunes), `processId?`, `asOf?` (`YYYY-MM-DD`, la fecha local del cliente;
por defecto la del servidor; define qué días hábiles ya cuentan como «faltan»).

```json
{ "weekStart": "2026-11-02", "days": ["2026-11-02", "…"],
  "people": [{ "userId": "…", "name": "Ana Pérez", "processId": "…", "processName": "BI",
     "cells": [{ "date": "2026-11-02", "dailyLogId": "…|null", "status": "ENVIADO|null", "returned": false, "hours": 6 }],
     "totalHours": 23, "loggedDays": 4, "expectedDays": 4 }],
  "totals": { "peopleToday": 4, "expectedToday": 6, "pendingReview": 7 } }
```

«Personas esperadas»: usuarios activos con concesión de integrante o líder en procesos del alcance (el jefe
definirá si él mismo cuenta; ver sección 15). Días esperados: lunes a viernes hasta `asOf` inclusive.

### 14.2 Semanal

**Cambio de esquema [F2]** (`weekly_reports`): las mismas cinco columnas de revisión/devolución que en diarios.

**`GET /weekly-reports` [I]** — paginado (`{ data, page, pageSize, total, hasMore }`) con: `scope`, `q`, `weekStart`,
`from`, `to`, `processId`, `authorUserId`, `status`, `sort` (`week|author|status`), `order`, `page`, `pageSize`.
Elementos añaden: `authorName`, `processName`, `filledSections` (0-5), `dailyLogCount`, `totalHours`,
`reviewedAt`/`reviewedByName`/`returned*` ([F2]).

**Detalle `GET /weekly-reports/{id}` [I]:** `authorName`, `processName`, `actions {edit, submit, recall, review,
return}`, y la consolidación extendida:

```json
{ "dailyLogCount": 3, "activityCount": 7, "totalHours": 17, "extraordinaryCount": 1, "hasBacking": true,
  "hoursByClassification": [{ "classificationCode": "SOPORTE", "count": 3, "hours": 6 }],
  "days": [{ "date": "2026-10-26", "dailyLogId": "…|null", "status": "ENVIADO|null", "returned": false, "hours": 6 }],
  "pendingSubmitDates": ["2026-10-28"], "missingDates": ["2026-10-27"] }
```

`days` cubre lunes a viernes de la semana del reporte; `pendingSubmitDates` = diarios en Borrador del autor+proceso;
`missingDates` = días hábiles ya vencidos sin diario (usa `asOf`, igual que la cobertura). Todo el cálculo es del
servidor.

**`GET /weekly-reports/{id}/suggestions` [I]** (lectura pura, no escribe):

```json
{ "results":     [{ "date": "2026-10-27", "text": "Tablero de ventas publicado", "source": "Modelo de ventas" }],
  "blockers":    [{ "date": "…", "text": "…", "source": "…" }],
  "commitments": [{ "date": "…", "text": "Entregar inventarios", "dueDate": "2026-11-04", "source": "…" }] }
```

Resultados = `result` de las actividades de diarios `ENVIADO`/`REVISADO` y `BORRADOR` de la semana (para ayudar antes de
enviar); bloqueos = actividades con estado `BLOQUEADA` y novedades relacionadas abiertas; compromisos = `nextStep`
con su fecha. Máximo 100 elementos por sección.

**`GET /weekly-reports/compliance` [I]** — `weekStart`, `processId?`, `asOf?`, `page`, `pageSize`:

```json
{ "weekStart": "2026-10-26",
  "totals": { "expected": 6, "submitted": 3, "draft": 2, "missing": 1 },
  "data": [{ "userId": "…", "name": "Ana Pérez", "processId": "…", "processName": "BI",
     "reportId": "…|null", "status": "ENVIADO|null", "filledSections": 5, "dailyLogCount": 5,
     "totalHours": 38, "submittedAt": "…|null", "days": [{ "date": "…", "status": "ENVIADO|null" }] }] }
```

**Acciones [F2]:** `POST /weekly-reports/{id}/review`, `/return` (`{ reason }`) y `/recall`, con las mismas reglas que
los diarios y el tipo de notificación `WEEKLY_REPORT_RETURNED`. **[F3]** recordatorio automático de semanales
pendientes.

### 14.3 Arrastres por la regla 55

- **OpenAPI y cliente:** `npm run contracts:generate`; versionar `apps/api/openapi/openapi.json`,
  `packages/api-client/src/generated/schema.d.ts` y `…/generated/openapi.json`.
- **MCP:** actualizar `worklog.daily.list` (nuevos parámetros) y `weekly-report.list`; **añadir** tools de lectura
  `worklog.summary`, `worklog.coverage`, `weekly-report.compliance`, `weekly-report.suggestions`; las acciones
  `review`, `return`, `recall` y `copy` son de escritura (`access` escritura; `return`/`recall` no destructivas,
  ninguna elimina datos). Quitar de `apps/mcp/src/tools/exclusions.ts` lo que se exponga, con motivo para lo que
  siga excluido. `apps/mcp/README.md` si cambia el catálogo.
- **Docs:** `modulos-backend.md` (sección *Worklog*), `modelo-datos.md` (columnas nuevas),
  `frontend-pantallas.md` (rutas y comportamiento de `/seguimiento/bitacora` y `/seguimiento/semanal`),
  `autenticacion-autorizacion.md` (revisión; escritura solo del autor) y `changelog.json`.
- **Pruebas:** Jest (alcance, filtros, paginación, transiciones y carreras, notificación, 409 de semanal, cobertura);
  `node --test` del MCP (cobertura frente al contrato); Playwright (registrar hoy, duplicado, filtros en URL,
  enviar → devolver → corregir → reenviar → revisar, cobertura, semanal con sugerencias).

---

## 15. Riesgos y preguntas abiertas para el dueño del producto

| Tema | Pregunta o riesgo | Propuesta |
| --- | --- | --- |
| Cambio de listado | La lista pasa de arreglo a respuesta paginada: rompe a sus consumidores. | Solo la usan `bitacora-view` y la tool del MCP: se cambian en el mismo PR. |
| H1 | Restringir al jefe a solo-lectura de diarios ajenos cambia un comportamiento actual. | Confirmar que el jefe nunca debe escribir por otro. Si lo necesita, usar un permiso explícito en lugar de `{}`. |
| Revisor único | ¿Quién revisa el diario del jefe o del único líder? | Aceptar «Enviado» como estado final o permitir autorrevisión marcada. |
| Personas esperadas | ¿El jefe y los líderes deben registrar bitácora? | Por defecto sí los líderes; el jefe opcional (configurable). |
| Festivos y ausencias | La cobertura marcaría «Sin registro» en festivos y vacaciones. | Primera entrega: solo lunes a viernes; segunda: calendario laboral o marca «No aplica». |
| Fechas futuras | ¿Se puede crear el diario de mañana? | No (máximo = hoy). Confirmar. |
| Plazo | ¿Hay hora límite para enviar el diario? | Fuera de alcance; el KPI «Pendientes de enviar» lo hace visible. |
| Horas | ¿Fracciones de 0,25 h? | Recomendado en fase aparte (sección 13). |
| Rendimiento | Búsqueda `contains` en actividades puede ser lenta con decenas de miles de filas. | Aceptable hasta ~50 000 actividades; si crece, índice `pg_trgm`. |
| Zona horaria | «Hoy» y «días vencidos» dependen de la fecha local. | El cliente envía `asOf` (como ya se hace con `localDateInputValue`). |
| Panel estrecho | Si 672 px resulta corto para actividades largas. | Alternativa: página de detalle (sección 3.1). |
| Búsqueda de proyectos | Cientos de solicitudes en un `Select`. | Búsqueda en el selector en fase 3 (H14). |
| Datos antiguos | `activityStatus` con texto libre previo. | Mostrar tal cual; no migrar. |

---

## 16. Plan de implementación (PRs pequeños, en orden)

Cada PR respeta la regla 55 (contrato regenerado, MCP, documentación, pruebas) y puede revisarse por separado.
**Primero backend, luego bitácora, luego semanal.**

### Backend

| PR | Contenido | Prio. |
| --- | --- | --- |
| **B1 · Lectura enriquecida y listado** | `authorName`/`processName`/nombres de referencias en DTOs; `DailyLogListItemDto` y listado paginado con todos los filtros y orden; `GET /worklog/summary`; `actions`; endurecer escritura al autor (H1); `@Max(24)` en horas; 409 con `existingId`. Contrato, MCP (`worklog.daily.list`, `worklog.summary`), docs, pruebas. | I |
| **B2 · Revisión** | Migración de columnas; `review`, `return`, `recall`; notificación `DAILY_LOG_RETURNED`; control del semanal; `activityStatus` con `@IsIn`; campos de revisión en detalle y lista. Contrato, MCP (escritura), docs, pruebas de transiciones y carreras. | I |
| **B3 · Semanal y cobertura** | Listado paginado de semanales con `authorName`, `filledSections`, conteos; consolidación extendida; `suggestions`; `compliance`; `GET /worklog/coverage`. Contrato, MCP, docs, pruebas. | I |
| **B4 · Complementos** | `activities/copy`, `GET /worklog/daily/{id}/history`, migración y acciones de revisión del semanal. | F2 |

### Bitácora (web)

| PR | Contenido |
| --- | --- |
| **W1 · Base** | `formatDateOnlyWithWeekday`, `useUrlFilters`, `PersonAvatar`, `ClassificationBar`, `DateRangeSelect`, `FilterChips`, `TimelineList`; textos de ayuda y clasificaciones en un módulo de contenidos. Pruebas unitarias de rangos y URL. |
| **W2 · Lista** | Reemplaza el maestro-detalle: pestañas *Mis diarios / Equipo*, `StatStrip`, `Toolbar` con filtros, chips, tabla ordenable y paginada, tarjetas móviles, estados vacío/carga/error. Detalle aún en el panel mínimo. E2E de filtros y URL. |
| **W3 · Panel de detalle** | `Sheet` con cabecera, notas inline, dedicación, `ActivityRow` expandible, línea de tiempo, banners de solo lectura, foco y anuncios. |
| **W4 · Formulario de actividad** | `RadioCards` de clasificación con ejemplos, bloque «Más detalle», atajos y «Guardar y agregar otra», campos `activityStatus`, `nextStep`, `nextStepDate`. |
| **W5 · Captura rápida** | «Registrar hoy», proceso recordado, verificación y aviso de duplicado, «Otro día», `N` y atajos; copiar del día anterior si B4 ya está. |
| **W6 · Revisión** | `Marcar como revisado`, `Devolver con motivo` (`ReasonDialog`), `Retirar envío`, anterior/siguiente, «Pasar al siguiente por revisar». |
| **W7 · Cobertura** | `CoverageGrid`, interruptor Lista/Cobertura, KPI de cobertura, versión móvil. |

### Reporte semanal (web)

| PR | Contenido |
| --- | --- |
| **W8 · Editor de la semana** | Selector de semana, creación en un clic, guía por sección, avance de llenado, indicador de cambios sin guardar, panel «Respaldo de la semana» con píldoras y avisos, diálogo de sugerencias, tabla «Reportes anteriores». Retira `semanal-form-dialog.tsx`. |
| **W9 · Equipo** | Pestaña *Equipo*: cumplimiento, historial con filtros, panel de lectura; (con B4) revisar/devolver el semanal. |

### Cierre

| PR | Contenido |
| --- | --- |
| **D · Documentación y capturas** | `frontend-pantallas.md`, `changelog.json`, capturas nuevas a 375/768/1024/1280 en claro y oscuro; actualizar `identidad-color-menu.md` si surge algún token. |
| **Fase 3 (opcional)** | Horas en pasos de 0,25 (sección 13), autoguardado del semanal, búsqueda en el selector de proyectos, recordatorios, calendario laboral. |

Orden de dependencias: B1 → W1/W2/W3/W4 (en paralelo tras B1) → B2 → W6 → B3 → W5/W7/W8/W9. W5 y W6 pueden salir sin
B4 (se oculta «Copiar» hasta que exista).

---

## 17. Lista de verificación para el revisor

- Cada fila de la lista dice **quién** la hizo, cuándo (con día de la semana), de qué proceso y en qué estado.
- Hay 100 diarios y la pantalla sigue siendo rápida y legible; la URL reproduce los filtros.
- Un revisor puede revisar o devolver sin salir de la lista; el autor ve el motivo y puede corregir.
- Ninguna acción de escritura se ofrece a quien no puede ejecutarla, y el jefe no puede editar diarios ajenos.
- Las actividades muestran referencia, resultado, evidencia, novedad, estado y próximo paso sin romper la densidad.
- El semanal explica cada sección con un ejemplo, avisa de diarios que faltan y trae sugerencias sin sobrescribir.
- Móvil a 375 sin desbordes horizontales; 1024 con menú en riel sin recortes; claro y oscuro medidos.
- Contrato, cliente, MCP, documentación y pruebas actualizados en el mismo PR.
