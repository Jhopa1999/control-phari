# Identidad de color: menú marino, lienzo tintado y acentos de marca

Especificación visual (rol Diseñador). No toca código. Reglas vigentes:
`25-marca-gibo.md` y `20-frontend-nextjs.md` (solo tokens semánticos, texto azul con `text-link`,
foco con `--ring`). Todos los contrastes de este documento están **medidos** (WCAG 2.2, luminancia
relativa sRGB; los colores translúcidos se compusieron sobre su fondo real).

## 1. Decisión

Se evaluaron tres alternativas:

| Opción | Qué cambia | Veredicto |
| --- | --- | --- |
| A. Conservadora | Solo el menú en marino | El menú ocupa ~240 px; el 85 % de la pantalla sigue «clínica». No resuelve la queja. |
| **B. Equilibrada (recomendada)** | Menú marino + lienzo con tinte azul perceptible + filete degradado en la barra superior + acentos en StatTile, estados vacíos y cabecera de página | Cambia las dos superficies que más pesan (menú y fondo) y añade color puntual sin tocar la estructura. |
| C. Atrevida | B + barra superior marino + banda degradada tras el encabezado de página | La barra superior aloja campana, asistente y menú de usuario, que usan tokens `foreground`/`muted`: exigiría duplicar su estilo para fondo oscuro. Más riesgo de contraste y de «dos identidades». |

Se recomienda **B** por tres razones. (1) Ataca la causa («muy blanco») en las dos superficies grandes.
(2) Mantiene la barra superior clara: así campana, asistente y usuario no necesitan variantes y la
lectura del contenido no compite con el color. (3) El color vive en tokens: si se quiere ir hacia C
más adelante, se hace sin rehacer nada.

Decisiones que se apartan de la propuesta inicial:
- **Filete en el borde inferior** de la barra (sustituye a `border-b`), no en el superior: separa y decora a la vez.
- **El interruptor de tema no se mueve al pie.** Hoy está junto al logo y el pie ya tiene el botón de
  riel y el selector dev; moverlo cambia la estructura y la gestión de foco en riel. Solo cambia su estilo.
- **Barra móvil clara**, cajón marino: es el mismo patrón que en escritorio (barra clara + menú marino).
- **El lienzo se aparta del HEX maestro** `#F4F6F8` → `#EBF0F7`. **Requiere tu visto bueno**: la regla
  25 dice que prevalece el HEX de marca. Si se aprueba, se actualiza la tabla de tokens del steering 25
  y se anota en `docs/branding/gibo` como «lienzo de aplicación». Si no se aprueba, el resto de la
  propuesta sigue funcionando (el menú y los acentos hacen la mayor parte del trabajo).
- **Un solo juego de tokens del menú para ambos temas**: el menú es oscuro siempre. Solo cambia
  `--sidebar` (marino `#0F2557` en claro; el marino profundo actual `#030D24` en oscuro, más hundido que
  el fondo `#08152E`). Así no hay dos identidades.

## 2. Tokens (`apps/web/src/app/globals.css`)

### 2.1 Marca y degradado (nuevos)

```css
:root {
  --brand-navy: oklch(0.281 0.095 263.6);      /* #0F2557 */
  --brand-electric: oklch(0.559 0.208 259.8);  /* #176BEB */
  --brand-cyan: oklch(0.738 0.122 207.3);      /* #20BFD1 */
  --brand-gradient: linear-gradient(90deg, var(--brand-navy), var(--brand-electric) 55%, var(--brand-cyan));
}
.dark {
  /* El marino no se ve sobre el fondo oscuro: el filete parte del azul eléctrico. */
  --brand-gradient: linear-gradient(90deg, var(--brand-electric), var(--brand-cyan));
}
@utility bg-brand-gradient { background-image: var(--brand-gradient); }
```
En `@theme inline`: `--color-brand-navy`, `--color-brand-electric`, `--color-brand-cyan` → `var(--brand-*)`.

### 2.2 Lienzo y superficies (solo claro; el oscuro no cambia)

| Token | Antes | Nuevo (OKLCH) | HEX |
| --- | --- | --- | --- |
| `--background` | `0.972 0.003 247.9` | `oklch(0.953 0.011 256.7)` | `#EBF0F7` |
| `--surface-subtle` | `0.985 0.002 248` | `oklch(0.975 0.006 255.5)` | `#F4F7FB` |
| `--muted`, `--secondary`, `--accent` | `0.94–0.945 …` | `oklch(0.925 0.014 254.6)` | `#E0E7F0` |
| `--secondary-hover` | `0.91 0.012 255` | `oklch(0.89 0.02 255)` | `#D2DCE8` |
| `--primary-subtle` | `0.95 0.03 259.8` | `oklch(0.93 0.04 259.8)` | `#D9E9FF` |

`--card` sigue en blanco puro: sobre `#EBF0F7` las tarjetas se despegan más que antes. `--border` y
`--shadow-card` no cambian. `--muted/--secondary/--accent` bajan un paso para no confundirse con el nuevo lienzo.

### 2.3 Menú lateral (valores nuevos; sustituyen a los actuales)

```css
:root {
  --sidebar: oklch(0.281 0.095 263.6);                 /* #0F2557 */
  --sidebar-foreground: oklch(0.94 0.012 255);         /* #E6ECF3 */
  --sidebar-muted-foreground: oklch(0.80 0.035 258);   /* #B0BFD5 */
  --sidebar-accent: oklch(1 0 0 / 8%);                 /* hover → #223664 */
  --sidebar-accent-foreground: oklch(1 0 0);
  --sidebar-active: oklch(0.559 0.208 259.8 / 32%);    /* ítem activo → #123B86 */
  --sidebar-primary: oklch(0.738 0.122 207.3);         /* cian: barra e icono activos */
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-field: oklch(1 0 0 / 8%);                  /* fondo del buscador/selector */
  --sidebar-field-border: oklch(1 0 0 / 45%);          /* borde de controles (≥3:1) */
  --sidebar-ring: oklch(0.738 0.122 207.3);            /* foco: cian */
}
.dark { --sidebar: oklch(0.165 0.05 262); }            /* #030D24 (ya existe); el resto se hereda */
```
`@theme inline`: añadir `--color-sidebar-active`, `--color-sidebar-primary`, `--color-sidebar-field`,
`--color-sidebar-field-border`, `--color-sidebar-ring`. Ajustar `nav-scroll-shadow`: sombras
`oklch(0 0 0 / 14%)` → `oklch(0 0 0 / 35%)` (con 14 % no se ven sobre marino).

El azul eléctrico **no** se usa como barra/icono sobre el menú (3,05:1, justo al límite): se usa cian (6,63:1).

## 3. Especificación por componente

### 3.1 Menú lateral (`app-sidebar.tsx`)
- **Contenedor** (`bg-sidebar border-r border-sidebar-border`): sin cambio de clases; cambian los tokens.
  Añadir `print:hidden` en la columna exterior (ver §6).
- **Logo** (`brand.tsx`): `BrandName` y `BrandMark` reciben `tone?: 'auto' | 'inverse'`. Con `inverse`
  se renderiza **solo la variante negativo** (sin el par `dark:`), en ambos temas. El tagline usa
  `text-sidebar-muted-foreground` en `inverse` y **`text-muted-foreground` en `auto`** (hoy usa el token
  del menú y en login quedaría ilegible con el nuevo valor claro). Sin filtros de inversión.
- **Ítem (`NavLink`)**, reemplazar las clases por:
  - Base: `group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground transition-colors pointer-coarse:min-h-10 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring rail:justify-center rail:px-0`
  - Activo: `bg-sidebar-active font-medium text-sidebar-accent-foreground hover:bg-sidebar-active before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]`
  - Icono: inactivo `text-sidebar-muted-foreground group-hover:text-sidebar-accent-foreground`; activo `text-sidebar-primary`.
  - Insignia `item.badge`: `border-sidebar-border text-sidebar-muted-foreground` (sin cambio de clases).
- **Grupos** (botón y etiqueta fija): `px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground hover:text-sidebar-foreground`
  y foco `outline-sidebar-ring`. Chevron hereda el color. El grupo de entrada sigue sin título.
  En riel, el separador entre grupos usa `border-sidebar-border` (ya lo hace).
- **Buscador**: icono `text-sidebar-muted-foreground`; `Input` con
  `h-8 border-sidebar-field-border bg-sidebar-field pl-8 text-sm text-sidebar-foreground placeholder:text-sidebar-muted-foreground focus-visible:border-sidebar-ring focus-visible:outline-sidebar-ring [&::-webkit-search-cancel-button]:hidden`.
  Con la «x» nativa oculta (es oscura sobre marino), añadir un botón «Limpiar búsqueda» (`variant="sidebar"`,
  `icon-sm`, solo con texto); Escape sigue limpiando.
- **Pie**: `border-t border-sidebar-border`. `Label` del selector dev: añadir `text-sidebar-foreground`
  (por defecto es `text-foreground`, marino sobre marino). `SelectTrigger`:
  `h-8 border-sidebar-field-border bg-sidebar-field text-sidebar-foreground data-[placeholder]:text-sidebar-muted-foreground focus-visible:outline-sidebar-ring [&>svg]:text-sidebar-muted-foreground`.
  Avatar en riel: `bg-sidebar-active text-sidebar-accent-foreground`. Esqueletos: `bg-sidebar-accent`.
  Aviso y «Reintentar»: `variant="sidebar"` + `border border-sidebar-field-border`.
- **Botones del menú** (contraer/expandir, aviso en riel, `ThemeToggle`): `variant="sidebar"` (nuevo, ver 3.6).
  `ThemeToggle` recibe `tone?: 'default' | 'sidebar'` para elegir esa variante.

### 3.2 Barra superior (`app-shell.tsx`, escritorio)
Clases de la barra: sustituir `border-b bg-background/95 backdrop-blur` por
`relative bg-card/90 backdrop-blur` y añadir como último hijo:
`<div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-brand-gradient forced-colors:hidden" />`.
Fondo blanco/tarjeta: se despega del lienzo tintado sin pesar.

### 3.3 Menú móvil (`mobile-nav.tsx` y `ui/sheet.tsx`)
- Barra: igual que 3.2 (`bg-card/90`, filete inferior de 2 px); `BrandName` en `auto`.
- Cajón: `SheetContent` pasa `className="bg-sidebar text-sidebar-foreground"`; el `AppSidebar variant="drawer"`
  usa `tone="inverse"` (mismo logo, mismos ítems). El botón cerrar usa `variant="sidebar"` cuando el
  cajón es el menú.
- **Crítico:** `sheetVariants` hoy lleva `bg-sidebar`, y `SheetContent` también lo usan el asistente
  (`assistant-panel.tsx`) y el detalle de tareas (`plan-view.tsx`). Con el menú marino quedarían marino
  con texto marino. Cambiar el base a `bg-popover text-popover-foreground` y que solo el menú pida `bg-sidebar`.

### 3.4 Contenido
- **`PageHeader`**: `h1` pasa a `font-bold` (Montserrat 700 según marca; la fuente variable ya trae 100–900)
  conservando `text-xl`. Al final de la columna izquierda: `<span aria-hidden="true" className="mt-2 h-0.5 w-10 rounded-full bg-brand-gradient forced-colors:hidden" />`.
- **`StatTile`**: `className` pasa a
  `flex min-w-0 flex-col gap-1 border-t-2 border-t-primary bg-linear-to-b from-primary-subtle/60 to-card p-4`.
  Mapa `ACCENT_TONES` junto a `VALUE_TONES`: `danger → border-t-danger`, `warning → border-t-warning`,
  `success → border-t-success`, `default → border-t-primary`. El borde coloreado se suma al color del
  valor, así que el significado no depende solo del color. `StatStrip`: `rounded-lg` → `rounded-xl shadow-card`
  (alinea con el steering 25).
- **`EmptyState`** (`default` y `compact`): el icono va dentro de
  `<span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-primary-subtle text-link">` con el icono en `size-5`
  (sin `text-muted-foreground`). `inline` no cambia. Esto sustituye la regla «sin círculo de fondo» del
  componente original.
- **Botones**: el primario ya es azul eléctrico con texto blanco (4,84:1) y se queda igual: sobre el lienzo
  tintado destaca más. `outline`: `bg-background` → `bg-card` (dentro de tarjetas y sobre el lienzo se lee
  como botón, no como hueco).

### 3.5 Foco
Fuera del menú: `--ring` (azul eléctrico) sin cambios. Dentro del menú: `outline-sidebar-ring` (cian).
Siempre `outline-2`, con `-outline-offset-2` en ítems para que el recorte del `overflow-y-auto` no lo corte.

### 3.6 Variante nueva de `Button`: `sidebar`
```
sidebar: 'text-sidebar-foreground not-aria-disabled:hover:bg-sidebar-accent not-aria-disabled:hover:text-sidebar-accent-foreground focus-visible:outline-sidebar-ring'
```
No basta con pasar `className` a `ghost`: `not-aria-disabled:hover:bg-accent` tiene mayor especificidad que
`hover:bg-sidebar-accent` y `tailwind-merge` no los trata como conflicto; el hover quedaría claro sobre marino.

## 4. Contraste medido (WCAG 2.2 AA)

Umbral: texto normal ≥ 4,5:1; texto grande, iconos y bordes de control ≥ 3:1. «Claro/Oscuro» = tema.

### 4.1 Menú (fondo `#0F2557` en claro, `#030D24` en oscuro)

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Texto del ítem (`sidebar-foreground`) / menú | 12,41 | 16,25 | 4,5 ✔ |
| Texto de grupo, tagline, hints (`sidebar-muted-foreground`) / menú | 7,91 | 10,36 | 4,5 ✔ |
| Texto del ítem / hover (`#223664`) | 9,92 | 13,62 | 4,5 ✔ |
| Texto muted / hover | 6,33 | 8,69 | 4,5 ✔ |
| Texto blanco / ítem activo (`#123B86`) | 10,52 | 13,63 | 4,5 ✔ |
| Texto muted (hint) / ítem activo | 5,64 | 7,31 | 4,5 ✔ |
| Barra e icono cian / menú | 6,63 | 8,68 | 3 ✔ |
| Icono cian / ítem activo | 4,73 | 6,12 | 3 ✔ |
| Foco cian / menú | 6,63 | 8,68 | 3 ✔ |
| Borde del buscador (blanco 45 %) / menú | 4,10 | 5,30 (al 50 %) | 3 ✔ |
| Placeholder (muted) / fondo del buscador | 6,33 | 8,69 | 4,5 ✔ |
| Texto escrito (blanco) / fondo del buscador | 11,80 | — | 4,5 ✔ |
| (descartado) azul eléctrico / menú | 3,05 | — | 3: pasa por poco, se usa cian |

### 4.2 Lienzo y superficies (claro)

| Par | Ratio | Umbral |
| --- | --- | --- |
| Texto marino / lienzo `#EBF0F7` | 12,89 | 4,5 ✔ |
| `muted-foreground` / lienzo | 6,25 | 4,5 ✔ |
| `text-link` `#145CCB` / lienzo | 5,36 | 4,5 ✔ |
| `muted-foreground` / `--muted` `#E0E7F0` (cabeceras de tabla, esqueletos) | 5,75 | 4,5 ✔ |
| `text-link` / `--muted` | 4,92 | 4,5 ✔ |
| `muted-foreground` / `--secondary-hover` | 5,16 | 4,5 ✔ |
| `text-link` / `--secondary-hover` | **4,42** | 4,5 ✘ (no se usa: el secundario lleva `secondary-foreground`) |
| `text-link` / `--primary-subtle` `#D9E9FF` | 4,98 | 4,5 ✔ |
| `muted-foreground` / `--primary-subtle` | 5,81 | 4,5 ✔ |
| `muted-foreground` / `--surface-subtle` | 6,66 | 4,5 ✔ |
| Borde de control (`--border-strong`) / lienzo | 3,17 | 3 ✔ |
| Borde de control / tarjeta blanca | 3,63 | 3 ✔ |
| Foco `--ring` / lienzo · tarjeta · `primary-subtle` | 4,23 · 4,84 · 3,93 | 3 ✔ |
| Texto marino / barra superior `card/90` | 14,65 | 4,5 ✔ |

### 4.3 Badges sobre el lienzo nuevo (peor caso; sobre tarjeta blanca todos suben)

| Tono | Lienzo | Tarjeta |
| --- | --- | --- |
| neutral | 6,40 | 7,26 |
| info | 5,08 | 5,77 |
| success | 4,94 | 5,59 |
| warning | 4,81 | 5,46 |
| danger | 4,74 | 5,42 |
| accent (`text-link`) | **4,60** | 5,20 |

Todos cumplen 4,5:1, pero `accent` y `danger` quedan con poco margen: no oscurecer más el lienzo sin volver a medir.

### 4.4 Acentos de contenido

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Etiqueta `muted-foreground` / cabecera de StatTile (`primary-subtle` 60 % → tarjeta) | 6,33 | 6,74 | 4,5 ✔ |
| Valor `danger` / cabecera de StatTile | 5,84 | 6,40 | 4,5 ✔ |
| Valor `warning` | 5,98 | 8,47 | 4,5 ✔ |
| Valor `success` | 5,94 | 8,18 | 4,5 ✔ |
| Valor `foreground` | 13,06 | 13,28 | 4,5 ✔ |
| Filete superior de StatTile (azul eléctrico) / tarjeta · cabecera | 4,84 · 4,28 | 3,37 (tarjeta) | 3 ✔ |
| Icono `text-link` / círculo `primary-subtle` (EmptyState) | 4,98 | 5,97 (cian) | 3 ✔ |
| Texto `foreground` / tarjeta (referencia) | — | 14,92 | 4,5 ✔ |
| `muted-foreground` / tarjeta oscura | — | 7,58 | 4,5 ✔ |
| Botón primario: blanco / `#176BEB` · hover blanco / `#145CCB` | 4,84 · 6,14 | igual | 4,5 ✔ |
| Foco `--ring` / fondo oscuro · tarjeta oscura | — | 3,75 · 3,37 | 3 ✔ |
| Borde de control / fondo oscuro · tarjeta oscura | — | 3,89 · 3,49 | 3 ✔ |

El filete degradado y la línea bajo el `h1` son **decorativos**: no transmiten información ni se
cuentan para el contraste (marino/lienzo 12,89; cian/lienzo 1,94, por eso nunca llevan texto encima).

## 5. Coherencia con Dark Tech
- El menú es oscuro en ambos temas y con la misma familia de matiz (263°): al cambiar de tema solo se
  hunde un poco el marino. Cian como acento activo en los dos.
- Fondo, tarjetas, `muted` y `primary-subtle` oscuros **no cambian**: ya tenían identidad de color.
- El degradado cambia de punto de partida (azul eléctrico en oscuro) porque el marino desaparecería.
- Verificar que en oscuro `bg-card/90` de la barra y el filete no dupliquen la línea de borde (se quitó `border-b`).

## 6. Vistas afectadas y riesgos

| Área | Impacto | Mitigación |
| --- | --- | --- |
| Todas las pantallas | Lienzo `#EBF0F7`, `muted/accent/secondary` más oscuros | Revisar tablas (`bg-muted/50` cabecera), kanban (`bg-muted/30`), `data-card-list` (`bg-muted/40`), `request-context-bar` (`surface-subtle`) |
| Login, olvidé/restablecer/activar contraseña | Usan `BrandName` con tagline del token del menú | Tagline a `text-muted-foreground` en `tone="auto"` (si no, ilegible) |
| Asistente y detalle de tarea (`SheetContent`) | Heredaban `bg-sidebar` | Base `bg-popover`; solo el menú pide `bg-sidebar` (§3.3) |
| Iconos lucide | Heredan `currentColor`; los de `muted-foreground` fijos dentro del menú (chevron de Select, icono de buscar) quedaban oscuros | Overrides listados en §3.1 |
| `Label`, `Skeleton`, `Input`, `Select` dentro del menú | Usan `foreground`/`muted`/`background` | Overrides de §3.1; revisar cada control del pie |
| Logo | Negativo siempre sobre marino; el nodo azul del wordmark queda a 3,05:1 (logo exento, es parte de la marca) | No filtrar ni recomponer |
| Forced-colors | Fondos y degradados desaparecen | Ítem activo con `Highlight/HighlightText`; filete y línea con `forced-colors:hidden`; `aria-current` ya existe |
| Impresión | No hay estilos `print:`; navegadores no imprimen fondos y el texto claro del menú saldría invisible | `print:hidden` en menú y barras |
| Reducción de movimiento | Sin animaciones nuevas | — |
| `tailwind-merge` | Nombres `sidebar-field*` deben resolverse como color | Probar `cn('border-input','border-sidebar-field-border')` en una prueba unitaria |
| Pruebas | Playwright/capturas y axe pueden fallar por contraste de fondos nuevos | Re-ejecutar e2e y actualizar capturas |

## 7. Orden de implementación (un PR por paso, cada uno compila y se prueba solo)

1. **Tokens** en `globals.css` (§2.1–2.3), **sin** tocar componentes. Comprobar que nada se rompe aún
   (el menú ya queda marino con texto claro, pero con overrides pendientes: no desplegar solo este paso).
2. **`sheet.tsx` y variante `Button sidebar`** (§3.3 y §3.6). Verificar asistente y detalle de tarea.
3. **`brand.tsx`** con `tone` y tagline (§3.1). Verificar login y pantallas de carga/error.
4. **`app-sidebar.tsx`**: ítems, grupos, buscador (con «Limpiar»), pie, riel, aviso y esqueletos. Probar
   expandido, riel, buscando, sin permisos, error y cajón.
5. **Barras** (`app-shell.tsx`, `mobile-nav.tsx`): fondo `card/90` y filete. `ThemeToggle tone`.
6. **Contenido**: `PageHeader`, `StatTile/StatStrip`, `EmptyState`, `Button outline`.
7. **Lienzo y superficies** (§2.2): cambio de valores y revisión visual de tablas, kanban y tarjetas
   móviles. Último paso a propósito: es el más visible y el que depende de la aprobación del HEX.
8. **Cierre**: `print:hidden`, forced-colors, axe en claro y oscuro, capturas; actualizar la tabla del
   steering 25, `docs/aplicacion/frontend-pantallas.md` y `changelog.json`. Sin cambios de API, contrato ni MCP.

## 8. Preguntas abiertas
- ¿Se aprueba apartar el lienzo del HEX maestro (`#EBF0F7`)? Si no, el paso 7 se omite.
- ¿Se quiere explorar la opción C (barra superior marino) tras ver B en producción?
