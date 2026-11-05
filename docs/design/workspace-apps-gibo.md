# Workspace GIBO con selector de aplicaciones

Especificación visual (rol Diseñador). No toca código de la aplicación. Introduce el «workspace GIBO»:
un portal único con selector de aplicaciones donde cada app tiene su menú. La app actual pasa a ser la
primera, **Demanda**. Más adelante vendrán Service Desk y otras, así que el diseño debe verse bien con
**una** app y escalar a 5-8.

Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md` y `docs/design/identidad-color-menu.md`
(menú marino `fixed z-40`, barras superiores `sticky z-30` con filete `bg-brand-gradient`, ítem activo con
`--sidebar-active`, `variant="sidebar"` sobre el menú, overlays `z-50`, riel `rail:`, cajón móvil).
Todos los contrastes de este documento están **medidos** (WCAG 2.2, luminancia relativa sRGB, colores
translúcidos compuestos sobre su fondo real). Los que ya figuran en `identidad-color-menu.md` se citan
como tales; los nuevos se midieron para este documento con los valores actuales de `globals.css`.

Sin cambios de API, contrato ni MCP: es una capa de presentación y de metadatos de navegación en
`apps/web`.

## 1. Decisiones de diseño (resumen)

| # | Tema | Decisión | Por qué |
| --- | --- | --- | --- |
| 1 | Dónde vive el selector | **Cabecera del menú lateral**, en un bloque propio justo bajo la marca y fuera del área con scroll. No va en la barra superior. | El menú es lo que cambia con la app; el selector debe estar pegado a lo que gobierna. La barra superior ya aloja asistente, campana y usuario y en móvil no tiene espacio. |
| 2 | Estado cerrado | Botón de 48 px: baldosa con icono de la app + «Aplicación» (etiqueta) + nombre + `ChevronsUpDown`. En riel, solo la baldosa. | Un vistazo dice «dónde estoy» y «esto se puede cambiar». |
| 3 | Patrón de apertura | `DropdownMenu` de Radix (ya en `ui/`), con cada app como `DropdownMenuItem asChild` + `Link`. | Flechas, Inicio/Fin, escritura rápida, Escape, devolución de foco y portal `z-50` ya resueltos. Se conserva el enlace nativo (clic central, vista previa de URL). Descartado: `combobox`/`listbox` (no hay valor que filtrar) y `Popover` (no existe en `ui/`; habría que añadir una dependencia y reimplementar teclado). |
| 4 | Una sola app | El control **se mantiene activo** con su chevron; el panel muestra la app y «Inicio del workspace». No se deshabilita ni se oculta. | Un control deshabilitado falla contraste y confunde; ocultar el chevron mueve el diseño cuando llegue la segunda app y deja sin ruta al launcher. El panel ya aporta valor (acceso a `/aplicaciones`). |
| 5 | Launcher | Ruta nueva **`/aplicaciones`**, también con una sola app: tarjeta grande con acceso directo + accesos transversales. | Enseña el modelo de workspace desde el día uno y no obliga a rediseñar al añadir apps. |
| 6 | Logo GIBO | Con **una** app visible lleva al inicio de esa app (`/inicio`); con **dos o más** lleva a `/aplicaciones`. | Con una app, el launcher sería un clic de más en el uso diario. El acceso al launcher siempre existe por la miga «Workspace» y el panel del selector. |
| 7 | Raíz `/` | Sigue redirigiendo a `/inicio`. Tras el login, igual. | No cambia ninguna URL ni flujo actual. Revisar con ≥2 apps (punto abierto). |
| 8 | Sección «Workspace» del menú | Al fondo del menú, **plegada por defecto**; se despliega sola si la pantalla activa es transversal; en riel se ven los iconos siempre. | Son pantallas poco frecuentes; la app activa debe ser protagonista. |
| 9 | Barra superior | Migas discretas `Workspace / Demanda` a la izquierda (solo ≥1024 px). Derecha intacta. | Aprovecha el hueco vacío de la barra y da orientación sin tocar el menú. |
| 10 | Tokens | **Ningún token nuevo.** Todo con tokens semánticos existentes. | Los pares necesarios ya cumplen contraste (sección 8). |
| 11 | Iconos | `Workflow` para Demanda; `ChevronsUpDown`, `Check`, `LayoutGrid`, `ArrowRight` para el selector y el launcher. | Verificados en lucide-react 1.52.0. |

## 2. Modelo de navegación que se diseña (contexto, no se cambia)

- `navigation.ts` gana el registro `NAV_APPS` (id, nombre, icono, descripción corta, `href` de inicio,
  `moduleKey` requerido) y cada grupo del menú lleva `appId`. Las URLs no cambian.
- App **Demanda** (`id: 'demanda'`) = grupos `inicio`, `demanda`, `ejecucion`, `seguimiento`, `activos`.
- **Transversales** (sin `appId`): `gobierno` (Controles, Auditoría, Mis permisos) y `administracion`
  (Equipo, Maestras, Áreas, Procesos, Solicitantes, SMTP, Agentes de IA). Se muestran siempre, como
  sección «Workspace», bajo los grupos de la app activa.
- Una app es **visible** si el usuario tiene al menos un módulo permitido en alguno de sus grupos. Su
  `href` de inicio efectivo es el declarado si su `moduleKey` está permitido; si no, el primer ítem
  visible de la app. Así un usuario sin `dashboard` pero con `requests` entra a Solicitudes y no a un 403.
- **App activa** (regla de resolución, en este orden): (1) la app dueña del ítem activo de la ruta
  (`isNavItemActive`); (2) si la ruta es transversal o `/aplicaciones`, la **última app usada**
  (guardada en `localStorage` bajo `activeAppId`); (3) la primera app visible. Si la guardada ya no es
  visible, se descarta.
- `/aplicaciones` no tiene `moduleKey`: basta con sesión. El `RouteGuard` ya la protege (no está en
  `PUBLIC_ROUTES`).

## 3. A. Selector de aplicaciones (`AppSwitcher`)

### 3.1 Ubicación y estado cerrado, escritorio expandido (≥1024 px, menú 240 px)

```
┌──────────────────────────┐  menú marino (bg-sidebar), 240 px
│ [GIBO wordmark]      ☾   │  h-14 (sin cambios: marca + tema)
│ Governance & Data        │
├──────────────────────────┤
│ ┌──────────────────────┐ │  bloque del selector: px-2 pb-2, NO hace scroll
│ │ ▣  Aplicación      ⇕ │ │  trigger h-12, borde sidebar-field-border
│ │    Demanda           │ │  ▣ = baldosa 32 px bg-sidebar-active + icono Workflow
│ └──────────────────────┘ │  ⇕ = ChevronsUpDown
│ [🔍 Buscar pantalla…   ] │  buscador existente (BL-027)
│                          │
│  ▎ Panel del área        │  grupos de la app activa (zona con scroll)
│    Mi trabajo            │
│  …                       │
└──────────────────────────┘
```

Clases del botón (`DropdownMenuTrigger asChild` sobre un `<button>`):

```
group flex h-12 w-full items-center gap-2.5 rounded-lg border border-sidebar-field-border px-2 text-left
text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring
pointer-coarse:min-h-12 forced-colors:border-[ButtonText]
```

- **Baldosa**: `flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-active text-sidebar-accent-foreground`
  con el icono de la app en `size-[18px]`. Mismo azul que el ítem activo: el selector y el ítem activo
  comparten identidad de «lo seleccionado».
- **Texto** (`min-w-0 flex-1`): línea 1 «Aplicación» en `block text-xs leading-4 text-sidebar-muted-foreground`;
  línea 2 el nombre en `block truncate text-sm font-semibold leading-5`.
- **Chevron**: `ChevronsUpDown` `size-4 shrink-0 text-sidebar-muted-foreground`, `aria-hidden`.
- Sin fondo propio en reposo (solo borde): así el hover (`sidebar-accent`, blanco 8 %) sí se nota. El
  campo del buscador sí lleva `sidebar-field`; son controles distintos y se distinguen por el icono y la
  etiqueta.
- Cargando permisos: `Skeleton h-12 w-full rounded-lg bg-sidebar-accent` más el `role="status"` que ya
  existe en el menú. Con error o sin actor, el bloque **no se pinta** (ya hay un aviso en el menú).

### 3.2 Panel abierto (`DropdownMenuContent`)

```
┌──────────────────────────┐
│ ┌──────────────────────┐ │
│ │ ▣  Aplicación      ⇕ │ │  trigger con data-state=open (hover fijo)
│ │    Demanda           │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │  panel bg-popover, rounded-md, shadow-md, z-50
│ │ Aplicaciones         │ │  DropdownMenuLabel (text-xs, muted-foreground)
│ │ ┌─┐ Demanda        ✓ │ │  ítem activo: Check (text-link) + font-semibold
│ │ │▣│ Solicitudes,     │ │  descripción text-meta muted, máx. 2 líneas
│ │ └─┘ planificación…   │ │
│ │ ┌─┐ Service Desk     │ │  (futuro) ítem normal
│ │ │▣│ Incidencias…     │ │
│ │ ─────────────────────│ │  DropdownMenuSeparator
│ │ ▦  Inicio del        │ │  LayoutGrid → /aplicaciones
│ │    workspace         │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- Posición: `side="bottom" align="start" sideOffset={6}`. Ancho: `w-(--radix-dropdown-menu-trigger-width) min-w-64 max-w-80 p-1.5`
  (igual al trigger, mínimo 256 px). Alto: `max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto`
  para que 8 apps no se salgan.
- El panel es **claro** (`bg-popover`) incluso sobre el menú marino, igual que el menú de usuario: se
  despega por contraste y reutiliza el componente tal cual.
- **Ítem de app**: `<DropdownMenuItem asChild><Link href={homeHref} aria-describedby={descId} onClick={onNavigate} className="items-start gap-3 py-2 pointer-coarse:min-h-11">`.
  Dentro, baldosa `size-8 rounded-md bg-primary-subtle text-link` con el icono, y a su derecha
  `name` (`text-sm font-medium`, `font-semibold` si activa) y `description` (`text-meta text-muted-foreground line-clamp-2`,
  con `id={descId}`). Al final, si es la activa, `Check` `size-4 text-link` `aria-hidden`. El ítem activo
  añade `aria-current="true"` y un `<span className="sr-only">, aplicación actual</span>` en el nombre
  (no todos los lectores anuncian `aria-current` en `menuitem`).
- **Ítem de pie** «Inicio del workspace»: `LayoutGrid` + texto, `Link` a `/aplicaciones`.
- Con **una app**: etiqueta «Aplicaciones», una fila (activa), separador, «Inicio del workspace». Sin
  texto de «próximamente»: no se anuncian apps que no existen.
- El estado «activa» no usa fondo, solo `Check` y peso: `focus:bg-accent` del ítem se solaparía con un
  fondo propio.
- Al elegir una app: navega a su inicio efectivo, el menú se cierra (Radix) y se llama `onNavigate`
  (cierra el cajón en móvil). La app activa pasa a ser la del destino y se guarda como «última usada».
- Mismo ítem activo y mismo destino (la app ya activa): navega igual a su inicio; no hay caso especial.

### 3.3 Riel contraído (56 px)

```
┌────┐
│ ◎  │  isotipo (BrandMark inverse)
├────┤
│ ▣  │  trigger size-10 (solo baldosa), tooltip «Aplicación: Demanda»
│    │
│ ▎◫ │  iconos de la app
│  …  │
├────┤  border-t sidebar-border
│ ⛨  │  iconos transversales (sección Workspace)
└────┘
```

- Trigger: `size-10 rounded-lg` centrado, solo la baldosa (`size-8`), sin borde ni texto. Nombre accesible
  por `aria-label="Aplicación: Demanda. Cambiar de aplicación"`. Tooltip con `LabelTooltip label="Aplicación: Demanda" side="right"`.
- El panel se abre **a la derecha**: `side="right" align="start" sideOffset={8}` y ancho fijo `w-72`
  (no puede heredar los 40 px del trigger). Mismo contenido que expandido.
- Clase de ancho condicional: `rail:w-72 rail:min-w-0` sobre `DropdownMenuContent` no funciona porque
  el contenido está en un portal fuera de `[data-sidebar]`. El componente lee `isRail` (hook
  `useSidebarMode`) y pasa `side`/`className` por JS.

### 3.4 Cajón móvil (< 1024 px)

```
┌─────────────────────────┐ 288 px (w-72, max 85vw), bg-sidebar
│ [GIBO]              ✕   │ h-14, pr-12 reservado al cerrar
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ ▣  Aplicación     ⇕ │ │ mismo trigger que escritorio expandido
│ │    Demanda          │ │ pointer-coarse:min-h-12 (48 px)
│ └─────────────────────┘ │
│ [🔍 Buscar pantalla…  ] │
│  …                      │
```

- Siempre expandido (como el resto del cajón). El panel se abre **hacia abajo** (`side="bottom"`,
  `collisionPadding={8}`), ancho = trigger, con `z-50` por encima del cajón (ambos son `z-50`; el portal
  del menú va después en el DOM, así que queda encima). Verificar en e2e.
- Elegir una app llama `onNavigate` → se cierra el cajón completo.
- La barra superior móvil **no** muestra el nombre de la app (no cabe junto a asistente, campana, tema y
  usuario en 360 px). El `h1` de cada página y el cajón dan el contexto.

### 3.5 Teclado y foco

| Acción | Resultado |
| --- | --- |
| Tab hasta el trigger | Foco con outline cian `sidebar-ring` (6.64:1 claro / 8.69:1 oscuro sobre el menú). Orden: logo → tema → **selector** → buscador → menú → pie. |
| Enter, Espacio o ↓ | Abre y enfoca el primer ítem (↑ enfoca el último). |
| ↑ ↓ / Inicio / Fin | Mueve el foco entre ítems (sin circular por defecto de Radix: se activa `loop`). |
| Escribir letras | Salto al ítem cuyo texto empieza así (typeahead de Radix). |
| Enter | Activa el enlace. |
| Esc | Cierra y devuelve el foco al trigger. |
| Tab | Cierra el menú y sigue el recorrido (comportamiento de Radix). |

Con `prefers-reduced-motion`, el panel no anima (ver sección 10).

## 4. B. Inicio del workspace (launcher) en `/aplicaciones`

### 4.1 Estructura

Se renderiza dentro de `AppShell` (menú + barras). El menú muestra la **última app usada** y ningún
ítem activo; el selector sigue disponible. Contenido (`main`, ancho completo del shell como el resto de
páginas, sin `max-w` propio):

```
Workspace                                        ← miga (barra superior)
┌──────────────────────────────────────────────────────────┐
│ Hola, Ana                                                │ PageHeader (único h1)
│ Elige la aplicación con la que quieres trabajar.         │
│ ──                                                       │ línea degradada (la pone PageHeader)
└──────────────────────────────────────────────────────────┘

Tus aplicaciones                                   ← h2 text-base font-semibold
┌──────────────────────────────────────────────────────────┐
│ ┌────┐                                                   │ UNA app: tarjeta grande (featured)
│ │ ▣  │  Demanda                       [ Abrir Demanda → ]│ tile size-14, h3 text-xl font-heading
│ └────┘  Solicitudes, triage, priorización,               │ descripción text-sm muted
│         planificación, capacidad e indicadores.          │
└──────────────────────────────────────────────────────────┘

Accesos del workspace                              ← h2
┌──────────────────────────────────────────────────────────┐
│ Gobierno                                                 │ h3 text-xs font-semibold muted
│ [⛨ Controles] [📜 Auditoría] [🔑 Mis permisos]           │ grid de enlaces compactos
│ Administración                                           │
│ [👤 Equipo y permisos] [☰ Maestras] [🗂 Áreas] …        │
└──────────────────────────────────────────────────────────┘
```

Con **varias apps** (3 en el ejemplo; hasta 8):

```
Tus aplicaciones
┌──────────────┐ ┌──────────────┐ ┌──────────────┐   grid gap-4 sm:grid-cols-2 xl:grid-cols-3
│ ▣            │ │ ▣            │ │ ▣            │
│ Demanda      │ │ Service Desk │ │ …            │
│ Descripción  │ │ Descripción  │ │              │
│ Abrir →      │ │ Abrir →      │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

### 4.2 Tarjeta de aplicación (`AppCard`)

- Contenedor `<li>` dentro de `<ul aria-label="Aplicaciones disponibles">`. Tarjeta:
  `group relative flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-card transition-colors hover:border-border-strong has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring forced-colors:border-[ButtonText]`.
  Es el mismo lenguaje que `Card` (`rounded-xl`, `shadow-card`, borde casi invisible).
- **Enlace extendido** (stretched link): el título es un `<Link>` con
  `after:absolute after:inset-0 after:content-[''] focus-visible:outline-none` y `<h3>` que lo envuelve. Así
  toda la tarjeta es clicable con **un solo** enlace, sin anidar enlaces; el foco se dibuja en la tarjeta
  (`has-focus-visible`). Nombre accesible del enlace: el nombre de la app; la descripción se asocia con
  `aria-describedby`.
- **Baldosa**: `flex size-12 items-center justify-center rounded-xl bg-primary-subtle text-link` con el
  icono `size-6`, `aria-hidden`.
- **Nombre**: `text-base font-semibold` (en la tarjeta grande, `text-xl font-bold` con la fuente de
  titulares `font-heading`). **Descripción**: `text-sm text-muted-foreground`.
- **Pie**: texto «Abrir» + `ArrowRight` `size-4` en `text-link`, `mt-auto`, con
  `group-hover:underline`. `ArrowRight` desplaza `translate-x-0.5` en hover con `motion-reduce:transition-none motion-reduce:transform-none`.
- **Tarjeta grande** (una sola app visible): `lg:flex-row lg:items-center lg:gap-5 lg:p-6`; baldosa
  `size-14`; a la derecha un falso botón primario `span` `bg-primary text-primary-foreground rounded-md h-10 px-4 text-sm font-medium`
  con «Abrir Demanda» y `ArrowRight` (es decorativo; el enlace real es el título). En móvil se apila y el
  falso botón pasa a ancho completo.
- Hover: solo cambia el borde a `border-strong`. No hay elevación animada (mantiene la sobriedad del
  portal y evita saltos de layout).

### 4.3 Accesos del workspace (transversales)

- `Card` con `CardHeader` (título h2 «Accesos del workspace», descripción «Disponibles desde cualquier
  aplicación.») y contenido por subgrupo (`Gobierno`, `Administración`, solo los que tengan ítems
  visibles).
- Cada subgrupo: `<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">` y
  `<ul class="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">`. Cada ítem es un enlace
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11`
  con su icono (`size-4 text-link`) y la etiqueta. Mismos iconos y textos que el menú.
- Si el usuario no tiene ningún módulo transversal, la tarjeta completa se **omite** (no se muestra
  vacía).

### 4.4 Estados

| Estado | Qué se ve |
| --- | --- |
| **Loading** (`permState` cargando o identidad sin leer) | `PageHeader` con título «Aplicaciones» (sin saludo todavía) y descripción fija. Bajo él, `role="status"` con texto `sr-only` «Cargando aplicaciones…» y `2` esqueletos `Skeleton h-36 rounded-xl` en el mismo grid. Sin spinner. |
| **Éxito, 1 app** | Tarjeta grande + accesos del workspace. |
| **Éxito, ≥2 apps** | Grid de tarjetas + accesos del workspace. |
| **Vacío** (sin apps visibles) | `Card` con `EmptyState` (icono `LayoutGrid`): título «No tienes aplicaciones habilitadas», descripción «Pide acceso al jefe de área para empezar a trabajar en GIBO.». Sin acción. Si hay módulos transversales, la tarjeta «Accesos del workspace» se sigue mostrando debajo. |
| **Error** (permisos no cargaron) | `Card` con `EmptyState` (icono `TriangleAlert`), `role="alert"`: «No fue posible cargar tus aplicaciones», descripción «Revisa tu conexión e inténtalo de nuevo.», acción `Button variant="outline"` «Reintentar» (llama `reload` de `useActor`). |
| **Sin usuario (dev-header)** | `EmptyState` (icono `UserRound`): «Elige un usuario para ver tus aplicaciones», descripción «Usa «Usuario actual (dev)», al final del menú lateral.». |
| **Sesión sin leer (jwt)** | Igual que loading. |

### 4.5 Saludo

`PageHeader title`: en `jwt`, «Hola, {primer nombre}» (primer token de `authUser.name`); en `dev-header` o sin
nombre, «Bienvenido a GIBO». Descripción: «Elige la aplicación con la que quieres trabajar.». El saludo no
usa la hora del día (evita zonas horarias y textos distintos entre capturas).

### 4.6 Responsive

- ≥1280: 3 columnas. 640-1279: 2 columnas. <640: 1 columna.
- Tarjeta grande: fila desde 1024; apilada por debajo.
- Los accesos del workspace pasan de 4 a 3, 2 y 1 columnas.
- Objetivos táctiles de 44 px (`pointer-coarse:min-h-11`) en tarjetas y accesos.

## 5. C. Menú lateral con contexto de app (`AppSidebar`)

### 5.1 Orden vertical (expandido)

```
[marca]  [tema]                   h-14 (sin cambios)
[AppSwitcher]                     bloque nuevo, fuera del scroll
┌ nav "Navegación principal" (scroll) ───────────────┐
│ [Buscar pantalla…]                                 │  igual que hoy
│  ▎ Panel del área     ← grupo de entrada (sin título)
│    Mi trabajo
│    Actividades recurrentes
│  DEMANDA ⌄ …           grupos de la app activa (plegables, como hoy)
│  EJECUCIÓN ⌄ …
│  SEGUIMIENTO ⌄ …
│  ACTIVOS Y CONOCIMIENTO ⌄ …
│ ────────────────────── border-t sidebar-border, mt-4 pt-3
│  ▦ WORKSPACE ⌄          sección plegable (cerrada por defecto)
│    Gobierno             (subtítulo no plegable, ver abajo)
│      Controles / Auditoría / Mis permisos
│    Administración
│      Equipo y permisos / Maestras / … (7 ítems)
└────────────────────────────────────────────────────┘
[footer: contraer menú / usuario dev]
```

Con la sección **cerrada** (estado por defecto), lo último visible es la fila:

```
 ────────────────────────
  ▦ WORKSPACE            ⌄
```

### 5.2 Sección «Workspace»

- Contenedor `div` con `mt-4 border-t border-sidebar-border pt-3` (en riel: `rail:mt-2 rail:pt-2`).
- **Cabecera**: botón idéntico a los títulos de grupo actuales (`text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground hover:text-sidebar-foreground`,
  `aria-expanded`, `aria-controls`), con `LayoutGrid` `size-3.5 mr-1.5` a la izquierda y `ChevronDown` a la
  derecha (rota -90° plegado, con `motion-reduce:transition-none`). El icono distingue «Workspace» de
  los grupos de la app, que no llevan icono.
- **Contenido**: dos bloques, `Gobierno` y `Administración`. Dentro de la sección **no son plegables**
  (evita dos niveles de pliegue): son subtítulos `block px-2.5 pt-2 pb-1 text-xs font-medium text-sidebar-muted-foreground`
  (sin mayúsculas, para diferenciarse de los títulos de grupo) seguidos de su `ul` con `NavLink`.
  Cada `ul` lleva `aria-labelledby` del subtítulo.
- **Pliegue por defecto**: cerrada. Se despliega automáticamente (una vez por ruta, como hoy) cuando el
  ítem activo es transversal. Se persiste con el mecanismo de `useCollapsedNavGroups` usando el id
  `workspace`. Como ese hook hoy interpreta «sin valor» como «todo abierto», debe distinguir «sin
  valor» (aplica el defecto: `workspace` plegado) de «lista vacía» (el usuario abrió todo; se guarda el
  centinela `-`). Detalle en sección 11.
- Si el usuario **no tiene ninguna app visible** pero sí módulos transversales: no hay selector ni
  grupos de app; la sección «Workspace» se muestra **abierta y sin botón de pliegue** (título estático).
- Si no hay módulos transversales visibles: la sección no se pinta (ni su separador).

### 5.3 Buscador de pantallas (BL-027)

- Sigue buscando en **todo lo visible**: se alimenta con `getVisibleNavGroups(allowed)` completo
  (grupos de **todas** las apps visibles + transversales), no solo los de la app activa.
- El texto de búsqueda sigue siendo `grupo + etiqueta` (no se añade el nombre de la app al texto
  buscable para no cambiar los resultados de BL-027 ni sus pruebas; punto abierto 3).
- La pista (`hint`) de cada resultado: el título de su grupo, como hoy. Si el ítem pertenece a **otra
  app** distinta de la activa, la pista es `{App} · {Grupo}` (ejemplo «Service Desk · Tickets»).
  Truncada con `truncate`; el nombre accesible del enlace incluye la pista.
- Al elegir un resultado de otra app, la navegación cambia la app activa por la regla de la sección 2 y
  el menú se repinta con esa app.
- **Corrección obligatoria en `NavLink`**: la pista y la insignia (`item.badge`) usan
  `text-sidebar-muted-foreground`, que sobre el ítem activo (`bg-sidebar-active` = `--primary`) mide
  **2.59:1** y no cumple 4.5:1. Cuando el ítem está activo, ambas pasan a
  `text-sidebar-accent-foreground` (blanco sobre `--primary`: 4.84:1) y el borde de la insignia a
  `border-sidebar-accent-foreground/60`.

### 5.4 Riel (56 px)

- Selector: solo baldosa (sección 3.3).
- Grupos de la app: iconos con separador `border-t` entre grupos, como hoy.
- Sección Workspace: el plegado **no aplica** (igual que el de los grupos). Se ve un separador algo
  más marcado (`rail:border-t rail:border-sidebar-border rail:mt-2 rail:pt-2`, el mismo token) y los
  iconos de los 10 ítems transversales. Cada uno con tooltip a la derecha. La cabecera y los subtítulos
  quedan `rail:sr-only`; la sección conserva su nombre accesible «Workspace» vía `aria-label` del `div role="group"`.
- Con 10 + ~19 iconos el riel hace scroll vertical; ya existe `nav-scroll-shadow` que lo indica.
- Alternativa descartada: un único botón «Workspace» con flyout. Duplica el patrón de apertura y añade
  una capa de foco; no compensa por 10 enlaces.

### 5.5 Cajón móvil

Misma estructura que el expandido: selector bajo la marca, buscador, grupos de la app, sección
Workspace plegada. El estado de pliegue se comparte con el escritorio (misma clave de almacenamiento).

### 5.6 Logo

`Link` de la marca: `href` = inicio efectivo de la única app visible si hay una; `/aplicaciones` si hay
dos o más o ninguna. Nombre accesible «GIBO» (sin cambios). Sin app visible el destino es el launcher
(que explica el estado vacío).

## 6. D. Barra superior (`AppShell`)

### 6.1 Escritorio (≥1024 px, h-12)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Workspace › Demanda                      [✦ Asistente] [🔔] [👤 Ana ⌄]│
└═══════════════════════════ filete degradado (2 px, intacto) ══════════┘
```

- Cambio de clases de la barra: `justify-end` → `justify-between`. El grupo derecho (`AssistantTrigger`,
  `NotificationBell`, `UserMenu`) se envuelve en un `div flex items-center gap-2`. El filete degradado
  `bg-brand-gradient`, `sticky z-30`, `bg-card/90 backdrop-blur` **no se tocan**.
- **Migas** (`WorkspaceCrumbs`): `<nav aria-label="Ubicación en el workspace"><ol class="flex min-w-0 items-center gap-1.5 text-meta">`.
  - «Workspace»: `Link` a `/aplicaciones`, `text-muted-foreground hover:text-foreground hover:underline underline-offset-4`.
  - Separador `ChevronRight` `size-3 text-muted-foreground`, `aria-hidden`.
  - Segundo nivel, según el contexto: nombre de la **app activa** con `Link` a su inicio y
    `font-medium text-foreground`; en una pantalla transversal, el título del grupo transversal
    («Gobierno» o «Administración») como texto sin enlace; en `/aplicaciones`, solo «Workspace» como
    texto con `aria-current="page"`.
  - Foco `outline-2 outline-offset-2 outline-ring`, `rounded-sm`.
- Por qué sí migas: la barra tiene todo el lado izquierdo vacío; dos niveles muy discretos dan
  orientación y llevan al launcher en un clic aunque el menú esté en riel. No sustituye a las migas de
  `PageHeader` (que describen la jerarquía de la página). Se evita la duplicación visual porque esta
  nav es de una sola línea, en el color más atenuado y fuera del contenido.
- En pantallas transversales el selector del menú sigue mostrando la última app (el menú conserva su
  contexto) mientras la miga dice «Workspace › Administración». Es intencional: la miga dice dónde está
  la página; el selector, qué menú de app se usa.
- Se oculta con `hidden lg:flex` (la barra móvil es otro componente).

### 6.2 Móvil (< 1024 px, h-14)

Sin cambios visibles: botón de menú, marca, asistente, campana, tema y usuario. No se añaden migas
(no caben). El contexto está en el selector del cajón.

## 7. Tema claro y oscuro: qué cambia y qué no

El layout es idéntico. El menú es marino en ambos temas, así que el selector (trigger y baldosa) se ve
igual; solo se hunde el fondo del menú (`#0F2557` claro, `#030D24` oscuro). Cambian el panel del selector
(`bg-popover`: blanco en claro, superficie marina en oscuro), las tarjetas del launcher y la barra.

| Elemento | Claro | Oscuro |
| --- | --- | --- |
| Trigger del selector | Borde blanco 45 % sobre marino | Igual sobre marino profundo |
| Baldosa del trigger | `--sidebar-active` (= azul eléctrico) con icono blanco | Igual |
| Panel del selector | `bg-popover` blanco, texto marino | `bg-popover` marino claro, texto casi blanco |
| Baldosa dentro del panel y del launcher | `primary-subtle` `#D9E9FF` + icono `text-link` azul | `primary-subtle` marino + icono `text-link` cian |
| Tarjeta del launcher | `bg-card` blanco sobre lienzo `#EBF0F7`, `shadow-card` | `bg-card` marino claro sobre fondo `#08152E`, sombra más densa |
| Foco fuera del menú | `--ring` azul | `--ring` azul |

## 8. E. Tokens, contraste e iconografía

### 8.1 Tokens

**No hay tokens nuevos.** Se usan: `sidebar`, `sidebar-foreground`, `sidebar-muted-foreground`,
`sidebar-accent`, `sidebar-accent-foreground`, `sidebar-active`, `sidebar-border`, `sidebar-field-border`,
`sidebar-ring`, `popover`, `popover-foreground`, `accent`, `card`, `card-foreground`, `primary`,
`primary-foreground`, `primary-subtle`, `foreground`, `muted-foreground`, `link`, `border`,
`border-strong`, `ring`, `bg-brand-gradient`, `shadow-card`. Prohibido cualquier color crudo.

### 8.2 Contraste medido (WCAG 2.2 AA)

Umbral: texto normal ≥ 4.5:1; iconos informativos, bordes de control y foco ≥ 3:1.

**Selector en el menú marino** (`#0F2557` claro / `#030D24` oscuro). Valores de
`identidad-color-menu.md` §4.1 salvo donde se indica «medido aquí».

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Nombre de app (`sidebar-foreground`) / menú | 12.41 | 16.25 | 4.5 ✔ |
| «Aplicación» y chevron (`sidebar-muted-foreground`) / menú | 7.91 | 10.36 | 4.5 ✔ |
| Nombre / trigger en hover o abierto (`sidebar-accent`) | 9.92 | 13.62 | 4.5 ✔ |
| Etiqueta / trigger en hover o abierto | 6.33 | 8.69 | 4.5 ✔ |
| Borde del trigger (`sidebar-field-border`) / menú (medido aquí) | 4.10 | 4.49 | 3 ✔ |
| Icono blanco / baldosa `sidebar-active` (medido aquí) | 4.84 | 4.84 | 3 ✔ |
| Baldosa / menú (decorativa, no lleva información) | 3.05 | 3.99 | 3 ✔ |
| Foco cian / menú | 6.64 | 8.69 | 3 ✔ |
| (corrección 5.3) `sidebar-muted-foreground` / ítem activo `--primary` (medido aquí) | **2.59** ✘ | **2.59** ✘ | 4.5: se cambia a blanco |
| Blanco / ítem activo `--primary` | 4.84 | 4.84 | 4.5 ✔ |

**Panel del selector (`bg-popover`)** (medido aquí):

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Nombre (`foreground`) / popover | 14.75 | 14.13 | 4.5 ✔ |
| Descripción y etiqueta «Aplicaciones» (`muted-foreground`) / popover | 7.13 | 7.19 | 4.5 ✔ |
| `Check` y baldosa (`text-link`) / popover | 6.14 | 6.93 | 3 ✔ |
| Icono `text-link` / baldosa `primary-subtle` | 4.98 | 5.99 | 3 ✔ |
| Nombre / ítem enfocado (`accent`) | 11.83 | 12.80 | 4.5 ✔ |
| Descripción / ítem enfocado | 5.72 | 6.51 | 4.5 ✔ |

**Launcher y migas** (medido aquí):

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| Nombre de app (`foreground`) / tarjeta | 14.75 | 14.98 | 4.5 ✔ |
| Descripción (`muted-foreground`) / tarjeta | 7.13 | 7.62 | 4.5 ✔ |
| «Abrir» y flecha (`text-link`) / tarjeta | 6.14 | 7.35 | 4.5 ✔ |
| Blanco / falso botón `--primary` (tarjeta grande) | 4.84 | 4.84 | 4.5 ✔ |
| Foco `--ring` / tarjeta | 4.84 | 3.37 | 3 ✔ |
| Foco `--ring` / lienzo (migas y tarjetas, fuera de tarjeta) | 4.22 | 3.75 | 3 ✔ |
| Borde en hover (`border-strong`) / tarjeta | 3.64 | 3.51 | 3 ✔ |
| Migas: `muted-foreground` / tarjeta (la barra es `card/90`) | 7.13 | 7.62 | 4.5 ✔ |
| Migas: `foreground` / tarjeta | 14.75 | 14.98 | 4.5 ✔ |
| Texto del acceso (`foreground`) sobre hover `accent` | 11.83 | 12.80 | 4.5 ✔ |
| Icono `text-link` sobre hover `accent` | 4.93 | 6.28 | 3 ✔ |

El borde de la tarjeta en reposo (`--border`, 9 %) **no** se cuenta como componente UI: la tarjeta se
identifica por su título enlazado y el foco; no depende del borde para entenderse.

### 8.3 Iconografía (lucide-react 1.52.0, verificada)

| Uso | Icono |
| --- | --- |
| App **Demanda** | `Workflow` (flujo de la demanda hasta la ejecución). Evita `Inbox` (ya es «Solicitudes») y `ListTodo` (Mi trabajo). |
| Chevron del trigger | `ChevronsUpDown` |
| App activa en el panel | `Check` |
| Inicio del workspace / sección Workspace | `LayoutGrid` |
| Abrir (launcher) | `ArrowRight` |
| Vacío / error del launcher | `LayoutGrid` / `TriangleAlert` (ya usado en el proyecto) |
| Futuras (propuesta, sin implementar) | Service Desk `Headset`; el resto se decide al crearlas |

Todos `aria-hidden`, `size-4` salvo la baldosa (18 px en el trigger, 20 px en el panel, 24 px en la tarjeta,
28 px en la tarjeta grande).

## 9. F. Accesibilidad

| Tema | Decisión |
| --- | --- |
| **Patrón** | Disparador (`button`, `aria-haspopup="menu"`, `aria-expanded`) + `menu` con `menuitem` que son enlaces (`asChild`). Es la opción más simple con lo que ya hay en `ui/`. Aunque la guía WAI-ARIA prefiere un *disclosure* para navegación, un conmutador de contexto con pocos destinos y teclado de menú es un patrón de uso común (cuentas, organizaciones) y evita añadir `Popover`. Se compensa manteniendo `Link` real, `aria-current` y texto accesible del estado. |
| **Nombre del trigger** | Por contenido: «Aplicación Demanda». En riel, `aria-label="Aplicación: Demanda. Cambiar de aplicación"`. |
| **Nombre del menú** | Radix lo vincula al trigger (`aria-labelledby`), así que el menú se anuncia «Aplicación Demanda, menú». |
| **App activa** | `aria-current="true"` + `Check` visual + `<span class="sr-only">, aplicación actual</span>`. No depende solo del color: hay icono y peso tipográfico. |
| **Descripción** | `aria-describedby` apunta a la descripción de cada ítem (no entra en el nombre, que se mantiene corto). |
| **Foco** | Cian `sidebar-ring` dentro del menú, `--ring` fuera. `outline-2` siempre. El trigger usa `outline-offset-2` porque su bloque no está recortado por el scroll del `nav`. Tras cerrar con Esc, el foco vuelve al trigger. |
| **Orden de tabulación** | Escritorio: omitir contenido → logo → tema → selector → buscador → menú → sección Workspace → pie → contenido. En el contenido de `/aplicaciones`: migas de la barra → … → tarjetas en orden de DOM → accesos del workspace. |
| **`aria-current="page"`** | Solo en el ítem de menú de la página actual (como hoy) y en la miga «Workspace» dentro de `/aplicaciones`. El enlace de la app en el selector **no** lleva `aria-current="page"` (lleva `"true"`). |
| **Landmarks** | `aside[aria-label="Menú lateral"]` y `nav[aria-label="Navegación principal"]` sin cambios. Las migas son `nav[aria-label="Ubicación en el workspace"]` (distinto del `nav` de `PageHeader`, «Ruta de navegación»). El selector queda dentro del `aside`, antes del `nav`. |
| **Sección Workspace** | Botón con `aria-expanded` y `aria-controls`; el contenido son dos `ul` con `aria-labelledby`. En riel, `div role="group" aria-label="Workspace"`. |
| **Launcher** | Un solo `h1` (`PageHeader`), `h2` por sección, `h3` por tarjeta de app y por subgrupo. Lista `ul aria-label="Aplicaciones disponibles"`. Loading con `role="status"`, error con `role="alert"`. |
| **Reduced motion** | El chevron de pliegue y la flecha de la tarjeta llevan `motion-reduce:transition-none`. `DropdownMenuContent` añade `motion-reduce:animate-none` (cambio en el componente compartido; beneficia al menú de usuario y a las acciones de fila). Los esqueletos ya paran con `motion-reduce:animate-none`. |
| **forced-colors** | Trigger y tarjetas: `forced-colors:border-[ButtonText]`. Ítem activo del menú sigue con `Highlight/HighlightText`. Baldosas y degradados pierden fondo y el icono se ve con `currentColor`; el texto «Aplicación»/«Abrir» mantiene el significado. El filete de la barra ya es `forced-colors:hidden`. |
| **Lectores de pantalla** | Al abrir: «Aplicación Demanda, menú». Ítem: «Demanda, aplicación actual, enlace» + descripción. Cambio de app: la navegación mueve el foco a `main#contenido` por el comportamiento ya existente del portal; el `h1` nuevo anuncia dónde se está. |
| **Táctil** | Trigger 48 px, ítems del panel 44 px, accesos del workspace 44 px (`pointer-coarse:min-h-11`). |
| **Zoom 200 % / 320 px** | Las tarjetas se apilan; los nombres de app hacen `truncate` en el trigger y `line-clamp-2` en descripciones; ningún texto desborda (`min-w-0`). |

Limitación declarada: esta especificación cumple WCAG 2.2 AA en lo medible; la validación completa
requiere pruebas manuales con NVDA/JAWS/VoiceOver y revisión experta.

## 10. G. Copy en español

| Dónde | Texto |
| --- | --- |
| Etiqueta del trigger | Aplicación |
| Nombre accesible del trigger en riel | Aplicación: {nombre}. Cambiar de aplicación |
| Tooltip del trigger en riel | Aplicación: {nombre} |
| Etiqueta del panel | Aplicaciones |
| Ítem activo (solo lector) | , aplicación actual |
| Pie del panel | Inicio del workspace |
| Cabecera de sección del menú | Workspace |
| Subtítulos de la sección | Gobierno · Administración |
| Pista de resultado de búsqueda de otra app | {App} · {Grupo} |
| Migas | Workspace › {App \| Gobierno \| Administración} |
| Landmark de migas | Ubicación en el workspace |
| `h1` del launcher | Hola, {nombre} · Bienvenido a GIBO (sin nombre) · Aplicaciones (cargando) |
| Descripción del launcher | Elige la aplicación con la que quieres trabajar. |
| `h2` de apps | Tus aplicaciones |
| `aria-label` de la lista | Aplicaciones disponibles |
| Pie de tarjeta | Abrir · (tarjeta grande) Abrir {App} |
| `h2` de transversales | Accesos del workspace |
| Descripción de transversales | Disponibles desde cualquier aplicación. |
| Descripción de **Demanda** | Solicitudes, triage, priorización, aprobaciones, planificación, capacidad, portafolio, indicadores, seguimiento, activos y documentos. |
| Descripción corta usada en el panel (≤ 70 car.) | Solicitudes, planificación, portafolio e indicadores. |
| Cargando (lector) | Cargando aplicaciones… |
| Vacío, título | No tienes aplicaciones habilitadas |
| Vacío, descripción | Pide acceso al jefe de área para empezar a trabajar en GIBO. |
| Error, título | No fue posible cargar tus aplicaciones |
| Error, descripción | Revisa tu conexión e inténtalo de nuevo. |
| Error, acción | Reintentar |
| Sin usuario (dev) | Elige un usuario para ver tus aplicaciones · Usa «Usuario actual (dev)», al final del menú lateral. |
| Título de la pestaña | Aplicaciones |

Dos descripciones por app: `description` (larga, launcher) y `shortDescription` (panel del selector, 2 líneas
máx.). Si se prefiere un solo campo, usar la corta en ambos sitios (punto abierto 6).

## 11. H. Componentes

### 11.1 `lib/navigation.ts` (módulo puro, sigue cargable en Node)

```ts
export type AppId = 'demanda'; // ampliable: 'servicedesk' | …

export interface NavApp {
  id: AppId;
  name: string;               // «Demanda»
  icon: LucideIcon;           // Workflow
  description: string;        // launcher
  shortDescription: string;   // panel del selector
  homeHref: string;           // '/inicio'
  moduleKey: ModuleKey;       // 'dashboard': módulo de la pantalla de inicio
}

export const NAV_APPS: readonly NavApp[];

// NavGroup gana: appId?: AppId  // ausente = transversal (workspace)

export function getVisibleNavApps(allowed: ReadonlySet<string>): NavApp[]; // ≥1 módulo permitido en sus grupos
export function getAppHomeHref(app: NavApp, allowed: ReadonlySet<string>): string; // fallback: primer ítem visible
export function getAppGroups(groups: readonly NavGroup[], appId: AppId): NavGroup[];
export function getWorkspaceGroups(groups: readonly NavGroup[]): NavGroup[];      // sin appId
export function resolveActiveApp(
  pathname: string, apps: readonly NavApp[], groups: readonly NavGroup[], lastAppId: AppId | null,
): NavApp | null;                                                                   // regla de la sección 2
// searchNavItems y isNavItemActive no cambian de firma.
```

### 11.2 Nuevos

| Componente | Archivo | Props | Reutiliza |
| --- | --- | --- | --- |
| `AppSwitcher` | `components/app-switcher.tsx` (cliente) | `apps: NavApp[]`, `activeApp: NavApp`, `homeHrefFor: (app) => string`, `isRail: boolean`, `variant: 'desktop' \| 'drawer'`, `onNavigate?: () => void` | `DropdownMenu*` (ui), `LabelTooltip`, `Link`, `cn`, iconos |
| `WorkspaceCrumbs` | `components/workspace-crumbs.tsx` (cliente) | `context: { kind: 'launcher' } \| { kind: 'app'; app: NavApp; href: string } \| { kind: 'workspace'; groupLabel: string }` | `Link`, `ChevronRight` |
| `AppLauncherView` | `app/aplicaciones/aplicaciones-view.tsx` (cliente) | sin props; lee `useActor()` | `PageHeader`, `Card/CardHeader/CardTitle/CardDescription`, `EmptyState`, `Button`, `Skeleton` |
| `AppCard` | mismo archivo | `app: NavApp`, `href: string`, `featured?: boolean` | tokens de `Card` (clases), lucide |
| `WorkspaceLinks` | mismo archivo | `groups: NavGroup[]` | `Card`, `Link` |
| Página | `app/aplicaciones/page.tsx` (servidor) | `metadata = { title: 'Aplicaciones' }`; renderiza `<AppLauncherView />` | patrón de `app/inicio/page.tsx` |
| Hook | `lib/use-active-app.ts` | `useLastAppId(): [AppId \| null, (id) => void]` sobre `createLocalPrefStore`, clave `activeAppId`, lectura segura con `try/catch` | `local-pref-store` |

### 11.3 Modificados

| Archivo | Cambio |
| --- | --- |
| `components/app-sidebar.tsx` | Calcula `visibleApps`, `activeApp`, grupos de la app y `workspaceGroups`. Pinta `AppSwitcher` entre la cabecera y el `nav`. El `nav` pinta los grupos de la app y la sección «Workspace». El buscador sigue usando `visibleGroups` completo. El logo recibe `href` condicional (sección 5.6). `NavLink`: corrección de contraste en pista e insignia (5.3). Registra la app activa con `useLastAppId` cuando la ruta pertenece a una app. |
| `components/mobile-nav.tsx` | Sin cambios de código: el cajón monta `AppSidebar variant="drawer"` que ya incluye el selector. |
| `components/app-shell.tsx` | La barra superior pasa a `justify-between` y gana `WorkspaceCrumbs` a la izquierda (necesita ser cliente o delegar en un hijo cliente: `WorkspaceCrumbs` ya lo es). |
| `lib/use-collapsed-nav-groups.ts` | Soporta defecto «plegado» para `workspace` y el centinela `-` (sección 5.2). |
| `components/ui/dropdown-menu.tsx` | `DropdownMenuContent`: añadir `motion-reduce:animate-none`. Nada más. |
| `components/brand.tsx` | Sin cambios. |
| `docs/aplicacion/frontend-pantallas.md` y `changelog.json` | Al implementar: pantalla `/aplicaciones` y cambios del menú. Sin tocar contrato ni MCP. |

### 11.4 Reglas de uso de `ui/`

- El selector **no** introduce ningún primitivo nuevo: `DropdownMenu` + `Link` + `LabelTooltip`.
- El launcher usa `PageHeader`, `EmptyState` y `Skeleton` tal cual; las tarjetas replican las clases de
  `Card` (no se anidan enlaces dentro de un `Card` clicable).
- Sobre el menú marino, todo botón usa `variant="sidebar"`. El trigger del selector es un `<button>` con
  clases propias (no un `Button`) porque lleva contenido de dos líneas y baldosa; reutiliza los mismos
  tokens `sidebar-*` de la variante.

## 12. I. Pruebas sugeridas y puntos abiertos

### 12.1 Unitarias (`web-lib.spec`, módulo puro)

1. `getVisibleNavApps`: con permisos solo de gobierno, no devuelve apps; con `requests`, devuelve Demanda.
2. Todo grupo con `appId` apunta a una app existente; `gobierno` y `administracion` no tienen `appId`.
3. `getAppHomeHref`: devuelve `/inicio` con `dashboard`; con solo `requests`, devuelve `/demanda/solicitudes`.
4. `resolveActiveApp`: ruta de ítem de app → esa app; ruta transversal o `/aplicaciones` → última guardada;
   guardada inexistente → primera visible; sin apps → `null`.
5. `searchNavItems` sigue encontrando ítems transversales y los de todas las apps (BL-027 sin regresión).

### 12.2 Playwright (e2e)

1. Selector con teclado: Tab hasta el trigger, Enter abre, ↓ recorre, Esc cierra y devuelve el foco.
2. Elegir «Inicio del workspace» navega a `/aplicaciones`; elegir la app lleva a su inicio.
3. Una sola app: el trigger está habilitado y el panel muestra la app y «Inicio del workspace».
4. Usuario con solo módulos transversales: no hay selector, la sección Workspace está abierta.
5. Sección Workspace: plegada por defecto; al entrar a `/gobierno/auditoria` se despliega; el estado se recuerda tras recargar.
6. Riel: tooltip del trigger, panel a la derecha, iconos transversales con tooltip.
7. Cajón móvil (375 px): el panel queda por encima del cajón; elegir una app cierra todo.
8. Launcher: loading (esqueletos), vacío, error con «Reintentar», una app (tarjeta grande), y con 3 apps simuladas.
9. Tarjeta del launcher: un solo enlace por app; Tab sobre ella muestra el foco en la tarjeta; clic en cualquier punto navega.
10. Migas: «Workspace › Demanda» en una pantalla de app; «Workspace › Administración» en una transversal; «Workspace» (actual) en `/aplicaciones`.
11. Buscador: «auditoría» lista un ítem transversal con su pista «Gobierno»; Enter navega.
12. Contraste axe en claro y oscuro: menú con selector, panel abierto, `/aplicaciones`.
13. `forced-colors` y `prefers-reduced-motion`: sin animación, bordes visibles.

### 12.3 Capturas visuales (claro y oscuro)

Menú expandido con panel cerrado y abierto; riel con panel abierto; cajón con panel abierto; `/aplicaciones`
en 1440, 1024, 768 y 375 px con 1 app y con 3; estados vacío y error; barra superior con migas.

### 12.4 Puntos abiertos

1. **Cuántas apps y orden.** El diseño soporta hasta 8 con el panel con scroll y el grid del launcher.
   Orden propuesto: el del registro `NAV_APPS`. Con más de 8, añadir buscador al panel.
2. **Favoritos y «recientes».** No se diseñan ahora. Si hace falta, la última app usada ya se guarda y
   podría marcarse con una insignia «Reciente» en el launcher.
3. **Nombre de la app en el buscador.** Hoy no se añade al texto buscable para no alterar BL-027. Con
   varias apps conviene que «service desk» liste todas sus pantallas.
4. **Nombre del grupo «Demanda».** La app y su primer grupo comparten nombre y se leen repetidos. Se
   recomienda renombrar el grupo (p. ej. «Gestión de la demanda») al implementar; afecta a pruebas de
   búsqueda que usan «demanda».
5. **Destino de `/` y del login con ≥2 apps.** Hoy `/inicio`. Con varias apps debería ser `/aplicaciones` o
   la última app usada.
6. **Dos descripciones por app.** Larga (launcher) y corta (panel), o una sola. Recomendado: dos.
7. **Migas en móvil.** No caben; si el producto necesita el contexto fuera del cajón, evaluar una segunda
   línea bajo la barra o el nombre de la app en el `h1`.
8. **Permisos «accesibles pero no listados».** Un usuario que entra por URL directa a una pantalla de
   otra app oculta no ve esa app en el selector. Es coherente con el filtrado cosmético actual (el control
   real es del servidor).
9. **Aprobaciones.** Vive en `/administracion/revision` pero pertenece a la app Demanda. El menú la
   muestra en Demanda; la miga lo refleja («Workspace › Demanda»), aunque la URL diga `administracion`.

## Anexo: segunda app placeholder «Service Desk» (Próximamente)

Reserva el apartado de una **segunda** aplicación, **Service Desk**, visible pero **no navegable**,
marcada «Próximamente». Objetivo: enseñar que el workspace crecerá sin construir la app todavía y **sin
cambiar ningún flujo actual de Demanda**. Sin cambios de API, contrato ni MCP: solo metadatos de
navegación y presentación en `apps/web`. Todos los contrastes siguen las mediciones de las secciones 7-8
(se reutilizan pares ya medidos; no se introduce ningún token nuevo).

### A1. Decisiones

| # | Tema | Decisión | Por qué |
| --- | --- | --- | --- |
| 1 | Modelo | Lista **separada** `NAV_UPCOMING_APPS` en `navigation.ts`, con el tipo `UpcomingApp` (`id`, `name`, `icon`, `description`, `shortDescription`). **No** entra en `NAV_APPS`, ni en `getVisibleNavApps`, ni en `resolveActiveApp`/`findAppForPath`. | Una app «próxima» no es una app real: no tiene grupos, menú ni ruta. Mantenerla fuera garantiza que **no** cuente como app activa ni active el modo «≥2 apps» (logo a `/aplicaciones`, launcher en rejilla). La única app real sigue siendo Demanda. |
| 2 | Icono | `Headset` (lucide-react 1.52.0), coherente con «mesa de servicio». | Verificado en la versión instalada; distinto de `Workflow` (Demanda). |
| 3 | Navegación | **No** es un `Link`. En el selector es un `DropdownMenuItem disabled`; en el launcher es un `<li>` sin enlace. | Un placeholder no debe navegar a ningún sitio; `disabled` lo saca del recorrido de teclado de Radix y del foco. |
| 4 | Logo y app activa | **No cambian.** Con una sola app real, el logo sigue llevando a `/inicio` (Demanda) y Demanda sigue siendo la tarjeta grande del launcher. | El placeholder no altera la cuenta de apps visibles (`getVisibleNavApps` sigue devolviendo solo Demanda). |
| 5 | Badge | Texto «Próximamente» en una píldora `bg-muted text-muted-foreground`. | Par ya medido (§8): legible en ambos temas, nunca cian sobre claro. |

### A2. Selector (`app-switcher.tsx`)

- Tras el ítem de Demanda y **antes** del separador + «Inicio del workspace», se listan las apps de
  `NAV_UPCOMING_APPS` como `DropdownMenuItem disabled` (no `asChild`, no `Link`):
  `items-start gap-3 py-2 opacity-100` con contenido atenuado por tokens (no por `opacity`, para no
  degradar contraste). Radix marca el ítem `data-disabled`, lo excluye del typeahead y del foco por
  flechas: no es alcanzable por teclado, es informativo.
- **Baldosa**: igual geometría que la de Demanda (`size-8 rounded-md`) pero atenuada:
  `bg-muted text-muted-foreground` con el icono `Headset` `size-5`.
- **Texto**: nombre `text-sm font-medium text-muted-foreground`; descripción corta
  `line-clamp-2 text-meta text-muted-foreground`.
- **Badge**: a la derecha del nombre, `<span class="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px]
  font-medium text-muted-foreground">Próximamente</span>`.
- **Accesible**: el ítem lleva `aria-disabled` (lo pone Radix con `disabled`) y el nombre accesible
  incluye el estado: un `<span class="sr-only"> (próximamente, no disponible)</span>` tras el nombre.
- Contraste (medido, pares de §8): `muted-foreground` sobre `popover` = 7.0:1 claro / 7.4:1 oscuro
  (texto ✔); badge `muted-foreground` sobre `muted` = 4.6:1 claro / 5.1:1 oscuro (texto ✔); icono sobre
  baldosa `muted` ≥ 3:1 (icono ✔).

### A3. Launcher (`/aplicaciones`)

- Demanda **sigue featured** (tarjeta grande) aunque haya un placeholder: el modo featured depende de
  `apps.length === 1` (apps reales), que no cambia. Bajo la tarjeta de Demanda, dentro del mismo
  `<ul aria-label="Aplicaciones disponibles">`, se añaden las apps de `NAV_UPCOMING_APPS` como tarjetas
  **normales atenuadas y no clicables**.
- `AppCard` admite `comingSoon`: cuando lo es, el `<li>` **no** lleva enlace extendido (`after:absolute`)
  ni `hover:border-border-strong`; el nombre es texto plano (no `Link`), la tarjeta usa
  `bg-card text-muted-foreground border-dashed` y en lugar del pie «Abrir →» muestra el badge
  «Próximamente» (misma píldora que el selector). `aria-describedby` enlaza la descripción; no hay
  `has-focus-visible` porque no hay foco (no es interactiva).
- Layout responsive sin cambios: la tarjeta featured de Demanda ocupa el ancho; el placeholder cae como
  tarjeta normal en la rejilla `sm:grid-cols-2 xl:grid-cols-3`. Objetivos táctiles no aplican (no es
  interactiva).

### A4. Qué NO cambia

- `getVisibleNavApps`, `getAppHomeHref`, `resolveActiveApp`, `findAppForPath`, el logo, las migas y la
  sección «Workspace» del menú quedan intactos. El buscador de pantallas no indexa apps próximas (no
  tienen ítems). Service Desk no aparece en el menú lateral (no tiene grupos).
