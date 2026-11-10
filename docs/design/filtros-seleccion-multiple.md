# Filtros de selección múltiple (Solicitudes y Portafolio): especificación UX/UI

Especificación visual y de interacción (rol Diseñador) para pasar los filtros de **Solicitudes**
(`/demanda/solicitudes`) y **Portafolio** (`/seguimiento/portafolio`) de «un valor + Todos» a **selección
múltiple**. Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md`, `55-sincronia-api-mcp-docs.md` y los
documentos hermanos `docs/design/mi-trabajo-miembros.md` y `docs/design/workspace-apps-gibo.md`. Solo tokens
semánticos (prohibido color crudo y `z-[n]`), foco con `--ring`, español con tildes. **No se añaden
dependencias** y **no se toca API, contrato OpenAPI, MCP, esquema ni permisos** (ver la decisión D1).

Los contrastes de la sección 9 están **medidos**, no estimados: un script temporal (fuera del repo, ya borrado)
leyó los OKLCH de `:root` y `.dark` en `apps/web/src/app/globals.css`, los convirtió a sRGB (OKLab → sRGB lineal →
gamma, recorte al gamut), compuso los colores translúcidos sobre su fondo real y aplicó la fórmula de luminancia
relativa de WCAG 2.2.

---

## 0. Resumen ejecutivo y decisiones

Hoy cada filtro es un `Select` de Radix de un solo valor con una opción «Todos» (Solicitudes: Estado, Proceso,
Prioridad; Portafolio: Proceso, Estado operativo, Banda de prioridad). El cambio introduce **un único componente
reutilizable**, `MultiSelectFilter`, construido sobre el `DropdownMenu` de Radix que ya está en `ui/` (trae
`CheckboxItem`, teclado, typeahead, Esc y devolución de foco). No existe `Popover` en `ui/` y añadirlo exigiría una
dependencia nueva, igual que descartó `workspace-apps-gibo.md` (§1 #3).

### 0.1 Decisiones de los puntos abiertos

| # | Punto abierto | Decisión | Por qué |
| --- | --- | --- | --- |
| D1 | **Dónde filtra Portafolio** | **En cliente.** Portafolio pide `GET /portfolio` **sin** filtros y filtra Proceso, Estado y Banda en el navegador, igual que Solicitudes. Las tres consultas dejan de viajar al servidor. La API y el MCP **no cambian** (siguen aceptando un valor; el MCP los sigue usando). | `GET /portfolio` ya devuelve todo el alcance (la tabla pagina y ordena en cliente). Aceptar listas en la API (`mainProcessId=a,b`) obliga a tocar DTO, contrato, cliente, MCP y docs (regla 55) para un listado que ya está completo en el navegador. Efectos visibles: el cambio de filtro es **instantáneo** (sin pantalla de carga), y el contador pasa a ser «12 de 45 iniciativas» con **45 = todo el alcance** (hoy 45 = lo que devolvía el servidor con sus filtros), lo mismo que Solicitudes. Alternativa descartada: ver D8. |
| D2 | **Semántica** | **O dentro de un filtro, Y entre filtros** (y con la búsqueda). Sin selección = sin restricción. | Es lo que espera quien marca «Backlog priorizado» y «Comprometida»: ver ambas. |
| D3 | **Texto resumen del disparador** | Regla exacta en la sección 1.2: 0 → «Todos»/«Todas»; 1 → su etiqueta; 2 o 3 → lista con comas **solo si cabe en 14 caracteres**; si no, «N seleccionados»/«N seleccionadas». | Determinista (no depende de medir píxeles) y calibrada para `w-44` (128 px útiles ≈ 17 caracteres de Inter 14 px; 14 deja margen y sirve también a `w-40`). |
| D4 | **Conteos por opción** | **No hay conteos** en ninguna vista. | En Solicitudes los conteos «vivos» cambiarían al combinar filtros (¿cuántas si añado este?) y exigirían calcularlos por filtro con los demás aplicados; en Portafolio el alcance lo manda el servidor. Un conteo que a veces existe y a veces no es peor que ninguno. El contador global (`ResultCount`) ya informa el efecto. |
| D5 | **Tope de elementos por filtro** (UI; la API de `GET /portfolio` admite listas con tope de **50 valores por filtro**, `MAX_FILTER_VALUES`, holgado frente a 15 estados, 5 bandas y decenas de procesos) | **Sin tope de selección.** El panel tiene altura máxima con scroll. No hay buscador interno hasta que un filtro supere **40 opciones** (hoy: Estado 16, Proceso ≈ decenas). | Un tope arbitrario (p. ej. 5) impide casos legítimos («todo menos Cerrada»). Si Proceso crece más allá de 40, se evalúa un campo de búsqueda dentro del panel (pendiente de backlog, no se diseña ahora). |
| D6 | **Botón «Limpiar» dentro del panel** | **No.** La opción **«Todos»** (primera fila) ya limpia ese filtro; «Limpiar filtros» de la barra limpia todos. | Dos formas de limpiar en el mismo panel serían redundantes y añadirían una fila de acciones que se mueve con el scroll. |
| D7 | **Sincronización con la URL** | **No** se escribe la selección en la URL. Se **conserva la lectura** de `?proceso=` al abrir Solicitudes: `?proceso=SIN_PROCESO` sigue funcionando tal cual y además se acepta una lista separada por comas (`?proceso=SIN_PROCESO,<uuid>`). Los tokens que no sean `SIN_PROCESO` ni un UUID se ignoran; los UUID que no existan entre los procesos cargados se descartan al llegar la lista. | Cumple el enlace del Panel sin convertir el filtro en estado de URL (que obligaría a decidir historial, `replace` vs `push` y compartir enlaces). |
| D8 | **Portafolio: clic a clic o con antirrebote** | **Cada clic se aplica tal cual**, con el panel abierto, **sin antirrebote** (consecuencia de D1: es filtrado en memoria). Si en el futuro se moviera el filtro al servidor, el criterio sería aplicar al **cerrar** el panel y no por clic. | Filtrar 45 o unos cientos de filas en memoria es inmediato, y ver la lista cambiar bajo el panel confirma el efecto. Con el servidor, un clic por opción dispararía una petición y una pantalla de carga por casilla. |
| D9 | **Agrupación visual de estados** | **Sí, en Estado (15 opciones)**, en cuatro grupos con encabezado (sección 2.3). Proceso lleva «Sin proceso aún» aparte y un encabezado «Procesos». Prioridad/Banda (5) no se agrupa. | 16 filas planas obligan a leer todas; el orden por fase es el del flujo (`REQUEST_STATE_LABELS`). Los encabezados son solo presentación: el valor sigue siendo el estado. |
| D10 | **Todo seleccionado ≠ «Todos»** | Si el usuario marca **todas** las opciones una a una, la selección se queda como está (no se convierte sola en «Todos»). El resumen dice «N seleccionados». | No son equivalentes: en Proceso, marcar todos los procesos listados **excluye** las solicitudes «Sin proceso aún» y las de procesos fuera del listado. Convertir la selección en silencio desmarcaría casillas bajo el cursor. |
| D11 | **Orden del valor** | `onChange` entrega los valores **en el orden de `options`**, sin duplicados, no en el orden de clic. | El resumen y las pruebas son estables; el resultado no depende de la historia de clics. |
| D12 | **Altura del disparador en táctil** | **Idéntica a `SelectTrigger`**: `h-9`, y `pointer-coarse:h-10` (40 px). Las **opciones del panel** sí llegan a **44 px** en táctil. | El disparador debe convivir sin saltos con la búsqueda (`Input`) y el resto de la barra, ambos de 40 px en táctil; subir solo los filtros desalinearía la fila. Ocupa todo el ancho en móvil, así que su lado corto (40 px) supera el mínimo AA de 24 px de WCAG 2.5.8. Las opciones son donde el dedo acierta o falla, y ahí se cumple 44 px. |

### 0.2 Supuestos

- El panel se abre bajo el disparador y se cierra con Esc, clic fuera o al enfocar fuera: es el comportamiento de
  Radix `DropdownMenu` con `modal` por omisión (`true`), que además deja inertes los demás controles mientras está
  abierto (no se pueden tocar otros filtros con el panel abierto).
- `REQUEST_STATE_LABELS` (15 estados) y la lista de procesos de `listProcesses()` siguen siendo la fuente de las opciones.
- «Prioridad» (Solicitudes) y «Banda de prioridad» (Portafolio) conservan etiquetas de texto (`P1`, `Sin priorizar`)
  como hoy dentro del filtro; los badges de prioridad se mantienen en las filas de la tabla.

---

## 1. Anatomía del control

```
Etiqueta (visible, <Label htmlFor>)
┌───────────────────────────────┐   h-9 (40 px en táctil) · w-full sm:w-44 · rounded-md
│ Backlog priorizado          ▾ │   borde border-input · fondo bg-background · texto text-sm
└───────────────────────────────┘
```

Contenedor: `div.grid.w-full.gap-1.5.sm:w-auto` con `Label` encima, **idéntico** al de los filtros actuales; así
`Toolbar` (con `collapseOnMobile`) lo trata como un solo hijo y la alineación con `SearchInput` no cambia.

### 1.1 Disparador (`button`)

Mismas clases que `SelectTrigger`, para que sean visualmente indistinguibles en reposo, foco y deshabilitado:

`flex h-9 w-full min-w-0 items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input
bg-background px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-0
focus-visible:outline-ring focus-visible:border-ring pointer-coarse:h-10 [&>span]:line-clamp-1`

Diferencias deliberadas (todas con tokens existentes):

| Estado | Aspecto |
| --- | --- |
| Sin selección | Texto `text-muted-foreground` («Todos» / «Todas»): se lee como «filtro sin aplicar». |
| Con selección | Texto `text-foreground font-medium`: se lee como «filtro aplicado». El énfasis es de **peso y color de texto**, nunca solo de color. |
| Panel abierto (`data-[state=open]`) | `border-ring`, para ligar el disparador con su panel. |
| Foco de teclado | Igual que `SelectTrigger`: contorno de 2 px `outline-ring`, `outline-offset-0`, `border-ring`. |
| Deshabilitado | `disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground` (no se usa hoy). |

Icono: `ChevronDown` de lucide (`size-4 shrink-0 text-muted-foreground`, `aria-hidden`), el mismo de `SelectTrigger`;
no rota. No se pinta fondo `primary-subtle` ni borde azul para el estado «aplicado»: falla contraste en oscuro
(sección 9.3).

### 1.2 Texto resumen (regla exacta, D3)

Entrada: `selected` (valores) y `options`. Se calcula sobre las **opciones presentes**: los valores de `selected`
que no estén en `options` no cuentan. Las etiquetas salen **en el orden de `options`**.

```
n = cantidad de opciones seleccionadas presentes
n = 0                                   → placeholder   («Todos» / «Todas»)
n = 1                                   → su etiqueta (si no cabe, se recorta con puntos suspensivos, 1 línea)
n = 2 o 3, y etiquetas.join(', ') ≤ 14  → etiquetas.join(', ')
en cualquier otro caso                  → `${n} seleccionados` (m.) | `${n} seleccionadas` (f.)
```

«≤ 14» cuenta caracteres de la cadena unida con «, » (coma y espacio incluidos). Ejemplos:

| Filtro | Selección | Resumen |
| --- | --- | --- |
| Estado | ninguna | Todos |
| Estado | Bloqueada | Bloqueada |
| Estado | Backlog priorizado | Backlog priorizado (recortado con «…» a 176 px) |
| Estado | En triage, Devuelta | 2 seleccionados (19 caracteres > 14) |
| Estado | Cerrada, Retirada | 2 seleccionados (17 > 14) |
| Prioridad | P1, P2 | P1, P2 |
| Prioridad | P1, P2, P3 | P1, P2, P3 (10) |
| Prioridad | P1, Sin priorizar | 2 seleccionadas (17 > 14) |
| Prioridad | P1, P2, P3, P4 | 4 seleccionadas (n > 3) |
| Proceso | Sin proceso aún, Ventas | 2 seleccionados |

El género lo da la propiedad `gender` (`'m'` por omisión; `'f'` en Prioridad/Banda). El resumen **no** lleva el
nombre del filtro (la etiqueta ya está encima).

---

## 2. Panel de opciones

Contenido de `DropdownMenuContent`, `align="start"`, `sideOffset={4}`, `collisionPadding={8}`, sobre `bg-popover
text-popover-foreground`, borde y `shadow-md` (los de `DropdownMenuContent`).

```
┌──────────────────────────────┐
│ ☑ Todos                      │  ← fila «Todos»: marcada cuando no hay selección
├──────────────────────────────┤  ← DropdownMenuSeparator
│ ENTRADA                      │  ← encabezado de grupo (DropdownMenuLabel)
│ ☐ Registrada                 │
│ ☑ En triage                  │  ← seleccionada: casilla rellena + texto font-medium
│ ☐ Devuelta                   │
│ ☐ Rechazada                  │
│ PRIORIZACIÓN Y PLAN          │
│ …                            │  ← scroll cuando no cabe
└──────────────────────────────┘
```

### 2.1 Medidas

| Propiedad | Escritorio | Táctil (`pointer-coarse`) |
| --- | --- | --- |
| Ancho | `min-w-56` (224 px) y nunca menos que el disparador (`min-w-[var(--radix-dropdown-menu-trigger-width)]`); `max-w-72` (288 px, el máximo de `DropdownMenuContent`) | igual, con `max-w-[calc(100vw-1rem)]` (304 px a 320 px de viewport; como 288 < 304, el tope efectivo sigue siendo 288 px) |
| Alto máximo | `max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))]` con `overflow-y-auto` | igual |
| Fila (opción) | `min-h-8` (32 px), `px-2 py-1.5`, `gap-2.5` | `pointer-coarse:min-h-11` (44 px) |
| Encabezado de grupo | `px-2 py-1.5 text-xs font-medium text-muted-foreground` (el de `DropdownMenuLabel`) | igual |

El texto de la opción admite **hasta 2 líneas** (`line-clamp-2`, `whitespace-normal`), como `SelectItem`: los nombres de
proceso largos no se cortan en una línea. La altura de la fila crece; no se fija.

### 2.2 Casilla de cada opción

Un cuadro de 16 px (`size-4 rounded-[4px]`, el mismo radio de `ui/checkbox.tsx`) a la izquierda, `shrink-0`:

| Estado de la opción | Casilla | Texto |
| --- | --- | --- |
| Sin marcar | Vacía, `border border-input` | `font-normal` |
| Marcada | `bg-primary` con icono `Check` de lucide (`size-3.5`, `text-primary-foreground`, `aria-hidden`) **y el borde `border-input` se conserva** | `font-medium` |
| Hover o foco (la fila) | Fondo de la fila `bg-accent`, texto `text-accent-foreground` (el `focus:bg-accent` de `DropdownMenuItem`); la casilla no cambia | sin cambio |

La casilla marcada conserva el borde `border-input` porque `primary` sobre `accent` en oscuro da **2.88:1** (< 3:1,
sección 9.3): el contorno `input` (3.26:1 sobre `accent` en oscuro) garantiza el límite del componente y la marca
blanca sobre `primary` (4.84:1) transmite el estado. El estado nunca depende solo del color: casilla rellena,
**marca** y peso de la fuente cambian a la vez.

### 2.3 Opción «Todos» / «Todas», divisores y grupos

- **«Todos»/«Todas» va siempre primera** (texto = `placeholder`). Está **marcada** cuando `selected` está vacío. Pulsarla
  **limpia** el filtro. Si ya está marcada, pulsarla no hace nada (queda marcada; no se deshabilita para no sacarla del
  recorrido de teclado). Marcar cualquier otra opción la desmarca; desmarcar la última otra vuelve a marcarla.
- Debajo de ella, un `DropdownMenuSeparator`.
- **Grupos**: `options[].group` opcional. Cuando cambia el grupo se pinta un separador y, si el grupo tiene nombre, un
  `DropdownMenuLabel` con ese nombre. Cada grupo es un `DropdownMenuGroup` con `role="group"` y `aria-labelledby` al
  id de su encabezado (Radix no lo enlaza solo).
- **Estado** (D9), orden del flujo:

  | Grupo | Opciones |
  | --- | --- |
  | Entrada | Registrada, En triage, Devuelta, Rechazada |
  | Priorización y plan | Backlog priorizado, Comprometida, En planificación |
  | Ejecución | En ejecución, Bloqueada, En validación |
  | Entrega y cierre | Lista para liberar, En estabilización, Operativa, Cerrada, Retirada |

- **Proceso** (ambas vistas): `Todos` · separador · `Sin proceso aún` (sin grupo; es un estado, no un proceso) ·
  separador · encabezado `Procesos` · los procesos por nombre. «Sin proceso aún» es una opción más: se combina con
  procesos reales con **O** (sección 6.3).
- **Prioridad / Banda**: `Todas` · separador · `P1`, `P2`, `P3`, `P4` · `Sin priorizar` (todo en un solo bloque).

### 2.4 Estados del panel

- **Cargando opciones** (solo Proceso, mientras llega `listProcesses()`): el panel ya ofrece «Todos» y «Sin proceso aún»;
  los procesos aparecen al llegar. No hay spinner.
- **Sin opciones de proceso** (la carga falló o el alcance no tiene procesos): el encabezado «Procesos» no se pinta; el
  resto funciona. El error ya se degrada a lista vacía en las vistas actuales y no se muestra un aviso nuevo.
- **Sin resultados** al combinar filtros: lo gestiona `DataView` (`no-results`), sin cambios.

---

## 3. Comportamiento

| Acción | Resultado |
| --- | --- |
| Clic o toque en el disparador | Abre el panel; el foco pasa al panel. |
| Clic o toque en una opción | Alterna la casilla. **El panel no se cierra** (ver 3.1). |
| `Esc` | Cierra el panel y **devuelve el foco al disparador**. |
| Clic fuera del panel | Cierra el panel; la selección se conserva. |
| `↓` / `↑` en el disparador (cerrado) | Abre el panel y enfoca la primera opción. |
| `↓` / `↑` en el panel | Mueven el foco entre opciones (cíclico); saltan los encabezados y separadores. |
| `Inicio` / `Fin` | Primera («Todos») / última opción. |
| `Espacio` / `Enter` | Alternan la opción enfocada (el panel sigue abierto). |
| Escribir letras (typeahead de Radix) | Enfoca la siguiente opción cuyo texto empieza por lo escrito (se usa `textValue = etiqueta`). No alterna: solo enfoca. |
| `Tab` | **Decisión:** dentro del panel `Tab` no mueve el foco entre opciones (Radix lo neutraliza en `role="menu"`); el foco se queda en la opción actual y el panel sigue abierto. Para salir: `Esc` (foco al disparador) y luego `Tab`. La prueba de §11 comprueba que, tras `Tab`, el foco sigue dentro del panel; si la versión de Radix instalada cerrara el menú, el criterio válido es que el foco vuelva al disparador y nunca se pierda en `body`. |

### 3.1 Alternar sin cerrar

Cada `DropdownMenuCheckboxItem` recibe `onSelect={(event) => event.preventDefault()}` (evita el cierre automático de
Radix) y `onCheckedChange` para alternar. La opción «Todos» hace igual, pero su acción es `onChange([])`.

### 3.2 Cálculo de la selección al alternar

1. Alternar una opción `v`: si estaba en `selected`, se quita; si no, se añade.
2. El resultado se reordena según `options`, sin duplicados (D11), y se entrega con `onChange`.
3. «Todos»: `onChange([])`.
4. Alternar nunca produce un valor que no esté en `options`.

---

## 4. Lectores de pantalla y teclado

- **Roles.** El panel es `role="menu"`; cada opción, `role="menuitemcheckbox"` con `aria-checked="true|false"`
  (Radix `CheckboxItem` lo aporta). Los grupos llevan `role="group"` y `aria-labelledby`. «Todos» también es
  `menuitemcheckbox`.
- **Nombre accesible del disparador (incluye la selección).** El `button` lleva
  `aria-labelledby="{id}-etiqueta {id}-valor"`, donde `{id}-etiqueta` es el `Label` visible y `{id}-valor` es el
  `span` del resumen. Se anuncia, por ejemplo, «Estado Backlog priorizado, Comprometida, botón de menú, contraído».
  `aria-haspopup="menu"` y `aria-expanded` los pone Radix. El `Label` conserva `htmlFor={id}` (clic en la etiqueta
  enfoca el disparador). **Sin `aria-labelledby`** el nombre sería solo «Estado» (un `<label for>` anula el contenido del
  botón) y la selección quedaría oculta.
- **Resumen recortado.** Aunque el texto visible se recorte con puntos suspensivos, el `span` contiene la etiqueta
  completa: el nombre accesible no pierde información.
- **Cambio de cantidad.** Dentro del panel hay un `<div role="status" class="sr-only">` (región viva, `aria-live="polite"`)
  que se actualiza en cada alternancia con: «{Etiqueta}: {resumen largo}» — «Estado: ninguna selección, se muestran
  todos» / «Estado: 1 seleccionado» / «Estado: 3 seleccionados». Va **dentro** del panel porque, con `modal`, Radix
  oculta (`aria-hidden`) todo lo de fuera mientras está abierto, y una región externa no se anunciaría. Cada opción
  también anuncia su propio estado al enfocarse («marcado» / «no marcado»).
- **Tras cerrar.** El foco vuelve al disparador, cuyo nombre ya incluye la selección nueva. El contador
  `ResultCount` (`role="status"`) sigue siendo la fuente del efecto en la lista («12 de 45 solicitudes»); no se añade
  otro anuncio.
- **Foco visible siempre**, con `--ring` (sección 9). Objetivos y espaciado en la sección 7.
- **Movimiento reducido.** La animación de entrada del panel ya respeta `motion-reduce:animate-none`
  (`DropdownMenuContent`); no se añade otra.

---

## 5. Convivencia con la barra (`Toolbar`)

- Los tres filtros se colocan en el mismo orden que hoy tras la búsqueda: Solicitudes → Estado, Proceso, Prioridad;
  Portafolio → Proceso, Estado operativo, Banda de prioridad.
- Anchos (propiedad `className`): como hoy, `w-full sm:w-44` (Estado, Proceso) y `w-full sm:w-40` (Prioridad/Banda). El
  disparador tiene la **misma altura que la búsqueda** (`h-9`, 40 px en táctil), así que la fila no salta.
- El panel puede ser **más ancho** que el disparador (`min-w-56`): no ensancha la barra.
- `Toolbar` con `collapseOnMobile` no cambia: en menos de `sm` (640 px) solo la búsqueda y el botón «Filtros» están a la
  vista; al abrir «Filtros» cada disparador ocupa una fila.

---

## 6. Semántica de filtros y barra de resultados

### 6.1 Reglas

- **Dentro de un filtro: O.** Estado = {En triage, Devuelta} muestra las solicitudes que están en cualquiera de las dos.
- **Entre filtros: Y.** Estado ∩ Proceso ∩ Prioridad ∩ búsqueda por título.
- Selección vacía = ese filtro no restringe.

### 6.2 «Limpiar filtros» y contador con varios filtros

- Sin cambios de ubicación ni de texto: ambos van en el `end` del `Toolbar`, `ml-auto`, `min-h-9`. `ResultCount` (texto
  `text-meta tabular-nums text-muted-foreground`) a la izquierda, `Limpiar filtros` (`Button variant="ghost"
  size="sm"`) a su derecha.
- «Limpiar filtros» aparece cuando **cualquier** filtro tiene al menos una opción o hay texto de búsqueda. Pulsarlo
  vacía **todas** las selecciones y la búsqueda y mueve el foco a la búsqueda (comportamiento actual, NIT 4 / D9).
- `ResultCount` es la región viva de la lista: «45 solicitudes» sin filtros; «12 de 45 solicitudes» con cualquier
  combinación, sin importar cuántos filtros ni cuántas opciones haya. **No** se añaden chips de filtros activos bajo la
  barra: el resumen de cada disparador ya los muestra y los chips moverían el contenido.
- Si la combinación no deja resultados, `DataView` muestra su estado `no-results` (sin cambios).

### 6.3 «Sin proceso aún» combinado con procesos reales

`Sin proceso aún` + `Ventas` + `Finanzas` ⇒ se muestran las solicitudes con `mainProcessId === null` **o** con proceso
Ventas **o** Finanzas (OR). Regla de código a documentar en la vista:
`r.mainProcessId === null ? seleccionado.includes('SIN_PROCESO') : seleccionado.includes(r.mainProcessId)`. El
resumen con dos opciones es «2 seleccionados» (D3). En Portafolio se aplica la misma regla en cliente (el campo es
`mainProcessId`/`mainProcessName` del elemento, `null` si aún no hay proceso).

### 6.4 Portafolio en cliente (D1)

- La petición `GET /portfolio` va **sin parámetros**; se elimina la recarga con pantalla de carga al cambiar un filtro.
- Estado: `operationalState ∈ seleccionados`. Banda: `(priorityBand ?? 'SIN_PRIORIZAR') ∈ seleccionados`.
- `viewState`: `empty` solo cuando el alcance completo está vacío; con filtros activos y 0 resultados, `no-results`.
- Para el usuario, la diferencia es que el contador total deja de depender de los filtros (D1).

---

## 7. Móvil (< 768 px)

- **Disparador**: ancho completo (`w-full`), 40 px de alto (D12), una fila por filtro dentro del bloque que abre el
  botón «Filtros» de `Toolbar`.
- **Opciones del panel**: `pointer-coarse:min-h-11` (**44 px**) y área de toque a todo el ancho de la fila (no solo la
  casilla ni el texto).
- **Cabe en 320 px**: `max-w-[calc(100vw-1rem)]` ⇒ 304 px como máximo; `collisionPadding={8}` mantiene 8 px de aire a cada lado y
  `align="start"` pega el panel al borde del disparador. Con el ancho máximo de `DropdownMenuContent` (288 px)
  el panel nunca desborda a 320 px.
- **Altura**: `max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))]`: si no hay 24 rem libres, el panel
  se reduce y hace scroll interno; `modal` bloquea el scroll de la página mientras está abierto.
- **Teclado en pantalla**: no se muestra (no hay campo de texto en el panel).
- El panel se alinea hacia abajo o arriba según el espacio (colisión de Radix); no hay hoja inferior propia.
- El botón «Filtros» de `Toolbar` no muestra cuántos filtros hay activos (limitación existente, **fuera del alcance**; se
  propone como pendiente de backlog: `activeCount` opcional en `Toolbar`).

---

## 8. Componente reutilizable (API)

Archivo previsto: `apps/web/src/components/multi-select-filter.tsx` (+ `DropdownMenuCheckboxItem` en `ui/dropdown-menu.tsx`).
Función pura de resumen y de alternancia en `apps/web/src/lib/multi-filter.ts` (módulo puro, sin React, para que
`e2e/web-lib.spec.ts` lo cargue en Node, como `request-state.ts`).

```ts
export interface MultiSelectOption {
  value: string;
  label: string;
  /** Nombre del grupo; un cambio de grupo pinta separador y encabezado. */
  group?: string;
}

export interface MultiSelectFilterProps {
  /** Id del disparador; el Label usa htmlFor={id}. */
  id: string;
  /** Etiqueta visible encima del disparador. */
  label: string;
  options: MultiSelectOption[];
  /** Valores seleccionados; vacío = sin restricción. */
  selected: string[];
  /** Recibe la selección completa, en el orden de `options`, sin duplicados. */
  onChange: (next: string[]) => void;
  /** Texto con la selección vacía: «Todos» (por omisión) o «Todas». */
  placeholder?: string;
  /** Género del «N seleccionados/seleccionadas». Por omisión 'm'. */
  gender?: 'm' | 'f';
  /** Ancho del disparador, p. ej. 'sm:w-44' (el resto es w-full). */
  className?: string;
}
```

Funciones puras (`lib/multi-filter.ts`):

- `summarizeSelection(options, selected, placeholder, gender): string` — regla exacta de 1.2.
- `toggleValue(options, selected, value): string[]` — 3.2.

Uso en las vistas, p. ej. Solicitudes:

```tsx
<MultiSelectFilter id="sol-filtro-estado" label="Estado" options={stateOptions}
  selected={stateFilter} onChange={setStateFilter} className="sm:w-44" />
<MultiSelectFilter id="sol-filtro-banda" label="Prioridad" options={bandOptions}
  selected={bandFilter} onChange={setBandFilter} placeholder="Todas" gender="f" className="sm:w-40" />
```

Reglas de implementación que se desprenden de la spec:

- Los valores de las vistas pasan de `string` (`ALL`, `ANY`) a `string[]` (vacío = todos): se eliminan los centinelas
  `ALL`/`ANY`; `SIN_PROCESO` y `SIN_PRIORIZAR` siguen siendo valores de opción.
- `resetKey` de `useClientTable` pasa a `JSON.stringify` de los arrays.
- No se usa `any`; no se añaden dependencias; solo tokens semánticos.

---

## 9. Contrastes medidos (WCAG 2.2 AA)

Método: texto 4.5:1, componentes (bordes de control, foco, relleno de casilla) 3:1. «Fondo» = el fondo real del
elemento (`--background` para el disparador y los textos de la barra, `--popover` en el panel, `--accent` en la fila con
foco/hover). Los colores translúcidos se compusieron sobre su fondo. HEX redondeados al byte; las razones se calculan
con los valores sin redondear de sRGB.

### 9.1 Tema claro («Lienzo Claro»)

| # | Elemento (par de tokens) | Primer plano | Fondo | Razón | Mínimo | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Texto del disparador con selección (`foreground` / `background`) | #0F2557 | #EBF0F7 | **12.86** | 4.5 | OK |
| T2 | «Todos» y etiquetas de ayuda (`muted-foreground` / `background`) | #4C586F | #EBF0F7 | **6.22** | 4.5 | OK |
| T3 | Opción en reposo (`popover-foreground` / `popover`) | #0F2557 | #FFFFFF | **14.75** | 4.5 | OK |
| T4 | Encabezado de grupo (`muted-foreground` / `popover`) | #4C586F | #FFFFFF | **7.13** | 4.5 | OK |
| T5 | Opción con foco o hover (`accent-foreground` / `accent`) | #0F2557 | #E0E7F0 | **11.83** | 4.5 | OK |
| T8 | Contador de resultados (`muted-foreground` / `background`) | #4C586F | #EBF0F7 | **6.22** | 4.5 | OK |
| T9 | «Limpiar filtros» (`foreground` / `background`) | #0F2557 | #EBF0F7 | **12.86** | 4.5 | OK |
| C1 | Borde del disparador (`input` / `background`) | #768193 | #EBF0F7 | **3.44** | 3 | OK |
| C2 | Borde de la casilla en reposo (`input` / `popover`) | #768193 | #FFFFFF | **3.95** | 3 | OK |
| C3 | Casilla marcada, relleno (`primary` / `popover`) | #176BEB | #FFFFFF | **4.84** | 3 | OK |
| C4 | Foco del disparador (`ring` / `background`) | #176BEB | #EBF0F7 | **4.22** | 3 | OK |
| C5 | Borde de la casilla sobre fila con foco (`input` / `accent`) | #768193 | #E0E7F0 | **3.16** | 3 | OK |
| C6 | Casilla marcada sobre fila con foco (`primary` / `accent`) | #176BEB | #E0E7F0 | **3.88** | 3 | OK |
| C7 | Borde del disparador con panel abierto (`ring` / `background`) | #176BEB | #EBF0F7 | **4.22** | 3 | OK |
| M1 | Marca `Check` sobre casilla marcada (`primary-foreground` / `primary`) | #FFFFFF | #176BEB | **4.84** | 3 | OK |

### 9.2 Tema oscuro («Dark Tech»)

| # | Elemento (par de tokens) | Primer plano | Fondo | Razón | Mínimo | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Texto del disparador con selección (`foreground` / `background`) | #F3F5F8 | #08152E | **16.66** | 4.5 | OK |
| T2 | «Todos» y etiquetas de ayuda (`muted-foreground` / `background`) | #A5B2C4 | #08152E | **8.47** | 4.5 | OK |
| T3 | Opción en reposo (`popover-foreground` / `popover`) | #F3F5F8 | #122347 | **14.13** | 4.5 | OK |
| T4 | Encabezado de grupo (`muted-foreground` / `popover`) | #A5B2C4 | #122347 | **7.19** | 4.5 | OK |
| T5 | Opción con foco o hover (`accent-foreground` / `accent`) | #F3F5F8 | #1B2B4D | **12.80** | 4.5 | OK |
| T8 | Contador de resultados (`muted-foreground` / `background`) | #A5B2C4 | #08152E | **8.47** | 4.5 | OK |
| T9 | «Limpiar filtros» (`foreground` / `background`) | #F3F5F8 | #08152E | **16.66** | 4.5 | OK |
| C1 | Borde del disparador (`input` / `background`) | #667B9E | #08152E | **4.24** | 3 | OK |
| C2 | Borde de la casilla en reposo (`input` / `popover`) | #667B9E | #122347 | **3.59** | 3 | OK |
| C3 | Casilla marcada, relleno (`primary` / `popover`) | #176BEB | #122347 | **3.18** | 3 | OK |
| C4 | Foco del disparador (`ring` / `background`) | #176BEB | #08152E | **3.75** | 3 | OK |
| C5 | Borde de la casilla sobre fila con foco (`input` / `accent`) | #667B9E | #1B2B4D | **3.26** | 3 | OK |
| C7 | Borde del disparador con panel abierto (`ring` / `background`) | #176BEB | #08152E | **3.75** | 3 | OK |
| M1 | Marca `Check` sobre casilla marcada (`primary-foreground` / `primary`) | #FFFFFF | #176BEB | **4.84** | 3 | OK |

### 9.3 Combinaciones medidas y descartadas

Estas combinaciones **no se adoptan** porque no cumplen 3:1 en oscuro. La spec evita ese par:

| Combinación (tema oscuro) | Razón | Qué se hace en su lugar |
| --- | --- | --- |
| Relleno `primary` de la casilla sobre fila con foco (`primary` / `accent`: #176BEB / #1B2B4D) | **2.88** (< 3) | La casilla marcada conserva el borde `border-input` (C5 = 3.26) y la marca blanca (M1 = 4.84). El estado lo da la marca, el límite lo da el borde. |
| Borde `primary` sobre disparador con fondo `primary-subtle` para «filtro aplicado» (#176BEB / #152E5D) | **2.75** (< 3) | No se usa fondo `primary-subtle` en el disparador; «aplicado» = texto `foreground` `font-medium` (T1 = 16.66) frente a `muted-foreground` en «Todos». |

En claro esas mismas combinaciones sí pasan (`primary` / `accent` = 3.88; `primary` / `primary-subtle` = 3.93), pero
la regla debe valer para los dos temas; por eso se descartan en ambos.

Informativo (no exigido): el borde propio del panel (`border`, compuesto sobre `popover`) da 1.09:1 en claro y 2.44:1 en
oscuro. No es el límite de un control (el panel se separa por sombra y fondo, como el resto de menús).

---

## 10. Estados de aceptación (visual)

Para cada filtro y tema (claro/oscuro) el implementador debe poder mostrar:

1. Reposo sin selección («Todos»/«Todas» en `muted-foreground`).
2. Con una selección (etiqueta en `foreground` `font-medium`).
3. Con dos y con cuatro selecciones (lista con comas y «N seleccionados»).
4. Disparador enfocado por teclado (contorno de 2 px) y con el panel abierto (`border-ring`).
5. Panel: fila en reposo, con hover/foco, marcada, marcada con foco; encabezado de grupo; scroll cuando hay más filas
   (Estado en escritorio de 1440×900 y en 320×568).
6. Móvil (390×844 y 320×568): barra plegada, «Filtros» abierto, panel con filas de 44 px.

---

## 11. Pruebas previstas (para quien implemente)

- **Unitarias (Node, `lib/multi-filter.ts`)**: `summarizeSelection` con todos los ejemplos de la tabla de 1.2 (incluidos
  los límites 14/15 caracteres y n = 3/4, género f); `toggleValue` (orden de `options`, sin duplicados, ignora valores
  desconocidos).
- **Playwright**: abrir con clic y con `↓`; alternar con clic, `Espacio` y `Enter` sin que se cierre el panel; `Esc` devuelve el
  foco al disparador (`document.activeElement`); `Tab` dentro del panel no pierde el foco (se queda en el panel o vuelve al disparador, nunca en `body`); `Inicio`/`Fin`; typeahead; que
  «Todos» limpia y que marcar otra la desmarca; nombre accesible del disparador (`getByRole('button', { name: /Estado .*En triage/ })`);
  roles `menuitemcheckbox` y `aria-checked`; **O dentro y Y entre** filtros con datos de prueba; `?proceso=SIN_PROCESO` y
  `?proceso=SIN_PROCESO,<uuid>`; «Limpiar filtros» vacía todo y enfoca la búsqueda; a 320 px el panel no desborda
  (`boundingBox().x ≥ 0` y `x + width ≤ 320`) y las filas miden ≥ 44 px con `hasTouch`.
- Portafolio: con los filtros en cliente, comprobar que **no** se hace una petición nueva a `/portfolio` al alternar.

## 12. Fuera de alcance

- Cambios de API, contrato, MCP o permisos (D1).
- Escribir los filtros en la URL (D7), buscador dentro del panel (D5), conteos por opción (D4) y chips de filtros
  activos (6.2).
- Contador de filtros activos en el botón «Filtros» móvil de `Toolbar` (7).
- Otros `Select` del portal (formularios, paginación, Mi trabajo): siguen siendo de valor único.
