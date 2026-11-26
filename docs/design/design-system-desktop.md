# Design System de escritorio (Desktop First)

Especificación visual unificada para la optimización de la interfaz de GIBO en
resoluciones 1366×768, 1440×900, 1920×1080 y superiores. Es la referencia de los
PR A a D del trabajo `ux-desktop`. Parte de la auditoría
`.agents/tasks/ux-desktop/auditoria.md` (hallazgos H-01 a H-10) y no cambia la
marca (`.kiro/steering/25-marca-gibo.md`).

## 0. Alcance y reglas de partida

- Solo capa de presentación en `apps/web`. Sin dependencias nuevas, sin colores
  nuevos, sin cambios de API, permisos ni reglas de negocio.
- Se reutilizan los tokens de `globals.css` y los componentes existentes:
  `PageLayout`, `PageHeader`, `Section`, `StatStrip`/`StatTile`, `Toolbar`,
  `Table` (`ui/table`), `DataTablePagination`, `ResultCount`, `CellTitle`,
  `MasterDetail`/`SelectableList`, `Field`/`FieldSet`/`FormError`, `Dialog*`,
  `EmptyState`, `StatusBadge`, `PriorityBadge`, `IdChip`.
- Solo tokens semánticos. Texto azul con `text-link`. Sombra con `shadow-card`.
  Tablas y tarjetas con `rounded-xl`.
- Los valores de este documento son los del diseño. Las alturas de fila, pantalla
  y filas visibles de la sección 3.2 son **cálculos de diseño**; el PR debe
  medirlas sobre capturas y corregir si difieren.
- Mantener el modo claro («Lienzo Claro») y el oscuro («Dark Tech»). Todo lo que
  se especifica usa tokens que ya tienen valor en los dos temas.

### Resumen de decisiones

| Tema | Decisión |
| --- | --- |
| Cabecera de página | Una fila: título + acciones; descripción de una línea; trazo de marca de 2 px pegado al borde inferior. De unos 155 px a unos 56 px. |
| Espaciado vertical | `gap-4` entre bloques desde `lg` (hoy `gap-6`); `py-4` en el `main`. |
| Anchos | Tres anchos de contenido: `fluid` (1760 px), `form` (960 px) y `reading` (720 px). |
| Tablas | Tres densidades: compacta 32, estándar 40 (por defecto), dos líneas 52. Cabecera fija. Todas las listas largas paginan a 25. |
| Columnas | Prioridad P1/P2/P3 con consultas de contenedor (`@4xl`, `@[1200px]`), no con el ancho de ventana. |
| Filtros | `FilterBar` de una fila, con la etiqueta visible dentro del campo. Notas en un icono con tooltip. |
| KPI | `StatTile` compacto de 64 px, una sola fila en `xl`, valor 0 en tono atenuado. |
| Maestro-detalle | Lista 320 px (`xl`: 340, `2xl`: 380) + detalle, primera pendiente preseleccionada. |
| Formularios | Dos columnas en `lg`, secciones con navegación lateral interna en formularios largos, barra de acciones fija. |
| Diálogos | Cinco tamaños sin cambio de ancho; relleno más bajo; pie con filete; dos columnas en `lg`/`xl`. |
| Vacíos | Alto máximo 160 px en tablas, sin repetir la acción que ya está en la cabecera. |

## 1. Escala tipográfica

Fuentes sin cambio: Inter (interfaz) y Montserrat 700 (titulares h1 a h3).
Pesos permitidos: 400, 500, 600 y 700 (solo títulos).

| Rol | Clases | Tamaño / interlínea | Uso |
| --- | --- | --- | --- |
| Título de página (h1) | `text-xl font-bold tracking-tight` | 20 / 28 | Un solo h1 por vista. Sin cambio. |
| Título de sección (h2) | `text-base font-semibold` | 16 / 24 | `Section`, lista de `MasterDetail`. |
| Subsección (h3) | `text-sm font-semibold` | 14 / 20 | Bloques dentro de una tarjeta. |
| Cuerpo | `text-sm` | 14 / 20 | Celdas, campos, botones. |
| Meta / ayuda | `text-meta text-muted-foreground` | 13 / 18 | Descripción de página, ayudas, segunda línea de celda, contadores. |
| Cabecera de tabla | `text-xs font-medium text-muted-foreground` | 12 / 16 | Solo cabeceras de tabla y chips. |
| Valor de KPI | `text-xl font-semibold tabular-nums leading-6` | 20 / 24 | `StatTile` compacto (antes `text-2xl`). |
| Código visible | `IdChip` (`font-mono`) | según chip | Solo IDs (`PRY-`, `ACT-`, `DOC-`). |

Reglas:

- Cifras en columnas, contadores y KPI con `tabular-nums`.
- No bajar de 12 px. No usar `text-xs` para texto que el usuario deba leer
  de corrido.
- Un título largo no se trunca en el h1 (`wrap-break-word`); en celdas, sí
  (`truncate` o `line-clamp-1`), con el texto completo en `title`.

## 2. Espaciado y estructura

### 2.1 Escala (base de 4 px)

| Token | Valor | Uso |
| --- | --- | --- |
| `gap-1` / `gap-1.5` | 4 / 6 px | Etiqueta y control, icono y texto. |
| `gap-2` | 8 px | Entre controles de una barra, entre botones. |
| `gap-3` | 12 px | Título de sección y su contenido, entre campos de un formulario. |
| `gap-4` | 16 px | Entre bloques de página (desde `lg`). |
| `gap-6` | 24 px | Entre bloques de página en móvil y tablet (`< lg`). |
| `p-3` / `p-4` | 12 / 16 px | Relleno de tarjeta compacta / estándar. |

### 2.2 Marco de página

`main` (en `app-shell.tsx`):

```
flex-1 px-4 py-4 focus:outline-none md:px-6 xl:px-8
```

(hoy `py-5 md:py-6`; el cambio ahorra 8 px arriba a 1366.)

`PageLayout` (columna de bloques):

```
mx-auto flex w-full flex-col gap-6 lg:gap-4 <ancho>
```

### 2.3 Anchos de contenedor

`PageLayout` recibe una propiedad `width` (valor por defecto `fluid`).

| `width` | Clase | Cuándo |
| --- | --- | --- |
| `fluid` | `max-w-[1760px]` | Listas, tablas, paneles, maestro-detalle. Hoy es `max-w-[1600px]`. A 1920 el contenido pasa de 1600 a 1616 px (todo el ancho disponible); el tope solo actúa por encima de 2000 px. |
| `form` | `max-w-[960px]` | Formularios de una página (Configuración, IA, alta de solicitud). No se centra: queda a la izquierda del contenido (`mr-auto`) para alinear con el título. |
| `reading` | `max-w-[720px]` | Texto largo (ayuda, políticas, actas en lectura). |

### 2.4 Layout por breakpoint de escritorio

El menú lateral ocupa 240 px desde `lg` (sin cambio; el modo carril `rail` sigue
siendo preferencia del usuario).

| Rango | Ancho de ventana | Contenido útil | Layout |
| --- | --- | --- | --- |
| `lg` | 1024 a 1279 | 720 a 975 px | Una columna. Maestro-detalle de 320 px + detalle. KPI en 3 columnas. Columnas P3 ocultas. |
| `xl` | 1280 a 1535 (cubre 1366 y 1440) | 1008 a 1263 px | Una columna principal; panel lateral derecho de 320 px cuando la vista lo pide. KPI en una sola fila. Columnas P2 visibles; P3 desde 1200 px de contenedor. |
| `2xl` | ≥ 1536 (cubre 1920) | ≥ 1296 px | Maestro-detalle con lista de 380 px; panel lateral de 360 px; todas las columnas. |

Panel lateral derecho (resumen, historial, ayuda de la vista):

```
xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]
```

Debajo de `xl` el panel pasa debajo del contenido principal (`flex-col`).
Nunca se oculta contenido: solo se recoloca.

### 2.5 Menú lateral (H-02)

- Ítem: `h-8` (32 px, sin cambio). Cabecera de grupo: `h-7` (28 px) con
  `text-xs`, en lugar de la altura actual de 32 px.
- Los grupos **Gobierno** y **Activos** empiezan plegados la primera vez; el
  estado se recuerda con `use-collapsed-nav-groups`. El grupo que contiene la
  ruta activa siempre se despliega.
- El pie (usuario) fijo y de una línea. En producción no existe el selector
  «Usuario actual (dev)»: medir de nuevo con sesión JWT.
- Objetivo: a 1366×768 que se vean al menos 4 de 5 grupos sin desplazar el
  menú.

## 3. Tablas

### 3.1 Densidades

`Table` ya tiene `density="default" | "compact"`. Se añade una tercera.

| Densidad | `data-density` | Fila | Cuándo |
| --- | --- | --- | --- |
| Compacta | `compact` | 32 px (`h-8`) | Una línea por celda: auditoría, maestras, catálogos, asignaciones. |
| Estándar | `default` | 40 px (`h-10`) | Valor por defecto. Una línea con badge o `IdChip`. |
| Dos líneas | `twoline` | 52 px | Título + segunda línea (`CellTitle` con `meta`): solicitudes, documentos, portafolio, aprobaciones. |

Clases de fila (`ui/table.tsx`):

```
h-10 border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary-subtle
[[data-density=compact]_&]:h-8 [[data-density=twoline]_&]:h-[52px]
```

Celda: `px-3 py-1.5 align-middle`; compacta `py-1`; dos líneas `py-1.5`. Cabecera: 36 px
en las tres densidades (sin cambio).

Se **retira** el uso de filas de 58 a 73 px. Si un contenido no cabe en 52 px, se
mueve una de sus partes a otra columna (ejemplo: el proceso va en su propia
columna, no apilado bajo el título; el código `IdChip` va delante del título en la
misma línea).

### 3.2 Objetivo de filas visibles (cálculo de diseño)

Presupuesto vertical a 1366×768: 768 − barra 48 − relleno superior 16 − cabecera
56 − hueco 16 − barra de filtros 36 − hueco 12 − cabecera de tabla 36 − paginación
49 − relleno inferior 16 = **483 px para filas**.

| Densidad | 1366×768 | 1440×900 | 1920×1080 |
| --- | --- | --- | --- |
| Compacta (32) | 15 | 19 | 24 |
| Estándar (40) | 12 | 15 | 20 |
| Dos líneas (52) | 9 | 12 | 15 |

Referencia de hoy (auditoría): Solicitudes 7 filas, Portafolio 2, Documentos 6,
Aprobaciones 6 a 1366. El PR comprueba que ninguna queda por debajo de la tabla.

### 3.3 Estructura y clases

Tarjeta de tabla (contenedor):

```
overflow-hidden rounded-xl border bg-card shadow-card
```

Región desplazable con cabecera fija (para toda tabla de más de 25 filas o que
pueda crecer; se pasa `scrollLabel`):

```
[&>div]:max-h-[calc(100dvh-15rem)] [&>div]:overflow-auto
[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-surface-subtle
```

- `bg-surface-subtle` es opaco, para que las filas no se vean bajo la cabecera.
  `bg-muted/50` (actual) es translúcido y no sirve con cabecera fija.
- El `15rem` suma barra (48) + relleno (16) + cabecera de página (56) + hueco
  (16) + barra de filtros (48) + paginación (49) + margen: afinar en el PR para
  que la paginación quede siempre a la vista.
- Contraste (estimado con L³ de OKLCH; medir en el PR): `text-muted-foreground`
  sobre `surface-subtle` ≈ 6,5:1 en claro y ≈ 8,2:1 en oscuro; mínimo exigido 4,5:1. Medido en el PR B (OKLCH a sRGB): 6,64:1 en claro y 8,20:1 en oscuro; la etiqueta de `FilterField` (`text-muted-foreground` sobre `background`) mide 6,22:1 y 8,47:1.

Cabecera: `text-xs font-medium text-muted-foreground`, `SortableTableHead` sin
cambio (botón de 36 px, `aria-sort` solo en la columna activa).

Fila: borde inferior `border-b` (token `--border`, 9 %), hover `hover:bg-muted/40`,
seleccionada `bg-primary-subtle`. Sin cebra.

Celda de título: `CellTitle` pasa de `line-clamp-2` a **una línea**
(`line-clamp-1`) en densidades compacta y estándar, y mantiene `line-clamp-2` solo
en `twoline` cuando no hay `meta`. Ancho: `min-w-56 max-w-[28rem]`.

### 3.4 Columnas por prioridad (H-08)

La tabla va dentro de un contenedor con `@container` (clase de Tailwind 4, sin
plugin). Cada columna declara su prioridad:

| Prioridad | Clase en `th` y `td` | Visible desde |
| --- | --- | --- |
| P1 (identidad, estado, acción) | ninguna | siempre |
| P2 (proceso, responsable, fecha) | `hidden @4xl:table-cell` | contenedor ≥ 896 px |
| P3 (activo, decisión de triage, registro, creado por) | `hidden @[1200px]:table-cell` | contenedor ≥ 1200 px |

Con el ancho de contenido de la auditoría: 1062 px (1366) muestra P1 y P2; 1136 px
(1440) y 1600 px (1920) muestran P1, P2 y P3. Lo que se oculta sigue accesible en
la página de detalle; ninguna columna es la única fuente de un dato de decisión.
No se oculta por ancho la columna de acciones ni la de estado.

### 3.5 Acciones de fila

- Acción principal: el título (`CellTitle`) abre el detalle. 1 clic.
- Acciones secundarias: botones `variant="ghost" size="icon-sm"` (32 px) con
  `LabelTooltip` y `aria-label`; con más de dos, menú `DropdownMenu` con el icono
  «Más acciones». Siempre visibles (no solo al pasar el cursor): teclado y táctil.
- Acciones con texto («Aprobar», «Rechazar») solo cuando son la tarea de la vista
  (Aprobaciones): `Button size="sm"` (32 px). Con selección de filas, la barra de
  lote queda fija arriba de la tabla (sección 3.7).

### 3.6 Paginación y volumen (H-07)

- Toda lista cargada completa con más de 25 filas usa `useClientTable` y
  `DataTablePagination` (25 por página; 50 y 100 disponibles). No se deja ninguna
  tabla de cientos de filas sin paginar (Capacidad, Equipo y permisos,
  Aprobaciones).
- La paginación va dentro de la tarjeta, al pie, y no se oculta con una sola
  página (comportamiento actual).
- Secciones secundarias de una vista (asignaciones bajo usuarios, segunda tabla
  de Mis permisos) se presentan plegadas con `Section` + disclosure
  (`aria-expanded`), con el conteo visible en el título.
- Una tabla por entidad repetida (Procesos, unas 30 tablas) se sustituye por
  maestro-detalle (sección 9) o por acordeón de una sola sección abierta.

### 3.7 Barra de lote

Aparece al marcar filas y reemplaza la fila de filtros durante la selección:

```
flex min-h-9 items-center gap-2 rounded-lg bg-primary-subtle px-3 text-sm
```

Contiene «N seleccionadas» (`role="status"`), la acción en lote (`Button size="sm"`)
y «Limpiar selección» (`variant="ghost"`). El contraste de `text-foreground` sobre
`primary-subtle` ya está medido en la marca; no se usa `text-link` sobre este fondo.

### 3.8 Estados de la tabla

| Estado | Presentación |
| --- | --- |
| Cargando | `TableSkeleton` con el número de filas de la densidad; sin saltos de altura al llegar los datos. |
| Vacío | `EmptyState size="compact"` dentro de la tarjeta (sección 10). |
| Sin resultados del filtro | `EmptyState size="inline"` con «Limpiar filtros». |
| Error | `ErrorState` dentro de la misma tarjeta, con «Reintentar». |
| Recarga | Se mantiene la tabla y se atenúa (`opacity-60`) con `ResultCount spinner`; no se vacía. |
| Fila seleccionada | `data-[state=selected]:bg-primary-subtle` y casilla marcada (no solo color). |

## 4. Encabezado de página (H-01)

Patrón único para todas las vistas. `PageHeader` emite el h1.

Estructura, de arriba abajo:

1. Migas (solo en detalle): una línea `text-meta`.
2. Fila principal: h1 a la izquierda; acciones a la derecha (acción principal al
   final).
3. Descripción de **una línea** bajo el h1.
4. `meta` (badges y metadatos) solo en vistas de detalle, en la fila del h1 junto
   al título cuando caben, o bajo la descripción.
5. Trazo de marca de 2 px pegado al borde inferior de la cabecera.

Clases:

```
header: relative flex flex-col gap-2 pb-2 md:flex-row md:items-start md:justify-between
bloque de texto: flex min-w-0 flex-col gap-0.5
h1: text-xl font-bold tracking-tight wrap-break-word
descripción: max-w-3xl text-meta text-muted-foreground       (antes max-w-prose y text-sm)
acciones: flex flex-wrap items-center gap-2 md:shrink-0 md:pt-0
trazo: pointer-events-none absolute bottom-0 left-0 h-0.5 w-10 rounded-full bg-brand-gradient forced-colors:hidden
```

Medida de diseño: migas 0 (sin migas) + h1 28 + descripción 18 + `gap` 2 + `pb-2` 8
= **56 px** (hoy unos 125 a 155). Con migas: 74 px.

Reglas:

- La descripción cabe en una línea. Si necesita más, pasa a la ayuda de la
  sección o a un tooltip del icono «Información» junto al título; no se amplía la
  cabecera.
- Una sola acción primaria (`Button` variante por defecto). Las demás, `outline`
  o `ghost`.
- Las vistas con tabla conservan el trazo de marca (regla de la marca); lo que se
  quita es su fila propia y el `mt-1`.
- Cabecera pegajosa: no. El h1 se desplaza con la página; la barra superior y la
  paginación de las tablas ya cubren la orientación.

## 5. Indicadores (tarjetas KPI) (H-04)

Un solo componente: `StatStrip` + `StatTile`, con una altura de **64 px**.

`StatTile` compacto:

```
flex min-w-0 flex-col gap-0 border-t-2 bg-linear-to-b from-primary-subtle/60 to-card p-2.5
  etiqueta: truncate text-meta text-muted-foreground      (con title)
  valor:    text-xl font-semibold leading-6 tabular-nums
  pista:    text-xs text-muted-foreground  (solo si hay; en una línea, fuera de los 64 px: se omite en la fila compacta y vive en title)
```

- Altura: 10 + 18 + 24 + 10 + 2 (filete) = 64 px (hoy 85 a 110).
- Valor 0 sin importancia: `text-muted-foreground` (≈ 7:1 sobre `card`, estimado
  con L³). Valor con tono (`danger`, `warning`, `success`) solo cuando es mayor
  que 0 y requiere atención; el tono nunca es la única señal (la etiqueta dice
  qué es).
- Con enlace (Panel, Mi trabajo, Portafolio): el tile entero es un `Link` con
  `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`
  y un chevron `ChevronRight` de 16 px a la derecha del valor. El nombre accesible
  contiene la etiqueta visible.

`StatStrip` (contenedor):

```
grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-card
md:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr
max-lg:[&>:last-child:nth-child(odd)]:col-span-2
```

- Hasta 6 tiles: una sola fila desde `xl`. Con `grid-flow-col auto-cols-fr` no
  quedan celdas vacías que muestren el color del separador (el problema de las
  rejillas `auto-fit` con `gap-px`).
- Más de 6 indicadores: se agrupan en dos franjas con `Section`, no en una rejilla
  de 4 + 2.
- Desaparecen las variantes sueltas (tarjetas con flecha del Panel, franja de
  Resumen y Bitácora, tarjetas con icono de Mi trabajo y Portafolio). Todas usan
  este componente.
- Franja que combina KPI y filtros (Mi trabajo): la franja va a la izquierda y la
  vista (Lista/Tablero) a la derecha en la misma fila a partir de `xl`
  (`xl:flex xl:items-stretch xl:gap-3`).

## 6. Barra de filtros (H-05)

`Toolbar` se mantiene como contenedor (`role="group"` con `aria-label`). Se añade
un campo envoltorio, `FilterField`, para el patrón de **etiqueta dentro del
campo**. Todo en una fila a partir de `md`.

Contenedor:

```
flex flex-wrap items-center gap-2        (antes items-end)
```

`FilterField` (envuelve un `SelectTrigger` o `Input` sin borde propio):

```
wrapper: flex h-9 min-w-0 items-center rounded-md border border-input bg-background
         transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring
         has-[[aria-invalid=true]]:border-danger
etiqueta: shrink-0 pl-3 pr-1.5 text-meta text-muted-foreground whitespace-nowrap    (<Label htmlFor>)
control:  h-full flex-1 min-w-0 border-0 bg-transparent px-1.5 shadow-none
          focus-visible:outline-0 focus-visible:border-0
```

- La etiqueta sigue siendo un `<Label htmlFor>` visible, de modo que el nombre
  accesible contiene el texto visible (`label-content-name-mismatch`) y se cumple
  WCAG 3.3.2.
- El borde del wrapper usa `border-input` (3:1, ya medido en la marca); el foco se
  dibuja en el wrapper (2 px, `outline-ring`) y no en el control interior.
- Altura 36 px con etiqueta incluida: se ahorra la fila de etiquetas (unos 20 px)
  por barra.

Orden y contenido:

1. Búsqueda (`SearchInput`, 256 px; `xl:w-72`), sin etiqueta encima: con
   `label="Buscar"` y `labelHidden`, y `placeholder` que nombra el campo. La
   etiqueta del campo de búsqueda va como `Label` `sr-only`; el icono de lupa y el
   `placeholder` la hacen visible. (Excepción a la etiqueta visible justificada:
   el campo es de tipo `search` con icono y marcador que dicen el contenido; si la
   revisión de accesibilidad lo rechaza, se vuelve a la etiqueta visible
   integrada como en `FilterField`.)
2. Hasta cuatro filtros de uso frecuente, en `FilterField`, ancho `w-44` (176 px)
   o `w-52` si el valor es largo.
3. Más de cuatro: el resto bajo el botón «Más filtros» (`Button variant="outline"
   size="default"`, `aria-expanded`, `aria-controls`) con un `Badge` neutro que
   cuenta los filtros activos dentro del panel. El panel se despliega **en línea**
   bajo la barra (no es un popover: no hay dependencia nueva y el contenido
   sigue en el orden de tabulación).
4. A la derecha (`ml-auto`): `ResultCount`, «Limpiar filtros»
   (`Button variant="ghost" size="sm"`, visible solo con filtros activos) y las
   acciones secundarias (exportar).

Notas largas (alcance, «¿Qué significan P1 a P4?»): salen de la fila. Van en un
icono `Info` (`Button variant="ghost" size="icon-sm"` con `aria-label` y
`LabelTooltip`) que abre el contenido en un `Sheet` o en un bloque plegable bajo
la barra. El texto no se pierde; deja de ocupar altura fija.

Filtros activos: se ve el valor dentro del campo; con filtros fuera de la barra
(en «Más filtros») se muestra el contador. No se agregan chips de filtros activos.

Comportamiento (sin cambio funcional): los filtros se aplican al cambiar. El foco
no se mueve al entrar a la vista (evita desorientar a quien usa lector de
pantalla y no oculta el h1); la búsqueda se alcanza con un solo tabulador desde
la cabecera. Si el desarrollo quiere atajo de teclado `/` para enfocar la
búsqueda, es una mejora aparte con su propia especificación.

Móvil (< `sm`): se mantiene `collapseOnMobile` y `FilterField` pasa a
`w-full h-11` (objetivo táctil de 44 px).

## 7. Formularios

### 7.1 Campo

`Field` se conserva (etiqueta, control, ayuda, error, `aria-*`). Cambios
visuales:

```
Field: grid gap-1.5                                  (sin cambio)
Label: text-sm font-medium
Control: h-9 (Input, Select, Button); Textarea min-h-20
Ayuda: text-meta text-muted-foreground
Error: text-meta text-danger con CircleAlert, junto al campo
```

- Etiqueta siempre encima del control (en formularios la etiqueta flotante dentro
  del campo se reserva para la barra de filtros).
- Ayuda de una línea. Si es larga, va en un tooltip del icono `Info` junto a la
  etiqueta, nunca como bloque de varias líneas entre campos.
- Obligatorio: asterisco `aria-hidden` y `aria-required` (sin atributo `required`
  de HTML, regla de `field.tsx`).

### 7.2 Rejilla

Formulario de página:

```
grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2
  campo ancho completo: lg:col-span-2     (descripción, textarea, grupos de radios largos)
```

- Campos cortos (fecha, número, estado) en una columna; campos largos (título,
  descripción) con `lg:col-span-2`.
- Máximo 2 columnas. A 3 columnas la lectura en Z falla y los errores quedan
  lejos de su etiqueta.
- `width="form"` (960 px) en `PageLayout`: dos columnas de unos 460 px.

### 7.3 Secciones y navegación interna (Configuración e IA)

Para formularios con más de 3 secciones (Configuración del sistema, Agentes de IA):

```
xl:grid xl:grid-cols-[200px_minmax(0,1fr)] xl:items-start xl:gap-6
```

- Columna izquierda: `nav aria-label="Secciones del formulario"` con enlaces de
  ancla (`<a href="#id">`), `sticky top-16`, `text-sm`, el activo con
  `aria-current="location"` y `text-foreground font-medium`; los demás
  `text-muted-foreground hover:text-foreground`. Sin scroll-spy obligatorio; si se
  añade, no debe mover el foco.
- Cada sección: tarjeta `rounded-xl border bg-card shadow-card p-4` con `Section`
  (h2) y su rejilla de campos. `scroll-mt-20` en cada sección para que la barra
  superior (48 px) no la tape.
- Debajo de `xl`, la navegación interna desaparece y las secciones se apilan.

### 7.4 Barra de acciones fija

En formularios de página de más de una pantalla:

```
sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 xl:-mx-8 xl:px-8
```

- A la izquierda: estado («Cambios sin guardar», `role="status"`). A la derecha:
  «Cancelar» (`outline`) y la acción principal («Guardar», por defecto).
- Con `prefers-reduced-motion` no hay transición; no hay animación decorativa.
- El botón principal se deshabilita con `aria-disabled` y motivo visible
  (`DisabledReason`) mientras guarda; no se cambia el texto salvo «Guardando…».

### 7.5 Estados

| Estado | Presentación |
| --- | --- |
| Foco | Outline 2 px `outline-ring` sobre el control (`Input`, `Select`, `Textarea` ya lo traen). |
| Error | Borde `border-danger`, `aria-invalid`, mensaje `text-danger` con icono bajo el campo; error combinado en `FormError` (`role="alert"`) al inicio del formulario. |
| Deshabilitado | `disabled:bg-muted disabled:text-muted-foreground`; si hay un motivo, se muestra en la ayuda del campo. |
| Solo lectura | `read-only:bg-muted/60`. |
| Envío | El botón principal muestra `Loader2` con `motion-reduce:animate-none`; el resto del formulario no se bloquea con un velo. |
| Éxito | Toast (`sonner`) y, si cambia de vista, mensaje en la vista de destino. No hay banner permanente en el formulario. |

## 8. Diálogos

`DialogContent` mantiene sus tamaños (`sm` 440, `md` 560, `lg` 720, `xl` 960 px).

Cambios de clase:

```
DialogContent: ... rounded-xl border bg-popover shadow-lg ...       (antes rounded-lg)
DialogHeader:  flex flex-col gap-1 px-5 pr-12 pt-4 pb-2 text-left     (antes pt-5 pb-3)
DialogBody:    min-h-0 flex-1 overflow-y-auto px-5 py-1               (antes pb-2)
DialogFooter:  flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end   (antes pb-5 pt-3, sin filete)
```

El filete superior del pie deja claro que el cuerpo se desplaza por debajo y que
los botones no se mueven. Medida de diseño: se ahorran unos 16 px por diálogo.

| Tamaño | Uso | Columnas del formulario |
| --- | --- | --- |
| `sm` (440) | Confirmaciones, motivo de una línea | 1 |
| `md` (560) | Alta o edición corta (3 a 5 campos) | 1 |
| `lg` (720) | Alta o edición media (6 a 10 campos) | `sm:grid-cols-2` |
| `xl` (960) | Vistas de trabajo dentro de un diálogo (revisión, comparación) | `sm:grid-cols-2` o lista + detalle |

Reglas:

- Una acción primaria a la derecha, secundaria a su izquierda. La acción
  destructiva usa `variant="destructive"` y el diálogo `sm` (`ConfirmDialog` y
  `ReasonDialog` ya lo hacen).
- El primer campo recibe el foco al abrir; en confirmaciones destructivas, el foco
  va a «Cancelar» (comportamiento actual de Radix y de `ConfirmDialog`).
- Altura máxima `max-h-[calc(100dvh-2rem)]` (sin cambio): a 768 px de alto el
  cuerpo se desplaza y el pie permanece.
- Un diálogo no abre otro diálogo. Si un flujo necesita dos pasos, usa pasos en el
  mismo diálogo o una página.
- Para ver o editar una fila sin salir de la lista (menos clics) se usa el
  maestro-detalle (sección 9), no un diálogo.

## 9. Maestro-detalle (H-09)

Para Triage, Priorización, Planificación, Reuniones y Procesos. Reutiliza
`MasterDetail` y `SelectableList`.

```
MasterDetail:  flex flex-col gap-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] lg:items-start
Lista (sticky): lg:sticky lg:top-16          (antes lg:top-6)
Contenedor:     overflow-y-auto rounded-xl border bg-card shadow-card lg:max-h-[calc(100dvh-6rem)]
```

- `lg:top-16` (64 px): `top-6` deja la lista bajo la barra superior pegajosa de
  48 px. Comprobarlo en el PR A.
- Ítem de lista: 52 px (`py-2`), título de **una línea** (`line-clamp-1`) con
  el `IdChip` o el código delante, y la segunda línea (`meta`) con proceso o
  fecha. Actas y solicitudes: 8 a 9 ítems visibles a 1366×768 (hoy 3 a 6).
- Seleccionado: `bg-primary-subtle`, barra izquierda de 2 px `bg-primary`,
  `aria-current="true"` (sin cambio): no depende solo del color por la barra y el
  atributo.
- Selección inicial: el primer elemento pendiente según el orden que entrega la
  API. Se hace en la vista (estado local), sin lógica de negocio nueva. El detalle
  no roba el foco en la autoselección (comportamiento actual de `MasterDetail`).
- Detalle: sus acciones principales van en una barra superior del detalle
  (`flex items-center justify-between gap-2 pb-2`), no al final del formulario.
- En `lg` y más grande no hay selector desplegable de solicitud: la lista lo
  reemplaza. Debajo de `lg` se mantiene el apilado actual.
- Procesos: la lista son los procesos (con su conteo) y el detalle es su tabla;
  sustituye a unas 30 tablas apiladas.

## 10. Estados vacíos

`EmptyState` conserva su API (`default`, `compact`, `inline`).

| Contexto | `size` | Alto |
| --- | --- | --- |
| Vista completa sin datos (primera vez) | `default` (`py-10`) | ≤ 160 px sin acción, ≤ 200 px con acción |
| Tabla o lista dentro de una tarjeta | `compact` (`py-6`) | unos 112 px |
| Filtro sin resultados | `inline` | unos 48 px |
| Bloque secundario, sección plegable | `inline` | unos 48 px |

Reglas:

- Título: qué ocurre, como frase («Aún no hay solicitudes.»). Descripción: una
  línea con cómo empezar. Máximo una acción.
- No repetir una acción que ya está en la cabecera de la página (caso Bitácora y
  Reporte semanal, hoy 225 px con el botón duplicado): el vacío no lleva botón y
  la descripción remite a la acción de la cabecera.
- Icono en círculo `bg-primary-subtle` con `text-link` (sin cambio); 40 px en
  `default`, ninguno en `inline` si el contenedor es angosto.
- Los KPI de una vista sin datos no se muestran como una franja de ceros: se
  omite la franja (el vacío lo explica) o se muestran atenuados (sección 5) si la
  vista ya cargó datos.
- Error de carga: `ErrorState`, mismo contenedor y mismo alto que el vacío.

## 11. Badges y estado semántico

Sin cambio de componentes: `StatusBadge` y `PriorityBadge` (nunca texto plano).
Fondo `*-subtle`, texto del tono, etiqueta e icono. En tablas, el badge es
`h-5` (20 px) para caber en filas de 32 y 40 px. El `IdChip` va en la misma línea
que el título en `twoline` y como primera celda en `default`.

## 12. Accesibilidad

- Contraste: no se introduce ningún color nuevo. Los pares usados ya cumplen AA en
  los dos temas (ver `identidad-color-menu.md`). Pares que esta especificación
  usa por primera vez, con ratio **estimado** (L³ de OKLCH) que el PR debe
  confirmar con una medición real:
  - `text-muted-foreground` sobre `surface-subtle` (cabecera fija): ≈ 6,5:1 claro,
    ≈ 8,2:1 oscuro.
  - `text-muted-foreground` sobre `card` (KPI en 0): ≈ 7:1 claro.
  - Etiqueta de `FilterField` `text-muted-foreground` sobre `background`: ≈ 6:1
    claro. Mínimo 4,5:1.
- Objetivos: botones y controles de 36 px (`h-9`) y 32 px (`size="sm"` e
  `icon-sm`), superiores al mínimo de 24 px de WCAG 2.5.8. En móvil o puntero
  táctil, `pointer-coarse:min-h-10` y los 44 px de los controles de paginación y
  filtros (sin cambio).
- Foco visible: outline de 2 px con `--ring` en todo elemento interactivo; el
  wrapper de `FilterField` lo dibuja con `has-[:focus-visible]`. Con la cabecera
  de tabla fija, `scroll-mt` y `scroll-padding` evitan que el foco quede tapado
  (WCAG 2.4.11).
- Nombre accesible: debe contener el texto visible (`label-content-name-mismatch`).
  Aplica a los enlaces de KPI, `FilterField`, «Más filtros» y los botones de
  fila con icono (`aria-label` descriptivo + `LabelTooltip`).
- No depender solo del color: selección (casilla y barra), prioridad y estado
  (etiqueta e icono), error (icono y texto), KPI con tono (etiqueta).
- Regiones: cada tabla desplazable con `scrollLabel` (`role="region"`, enfocable);
  barra de filtros `role="group"`; contador `role="status"`; navegación interna
  de formulario `nav` con `aria-label`.
- Orden de tabulación = orden visual: cabecera (acciones) → filtros → tabla →
  paginación; en maestro-detalle: lista → detalle. El panel lateral derecho va
  después del contenido principal en el DOM.
- `prefers-reduced-motion`: sin animaciones decorativas; los giros (`Loader2`) y
  los despliegues llevan `motion-reduce:animate-none` y `motion-reduce:transition-none`.
- Modo de alto contraste forzado: el trazo de marca ya usa `forced-colors:hidden`;
  los elementos seleccionados conservan la barra y el `aria-current`.
- La validación completa requiere pruebas manuales con lector de pantalla
  (NVDA con Firefox o Chrome y VoiceOver), zoom al 200 % y al 400 %, y revisión
  experta; las verificaciones automáticas (axe) no la sustituyen.

## 13. Responsive

| Rango | Comportamiento |
| --- | --- |
| < 640 (`sm`) | Una columna, objetivos de 44 px, filtros plegados bajo «Filtros», tablas en tarjetas (`DataCardList`, sin cambio), formularios a 1 columna, barra de acciones fija ocupa el ancho. |
| 640 a 1023 | Menú en cajón. KPI en 2 o 3 columnas. Formularios a 1 columna. Maestro-detalle apilado. |
| 1024 a 1279 (`lg`) | Menú fijo. Formularios en 2 columnas. Maestro-detalle de 320 px. Tablas con P1 y P2 según el contenedor. |
| 1280 a 1535 (`xl`) | KPI en una fila. Panel lateral de 320 px. Navegación interna de formularios. Cubre 1366 y 1440. |
| ≥ 1536 (`2xl`) | Lista del maestro-detalle de 380 px, panel de 360 px, todas las columnas. Cubre 1920 y mayores. |

No se rompe el móvil: lo que se ajusta (cabecera, KPI, densidades) se revisa a
390×844 en cada PR. Las densidades de 32 y 40 px aplican solo desde `md`; con
puntero táctil se conservan `pointer-coarse:min-h-10` y las tarjetas móviles.

## 14. Cambios de componentes para `desarrollador`

Ningún componente nuevo exige dependencia. Lista por componente, con el PR
orientativo:

| PR | Componente | Cambio |
| --- | --- | --- |
| A | `app-shell.tsx` | `main`: `py-4` (antes `py-5 md:py-6`). |
| A | `page-layout.tsx` | Propiedad `width` (`fluid` 1760, `form` 960, `reading` 720); `gap-6 lg:gap-4`. |
| A | `page-header.tsx` | Sección 4: descripción `text-meta max-w-3xl`, trazo absoluto en el borde inferior, `pb-2`, `gap-0.5`. |
| A | `app-sidebar.tsx` | Cabeceras de grupo de 28 px; Gobierno y Activos plegados por defecto; pie compacto. |
| A | `stat-tile.tsx` | `StatTile` compacto (64 px), `StatStrip` en fila única desde `xl`, prop `href`, valor en 0 atenuado. |
| A | `master-detail.tsx` | Columnas por breakpoint, `lg:top-16`, ítems de 52 px. |
| B | `ui/table.tsx` | Densidad `twoline`, cabecera fija opaca (`bg-surface-subtle`), contenedor `@container`. |
| B | `data-table.tsx` | `CellTitle` de una línea por defecto; paginación sin cambios. |
| B | `toolbar.tsx` | Contenedor `items-center`; nuevo `FilterField`; «Más filtros» en línea; nota en icono `Info`. |
| C | `ui/dialog.tsx` | Radio `rounded-xl`, rellenos y filete del pie. |
| C | `field.tsx` | Sin cambio de API; ayuda en tooltip opcional. |
| C | Formularios de Configuración e IA | Rejilla de 2 columnas, navegación interna, barra de acciones fija. |
| D | Vistas por módulo | Aplican los patrones; sin estilos sueltos. |

Prohibido en las vistas: alturas de fila propias (`h-[58px]`, `py-4` en celdas),
rejillas de KPI propias, `text-2xl` para un valor de KPI, colores crudos de
Tailwind y barras de filtros con etiqueta encima del control.

## 15. Criterios de aceptación del conjunto

Medidas objetivo a verificar con capturas antes y después, a 1366×768, 1440×900 y
1920×1080:

1. Cabecera de página ≤ 60 px sin migas (hoy 125 a 155).
2. Ninguna tabla con filas de más de 52 px; ninguna lista de más de 25 filas
   por página sin paginar o sin cabecera fija con región desplazable.
3. Primera fila de la tabla sobre el pliegue en todas las vistas de lista a
   1366×768, y al menos 9 filas visibles en las de dos líneas.
4. KPI de 64 px en todas las vistas, con un único componente.
5. Barra de filtros de una sola fila a 1366×768 en Solicitudes, Portafolio,
   Documentos, Bitácora y Mi trabajo.
6. Triage, Priorización y Planificación con lista y formulario visibles a la vez
   a 1366×768.
7. Menú lateral con al menos 4 de 5 grupos visibles sin desplazar a 1366×768.
8. Contraste AA en los dos temas, foco visible y navegación por teclado
   comprobados; axe sin errores nuevos; sin regresión a 390×844.

## 16. Pendientes para el PR E

- **Detalle de solicitud** (/demanda/solicitudes/[id]): decisión aprobada en el PR D: no se pliega ni se oculta nada, porque el usuario quiere ver siempre el detalle de solo lectura de cada etapa registrada. *Ejecución* y *Cierre del proyecto* van en dos columnas desde lg, las tarjetas de etapa usan p-3 y los controles GC1–GC5 en dos columnas por contenedor. Mide 2,19 pantallas a 1366×768 (antes 2,74 en el PR D iteración 1 y 3,35 al inicio), 1,85 a 1440×900 y 1,45 a 1920×1080. El objetivo de esta vista pasa de 1,5 a ≤2,2 sin ocultar información.
- **Vacíos de Bitácora y Reporte semanal** (PR E, medido en navegador con respuestas vacías simuladas): Bitácora 144 px sin franja de ceros; Reporte semanal 100 px en la lista y 96 px en el detalle. Cumplen el máximo de 160 px.
- **Alta de solicitud como página** (PageLayout width="form"): queda como propuesta, no se implementa en el PR E. El alta vive hoy en un diálogo que también se abre desde otras vistas para crear rápido; pasarla a página cambia la navegación (ruta nueva, volver, foco tras crear) y no es un ajuste de densidad. Propuesta: ruta `/demanda/solicitudes/nueva` con `PageLayout width="form"` y las secciones del formulario actual, y conservar el diálogo para el alta rápida.
- **`StatTile` interruptor** (PR E): `onToggle`, `pressed` y `disabled` convierten el tile en un botón con `aria-pressed`, anillo `ring-primary` y «Filtro activo» para lectores. Sustituye a las tarjetas-contador de Mi trabajo y del Portafolio.
- **`FilterNote`** (PR E): pasa de tooltip a desplegable nativo (`<details>`), para que la nota también se abra con el dedo.
