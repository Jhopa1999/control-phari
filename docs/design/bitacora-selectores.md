# Bitácora: selectores de proyecto y tarea con buscador. Especificación UX/UI

Especificación visual y de interacción (rol Director de Arte Frontend) para el formulario **Agregar / Editar
actividad** de la Bitácora (`/seguimiento/bitacora`) y el componente nuevo `SearchableSelect`
(`apps/web/src/components/searchable-select.tsx`). Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md`,
`55-sincronia-api-mcp-docs.md`; formato y componentes hermanos: `filtros-seleccion-multiple.md`,
`tarjetas-moviles-bl-024.md`, `id-chip.tsx`, `field.tsx`, `inline-notice.tsx`. Solo tokens semánticos (prohibido color
crudo y `z-[n]`), foco con `--ring`, español con tildes. **Sin dependencias nuevas**, **sin portal**, sin código de
aplicación en este documento (los fragmentos de clases son especificación).

Revisión 2: incorpora los hallazgos HIGH y MEDIUM de la revisión de diseño 1. Lo que no se puede cerrar desde
la especificación está en §8 «Pendientes para la implementación».

Contrato de datos sobre el que se diseña (`GET /worklog/options`, definido en `findings.md` §4.2-A; **ampliado en esta
revisión**, ver E13):

```text
query:    processId, date, scope = mine | all, includeTerminated, q?
projects: { id, code, title, state, closedAt, hasMyTasks }[]
tasks:    { id, code, title, status, phaseName, requestId, requestCode, isMine }[]
projectsTruncated: boolean      (nuevo)  true si hay más de 200 coincidencias
tasksTruncated:    boolean      (nuevo)
```

Las respuestas de actividad añaden `projectRequestCode`, `taskCode` y **`projectRequestState` (obligatorio)**.

Los contrastes **no se declaran aquí como medidos** para colores nuevos: este diseño solo combina pares de tokens ya
medidos en `identidad-color-menu.md`. Los pares compuestos que no están medidos se listan en §2.5 y deben medirse en
claro y oscuro antes de fusionar (§8).

---

## 0. Decisiones

| # | Punto | Decisión | Por qué |
| --- | --- | --- | --- |
| E1 | **Listado en línea, sin portal** | El listbox se pinta **en el flujo del formulario**, justo bajo el input, y empuja el contenido siguiente. Con altura máxima y scroll propio. | Un popover en portal dentro de un `Dialog` modal rompe foco, `Escape` y scroll lock. En línea, el foco y el cierre son los del propio diálogo. |
| E2 | **Patrón ARIA** | Combobox 1.2 con **foco DOM siempre en el input** y `aria-activedescendant` para la opción activa. | Los lectores de pantalla lo anuncian bien y permite seguir escribiendo mientras se navega. |
| E3 | **Escape** | Con el listado abierto, `Escape` **solo cierra el listado**. Con el listado cerrado, cierra el diálogo como hoy. | Evita perder el formulario por querer cerrar una lista. Mecanismo en §2.3 (viable con `onEscapeKeyDown` de Radix 1.2.0, verificado). |
| E4 | **Orden de campos** | **Proyecto antes que Tarea.** Elegir una tarea rellena el proyecto; elegir un proyecto filtra las tareas a las suyas. | Orden mental de la jerarquía (proyecto › fase › tarea) y regla D8 (el servidor deriva el proyecto de la tarea). |
| E5 | **Filtros de lista** | «Incluir terminadas» (casilla, todos los roles) y «Mis proyectos / Todos del área» (control segmentado, **solo jefe**) van en una fila de opciones **sobre** Proyecto. | Afectan a ambos selectores. |
| E6 | **Valor conservado (reescrita)** | Se inyecta **solo el valor persistido** de la actividad, **solo al abrir en edición** y solo si su id no está en la primera respuesta de opciones. Se muestra como opción en un grupo «Valor actual» con la etiqueta **«Cerrado»** si `projectRequestState = CERRADA` y **«No disponible»** en cualquier otro caso (incluida toda tarea). El valor elegido se guarda **siempre como objeto de opción** en el estado del formulario (id + código + título + estado), no se reconstruye desde `options`. Nunca queda el campo vacío por un valor que salió de la lista. | Corrige el hallazgo 1: reinyectar «cualquier id que no esté en `options`» marcaba «No disponible» con ayuda falsa al usar el conmutador del jefe o al quitar «Incluir terminadas». Con el objeto en estado, una opción elegida sigue mostrándose aunque un filtro posterior la saque de la lista. |
| E7 | **Qué es «Cerrado» y qué «No disponible» (reescrita)** | `ActivityResponseDto.projectRequestState` pasa a ser **obligatorio** (nulo solo si la actividad no tiene proyecto). «Cerrado» = ese estado es `CERRADA`. Cualquier otro estado, o una tarea que ya no sale en opciones, es «No disponible». Contrato, cliente, MCP y docs se actualizan en el mismo PR (regla 55). | Corrige el hallazgo 2: la API solo envía proyectos `CERRADA` dentro de la ventana de gracia, y esos **son elegibles**, así que «Cerrado» no puede depender de que el valor falte en las opciones. El estado debe venir con la actividad. |
| E8 | **Búsqueda** | Sin mayúsculas ni tildes. Proyecto: título, `code`, forma corta. Tarea: título, `code`, forma corta (`T07`), `requestCode`, **título del proyecto** y nombre de fase. Todos los términos separados por espacio deben aparecer (AND). Orden de resultados en §2.2 (coincidencia exacta de código primero). | «0012», «t07», «PRY-0012-T07» o «integracion» deben bastar. |
| E9 | **Sin cambio de `Select`** | `Select` de Radix **no se toca**. Solo Proyecto y Tarea de «Planificada» pasan a `SearchableSelect`. | Clasificación y el resto no pasan de 4 opciones. (Excepción acotada: E12.) |
| E10 | **Límite de resultados y búsqueda en servidor (reescrita)** | La API devuelve a lo sumo 200 por lista y ahora indica `projectsTruncated` / `tasksTruncated`. Mientras la lista correspondiente esté truncada, lo escrito se envía **también al servidor** como `q` con antirrebote de **250 ms** (la petición anterior se cancela); el filtro de cliente se sigue aplicando a lo recibido. Pie del listado (fuera del listbox): «Mostrando las primeras 200. Escribe para acotar.» Si no está truncada, no se llama al servidor al escribir. | Corrige el hallazgo 3: con filtro solo de cliente, lo que queda fuera del tope no se podía encontrar. |
| E11 | **Altura táctil** | Input y opciones: **44 px por debajo de `sm`** (`sm` = 640 px en Tailwind) y en `pointer-coarse`; 36 px (input) y 40 px (opción) en escritorio. **390 px es solo el ancho de verificación** (captura y e2e), no un breakpoint. | Brief (≥ 44 px en móvil). Difiere a propósito de los `Input` de 40 px en táctil: el dedo elige entre filas apretadas. |
| E12 | **Excepción a E9: `SegmentedRadio` admite `className`** | Se añade al componente una prop opcional `className` aplicada al contenedor (`cn` con `tailwind-merge` resuelve `inline-flex` frente a `flex w-full`). Cambio mínimo y retrocompatible. | Hallazgo 16: hoy el contenedor es `inline-flex` fijo y no admite ancho completo. Alternativa descartada: envolver en `div w-full`, porque no hace que las opciones llenen el ancho. |
| E13 | **Contrato de `GET /worklog/options`** | `date` (AAAA-MM-DD, la fecha del diario) es la **referencia temporal** con la que la API evalúa la ventana de gracia de proyectos `CERRADA` (cuenta si `closedAt` cae dentro de la ventana respecto a esa fecha). `scope`: `mine` devuelve proyectos con `hasMyTasks = true` y, en `tasks`, solo `isMine = true`; `all` (solo jefe) devuelve además los proyectos del área sin tareas propias y las tareas ajenas (`isMine = false`). Para líder e integrante el servidor ignora `all`. Ver pendiente P1 (verificación contra `findings.md` §4.2). | Hallazgo 15. |
| E14 | **El objeto elegido manda** | El estado del campo es `{ id, code, title, state?, snapshot }`; el input, el resumen (E15) y el envío usan ese objeto. `options` solo alimenta el listado. | Base de E6 y de que cambiar un filtro no «borre» ni «rotule» el valor. |
| E15 | **Formato del valor y resumen** | Texto del input cerrado: Proyecto `PRY-0012 · Título`; Tarea `PRY-0012-T07 · Título` (código completo). Con valor elegido, bajo el input aparece una **línea de resumen** `text-xs text-muted-foreground break-words` con el **título completo** (sin recorte) y, en tarea, `Fase · Proyecto`. | Hallazgo 13: el input recorta con elipsis y el título es justo lo que el usuario necesita leer. |

---

## 1. Anatomía del componente `SearchableSelect`

```
Etiqueta (Field, visible)
┌───────────────────────────────────────────────┐  h-11 sm:h-9 pointer-coarse:h-11
│ 🔍  Buscar proyecto…                   ✕   ▾  │  input role=combobox
└───────────────────────────────────────────────┘
 PRY-0012 · Portal de clientes de la región norte   ← resumen (valor elegido, título completo)
 (abierto) ┌─────────────────────────────────────┐
           │ Mis tareas · PRY-0012 › Fase 2  ← encabezado (dentro de li presentation)
           │  ▌[T07] Migrar endpoints        En curso    ← activa: barra de 3 px
           │   [T08] Pruebas de carga        Por hacer
           │ Otras tareas de tus procesos
           │   [T03] Revisar permisos  PRY-0004 · Ana P.
           └─────────────────────────────────────┘
 Mostrando las primeras 200. Escribe para acotar.   ← pie, FUERA del listbox
 (sr-only, siempre montada) región de estado: «12 resultados»
```

### 1.1 Contenedor y disparador (input)

Contenedor: `relative grid gap-1.5` (el `Field` pone la etiqueta). El input es **un solo control**: cerrado muestra el
valor elegido (formato E15); abierto muestra lo que se escribe.

| Parte | Clases |
| --- | --- |
| Input | `h-11 w-full min-w-0 rounded-md border border-input bg-background pl-9 pr-[5.5rem] text-sm text-ellipsis transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:border-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground read-only:bg-muted/50 sm:h-9 pointer-coarse:h-11` |
| Icono de búsqueda (decorativo, `aria-hidden`) | `Search` de lucide, `pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground` |
| Botón limpiar | ver §1.3 |
| Chevron (decorativo) | `ChevronDown size-4 text-muted-foreground`, gira 180° con `aria-expanded` (`transition-transform motion-reduce:transition-none`), `pointer-events-none absolute right-3` |
| Valor largo | el input recorta con `text-ellipsis`; el nombre completo va en `title` y **siempre** en el resumen (E15) |
| Resumen del valor | `p` `text-xs text-muted-foreground break-words`, `id` referenciado por el `aria-describedby` del input. Solo con valor elegido. |

- Cerrado y con valor: el texto es `text-foreground`. Sin valor: `placeholder` (`Buscar proyecto…` / `Buscar tarea…`).
- **Cuándo abre (hallazgo 10):** solo con **clic** en el input, `↓` / `↑` o al **escribir**. **Recibir foco por `Tab`
  no abre** el listado (si abriera, el formulario se desplazaría al tabular).
- Al abrir, **selecciona todo el texto** del input: la primera pulsación reemplaza el texto visible por la búsqueda sin
  tocar el valor elegido (E14) hasta que se elige otra opción o se limpia.
- **Opción activa inicial (hallazgo 18):** al abrir con clic no hay ninguna activa, salvo que exista valor elegido
  (entonces es la activa y se desplaza a la vista). `↓` abre y activa la elegida o la primera; `↑`, la elegida o la
  última.
- Cerrar sin elegir (`Escape`, clic fuera, `Tab`) **restaura** el texto del valor elegido.
- El borde de reposo es `border-input`, igual que `Input` y `SelectTrigger`.

### 1.2 Listbox (en línea)

- Estructura (hallazgo 4), la única válida para ARIA:

```text
ul[role=listbox][id][aria-labelledby=<etiqueta del campo>]
  li[role=presentation]                      ← uno por grupo
    div[id=<g>]  encabezado visible (no es hijo del group)
    ul[role=group][aria-labelledby=<g>]
      li[role=option][id][aria-selected]     ← solo opciones
```

  Sin grupos (cuando todo cabe en uno y no hay encabezado): `ul[listbox] > li[option]` directo. **Dentro del listbox
  no hay nada más** que `li presentation` y `li option`: ni `role="status"`, ni pie, ni mensajes. El estado vacío
  (§2.4), el pie de truncado y la región `aria-live` (§1.6) van **fuera** del listbox, después de él.
- Posición: `mt-1` bajo el input; ocupa todo el ancho del campo. Sin `absolute` ni `z-*`: forma parte del flujo.
- Superficie: `rounded-md border border-border bg-popover text-popover-foreground shadow-sm`.
- Altura: `max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain p-1`.
- **Teclado virtual (hallazgo 12):** `dvh` no descuenta el teclado en iOS, así que no se confía en él. Criterio: al
  abrir y en cada evento `resize` de `window.visualViewport`, el campo se mantiene visible con
  `scrollIntoView({ block: 'nearest' })` y el alto máximo del listbox se limita a
  `min(18rem, 45dvh, visualViewport.height − (borde inferior del input − visualViewport.offsetTop) − 8px)` (cálculo
  en el componente, aplicado como variable CSS `--sel-max`; el CSS usa `max-h-[min(18rem,45dvh,var(--sel-max,18rem))]`).
  Aceptación: con el teclado abierto en emulación 390×664 (iOS y Android), el input y la opción activa quedan
  dentro del viewport visual; se comprueba con captura (§6) y prueba en dispositivo (§8, P5).
- `aria-multiselectable` no se pone (selección única).

### 1.3 Botón limpiar

- Solo existe cuando hay valor elegido (o texto de búsqueda) y el campo no está deshabilitado ni en `readOnly`.
- `button type="button"`, `aria-label` recibido por **prop `clearLabel`** (hallazgo 19): Proyecto «Quitar proyecto
  seleccionado», Tarea «Quitar tarea seleccionada»; con texto de búsqueda y sin selección, la prop `clearSearchLabel`
  («Borrar búsqueda»). El componente no tiene textos fijos. Icono `X size-4`, `aria-hidden`.
- Objetivo táctil: `absolute right-9 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground sm:size-9 pointer-coarse:size-11 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring`.
- Orden de tabulación: input → limpiar. Tras limpiar, el foco vuelve al input y el listado se abre (acción por clic).
- Limpiar el **proyecto** también limpia la tarea elegida si esta pertenecía a ese proyecto (E4, con nota visible
  §2.2); limpiar la **tarea** mantiene el proyecto.

### 1.4 Opción

Una fila por proyecto o tarea. `li role="option"` con `id` único, `aria-selected`, `data-active` para la activa.

```
┌──────────────────────────────────────────────────────────────┐
│ ▌[PRY-0012]  Portal de clientes                  En ejecución │  proyecto (activa)
│ [T07]  Migrar endpoints a la API v2                  En curso │  tarea (mía)
│ [T03]  Revisar permisos                          PRY-0004 · … │  tarea ajena
└──────────────────────────────────────────────────────────────┘
```

| Parte | Especificación |
| --- | --- |
| Fila | `relative flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm sm:min-h-10 pointer-coarse:min-h-11` |
| Activa (teclado o ratón) — hallazgo 5 | Relleno `bg-accent text-accent-foreground` **más una barra de 3 px**: `before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-ring`. La barra, no el relleno, es el indicador (en claro `--accent` ≈ `--muted` y en oscuro casi igual al fondo). Es la opción de `aria-activedescendant`. |
| Alto contraste (`forced-colors`) | `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` y la barra pasa a `forced-colors:before:bg-[HighlightText]`. Son palabras clave del sistema, no colores crudos. Los iconos usan `forced-colors:fill-current`/`currentColor`. La opción seleccionada conserva el icono `Check`. |
| Seleccionada | Icono `Check size-4` a la **derecha** y `font-medium`. No depende solo del color (WCAG 1.4.1). |
| ID | `IdChip` con `copyable={false}` (la fila ya es control): `variant="full"` en proyectos y en tareas ajenas, `variant="short"` en tareas bajo su grupo de proyecto. En la fila **activa** el chip usa `bg-card` (repliegue fijado; §2.5). |
| Título | `min-w-0 flex-1 line-clamp-2 wrap-break-word`. Hasta **dos líneas**. |
| Meta derecha | `StatusBadge` pequeño del estado (proyecto: estado operativo; tarea: estado de tarea). Por debajo de `sm` pasa a una segunda línea bajo el título (`flex-wrap`). |
| Tarea ajena (`isMine = false`) | Segunda línea `text-xs text-muted-foreground`: `IdChip(requestCode)` + título del proyecto + fase. En fila activa el `text-xs` se mide (§2.5). |
| Proyecto con `hasMyTasks` | Sin marca especial: el grupo «Mis proyectos» lo comunica. |
| Proyecto `CERRADA` (dentro de la ventana) | Badge «Cerrado» neutro (`bg-neutral-subtle text-neutral border-neutral-border`) además del estado; auxiliar `text-xs text-muted-foreground`: «Cerrado el 3 nov». |
| Deshabilitada | No existen opciones deshabilitadas. |

**Selección con puntero (hallazgo 14).** En el `ul` y en cada opción, `onMouseDown` hace `preventDefault()` (el foco
no sale del input, y no se elige nada en ese momento). La opción se elige en `click`. Así, arrastrar para desplazar la
lista en táctil o con rueda no elige por accidente. El listado se cierra por `focusout` del contenedor del campo cuando
`relatedTarget` está fuera de él (al pasar al botón limpiar no se cierra).

### 1.5 Grupos

- Cada grupo cumple la estructura de §1.2: encabezado visible en `div` con `id` dentro del `li presentation`, **fuera**
  del `ul role="group"`; el group usa **solo `aria-labelledby`** (hallazgo 17; no `aria-label`).
- Encabezado: `px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground`. No entra en el recorrido por teclado.
- Proyectos: «Mis proyectos» (`hasMyTasks`) y, si hay más, «Otros proyectos de tu área». Cuando todo cabe en uno, no
  hay encabezados. **Los grupos sin resultados se ocultan** (hallazgo 20), también al buscar.
- Tareas: un grupo por proyecto y fase (§2.2).
- Separación entre grupos: `border-t border-border/60 mt-1` salvo el primero.

### 1.6 Estados del componente

| Estado | Visual | Semántica |
| --- | --- | --- |
| Reposo / foco | §1.1 | `aria-expanded="false"`; foco con `--ring`. |
| Abierto con resultados | Listbox visible. | `aria-expanded="true"`, `aria-controls`, `aria-activedescendant` (solo con activa). |
| Cargando, **con valor guardado (edición)** | Input en `readOnly` mostrando el valor guardado (E15) con `read-only:bg-muted/50`, sin botón limpiar, sin abrir. Sin skeletons. | `aria-busy="true"` en el contenedor; la región sr-only dice «Cargando proyectos y tareas». |
| Cargando, **sin valor** | Input `disabled` con `placeholder="Cargando opciones…"`. Sin skeletons (un input deshabilitado no puede abrir nada). | Igual. |
| Vacío (sin opciones en absoluto) | Al abrir, **bloque de estado fuera del listbox** (`px-3 py-4 text-sm text-muted-foreground`, §2.4) justo debajo del input. El listbox no se pinta. El input mantiene `aria-expanded="true"` sin `aria-activedescendant`. | Texto leído por la región viva (siguiente fila). |
| Sin resultados de búsqueda | Bloque de estado fuera del listbox: «Sin resultados para “{q}”.» + «Prueba con el código (PRY-0012, T07) o parte del título.» | Ver región viva. |
| **Región viva (hallazgo 7)** | `div` `sr-only` `role="status"` `aria-live="polite"` **siempre montada**, hermana del input y **fuera del listbox**, con una sola por campo. | Anuncia, con antirrebote de 250 ms por cambio de consulta: «{n} resultados» / «1 resultado» / «Sin resultados», los avisos de §2.2 y el texto de carga. Al abrir sin consulta anuncia el total. |
| Error de carga | Ver §2.4. | `InlineNotice tone="danger"`. |
| Deshabilitado | `disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed`; el motivo va en `help` del `Field`, no solo en `title`. | `disabled` real; limpiar y chevron se ocultan. |
| Inválido (regla combinada «proyecto o tarea») | **Ambos campos** (Proyecto y Tarea) con `aria-invalid` + `border-danger` mientras el error compartido esté activo (hallazgo 19); `aria-describedby` incluye el `FormError`. | Foco al primer campo con error: el input de Proyecto. |

---

## 2. Comportamiento

### 2.1 Teclado

| Tecla | Listado cerrado | Listado abierto |
| --- | --- | --- |
| Escribir | Abre y filtra. | Filtra; la **primera opción visible** pasa a ser la activa. |
| `↓` | Abre; activa la opción elegida o la primera. | Activa la siguiente; en la última, **se detiene**. |
| `↑` | Abre; activa la elegida o la última. | Activa la anterior; en la primera, se detiene. |
| `Home` / `End` | Mueve el cursor del texto (nativo). | Sin modificadores: **activa la primera / última opción** (`preventDefault`). Con `Ctrl`/`Meta`/`Shift`: se conserva el comportamiento nativo del input (mover o seleccionar texto). |
| `Enter` | Comportamiento nativo del input: envía el formulario. | **Siempre `preventDefault`** (nunca envía): elige la opción activa y cierra; si no hay activa, solo evita el envío. Devuelve el texto del valor. |
| `Escape` | Cierra el diálogo (comportamiento del `Dialog`). | **Cierra solo el listado** y restaura el texto del valor. |
| `Tab` | Sale del campo (al botón limpiar o al siguiente); **no abre** el listado al recibir foco. | Cierra el listado sin elegir y sigue el orden normal. |
| `PageUp` / `PageDown` | — | Mueven la opción activa 8 posiciones. |

La opción activa siempre queda visible (`scrollIntoView({ block: 'nearest' })`). No hay recorrido circular.

### 2.2 Orden, agrupación y relación Proyecto ↔ Tarea

**Proyecto.** El listado ordena:
1. Grupo «Mis proyectos»: `hasMyTasks = true`, por código ascendente.
2. Grupo «Otros proyectos de tu área»: el resto (líder y jefe; el integrante nunca los recibe), por código.
3. Cerrados dentro de la ventana de gracia van **al final de su grupo**, con la etiqueta «Cerrado».

**Con texto de búsqueda (hallazgo 20).** Se conservan los grupos, pero los vacíos se ocultan; dentro de cada grupo,
primero la **coincidencia exacta de código** (`PRY-0012`, `T07` o `PRY-0012-T07`), luego las coincidencias por prefijo
de código y después el orden normal. Si la coincidencia exacta está en un grupo posterior, ese grupo no se reordena
pero la opción se activa de forma inicial (la «primera visible» de §2.1 es la exacta).

**Tarea.** Un grupo por pareja (proyecto, fase), en este orden:
1. Grupos de tareas **mías** (`isMine = true`), por código de proyecto y orden de fase. Encabezado:
   **«PRY-0012 · Portal de clientes › Fase 2»**. Dentro, por código de tarea.
2. Un único grupo al final, **«Otras tareas de tus procesos»** (solo líder y jefe: `isMine = false`), ordenado por
   proyecto, fase y código. Cada opción muestra la segunda línea con proyecto y fase (§1.4).
3. Si el integrante solo tiene tareas en un proyecto, **sigue habiendo encabezado de grupo**.

**Relación Proyecto ↔ Tarea (E4).**
- Con un proyecto elegido, la lista de tareas solo contiene las de ese proyecto (`requestId`); los grupos se reducen a
  «Fase …».
- Elegir una tarea de otro proyecto rellena el proyecto con ese (objeto, E14); aparece una **nota visible** bajo el
  campo Proyecto (hallazgo 8): «Proyecto actualizado a PRY-0012.», y se anuncia por la región viva.
- Cambiar o limpiar el proyecto **quita la tarea** si no pertenece al nuevo; **nota visible** bajo el campo Tarea:
  «Se quitó la tarea porque pertenece a otro proyecto.» y se anuncia igual.
- Las notas visibles: `p` `text-xs text-foreground` con icono `Info size-3.5` (`aria-hidden`), sin `role` propio (la
  región viva es la única que anuncia, para no duplicar). Se muestran hasta que el usuario cambie ese campo, el
  proyecto o la tarea de nuevo, o cierre el formulario; no desaparecen por tiempo.
- Una tarea elegida mantiene el proyecto aunque no esté en `projects` (por ejemplo con «Mis proyectos»): el objeto ya
  está en estado (E14), no se vuelve a rotular «No disponible».

### 2.3 Escape que no cierra el diálogo (E3)

Radix `Dialog` escucha `keydown` de `Escape` en `document` en **fase de captura**; un `stopPropagation()` en el
`onKeyDown` del input llega tarde. Mecanismo:

1. `SearchableSelect` expone `aria-expanded` en el input (`role="combobox"`).
2. `ActividadFormDialog` pasa a `DialogContent` el manejador `onEscapeKeyDown`. Si
   `document.activeElement?.matches('[role="combobox"][aria-expanded="true"]')`, hace `event.preventDefault()`.
3. El `onKeyDown` del input cierra el listado y restaura el texto.
4. `onEscapeKeyDown` se ejecuta antes de que el estado cambie, de modo que `aria-expanded` sigue en `true` y la
   comprobación es fiable.

Verificado en el código instalado (Radix Dialog 1.2.0 expone `onEscapeKeyDown`). e2e: `Escape` con listado abierto deja
el diálogo; el segundo `Escape` lo cierra.

### 2.4 Estados vacíos, carga y error

| Situación | Dónde | Texto exacto | Acción |
| --- | --- | --- | --- |
| Cargando opciones | Ambos campos | §1.6 (placeholder «Cargando opciones…» o valor `readOnly`) + sr-only «Cargando proyectos y tareas» | — |
| Sin proyectos (integrante sin tareas activas) | Bloque de estado bajo Proyecto | **«No tienes proyectos activos con tareas asignadas.»** + «Si necesitas imputar a uno, pide a tu líder que te asigne una tarea.» | — |
| Sin proyectos (líder/jefe con «Mis proyectos») | Bloque bajo Proyecto | «No tienes proyectos propios activos.» + «Activa “Todos del área” para ver los demás.» | — |
| Sin tareas | Bloque bajo Tarea | «No hay tareas disponibles.» + (con «Incluir terminadas» desactivada y hay terminadas) «Marca “Incluir terminadas” para ver las que ya cerraste.» | — |
| Sin resultados de búsqueda | Bloque bajo el input | «Sin resultados para “{q}”.» | — |
| Error al cargar | Bajo la fila de opciones de lista | `InlineNotice tone="danger"`: «No se pudieron cargar los proyectos y tareas. {mensaje de la API}» | Botón «Reintentar» (`Button variant="outline" size="sm"`). Sin valor, ambos campos quedan `disabled`. **En edición con valor guardado, quedan `readOnly` mostrando el valor** (hallazgo 11) y se puede guardar sin cambiarlo. |

Si la clasificación **no** es Planificada, estos campos no se renderizan y no se pide nada. Las opciones se piden **una
vez al abrir** el formulario (con `processId` y `date`), y de nuevo al cambiar el conmutador del jefe, «Incluir
terminadas» o (E10) el texto con lista truncada; la petición anterior se cancela. Cambiar un filtro de lista **no**
inyecta ni rotula el valor elegido (E6/E14).

### 2.5 Tokens de marca y contraste (claro y oscuro)

| Elemento | Token |
| --- | --- |
| Input | `bg-background`, borde `border-input`, texto `text-foreground`, placeholder `text-muted-foreground` |
| Listbox | `bg-popover text-popover-foreground`, borde `border-border`, sombra `shadow-sm` |
| Opción activa | `bg-accent text-accent-foreground` + barra `bg-ring` de 3 px (§1.4) |
| Encabezado de grupo | `text-muted-foreground` sobre `bg-popover` (par medido) |
| Check, foco | `--ring` para foco; el check usa `text-foreground`, no `text-primary` |
| «Cerrado» | `bg-neutral-subtle text-neutral border-neutral-border` |
| «No disponible» | `bg-warning-subtle text-warning border-warning-border` + icono `AlertTriangle` |
| Error | `InlineNotice tone="danger"` y `aria-invalid:border-danger` |

**Pares que hay que medir (hallazgo 6)**, en **claro y oscuro**, objetivo ≥ 4.5:1 texto y ≥ 3:1 bordes/iconos/barra.
Los marcados «medido» ya están en `identidad-color-menu.md`; el resto es **nuevo y se anota en el PR**:

| # | Par | Estado |
| --- | --- | --- |
| 1 | `text-foreground` / `bg-popover` | medido |
| 2 | `text-muted-foreground` / `bg-popover` (encabezados, auxiliares) | medido |
| 3 | `text-accent-foreground` / `bg-accent` (título de la opción activa) | por medir |
| 4 | `text-muted-foreground` `text-xs` / `bg-accent` (segunda línea de tarea ajena y «Cerrado el 3 nov» en fila activa) | por medir |
| 5 | Texto del `IdChip` / `bg-muted` sobre `bg-popover` (fila inactiva) | por medir |
| 6 | Texto del `IdChip` / `bg-muted` sobre `bg-accent` (fila activa) | por medir; **repliegue fijado: el chip pasa a `bg-card` en la fila activa si falla en cualquiera de los dos temas** (o en ambos, por consistencia) |
| 7 | `StatusBadge` pequeño sobre `bg-popover` y sobre `bg-accent` (cada tono usado: estado de proyecto y de tarea) | por medir |
| 8 | Badge «Cerrado» (`text-neutral` / `bg-neutral-subtle`) sobre `bg-popover` y sobre `bg-accent` | por medir |
| 9 | Badge «No disponible» (`text-warning` / `bg-warning-subtle`) sobre `bg-popover` | por medir |
| 10 | `bg-ring` (barra de 3 px) contra `bg-accent` y contra `bg-popover` (≥ 3:1) | por medir |
| 11 | Fila de opciones `bg-muted/50`: `text-foreground` y borde del `Checkbox` sobre `bg-muted/50` sobre el fondo del diálogo | por medir |
| 12 | `text-muted-foreground` `text-xs` / `bg-muted/50` del input `readOnly` | por medir |
| 13 | Nota visible `text-foreground` / fondo del diálogo | medido (mismo par que 1 con fondo `card`) |

Si el par 11 o 12 falla, `bg-muted/50` se sustituye por `bg-muted` o por `bg-card` con borde `border-border`.

---

## 3. Formulario `actividad-form-dialog.tsx`

Se mantiene `DialogContent size="md"`, `DialogBody grid gap-5`, secciones «Clasificación y referencia» y «Detalle
de la actividad», `FormError` al pie. Los cambios son locales a «Clasificación y referencia» y al campo
«Novedad relacionada», que se **elimina** (con la prop `issues`, el estado `relatedIssueId` y su `Field`).

### 3.1 Estructura con «Planificada» (escritorio 1440)

```
Clasificación y referencia
 Clasificación *        [ Planificada ▾ ]
 ┌ fila de opciones de lista ────────────────────────────────────┐
 │ ☐ Incluir terminadas      Mostrar: ( Mis proyectos | Todos del área )  ← solo jefe │
 └──────────────────────────────────────────────────────────────┘
 Proyecto (solicitud)   [ 🔍 Buscar proyecto…            ✕ ▾ ]
 Tarea                  [ 🔍 Buscar tarea…               ✕ ▾ ]
 (ayuda) Indica un proyecto o una tarea (al menos uno).
```

- La **fila de opciones de lista** solo aparece con «Planificada». Contenedor:
  `flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted/50 px-3 py-2` (contraste: §2.5, par 11). Sin título;
  `role="group"` con `aria-label="Opciones de la lista de proyectos y tareas"`.
- **Casilla «Incluir terminadas»**: `Checkbox` existente + `Label` con `min-h-11 sm:min-h-8 items-center gap-2`. Texto
  de ayuda `sr-only`: «Muestra también las tareas ya terminadas.». Relanza la petición con `includeTerminated=true`.
- **Conmutador del jefe**: `SegmentedRadio`, `name="act-scope"`, opciones `mine` → «Mis proyectos» y `all` → «Todos
  del área», valor inicial `mine`. Etiqueta visible «Mostrar» (`id="act-scope-label"`) enlazada con `labelledBy`.
  Solo se renderiza si `permissions` indica jefe; para líder e integrante **no existe**. Opciones con
  `optionClassName="h-11 sm:h-8 min-w-[7.5rem] flex-1 sm:flex-none"`.
  **Ancho completo (E12, hallazgo 16):** se pasa la nueva prop `className="flex w-full sm:inline-flex sm:w-auto"`
  al contenedor. Es una modificación mínima de `segmented-radio.tsx`, retrocompatible (sin `className` el
  componente no cambia), y es la excepción registrada a E9.
- Si hay proyectos o tareas de **otro** responsable en la respuesta, no hay texto adicional: la segunda línea (§1.4) y el
  grupo «Otras tareas de tus procesos» (§2.2) ya lo dicen.

### 3.2 Proyecto

- `Field id="act-project" label="Proyecto (solicitud)"`. El `Field` entrega los `aria-*` al `<input>`.
- Nota visible de cambio automático (§2.2) bajo el campo, y resumen del valor (E15).
- `projectRef` apunta al input (hoy es `HTMLButtonElement`; pasa a `HTMLInputElement`).
- Recibe `aria-invalid` junto con Tarea mientras el error compartido esté activo (§1.6).

### 3.3 Tarea

- `Field id="act-task" label="Tarea" help="Indica un proyecto o una tarea (al menos uno)."`.
- Opciones desde `tasks`, filtradas por el proyecto elegido (§2.2). Sin proyecto elegido se listan **todas** las
  elegibles (agrupadas).
- Integrante: solo sus tareas (la API ya filtra). Líder y jefe: además el grupo «Otras tareas de tus procesos».
- Nota visible de tarea quitada (§2.2) y resumen del valor (E15).

### 3.4 Valor conservado en edición (E6, E7, E14)

Al editar, el formulario inicializa el objeto del campo con la **instantánea de la actividad** (`projectRequestId`,
`projectRequestCode`, título, `projectRequestState`; `taskId`, `taskCode`, título). Después de la **primera respuesta
de opciones**:

- Si el id persistido **sí está** en las opciones, no se inyecta nada (aparece en su grupo normal; con `CERRADA`
  dentro de la ventana lleva el badge «Cerrado» de §1.4).
- Si **no está**, se inyecta **esa y solo esa** opción como primera de un grupo **«Valor actual»**, con la etiqueta:
  - «**Cerrado**» si `projectRequestState = CERRADA`.
  - «**No disponible**» en cualquier otro caso (y siempre en tareas).
- La inyección se decide **una sola vez** (con la primera respuesta tras abrir) y no se recalcula al usar el conmutador
  del jefe, «Incluir terminadas» o la búsqueda en servidor. Si el usuario elige otro valor, el grupo «Valor actual» desaparece
  y no se puede volver a elegir. Si el valor persistido se elige otra vez antes de cambiar nada, no hay cambio.
- **Ayuda en `help` del `Field` según la etiqueta** (se lee con `aria-describedby`):
  - «Cerrado» (proyecto): **«Este proyecto está cerrado y ya no admite nuevas actividades. Puedes dejarlo como está; si
    lo cambias, no podrás volver a elegirlo.»**
  - «No disponible» (proyecto): **«Este proyecto ya no está disponible para imputar. Puedes dejarlo como está; si lo
    cambias, no podrás volver a elegirlo.»**
  - Tarea: **«Esta tarea ya no está disponible para imputar. Puedes dejarla como está; si la cambias, no podrás volver a
    elegirla.»**
  - Sin etiqueta (valor normal elegido, o cambiado por el usuario) no hay esta ayuda.
- Dejarlo tal cual y guardar **no** envía cambio de referencia (el servidor no revalida lo que no cambia).
- Limpiar el campo (✕) deja el valor vacío: acción consciente, sin confirmación.

### 3.5 ID visible en lista y detalle del diario

- **Lista de actividades** (`bitacora-detalle.tsx` y filas/tarjetas): proyecto y tarea muestran su ID con
  `IdChip variant="full" copyable={false}` seguido del título; sin código (dato antiguo), solo título.
  - Escritorio 1440 / 1024: proyecto y tarea en una línea cada uno, `flex flex-wrap items-baseline gap-x-2`.
  - 390 (ancho de verificación): título en `line-clamp-2`, el chip en su propia línea cuando no cabe.
- **Detalle de la actividad**: la fila «Proyecto» y «Tarea» usa el **chip copiable** más el título.
- Se **retira** la fila «Novedad» del detalle (`add('Novedad', act.relatedIssueTitle)`).

---

## 4. Responsivo

| Ancho | Fila de opciones | Campos | Listbox | Objetivos |
| --- | --- | --- | --- | --- |
| **1440 px** | Una línea: casilla a la izquierda, segmentado a la derecha (`justify-between`). | Diálogo `md`; una columna. | Ancho del campo (~28 rem); `max-h-72`; opciones de línea y media. | Input 36 px, opciones 40 px. |
| **1024 px** | Igual. | Igual. | Igual. | Igual. |
| **390 px (verificación; < `sm`)** | Dos líneas (`flex-wrap`): casilla arriba, segmentado debajo a ancho completo (`flex w-full`, cada opción `flex-1`). | Una columna. | Alto máximo según §1.2 (teclado virtual); título en 2 líneas; badge en 2.ª línea; el ID no se corta. | **44 px** en input, limpiar, opciones, casilla y segmentado. |
| **320 px (zoom 400 % / WCAG 1.4.10)** | Todo apilado; sin scroll horizontal. | Sin recortes ni solapes del botón limpiar sobre el texto (`pr-[5.5rem]` reserva el espacio). | El `IdChip` no se corta: la fila pasa a 2 líneas (chip, luego título y meta). | Mismos 44 px. |

- Teclado virtual en 390: ver criterio y aceptación en §1.2. El `DialogBody` es el único scroll además del propio listbox.
- `prefers-reduced-motion`: sin giro del chevron ni animación al abrir (`motion-reduce:transition-none`).
- **Alto contraste / `forced-colors`**: opción activa, seleccionada, foco y bordes visibles (§1.4); se verifica con
  captura en emulación `forced-colors: active`.
- Texto largo: nunca `truncate` a una línea en el título de las opciones; `line-clamp-2` + `wrap-break-word`. El
  resumen (E15) muestra el título completo del valor elegido.

---

## 5. Accesibilidad (resumen verificable)

- Input: `role="combobox"`, `aria-expanded`, `aria-controls` (id del listbox), `aria-autocomplete="list"`,
  `aria-activedescendant` (solo con opción activa), `aria-haspopup="listbox"`, nombre accesible por `Field`
  (`<label for>`), `aria-describedby` con resumen, ayuda, nota visible y error.
- Listbox: `role="listbox"`, `aria-labelledby` de la etiqueta; grupos `role="group"` con **`aria-labelledby`** al
  encabezado (estructura de §1.2: sus únicos hijos son `li presentation` / `li option`); opciones `role="option"` con
  `aria-selected`. El nombre de la opción incluye el ID visible; el `IdChip` aporta `sr-only` «Código».
- Región viva `role="status"` `aria-live="polite"` **siempre montada** y fuera del listbox (§1.6), una por campo, con
  antirrebote de 250 ms y anuncio del número de resultados.
- Foco: el foco DOM nunca sale del input mientras navegas; `mousedown` con `preventDefault()` y selección en `click`
  (§1.4); cierre por `focusout` con `relatedTarget`; `Tab` no abre el listado.
- Cambios silenciosos (tarea quitada, proyecto cambiado): nota visible + región viva (§2.2).
- WCAG 2.2: 1.4.1 (no solo color: check, barra, etiqueta de texto), 1.4.10 (reflujo a 320 px), 1.4.11 (bordes, barra),
  2.4.7 y 2.4.11 (foco visible; el listado va debajo del input), 2.5.8 (≥ 44 px en táctil).
- La validación completa exige prueba manual con lector de pantalla y revisión experta; `axe` con el listado abierto
  cubre solo lo automatizable.

---

## 6. Archivos y pruebas

- **Nuevo:** `apps/web/src/components/searchable-select.tsx` y la función pura de filtrado
  (`apps/web/src/lib/searchable-filter.ts`: normaliza `NFD`, sin mayúsculas, AND de términos, forma corta, orden por
  coincidencia exacta de código).
- **Modificado (web):** `actividad-form-dialog.tsx` (campos, fila de opciones, valor conservado como objeto, quitar
  Novedad, notas visibles), `bitacora-view.tsx` y `bitacora-detalle.tsx` (carga de opciones, ID visible),
  `components/ui/segmented-radio.tsx` (prop `className`, E12), `lib/worklog.ts` o equivalente (cliente tipado).
- **Modificado (API/contrato/MCP/docs, mismo PR; regla 55):** `GET /worklog/options` con `q`, `projectsTruncated` y
  `tasksTruncated`; `ActivityResponseDto.projectRequestState` obligatorio; `npm run contracts:generate`; tool del MCP
  actualizada (o exclusión motivada); `docs/aplicacion/**` y `changelog.json`; Jest de la API y `node --test` del MCP.
- **Pruebas unitarias del filtro:** tildes, mayúsculas, `0012`, `T07`, `pry-0012-t07`, varios términos, vacío,
  coincidencia exacta primero, grupos vacíos ocultos.
- **Pruebas del componente / estado:** `Home`/`End` con y sin modificadores, `Enter` nunca envía con listado abierto,
  `Tab` no abre, `mousedown` no elige y `click` sí, `focusout` con `relatedTarget`, valor elegido persiste al cambiar
  filtros, inyección de «Valor actual» una sola vez, ayuda según etiqueta («Cerrado» vs «No disponible»).
- **e2e (Playwright):** integrante solo ve sus tareas agrupadas; busca por `T0X` y por título sin tildes; búsqueda en
  servidor con lista truncada (simulada); teclado completo (`↓ ↑ Home End Enter Escape`; `Escape` con listado abierto no
  cierra el diálogo); jefe con conmutador (sin rotular el valor «No disponible» al conmutar); edición conserva
  proyecto `CERRADA` con etiqueta «Cerrado» (fuera y dentro de la ventana); no existe «Novedad relacionada»; notas
  visibles al cambiar proyecto/tarea; axe con el listado abierto (estructura ARIA válida).
- **Capturas** (claro y oscuro) en 1440, 1024, 390 y 320: reposo, listado abierto con grupos y opción activa
  (barra visible), sin resultados, vacío, error (con valor `readOnly`), «Cerrado» y «No disponible» conservados, fila
  del jefe, teclado virtual en 390×664, `forced-colors: active`.

## 7. Qué NO hacer

- No usar `Popover`, `cmdk` ni portal para el listado.
- No usar `Select` de Radix para Proyecto o Tarea.
- No colorear con valores crudos ni usar `text-primary` para texto (las palabras clave del sistema de `forced-colors`
  no son colores crudos).
- No ocultar el grupo de la tarea cuando solo hay uno.
- No cerrar el diálogo con `Escape` mientras el listado está abierto.
- No dejar el campo vacío cuando el valor guardado ya no es elegible.
- No mostrar opciones deshabilitadas.
- No poner dentro del `listbox` nada que no sea `li presentation` u `li option` (encabezados fuera del group, estado y pie fuera
  del listbox).
- No abrir el listado por foco ni elegir en `mousedown`.
- No reinyectar «valor actual» en cada cambio de filtro: solo el persistido y una sola vez.
- No depender de `dvh` para el teclado virtual en iOS.

---

## 8. Pendientes para la implementación

Lo que esta especificación no puede cerrar sola:

| # | Pendiente | Quién / cuándo |
| --- | --- | --- |
| P1 | **Contrato de opciones (E13).** `findings.md` §4.2 no se pudo abrir en esta revisión y no se encontró en el árbol. Confirmar contra él (o corregirlo) el significado de `date` y de `scope`, que `tasks` con `scope=mine` solo devuelve `isMine = true`, y los nombres definitivos de `q`, `projectsTruncated` y `tasksTruncated`. Si difieren, se ajusta E13 y el contrato, no el comportamiento de la UI. | Implementación de API, antes de generar el contrato. |
| P2 | **Ventana de gracia de cierre.** La duración y la regla exacta (`closedAt` frente a `date`) son de la API; la UI solo pinta «Cerrado» y la fecha. Confirmar que el valor usado para elegibilidad coincide con el de E7. | API. |
| P3 | **Mediciones de contraste** de la tabla de §2.5 (pares 3 a 12) en claro y oscuro, resultados anotados en el PR, y decisión final sobre el repliegue del chip a `bg-card` en fila activa y sobre `bg-muted/50`. | Implementación web, antes de fusionar. |
| P4 | **Velocidad de la búsqueda en servidor.** Confirmar con datos reales que 250 ms de antirrebote y la cancelación (`AbortController`) se sienten bien; si `q` en servidor es lento, subir el antirrebote solo para el servidor sin tocar el filtro de cliente. | Implementación + prueba manual. |
| P5 | **Teclado virtual.** La emulación valida el cálculo de `--sel-max`, pero el comportamiento real de `visualViewport` en iOS Safari y Android Chrome solo se confirma en dispositivo. Si falla, alternativa: abrir el listado como lista a pantalla completa solo por debajo de `sm`. | Prueba manual en dispositivo. |
| P6 | **Lector de pantalla.** Probar con NVDA/VoiceOver los anuncios de la región viva (conteo, notas de cambio) y la estructura `listbox > presentation > group > option`. | Revisión de accesibilidad manual. |
| P7 | **`SegmentedRadio` con `className`.** Verificar que ningún otro uso cambia de aspecto y que `tailwind-merge` resuelve `inline-flex` frente a `flex`. | Implementación web. |
| P8 | **Reglas de paridad del MCP.** `projectRequestState` obligatorio y los campos nuevos de opciones deben reflejarse en el catálogo del MCP y en la prueba de cobertura contra el contrato; revisar si algún test de contrato fija el DTO anterior. | MCP, mismo PR. |
| P9 | **Hallazgo LOW 21 (zoom y alto contraste)** quedó recogido en §4 y §6; falta ejecutar las capturas a 320 px y con `forced-colors`. | Implementación web. |
