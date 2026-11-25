# Cromo discreto: selector de aplicaciones y buscador

Especificación visual (rol Diseñador). No toca código de la aplicación. Un solo PR de interfaz web: sin
cambios de API, contrato ni MCP.

Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md`, `30-pruebas.md`,
`docs/design/identidad-color-menu.md`, `docs/design/workspace-apps-gibo.md` (§3, §5, §6) y
`docs/design/oleada4-a-busqueda.md`. Este documento **sustituye** los apartados sobre la ubicación del
selector (workspace-apps-gibo §3.1, §3.3, §3.4, §5.1) y sobre los disparadores del menú lateral
(oleada4-a-busqueda, tabla de disparadores). El contenido del panel del selector y la paleta no cambian.

## 1. Objetivo y acción principal

Quitar de la barra lateral dos bloques que ocupan sitio fijo y aportan poco: el selector «Aplicación»
(56 px) y el campo «Buscar… Ctrl K» (48 px con su separación). La acción principal de la persona sigue siendo
navegar por el menú de su app; el cambio de app y la búsqueda pasan a ser accesos compactos y reconocibles.

Estado actual comprobado en el código:

| Pieza | Dónde está hoy | Archivo |
| --- | --- | --- |
| Selector (botón de 48 px, baldosa + «Aplicación» + nombre + chevron) | Bajo la marca del menú lateral, también en el cajón móvil | `components/app-switcher.tsx`, montado en `app-sidebar.tsx` |
| Campo de búsqueda 1 | Primera fila de la zona con scroll del menú lateral (campo expandido; lupa en riel) | `SidebarSearchTrigger` en `global-code-search.tsx`, usado en `app-sidebar.tsx` |
| Campo de búsqueda 2 | Barra superior de escritorio, `w-56 xl:w-72` | `DesktopTrigger` en `global-code-search.tsx`, montado en `app-shell.tsx` |
| Lupa móvil | Barra superior móvil (`MobileNav`), solo icono | `PaletteHost` (`placement="mobile"`) |
| Miga «Workspace › App» | Barra superior de escritorio, izquierda | `workspace-crumbs.tsx` |

La zona de navegación ya tiene `min-h-0 flex-1 overflow-y-auto` con `nav-scroll-shadow` y sin barra visible:
el corte en pantallas bajas es el desplazamiento esperado, pero se ve peor porque el selector y el buscador
se comen la altura. Liberarla es la corrección; no se cambia el mecanismo de scroll.

## 2. Decisiones (resumen)

| # | Punto | Decisión | Por qué |
| --- | --- | --- | --- |
| 1 | Un solo buscador | **Valida la propuesta.** Un único disparador en la barra superior de escritorio; se **elimina** el del menú lateral (campo y lupa del riel) y el del cajón. | Los dos abrían la misma paleta. En móvil la lupa de la barra superior ya existe, así que el cajón no necesita otra. |
| 2 | Forma del buscador | Botón compacto: lupa + pista `Ctrl K` (`⌘K` en Mac). Sin texto «Buscar…» ni ancho fijo. Nombre accesible «Buscar en el portal». | Se reconoce por la lupa y la pista; ocupa unos 100 px en vez de 224-288. |
| 3 | Dónde va el icono de aplicaciones | **Barra superior de escritorio, al inicio, justo antes de la miga «Workspace › App».** En móvil, **cabecera del cajón, junto al logo** (antes del interruptor de tema). **Corrige** la propuesta del orquestador de ponerlo junto al logo del menú. | Ver §2.1. |
| 4 | Icono | `LayoutGrid` (ya usado en la sección Workspace y en «Inicio del workspace»; sin icono nuevo). Nombre accesible «Aplicaciones», tooltip «Aplicaciones». | Es el símbolo de «lanzador» del portal. La app actual la dice la miga a su derecha. |
| 5 | Barra lateral colapsada (riel) | No lleva ni selector ni buscador. Queda marca, navegación y pie. El riel gana 88 px. | El selector y la lupa del riel eran duplicados de los de la barra superior, que sigue visible con el riel. |
| 6 | Buscador en móvil | **Solo icono** (ya lo es). No se toca: `Button variant="ghost" size="icon"`, nombre «Buscar». | En 360 px no cabe texto ni pista; el teclado físico no aplica. |
| 7 | Logo GIBO y `/aplicaciones` | Sin cambios. La marca sigue llevando al inicio de la única app o a `/aplicaciones`; el panel sigue incluyendo «Inicio del workspace»; la miga «Workspace» sigue enlazando. | No se duplica nada nuevo: el botón solo abre el menú que ya existía. |
| 8 | Paleta, atajos, resultados | Sin cambios. `Ctrl/⌘+K` y `/` siguen igual (`CodeSearchShortcut`). | Restricción de la tarea. |
| 9 | Tokens | **Ninguno nuevo.** | Los pares necesarios ya existen y cumplen contraste (§8). |

### 2.1 Por qué el selector va en la barra superior y no junto al logo del menú

- **Riel.** La cabecera del riel mide 56 px y solo cabe el isotipo centrado; el interruptor de tema ya se
  oculta ahí «para no estrechar la columna». Poner el icono junto al logo obligaría a un caso especial
  (apilarlo bajo el isotipo y volver a gastar altura) o a perder el acceso con el menú colapsado. En la
  barra superior es un único sitio en expandido, riel y automático (1024-1279 px).
- **Elimina la rama de riel del selector**: desaparecen `isRail`, el panel `side="right"` con ancho
  fijo y el tooltip condicional. El código se simplifica.
- **Contexto.** Queda pegado a la miga que ya dice «Workspace › Demanda»: el icono abre lo que la miga
  nombra. El nombre de la app actual no se pierde.
- **Móvil.** La barra superior móvil ya lleva menú, marca, lupa, asistente, campana, tema y usuario
  (360 px llenos). El icono va en la cabecera del cajón, que tiene espacio (§7).
- Contra: el selector deja de verse junto al menú que gobierna. Se acepta: el menú muestra los grupos de
  la app y la miga dice cuál es; con una sola app hoy el cambio es raro y el panel se descubre por el icono.

## 3. Estructura y jerarquía

### 3.1 Escritorio (≥1024 px)

```
Menú lateral (sin selector ni buscador)        Barra superior (h-12, sticky z-30)
┌──────────────────────┐   ┌──────────────────────────────────────────────────────────────┐
│ [GIBO]           ☾   │   │ [▦] Workspace › Demanda        [🔍 Ctrl K] [✦] [🔔] [👤 Ana ⌄]│
├──────────────────────┤   └═══════════════ filete degradado (sin cambios) ═══════════════┘
│  ▎ Panel del área    │
│    Mi trabajo        │   ▦ = botón-icono «Aplicaciones» (abre el selector)
│  DEMANDA ⌄ …         │   🔍 = botón compacto «Buscar en el portal»
│  …                   │
└──────────────────────┘
```

- Foco visual principal de la pantalla: el contenido. La barra superior queda igual de baja; los dos
  accesos son de peso bajo (borde fino y texto atenuado), por debajo del asistente y el usuario.
- Orden en la barra: [Aplicaciones] → [miga] (crece) → [Buscar] → [Asistente] → [Campana] → [Usuario].

### 3.2 Cambios por archivo (guía para `desarrollador`)

| Archivo | Cambio |
| --- | --- |
| `app-shell.tsx` | La columna izquierda de la barra pasa a `flex min-w-0 flex-1 items-center gap-2` con el selector y `WorkspaceCrumbs`. |
| `app-switcher.tsx` | Trigger de botón-icono; ver §4. Props: se retira `isRail`; `variant` pasa a `placement: 'header' \| 'drawer'`. |
| `app-sidebar.tsx` | Retira el `<AppSwitcher>` del flujo del menú, y los dos bloques de búsqueda (campo y riel) de `renderMenu`. En la variante `drawer` monta `<AppSwitcher placement="drawer">` en la cabecera, antes de `ThemeToggle`. Quita los imports sin uso. |
| `global-code-search.tsx` | `DesktopTrigger` compacto (§5). Elimina `SidebarSearchTrigger` (y su `onBeforeOpen`). `openSearchPalette` se conserva solo si otro módulo lo usa; si queda sin uso, se elimina. |
| Cálculo de apps | Hoy vive en `AppSidebar` y se duplica a medias en `WorkspaceCrumbs`. Extraerlo a un hook (`useWorkspaceApps`: apps visibles, app activa, `homeHrefFor`) para la barra superior, el cajón y las migas. `useLastAppId` y su efecto de «recordar última app» se quedan en el menú de escritorio, que sigue montado. |

`AppShell` es un componente de servidor: el selector de la barra superior es un componente cliente
pequeño (p. ej. `HeaderAppSwitcher`) que usa el hook y renderiza `AppSwitcher`.

## 4. Selector de aplicaciones (botón-icono)

### 4.1 Disparador en la barra superior

```tsx
<DropdownMenu>
  <LabelTooltip label="Aplicaciones" side="bottom">
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Aplicaciones"
        className="shrink-0 text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground">
        <LayoutGrid aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
  </LabelTooltip>
  <DropdownMenuContent … />
</DropdownMenu>
```

Clases efectivas: `Button` base + `ghost` + `icon-sm` = `size-8` (32 px; `pointer-coarse:min-h-10 min-w-10`),
`rounded-md`, `focus-visible:outline-2 outline-offset-2 outline-ring`. Icono 16 px (`[&_svg]:size-4`).

| Estado | Aspecto |
| --- | --- |
| Normal | Icono `text-muted-foreground` sobre la barra (`bg-card/90`), sin borde ni fondo. |
| Hover | `bg-accent` + `text-foreground` + tooltip «Aplicaciones» (abajo). |
| Abierto | `data-[state=open]:bg-accent text-foreground` (el hover queda fijo). |
| Foco (teclado) | Anillo `outline-2 outline-offset-2 outline-ring`; el tooltip sale solo con foco visible (ya lo resuelve `LabelTooltip`). |
| Cargando permisos | Marcador `div` `size-8` vacío con `aria-hidden` (reserva sitio, evita el salto de la miga). Sin esqueleto animado. |
| Sin actor, error o sin apps visibles | No se pinta (como hoy; el aviso ya está en el menú o en `/aplicaciones`). |
| Deshabilitado | No existe. Con una sola app sigue activo: el panel lleva al inicio del workspace. |

### 4.2 Panel (`DropdownMenuContent`)

Mismo contenido que hoy (etiqueta «Aplicaciones», una fila por app con `Check` en la actual y
`sr-only` «, aplicación actual», filas «Próximamente» deshabilitadas, separador, «Inicio del workspace»).
Solo cambian posición y ancho:

- Barra superior: `side="bottom" align="start" sideOffset={6} collisionPadding={8} loop`, clases
  `w-72 max-w-[calc(100vw-1rem)] max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto p-1.5`.
- Cajón: igual, con `align="end"` (el botón está a la derecha del logo) y sin `min-w` propio.
- Ya no se usa `w-(--radix-dropdown-menu-trigger-width)` (el trigger mide 32 px).
- El panel va en un portal `z-50`: queda sobre la barra (`z-30`) y sobre el cajón (también `z-50`, portal
  posterior en el DOM).

### 4.3 Cabecera del cajón móvil

Cabecera actual: `h-14 px-3 pr-12` con marca y `ThemeToggle ml-auto`. Pasa a:

```
[GIBO wordmark]                 [▦] [☾]    [✕ cerrar de Radix, ya reservado: pr-12]
```

- Contenedor de los dos botones: `ml-auto flex items-center gap-0.5`.
- El botón del cajón usa `Button variant="sidebar" size="icon-sm"` (sobre marino) con el mismo icono y
  `aria-label="Aplicaciones"`. Colores sobre `bg-sidebar`: `text-sidebar-foreground`,
  hover `bg-sidebar-accent text-sidebar-accent-foreground`, abierto `data-[state=open]:bg-sidebar-accent`,
  foco `outline-sidebar-ring`. Sin tooltip (táctil; el nombre es visible al abrir y el tooltip no abre por
  hover). Mantener el `LabelTooltip` solo si el cajón se usa con ratón; es inocuo.
- Ancho: cajón de 288 px (máx. 85vw). Presupuesto: 12 px de padding + marca + 32 + 2 + 36 + 48 de `pr-12`.
  La marca tiene `min-w-0` y puede acortarse. **Verificar a 320 px** que no solapa el botón de cierre; si
  solapa, bajar `pr-12` a `pr-11` o ocultar el eslogan de la marca en el cajón.
- Elegir una app llama `onNavigate` y cierra el cajón completo (como hoy).

## 5. Buscador compacto

### 5.1 Escritorio (barra superior)

```tsx
<LabelTooltip label="Buscar en el portal" side="bottom">
  <button type="button" aria-label="Buscar en el portal" aria-haspopup="dialog"
    aria-keyshortcuts="Control+K Meta+K /" onClick={onOpen}
    className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-10 pointer-coarse:min-w-10 pointer-coarse:justify-center">
    <Search aria-hidden="true" className="size-4 shrink-0" />
    <ShortcutKey className="ml-0" />
  </button>
</LabelTooltip>
```

- Cambios frente a `DesktopTrigger`: se quitan `w-56 xl:w-72`, `text-sm`, el `<span>` «Buscar…» y
  el `ml-auto` de la pista (`ShortcutKey className="ml-0"`; `cn`/`tailwind-merge` resuelve el conflicto).
- `ShortcutKey` no cambia: `kbd` decorativo `aria-hidden`, `border-border bg-muted px-1.5 font-mono
  text-meta leading-5 text-muted-foreground`, «Ctrl K» o «⌘K» tras montar, oculto con `pointer-coarse:hidden`.
- Se conserva `aria-haspopup="dialog"` y `aria-keyshortcuts`.
- Tamaño resultante: unos 100 px × 32 px (frente a 224-288 px).
- **Nombre accesible.** Pasa de «Buscar… en el portal» a «Buscar en el portal»: ya no hay texto visible
  «Buscar…» que el nombre deba contener (WCAG 2.5.3 no aplica a un botón sin etiqueta visible; la pista
  «Ctrl K» es un atajo, no una etiqueta, y se anuncia por `aria-keyshortcuts`). Es un cambio de las
  pruebas e2e (§9).
- El tooltip repite el nombre (regla de `ui/tooltip.tsx`: el tooltip nunca describe).

| Estado | Aspecto |
| --- | --- |
| Normal | Borde `border-input` (3:1), fondo `bg-background`, lupa y pista en `text-muted-foreground`. |
| Hover | `bg-accent text-foreground`; tooltip «Buscar en el portal». |
| Foco | Anillo `outline-ring` con separación de 2 px. |
| Paleta abierta | Sin estado propio (el diálogo cubre la pantalla). Al cerrar con Esc, el foco vuelve al botón (ya lo hace `onCloseAutoFocus`). |
| Táctil (`pointer-coarse`) | `h-10 min-w-10`, sin pista (queda solo la lupa). |
| `forced-colors` | El borde del botón sigue visible (borde real, no sombra). |

### 5.2 Móvil (< 1024 px)

Sin cambios: `Button variant="ghost" size="icon"` (36 px, 40 en táctil) con `aria-label="Buscar"`, antes del
asistente. Solo icono. La lupa del cajón desaparece.

### 5.3 Menú lateral

Sin campo ni lupa, en expandido, riel y cajón. El grupo de entrada («Panel del área», «Mi trabajo»…) pasa a
ser el primer elemento de la zona con scroll. `nav` mantiene `py-3`.

## 6. Altura recuperada y desplazamiento de la navegación

| Modo | Selector | Buscador (alto + separación) | Total |
| --- | --- | --- | --- |
| Expandido y cajón | 56 px (`h-12` + `pb-2`) | 48 px (`h-8` + `gap-4`) | **104 px** |
| Riel | 48 px (`size-10` + `pb-2`) | 40 px (`h-8` + `gap-2`) | **88 px** |

- El resto de reglas del scroll no cambia: `nav` con `min-h-0 flex-1 overflow-y-auto no-scrollbar` y
  `nav-scroll-shadow` (la sombra avisa de que hay más). El pie sigue fijo. No se añade barra de scroll.
- Con la sesión JWT, el pie mide ≈ 49 px; con `dev-header` suma el selector de usuario (≈ 130 px).
  El caso apretado es `dev-header` en alturas ≤ 700 px: sigue habiendo scroll, pero con 104 px más de
  lista.
- Los enlaces enfocados con teclado se desplazan solos a la vista (`focus-visible` los muestra); un ítem
  nunca queda inalcanzable.
- Comprobación manual obligatoria: 1280×640 y 1440×720, expandido y riel, `dev-header` y JWT, claro y oscuro:
  se llega con rueda y teclado al último ítem (sección Workspace desplegada, «Agentes de IA»).

## 7. Responsive

| Ancho | Barra superior | Menú lateral |
| --- | --- | --- |
| < 1024 (móvil/tablet) | Barra móvil sin cambios; lupa solo icono; **sin** icono de aplicaciones | Cajón: logo + [▦ Aplicaciones] + tema; sin buscador |
| 1024-1279 (riel automático) | [▦] + miga + [🔍 Ctrl K] + asistente + campana + usuario | Riel de 56 px sin selector ni lupa |
| ≥ 1280 | Igual; la miga tiene más espacio | Expandido de 240 px sin selector ni buscador |

- La miga es `min-w-0 flex-1` y se trunca antes de empujar a los botones. El botón de aplicaciones y el de
  búsqueda son `shrink-0`.
- Táctil (cualquier ancho con `pointer-coarse`): objetivos de 40 px; la pista `Ctrl K` se oculta.

## 8. Accesibilidad

### 8.1 Contraste

Umbral WCAG 2.2 AA: texto normal ≥ 4.5:1; iconos informativos, bordes de control y foco ≥ 3:1.
Los pares nuevos para la barra superior se calcularon a mano (OKLCH → sRGB lineal → luminancia relativa)
con los valores actuales de `globals.css`; son valores redondeados (tolerancia ±0.1). Los del menú marino
se toman de `identidad-color-menu.md` §4.1 (ya medidos). **Confirmar con una herramienta (axe en los e2e o
un medidor) al implementar**; no se añade ningún color nuevo.

| Par | Claro | Oscuro | Umbral |
| --- | --- | --- | --- |
| `muted-foreground` (lupa, icono ▦, pista) sobre `background` | 6.2 | 8.5 | 4.5 ✔ |
| `muted-foreground` sobre `card` (barra `bg-card/90`) | ≥ 6.2 | ≥ 8.5 | 4.5 ✔ |
| `muted-foreground` sobre `accent`/`muted` (hover, `kbd`, abierto) | ≈ 5.7 | ≈ 6.5 | 4.5 ✔ |
| `foreground` sobre `accent` (hover) | > 10 | > 10 | 4.5 ✔ |
| Borde `border-input` del buscador sobre `background` | ≈ 3.4 | ≈ 4.2 | 3 ✔ |
| Anillo de foco `ring` (= `primary`) sobre barra y lienzo | 4.8 | ≈ 3.9 | 3 ✔ |
| Cajón: `sidebar-foreground` (▦) sobre `sidebar` | 12.41 | 16.25 | 4.5 ✔ (medido) |
| Cajón: ▦ en hover (`sidebar-accent`) | 9.92 | 13.62 | 4.5 ✔ (medido) |
| Cajón: foco `sidebar-ring` sobre `sidebar` | 6.64 | 8.69 | 3 ✔ (medido) |

### 8.2 Teclado, roles y nombres

| Elemento | Rol y nombre | Teclado |
| --- | --- | --- |
| Botón de aplicaciones | `button`, «Aplicaciones», `aria-haspopup="menu"` y `aria-expanded` (los pone Radix) | Enter/Espacio/↓ abren; ↑↓, Inicio/Fin, escribir letras; Esc cierra y devuelve el foco al botón; Tab cierra y continúa |
| Panel | `menu` con `menuitem` por app; actual con `aria-current="true"` y «, aplicación actual» oculto; «Inicio del workspace» | Igual que hoy |
| Botón de búsqueda (escritorio) | `button`, «Buscar en el portal», `aria-haspopup="dialog"`, `aria-keyshortcuts="Control+K Meta+K /"` | Enter/Espacio abren la paleta; `Ctrl/⌘+K` y `/` siguen abriéndola |
| Lupa móvil | `button`, «Buscar» | Sin cambios |

- **Orden de tabulación (escritorio):** enlace «Saltar al contenido» → marca → tema → menú lateral → pie →
  [Aplicaciones] → miga («Workspace», «Demanda») → [Buscar] → asistente → campana → usuario → contenido.
  La barra superior sigue después del menú en el DOM, como hoy.
- **Cajón:** botón de cierre de Radix → marca → [Aplicaciones] → tema → menú.
- **Tamaños:** 32 × 32 px en puntero fino (≥ 24 px, WCAG 2.5.8); 40 px en táctil.
- **Sin dependencia del color:** el botón de aplicaciones se reconoce por forma (rejilla) y nombre; el
  buscador, por la lupa y el texto «Ctrl K»; el estado abierto no es solo de fondo (el panel visible lo
  confirma y `aria-expanded` lo anuncia).
- **Movimiento:** no hay animación nueva. El tooltip y el panel ya usan `tw-animate-css` con
  `motion-reduce` donde corresponde.
- **`forced-colors`:** botón de búsqueda con borde real; botón de aplicaciones sin borde (igual que los otros
  iconos de la barra, que ya se resuelven con el color del sistema).
- **Limitación:** este documento no sustituye pruebas manuales con lector de pantalla (NVDA/JAWS y VoiceOver) ni
  revisión experta. Revisar a mano: anuncio del botón de aplicaciones y de la app actual en el panel;
  anuncio de «Buscar en el portal» con su atajo; foco al cerrar la paleta.

## 9. Pruebas e2e afectadas (`30-pruebas.md`: comportamiento observable)

Se ejecutan con los scripts existentes del repositorio (ver `35-entorno-local-y-e2e.md`); no se inventan comandos.

| Archivo | Líneas aprox. | Cambio |
| --- | --- | --- |
| `e2e/shell-navigation.spec.ts` | 182-210 («el selector de aplicaciones se maneja con teclado…») | El disparador deja de estar en el `aside`: `page.getByRole('button', { name: 'Aplicaciones', exact: true })` (barra superior). El resto (ítem «Demanda, aplicación actual», Esc, «Inicio del workspace» → `/aplicaciones`, tarjeta única) no cambia. |
| `e2e/shell-navigation.spec.ts` | nuevo | Comprobar que el `aside` ya no contiene un botón «Aplicaciones» ni «Buscar…»; que el selector funciona con el menú en riel (preferencia `rail`); que el cajón móvil muestra el botón «Aplicaciones» en su cabecera y elegir una app cierra el cajón. |
| `e2e/busqueda-global.spec.ts` | 97 y 225 | `getByRole('button', { name: 'Buscar… en el portal' })` pasa a `'Buscar en el portal'`. |
| `e2e/busqueda-global.spec.ts` | 313-320 (prueba del cajón) | El cajón ya no tiene «Buscar…». Reescribir: la lupa de la barra móvil (`'Buscar'`) abre la paleta; el cajón no contiene un botón de búsqueda. Desaparece el caso «el cajón se cierra antes de abrir la paleta». |
| `e2e/busqueda-global.spec.ts` | 281-304 (móvil, `'Buscar'` exacto) | Sin cambios. |
| Capturas y axe | Cualquier prueba con capturas del menú o `AxeBuilder` | Actualizar capturas del menú y de la barra superior. Si no hay una prueba de axe sobre la barra superior, añadirla en claro y oscuro (cubre §8.1). |
| Una prueba nueva de altura | `viewport 1280×640` | Con el menú expandido, el último enlace (sección Workspace desplegada) se alcanza haciéndolo visible o enfocándolo. |

Las pruebas del riel (`Expandir menú`, `Contraer menú`) no dependen del selector ni del buscador del menú.
Ninguna prueba de la API ni del MCP se ve afectada.

## 10. Documentación a actualizar en el mismo PR

- `docs/aplicacion/frontend-pantallas.md`: ubicación del selector de aplicaciones y del buscador.
- `docs/aplicacion/changelog.json`: entrada del cambio.
- Notas de sustitución al inicio de `workspace-apps-gibo.md` (§3, §5) y `oleada4-a-busqueda.md`
  (disparadores) que apunten a este documento.
- Comprobar `npm run check:encoding` (tildes, UTF-8 sin BOM).

## 11. Riesgos y puntos abiertos

1. **Descubribilidad del selector.** El acceso baja de un bloque grande y permanente a un icono. Con una sola
   app hoy el uso es raro; con dos o más apps, el icono más la miga lo cubren. Revisar si, al llegar la segunda
   app, conviene mostrar el nombre de la app junto al icono (cambio local en la barra superior).
2. **Cajón a 320 px.** Verificar que marca + 2 botones + cierre caben (§4.3).
3. **Hidratación de `ShortcutKey`.** Se decide tras montar («Ctrl K» por defecto, «⌘K» en Mac); el botón
   compacto cambia de ancho unos píxeles al hidratarse. `⌘K` es más corto: el salto es de pocos px y no se
   considera layout shift relevante; si molesta, fijar `min-w-[3.25rem]` en el `kbd`.
4. **Código muerto.** Tras quitar `SidebarSearchTrigger`, revisar `openSearchPalette` y el comentario de
   cabecera de `global-code-search.tsx` («el menú lateral y el atajo la abren con un evento»).
