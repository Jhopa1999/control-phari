# Planificación (`/seguimiento/plan`): especificación UX/UI

Especificación visual y de interacción (rol Diseñador). No toca código de la aplicación ni el backend.
Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md` y la identidad de
`docs/design/identidad-color-menu.md` (menú marino, lienzo `#EBF0F7`, filete degradado). Solo tokens
semánticos, texto azul con `text-link`, foco con `--ring`, textos en español con tildes.

Los contrastes de la sección 6 están **medidos** (WCAG 2.2, luminancia relativa sRGB, tokens OKLCH de
`globals.css` convertidos a sRGB; lo translúcido se compuso sobre su fondo real). Las capturas citadas están en
`docs/design/capturas-planeacion/`.

---

## 0. Resumen ejecutivo

| # | Petición | Decisión |
| --- | --- | --- |
| 1 | Un exportar, un importar, solo Excel | **«Exportar a Excel»** + **«Importar desde Excel»**; la plantilla pasa a un enlace de ayuda junto al importar y dentro del diálogo de confirmación. Se retira CSV. El grupo vive en la tarjeta de resumen del plan. |
| 3 | Fase poco visible al crear tarea | Diálogo de tarea reordenado en 4 bloques; **Fase** es un selector destacado, justo bajo el título, **siempre preseleccionado** (fase de origen, fase filtrada o fase inicial) y con su rango de fechas visible. Botón **«Nueva tarea»** en la sección Tareas (tabla y kanban). |
| 4 | Cambiar % sin entrar al detalle | Columna **Avance** (barra + %) que es un botón: abre un **popover** con deslizador (paso 5), campo numérico, atajos 0/25/50/75/100 y **Guardar** explícito. Mismo control en la tarjeta kanban y en la cabecera del detalle. |
| 5 | Ver el estado en el detalle | Cabecera fija del detalle: título, **insignia de estado grande con icono**, barra de avance, responsable, fase, fechas y chips de vencimiento/bloqueo. |
| 6 | Traza de cambios | Pestaña **Historial** con línea de tiempo agrupada por día: quién, fecha y hora, campo, valor anterior → nuevo. Consume `GET /tasks/{id}/history` (ya en curso en la API). |
| 7 | Abrir detalle desde el kanban | El **título es un botón** (teclado y lector) y la **tarjeta completa** es clicable salvo sus controles; el arrastre se conserva. |
| 9 | Barra blanca sobre el menú | Causa: el menú fijo está en `z-20` y las barras sticky en `z-30`; cualquier desbordamiento horizontal de la página las desliza por encima. Regla de capas con tokens y `overflow-x-clip` en la columna. |
| 10 | Libertad total | Tabla de 9 → 6 columnas, tarjetas móviles, indicadores de vencimiento/bloqueo, resumen con métricas, guía de envío con pendientes visibles arriba, estados vacío/carga/error, modo oscuro. |

### 0.1 Prerrequisitos de API (decididos aquí, a implementar antes del front)

La regla del repositorio es que la API manda; dos de las peticiones **no se pueden cumplir hoy sin ella**:

1. **Cambiar solo el avance no existe.** `PATCH /tasks/{id}/status` exige `status` y valida la transición
   (`isTaskTransitionAllowed`); `EN_CURSO → EN_CURSO` no está permitida, así que no se puede enviar solo `progress`.
   Recomendación: **`PATCH /tasks/{id}/progress` con `{ progress: 0..100 }`** (opción A) y no relajar la máquina de estados (opción B,
   descartada porque abre la puerta a «cambios de estado» sin cambio y ensucia la auditoría). Reglas que debe imponer el backend
   (la UI solo las refleja, como hace `task-transitions.ts`): editable en `EN_CURSO`, `BLOQUEADA` y `EN_REVISION`; en `POR_HACER` y
   `TERMINADA` responde 409. Mismos permisos que el cambio de estado (jefe, líder o responsable). Audita `UPDATE TASK` con
   `before/after { progress }` para que aparezca en el historial.
2. **Historial.** `GET /tasks/{id}/history` (`TaskHistoryEntryDto`: `id, createdAt, action, actorUserId, actorName, changes[{field, from, to}]`)
   ya está en el árbol de trabajo. Esta especificación asume ese contrato tal cual. Notas del DTO que condicionan la UI: `from/to` son
   **texto** (fechas ISO, `true/false`, códigos de estado), la API devuelve como máximo **200** eventos y fase/responsable ya llegan con nombre.

Nota: al cerrar este documento el árbol de trabajo ya contiene `dto/update-task-progress.dto.ts` y cambios en el contrato y el MCP; si coinciden con lo anterior, el paso 0 del orden de implementación queda cubierto y solo falta verificar las reglas por estado.

Todo lo anterior arrastra, por la regla 55: OpenAPI, `schema.d.ts`, tool del MCP (`task.progress.update`, `task.history`), `modulos-backend.md`
y `changelog.json`. Ver sección 10.

### 0.2 Supuestos

- «Hoy» para vencimientos es la fecha local del usuario (`localDateInputValue`) comparada con `endDate` en UTC solo-fecha (`formatDateOnly`).
  Es un indicador visual; la API no calcula vencimiento.
- El módulo lo usan jefe y líder (el módulo `plan` no admite integrantes); el integrante entra por «Mi trabajo». Se mantiene la regla
  actual: cambiar estado/avance no depende de `canEdit`.
- Se añade **una** dependencia: `@radix-ui/react-popover` (versión exacta, misma familia que los Radix ya instalados). Alternativa sin
  dependencia en 4.5.4.

---

## 1. Diagnóstico por captura

Capturas originales 01–05 (1280×900 y 1024) y adicionales `ux-a` … `ux-e` tomadas con Playwright sobre el entorno local
(plan *Autorizado*, 1 fase, 2 tareas). Los estados editables (borrador, diálogo «Nueva tarea») no tienen captura porque el plan de
prueba está autorizado; se diagnostican por lectura de `task-dialog.tsx`.

**01-plan-arriba (1280×900)**
- La cabecera cumple la identidad: menú marino, filete degradado, línea bajo el h1.
- La descripción de la página (2 líneas) y la barra «Solicitud» ocupan ~190 px antes del primer dato útil.
- El aviso azul «El plan está autorizado…» y el *Resumen del plan* repiten el estado tres veces (selector, aviso, resumen).
- El resumen solo muestra 4 fechas/nombres: no responde a «¿cómo va el plan?» (sin avance, sin vencidas, sin bloqueadas).

**02-plan-completo / 03-tareas-tabla**
- **Cuatro botones iguales** (`Exportar plan (Excel)`, `Descargar plantilla`, `Exportar tareas (CSV)`, `Importar plan (Excel)`) con el mismo peso;
  «Importar» deshabilitado con un motivo en otra línea que desalinea la fila. No se entiende qué hace cada uno ni cuál es el «correcto».
- La tabla de tareas tiene **9 columnas** (Tarea, Fase, Responsable, Inicio, Vence, Esfuerzo, Predecesoras, Estado, Acciones) y a 1280 ya
  se corta («E…» en el borde derecho): el **Estado**, lo más importante, queda fuera de vista y el avance (%) va pegado al estado en texto gris.
- El responsable es un `Select` completo con borde y fondo gris en **cada fila**: ruido visual de campos de formulario repetidos.
- Aviso de captura: en 02 el menú aparece desplazado respecto de la barra superior. Es un artefacto de `fullPage` con elementos `fixed/sticky`,
  no un defecto; **no** usar capturas full-page para juzgar capas (por eso se tomó `ux-a`).

**04-tareas-kanban (= tabla en el fichero original)** — el `radio` no se activó y la imagen es idéntica a 03. En `ux-e-kanban-375` se ve el kanban a 375:
las columnas (`w-72`, `min-w-max`) empiezan bajo el pliegue y el usuario ve primero 4 filtros apilados (≈ 330 px) antes de la primera tarjeta.
Del código (`plan-tasks-kanban.tsx`): tarjeta con `cursor-grab`, título sin acción, `TaskResponsibleControl` (select completo) y
`TaskStatusControl` (chip + %) → 3 controles de formulario por tarjeta; **no hay forma de abrir el detalle** (petición 7).

**05-zoom-1024** — menú en riel (56 px) y tabla ya cortada en «Predecesoras». Los botones de Excel se parten en dos filas con el motivo del
importar colgando. Esto es lo que el usuario ve al hacer zoom 125 %.

**ux-a-apilamiento-1100 (reproducción de la petición 9)** — con la página desplazada horizontalmente 300 px, la barra superior blanca
(`sticky z-30`) **tapa la parte alta del menú fijo** (`fixed z-20`): se pierde el logo y el menú queda «cortado» bajo la barra.
`document.elementsFromPoint(120, 24)` devuelve primero `DIV.sticky top-0 z-30…`, no el `aside#app-sidebar`.

**ux-b-cajon-600** — en modo cajón el menú (`Sheet`, `z-50`) queda correctamente por encima de la barra móvil (`z-30`): el modo cajón **no**
es la causa en Chromium.

**ux-d-detalle** — el panel lateral abre con *Evidencia* primero, el estado es una insignia pequeña («Bloqueada 0 %») sin responsable, fase ni
fechas, y la acción principal es un formulario con «Nuevo estado» vacío. Responde la petición 5 y explica por qué no se «ve» el estado.
No hay historial. El panel usa `bg-background` y el título `pr-10`, correcto.

---

## 2. Decisiones y alternativas descartadas

### 2.1 Exportar / importar (petición 1)
- **Elegido**: dos acciones, un único formato. «Exportar a Excel» (plan completo: fases, tareas y predecesoras) e «Importar desde Excel»
  (reemplaza). La plantilla se conserva como **enlace de ayuda** porque quien importa por primera vez necesita el formato; quitarla sería peor
  que tenerla escondida. No es un tercer botón: es texto-enlace subordinado al importar.
- Descartado: menú «Excel ▾» con Exportar/Importar/Plantilla (oculta acciones frecuentes tras un clic y rompe «un exportar y un importar» a la vista);
  conservar «Exportar tareas (CSV)» (el usuario pidió solo Excel y duplica la exportación; la vista filtrada se puede recuperar filtrando el Excel).
- Se mueve de una fila suelta a la **tarjeta del resumen**: es acción de nivel plan y así la fila desaparece (−56 px de alto).

### 2.2 Edición del avance (petición 4)
| Opción | Veredicto |
| --- | --- |
| Deslizador siempre visible en cada fila | Descartada: arrastres accidentales al hacer scroll táctil, altura de fila, ruido para lectores de pantalla. |
| Guardado automático con *debounce* | Descartada: genera un evento de auditoría por cada ajuste del deslizador y no hay confirmación clara. |
| Campo numérico editable en la celda | Descartada: objetivo táctil pequeño y sin vista previa. |
| Stepper −/+ de 10 en 10 | Descartada como control único: de 0 a 100 son 10 clics; se conserva como atajo (chips). |
| **Popover con deslizador + número + atajos + Guardar** | **Elegida**: un clic abre, un gesto elige, Guardar confirma; mismo componente en tabla, kanban y detalle. Teclado completo. |

### 2.3 Detalle desde el kanban (petición 7)
- **Elegido**: botón-título (accesible) + clic en la tarjeta (conveniencia) con exclusión de controles interiores.
- Descartado: *stretched link* (`after:absolute after:inset-0`) sobre el título: en Firefox un `<button>` dentro de un elemento `draggable` impide iniciar el arrastre desde su área.
- Descartado: doble clic (no descubrible, inaccesible).

### 2.4 Detalle: pestañas frente a scroll único (petición 6)
- **Elegido**: cabecera fija + pestañas *Resumen / Historial (n) / Evidencia*. El panel mide ~900 px de contenido; con scroll único el historial queda a 3 pantallas.
  El contador `(n)` hace que el historial se descubra sin abrirlo.
- Descartado: acordeones (más clics, peor para lectores) y mover el historial a una página aparte (pierde el contexto del plan).

### 2.5 Tabla: menos columnas
- Sale **Fase** como columna (pasa a la línea secundaria bajo el título, y se omite si hay una sola fase), **Esfuerzo** y **Predecesoras** (pasan al detalle; la
  predecesora pendiente se refleja con un chip de bloqueo). **Inicio y Vence** se funden en **Plazo**. El orden por «Inicio» y «Estado» se conserva en un selector
  **«Ordenar por»** en la barra de filtros, que además sirve al kanban y a las tarjetas móviles (hoy el kanban no se puede ordenar).

### 2.6 Dónde vive «Nueva tarea»
Hoy solo existe «Agregar tarea» por fase (y en el kanban crea en la fase inicial en silencio, causa raíz de «la fase está oculta»). Se añade **«Nueva tarea»**
en la cabecera de la sección Tareas para ambas vistas; el diálogo siempre muestra la fase.

---

## 3. Capas (z-index): causa y regla (petición 9)

### 3.1 Causa probable
En `app-shell.tsx` la barra superior de escritorio es `sticky top-0 z-30` dentro de la columna de contenido; en `mobile-nav.tsx` la barra móvil es
`sticky top-0 z-30`; el menú de escritorio (`app-sidebar.tsx`) es `fixed inset-y-0 left-0 z-20`. Los tres comparten el contexto de apilamiento raíz
(el contenedor `flex min-h-dvh` no crea uno) y **la barra (30) gana al menú (20)**. Normalmente no se solapan porque la columna empieza a la derecha de un
marcador de posición de 240/56 px. Se solapan en cuanto la columna se desplaza hacia la izquierda por debajo del menú fijo, es decir, cuando la página
tiene desbordamiento horizontal: el scroll mueve la columna (y su barra sticky) pero no el `fixed`. Con zoom del navegador cambian los puntos de corte
(`lg` 1024 y el riel automático 1024–1279), se estrechan las columnas y cualquier elemento ancho que no sea contenedor de scroll provoca ese desbordamiento.

Lo verificado: la reproducción forzada (`ux-a`), `elementsFromPoint` y el cajón correcto a 600 px (`ux-b`). Lo **no** verificado: no logré un desbordamiento
horizontal *natural* en Chromium entre 375 y 1280 px (`scrollWidth == clientWidth` en todos), así que el disparador exacto del usuario (¿qué navegador, qué
zoom, qué pantalla?) queda por confirmar. La causa de capas es sólida; el disparador puede variar. Si el caso del usuario fuera otro (p. ej. un desplegable
de módulos propio del menú), la regla de capas de abajo también lo cubre porque el menú pasa a estar por encima de todo lo que no sea overlay.

### 3.2 Regla de capas (tokens)
Nuevo bloque en `globals.css` (sin tocar colores):

```css
:root {
  --z-sticky: 10;   /* cabeceras pegajosas dentro del contenido (pestañas del panel, cabeceras de día) */
  --z-topbar: 30;   /* barras superiores (escritorio y móvil) */
  --z-sidebar: 40;  /* menú fijo de escritorio: por encima de las barras */
  --z-overlay: 50;  /* diálogos, cajones, popovers, selects, menús, tooltips */
  --z-skip: 60;     /* «Saltar al contenido» */
}
@utility z-sticky  { z-index: var(--z-sticky); }
@utility z-topbar  { z-index: var(--z-topbar); }
@utility z-sidebar { z-index: var(--z-sidebar); }
@utility z-overlay { z-index: var(--z-overlay); }
@utility z-skip    { z-index: var(--z-skip); }
```

Cambios (una línea cada uno):
- `app-sidebar.tsx` `<aside>`: `z-20` → `z-sidebar`.
- `app-shell.tsx` y `mobile-nav.tsx`: `z-30` → `z-topbar`.
- `ui/dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tooltip.tsx`, nuevo `popover.tsx`: `z-50` → `z-overlay` (mismo valor; evita números mágicos).
- `skip-link.tsx`: `z-[60]` → `z-skip`.
- Columna de contenido de `app-shell.tsx` (`div.flex min-w-0 flex-1 flex-col`): añadir **`overflow-x-clip`**. `clip` no crea contenedor de scroll, así que el `sticky` de
  la barra sigue funcionando (con `overflow-x-auto/hidden` dejaría de hacerlo). El contenido ancho se recorta en el borde de la columna en vez de desplazar la página; las
  tablas y el kanban ya tienen su propia región con scroll.

Regla para el futuro: *chrome fijo al viewport (menú) > chrome pegajoso en flujo (barras) > contenido pegajoso (z-sticky) > contenido*; y *todo lo flotante
(overlay) por encima de todo*. Prohibido `z-[n]` en vistas.

Prueba de regresión (Playwright): viewport 1100×800, `document.body.style.minWidth='1500px'`, `scrollTo(300,0)`; `elementsFromPoint(120,24)[0]` debe ser `#app-sidebar` o hijo.

---

## 4. Especificación por componente

Convenciones: `text-meta` es la utilidad existente (texto pequeño de apoyo). Iconos de `lucide-react` con `aria-hidden="true"`. Radio de tarjetas `rounded-xl`, sombra
`shadow-card`. Todos los tamaños táctiles `pointer-coarse:min-h-10` como en el resto del portal.

### 4.1 Utilidades nuevas (solo presentación)
- `components/task-progress.tsx` — `<TaskProgressBar value tone size />`:
  ```
  <span aria-hidden="true" class="relative block h-2 w-24 overflow-hidden rounded-full bg-muted">   // size lg: h-2.5 w-full
    <span class="absolute inset-y-0 left-0 rounded-full {tone}" style="width: {v}%" />
  </span>
  ```
  Tonos: `default → bg-primary`, `done (TERMINADA) → bg-success`, `blocked (BLOQUEADA) → bg-warning`, `overdue → bg-danger`. Es decorativa: el valor
  siempre va en texto (`40 %`, `tabular-nums`) y el estado en su insignia. Reutiliza el patrón de `UtilizationBar`.
- `lib/task-due.ts` — `taskDueInfo(task, todayLocal)` → `{ kind: 'none' | 'ok' | 'soon' | 'today' | 'overdue', days: number }`. `overdue` si `endDate < hoy` y `status !== TERMINADA`;
  `soon` si faltan 1–3 días; `today` el día. Texto: «Vencida hace 3 días», «Vence hoy», «Vence en 2 días» (singular/plural con `Intl.PluralRules`).
- Chips (con `Badge`, siempre icono + texto):
  - Vencida: `<Badge variant="danger"><AlarmClock/>Vencida · 3 d</Badge>`
  - Vence pronto / hoy: `<Badge variant="warning"><Clock/>Vence en 2 d</Badge>`
  - Predecesora pendiente: `<Badge variant="warning"><Link2/>1 predecesora pendiente</Badge>` (solo si hay predecesoras con estado ≠ TERMINADA)
  - Aceptada: `<Badge variant="success"><CircleCheck/>Aceptada</Badge>`
- Región viva única en `PlanView`: `<p role="status" aria-live="polite" className="sr-only" id="plan-live">`. Los manejadores en línea escriben ahí
  («Avance de “Tarea uno” actualizado a 60 %.») además del toast.

### 4.2 Barra de contexto y encabezado
- `PageHeader`: se acorta la descripción a una línea: «Fases y tareas de una solicitud comprometida. Resuelve los pendientes para enviarlo a autorización.»
  (la guía queda explicada en su panel). Sin cambio de estructura.
- `RequestContextBar` sin cambios, salvo que el resumen «Estado del plan» se muestra en la misma fila que el selector a ≥ `md` y debajo a < `md`.
- Se **elimina el aviso azul** «El plan está autorizado; las fases y tareas no se pueden editar.» **cuando el estado ya se ve en el resumen**; el motivo se conserva donde
  hace falta (botón Importar, «Nueva fase», «Nueva tarea» deshabilitados, ver 4.3). Se conserva el aviso de plan **Devuelto** (accionable, `tone="warning"`).

### 4.3 Resumen del plan + acciones de Excel (`plan-summary.tsx`)
Tarjeta `section.rounded-xl.bg-card.p-4.shadow-card.flex.flex-col.gap-4`.

Fila 1: `h2 “Resumen del plan”` + `StatusBadge kind="plan"`. A la derecha (`ml-auto`): chip de envío si el plan es editable:
`Badge` `warning` «3 pendientes para enviar» (enlace `href="#plan-guide"`, `text-link` no aplica: es `Badge` dentro de `<a>` con foco visible `outline-2 outline-offset-2`)
o `success` «Listo para enviar».

Fila 2: **métricas** con el `StatStrip/StatTile` existente (4 teselas, `grid-cols-2 lg:grid-cols-4`):
| Tesela | Valor | Tono |
| --- | --- | --- |
| Avance del plan | `% de tareas terminadas` («1 de 4») | default |
| En curso | n | default |
| Bloqueadas | n | `warning` si n>0 |
| Vencidas | n | `danger` si n>0 |
Cálculo en el cliente sobre `tasks` (presentación; no se persiste). Sin tareas: la tesela dice «—» y la franja se oculta (el estado vacío ya lo explica).

Fila 3: hitos del ciclo de vida (como hoy, `DescriptionList columns={2}`), solo si existen.

Fila 4 (separada por `border-t pt-4`): **Plan en Excel**.
```
<div class="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-start sm:justify-between">
  <div class="min-w-0">
    <h3 class="text-sm font-semibold">Plan en Excel</h3>
    <p class="text-meta text-muted-foreground">Descarga el plan o reemplázalo con un archivo .xlsx.</p>
  </div>
  <div class="flex flex-wrap items-start gap-2">
    [Exportar a Excel]  [Importar desde Excel + ayuda]
  </div>
</div>
```
- **Exportar a Excel**: `Button variant="outline" size="sm"` con `Download`. Disponible siempre (con plan creado). Ayuda (`aria-describedby`, visible como `title` y en el
  `<p>` superior): «Descarga fases, tareas y predecesoras del plan completo.» Cargando: `loading` + texto «Exportando…». Error: toast «No se pudo exportar el plan. Inténtalo de nuevo.»
- **Importar desde Excel**: `Button variant="outline" size="sm"` con `Upload`. Habilitado solo en Borrador/Devuelto. Debajo (siempre visible, `text-meta`):
  - habilitado: «Reemplaza las fases y tareas actuales. ¿No tienes el formato? <button class="text-link underline underline-offset-4 hover:text-link-hover">Descargar plantilla</button>»
  - deshabilitado (`unavailable` + `DisabledReason`): «El plan está autorizado: solo se puede importar en borrador o devuelto.» (`planStatePhrase`) y **no** se muestra el enlace de plantilla como acción, pero sí
    «Descargar plantilla» sigue disponible porque descargar el formato no modifica nada: queda como enlace aparte, habilitado.
- Diálogo de confirmación del import (`ConfirmDialog tone="danger"`): título «¿Reemplazar el plan con “nombre.xlsx”?», descripción «Se reemplazan las fases, tareas y predecesoras actuales
  (N fases, M tareas). Esta acción no se puede deshacer. Antes puedes exportar el plan actual como respaldo.» y un botón secundario **«Exportar plan actual primero»**.
  Confirmar: «Reemplazar plan».
- Errores del import: `InlineNotice tone="danger"` bajo la fila, con encabezado «No se importó el archivo: se encontraron N errores.», lista de hasta 10 con «Ver todos (N)», y el
  texto «Corrige el archivo y vuelve a intentarlo. Puedes descargar la plantilla para comparar.» El foco pasa al aviso (`tabIndex={-1}`) y se anuncia con `role="alert"`.
- Se **elimina** `handleExportTasks`/`downloadTasksCsv` y su motivo `plan-export-tasks-reason`.

### 4.4 Fases (`renderPhases`)
Cambios mínimos, el módulo funciona:
- Cabecera de sección: se conserva `Nueva fase`; con el plan no editable el botón queda `unavailable` con el motivo (4.12).
- Fila de fase: añadir a la columna «Tareas» el desglose «2 · 1 terminada» (`text-meta`) y una barra `TaskProgressBar` de 64 px con el % de tareas terminadas de esa fase (decorativa + texto).
- La acción «Agregar tarea» abre el diálogo con `phaseId` de esa fase (preselección, 4.9).
- A < 768 px la tabla de fases usa `DataCardList` (como las demás tablas, BL-024). Hoy no tiene versión móvil.

### 4.5 Barra de filtros y tabla de tareas

#### 4.5.1 Sección y barra
- Cabecera de sección `Tareas` con `count`, a la derecha: **«Nueva tarea»** (`Button size="sm"`, `Plus`, solo con plan editable; en no editable queda `unavailable` con motivo «El plan está autorizado; no se pueden crear tareas.») y el
  `SegmentedRadio` Vista (Tabla/Kanban) **sin** la etiqueta «Vista» suelta: el grupo lleva `aria-label="Vista de tareas"` y dos iconos (`Table2`, `Kanban`) + texto (texto se oculta a < `sm`).
- Filtros (`Toolbar`): Buscar, Estado, Fase, **Ordenar por** (nuevo, `Select`: «Orden original», «Vencimiento», «Inicio», «Estado»), «Solo mis tareas». Las opciones del filtro **Estado** llevan el contador por estado
  entre paréntesis («En curso (3)»). A < `md` los filtros se pliegan en una fila: Buscar siempre visible + botón «Filtros (n)» que abre `Sheet side="bottom"`; ahora ocupan ~330 px a 375 (`ux-e`).
- Chips de filtros activos bajo la barra con «Quitar filtro» y **«Limpiar filtros»** cuando hay ≥ 1.
- Fila de resultado: «2 de 5 tareas» (`ResultCount`), `aria-live="polite"`.

#### 4.5.2 Tabla (≥ 768 px)
Columnas y anchos (la tabla cabe sin scroll a 1024 con riel; a 1280 con menú completo, columna de contenido ≈ 975 px):
| Columna | Contenido | Clases |
| --- | --- | --- |
| Tarea | `CellTitle` (botón → abre detalle) + `Hito` + línea secundaria `text-meta`: fase (si hay > 1) · «n predecesoras» · chip de bloqueo | `min-w-56 max-w-[26rem]` |
| Responsable | `TaskResponsibleControl variant="inline"` (4.5.3) | `w-44` |
| Avance | `TaskProgressControl` (4.6): barra + % | `w-36` |
| Plazo | `5 ene → 15 ene 2026` (`tabular-nums whitespace-nowrap`) + chip de vencimiento debajo | `w-44` |
| Estado | `TaskStatusControl` (solo insignia + chevron, sin % pegado) | `w-40` |
| Acciones | `RowActions` (solo editable) | `w-12 text-right` |
- Fila: `hover:bg-muted/50` (ya del `Table`). Fila vencida: marca `shadow-[inset_3px_0_0_0_var(--color-danger)]` en la primera celda, **además** del chip (no solo color).
- Orden: la cabecera «Plazo» es `SortableTableHead` por `end`; el resto por el selector «Ordenar por».
- Sticky de cabecera: no (el contenedor ya tiene su scroll horizontal).

#### 4.5.3 `TaskResponsibleControl variant="inline"`
Trigger: `h-8 w-full justify-between gap-2 rounded-md border-transparent bg-transparent px-1.5 text-sm shadow-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-10`,
contenido: círculo de iniciales `size-6 rounded-full bg-primary-subtle text-xs font-semibold text-link` + nombre (`truncate`) + `ChevronDown size-4 text-muted-foreground` (siempre visible: indica que es editable).
Sin asignar: círculo punteado `border border-dashed border-border-strong` + texto «Sin asignar» en `text-warning` (6.76:1 sobre blanco). Deshabilitado: `opacity-100`, sin chevron, texto `text-muted-foreground` y motivo accesible (ya existe).
Sigue sin ofrecer «desasignar» (regla vigente).

### 4.6 Control de avance en línea (petición 4) — `TaskProgressControl`
**Props**: `value`, `status`, `taskTitle`, `disabled`, `disabledReason`, `busy`, `onSave(value: number)`, `size?: 'sm' | 'lg'`.

**Disparador** (`PopoverTrigger asChild`):
```
<Button variant="ghost" size="sm"
  class="h-auto gap-2 px-1.5 py-1 -mx-1.5 pointer-coarse:min-h-10"
  aria-label="Actualizar avance de «{título}» (actual: 40 %)" aria-haspopup="dialog">
  <TaskProgressBar/>  <span class="w-10 text-right tabular-nums text-sm">40 %</span>  <Pencil class="size-3.5 text-muted-foreground"/>
</Button>
```
Deshabilitado: igual pero sin lápiz; motivo vinculado con `aria-describedby` (patrón de `TaskStatusControl`). Motivos:
- sin permiso: «Solo puedes cambiar el avance de tus propias tareas.»
- `POR_HACER`: «Pasa la tarea a En curso para registrar su avance.»
- `TERMINADA`: «La tarea está terminada (100 %). Reábrela para cambiar el avance.»
- sin conexión/cargando personas: no aplica.

**Contenido** (`PopoverContent align="start" sideOffset={6}` `w-72 rounded-xl border bg-popover p-4 shadow-md z-overlay`, `role="dialog"`, `aria-label="Avance de «título»"`):
1. Fila superior: `p.text-sm.font-medium` «Avance» a la izquierda; a la derecha el valor grande `text-2xl font-bold tabular-nums` (`aria-live="off"`, el lector lee el deslizador).
2. **Deslizador** `<input type="range" min=0 max=100 step=5 class="mt-3 h-2 w-full cursor-pointer accent-primary" aria-label="Avance (porcentaje)">` con `aria-valuetext="40 por ciento"` implícito
   del navegador; `accent-primary` mantiene el color de marca y respeta `forced-colors` sin CSS propio.
3. Fila: `Input type="number" min=0 max=100 step=1 inputMode="numeric" class="h-9 w-20 tabular-nums"` + sufijo «%» (`aria-hidden`; etiqueta «Avance en porcentaje» con `sr-only`) y **atajos**
   `0 · 25 · 50 · 75 · 100` como `Button variant="outline" size="sm" class="px-2 tabular-nums"` (`aria-pressed` cuando coincide).
4. Error de rango bajo el número: «Escribe un número entre 0 y 100.» (`role="alert"`, `text-danger`, `Field error`). El número y el deslizador están sincronizados; fuera de rango no se envía.
5. Pie: `Cancelar` (`outline`) y `Guardar` (`default`, `loading`). `Guardar` se deshabilita sin cambios (`disabled` + texto de ayuda `text-meta` «Sin cambios»).
6. Si el valor es 100 y el estado ≠ `EN_REVISION`: línea `text-meta` «Con 100 % puedes enviar la tarea a revisión desde su estado.» (no cambia el estado solo).

**Teclado**: Enter/Espacio/↓ en el disparador abre; el foco entra en el deslizador (`onOpenAutoFocus`). ←/→ ±5 (paso), Inicio/Fin 0/100 (nativo). Tab recorre número → atajos → Cancelar → Guardar.
**Enter** dentro del número guarda. **Esc** cierra y devuelve el foco al disparador. Al guardar bien, el popover se cierra, el foco vuelve al disparador, se anuncia en `#plan-live` y se muestra el toast
«Avance actualizado a 60 %.»

**Estados**
| Estado | Presentación |
| --- | --- |
| Reposo | Barra + % + lápiz tenue. |
| Hover | `hover:bg-accent` en el disparador. |
| Foco | `focus-visible:outline-2 outline-ring outline-offset-2` (nunca solo el fondo). |
| Abierto | `aria-expanded="true"`, disparador `bg-accent`. |
| Guardando | Botón `loading` («Guardando…»), controles `disabled`, `aria-busy` en el popover; la barra de la fila se pinta con el valor nuevo (optimista) y `opacity-70`. |
| Error del servidor | El popover **permanece abierto**, valores conservados (criterio AC-031), `role="alert"` bajo el pie: «No se pudo guardar el avance: {mensaje}. Revisa tu conexión e inténtalo de nuevo.» La fila se revierte al valor anterior. Sin toast duplicado. |
| Deshabilitado | Sin lápiz, motivo accesible. |
| Concurrencia (409) | Mensaje de la API (p. ej. estado cambió); se recarga la fila con `refreshPlanData`. |

Lógica: mismo patrón optimista que `handleInlineStatusChange` (`rowBusyId`, revertir, `refreshGuideOnly` no hace falta: el avance no cambia la guía). Nuevo manejador `handleInlineProgressChange(task, value)` → `updateTaskProgress`.

#### 4.6.1 Alternativa sin dependencia nueva (si no se aprueba `@radix-ui/react-popover`)
`DropdownMenu` (ya instalado) con `DropdownMenuRadioGroup` de 0/25/50/75/100 más un ítem «Otro valor…» que abre el `Dialog` pequeño (`size="sm"`) con el número. Cumple la petición pero con un clic más y sin deslizador.
Se documenta como plan B; la recomendación sigue siendo el popover.

### 4.7 Control de estado (`task-status-control.tsx`)
- Se quita el `%` del control (ahora vive en su columna). Queda `insignia + ChevronDown`.
- Opciones del menú con icono por estado (los mismos de la insignia) y descripción de una línea en `text-meta`: «Pasar a En curso», «Marcar como bloqueada». Ya existe el filtro de transiciones válidas.
- Variante `move` (kanban): trigger de icono `Button variant="ghost" size="icon-sm" aria-label="Mover «título» a otra columna (actual: En curso)"` con `ArrowRightLeft`. El menú se titula «Mover a».
- Cuando una transición exige una predecesora terminada y la hay pendiente, el ítem **sigue ofrecido** (la API decide) pero con `aria-describedby` al texto «Hay 1 predecesora pendiente; el servidor puede rechazarlo.» (`text-meta text-warning`).
- El mensaje de 409 del backend se muestra en toast `error` con la acción «Ver tarea» que abre el detalle en la pestaña Resumen.

### 4.8 Kanban (`plan-tasks-kanban.tsx`) — peticiones 7 y 10

**Contenedor**
- `ul[aria-label="Tareas por estado"]`: `flex gap-3 pb-3`; ≥ `md`: `min-w-max`; < `md`: `snap-x snap-mandatory` y columnas `w-[85vw] max-w-80 snap-start shrink-0` para que se vea una columna y el borde de la siguiente.
- La barra «Nueva tarea» del kanban se retira (es la de la sección, 4.5.1).

**Columna** (`section[aria-label="Columna …"]`): `flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/40 p-2 transition-shadow lg:w-80`.
- Cabecera: `StatusBadge` (con icono) + contador `tabular-nums text-muted-foreground` + si está filtrada a 0: nada. `px-1 py-1`.
- Soltar válido (mientras se arrastra): `ring-2 ring-primary bg-primary-subtle/40` (ring vs columna 4.08:1 claro / 3.50:1 oscuro). Columnas que no aceptan el soltado: `opacity-60`.
- Vacía: `rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-meta text-muted-foreground` «Sin tareas»; durante un arrastre válido el texto cambia a «Suelta aquí para pasar a {Estado}.»
- La columna Terminada muestra las primeras 20 y un botón «Ver las N restantes» (`variant="ghost" size="sm"`), para que no domine el tablero.

**Tarjeta** (`article`)
```
<article
  class="group relative flex flex-col gap-2.5 rounded-xl bg-card p-3 text-card-foreground shadow-card ring-1 ring-border
         cursor-pointer transition-shadow hover:shadow-md
         {vencida: border-l-4 border-l-danger} {bloqueada: border-l-4 border-l-warning}
         {busy: opacity-70} {dragging: opacity-50 ring-2 ring-primary}"
  aria-labelledby="task-{id}-open" aria-busy={busy}
  draggable={canChange} onClick={openIfNotControl}>
```
Contenido en este orden:
1. **Fila título**: asa `GripVertical` (`size-4 text-muted-foreground cursor-grab`, `hidden md:block opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`, decorativa; solo aparece si es arrastrable) ·
   **título** como `<button type="button" id="task-{id}-open" class="min-w-0 flex-1 rounded-sm text-left text-sm font-medium leading-snug line-clamp-2 break-words hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">`
   con `onClick={() => onOpenDetail(task.id)}` · `Hito` · `RowActions` («⋯», ya existente, solo editable).
2. **Fase** (si hay > 1 y no hay filtro de una sola fase): `text-meta text-muted-foreground truncate`.
3. **Avance**: `TaskProgressControl size="sm"` (barra a ancho completo `w-full` + %).
4. **Pie** (`flex items-center justify-between gap-2`): `TaskResponsibleControl variant="inline"` (iniciales + nombre truncado; a `w-36`) · a la derecha chip de plazo (vencida / vence pronto / `5 ene` neutro) · `TaskStatusControl variant="move"`.
5. Chip de bloqueo por predecesora (si aplica) sobre el pie.

**Abrir el detalle (petición 7)**
- `openIfNotControl(e)`: `if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="combobox"], [role="menuitem"], [role="slider"]')) return; onOpenDetail(task.id);`
  Un arrastre no dispara `click`, así que no abre el panel al soltar (comprobar en Chrome, Firefox y Safari).
- Los controles interiores (menú «⋯», responsable, avance, mover) llevan `onClick={(e) => e.stopPropagation()}` por defensa en profundidad.
- Teclado: el título es el único *tab stop* para abrir; la tarjeta **no** es `tabIndex=0` (evita doble parada). Orden de tab dentro de la tarjeta: título → «⋯» → avance → responsable → mover.
- Foco: al cerrar el panel, `SheetContent onCloseAutoFocus` enfoca `#task-{id}-open` (si la tarjeta cambió de columna, el título sigue existiendo porque su id es estable) y, si ya no existe, `tasksHeadingRef`.
  La tabla tiene el mismo problema hoy; se arregla con el mismo `id` en `CellTitle`.
- Arrastre: se conserva HTML5 nativo. `cursor-pointer` en la tarjeta y `cursor-grab` solo sobre el asa evita el conflicto «¿agarro o abro?». El camino accesible sigue siendo «Mover a…».
- Estado de arrastre anunciado: al soltar, `#plan-live` dice «“Tarea uno” movida a En curso.»

**Tarjeta móvil**: en < 768 px el kanban conserva columnas con snap; además la vista por defecto en móvil es la lista de tarjetas de 4.5.4.

#### 4.5.4 Lista de tarjetas móvil (tabla < 768 px)
Se adopta `DataCardList` (`components/data-card-list.tsx`) igual que otras tablas del portal:
`title` = `<CellTitle touch onOpen>`; `subtitle` = fase; `badges` = `[StatusBadge, chip de vencimiento]` (máx. 3); `meta` = `[{Responsable}, {Plazo}]`; `note` = el `TaskProgressControl` a ancho completo; `actions` = `RowActions menuOnly`.
Orden: `sort` de `DataCardList` conectado al selector «Ordenar por». Objetivo táctil ≥ 44 px (`touch`).

### 4.9 Diálogo de tarea (`task-dialog.tsx`) — petición 3

**Tamaño**: `DialogContent size="lg"` (720 px) en lugar de `md`; a < `sm` una columna. Título «Nueva tarea» / «Editar tarea»; descripción «Define qué hay que hacer, en qué fase, quién lo hace y cuándo.»
`RequiredHint` queda bajo la descripción.

**Estructura** (`DialogBody class="grid gap-6"`; cada bloque con `FieldSet`/`section` y un `h3 text-sm font-semibold` visible):

**Bloque 1 · Qué y dónde**
1. **Título\*** — `Input` ancho completo, `autoFocus` solo al crear. Ayuda: «Una frase corta con un verbo: “Configurar el servidor”.» (`Field help`).
2. **Fase\*** — **destacada**:
   ```
   <div class="rounded-xl bg-primary-subtle/50 p-3 ring-1 ring-primary/20">      // callout; contrastes en 6.1
     <Field id="task-phase" label="Fase" required help="La tarea se crea dentro de esta fase.">
       <Select> trigger: h-11 w-full text-base font-medium bg-card
         item: nombre de la fase (font-medium) + 2.ª línea text-meta "5 ene – 30 ene 2026 · 3 tareas"
   ```
   - **Siempre visible y preseleccionada**: (a) la fase desde la que se abrió («Agregar tarea» de una fase o de la guía), (b) si no, la fase del filtro cuando es una sola, (c) si no, la fase inicial.
     Cuando viene de (a) o (b), `help` añade «Preseleccionada desde “Ejecución”.»
   - Si el plan **no tiene fases**: el bloque se sustituye por `InlineNotice tone="warning"` «Primero crea una fase» con botón «Nueva fase» y el submit se deshabilita (hoy la guía y el kanban ya lo dicen aparte).
   - Una sola fase: se muestra igual (el selector es de solo una opción) para que el usuario vea dónde cae la tarea.
   - **Editar**: la API no permite mover una tarea de fase (`UpdateTaskDto` no tiene `phaseId`), por lo que en edición el campo es **solo lectura**: `Lock` + nombre + `help` «La fase no se puede cambiar. Para moverla, crea la tarea en la otra fase y elimina esta.»
   - Error: «Elige la fase de la tarea.» junto al campo (reemplaza el `FormError` genérico «Falta la fase de la tarea.»), foco al selector.

**Bloque 2 · Quién y cuándo** (`grid gap-4 sm:grid-cols-2`, columnas simétricas)
| Columna izquierda | Columna derecha |
| --- | --- |
| Responsable (Select, «Sin asignar», `help` «Quien actualizará el estado y el avance.») | Esfuerzo estimado (h) (`Input number min=0 step=0.5`, sufijo «h», `help` «Opcional») |
| Inicio (`type=date`) | Vencimiento (`type=date`) |
- Los dos campos de fecha comparten un `help` común bajo la fila (`col-span-2`): «Dentro del rango de la fase: 5 ene – 30 ene 2026.» (se actualiza con la fase elegida). El error de fechas (`fieldErrors.dates`) se muestra
  bajo la fila (`col-span-2`, `role="alert"`), no solo bajo Inicio como hoy.
- Si cambian la fase, las fechas ya escritas se revalidan en vivo y el error aparece al enviar (no mientras se escribe).

**Bloque 3 · Detalle** (opcional)
- Descripción (`Textarea rows={3}`), Criterios de aceptación (`Textarea rows={3}`, `help` «Cómo sabrás que la tarea está lista»). Una columna en todos los anchos.

**Bloque 4 · Predecesoras**
- Crear: `InlineNotice tone="info"` compacto «Podrás elegir predecesoras después de crear la tarea.» (hoy es texto gris suelto).
- Editar: lista actual con `max-h-48`, contador «2 seleccionadas» en la leyenda, filtro de texto si hay > 8 tareas.

**Pie**: `Cancelar` · `Crear tarea` / `Guardar cambios`. Tras crear: toast «Tarea creada en “Ejecución”.» y el foco vuelve al botón que abrió el diálogo (o a la tarea nueva en la tabla si es visible).

**Errores**: se evalúan todos a la vez (como hoy) y el foco va al primer campo con error en orden visual: Título → Fase → Responsable → Fechas → Esfuerzo. Error de servidor: `FormError` al pie, valores conservados.
**Cargando**: si `listCoordinationPeople` tarda o falla, el selector de Responsable muestra «Cargando personas…» / «No se pudieron cargar las personas» (`help` con `text-danger`) en vez de quedar vacío en silencio (hoy se degrada sin avisar).

### 4.10 Detalle de la tarea (`task-detail.tsx`, embebido en `Sheet`) — peticiones 5 y 6

**Contenedor**: `SheetContent side="right" closeLabel="Cerrar detalle"` `w-[40rem] max-w-full gap-0 overflow-y-auto bg-background p-0`. En < `sm` ocupa todo el ancho (`max-w-full`).
`SheetTitle` queda dentro de la cabecera (visible), `SheetDescription` sigue `sr-only`.

#### 4.10.1 Cabecera
```
<header class="flex flex-col gap-4 border-b bg-card px-5 pb-4 pt-5 pr-14">
  <p class="text-meta text-muted-foreground truncate">Planificación · {Fase}</p>
  <div class="flex items-start gap-2">
    <SheetTitle class="min-w-0 flex-1 text-lg font-bold leading-snug break-words">{título}</SheetTitle>
    {hito && <Badge variant="outline">Hito</Badge>}
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <StatusBadge kind="task" value={status} size="lg" />         // h-7 px-3 text-sm, icono size-4
    {chip vencida | vence pronto} {chip predecesora pendiente} {aceptada}
  </div>

  <div class="grid gap-1.5">
    <div class="flex items-center justify-between">
      <span class="text-meta text-muted-foreground">Avance</span>
      <span class="text-base font-semibold tabular-nums">40 %</span>
    </div>
    <TaskProgressBar size="lg" tone=…/>      // h-2.5 w-full
  </div>

  <dl class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
    Responsable (iniciales + nombre) | Fase | Inicio | Vence (+ chip)
    // dt: text-meta text-muted-foreground · dd: text-sm font-medium break-words
  </dl>

  <div class="flex flex-wrap gap-2">
    <TaskStatusControl …/>  (como botón "Cambiar estado ▾", variant outline)
    <TaskProgressControl size="lg" …/> (botón "Actualizar avance")
    {canEdit && <Button variant="outline" size="sm"><Pencil/>Editar tarea</Button>}
  </div>
</header>
```
- El estado **siempre** es la primera cosa tras el título y nunca depende solo del color (icono + texto). Insignia grande: `bg-<tono>/12 text-<tono>` (contrastes 6.1–8.6, 6.1).
- Responsable sin asignar: «Sin asignar» en `text-warning`. Fechas con `formatDateOnly`. Nada de «—» sin explicación: «Sin fecha» en `text-muted-foreground`.
- La cabecera no es `sticky` (el panel entero ya es un scroll y la cabecera ocuparía ~230 px); sí lo son las **pestañas** (`sticky top-0 z-sticky bg-background`).
- Estados de la cabecera: cargando (`Skeleton` de 5 filas con la forma real, `aria-busy`), error (`ErrorState` con «Reintentar» y «Cerrar»), tarea inexistente (404 → «La tarea ya no existe o está fuera de tu alcance» + «Cerrar»).

#### 4.10.2 Pestañas (`ui/tabs.tsx`, Radix)
`Tabs defaultValue="resumen"`; `TabsList` en `sticky top-0 z-sticky border-b bg-background px-5`; triggers «Resumen», «Historial (n)», «Evidencia». Foco/teclado nativos de Radix (flechas, Inicio/Fin).
El contenido va en `px-5 py-5 flex flex-col gap-6`. La pestaña activa se conserva al navegar entre predecesoras; al abrir otra tarea vuelve a «Resumen».
- **Resumen**: Descripción, Criterios, Predecesoras (RequirementsPanel como hoy), y el formulario **«Registrar cambio con evidencia»** en un `details`/disclosure cerrado por defecto (conserva estado + avance + URL de evidencia; su botón sigue
  siendo «Guardar cambios»). El formulario ya no es lo primero que se ve.
- **Evidencia**: `TaskEvidenceFiles` + URL (como hoy). El contador se omite.

#### 4.10.3 Historial (petición 6)

**Datos**: `getTaskHistory(taskId)` → `GET /tasks/{id}/history`; se carga al abrir el panel (para tener el contador `(n)` de la pestaña) y se recarga tras `onChanged` (estado/avance/edición).

**Estructura**
```
<section aria-labelledby="hist-title">
  <h3 id="hist-title" class="sr-only">Historial de cambios</h3>
  <p class="text-meta text-muted-foreground">Del más reciente al más antiguo. Se muestran los últimos 200 cambios.</p>   // la nota del tope solo si n = 200
  <ol class="mt-3 flex flex-col">
    <li> <h4 class="sticky top-10 z-sticky bg-background py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hoy</h4>
         <ol class="relative flex flex-col gap-4 py-2 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-border"> …entradas… </ol> </li>
```
- **Agrupación por día local**: encabezados «Hoy», «Ayer» y, para el resto, «martes, 28 de octubre» (`Intl.DateTimeFormat('es', { weekday:'long', day:'numeric', month:'long' })`, con el año si no es el actual). Sticky bajo las pestañas (`top-10` = alto de la lista de pestañas).
- **Entrada** (`li.relative.flex.gap-3`):
  - Nodo `size-6 shrink-0 rounded-full bg-primary-subtle text-link flex items-center justify-center` con icono por campo/acción: `CREATE` → `Plus`; `status` → `RefreshCw`; `progress` → `Gauge`; `responsible` → `User`;
    `startDate/endDate` → `CalendarClock`; `phase` → `Layers`; `accepted` → `CircleCheck`; `title/description/acceptanceCriteria/evidenceUrl/estimateHours/isMilestone/frameworkPhaseRequired` → `Pencil`. Con varios cambios, icono del primero.
  - Cuerpo `min-w-0 flex-1`:
    1. Línea 1 (`flex flex-wrap items-baseline justify-between gap-x-3`): **actor** `font-medium` + resumen `text-muted-foreground` («cambió el estado» / «hizo 3 cambios» / «creó la tarea») · a la derecha
       `<time dateTime={iso} title="{fecha y hora con segundos}" class="text-meta tabular-nums text-muted-foreground">29 oct 2026, 10:42</time>` (`formatDateTime`: fecha **y** hora en cada entrada;
       el encabezado de día es solo para escanear). Actor ausente: «Sistema».
    2. Cambios (`dl`/lista `mt-1.5 flex flex-col gap-1.5`), una fila por `changes[]`:
       `grid grid-cols-[7.5rem_1fr] gap-x-3 text-sm` → etiqueta del campo (`text-meta text-muted-foreground`) y `anterior → nuevo`:
       ```
       <span class="text-muted-foreground"><span class="sr-only">De </span>Por hacer</span>
       <ArrowRight class="mx-1.5 inline size-3.5 text-muted-foreground" aria-hidden="true" />
       <span class="font-medium"><span class="sr-only">a </span>En curso</span>
       ```
       En < `sm` la etiqueta pasa encima (`grid-cols-1`).

**Formato de valores por campo** (los valores llegan como texto):
| Campo | Etiqueta | Formato |
| --- | --- | --- |
| `status` | Estado | `StatusBadge` pequeño de cada valor (texto + icono) |
| `progress` | Avance | `40 %` → `60 %` (`formatPercent`) |
| `accepted` | Aceptación | `true/false` → «Aceptada» / «Sin aceptar» |
| `title` | Título | texto completo, `break-words` |
| `phase`, `responsible` | Fase, Responsable | nombre ya resuelto por la API |
| `isMilestone`, `frameworkPhaseRequired` | Hito, Requiere fase marco | «Sí» / «No» |
| `startDate`, `endDate` | Inicio, Vencimiento | `formatDateOnly` (fecha ISO en UTC) |
| `estimateHours` | Esfuerzo | `formatHours` («8 h») |
| `description`, `acceptanceCriteria`, `evidenceUrl` | Descripción, Criterios, Evidencia | texto en `line-clamp-3` con botón «Ver todo / Ver menos» (`text-link`); el valor anterior y el nuevo se apilan |
| `null` | — | «Sin valor» en cursiva (`text-muted-foreground italic`), nunca vacío ni «null» |
| campo desconocido | el código tal cual | texto, para no perder información si el backend añade campos |
- Entradas `UPDATE` sin `changes` (cambios en campos no rastreados) **no se muestran**. `DELETE` no se espera (la tarea ya no existe).

**Estados**
| Estado | Presentación |
| --- | --- |
| Cargando | 3 filas `Skeleton` (círculo `size-6` + dos líneas `h-4`), contenedor `aria-busy="true"`; el texto de la pestaña muestra `Historial` sin número. |
| Vacío | `EmptyState size="compact"` icono `History`: «Aún no hay cambios registrados.» / «Aquí verás quién cambia el estado, el avance, el responsable o las fechas de la tarea.» |
| Error | `ErrorState` compacto dentro de la pestaña: «No se pudo cargar el historial.» + «Reintentar»; el resto del panel sigue usable. |
| Recarga tras un cambio | La lista no parpadea: se mantiene la anterior (`opacity-70`) y se reemplaza; la nueva entrada tiene un anillo `ring-2 ring-primary-subtle` durante 2 s (sin animación bajo `motion-reduce`). `#task-live` anuncia «Historial actualizado: Marta cambió el estado a En curso.» |
| Sin permiso (403/404) | Mensaje «No tienes acceso al historial de esta tarea.» |

### 4.11 Guía de envío a autorización (`plan-guide-panel.tsx`)
La regla PLA-06 (el bloque va al final) **se mantiene**, pero un plan largo lo esconde. Cambios:
- El **chip de resumen** de 4.3 enlaza a `#plan-guide`. La sección del panel recibe `scroll-mt-20` para que la barra sticky no la tape.
- Título positivo y con cuenta: «Antes de enviar a autorización: faltan 3 requisitos» (en lugar de «Aún no puedes enviar…»). Sin pendientes: «El plan está listo para enviar».
  Descripción: «Resuelve cada pendiente desde su acción. La lista se actualiza al guardar.»
- Botón «Enviar a autorización»: `Button` primario; si hay pendientes queda `unavailable` con el motivo **concreto**: «Faltan 3 requisitos: 2 de tareas y 1 de fases.» (en vez de «Resuelve los pendientes de la lista…»).
- Cada pendiente mantiene su acción («Agregar tarea», «Editar fase») y ahora, al ejecutarla, el diálogo abre con la fase correcta (4.9).
- Tras enviar: `InlineNotice tone="success"` «Plan enviado a autorización el 29 oct 2026, 10:42.» y el panel desaparece (el plan ya no es editable).

### 4.12 Estados de carga, vacío y error de la pantalla
| Situación | Presentación |
| --- | --- |
| Cargando solicitudes | Skeleton con la forma de la barra de contexto y de la tarjeta (`h-16` + `h-64`), `aria-busy`. Sin cambios. |
| Sin solicitudes planificables | `EmptyState` actual; añadir acción «Ir a Aprobaciones» si el módulo está permitido. |
| Cargando plan | Skeleton de resumen (4 teselas), de fases (3 filas) y de tareas (5 filas), no dos bloques genéricos. |
| Plan inexistente (404) | `EmptyState` «Esta solicitud aún no tiene un plan.» + «Crear plan» (como hoy). |
| Error de plan | `ErrorState` dentro de tarjeta con «Reintentar». |
| Fases vacías | `EmptyState compact` con el botón «Nueva fase» dentro (hoy solo texto). |
| Tareas vacías | `EmptyState compact`: «Aún no hay tareas.» + «Nueva tarea» (editable) o «Este plan no tiene tareas.». |
| Filtros sin resultados | «Ninguna tarea coincide con los filtros.» + «Limpiar filtros». |
| Acción en línea fallida | Toast `error` + región viva; la fila se revierte. |
| Personas no cargaron | El responsable queda de solo lectura con motivo (ya existe); el diálogo lo avisa (4.9). |
| Plan no editable | Los botones de creación quedan `unavailable` con `DisabledReason`; se ve un **candado** `Lock` junto al estado del plan en el resumen. |

### 4.13 Responsive
| Ancho | Menú | Tareas | Resumen | Detalle | Diálogo |
| --- | --- | --- | --- | --- | --- |
| 1280 | Completo | Tabla 6 columnas, sin scroll | 4 teselas + Excel en una fila | Panel 40 rem | 720 px, 2 columnas |
| 1024 | Riel (56 px) | Tabla 6 columnas (el contenido mide ≈ 900 px), sin scroll | 4 teselas | Panel 40 rem | 720 px |
| 768 | Cajón | Tabla (≥ 768) con Responsable estrecho `w-36`; si no cabe, scroll con **primera columna fija** (`sticky left-0 bg-card z-sticky`) | 2×2 teselas | Panel `max-w-full` | 720 → `max-w-[calc(100%-1rem)]` |
| 375 | Cajón | `DataCardList` (4.5.4); kanban con `snap-x` | Teselas 2×2, Excel apilado, botones `w-full` | Pantalla completa; cabecera `grid-cols-2`; pestañas con scroll horizontal | 1 columna; pie con botones `w-full` |
Objetivos táctiles `pointer-coarse:min-h-10` (≥ 40 px; 44 px en `DataCardList touch`).

### 4.14 Modo oscuro (Dark Tech)
Todo usa tokens que ya tienen par oscuro; puntos de atención:
- Barras de avance: relleno `bg-primary` sobre pista `bg-muted` mide 3.08:1 (límite de 3:1). Se acepta porque el valor **siempre** va también en texto; **no** bajar la pista. Si se oscurece `--muted` oscuro, volver a medir.
- El callout de la fase usa `bg-primary-subtle/50`; en oscuro es azul profundo con texto `foreground` (13.2:1). El foco **no** se apoya en `primary-subtle` (`--ring` mide 2.75:1 contra él en oscuro): los controles dentro del callout van sobre `bg-card` y el foco se dibuja con `outline-offset-2`.
- Chips de vencimiento/bloqueo usan `Badge` (ya medido en ambos temas).
- La columna del kanban (`bg-muted/40`) y la tarjeta (`bg-card` + `ring-1 ring-border`) se separan por sombra y anillo; en oscuro `shadow-card` es más densa (ya definida).
- Línea de tiempo del historial: `bg-border` (decorativa), nodos `bg-primary-subtle text-link` (cian 5.99:1 sobre `primary-subtle` oscuro).

---

## 5. Estados de los controles (resumen)

| Control | Reposo | Hover | Foco | Deshabilitado | Cargando | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Exportar a Excel | outline sm | `hover:bg-accent` | `outline-2 outline-ring outline-offset-2` | no aplica | spinner + «Exportando…» | toast + región viva |
| Importar desde Excel | outline sm | ídem | ídem | `unavailable` + `DisabledReason` (por qué y cuándo) | spinner + «Importando…» | `InlineNotice danger` con lista |
| Avance (disparador) | barra + % + lápiz | `bg-accent` | outline | sin lápiz + motivo accesible | barra optimista `opacity-70` | popover abierto con `role=alert`; fila revertida |
| Estado (disparador) | insignia + chevron | `bg-accent` | outline | idem + motivo | spinner junto a insignia | toast; fila revertida |
| Responsable inline | iniciales + nombre + chevron | `bg-accent` | outline | sin chevron + motivo | spinner | toast; fila revertida |
| Tarjeta kanban | `shadow-card` | `hover:shadow-md` | foco en sus controles (no en la tarjeta) | no arrastrable (sin asa) | `opacity-70` | borde izquierdo `danger`/`warning` por vencida/bloqueada |
| Columna kanban | `bg-muted/40` | — | — | — | — | destino válido: `ring-2 ring-primary` |
| Pestañas del detalle | texto muted | `hover:text-foreground` | outline | no aplica | `Skeleton` en el contenido | `ErrorState` local |

---

## 6. Contrastes medidos (WCAG 2.2 AA)

Umbral: texto normal ≥ 4.5:1; texto grande, iconos informativos, bordes de control y relleno de barras ≥ 3:1. Método: conversión OKLCH → sRGB de los tokens de `globals.css`,
luminancia relativa, relación `(L1+0.05)/(L2+0.05)`. Translúcidos compuestos sobre su fondo (columna kanban = `muted/40` sobre `background`; hover de fila = `muted/50` sobre `card`; callout = `primary-subtle/50` sobre `popover`).

### 6.1 Texto

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| `foreground` / `card` | 14.75 | 14.98 | 4.5 ✔ |
| `muted-foreground` / `card` | 7.13 | 7.62 | 4.5 ✔ |
| `muted-foreground` / `background` | 6.22 | 8.47 | 4.5 ✔ |
| `muted-foreground` / `muted` | 5.72 | 6.95 | 4.5 ✔ |
| `foreground` / columna kanban | 12.44 | 15.52 | 4.5 ✔ |
| `muted-foreground` / columna kanban | 6.02 | 7.90 | 4.5 ✔ |
| `text-link` / `card` | 6.14 | 7.35 | 4.5 ✔ |
| `text-link` / `primary-subtle` (nodos de línea de tiempo, iniciales) | 4.98 | 5.99 | 4.5 ✔ |
| `muted-foreground` / `primary-subtle` | 5.79 | 6.21 | 4.5 ✔ |
| `foreground` / callout de fase | 13.30 | 13.16 | 4.5 ✔ |
| `muted-foreground` / callout de fase | 6.44 | 6.69 | 4.5 ✔ |
| `text-link` / callout de fase | 5.54 | 6.46 | 4.5 ✔ |
| `foreground` / hover de fila | 13.24 | 14.33 | 4.5 ✔ |
| `muted-foreground` / hover de fila | 6.40 | 7.29 | 4.5 ✔ |
| `text-link` / hover de fila | 5.51 | 7.03 | 4.5 ✔ |
| `foreground` / `surface-subtle` | 13.72 | 16.13 | 4.5 ✔ |
| `text-link` / `surface-subtle` | 5.72 | 7.91 | 4.5 ✔ |
| `text-warning` («Sin asignar») / `card` | 6.76 | 9.57 | 4.5 ✔ |
| `text-danger` / `card` · / columna kanban | 6.59 · 5.56 | 7.20 · 7.46 | 4.5 ✔ |
| `text-warning` / columna kanban | 5.70 | 9.92 | 4.5 ✔ |
| Blanco / `primary` (botones) | 4.84 | 4.84 | 4.5 ✔ |

### 6.2 Insignias y chips (texto sobre su fondo translúcido sobre `card`)

| Tono | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| success / success-subtle | 6.07 | 8.36 | 4.5 ✔ |
| warning / warning-subtle | 6.10 | 8.62 | 4.5 ✔ |
| danger / danger-subtle | 5.83 | 6.56 | 4.5 ✔ |
| info / info-subtle | 6.06 | 7.31 | 4.5 ✔ |
| neutral / neutral-subtle | 7.21 | 8.24 | 4.5 ✔ |
(El `Badge` real usa `bg-<tono>/12–14`; los márgenes de arriba son sobre `*-subtle`. El steering 25 documenta los valores de `Badge` ≥ 4.5 en ambos temas; no se cambian los porcentajes.)

### 6.3 No texto (barras, bordes, foco, nodos)

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Relleno de barra `primary` / pista `muted` | 3.88 | **3.08** | 3 ✔ (oscuro al límite, ver 4.14) |
| Relleno `success` / pista `muted` | 5.41 | 8.38 | 3 ✔ |
| Relleno `warning` / pista `muted` | 5.42 | 8.74 | 3 ✔ |
| Relleno `danger` / pista `muted` | 5.28 | 6.57 | 3 ✔ |
| `primary` (asa del deslizador, anillo de columna) / `card` | 4.84 | 3.37 | 3 ✔ |
| `ring` (`primary`) / columna kanban | 4.08 | 3.50 | 3 ✔ |
| `ring` / `card` | 4.84 | 3.37 | 3 ✔ |
| `ring` / `primary-subtle` | 3.93 | **2.75** | 3 ✔ claro · ✘ oscuro → no enfocar sobre `primary-subtle` en oscuro |
| `border-strong` (bordes de campos) / `card` | 3.64 | 3.51 | 3 ✔ |
| Banda izquierda `danger` (tarjeta/fila vencida) / `card` | 6.59 | 7.20 | 3 ✔ |
| Nodo `primary` de la línea de tiempo / `card` (si se usa relleno `primary`) | 4.84 | 3.37 | 3 ✔ |
| Pista `muted` / `card` | 1.25 | 1.10 | no se exige: la pista no es el componente; el relleno y el valor numérico sí se perciben |

Conclusión: todo cumple, con dos puntos a vigilar: la barra `primary` sobre `muted` en oscuro (3.08) y el foco sobre `primary-subtle` en oscuro (2.75). La separación entre pista y tarjeta (1.1–1.25) es decorativa por
diseño: el valor siempre está en texto.

---

## 7. Accesibilidad

**Roles y nombres**
- Tabla: `scrollLabel` ya existente. Cada fila: el nombre accesible de la tarea es el botón-título. Controles en línea con nombre completo («Actualizar avance de “Tarea uno” (actual: 40 %)», «Cambiar estado de…», «Responsable de…»).
- Barra de avance: decorativa (`aria-hidden`); el valor está en el texto del disparador. En la cabecera del detalle sí se usa `role="progressbar"` con `aria-valuenow/min/max`, `aria-valuetext="40 por ciento"` y `aria-label="Avance de la tarea"` porque allí no es botón.
- Kanban: `ul[aria-label="Tareas por estado"]` > `li` por columna > `section[aria-label]` > `ul` > `li` > `article[aria-labelledby]` (el título). Orden de lectura = orden visual.
- Detalle: el `Sheet` es `role="dialog"` con título; pestañas con el patrón WAI-ARIA de Radix; historial = `ol` (orden cronológico inverso) con `h4` por día y `<time>`.
- Diálogo de tarea: cada bloque es `fieldset`/`section` con `legend`/`h3`; errores con `aria-describedby` y `role="alert"` (ya lo hace `Field`).

**Teclado**
- Todo el flujo se hace sin ratón: abrir detalle (Enter en el título), cambiar estado (menú), cambiar avance (popover con ←/→/Home/End, Enter guarda, Esc cancela), mover tarjeta (menú «Mover a…»), crear tarea (diálogo).
- Orden de tabulación en tarjeta: título → «⋯» → avance → responsable → mover. Sin trampas: Esc cierra popover/menú/panel y devuelve el foco al disparador (el panel lo devuelve al título de la fila/tarjeta, 4.8).
- Arrastrar no es el único camino (WCAG 2.5.7): «Mover a…» lo reemplaza.

**Anuncios**
- Región `#plan-live` (`role="status"`, `aria-live="polite"`) para: avance/estado/responsable cambiados, tarjeta movida, tarea creada, historial actualizado, resultados del filtro («2 de 5 tareas»).
- Errores de formulario con `role="alert"`; el foco va al primer campo inválido.
- Cargas: `aria-busy="true"` en contenedores con `Skeleton`.

**Otros**
- No transmitir significado solo por color: vencida = chip con icono + banda; estados = insignia con icono y texto; bloqueada = icono `Ban`.
- Objetivos táctiles ≥ 40 px en `pointer-coarse`; 24 px mínimo en escritorio (WCAG 2.5.8) — el disparador de avance mide 28 × 36 como mínimo.
- `prefers-reduced-motion`: sin animación del anillo de la entrada nueva ni de la barra de avance (`motion-reduce:transition-none`).
- `forced-colors`: las barras usan `forced-color-adjust: auto` y el borde de la pista (`forced-colors:border`) para que se vea el relleno; el deslizador nativo respeta el sistema.
- Zoom 200 % / 400 %: sin scroll horizontal de página (capas 3.2), contenido reflow a tarjetas.
- WCAG: esta especificación se ha diseñado para AA, pero la validación completa exige pruebas manuales con tecnologías asistivas y revisión experta; no se declara conformidad.

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El endpoint de avance no existe | La petición 4 no se puede cumplir | Prerrequisito 0.1; el popover llama a una función `updateTaskProgress` tras el endpoint. Mientras no exista, la columna Avance es solo lectura. |
| `GET /tasks/{id}/history` aún sin commit | Pestaña Historial vacía | Detrás del contrato regenerado; si la API tarda, el front muestra el estado de error local. |
| Regla de avance por estado propuesta (editable en curso/bloqueada/revisión) | Puede chocar con negocio (p. ej. forzar 100 % al terminar) | Pregunta abierta 1; el backend decide y la UI refleja. |
| `overflow-x-clip` recorta contenido ancho en vez de desplazar | Un elemento ancho nuevo queda cortado sin aviso | Tablas y kanban ya son regiones con scroll; añadir prueba Playwright de `scrollWidth` a 375/768/1024. |
| Nueva dependencia Popover | Superficie de dependencias | Versión exacta; plan B sin dependencia (4.6.1). |
| Clic en tarjeta vs arrastre en Firefox/Safari | Abrir el panel al soltar | El `click` no se dispara tras un `dragstart` real; probar en los tres motores. Si fallara, guardar `dragEndedAt` y descartar clics < 150 ms. |
| Reducir la tabla de 9 a 6 columnas | Usuarios pierden Esfuerzo/Predecesoras de vista | Van al detalle y al Excel; si se reclaman, columna opcional «Columnas» (no se diseña ahora). |
| Quitar CSV | Algún usuario lo usaba | Aviso en el changelog; el Excel cubre el caso. Revisar pruebas e2e y MCP que mencionen CSV. |
| Fecha «hoy» por zona horaria | Vencida un día antes/después | `localDateInputValue` (hoy local) contra `endDate` solo-fecha UTC; casos límite cubiertos en pruebas unitarias. |
| Contraste oscuro de barra primaria 3.08 | Al límite | Ver 4.14; valor siempre en texto; medir si cambian los tokens. |
| Alcance grande | PRs enormes | Orden en 11 pasos pequeños (sección 9). |
| Archivo `tmp-plan.mjs` en la raíz (ajeno a este trabajo) | Basura en el repo | No lo toqué; conviene borrarlo cuando termine quien lo creó. Mis scripts temporales sí se eliminaron; las capturas `ux-*` quedan en `docs/design/capturas-planeacion/`. |

---

## 9. Orden de implementación (pasos pequeños; cada uno compila y se prueba solo)

0. **API (prerrequisitos)**: `PATCH /tasks/{id}/progress`; confirmar y commitear `GET /tasks/{id}/history`; contrato, cliente, MCP, docs (sección 10). Sin esto no avanzan 5, 6 y 9.
1. **Capas** (petición 9): tokens `--z-*` + `@utility`, cambios de clase en 8 archivos, `overflow-x-clip`. Prueba Playwright de `elementsFromPoint`. Independiente de todo lo demás: puede ir ya.
2. **Excel** (petición 1): mover la barra a `PlanSummary`, dos botones, enlace de plantilla, textos y diálogo de confirmación; retirar CSV (`downloadTasksCsv`, estado `noTasks`, motivo). Actualizar pruebas e2e.
3. **Utilidades**: `TaskProgressBar`, `taskDueInfo` (+ pruebas unitarias con fechas límite), chips, región viva `#plan-live`.
4. **Tabla de tareas**: 6 columnas, línea secundaria, «Ordenar por», «Nueva tarea» en la sección, `TaskResponsibleControl variant="inline"`, `DataCardList` móvil, ids estables `task-{id}-open` y retorno de foco del panel.
5. **Avance en línea** (petición 4): `@radix-ui/react-popover` + `ui/popover.tsx` + `TaskProgressControl` + `handleInlineProgressChange`; usar en tabla. (Requiere paso 0.)
6. **Kanban**: tarjeta nueva, apertura del detalle (petición 7), «Mover a…», columna con anillo, vacío, snap móvil.
7. **Diálogo de tarea** (petición 3): bloques, fase destacada con preselección y `help`, simetría 2×2, estados de carga de personas, `size="lg"`.
8. **Cabecera del detalle** (petición 5): `StatusBadge size="lg"`, barra, `dl`, acciones, pestañas, formulario como disclosure.
9. **Historial** (petición 6): `getTaskHistory`, componente de línea de tiempo, formateadores por campo, estados, recarga tras cambios. (Requiere paso 0.)
10. **Resumen y guía**: teselas, chip de envío con ancla, títulos positivos y motivo concreto del botón, desglose por fase, estados vacío/carga/error restantes, aviso de plan no editable.
11. **Cierre**: Playwright (flujos: importar/exportar, crear tarea con fase preseleccionada, cambiar avance con teclado, abrir detalle desde kanban, historial), axe en claro y oscuro a 375/768/1024/1280, capturas nuevas,
    `docs/aplicacion/frontend-pantallas.md`, `modulos-backend.md`, `changelog.json`, y la lista de comprobación del PR.

Pruebas: Jest (API: progreso, historial); `node --test` (MCP); Playwright (arriba) y unitarias de `taskDueInfo` y de los formateadores del historial.

---

## 10. Sincronía API · contrato · MCP · docs (regla 55)

| Cambio | OpenAPI / cliente | MCP | Docs |
| --- | --- | --- | --- |
| `PATCH /tasks/{id}/progress` (nuevo) | `UpdateTaskProgressDto { progress 0..100 }` + `@ApiResponse` 200/400/403/404/409; regenerar `openapi.json`, `schema.d.ts`, copia del api-client | tool `task.progress.update` (`access: 'write'`) | `modulos-backend.md`, `changelog.json` |
| `GET /tasks/{id}/history` (en curso) | `TaskHistoryEntryDto` ya con `@ApiProperty`; regenerar contrato | tool `task.history` (`access: 'read'`) | `modulos-backend.md`, `changelog.json` |
| Pantalla de Planificación | — | — | `frontend-pantallas.md` (secciones del módulo y capas), `changelog.json`; `apps/mcp/README.md` solo si cambia el catálogo |
| Retiro de CSV | — (era solo frontend) | — | `frontend-pantallas.md`, `changelog.json` |
El frontend consume ambos endpoints con `packages/api-client` (sin tipos a mano).

---

## 11. Preguntas abiertas (necesito decisión del producto/negocio)

1. **Regla de avance por estado**: ¿se permite editar el % en `EN_CURSO`/`BLOQUEADA`/`EN_REVISION` y se bloquea en `POR_HACER`/`TERMINADA`? ¿Al pasar a `TERMINADA` el backend debe fijar 100 %
   automáticamente (hoy no lo hace y se puede terminar con 0 %)? Recomendación: sí, y al reabrir conservar el último valor.
2. **Cambiar la fase de una tarea**: hoy no es posible. ¿Se quiere? Si sí, añadir `phaseId` a `UpdateTaskDto` y habilitar el selector en edición (la UI ya lo contempla).
3. **Popover**: ¿se aprueba `@radix-ui/react-popover` (versión exacta) o se prefiere el plan B del menú con valores fijos?
4. **Navegador y zoom del usuario** en el caso de la petición 9: confirmar si el solape ocurre con scroll horizontal de página (es lo que reproduje) o en otro punto; la regla de capas lo cubre en ambos casos.
5. **Plantilla de Excel**: ¿debe seguir siendo descargable con el plan autorizado? Propuesta: sí (es solo el formato); si no, ocultar el enlace cuando el importar esté deshabilitado.
