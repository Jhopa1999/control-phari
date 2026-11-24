# Oleada 4 · PR A. Paleta de búsqueda `Ctrl/⌘+K`. Especificación visual

Especificación (rol Director de Arte Frontend) de la **paleta de búsqueda única** del FEAT-001 (D18). Sustituye a dos
controles: el campo «Buscar código» de la barra superior (`global-code-search.tsx`, `busqueda-global-id.md`) y el campo
«Buscar pantalla…» del menú lateral (`app-sidebar.tsx`). Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md`,
`15-reglas-transversales.md` (IDs con `IdChip`, alcance único en la API). Componentes hermanos: `ui/dialog.tsx`,
`id-chip.tsx`, `status-badge.tsx`, `mobile-nav.tsx`, `identidad-color-menu.md`. Solo tokens semánticos (sin color crudo ni
`z-[n]`), foco con `--ring`, español con tildes. **Sin dependencias nuevas** (no `cmdk`): se usa el `Dialog` de Radix ya
instalado. Los fragmentos de clases son especificación, no código de producto.

---

## 0. Decisiones

| # | Punto | Decisión | Por qué |
| --- | --- | --- | --- |
| P1 | **Contenedor** | `Dialog` de Radix (`ui/dialog.tsx`), controlado. Radix aporta `role="dialog"`, `aria-modal`, trampa de foco, `Esc` y bloqueo del fondo. | Reutiliza el patrón de diálogos del portal y evita dependencia nueva. |
| P2 | **Patrón ARIA** | Combobox 1.2 con foco DOM siempre en el `input` y `aria-activedescendant` hacia la opción activa de un `listbox` con grupos (`role="group"`). Las opciones no entran en el orden de tabulación. | Igual que `SearchableSelect` y que el buscador por código actual. |
| P3 | **Un solo punto de entrada de datos** | Una caja de texto y dos grupos: **«Pantallas»** (local, instantáneo) y **«Solicitudes y tareas»** (API). Un código completo (`isVisibleCode`) llama a `GET /codes/{code}` y su resultado va en el segundo grupo. Otro texto de 2 o más caracteres llama a `GET /search`. | Unifica los dos buscadores sin que el usuario elija el modo. |
| P4 | **Dos disparadores visibles, un atajo** | Barra superior (escritorio): botón con forma de campo. Menú lateral: botón con forma de campo (y, en riel, solo icono). Móvil: icono de lupa en la barra de `MobileNav`. Atajos: `Ctrl+K` (Windows/Linux) y `⌘+K` (macOS) y `/`. | El campo deja de ser un `input`: nadie escribe fuera de la paleta, y así hay un solo flujo de teclado y un solo conjunto de estados. |
| P5 | **Barra móvil estable** | Se elimina el «modo búsqueda» de la barra móvil (`onModeChange`, `searching`): la barra ya no cambia de forma. El icono abre la paleta a pantalla completa. | Quita estado en `MobileNav` y el salto de la barra al teclear. |
| P6 | **Esc cierra siempre** | `Esc` cierra la paleta (no «borra y luego cierra»). El texto se borra con el botón «Borrar búsqueda». Al reabrir, el campo está vacío. | Un comportamiento predecible y alineado con el resto de diálogos. |
| P7 | **Al elegir** | Se cierra la paleta, se navega con `resolveDestination` (o `item.href` en pantallas) y el foco pasa a `main#contenido` al llegar a la ruta nueva (mismo mecanismo `pendingFocus` que hoy, B11 de `busqueda-global-id.md`). Al cerrar con `Esc` el foco vuelve al elemento que lo tenía antes de abrir. | Quien usa lector de pantalla aterriza en el contenido nuevo; con `Esc` no pierde su sitio. |
| P8 | **Roles** | `JEFE_AREA`, `LIDER_PROCESO` e `INTEGRANTE`: ambos grupos. `ADMIN`: solo «Pantallas» (sin llamadas a la API, sin segundo grupo ni su texto de ayuda). Sin actor cargado: no se monta ningún disparador. | Coincide con los roles de `GET /search` y `GET /codes`. |
| P9 | **Sin acentos equivalentes en la API** | La API usa `contains` insensible a mayúsculas pero **sí distingue tildes** (limitación documentada en el plan). El grupo «Pantallas» sí ignora tildes en el cliente. El texto de ayuda de «sin resultados» no promete lo contrario. | No prometer un comportamiento que la API no tiene. |

---

## 1. Objetivo y acción principal

**Objetivo.** Llegar a cualquier pantalla, solicitud o tarea escribiendo unas letras, sin navegar por el menú.

**Acción principal.** Escribir y pulsar `Intro` sobre el primer resultado. Todo lo demás (flechas, clic, borrar) es secundario.

**Qué destaca.** La caja de texto (siempre arriba) y la fila activa (fondo `primary-subtle` y barra lateral). Lo que no
debe destacar: las cabeceras de grupo, la pista de teclado del pie y las notas de aviso.

---

## 2. Estructura (de arriba abajo)

```
┌─ DialogContent ─────────────────────────────────────────────────────┐
│ ① Fila de entrada   🔍  [ Buscar pantallas, solicitudes o tareas… ] ✕│  X de Radix (cerrar) a la derecha
│ ─────────────────────────────────────────────────────────────────── │
│ ② Región de resultados (desplaza)                                    │
│    PANTALLAS                                                         │
│    ▌ ▣ Portafolio                      Seguimiento                   │  ← fila activa
│      ▣ Plan                            Seguimiento                   │
│    SOLICITUDES Y TAREAS                                              │
│      ▤ Solicitud  PRY-0012  Portal de clientes          [Aprobada]   │
│        Proceso Comercial                                             │
│      ☑ Tarea  PRY-0012-T07  Migrar endpoints            [En curso]   │
│        Fase 2 · PRY-0012 · Portal de clientes                        │
│    Hay más resultados. Escribe más para acotar.                      │  ← solo si truncated
│ ─────────────────────────────────────────────────────────────────── │
│ ③ Pie (solo escritorio y puntero fino)                               │
│    ↑↓ moverse   Intro abrir   Esc cerrar                             │
└──────────────────────────────────────────────────────────────────────┘
```

- Estructura DOM: `DialogHeader` oculto (`sr-only`) con `DialogTitle` «Buscar en el portal» y `DialogDescription`
  «Escribe para buscar pantallas, solicitudes y tareas. Usa las flechas para moverte e Intro para abrir.» Después, ① ② ③.
- `role="search"` en el contenedor de ① y ② no hace falta: el diálogo ya lo nombra. La región viva (§6) va dentro del diálogo.
- Orden de grupos: con texto de código completo, **«Solicitudes y tareas» primero** (es la intención clara) y
  «Pantallas» debajo solo si coincide alguna. En el resto de casos, **«Pantallas» primero** (llega al instante, no se
  desplaza al llegar la respuesta de la API) y «Solicitudes y tareas» debajo.
- Dentro de «Solicitudes y tareas»: primero solicitudes y luego tareas, en el orden de la API (código exacto primero,
  luego `registeredAt` desc). Sin subcabecera propia: cada fila declara su tipo con texto.

---

## 3. Clases Tailwind exactas

Los tokens ya cambian entre temas: salvo donde se indica «Claro / Oscuro», la misma clase vale en ambos.

### 3.1 Contenedor

`DialogContent` con `size="lg"` y `className` (móvil primero; `md` = 768 px):

```
gap-0 overflow-hidden p-0
left-0 top-0 translate-x-0 translate-y-0 h-dvh max-h-dvh w-full max-w-none rounded-none border-0
md:left-1/2 md:top-[12vh] md:h-auto md:max-h-[min(34rem,76dvh)] md:w-[calc(100%-2rem)] md:max-w-[640px]
md:-translate-x-1/2 md:rounded-xl md:border md:border-border
motion-reduce:animate-none
```

- `DialogOverlay`: añadir `dark:bg-black/60 motion-reduce:animate-none` (claro conserva `bg-black/40`). Cambio menor
  en `ui/dialog.tsx` o variante local; si se prefiere no tocar `ui/dialog.tsx`, el desarrollador monta `DialogPortal`,
  `DialogOverlay` y `DialogPrimitive.Content` directamente con las mismas clases.
- El botón «Cerrar» (`X`) que añade `DialogContent` (`absolute top-3 right-3`) se mantiene: es el cierre táctil en móvil.
  Por eso la fila de entrada reserva `pr-12`.
- Superficie: `bg-popover text-popover-foreground` (claro blanco; oscuro una escala por encima de la tarjeta, ya definido).
- Con el panel abierto en escritorio, el contenido de detrás queda inerte (Radix). No se usa `backdrop-blur`.

### 3.2 ① Fila de entrada

| Parte | Clases |
| --- | --- |
| Contenedor | `relative flex h-14 shrink-0 items-center border-b border-border md:h-12` |
| Lupa (decorativa, `aria-hidden`) | `pointer-events-none absolute left-4 size-4 text-muted-foreground` |
| `input` | `h-full w-full bg-transparent pl-11 pr-20 text-base text-foreground placeholder:text-muted-foreground md:text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring` |
| Cargando | `Loader2` decorativo: `pointer-events-none absolute right-[4.5rem] size-4 animate-spin text-muted-foreground motion-reduce:animate-none` (en lugar del botón borrar mientras `loading` y hay texto) |
| Borrar | `absolute right-12 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-10`, `aria-label="Borrar búsqueda"`; solo con texto |

- `text-base` en móvil evita el zoom automático de iOS al enfocar; `md:text-sm` en escritorio.
- Atributos del `input`: `type="text"` (no `search`: así no aparece la cruz nativa), `role="combobox"`,
  `aria-expanded="true"`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`,
  `aria-label` según rol (§5), `autoComplete="off"`, `autoCapitalize="none"`, `spellCheck={false}`, `enterKeyHint="search"`.
  No se fuerza `uppercase`: el código se normaliza al enviar (`normalizeCode`).

### 3.3 ② Región de resultados

| Parte | Clases |
| --- | --- |
| Región | `min-h-0 flex-1 overflow-y-auto overscroll-contain p-2` |
| Grupo | `role="group"` + `aria-labelledby`; `mb-1 last:mb-0` |
| Cabecera de grupo | `px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground` (no es interactiva ni entra en el listbox como opción) |
| Fila (`role="option"`) | `relative flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left pointer-coarse:min-h-14 data-[active=true]:bg-primary-subtle before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full data-[active=true]:before:bg-link aria-disabled:cursor-default` |
| Hover | `hover:bg-accent` (la fila activa por teclado prevalece: `data-[active=true]:hover:bg-primary-subtle`) |
| Texto principal | `line-clamp-1 break-words text-sm font-medium text-foreground` (móvil: `line-clamp-2`) |
| Texto secundario | `line-clamp-1 break-words text-xs text-muted-foreground` |
| Icono de tipo / pantalla | lucide `size-4 shrink-0 text-muted-foreground` (decorativo, `aria-hidden`); el tipo siempre va también como texto |
| Pista «Intro» en la fila activa | `ml-auto hidden shrink-0 text-xs text-muted-foreground md:block pointer-coarse:hidden`, solo en la fila activa |

- La barra izquierda usa `bg-link` y no `bg-primary`: el azul eléctrico sobre `primary-subtle` oscuro baja de 3:1 (§6).
  La fila activa no depende solo del color: además cambia el fondo y, en escritorio, aparece «Intro».
- `forced-colors:` la fila activa usa `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` (igual que el menú, §4.5 de `identidad-color-menu.md`).

### 3.4 Fila de pantalla

```
[icono]  Portafolio                         Seguimiento
         (text-sm font-medium)              (text-xs text-muted-foreground, ml-auto; si es de otra
                                             aplicación: «Gobierno · Auditoría», con el nombre de la app)
```

Origen: helper de `lib/navigation.ts` (extraído de `app-sidebar.tsx`), que devuelve por pantalla `href`, `label`,
`icon`, `groupLabel`, `appName`. Se muestran solo las pantallas que el actor puede ver (`allowedModules`).
Coincidencia sin distinguir mayúsculas ni tildes, por palabras (todas deben aparecer en etiqueta, grupo o aplicación);
primero las que **empiezan** por el texto. En móvil, el hint pasa debajo de la etiqueta (`flex-col`) para no truncar.

### 3.5 Fila de solicitud o tarea

```
▤ Solicitud · PRY-0012                                       [StatusBadge]
  Portal de clientes
  Proceso Comercial

☑ Tarea · PRY-0012-T07                                       [StatusBadge]
  Migrar endpoints
  Fase 2 · PRY-0012 · Portal de clientes
```

| Parte | Especificación |
| --- | --- |
| Línea 1 | `flex items-center gap-2 text-xs font-medium text-muted-foreground`: icono (`FolderKanban` o `ListChecks`), la palabra «Solicitud» o «Tarea», `IdChip variant="full" copyable={false}`. |
| Línea 2 | Título (`CodeResolutionDto.title`), estilo de «Texto principal». |
| Línea 3 | Contexto: solicitud → `processName`; tarea → `phaseName · requestCode · requestTitle`. Estilo «Texto secundario». |
| Estado | `StatusBadge kind="request"` o `kind="task"` con `status`. Sin `status`: no se muestra badge. A la derecha, `shrink-0`. En móvil baja a la línea 1, a la derecha, para dar ancho al título. |
| Sin pantalla para el rol | Fila `aria-disabled="true"`, texto `text-muted-foreground` en el título y, en la línea 3, «Tu rol no tiene una pantalla para abrir esta solicitud» (o «tarea»). Enter y clic no navegan; se anuncia (§6). No se oculta: el usuario aprende que existe. |

### 3.6 Disparadores

| Dónde | Clases / especificación |
| --- | --- |
| **Barra superior** (escritorio, sustituye al input actual; mismo lugar entre migas y acciones) | `<button type="button">`: `inline-flex h-8 w-56 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-10 xl:w-72`. Contenido: lupa `size-4`, texto «Buscar…» (`truncate`) y `kbd` a la derecha. `aria-label` «Buscar en el portal», `aria-keyshortcuts="Control+K Meta+K /"`, `aria-haspopup="dialog"`. |
| **`kbd`** | `ml-auto rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5 text-muted-foreground` con «Ctrl K» o «⌘K» según plataforma (se decide tras montar, para no desajustar la hidratación; por defecto «Ctrl K»). Decorativo (`aria-hidden`): el atajo se anuncia por `aria-keyshortcuts`. Oculto con `pointer-coarse:hidden`. |
| **Menú lateral, expandido** (sustituye al `Label` + `Input` + botón limpiar + región `status`) | Botón con la forma del campo anterior: `inline-flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-field-border bg-sidebar-field px-2.5 text-sm text-sidebar-muted-foreground transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring pointer-coarse:h-10`. Lupa `size-4`; texto «Buscar…»; `kbd` con `border-sidebar-field-border bg-transparent text-sidebar-muted-foreground`. Va dentro del contenedor `px-0.5 rail:hidden` existente. |
| **Menú lateral, riel** | `Button variant="sidebar" size="icon-sm"` con la lupa, `aria-label="Buscar (Ctrl K)"` y `LabelTooltip label="Buscar" side="right"` (mismo patrón que el botón de aviso del riel). Visible solo con `hidden rail:inline-flex`. |
| **Móvil (`MobileNav`)** | `Button variant="ghost" size="icon"` con la lupa, `aria-label="Buscar"`, `aria-haspopup="dialog"`; mismo lugar que hoy, antes del asistente. Ya no hay «modo búsqueda»: el resto de la barra no cambia. |

El menú lateral deja de filtrar en línea: se retira `query`, `results`, `searching`, `handleSearchKeyDown` y la región
`status` de ese bloque. La lista de grupos del menú se muestra siempre.

---

## 4. Comportamiento de teclado

| Tecla | Acción |
| --- | --- |
| `Ctrl+K` / `⌘+K` | Abre la paleta desde cualquier pantalla, **también con el foco en un campo editable**, llamando `preventDefault()` (los navegadores lo reservan para su propia barra). Con la paleta abierta, la cierra. No actúa si hay **otro** diálogo modal abierto (`[role="dialog"], [role="alertdialog"]` distinto de la paleta). Por qué es seguro hoy: el portal no tenía este atajo y los navegadores permiten cancelarlo. Si un navegador lo impidiera, `/` y el botón siguen disponibles. |
| `/` | Igual que hoy (`CodeSearchShortcut`): abre la paleta salvo en campos editables o con un diálogo abierto. No se imprime el `/` en el campo. |
| Escribir | Filtra «Pantallas» al instante y, con ≥ 2 caracteres, consulta la API tras **300 ms** de pausa (cancela la petición anterior con `AbortController`). |
| `↓` / `↑` | Mueve la opción activa; al pasar del último al primero (y al revés) da la vuelta. Cruza los grupos sin detenerse en cabeceras. `preventDefault` para no mover el cursor. La fila activa se mantiene visible (`scrollIntoView({ block: 'nearest' })`). |
| `Inicio` / `Fin` | Mueven el cursor dentro del texto (no se capturan). |
| `Intro` | Abre la opción activa. Si el texto es un código completo y aún no llegó la respuesta, resuelve de inmediato (sin esperar el temporizador) y navega al llegar. |
| `Esc` | Cierra y devuelve el foco al elemento previo. |
| `Tab` / `Mays+Tab` | Recorre solo: campo de texto → «Borrar búsqueda» (si hay texto) → «Cerrar». Radix mantiene el foco dentro del diálogo. Las opciones no son tabulables. |
| Clic o toque en una fila | Abre esa opción. El puntero mueve la fila activa con `onMouseMove` (no `onMouseEnter`, para no robar la activa al desplazar con el teclado). |

La opción activa por defecto es la **primera opción habilitada**. Cuando llegan los resultados de la API, la activa se
conserva si el usuario ya la movió y sigue existiendo; si no, se queda donde estaba (la primera). Nunca salta sola a otra
fila mientras el usuario navega.

---

## 5. Estados

Todos los avisos van **dentro de la región de resultados**, nunca como toast. Cada grupo gestiona su propio estado, de modo
que un fallo de la API no oculta las pantallas.

| Estado | Cuándo | Qué se ve |
| --- | --- | --- |
| **Inicial (vacío, sin texto)** | Recién abierta | «Pantallas»: todas las que el actor puede ver, en el orden del menú (la región desplaza). Debajo, una nota `px-3 py-2 text-xs text-muted-foreground`: «Escribe un código (PRY-0012) o parte del título para buscar solicitudes y tareas.» (omitida para `ADMIN`). Placeholder: «Buscar pantallas, solicitudes o tareas…» (`ADMIN`: «Buscar pantallas…»). |
| **Texto de 1 carácter** | Un solo carácter | Solo «Pantallas» filtradas; bajo ellas la nota «Escribe al menos 2 caracteres para buscar solicitudes y tareas.» |
| **Cargando** | Consulta en vuelo | Cabecera «Solicitudes y tareas» y, debajo, **3 filas esqueleto** (`Skeleton`, `h-12 rounded-lg`, `aria-hidden`). Si ya había resultados, **se conservan** y el grupo lleva `aria-busy="true"` con el `Loader2` de la fila de entrada (sin vaciar ni parpadear). `motion-reduce` quita el giro; el esqueleto no anima. |
| **Resultados** | Respuesta con filas | Grupos según §2. Si `truncated` es `true`: nota al final del grupo `px-3 py-2 text-xs text-muted-foreground` «Hay más resultados. Escribe más para acotar.» |
| **Sin resultados** | Respuesta vacía y ninguna pantalla coincide | Bloque centrado `flex flex-col items-center gap-2 px-6 py-10 text-center`: círculo `size-10 rounded-full bg-primary-subtle` con `SearchX` `text-link`, título `text-sm font-medium text-foreground` «No encontramos resultados para «{texto}»», ayuda `text-xs text-muted-foreground` «Revisa la ortografía y las tildes, o prueba con otra parte del título. Para ir directo, escribe el código completo.» |
| **Sin resultados en solicitudes y tareas, con pantallas** | Respuesta vacía pero hay pantallas | Se muestran las pantallas y, bajo ellas, `px-3 py-2 text-xs text-muted-foreground` «No hay solicitudes ni tareas que coincidan.» |
| **Código no encontrado** | `GET /codes/{code}` responde 404 | En «Solicitudes y tareas»: «No encontramos {CÓDIGO}, o no tienes acceso. Revisa que esté completo.» (mismo mensaje para inexistente y fuera de alcance; no se revela cuál). |
| **Error** | Red, 5xx o respuesta inesperada | En «Solicitudes y tareas»: fila `flex items-start gap-2 px-3 py-2 text-sm text-foreground` con `CircleAlert`, «No se pudo buscar solicitudes y tareas. Inténtalo de nuevo.» y `Button variant="outline" size="sm"` «Reintentar» (conserva el foco en el campo al terminar). Las pantallas siguen disponibles. |
| **403 inesperado** | El rol no puede buscar | Igual que error pero sin «Reintentar»: «Tu rol no puede buscar solicitudes ni tareas.» y el grupo no vuelve a consultar. |
| **Éxito** | Se abre una opción | La paleta se cierra y se navega (no hay pantalla de éxito). |
| **Opción deshabilitada** | Encontrada, pero el rol no tiene pantalla | Fila `aria-disabled`, sin navegar (§3.5). |
| **Foco** | Siempre | Anillo `--ring` en el campo (`outline-ring`, 2 px, `-outline-offset-2`), botones y disparadores. La fila activa no usa anillo: usa fondo y barra (la activación es lógica, el foco DOM sigue en el campo). |
| **Deshabilitado** | No aplica | Los disparadores no se muestran mientras el actor no esté resuelto (P8). |

El texto introducido se recorta (`trim`) antes de consultar; un texto de solo espacios se trata como vacío. Más de 80
caracteres: el campo permite escribirlos (`maxLength` no se fija) y la consulta usa los primeros 80, así que no aparece un
error 400 al usuario.

---

## 6. Accesibilidad

**Roles y nombres.** `dialog` (Radix) con título «Buscar en el portal». Campo: `combobox`; nombre «Buscar pantallas,
solicitudes o tareas» (`ADMIN`: «Buscar pantallas»). Listado: `listbox` con `aria-label="Resultados"`. Grupos:
`role="group"` + `aria-labelledby` de su cabecera. Opciones: `role="option"`, `aria-selected` = activa,
`aria-disabled` si no navegan, id único con `useId()`.

**Región viva** (`role="status" aria-live="polite" aria-atomic="true"`, `sr-only`, dentro del diálogo):

- Al asentarse la búsqueda (no en cada tecla): «3 pantallas, 2 solicitudes y 4 tareas.», «Sin resultados.», «No se pudo
  buscar solicitudes y tareas.». Para re-anunciar un texto idéntico se alterna un carácter invisible, como hoy.
- Al abrir una opción deshabilitada: «Encontrado, pero tu rol no puede abrirlo.»
- Con `truncated`: se añade «Hay más resultados.»

**Orden de tabulación.** Campo de texto, «Borrar búsqueda», «Cerrar». El foco inicial va al campo.

**Contrastes.** Umbral: texto normal 4,5:1; texto grande, iconos y bordes de control 3:1.

| Par | Uso | Claro | Oscuro | Estado |
| --- | --- | --- | --- | --- |
| `foreground` sobre `popover` | Títulos de fila | 14,8:1 (calculado con `#0F2557` sobre blanco) | estimado > 12:1 | Claro medido; oscuro **por medir** |
| `link` sobre `background` (lienzo) | Referencia de marca | 5,66:1 (`25-marca-gibo.md`) | 8,15:1 (`25-marca-gibo.md`) | Medido |
| `primary-foreground` sobre `primary` | Botón «Reintentar» solo si fuera primario (no se usa) | 4,84:1 | 4,84:1 | Medido (no aplica) |
| `foreground` sobre `primary-subtle` | Fila activa | estimado ≈ 11:1 | estimado > 10:1 | **Por medir** |
| `muted-foreground` sobre `popover` | Cabeceras de grupo, línea 3, `kbd` | estimado ≈ 7:1 | estimado > 7:1 | **Por medir** |
| `muted-foreground` sobre `primary-subtle` | Línea 3 de la fila activa | estimado ≈ 5,7:1 | estimado ≈ 5:1 | **Por medir** (el más justo; si falla, la línea 3 de la fila activa pasa a `text-foreground`) |
| `muted-foreground` sobre `muted` | `kbd` | estimado ≈ 5,6:1 | estimado > 5:1 | **Por medir** |
| Barra de la fila activa (`link`) sobre `primary-subtle` | Indicador no textual, 3:1 | estimado ≈ 4:1 | estimado > 3:1 | **Por medir**. Se usa `link` y no `primary` porque `primary` sobre `primary-subtle` oscuro queda cerca de 2,7:1 |
| `border-input` sobre `background` | Borde del botón disparador | ≥ 3:1 (definido así en `globals.css`) | ≥ 3:1 | Definido por token; confirmar al medir |
| `sidebar-muted-foreground` sobre `sidebar-field` | Texto del botón del menú | ver `identidad-color-menu.md` §4.1 | ídem | Mismo par que el placeholder del campo actual (ya medido) |

Los valores «estimado» son aproximaciones de diseño a partir de la luminosidad OKLCH: **no sustituyen la medición**. Antes
de fusionar, el desarrollador (o el revisor) mide cada fila «Por medir» en los dos temas con el cálculo WCAG 2.2 sobre los
valores finales de `globals.css`, anota el ratio en esta tabla y ajusta el token solo si el ratio queda por debajo del umbral.

**No depender solo del color.** El tipo va por icono y palabra («Solicitud», «Tarea»); el estado, por `StatusBadge` con
etiqueta e icono; la fila activa, por fondo, barra y «Intro» en escritorio; el error, por icono y texto.

**Movimiento.** Sin animación decorativa. La aparición del diálogo usa las transiciones de Radix con
`motion-reduce:animate-none`; los giros de `Loader2` también. Sin desplazamiento suave: `scrollIntoView` con
`behavior: 'auto'`.

**Objetivos táctiles.** Filas `min-h-12` (48 px) y `pointer-coarse:min-h-14`; botones de la fila de entrada
`pointer-coarse:size-10` (40 px, y X de Radix `icon-sm` con zona de toque ampliada por el padding de `pr-12`); disparadores
`pointer-coarse:h-10`.

**Pruebas pendientes.** Este diseño cubre criterios de contraste y semántica, pero **no** sustituye las pruebas manuales:
hace falta validar con lector de pantalla (NVDA, JAWS o VoiceOver y TalkBack), navegación solo con teclado, zoom al 200 %,
reflujo a 320 px de ancho y revisión experta de accesibilidad antes de declarar el cumplimiento de WCAG 2.2 AA.

---

## 7. Responsive

| Ancho | Disparador | Paleta |
| --- | --- | --- |
| **Móvil < 768 px** | Icono de lupa en la barra de `MobileNav` | Pantalla completa (`h-dvh`, sin radio ni borde). Entrada `h-14`, texto `text-base`. Filas de 56 px con `pointer-coarse`; el estado va en la línea 1; títulos a 2 líneas. Sin pie de teclado. Respeta el teclado virtual (`dvh`) y la zona segura: la región de resultados lleva `pb-[env(safe-area-inset-bottom)]`. La X de Radix es el cierre. |
| **Tablet 768 a 1023 px** | Icono de lupa en la barra de `MobileNav` (la barra superior de escritorio aparece desde 1024 px) | Tarjeta centrada de 640 px, `top-[12vh]`, alto máximo `min(34rem, 76dvh)`. Pie de teclado solo con puntero fino (`pointer-fine:flex hidden`). |
| **Escritorio ≥ 1024 px** | Botón de la barra superior (`w-56`, `xl:w-72`) y botón del menú lateral (o icono en riel) | Igual que tablet. |

El pie ③ (`hidden shrink-0 items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground pointer-fine:md:flex`):
tres pares «`kbd` + texto»: `↑↓` «moverse», `Intro` «abrir», `Esc` «cerrar». Decorativo (`aria-hidden`); los atajos ya se
describen en `DialogDescription`.

---

## 8. Cambios por archivo (solo para orientar; la implementación es del desarrollador)

| Archivo | Cambio visual |
| --- | --- |
| `components/global-code-search.tsx` | Pasa a ser la paleta (`Dialog`) y los disparadores. `GlobalCodeSearch placement="desktop"` renderiza el botón de la barra superior; `placement="mobile"` el icono. Se elimina el `form role="search"` en línea y los estados `View.help/invalid`. |
| `components/app-sidebar.tsx` | El bloque «Buscar pantalla» (l. ~395-440) pasa a un botón y a un icono de riel (§3.6); se retira el filtrado en línea. |
| `lib/navigation.ts` | Helper de pantallas filtrables (§3.4). |
| `components/mobile-nav.tsx` | Se retira el estado `searching`; la barra no cambia al buscar. |
| `components/app-shell.tsx` | Sin cambio de estructura: el disparador ocupa el lugar del campo actual. |

---

## 9. Criterios de aceptación visual (para `revisor`)

1. Mismos tokens en ambos temas; sin color crudo en la paleta ni en los disparadores.
2. Ctrl/⌘+K abre desde cualquier pantalla y desde campos editables; `/` sigue funcionando; `Esc` devuelve el foco.
3. El grupo «Pantallas» responde sin red; el de «Solicitudes y tareas» muestra cargando, error y sin resultados sin
   ocultar al otro.
4. Una fila deshabilitada explica por qué y no navega.
5. A 390 px la paleta es de pantalla completa, sin desbordes y con objetivos táctiles de 48 px o más.
6. La tabla de contrastes de §6 no tiene filas «Por medir» al fusionar.
