# Mi trabajo para miembros (`/mi-trabajo`): especificación UX/UI

Especificación visual y de interacción (rol Diseñador) de la Entrega 1 del rediseño de «Mi trabajo», la vista del
rol integrante. **No toca API, contrato OpenAPI, MCP, esquema ni permisos.** Reglas vigentes: `25-marca-gibo.md`,
`20-frontend-nextjs.md`, `55-sincronia-api-mcp-docs.md` y los documentos hermanos `docs/design/planeacion-ux.md`
y `docs/design/workspace-apps-gibo.md`. Solo tokens semánticos (prohibido color crudo y `z-[n]`), texto azul con
`text-link`, foco con `--ring`, español con tildes.

Los contrastes de la sección 16 están **medidos** (WCAG 2.2; ver el método allí). Las capturas «antes» están en
`.agents/tasks/mi-trabajo-ux/screenshots/` (carpeta ignorada por git; se citan por nombre).

---

## 0. Resumen ejecutivo y decisiones

Hoy «Mi trabajo» es una tabla plana de 5 columnas ordenada por fecha, que mezcla lo terminado con lo pendiente,
no resalta lo vencido y obliga a entrar a otra página para cambiar algo (capturas `01b`, `03`). Terminar una
tarea cuesta 7 clics y dos guardados. La nueva vista responde primero a **«¿qué hago hoy?»**: contadores
clicables arriba, lista **agrupada por urgencia** (Vencidas, Hoy, Esta semana, Más adelante, Sin fecha), terminadas
plegadas, y **estado y avance editables en la propia fila**, con el detalle en un panel lateral sin salir de la
lista. El detalle se simplifica (un solo control de avance, evidencia clara, avisos que no bloquean).

### 0.1 Decisiones de los puntos abiertos

| # | Punto abierto | Decisión | Por qué |
| --- | --- | --- | --- |
| 1 | **«Esta semana»** | **Semana calendario lunes–domingo en el calendario LOCAL del usuario**, contada **desde mañana hasta el domingo** (hoy tiene su propio grupo). Lo que vence después del domingo va a «Más adelante». El encabezado del grupo muestra el límite («hasta dom 09 nov 2026», con `formatDateOnlyWithWeekday`) para que no haya ambigüedad. | Es la misma semana (lunes inicial) que usan Reporte semanal y `localWeekMondayInputValue`; el usuario piensa en «esta semana» como la del calendario de pared. «Próximos 7 días» se descartó porque el rótulo cambiaría de significado cada día y chocaría con «Más adelante». Costo asumido: un sábado o domingo el grupo queda corto o vacío y lo del lunes aparece en «Más adelante»; el chip «Vence en N días» (≤ 3 días) lo sigue señalando. |
| 2 | **Hitos (`isMilestone`)** | No forman un grupo propio. Se mezclan por fecha con una insignia **«Hito»** (`Badge outline` + icono `Flag`). Desempate: en la misma fecha y estado, **el hito va antes** que las tareas ordinarias. | Un hito es un entregable fechado; agruparlo aparte lo separaría de su fecha real. Antes en el desempate porque marca el cierre del día. |
| 3 | **Contadores: filtro o indicador** | **Filtros tipo interruptor** (`aria-pressed`), de **selección única**: pulsar uno lo activa, pulsar otro lo reemplaza, pulsar el activo lo apaga. Se combinan con búsqueda y filtro de estado (Y). Los números **no cambian con la búsqueda ni con el filtro de estado** (son el estado de tu trabajo, no del filtro). Un contador en 0 queda inactivo (`disabled`) salvo que sea el filtro activo. | Un indicador que no se puede pulsar obliga a recorrer la lista; con solo 4 contadores y solapes posibles (una tarea vencida puede estar «En curso»), la selección única evita la ambigüedad O/Y. |
| 4 | **Proyectos cerrados** | **Sin tratamiento especial en la Entrega 1.** `GET /my-work` no trae el estado operativo de la solicitud, y el front no debe inventarlo. Si el proyecto está cerrado, el backend responde 409 (`assertProjectOpen`) y la UI muestra **el mensaje del servidor** (toast) y revierte. La tarea sigue visible en su grupo. | Cumple «el backend manda». Hallazgo para la Entrega 2: enriquecer `/my-work` con `requestOperationalState` para mostrar «Proyecto cerrado» y volver la fila de solo lectura. |
| 5 | **Siguiente paso de estado** | **Botón de un clic «Siguiente paso»** en la fila (Empezar · Enviar a revisión · Retomar · Terminar) **y** el menú de estado con **verbos de acción**, el avance natural **primero** y marcado «Siguiente paso»; nunca una opción inválida (el menú sale de `nextTaskStatuses`). | Hace real el objetivo «EN_CURSO → TERMINADA en 2 acciones por fila» (Enviar a revisión, Terminar) y deja el menú para las salidas laterales (bloquear, devolver, reabrir). |

### 0.2 Supuestos

- «Hoy» es la fecha local del usuario (`localDateInputValue`) contra `endDate` leída como fecha UTC solo-fecha (misma
  regla que `taskDueInfo`/`formatDateOnly`). Es presentación: la API no calcula vencimiento.
- El integrante no tiene el módulo `plan`; los componentes reutilizados se montan en `/mi-trabajo` y no se le abre
  Planificación ni se tocan permisos.
- Estado y avance: el backend permite cambiarlos al responsable, al líder y al jefe, solo con proyecto abierto.
  La UI refleja los motivos, pero el servidor manda (403/409).
- Datos de prueba: 16 tareas del integrante con solicitudes «[UX]» (13 propias), con los 5 estados, hitos y vencidas.

---

## 1. Diagnóstico de la vista actual (capturas «antes»)

- **`01b` (escritorio, 1440×900):** primeras filas = tareas de enero y ya TERMINADAS («Tarea dos», «fdz»); lo urgente
  queda enterrado. Las 5 vencidas solo tienen la fecha en texto; ni chip ni color. La columna Estado mezcla badge y
  porcentaje en gris sin acción. No hay contadores ni agrupación.
- **`03` (móvil):** tarjetas legibles pero 16 sin agrupar ≈ 3.400 px de scroll; el título es lo único accionable.
- **`04` (detalle):** «Fase —» (bug: `TareasView` no pasa `phaseName`); dos controles de avance (lápiz y campo
  «Progreso (0–100)»); evidencia de texto mezclada con el formulario de estado; el selector «Nuevo estado» arranca
  vacío y exige 4 pasos.
- **`22` (panel de Planificación):** el patrón a seguir: panel lateral que mantiene la lista a la vista, chips de
  vencimiento, barra con color por riesgo.
- **`20b` y `21`:** estado y avance en línea (chip con menú y barra con lápiz) son lo que hace amigable al líder.

---

## 2. Jerarquía de página (escritorio ≥ 1024 px)

```
PageLayout
├─ PageHeader  h1 «Mi trabajo» · descripción · [Actualizar]
├─ Contadores  4 tarjetas-interruptor  (Vencidas · Para hoy · En curso · Bloqueadas)
├─ Toolbar     [Buscar por título] [Estado ▾]   «Limpiar filtros» · «12 de 16 tareas»
├─ Estado vivo (role=status, sr-only)
├─ Grupos (cada uno una <section aria-labelledby>, tarjeta bg-card shadow-card rounded-xl)
│   ├─ Vencidas        (n)                    ← icono AlarmClock + título text-danger
│   ├─ Hoy             (n)
│   ├─ Esta semana     (n)  · hasta dom 09 nov 2026
│   ├─ Más adelante    (n)
│   ├─ Sin fecha       (n)
│   └─ Terminadas      (n)  [▸ plegada por defecto]
└─ Panel lateral (Sheet derecho, w-[40rem]) con TaskDetail embedded
```

Un grupo sin tareas **no se pinta** (sin cabeceras vacías). Orden fijo de los grupos; no hay orden manual ni
paginación en la Entrega 1 (el agrupamiento es el orden). Los grupos con más de 20 filas muestran las 20 primeras y
un botón **«Ver las N restantes»** (`Button variant="ghost" size="sm"`, patrón del kanban de Planificación); en
Terminadas el tope es 10 (más recientes primero).

**Comportamiento de «Ver las N restantes» (hallazgo N7).** (1) Pulsarlo revela **todas** las filas ocultas de ese grupo y
el botón desaparece; el despliegue **no se recuerda** (se pierde al recargar o al cambiar un filtro; solo el pliegue de
Terminadas se persiste). (2) El **foco pasa al título de la primera fila revelada** y la región viva anuncia «Se muestran
{N} tareas más en {grupo}». (3) Si una acción en línea **reubica** una fila hacia un grupo con corte y esta cae tras el
límite, ese grupo se **expande automáticamente** para que la fila movida siga visible y reciba el foco (12.6); nunca se
oculta tras el corte la fila sobre la que el usuario acaba de actuar.

`PageHeader`: título «Mi trabajo»; descripción de una línea: «Tus tareas ordenadas por urgencia: lo vencido y lo
de hoy primero.» Acción: `Actualizar` (`outline`, `RefreshCw`), como hoy.

---

## 3. Contadores (cabecera)

Cuatro tarjetas-botón en `section[aria-label="Resumen de tu trabajo"]`:
`grid grid-cols-2 gap-3 lg:grid-cols-4` (en 2×2 móvil). Cada una es un `<button type="button" aria-pressed>`:

```
┌──────────────────────┐
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔ (filete 2px superior por tono)
│ [icono] Vencidas      │   text-meta text-muted-foreground
│ 5                     │   text-2xl font-semibold tabular-nums (color del valor según la tabla)
│ tareas sin terminar   │   text-xs text-muted-foreground  (pista corta)
└──────────────────────┘
```

| Contador | Cuenta | Filete superior | Color del **valor** (texto, ≥ 4.5:1) | Icono | Pista |
| --- | --- | --- | --- | --- | --- |
| **Vencidas** | tareas no terminadas con vencimiento anterior a hoy | `danger` si > 0 | `text-danger` si > 0 (6.59 · 7.20) | `AlarmClock` | «pasaron su fecha» |
| **Para hoy** | no terminadas que vencen hoy | `warning` si > 0 | `text-warning` si > 0 (6.76 · 9.57) | `CalendarClock` | «vencen hoy» |
| **En curso** | estado `EN_CURSO` (cualquier fecha) | `primary` | **`text-foreground`** (14.75 · 14.98) | `CirclePlay` | «en las que trabajas» |
| **Bloqueadas** | estado `BLOQUEADA` | `danger` si > 0 | `text-danger` si > 0 (6.59 · 7.20) | `OctagonAlert` | «esperan algo» |

El valor de «En curso» **no** se pinta con `text-primary`: `primary`/`card` mide 4.84 en claro pero **3.37 en oscuro**, por debajo
de los 4.5:1 de texto (el valor es de 24 px semibold; se descarta acogerse a la excepción de «texto grande» y se mide como texto
normal). El azul solo se usa en el filete y el anillo (no texto, umbral 3:1: 4.84 · 3.37 ✔; tabla 16.3).

Los contadores **se solapan** (una vencida puede estar en curso); la suma no es el total. Se dice en el `title`
accesible de la sección: «Los conteos pueden solaparse.» (`sr-only` junto al encabezado de la sección). En 0, el valor
se pinta `text-muted-foreground` (no rojo), el filete queda `bg-border` y el botón `disabled`.

Estilo: `rounded-xl bg-card p-4 text-left shadow-card border-t-2` (mismo filete superior por tono que `StatTile`, vía
`border-t-danger|warning|primary`). **No se reutiliza `StatStrip`** porque su contenedor (`overflow-hidden`, bordes por
`gap-px`) recortaría el contorno de foco; las tarjetas van separadas por `gap-3`.

Estados del contador:

| Estado | Presentación |
| --- | --- |
| Reposo | Como arriba. |
| Hover | `hover:bg-muted/50` sobre `card` (texto 6.4+:1, tabla 16.1). |
| Foco (teclado) | `focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring`. El `offset-4` queda fuera de la tarjeta, sobre el lienzo (`ring`/`background` 4.22 claro · 3.75 oscuro). |
| **Activo** (`aria-pressed="true"`) | `ring-2 ring-primary` sobre `bg-card` **y** icono `Check` al lado de la etiqueta **y** el texto sr-only «Filtro activo». No depende del color. **No** se usa `primary-subtle` como fondo: el foco no alcanza 3:1 sobre él en oscuro (2.75). |
| Deshabilitado (0) | `disabled`; el valor pasa a `text-muted-foreground` y la etiqueta y la pista conservan su color, **sin `opacity`**. Aunque un control inactivo está exento de contraste (WCAG 1.4.3), se mide igual: `muted-foreground`/`card` 7.13 · 7.62 ✔ (tabla 16.1). |

Al activar un contador, el filtro actúa sobre la lista; la sección «Terminadas» desaparece (ninguna terminada coincide)
y la fila de resultado dice «5 de 16 tareas». «Limpiar filtros» también apaga el contador. **Auto-apagado (regla única, hallazgo M7).** El contador activo se apaga solo **únicamente cuando su propio conteo**
(calculado sobre **todas** las tareas, sin búsqueda ni filtro de estado) **llega a 0** (p. ej. el usuario resolvió la última
vencida): entonces el filtro se quita, el foco pasa a la búsqueda (patrón NIT 4 existente) y se anuncia en la región viva.
Si la lista queda vacía por **la búsqueda o el filtro de estado** mientras el contador sigue teniendo tareas, **no** se
apaga: se muestra el estado «Sin resultados» de 12.5.

---

## 4. Barra de filtros

Reutiliza `Toolbar` (`collapseOnMobile`), `SearchInput` y `Select` actuales:

- **Buscar** (`id="mt-buscar"`, placeholder «Título de la tarea») y **Estado** (Todos + los 5 estados), sin cambios.
- Fin de la barra: `ResultCount` («12 de 16 tareas», `aria-live="polite"`) y **«Limpiar filtros»** (`ghost sm`) cuando
  hay búsqueda, estado o contador activo.
- La búsqueda y el estado filtran **antes de agrupar**; los grupos vacíos desaparecen. Si la búsqueda o el filtro
  de estado `TERMINADA` están activos, la sección «Terminadas» se muestra **desplegada** aunque el usuario la haya
  plegado (no se altera su preferencia guardada) y su botón de pliegue deja de mostrarse (el título pasa a ser texto).
- Sin la cabecera ordenable: se retira `SortableTableHead` y el selector «Ordenar por» de las tarjetas.

---

## 5. Secciones: definición exacta y orden

### 5.1 Reglas de agrupamiento (función pura `lib/my-work-groups.ts`)

Firma: `groupMyWork(items, todayLocal: string): MyWorkGroups`, módulo **sin imports de la app** (cargable en Node, como
`task-due.ts`), con `todayLocal` en `YYYY-MM-DD` del calendario local. Orden de evaluación (la primera regla que se cumple):

| Orden | Grupo (`key`) | Regla |
| --- | --- | --- |
| 1 | **Terminadas** (`done`) | `status === 'TERMINADA'`, con cualquier fecha. |
| 2 | **Sin fecha** (`noDate`) | `endDate` vacío o no interpretable. |
| 3 | **Vencidas** (`overdue`) | `endDate < hoy`. |
| 4 | **Hoy** (`today`) | `endDate == hoy`. |
| 5 | **Esta semana** (`week`) | `hoy < endDate ≤ domingo de la semana en curso`. |
| 6 | **Más adelante** (`later`) | `endDate > domingo de la semana en curso`. |

- Los días se comparan como **números de día enteros** (`Date.UTC(y, m, d) / 86 400 000`) sin pasar por la zona del
  proceso, tanto el vencimiento (parte de fecha UTC, igual que `taskDueInfo` y `formatDateOnly`) como «hoy» (la cadena
  local ya construida). Así no hay desfases de un día en UTC−5 ni cambios de mes/año/febrero bisiesto.
- Domingo de la semana: `hoy + (7 − díaISO)` con `díaISO` lunes=1…domingo=7 calculado del propio número de día. Si hoy
  es domingo el límite es hoy y «Esta semana» queda vacía.
- «Hoy» entra por parámetro; la vista lo recalcula con un hook `useTodayLocal()` que **vuelve a evaluar al llegar la
  medianoche local** (un `setTimeout` al siguiente 00:00) y al volver a la pestaña (`visibilitychange`), para que una
  pestaña abierta de un día para otro no deje las «de hoy» como vigentes.
- **Detalle de `useTodayLocal()` (hallazgo N6).** (a) La siguiente medianoche se calcula con
  `new Date(y, m, d + 1)` (hora local, año/mes/día de «ahora»), **no** sumando 24 h: así respeta los cambios de horario
  (días de 23 o 25 h) y los fines de mes. El `setTimeout` se calcula con `siguienteMedianoche − ahora` y, al dispararse,
  recalcula «hoy» y programa el siguiente; si el temporizador se retrasa (equipo suspendido), `visibilitychange` y
  `focus` corrigen. Se limpia al desmontar. (b) El hook produce «hoy» con `localDateInputValue()`; la función pura **no**
  confía en ello: si `todayLocal` **no cumple `^\d{4}-\d{2}-\d{2}$` o no es una fecha real** (p. ej. `2026-02-30`),
  `groupMyWork` **lanza `RangeError('todayLocal inválido')`**; es un error de programación, no un dato del usuario, y se
  cubre con una prueba. Una `endDate` inválida de una tarea, en cambio, **no** lanza: esa tarea cae en «Sin fecha» (regla 2).
  (c) El límite de «Esta semana» se imprime con `formatDateOnlyWithWeekday(domingo)` tal como lo devuelve el módulo
  `lib/format.ts` (día de la semana abreviado en minúscula y sin punto + fecha en el formato del portal), precedido de
  «hasta»: p. ej. «hasta dom 09 nov 2026» (el orden y relleno exactos son los de `formatDateOnly`, no se reimplementan).
- Las tareas con `endDate` pero sin `startDate`, o con `isMilestone`, se tratan igual (solo cuenta el vencimiento).

### 5.2 Orden dentro de cada grupo

1. **Fecha ascendente** (la más antigua primero: lo más vencido arriba).
2. Empate: **lo iniciado primero**, en el orden `EN_CURSO` → `EN_REVISION` → `BLOQUEADA` → `POR_HACER`.
3. Empate: **hito primero**.
4. Empate: título alfabético (`localeCompare('es')`) y, por último, `taskId` (orden estable y determinista).

«Sin fecha» omite el paso 1. **Terminadas**: fecha **descendente** (la más reciente primero; sin fecha al final) y luego
los pasos 3 a 4. Un cambio de estado reordena la fila al instante (optimista); el recolocado se anuncia (sección 12.4).

### 5.3 Cabecera de grupo

`h2` (`font-heading text-base font-semibold`) con icono, título, conteo en chip
(`rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground`, 5.72 claro · 6.95 oscuro) y, en
«Esta semana», el límite en `text-meta text-muted-foreground`. Fila `flex items-center gap-2 px-4 py-3`
con `border-b`.

| Grupo | Icono | Título |
| --- | --- | --- |
| Vencidas | `AlarmClock` | `text-danger` |
| Hoy | `CalendarClock` | `text-foreground` |
| Esta semana | `CalendarDays` | `text-foreground` |
| Más adelante | `CalendarRange` | `text-foreground` |
| Sin fecha | `CalendarOff` | `text-foreground` |
| Terminadas | `CircleCheck` | `text-muted-foreground` (cabecera de botón, ver 5.4) |

El color no es el único portador: cada grupo lleva icono y nombre. Los iconos van `aria-hidden="true"`.

### 5.4 Terminadas (plegada)

- Cabecera = **botón** `aria-expanded`, `aria-controls="mt-grupo-terminadas"`: `ChevronRight` (gira 90° al abrir,
  `motion-reduce:transition-none`) + «Terminadas» + conteo. Altura mínima 44 px en táctil.
- **Colapsada por defecto.** La preferencia se recuerda con `createLocalPrefStore` + `useSyncExternalStore` (clave
  `miTrabajoTerminadasAbierto`, valores `abierto`/`cerrado`; lectura con `try/catch`; valor de servidor `cerrado`).
- Filas de terminadas: título y sublínea en `text-muted-foreground`; barra en tono `done`; sin chips de vencimiento;
  estado editable (solo «Reabrir»); avance deshabilitado con el motivo de `progressLockedReason`.

---

## 6. Fila de tarea (escritorio ≥ 1024 px)

> **Decisión de ancho (hallazgo M3).** La tabla solo aparece desde `lg` (1024 px). Por debajo (incluida la tablet
> 768–1023 px) se usan las tarjetas de la sección 7, que ya cumplen los 44 px táctiles. Cuentas con las medidas reales
> del shell: el sidebar mide `w-60` (240 px) y pasa a riel `w-14` (56 px) automáticamente entre 1024 y 1279 px
> (`@custom-variant rail` en `globals.css`); el `<main>` lleva `md:px-6` (48 px) y `xl:px-8` (64 px). Columnas fijas
> Vencimiento 176 + Avance 176 + Estado y siguiente paso 288 = **640 px**. Ancho que queda a **Tarea**: a 1024 px
> (riel) 1024 − 56 − 48 − 640 = **280 px**; a 1280 px (sidebar de 240) 1280 − 240 − 64 − 640 = **336 px**; a 1440 px
> (sidebar de 240) **496 px**. En ningún punto de la tabla baja de 280 px, suficiente para título + insignia «Hito»
> en la primera línea y la sublínea truncada en la segunda, sin scroll horizontal (la columna no lleva `min-w`:
> `table-fixed` reparte el resto a Tarea). (Si el usuario fijara el sidebar expandido a 1024–1279 px la columna se
> estrecharía; hoy ese modo no existe: solo `auto`/`rail`.)

Cada grupo es una `<table>` con `<caption class="sr-only">` («Tareas vencidas», …) y `<thead class="sr-only">` (Tarea,
Vencimiento, Avance, Estado y siguiente paso). Las columnas se alinean entre grupos con las **mismas anchuras**
(`table-fixed` + `colgroup`). No hay cabecera visible por columna: la cabecera del grupo y el contenido de las celdas
bastan, y evitan repetirla seis veces.

### 6.1 Anatomía

```
│▌ Levantar requerimientos con Comercial   [Hito]│ 28 oct 2026         │ ▓▓▓▓▓▓░░░░ 60 % ✎ │ [En curso ▾] [Enviar a revisión] │
│▌ [UX] Tablero ejecutivo de ventas · Levant.     │ [⏰ Vencida hace 8 días] │                    │                                  │
```

| Columna | Ancho (≥ lg) | Contenido |
| --- | --- | --- |
| **Tarea** | flexible (resto; 280 px a 1024) | Línea 1: **botón-título** (`text-sm font-medium`, abre el panel) + `Hito`. Línea 2: `text-meta text-muted-foreground` = `{solicitud} · {fase}` (truncada con `line-clamp-1`; el nombre completo en `title`). **Sin enlace** a la solicitud en la lista (se evita anidar interactivos; el enlace vive en el detalle, sección 11). |
| **Vencimiento** | `w-44` | `formatDateOnly(endDate)` (`tabular-nums whitespace-nowrap`) o «Sin fecha» en `text-muted-foreground`; debajo el **chip** de `taskDueInfo`/`dueLabel`: `overdue` → `Badge danger` + `AlarmClock`; `today` y `soon` → `Badge warning` + `Clock`; `ok`/`none` → nada. En el grupo «Hoy» el chip se omite (el grupo ya lo dice). |
| **Avance** | `w-44` | `TaskProgressControl` (barra + % + lápiz). Tono: `progressTone(status, vencida)`. |
| **Estado y siguiente paso** | `w-72` | `TaskStatusControl` (badge + chevron) seguido del botón **Siguiente paso**, en una línea (`flex items-center gap-2`). |

- **Banda de vencida:** `shadow-[inset_3px_0_0_0_var(--color-danger)]` en la primera celda de las filas vencidas,
  **además** del chip (nunca solo color; 6.59 claro · 7.20 oscuro sobre `card`).
- Alto de fila: 64–72 px (dos líneas). Padding de celda `py-3`.
- **Por debajo de 1024 px no hay tabla:** se usan las tarjetas (sección 7); no existe variante intermedia de columnas.
- Fila TERMINADA: ver 5.4. Fila BLOQUEADA: el badge rojo del estado es el único indicio (no hay motivo de bloqueo en la
  API; Entrega 3).

### 6.2 Estados de la fila

| Estado | Presentación |
| --- | --- |
| Reposo | Como 6.1. |
| Hover | `hover:bg-muted/50` (ya del `Table`); todos los pares siguen ≥ 4.5 (tabla 16.1). |
| Foco | Cada control tiene su propio contorno `focus-visible:outline-2 outline-offset-2 outline-ring`. La fila no recibe foco. |
| **Ocupada** (acción en curso) | `aria-busy="true"` en la fila; los tres controles de **esa** fila `disabled` con spinner (`LoaderCircle`) en el pulsado; el resto de filas siguen activas. **Sin `opacity`** para no bajar el contraste. |
| Error | Toast con el mensaje del servidor y la fila vuelve a su valor (sección 8.4). |
| **Por hacer / Terminada** (avance no editable) | `changeProgress` responde 409 en `POR_HACER` y en `TERMINADA`. El componente compartido ya lo refleja: `progressLockedReason` (`task-progress-control.tsx`) devuelve «Pasa la tarea a «En curso» para registrar su avance.» en `POR_HACER` y «La tarea está terminada. Reábrela para cambiar su avance.» en `TERMINADA`, y `TaskProgressControl` deshabilita el botón, no pinta el lápiz y expone el motivo por `aria-describedby`. Mi trabajo **no pasa nada extra**: usa ese comportamiento tal cual (sin tocar el componente ni Planificación) y lo comprueba en la prueba e2e. La barra y el % se siguen viendo (en `POR_HACER`, `0 %`). Al pulsar «Empezar» la fila pasa a `EN_CURSO` y el avance se vuelve editable sin recargar. El mismo criterio aplica al resumen del detalle (sección 10), que ya usa el mismo componente. |
| Sin permiso | **Chip de estado y avance deshabilitados** con motivo accesible (`aria-describedby`): «Solo puedes cambiar el estado de tus propias tareas.»; el botón «Siguiente paso» **no se pinta** (ver 8.1). Para el integrante en `/my-work` esto casi no ocurre: la API solo devuelve sus propias tareas. |
| Estado fuera del enum | `MyWorkItemDto.status` es `string` en el contrato. Si llega un valor que no es uno de los 5 estados: el chip se pinta con `StatusBadge` en su variante neutra y el texto crudo, `nextTaskStatuses` devuelve `[]` (menú deshabilitado), `nextStepFor` devuelve `null` (sin botón) y el avance queda deshabilitado; la tarea se agrupa por fecha como cualquier otra. Nada se inventa ni se rompe. |

### 6.3 Qué es interactivo y cómo

| Elemento | Acción | Teclado |
| --- | --- | --- |
| Título | Abre el panel lateral (`?taskId=`). Es un `<button>`, no un enlace de navegación. | Enter/Espacio |
| Avance | Abre el diálogo corto de `TaskProgressControl` (deslizador, número, atajos 0/25/50/75/100, Guardar). | Enter/Espacio |
| Estado (chip) | Menú con las transiciones válidas (8.2). | Enter/Espacio/↓ abre; ↑↓ navegan; Esc cierra |
| Siguiente paso | Aplica la transición de avance natural de un clic (8.1). | Enter/Espacio |

Orden de tabulación en la fila: título → avance → estado → siguiente paso. Cada fila aporta **hasta 4 paradas**: **4**
en `EN_CURSO`, `EN_REVISION` y `BLOQUEADA`; **3** en `POR_HACER` (el avance deshabilitado no es enfocable) y **3** en
`TERMINADA` (avance deshabilitado y sin botón de siguiente paso). Con las 16 tareas de prueba son como máximo 64 paradas. Para no castigar al usuario de teclado, el botón de «Terminadas» y cada título tienen
nombre accesible propio y los grupos son regiones con `aria-labelledby` (navegación por regiones/encabezados).

---

## 7. Tarjeta móvil y tablet (< 1024 px)

Las tarjetas se usan en todo ancho menor que `lg` (1024 px): móviles y tablets (decisión M3, sección 6). El cambio
se hace con `lg:hidden` (tarjetas) y `hidden lg:block` (tablas), de modo que solo uno de los dos árboles está en el DOM
visible. La lista de cada grupo es `<ul class="flex flex-col gap-3">` de `<li>`. No se usa `DataCardList` (no admite controles
en línea ni agrupamiento); se crea `MyWorkCard`, con el mismo ritmo visual (`rounded-xl bg-card p-4 shadow-card`).

```
┌───────────────────────────────────────────┐
│▌ Levantar requerimientos con Comercial  Hito│  ← título (botón, min-h-11), badge Hito
│  [UX] Tablero ejecutivo de ventas · Levantam.│  ← text-meta, hasta 2 líneas
│  28 oct 2026   [⏰ Vencida hace 8 días]      │
│  ▓▓▓▓▓▓▓░░░░  60 %  ✎                       │  ← TaskProgressControl wide (min-h-11)
│  [ En curso ▾ ]  [ Enviar a revisión       ] │  ← estado (h-11) + siguiente paso (flex-1, h-11)
└───────────────────────────────────────────┘
```

- Banda izquierda `danger` (3 px inset) en vencidas; mismo chip.
- **Objetivos táctiles de 44 px:** título, avance, estado y siguiente paso con `min-h-11 min-w-11` aplicados con
  `max-lg:` **y** `pointer-coarse:` (una ventana estrecha de escritorio y una tablet táctil también cuentan). Esto exige que
  `TaskProgressControl` y `TaskStatusControl` acepten `className`/`size` (hoy fijan `pointer-coarse:min-h-10`/ninguno);
  separación mínima entre controles de 8 px (`gap-2`).
- Las cabeceras de grupo son `sticky top-14 z-10 bg-background lg:static`. `top-14` (56 px) las deja bajo la barra
  móvil del shell (`sticky top-0 z-30 h-14 lg:hidden`, `app-shell.tsx`), y `z-10` es menor que su `z-30`. **No existen
  clases `z-sticky`/`z-overlay` en el código** (solo están propuestas en `planeacion-ux.md`); se usan las numéricas
  reales ya presentes. Terminadas, plegada, ocupa una línea.
- Contadores 2×2 (`min-h-20`), filtros plegados con `collapseOnMobile` (búsqueda visible siempre).
- Sin scroll horizontal a 320 px: los títulos usan `wrap-break-word`; el botón de siguiente paso trunca no, **se parte**
  en dos líneas si es necesario.

---

## 8. Acciones en línea

### 8.1 Siguiente paso (botón de un clic)

Función pura nueva `lib/task-next-step.ts` (sin imports de la app; espejo de la UI, el backend manda):

| Estado actual | Botón | Pasa a | Nota |
| --- | --- | --- | --- |
| `POR_HACER` | **Empezar** | `EN_CURSO` | 409 si hay predecesora pendiente: se muestra el mensaje del servidor. |
| `EN_CURSO` | **Enviar a revisión** | `EN_REVISION` | Aviso no bloqueante (8.3). |
| `BLOQUEADA` | **Retomar** | `EN_CURSO` | Igual que «Empezar» respecto de predecesoras. |
| `EN_REVISION` | **Terminar** | `TERMINADA` | Propone avance 100 % y avisa de la evidencia (8.3). |
| `TERMINADA` | — (sin botón) | — | La reapertura vive solo en el menú. |

Presentación: `Button variant="outline" size="sm"` con el verbo; `aria-label="{verbo}: {título}"`. «Terminar» usa
`variant="default"` (la acción de cierre es la única «primaria» de la fila; blanco/`primary` 4.84:1 en ambos temas).
Con la fila ocupada: `loading`. **EN_CURSO → TERMINADA = 2 acciones** (Enviar a revisión, Terminar), medibles en
Playwright frente a las 7 de hoy. Si el actor no puede cambiar el estado, el botón **no se pinta** (no se deja
deshabilitado: ocuparía espacio sin explicar nada que el chip no diga); el chip y el avance sí se pintan deshabilitados
con su motivo (6.2). Tampoco se pinta si el estado llega fuera del enum (6.2: `nextStepFor` → `null`).

### 8.2 Menú de estado (`TaskStatusControl`)

Se reutiliza tal cual, con **una prop opcional nueva `actionLabels`** (mapa estado destino → verbo; si falta, el
comportamiento de Planificación no cambia). Contenido del menú (solo transiciones de `nextTaskStatuses`):

| Desde | Opciones (primera = siguiente paso, marcada «Siguiente paso» en `text-meta`) |
| --- | --- |
| `POR_HACER` | **Empezar** · Marcar como bloqueada |
| `EN_CURSO` | **Enviar a revisión** · Marcar como bloqueada · Volver a Por hacer |
| `BLOQUEADA` | **Retomar** · Volver a Por hacer |
| `EN_REVISION` | **Terminar** · Devolver a En curso · Marcar como bloqueada |
| `TERMINADA` | Reabrir (vuelve a En curso) |

Separador entre el siguiente paso y las salidas laterales. El menú es `DropdownMenu` (hereda `z-50` y `bg-popover` de `ui/dropdown-menu.tsx`; no se añade clase de capa);
foco con `accent`. Trigger: badge de estado + `ChevronDown`; nombre accesible «Cambiar estado de «{título}» (actual:
{estado})». `showProgress={false}` (el avance tiene su columna).

### 8.3 Reglas de UX sin reglas de negocio nuevas (avisos que no bloquean)

Todos los avisos son informativos: **nunca impiden** la acción, que se envía al backend tal cual.

| Acción en la fila | Qué hace la UI |
| --- | --- |
| **Terminar** con avance < 100 % | Envía `status: TERMINADA` **con `progress: 100`** (el avance propuesto) y lo cuenta: toast de éxito «“{título}” terminada. Avance ajustado a 100 %.» con acción **Reabrir** (ver «Reabrir» abajo). |
| **Terminar** con avance 100 % | Solo `status`; toast «“{título}” terminada.» con acción **Reabrir**. |
| **Enviar a revisión** o **Terminar** | En paralelo a la actualización consulta la evidencia (`listTaskEvidence`) y mira `evidenceUrl` de la respuesta. Si **no hay ni nota/URL ni archivos**, segundo toast `warning`: «Sin evidencia registrada.» con acción **Añadir evidencia** (abre el panel en la pestaña Evidencia). Si la consulta falla, no se muestra aviso (no se inventa). |
| **Enviar a revisión** con avance < 100 % | El toast de éxito añade «Avance al {n} %.» (informativo). No se cambia el avance. |
| Cualquier otra | Toast corto «Estado actualizado: {estado}.» |

El texto de los toasts no usa comillas rectas (el título de la tarea va entre comillas tipográficas “ ”).

**«Reabrir» (antes «Deshacer»; hallazgo M4).** La acción del toast de Terminar **no restaura el estado previo**: parte de
`EN_REVISION` y `TASK_TRANSITIONS.TERMINADA` solo admite `EN_CURSO` (`lib/task-transitions.ts`, igual en
`task.service.ts`). Por eso se llama **Reabrir** y no «Deshacer», para no prometer lo que no hace:

- Envía `PATCH /tasks/{id}/status` con `status: EN_CURSO` y, en el **mismo PATCH**, `progress` con el avance que tenía antes de
  Terminar (si se había propuesto 100 %; `progress` ya existe en `UpdateTaskStatusDto`).
- Al éxito, toast «“{título}” vuelve a En curso.» La tarea queda en **En curso**, no en En revisión; el estado
  `EN_REVISION` anterior **no se recupera** (hay que volver a «Enviar a revisión» si procede).
- Al entrar en `EN_CURSO` el backend ejecuta `assertPredecessorsSatisfied` y puede responder **409** (o 403 si el actor perdió
  el permiso, o 409 si el proyecto se cerró entre tanto). En ese caso se muestra con `toast.error` **el mensaje del servidor**
  y la fila **se queda como está** (Terminada); se aplica 8.4.
- El toast dura 8 000 ms. `sonner` **pausa el temporizador** con el puntero encima y con el foco dentro del toast (comportamiento
  por defecto de la librería, no verificado con lector de pantalla). Quien no alcance a tiempo, o use teclado, tiene la
  misma salida **siempre disponible desde el menú de estado de la fila** («Reabrir», 8.2), sin límite de tiempo.

### 8.4 Actualización optimista y errores

Se reutiliza el patrón de `handleInlineStatusChange`/`handleInlineProgressChange` de `plan-view.tsx` extraído a un
**hook pequeño compartido** (`usePlanTaskActions`/similar) que usan Planificación y Mi trabajo, para no tener dos
fuentes de verdad:

1. Fila ocupada (`rowBusyId`, una a la vez); pinta el nuevo estado.
2. Éxito: se reemplaza por la tarea que devuelve el backend (`progress`, `status`, `evidenceUrl`).
3. **Error (403/409/otro):** se revierte el estado anterior y se muestra con `toast.error` **el mensaje accionable del
   servidor** tal cual (p. ej. la predecesora que bloquea, «el proyecto está cerrado»). Sin mensaje: «No se pudo
   actualizar la tarea. Revisa tu conexión e inténtalo de nuevo.»
4. El avance en línea **no** es optimista: el diálogo de `TaskProgressControl` espera el resultado y, si falla, se queda
   abierto con el mensaje (comportamiento ya existente).
5. Sin conexión: mismo camino que el error (revierte y avisa).

---

## 9. Panel lateral

Clic en el título abre `Sheet` (`side="right"`, `closeLabel="Cerrar detalle"`,
`className="w-[40rem] max-w-full gap-4 overflow-y-auto bg-background p-5"`) con `TaskDetail embedded` — el patrón de
`plan-view.tsx` ~1463 (captura `22`). `SheetTitle` = título de la tarea (`pr-10`), `SheetDescription` sr-only.

- **Móvil < 768 px:** el panel ocupa todo el ancho y alto (`w-full`), botón de cierre de 44 px, cabecera de contexto
  con el título; el contenido hace scroll dentro del panel.
- **URL:** abrir hace `router.push('?taskId=<id>')` (el botón Atrás cierra el panel); cerrar quita el parámetro con
  `router.replace`. Cargar `/mi-trabajo?taskId=<id>` abre el panel directamente. El `page.tsx` se envuelve en
  `<Suspense>` porque usa `useSearchParams`.
- **`?taskId=` inexistente, borrado o ajeno (hallazgo N8).** La lista no lo valida: abre el panel y `TaskDetail` pide
  `GET /tasks/{id}`; si el servidor responde 404/403, el **panel muestra dentro el `ErrorState` con el mensaje del
  servidor** («No fue posible cargar la tarea.») y el botón **Cerrar detalle** (que quita el parámetro con `router.replace`)
  sigue funcionando. No se redirige ni se muestra un toast aparte. Un valor que no es un identificador válido (vacío o con
  caracteres raros) se ignora y el panel no se abre.
- **`/seguimiento/tareas?taskId=`** sigue funcionando sin cambios (enlaces de notificaciones y del Panel).
- Se pasan `phaseName`, `requestId` y `requestTitle` desde la fila (la lista ya los conoce). En
  `/seguimiento/tareas` (que no los trae) `TaskDetail` los resuelve buscando la tarea en `listMyWork()` cuando el
  actor tiene `assigned`; si no la encuentra, **oculta** el campo «Fase» en lugar de mostrar «—» (arregla el bug de las
  capturas `04`/`07`).
- `onChanged` refleja el estado/avance en la lista **sin recargar** (misma tarea actualizada).
- Predecesoras: `onSelectTask` cambia la tarea dentro del panel (comportamiento actual).
- **Foco:** al abrir, el foco entra en el panel (título/cierre); al cerrar vuelve al botón-título que lo abrió. Si la
  fila se movió o desmontó (cambió de grupo), el foco pasa al `h2` del grupo donde quedó o, en su defecto, al `h1`
  (`tabIndex={-1}`).
- Paridad con Planificación: el contenido es el mismo componente; los cambios de la sección 10 benefician a ambos.

---

## 10. Detalle de tarea simplificado (`task-detail.tsx`, compartido)

Estructura nueva, de arriba abajo (misma en página y en panel):

1. **Cabecera de resumen** (tarjeta `bg-card shadow-card`): badge de estado grande, `Hito`, chips (vencimiento,
   predecesoras pendientes, aceptada), **un solo control de avance** (`TaskProgressControl wide`) y la lista de datos
   (Responsable, Fase, Solicitud, Inicio, Vencimiento, Esfuerzo).
2. **«Actualizar estado»** (tarjeta compacta **encima de las pestañas**, no dentro de «Resumen»): así la acción principal
   queda en la primera pantalla, también en móvil (en 844 px de alto: cabecera ≈ 330 + acción ≈ 230).
3. **Pestañas** Resumen · Historial (n) · Evidencia (n).

### 10.1 Un solo control de avance

- Se **elimina el campo «Progreso (0–100)» del formulario de estado**. El avance se edita únicamente con
  `TaskProgressControl` (la barra con lápiz). Se elimina también `progress` del estado local del formulario.
- Excepción deliberada: al elegir **Terminar** con avance < 100 %, el formulario muestra una casilla
  **«Registrar avance en 100 %»** marcada por defecto (la *propuesta* del 100 %); el usuario puede desmarcarla.
  Si está marcada, `PATCH /tasks/{id}/status` lleva `progress: 100`. Es la misma petición de hoy (el campo ya existe en el
  contrato), así que no cambia el comportamiento del servidor ni el rol de los líderes.
- **Por qué la casilla existe en el detalle y no en la fila (N4).** Es una diferencia deliberada, no una omisión que haya
  que «unificar»: en la **fila** el clic en «Terminar» es una acción rápida de un solo gesto, así que aplica la propuesta de
  100 % sin preguntar, lo informa en el toast y deja «Reabrir» (8.3). En el **detalle** el usuario ya está en un
  formulario con campos, tiene espacio para decidir y puede querer cerrar con un avance distinto, así que la propuesta es
  una casilla visible y desmarcable. Las dos rutas envían la misma petición al servidor.

### 10.2 Tarjeta «Actualizar estado»

```
┌ Actualizar estado ───────────────────────────────────────┐
│ Siguiente paso                                           │
│ [ Enviar a revisión ▾ ]    ← Select con verbos (8.2); preseleccionado el avance natural
│ Nota o enlace de evidencia (opcional)                     │
│ [______________________________________________]         │  help: «Se guarda junto con el cambio de estado.»
│ ⚠ Aviso no bloqueante (si aplica)                         │
│ [ Enviar a revisión ]                                     │  ← botón principal = verbo elegido
└──────────────────────────────────────────────────────────┘
```

- El `Select` ofrece solo `nextTaskStatuses` con los **verbos de la sección 8.2** y **arranca con el siguiente paso
  preseleccionado** (en TERMINADA: «Reabrir»). Un solo clic guarda en el caso habitual.
- El **botón principal lleva el verbo elegido** («Enviar a revisión», «Terminar», «Marcar como bloqueada»…); desaparece el
  genérico «Guardar cambios». Estado `loading` con «Guardando…». Si no hay transiciones: `unavailable` y el motivo (ya
  existente).
- El campo de evidencia de texto/URL **se queda aquí** porque la API solo permite guardarla junto con un cambio de
  estado (no existe un endpoint de solo-evidencia: hallazgo para la Entrega 2). Etiqueta «Nota o enlace de evidencia
  (opcional)».
- **Avisos no bloqueantes** (`InlineNotice tone="warning"`, `role="status"`, bajo el campo; nunca deshabilitan el botón):
  - Al elegir *Enviar a revisión* o *Terminar* sin nota/URL y sin archivos: «Esta tarea no tiene evidencia (ni nota ni
    archivos). Puedes añadirla ahora o después.»
  - Al elegir *Terminar* con avance < 100 %: «El avance es {n} %. Se propone registrar 100 % al terminarla.» (junto a la
    casilla de 10.1).
  - Al elegir *Enviar a revisión* con avance < 100 %: «El avance es {n} %.»
  Para conocer los archivos, `TaskEvidenceFiles` emite `onCountChange(n)`; mientras no se conoce, **no** se muestra el aviso
  de evidencia (no se acusa de lo que no se sabe).
- Errores: `FormError` con el mensaje del servidor; los valores del formulario se conservan (AC-031); toast de error.

### 10.3 Evidencia: texto/URL separado de archivos

La pestaña **Evidencia (n)** (n = archivos + 1 si hay nota/URL) se divide en dos bloques con encabezado `h3`:

1. **«Nota o enlace»**: si es una URL web, enlace `text-link` con `ExternalLink` y «(se abre en una pestaña nueva)» para
   lectores de pantalla; si es texto, párrafo; vacío: «Sin nota ni enlace.»
2. **«Archivos adjuntos»**: `TaskEvidenceFiles` (subir, descargar, borrar) con su vacío «Sin archivos adjuntos.»

### 10.4 Móvil

La tarjeta «Actualizar estado» va tras el resumen y antes de las pestañas; el botón principal es de ancho completo y
alto 44 px; los datos del resumen pasan a 2 columnas (Esfuerzo e Inicio se agrupan al final). No se usan barras
fijas inferiores (chocan con el teclado virtual y con la barra del navegador).

---

## 11. Enlace a la solicitud

En la lista **no** hay enlace (texto plano en la sublínea). En el detalle (campo «Solicitud» del resumen):

- Si el actor tiene `allowedModules.has('requests')` → `<Link href="/demanda/solicitudes/{requestId}" class="text-link
  underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
  {requestTitle}</Link>`.
- Si no (el integrante normal) → **texto plano** `{requestTitle}` en `text-sm font-medium`. Nunca un enlace que acabe en
  «sin acceso».
- Sin `requestId` resuelto: se oculta el campo.

Mismo criterio que `plan-view.tsx` ~1421 (`allowedModules.has('requests')`).

---

## 12. Estados de la pantalla

### 12.1 Carga

`aria-busy="true"` en el contenedor y `<p role="status" class="sr-only">Cargando tus tareas…</p>`. Esqueleto:
4 `Skeleton` de contador (`h-24 rounded-xl`) + 2 tarjetas de grupo con cabecera (`h-5 w-32`) y 3 filas
(`h-14`) en escritorio, 3 tarjetas `h-40` en móvil. `animate-pulse` respeta `prefers-reduced-motion` (regla global).
Al **actualizar** con datos ya presentes se conserva la lista y el botón «Actualizar» muestra `loading`; no se vuelve
al esqueleto. Si esa petición **falla**, ver 12.4b.

### 12.2 Vacío (sin tareas asignadas)

`EmptyState` (`icon=ListChecks`, círculo `primary-subtle`): «No tienes tareas asignadas.» / «Las tareas de las que seas
responsable aparecerán aquí.» Sin contadores ni barra de filtros.

### 12.3 Al día (hay tareas, ninguna pendiente)

Si todas están terminadas: un bloque `EmptyState` compacto en lugar de los grupos pendientes — icono `CircleCheck`,
«Estás al día: no tienes tareas pendientes.» — y debajo la sección Terminadas (plegada). Los contadores quedan en 0.

### 12.4 Error de carga (sin datos previos)

`ErrorState` dentro de una tarjeta: «No fue posible cargar tu trabajo.» + mensaje del servidor + **Reintentar**
(`onRetry`). Contadores y filtros ocultos. El foco no se mueve solo (el reintento es un botón normal).

### 12.4b Fallo al actualizar con datos presentes

Si «Actualizar» (o la recarga al volver a la pestaña) falla **habiendo ya datos**, la lista **no se reemplaza** por el
`ErrorState`: se conserva lo último cargado y no se reordena nada. Se muestra: (1) `toast.error` con el mensaje del servicio
(`PlanError.message`; sin mensaje, «No se pudo actualizar. Revisa tu conexión e inténtalo de nuevo.»), y (2) sobre los
contadores un `InlineNotice tone="warning"` con `role="status"`: «No se pudo actualizar. Mostrando los datos de la última
carga.» y un botón **Reintentar** (`outline sm`). El aviso desaparece al lograr una carga correcta. **El foco no se mueve**;
el botón «Actualizar» vuelve a su estado normal. Los controles de fila siguen funcionando (si el servidor está caído,
fallarán por 8.4).

### 12.5 Sin resultados

Con filtros que no dejan nada: `EmptyState` «Ninguna tarea coincide con los filtros.» / «Prueba con otra búsqueda o
quita un filtro.» y botón **Limpiar filtros**. Los contadores se mantienen visibles (son del conjunto completo). Este estado también se aplica cuando el vacío viene de la
**búsqueda o del filtro de estado** estando un contador activo: el contador **no** se apaga solo (regla de 3), el usuario ve
«Ninguna tarea coincide» y «Limpiar filtros».

### 12.6 Región viva y foco tras acciones

- `<p role="status" aria-live="polite" class="sr-only">` única; cada acción escribe ahí (además del toast):
  «“{título}” pasó a En revisión. Ahora está en el grupo Hoy.» / «Avance de «…» actualizado a 60 %.» /
  «El filtro Vencidas se desactivó porque ya no hay tareas vencidas.»
- Si una fila **desaparece o cambia de grupo** (p. ej. Terminar), el foco pasa al **título de la fila siguiente** del
  mismo grupo; si no hay, al `h2` del grupo (`tabIndex={-1}`); si el grupo desaparece, al `h1`. Nunca se pierde en
  `body`.

---

## 13. Responsive resumido

| Ancho | Layout |
| --- | --- |
| ≥ 1280 | Tabla de 4 columnas (Tarea 336 px a 1280 con sidebar de 240; 496 a 1440). Contadores 4 en fila. |
| 1024–1279 | Misma tabla con el sidebar en riel de 56 px: Tarea ≈ 280 px a 1024 (cuenta en la sección 6). Contadores 4 en fila. |
| 768–1023 (tablet) | **Tarjetas** por grupo (como móvil); contadores 2×2; cabeceras `sticky`; objetivos de 44 px; panel lateral de `w-[40rem] max-w-full`. **No verificado en tablet real.** |
| < 768 | Tarjetas por grupo; contadores 2×2; cabeceras de grupo `sticky`; panel a pantalla completa; objetivos de 44 px. |
| 320 | Sin scroll horizontal; textos largos con `wrap-break-word`. |

---

## 14. Teclado y foco

| Contexto | Interacción |
| --- | --- |
| Contadores | Tab llega a cada uno; Enter/Espacio alterna `aria-pressed`. Al activar, el foco **se queda** en el contador. |
| Grupos | `section[aria-labelledby]`; los lectores navegan por encabezados `h2`. Terminadas: Enter/Espacio pliega; el foco no se mueve. |
| Fila | Tab: título → avance → estado → siguiente paso (hasta 4 paradas: 3 en `POR_HACER` y en `TERMINADA`, ver 6.3). El resto de la fila no es enfocable. |
| Menú de estado | Enter/Espacio/↓ abre; ↑↓ recorre; Enter elige; Esc cierra y devuelve el foco al disparador. |
| Avance | Abre el diálogo de `TaskProgressControl`: foco en el deslizador; ←/→ ±5; Enter en el número guarda; Esc cancela y devuelve el foco. |
| Panel | Foco atrapado (Radix); Esc cierra; al cerrar vuelve al título que lo abrió (o al `h2`/`h1`, sección 9). |
| Toast con acción | La acción («Reabrir», «Añadir evidencia») es un botón alcanzable con Tab y se anuncia por la región de `sonner`. El temporizador (8 s) se pausa con hover o foco dentro del toast; la misma salida existe en el menú de estado de la fila, sin límite de tiempo (8.3). |

Foco siempre visible: `outline-2 outline-ring outline-offset-2` (en los contadores `offset-4`). Nunca se enfoca sobre
`primary-subtle` en oscuro (2.75:1). `prefers-reduced-motion` ya anula transiciones y animaciones globalmente.

---

## 15. Tema claro y oscuro, y tokens

El layout es idéntico en los dos temas. Solo **tokens semánticos existentes**; no se crea ninguno ni se admite color
crudo.

| Uso | Token |
| --- | --- |
| Tarjetas de grupo, contadores, tarjetas móviles | `bg-card` + `shadow-card` + `rounded-xl` |
| Panel lateral | `bg-background` |
| Texto principal / de apoyo | `text-foreground` / `text-muted-foreground`, `text-meta` |
| Enlaces | `text-link` |
| Vencida / bloqueada | `danger` (texto `text-danger`, `Badge variant="danger"`, filete `border-t-danger`, banda `--color-danger`) |
| Hoy / pronto | `warning` |
| En curso / acento | `primary` (`border-t-primary`, `ring-primary`); **nunca** como color de texto sobre `card` (3.37 en oscuro) |
| Terminada | `success` (barra tono `done`) |
| Chips | `Badge` existente (`danger`, `warning`, `outline`); estado con `StatusBadge kind="task"` |
| Pista de la barra | `bg-muted` |
| Chip de conteo | `bg-muted text-muted-foreground` |
| Capas | Cabeceras de grupo pegajosas: `z-10` (por debajo de la barra móvil `z-30`). Menú, diálogo y panel **heredan `z-50`** de `ui/dropdown-menu`, `ui/dialog`/`ui/sheet`: no se añade clase. (`z-sticky`/`z-overlay` solo están *propuestos* en `planeacion-ux.md`; no existen en el código.) |
| Valor del contador «En curso» | `text-foreground` (14.75 · 14.98); el filete sigue en `primary` |

Notas del modo oscuro: el relleno `primary` de la barra mide 3.08:1 sobre la pista (al límite; el valor siempre va en
texto, no bajar la pista); el contador activo se marca con anillo + icono, no con fondo; `shadow-card` oscuro ya es más
denso.

---

## 16. Contrastes medidos (WCAG 2.2 AA)

**Método.** Script Node temporal (ya eliminado) que lee `apps/web/src/app/globals.css`, quita los comentarios, resuelve
`var(--x)` y convierte cada token OKLCH de `:root` y `.dark` a sRGB (Oklab → sRGB lineal → gamma; recorte de gamut), compone
los translúcidos sobre su fondo real (`bg-muted/50` sobre `card`, `Badge` = token al 10–14 % sobre `card` o sobre la fila en
hover), calcula la luminancia relativa y la razón `(L1+0.05)/(L2+0.05)`. Control cruzado: los pares comunes coinciden
con los ya publicados en `planeacion-ux.md` §6 (p. ej. `foreground`/`card` 14.75 · 14.98; `text-link`/`card` 6.14 · 7.35;
barra `primary`/pista 3.88 · 3.08). Umbrales: texto normal ≥ **4.5:1**; iconos informativos, bordes de control, foco y
rellenos ≥ **3:1**. Todo lo de abajo cumple, salvo las filas marcadas ✘: las **prohibidas** (el diseño no las usa: `primary` como texto,
`primary-subtle` como fondo del foco) y los tres límites de hover de botones existentes de la nota (5). Cifras de esta
revisión recalculadas con un script propio nuevo (también borrado) y coincidentes con las de la primera versión y con
una verificación independiente de la revisión.

### 16.1 Texto

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| `foreground` / `card` | 14.75 ✔ | 14.98 ✔ | 4.5 |
| `foreground` / `background` (panel lateral) | 12.86 ✔ | 16.66 ✔ | 4.5 |
| `muted-foreground` / `card` (sublínea, fecha, %) | 7.13 ✔ | 7.62 ✔ | 4.5 |
| `muted-foreground` / `background` (descripción de página, panel) | 6.22 ✔ | 8.47 ✔ | 4.5 |
| `foreground` / fila en hover (`muted/50` sobre `card`) | 13.24 ✔ | 14.33 ✔ | 4.5 |
| `muted-foreground` / fila en hover | 6.40 ✔ | 7.29 ✔ | 4.5 |
| `text-link` / `card` | 6.14 ✔ | 7.35 ✔ | 4.5 |
| `text-link` / `background` | 5.36 ✔ | 8.17 ✔ | 4.5 |
| `text-danger` / `card` (valor «Vencidas», título del grupo Vencidas) | 6.59 ✔ | 7.20 ✔ | 4.5 |
| `text-danger` / fila en hover | 5.91 ✔ | 6.89 ✔ | 4.5 |
| `text-warning` / `card` (valor «Para hoy», avisos) | 6.76 ✔ | 9.57 ✔ | 4.5 |
| `text-success` / `card` | 6.74 ✔ | 9.19 ✔ | 4.5 |
| `primary-foreground` / `primary` (botón «Terminar») | 4.84 ✔ | 4.84 ✔ | 4.5 |
| `foreground` / `accent` (opción de menú enfocada, botón outline en hover) | 11.83 ✔ | 12.80 ✔ | 4.5 |
| `foreground` / `popover` (menú de estado) | 14.75 ✔ | 14.13 ✔ | 4.5 |
| `muted-foreground` / `popover` (nota «Siguiente paso» del menú) | 7.13 ✔ | 7.19 ✔ | 4.5 |
| `muted-foreground` / `muted` (chip de conteo del grupo) | 5.72 ✔ | 6.95 ✔ | 4.5 |
| `muted-foreground` / `accent` (nota «Siguiente paso» en el ítem de menú enfocado) | 5.72 ✔ | 6.51 ✔ | 4.5 |
| `text-link` / fila en hover (título enlazado en el detalle) | 5.51 ✔ | 7.03 ✔ | 4.5 |
| `primary-foreground` / `primary-hover` (botón «Terminar» al pasar el puntero) | 6.14 ✔ | 6.14 ✔ | 4.5 |
| `accent-foreground` / `accent` (botones `outline`/`ghost` al pasar el puntero: «Siguiente paso», «Actualizar») | 11.83 ✔ | 12.80 ✔ | 4.5 |
| `muted-foreground` / `card` (valor del contador **deshabilitado**; exento por inactivo, medido igual) | 7.13 ✔ | 7.62 ✔ | 4.5 |
| **`primary` / `card` como COLOR DE TEXTO — no se usa** (valor de «En curso» pasó a `text-foreground`, M2) | 4.84 ✔ | **3.37 ✘** | 4.5 |

### 16.2 Insignias y chips (token sobre su propio fondo translúcido)

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| `success` / `success/12` sobre `card` | 5.62 ✔ | 7.17 ✔ | 4.5 |
| `success` / `success/12` sobre fila en hover | 5.08 ✔ | 6.82 ✔ | 4.5 |
| `warning` / `warning/14` sobre `card` («Vence hoy», «Vence en N días») | 5.47 ✔ | 7.19 ✔ | 4.5 |
| `warning` / `warning/14` sobre fila en hover | 4.94 ✔ | 6.83 ✔ | 4.5 |
| `danger` / `danger/12` sobre `card` («Vencida hace N días», «Bloqueada») | 5.40 ✔ | 5.95 ✔ | 4.5 |
| `danger` / `danger/12` sobre fila en hover | 4.87 ✔ | 5.66 ✔ | 4.5 |
| `info` / `info/12` sobre `card` («En curso», «En revisión») | 5.77 ✔ | 6.43 ✔ | 4.5 |
| `info` / `info/12` sobre fila en hover | 5.21 ✔ | 6.13 ✔ | 4.5 |
| `neutral` / `neutral/10` sobre `card` («Por hacer») | 7.24 ✔ | 7.60 ✔ | 4.5 |
| `neutral` / `neutral/10` sobre fila en hover | 6.53 ✔ | 7.24 ✔ | 4.5 |
| `text-link` / `primary/12` sobre `card` (`Badge accent`) | 5.21 ✔ | 6.51 ✔ | 4.5 |
| `foreground` / `card` (texto de «Hito», `Badge outline`) | 14.75 ✔ | 14.98 ✔ | 4.5 |
| `foreground` / fila en hover (texto de «Hito», `Badge outline`, sobre `muted/50`) | 13.24 ✔ | 14.33 ✔ | 4.5 |

### 16.3 No texto (iconos, bordes, foco, rellenos)

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Anillo/contorno `ring` (`primary`) / `card` (contador activo, foco dentro de filas) | 4.84 ✔ | 3.37 ✔ | 3 |
| `ring` / `background` (foco de contadores con `offset-4`, foco fuera de tarjetas) | 4.22 ✔ | 3.75 ✔ | 3 |
| `ring` / fila en hover | 4.34 ✔ | 3.23 ✔ | 3 |
| `ring` / `popover` (foco en menú y diálogo) | 4.84 ✔ | 3.18 ✔ | 3 |
| `ring` / `primary-subtle` — **no se usa** como fondo de nada enfocable | 3.93 ✔ | **2.75 ✘** | 3 |
| `border-strong` / `card` (borde de «Hito» y de los botones `outline` en reposo) | 3.64 ✔ | 3.51 ✔ | 3 |
| `ring` / `accent` (foco **pegado** al botón en hover) — **no ocurre**: el contorno lleva `outline-offset-2` y cae sobre `card` (fila arriba, 4.84 · 3.37) | 3.88 ✔ | **2.88 ✘** | 3 |
| `border-strong` / `accent` (borde de un botón `outline` en hover) — límite conocido, ver nota (5) | **2.92 ✘** | 3.00 ✔ | 3 |
| `primary-hover` / `card` (límite del botón «Terminar» en hover) — ver nota (5) | 6.14 ✔ | **2.66 ✘** | 3 |
| `input` / `card` (borde de campos y selects) | 3.95 ✔ | 3.81 ✔ | 3 |
| `input` / `background` (borde de campos en la barra de filtros) | 3.44 ✔ | 4.24 ✔ | 3 |
| Filete/banda `danger` / `card` | 6.59 ✔ | 7.20 ✔ | 3 |
| Filete/banda `danger` / fila en hover | 5.91 ✔ | 6.89 ✔ | 3 |
| Filete `warning` / `card` (contador «Para hoy») | 6.76 ✔ | 9.57 ✔ | 3 |
| Filete `primary` / `card` (contador «En curso») | 4.84 ✔ | 3.37 ✔ | 3 |
| Relleno de barra `primary` / pista `muted` | 3.88 ✔ | 3.08 ✔ | 3 |
| Relleno de barra `success` / pista `muted` | 5.41 ✔ | 8.38 ✔ | 3 |
| Relleno de barra `warning` / pista `muted` (Bloqueada) | 5.42 ✔ | 8.74 ✔ | 3 |
| Relleno de barra `danger` / pista `muted` (vencida) | 5.28 ✔ | 6.57 ✔ | 3 |
| Icono/chevron `muted-foreground` / `card` | 7.13 ✔ | 7.62 ✔ | 3 |
| Icono del grupo Vencidas `danger` / `card` | 6.59 ✔ | 7.20 ✔ | 3 |

Consecuencias de diseño tomadas de la medición: (1) el contador activo usa **anillo + icono** sobre `card`, no un fondo
`primary-subtle`, porque el foco sobre él cae a 2.75:1 en oscuro; (2) el foco de los contadores se dibuja con
`outline-offset-4` sobre el lienzo (4.22 · 3.75); (3) la barra `primary` en oscuro (3.08) queda al límite, aceptado porque el
valor numérico siempre acompaña a la barra; (4) ningún par de texto depende de `opacity`; (5) **estados de hover de botones existentes (N9):** se midieron y tres
pares de *límite visual* no llegan a 3:1 solo en el instante del hover (`border-strong`/`accent` 2.92 en claro;
`primary-hover`/`card` 2.66 en oscuro; `ring`/`accent` 2.88 en oscuro, que además no ocurre por el `outline-offset-2`).
Son los tokens de `button.tsx`, comunes a todo el portal, y no se cambian aquí: el botón se identifica por su **texto**
(≥ 4.5:1 en hover, arriba) y por su forma y borde en reposo (3.64 · 3.51 para `outline`; relleno `primary`/`card` 4.84 · 3.37
para «Terminar»), de modo que no se pierde la identificación del control. Se registra como límite conocido para el sistema
de diseño, no como incumplimiento nuevo de esta vista. **No medido:** `forced-colors` ni los toasts de `sonner` (componente
ya existente); la lista de «no verificado» de la sección 19 lo repite.

---

## 17. Componentes y archivos

| Archivo | Cambio |
| --- | --- |
| `lib/my-work-groups.ts` (nuevo) | `groupMyWork`, `compareWithinGroup`, `weekEndOf`; módulo puro. |
| `lib/task-next-step.ts` (nuevo) | `nextStepFor`, `transitionActionLabel`, `ACTION_LABELS`; puro. |
| `lib/use-today-local.ts` (nuevo) | Hook que devuelve «hoy» local y se renueva a medianoche y al volver a la pestaña. |
| `app/mi-trabajo/mi-trabajo-view.tsx` | Reescritura: contadores, grupos, filas, tarjetas, panel. Se parte en `my-work-counters.tsx`, `my-work-group.tsx`, `my-work-row.tsx`, `my-work-card.tsx` si supera ~300 líneas. |
| `app/mi-trabajo/page.tsx` | Envolver en `<Suspense>` (usa `useSearchParams`). |
| `app/seguimiento/plan/task-status-control.tsx` | Prop opcional `actionLabels`/`nextStep`; `className`/`size` para el objetivo táctil de 44 px. |
| `app/seguimiento/plan/task-progress-control.tsx` | `className` para `min-h-11` en móvil. |
| `app/seguimiento/tareas/task-detail.tsx` | Sección 10 (un control de avance, tarjeta «Actualizar estado», evidencia separada, avisos, `phaseName`/`requestId`/`requestTitle`, `initialTab`). |
| `app/seguimiento/tareas/task-evidence-files.tsx` | `onCountChange(n)`. |
| `app/seguimiento/tareas/tareas-view.tsx` | Resolver `phaseName`/solicitud vía `listMyWork()`; no romper `?taskId=`. |
| `app/seguimiento/plan/plan-view.tsx` | Solo si se extrae el hook de acciones en línea compartido; sin cambio visual. |

Prohibido: Prisma, API, contrato, MCP, esquema, permisos, nuevas dependencias (todo se hace con Radix/`sonner`/`lucide`
ya instalados).

---

## 18. Pruebas sugeridas

- **Unitarias (`e2e/web-lib.spec.ts`, módulos puros):** `groupMyWork` con hoy, ayer, mañana, viernes/sábado/domingo
  (límite de «Esta semana»), lunes, sin fecha, fecha inválida, terminadas con fecha vencida, medianoche (23:59 y 00:00),
  cambio de mes, de año y 29 de febrero; `todayLocal` inválido (`RangeError`); `endDate` inválida (cae en «Sin fecha»); estado fuera del enum (`nextStepFor` → `null`); orden interno (iniciado primero, hito primero, desempate estable);
  `nextStepFor`/`transitionActionLabel` para los 5 estados (coherentes con `TASK_TRANSITIONS`: ningún siguiente paso fuera
  de la máquina).
- **Playwright (en CI):** contadores y agrupación con el seed; filtro por contador (activo/aria-pressed, combinación con
  búsqueda); Terminadas plegada y despliegue; una acción en línea (Empezar/Enviar a revisión) con y sin error del servidor;
  EN_CURSO→TERMINADA en 2 acciones; apertura del panel y `?taskId=`; `/seguimiento/tareas?taskId=` intacto; enlace a la
  solicitud solo con módulo `requests`. Ajustar `e2e/date-display.spec.ts` y los specs con `getByRole('row')` en `/mi-trabajo`.
- **Manual:** teclado completo, lector de pantalla (NVDA/VoiceOver), tablet 768–1023, zoom 200 %, `forced-colors`.

---

## 19. Riesgos, no verificado y hallazgos para entregas siguientes

**Riesgos.** (1) «Terminar» propone 100 % y lo aplica con opción de **reabrir** (no restaura `EN_REVISION`, 8.3): si el negocio exige que el miembro decida el
avance, pasar a confirmación (Entrega 3). (2) Reordenar al vuelo puede desorientar: se mitiga con región viva y foco
(12.6). (3) hasta 4 paradas de teclado por fila son muchas con listas grandes: el atajo es la búsqueda y los contadores.
(4) Regresión de e2e que dependen de la tabla actual.

**No verificado.** Lectores de pantalla, tablet real (el ancho de 280 px de Tarea a 1024 px sale de cuentas con las clases
reales del shell, no de una medición en el navegador), `forced-colors`, que `sonner` pause el temporizador con hover/foco
(comportamiento esperado de la librería, sin comprobar), contrastes de toasts, los tres límites de hover de la nota 16(5),
rendimiento con cientos de tareas (el volumen de
la BD de prueba es 16), Playwright local (BL-018, se valida en CI).

**Hallazgos para la Entrega 2 (API/contrato/MCP, no se hacen ahora).** `TaskResponseDto` sin `phaseName`, `requestId` ni
`requestTitle`; `/my-work` sin predecesoras pendientes, estado operativo de la solicitud (proyecto cerrado), responsable y
fecha de compromiso, y sin conteo de evidencia; ausencia de un endpoint de «solo evidencia» (hoy va atada a un cambio de
estado). **Entrega 3:** motivo de bloqueo (migración), regla de cierre (evidencia/avance mínimo, quién revisa).

---

## 20. Respuestas a la revisión de la especificación

Revisión: `spec-review.json` (CHANGES_REQUESTED: 7 MEDIO, 9 NIT). Todos se atendieron en este documento; ninguno exige API.

| Hallazgo | Resolución | Sección |
| --- | --- | --- |
| M1 clases `z-sticky`/`z-overlay` inexistentes | Corregido: cabeceras `z-10` (bajo `z-30`); menú, diálogo y panel heredan `z-50`; aclarado que las otras clases solo están propuestas. | 7, 8.2, 15 |
| M2 valor «En curso» en `text-primary` | Corregido: `text-foreground` (14.75 · 14.98); `primary` solo en filete y anillo; se añadió la fila prohibida a la tabla medida. | 3, 15, 16.1 |
| M3 layout 768–1023 contradictorio | Elegida la opción (a): tarjetas hasta `< lg`, tabla desde 1024 px sin `min-w`; anchos de Tarea calculados con las medidas reales del shell (280 / 336 / 496 px). | 6, 7, 13 |
| M4 «Deshacer» de Terminar | Renombrado a «Reabrir»; lleva a `EN_CURSO` con el avance previo en el mismo PATCH; 409/403 muestran el mensaje del servidor y la fila no cambia; el estado `EN_REVISION` no se recupera. | 8.3 |
| M5 `POR_HACER` sin estado definido | **Matiz:** el componente compartido ya bloquea `POR_HACER` y `TERMINADA` (`progressLockedReason`), contra lo supuesto en la revisión; la spec ahora lo documenta y exige que Mi trabajo no pase nada extra. | 6.2 |
| M6 fallo de refresco con datos | Nueva 12.4b: lista intacta, toast, aviso con Reintentar, foco quieto. | 12.1, 12.4b |
| M7 auto-apagado ambiguo | Regla única: solo cuando el propio conteo (sobre todas las tareas) llega a 0; búsqueda/estado vacíos → «Sin resultados». | 3, 12.5 |
| N1 estado fuera del enum | Documentado: neutro, sin menú ni botón, avance deshabilitado. | 6.2, 8.1 |
| N2 «Sin permiso» | Chip y avance deshabilitados con motivo; botón omitido. | 6.2, 8.1 |
| N3 paradas de teclado | «Hasta 4»: 3 en `POR_HACER` y `TERMINADA`. | 6.3, 14, 19 |
| N4 casilla 100 % solo en el detalle | Justificado como diferencia deliberada. | 10.1 |
| N5 toast de 8 s | `sonner` pausa en hover/foco (sin verificar); salida permanente en el menú. | 8.3, 14 |
| N6 `useTodayLocal` | Medianoche con `new Date(y, m, d + 1)`; `todayLocal` inválido lanza `RangeError`; formato del límite con `formatDateOnlyWithWeekday`. | 5.1 |
| N7 «Ver las N restantes» | Revela todo, no se recuerda, foco a la primera fila revelada, expansión automática al reubicar. | 2 |
| N8 `?taskId=` inexistente/ajeno | Error del servidor dentro del panel y «Cerrar detalle» funcional. | 9 |
| N9 contrastes faltantes | Medidos: botones en hover, `Badge outline` en hover, contador deshabilitado, `ring` sobre `accent`; tres límites de hover de componentes existentes quedan declarados como límite conocido. | 16 |