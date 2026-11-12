# Búsqueda global por ID visible en la cabecera. Especificación UX/UI

Especificación visual y de interacción (rol Director de Arte Frontend) para la **búsqueda por código** de la cabecera
del shell (BL-047). El usuario escribe `PRY-0012`, `PRY-0012-F2` o `PRY-0012-T07` y el portal lo lleva a la solicitud,
la fase o la tarea. Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md`, `55-sincronia-api-mcp-docs.md`;
formato y componentes hermanos: `bitacora-selectores.md`, `filtros-seleccion-multiple.md`, `id-chip.tsx`,
`searchable-select.tsx`, `app-shell.tsx`, `mobile-nav.tsx`, `app-sidebar.tsx`. Solo tokens semánticos (prohibido color
crudo y `z-[n]`), foco con `--ring`, español con tildes. **Sin dependencias nuevas.** Sin código de aplicación en este
documento: los fragmentos de clases son especificación.

Los contrastes **no se declaran como medidos** para pares nuevos. Este diseño combina pares de tokens ya medidos en
`identidad-color-menu.md`; los compuestos que no lo estén se listan en §7 y se miden en claro y oscuro antes de fusionar.

---

## 0. Decisiones

| # | Punto | Decisión | Por qué |
| --- | --- | --- | --- |
| B1 | **Qué es** | Un **campo de búsqueda de resultado único**, no un listado. Escribe un código completo, la API lo resuelve y se muestra **una sola fila** de resultado. `Enter` (o clic en la fila) navega. | Un código identifica un solo elemento. Un combobox con varias opciones sería ruido y duplicaría el buscador de `Solicitudes` y `Portafolio` (`?q=`). |
| B2 | **Patrón ARIA** | `form role="search"` con `input` de tipo `search`. La fila de resultado es el **único `option`** de un `listbox` que se asocia con `aria-controls`; mientras hay resultado, es la activa (`aria-activedescendant`), de modo que `Enter` la abre sin flechas. Patrón combobox 1.2 con foco DOM siempre en el input, igual que `SearchableSelect`. | Reutiliza el patrón ya probado del repo y lo anuncian bien los lectores de pantalla. |
| B3 | **Ubicación en escritorio (≥ 1024 px)** | En la **barra superior** (`h-12`, `bg-card/90`), entre las migas (`WorkspaceCrumbs`, a la izquierda) y el grupo de acciones (asistente, notificaciones, usuario, a la derecha). Ancho fijo del campo, sin crecer con el contenido. | Es una acción global y frecuente: la cabecera es su sitio natural, sin tocar el menú lateral ni el `main`. |
| B4 | **Ubicación en móvil (< 1024 px)** | Un **botón de icono «Buscar por código»** (lupa) en la barra móvil, antes del asistente. Al pulsarlo, la barra pasa a **modo búsqueda**: el campo ocupa toda la fila y el resto de controles (menú, marca, asistente, campana, tema, usuario) se oculta. Un botón «Cerrar búsqueda» devuelve la barra normal. | A 390 px no caben seis controles más un campo. Un modo expandido evita un segundo renglón (que movería el `sticky top`) y no usa `Sheet` ni portal. |
| B5 | **Forma corta** | **La API solo acepta la forma completa** (`PRY-0012`, `PRY-0012-F2`, `PRY-0012-T07`). La forma corta (`T07`, `F2`) **no se resuelve** en esta entrega ni en servidor ni en cliente. El mensaje de «no encontrado» y la ayuda del campo enseñan la forma completa. | Sin proyecto a la vista, `T07` es ambiguo (existe una por solicitud). Inferir contexto desde la ruta exigiría que cada pantalla lo publique y daría resultados distintos según dónde se escriba. Se anota como mejora posible en §8. |
| B6 | **Normalización y forma del código** | El cliente normaliza antes de enviar: `trim`, cada tramo de espacios, guiones bajos o guiones largos (`–`, `—`) —también los **intermedios**— pasa a un único `-`, y se pasa a mayúsculas (`PRY 0012 T07` → `PRY-0012-T07`). Un texto «tiene forma de código completo» si, normalizado, cumple **una sola expresión compartida** por la API (validación → 400 antes de consultar) y el web: `/^PRY-\d{4,}(-(F\d+\|T\d+))?$/`, con **longitud máxima de 32 caracteres** (se valida primero la longitud). La API además ignora mayúsculas. | Pegar `pry-0012-t07` o `PRY 0012 T07` debe funcionar. Una sola definición evita que web y API discrepen (fuente: `visible-code.ts`, `formatPhaseCode`/`formatTaskCode`). La constante se exporta desde un módulo único del api-client o se replica con una prueba que la compare. |
| B7 | **Atajo de teclado** | **`/`** (barra) enfoca el campo cuando el foco **no** está en un campo editable (`input`, `textarea`, `select`, `contenteditable`) y **no hay un diálogo modal abierto** (`[role="dialog"]` o `[role="alertdialog"]`). Sin modificadores. `Escape` ver §3. El campo lleva `aria-keyshortcuts="/"` y, en escritorio, una pista visual `kbd` «/». | `/` es el atajo idiomático de búsqueda (GitHub, Jira, Slack…). El repo no tiene atajos globales hoy: el menú lateral (`AppSidebar`) solo reacciona a teclas dentro de su propio input, así que no hay colisión. No se usa `Ctrl/⌘+K` porque Chrome y Firefox lo reservan para su barra de búsqueda en Windows/Linux. |
| B8 | **Una cadena por vez** | El campo no admite varias búsquedas ni mezcla texto libre. Todo lo que no tenga la forma de un código se rechaza **en el cliente** sin llamar a la API (estado «formato no válido», §2.3). | Evita tráfico inútil y deja claro que no es un buscador de texto. |
| B9 | **Resolver con antirrebote** | Cuando lo escrito tiene la forma de un código completo (B6), se llama a la API tras **400 ms** de pausa (la petición previa se cancela con `AbortController`). `Enter` resuelve de inmediato si aún no hay resultado. Mientras llega una respuesta nueva, el panel **conserva el resultado anterior** (sin vaciarlo ni parpadear) con la fila en `aria-busy`; solo se sustituye al llegar la respuesta o al dejar de tener forma de código. | Al teclear `PRY-0012-T07` se pasa por `PRY-0012`, que ya es un código válido: 400 ms evita disparar con ese prefijo y conservar el resultado evita el parpadeo. `Enter` nunca espera un temporizador. |
| B10 | **Destino por permiso** | El destino se calcula en el cliente con los módulos del actor (`allowedModules`) y las rutas que ya existen (§5). Si el actor no tiene ninguna pantalla para ese tipo, la fila se muestra **sin navegar** con un aviso (§2.6). | La API es la fuente del alcance (404 fuera de alcance); el cliente solo elige la pantalla. No se duplican reglas de negocio. |
| B11 | **Después de navegar** | Se limpia el campo, se cierra el panel y, **al llegar a la ruta nueva**, el foco pasa a `main#contenido` (`tabIndex={-1}`). Mecanismo: al navegar, `GlobalCodeSearch` guarda una bandera `pendingFocus`; un `useEffect` del propio componente ligado a `usePathname()` + `useSearchParams()` enfoca `main#contenido` cuando cambian y borra la bandera (no se enfoca en el mismo tick de `router.push`, que actuaría sobre la pantalla anterior). El shell hoy solo tiene el «Saltar al contenido» (`skip-link.tsx`) y **no** mueve el foco por sí mismo, así que no se duplica. En móvil, además, se sale del modo búsqueda. | Quien usa lector de pantalla aterriza en el contenido nuevo y no en un campo ya vacío. Cierra el antiguo pendiente P2. |
| B12 | **Cuándo se monta la búsqueda** | El campo (escritorio y móvil) se renderiza **solo cuando `useActor()` ya cargó y el actor tiene un rol** `JEFE_AREA`, `LIDER_PROCESO` o `INTEGRANTE` (los del endpoint). Con el actor sin resolver, o con `ADMIN` (que el endpoint rechaza con 403), **no se monta** ni el campo ni el botón móvil: no hay hueco ni salto de layout porque el grupo de acciones ya es `shrink-0` y las migas ocupan `flex-1`. Un 403 inesperado se trata como «Error» con el texto «Tu rol no puede buscar por código.» y **sin** «Reintentar». | Evita un control que falla siempre y un parpadeo mientras carga el usuario (ver P5). |
| B13 | **Una sola instancia viva** | El shell monta `GlobalCodeSearch` dos veces (barra de escritorio `hidden lg:flex` y `MobileNav` `lg:hidden`), pero **solo la instancia visible está activa**: se elige con el mismo `matchMedia('(min-width: 1024px)')` que usa `MobileNav` (hook compartido `useIsDesktop`) y la otra **renderiza `null`** (sin `role="search"`, sin región `role="status"`). Todos los ids (`aria-controls`, `aria-describedby`, `aria-activedescendant`, listbox) se generan con `React.useId()`. El atajo `/` lo registra **un único** hook `useCodeSearchShortcut`, montado una vez en el shell, que enfoca la instancia activa (en móvil, abre primero el modo búsqueda y enfoca al montar el input). | Evita ids y regiones `status` duplicados, dos manejadores de `/` y un `focus()` sobre un input con `display:none`. |

---

## 1. Contrato de API propuesto (de solo lectura)

La API es la fuente de verdad (regla 55). Este diseño asume el contrato siguiente; si la implementación lo cambia, se
corrige aquí en el mismo PR.

```text
GET /codes/{code}
roles:     JEFE_AREA, LIDER_PROCESO, INTEGRANTE   (los mismos que GET /tasks/by-code/{code})
code:      PRY-0012 | PRY-0012-F2 | PRY-0012-T07  (sin distinguir mayúsculas)
200:       CodeResolutionDto
400:       formato de código no válido
404:       el código no existe o está fuera del alcance del actor (mismo mensaje en ambos casos)

CodeResolutionDto
  type:         'REQUEST' | 'PHASE' | 'TASK'
  id:           uuid del elemento encontrado
  code:         código canónico en mayúsculas (PRY-0012-T07)
  title:        título de la solicitud, nombre de la fase o título de la tarea
  requestId:    uuid de la solicitud (igual a id si type = REQUEST)
  requestCode:  PRY-0012
  requestTitle: título de la solicitud
  phaseId:      uuid de la fase (solo PHASE y TASK)
  phaseName:    nombre de la fase (solo PHASE y TASK)
  status:       estado del PROPIO elemento (solicitud, fase o tarea); alimenta el StatusBadge del tipo que corresponda
  requestStatus: estado de la SOLICITUD (siempre presente); decide si el Plan es un destino válido (§2.6)
```

Validación en la API: se normaliza a mayúsculas, se comprueba la longitud máxima (32) y la expresión de B6; si no
cumple, 400 sin consultar la base. Pruebas obligatorias de formato: `PRY-12`, `PRY-0012-X1`, `PRY-0012-T` (400) y
`PRY-00012` (válido: 5 dígitos).

Decisiones de contrato:

- **Un solo endpoint genérico** y no tres. El campo del shell no sabe de qué tipo es lo que escribe el usuario; tres
  llamadas en paralelo triplicarían la carga y los 404 de ruido. El tipo lo infiere la API del formato.
- **No devuelve la ruta de destino.** Devuelve los ids y códigos para que el web construya la URL según los módulos
  del actor (B10). Así la API no conoce rutas de la interfaz.
- **404 único** para inexistente y fuera de alcance: no revela la existencia de proyectos ajenos (mismo criterio que
  `tasks/by-code`). El alcance usa `RequestScopeService`, igual que el detalle por id.
- **Sin forma corta** (B5).
- **Relación con BL-048.** `GET /codes/{code}` es el endpoint que usa la **cabecera**. BL-048 pide además resolver
  solicitud y fase por código con el patrón de `GET /tasks/by-code/{code}`: esos endpoints específicos
  (`GET /requests/by-code/{code}`, `GET /plan-phases/by-code/{code}` o equivalente) **se implementan aparte**, con su
  propia respuesta de detalle, y comparten con el genérico el parseo y la validación del código y el alcance. El
  genérico no los sustituye. Cada uno lleva su tool MCP o exclusión motivada.
- **Roles y 403.** `ADMIN` queda fuera (403) y por eso el campo no se monta para ese rol (B12).

---

## 2. Anatomía y estados

### 2.1 Escritorio (≥ 1024 px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐ h-12
│ Seguimiento › Plan            [🔍 Buscar código (PRY-0012)…       /]   ✦  🔔  (JA)  │
└──────────────────────────────────────────────────────────────────────────────────────┘
   migas (flex-1, min-w-0)        campo (w-56 xl:w-72, shrink-0)       acciones
   ░░░░░░░░░░░░░░░░░░░░░░░░ filete degradado de marca (existente) ░░░░░░░░░░░░░░░░░░░░░░
        ┌───────────────────────────────────────────────┐   ← panel de resultado (abajo del campo)
        │ ▌[Tarea]  PRY-0012-T07   Migrar endpoints      │   ← fila (option) con barra de 3 px activa
        │            Fase 2 · PRY-0012 · Portal clientes │
        │                              Intro para abrir  │
        └───────────────────────────────────────────────┘
```

Cambio en `app-shell.tsx` (solo la barra de escritorio): la barra pasa de `justify-between` a mantener
`justify-between`, con `WorkspaceCrumbs` envuelto en un contenedor `min-w-0 flex-1` y el nuevo campo
`GlobalCodeSearch` como segundo hijo (`shrink-0`) antes del grupo de acciones. Las migas se truncan primero.

| Parte | Clases |
| --- | --- |
| Contenedor `form` | `relative shrink-0` + `role="search"` + `aria-label="Búsqueda por código"` |
| Input | `h-8 w-56 rounded-md border border-input bg-background pl-8 pr-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger xl:w-72` |
| Icono de lupa (decorativo, `aria-hidden`) | `Search` de lucide: `pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground` |
| Pista de atajo (decorativa, `aria-hidden`) | `kbd`: `pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5 text-muted-foreground`. Se **oculta** con el campo enfocado o con texto. |
| Botón limpiar (`✕`) | Solo con texto: `absolute right-1 top-1/2 size-6 -translate-y-1/2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring` con `aria-label="Borrar búsqueda"`. Sustituye a la pista. |
| Indicador de carga | `Loader2 size-4 animate-spin motion-reduce:animate-none` en el lugar del `✕` mientras carga (decorativo, `aria-hidden`). |

- Altura de 32 px (`h-8`) en escritorio, acorde con la barra de 48 px. En puntero táctil (`pointer-coarse`) sube a
  `h-10` para no quedar por debajo del mínimo táctil.
- El input tiene `type="search"` con `autocomplete="off"`, `autocapitalize="characters"`, `spellcheck="false"` y
  `enterkeyhint="search"`. El texto no se fuerza a mayúsculas visualmente (`uppercase`) para no alterar lo copiado;
  la normalización ocurre al enviar (B6).
- `placeholder`: «Buscar código (PRY-0012)». No sustituye al nombre accesible: el input lleva
  `aria-label="Buscar por código"`. Distinto del buscador del menú lateral, cuyo nombre es el de su etiqueta
  («Buscar en el menú»), de modo que los nombres accesibles de ambos campos son distintos y no se confunden al navegar por regiones.
- Foco: `outline-ring`, igual que `Input`. La barra tiene `overflow` visible; el panel no se recorta.

### 2.2 Panel de resultado (escritorio y móvil)

Una tarjeta ligera bajo el campo; no es un `Popover` de Radix ni usa portal.

| Parte | Clases |
| --- | --- |
| Panel | `absolute right-0 top-full mt-1.5 w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-card` (en móvil: `left-0 right-0 w-auto`, ver §4) |
| Listbox | `ul role="listbox"` con un solo `li role="option"` |
| Fila (option) | `relative flex min-h-12 items-start gap-3 rounded-lg px-3 py-2 text-left cursor-pointer aria-selected:bg-primary-subtle data-[disabled=true]:cursor-default` (≥ 44 px de alto en móvil con `min-h-12`) |
| Barra de activa | `before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-primary` cuando la fila está activa (la forma, no solo el color, marca la selección) |
| Etiqueta de tipo | Texto «Solicitud», «Fase» o «Tarea» con icono (`FolderKanban`, `Layers`, `ListChecks`), `text-xs font-medium text-muted-foreground`. Nunca solo icono. |
| Código | `IdChip` con `variant="full"` y `copyable={false}` (la fila ya es un control; no se anidan interactivos). |
| Título | `text-sm font-medium text-foreground break-words` (sin recorte; hasta 3 líneas con `line-clamp-3`) |
| Contexto | `text-xs text-muted-foreground break-words`: `Fase · PRY-0012 · Título de la solicitud` (tarea), `PRY-0012 · Título de la solicitud` (fase) o, en la solicitud, solo el nombre del proceso si existe (el estado va en el badge, no se repite) |
| Pie de ayuda | `Intro para abrir` en `text-xs text-muted-foreground`, **fuera** del listbox, alineado a la derecha; oculto en móvil |

- Con estado conocido, se muestra el `StatusBadge` existente a la derecha del título (nunca solo color).
- Si hay resultado, la fila es la opción activa desde el primer momento. Clic o `Enter` navegan. No hay flechas que
  recorrer: con un solo elemento, `↑` y `↓` no hacen nada.

### 2.3 Estados

Cada estado cambia el panel, el `aria-invalid`/`aria-busy` del input y el texto de la región `aria-live` (§2.7).

| Estado | Disparo | Campo | Panel | Texto del panel | Anuncio (aria-live) |
| --- | --- | --- | --- | --- | --- |
| **Reposo** | Sin foco o vacío | Pista `kbd` «/» (escritorio); placeholder | Cerrado | — | Ninguno |
| **Foco vacío** | Campo enfocado sin texto | Sin pista | Cerrado | — | Ninguno |
| **Escribiendo** | Texto que **aún no** forma un código completo (p. ej. `PRY-00`) | `aria-invalid` ausente | Abierto, sin listbox: bloque de ayuda | «Escribe el código completo. Ejemplos: PRY-0012, PRY-0012-F2, PRY-0012-T07.» (`text-sm text-muted-foreground`) | Ninguno (no interrumpir al escribir) |
| **Formato no válido** | Se pulsa `Enter` con un texto que no tiene forma de código | `aria-invalid="true"` | Abierto, aviso | «No es un código válido. Usa PRY-0012, PRY-0012-F2 o PRY-0012-T07.» con icono `CircleAlert` | «Código no válido.» |
| **Cargando** | Código completo, tras 250 ms o `Enter` | `aria-busy="true"`, spinner | Abierto, fila de carga | «Buscando PRY-0012-T07…» con `Loader2` | Ninguno hasta resolver (evita doble ruido) |
| **Encontrado** | 200 | Sin invalid | Abierto, fila de resultado activa | Ver §2.2 | «Encontrado: tarea PRY-0012-T07, Migrar endpoints. Pulsa Intro para abrir.» |
| **Encontrado sin pantalla** | 200 pero el actor no tiene destino (B10, §2.6) | — (`aria-activedescendant` se **mantiene** en la fila para que el lector la lea) | Fila no navegable (`data-disabled`, `aria-disabled="true"`, sigue activa) | «Tu rol no tiene una pantalla para abrir esta tarea.» | «Encontrado, pero tu rol no puede abrirlo.» |
| **No encontrado** | 404 | `aria-invalid="true"` | Abierto, aviso | «No encontramos PRY-0012-T07, o no tienes acceso.» + ayuda «Revisa el código; debe escribirse completo.» con icono `SearchX` | «No se encontró PRY-0012-T07 o no tienes acceso.» |
| **Sin permiso (403)** | 403 inesperado (B12) | `aria-invalid` ausente | Abierto, aviso **sin** acción | «Tu rol no puede buscar por código.» con icono `CircleAlert` | «Tu rol no puede buscar por código.» |
| **Error** | Red, 5xx o timeout (10 s) | `aria-invalid` ausente | Abierto, aviso con acción | «No se pudo buscar. Inténtalo de nuevo.» + botón «Reintentar» (`variant="outline"`, `size="sm"`) | «Error al buscar. Inténtalo de nuevo.» |

- «No encontrado» **no distingue** inexistente de fuera de alcance (coherente con el 404 único). El texto lo dice
  expresamente («o no tienes acceso»).
- Los avisos usan los tokens ya medidos: icono y texto `text-foreground` sobre `bg-popover`; el icono de tipo
  (`danger`/`warning`) acompaña, nunca sustituye al texto. No se pinta el fondo del panel con colores de estado.
- **Reintentar** vuelve a «Cargando» con el mismo código y devuelve el foco al input si el botón desaparece.
- Un `400` de la API (formato no válido que el cliente dejó pasar) se trata como «Formato no válido».
- Si el usuario cambia el texto durante «Cargando», se cancela la petición y se vuelve a «Escribiendo»/«Cargando»
  según el nuevo texto. Una respuesta tardía de una petición cancelada **se descarta**.
- `prefers-reduced-motion`: el spinner no gira (`motion-reduce:animate-none`) y el panel aparece sin transición.
  `forced-colors`: la barra de activa y el borde del panel usan `forced-color-adjust` por defecto (el borde basta).

### 2.4 Qué se muestra por tipo de código

| Código escrito | Tipo | Etiqueta | Título | Contexto |
| --- | --- | --- | --- | --- |
| `PRY-0012` | Solicitud | «Solicitud» | título de la solicitud | nombre del proceso (si existe); badge con `status` |
| `PRY-0012-F2` | Fase | «Fase» | nombre de la fase | `PRY-0012 · Título de la solicitud`; badge con `status` de la fase |
| `PRY-0012-T07` | Tarea | «Tarea» | título de la tarea | `Fase · PRY-0012 · Título de la solicitud`; badge con `status` de la tarea |

### 2.5 Teclado

| Tecla | Dónde | Efecto |
| --- | --- | --- |
| `/` | En cualquier parte salvo campo editable o diálogo modal abierto | Enfoca el campo (y en móvil abre el modo búsqueda). `preventDefault` para que no escriba «/» en el campo. |
| `Enter` | Campo | Resuelve (si no hay resultado) y, con resultado y destino, **navega**. Sin destino, no hace nada y se anuncia el aviso. |
| `Escape` | Campo con panel abierto | Cierra el panel y conserva el texto. |
| `Escape` | Campo con panel cerrado y texto | Borra el texto. |
| `Escape` | Campo vacío | Hace `blur()` del campo **sin** devolver el foco a otro elemento (no se recuerda el anterior) y, en móvil, sale del modo búsqueda (el foco pasa al botón «Buscar por código»). |
| `Tab` | Campo | Solo en estado «Error» va a «Reintentar» (siguiente en el orden del DOM, dentro del `form`). En cualquier otro estado sale del campo y cierra el panel. |
| `↑` / `↓` | Campo | Sin efecto con un único resultado. No se capturan para no bloquear el desplazamiento. |

- El atajo `/` **no** se registra si el evento ya fue manejado (`defaultPrevented`) ni con `ctrl`, `meta` o `alt`.
- No hay conflicto con el menú: `AppSidebar` solo maneja `Enter` y `Escape` **dentro de su propio input**, y el menú
  móvil es un `Sheet` modal (el atajo se desactiva con diálogo modal abierto).
- El cierre por clic/toque fuera lo cierra sin borrar el texto: `focusout` del `form` cierra **solo si
  `relatedTarget` queda fuera del `form`**; el panel y «Reintentar» son hijos del `form`, así que cuentan como
  «dentro». No hay listener global de `pointerdown`.

### 2.6 Destinos de navegación por tipo

Rutas que **ya existen** hoy. El destino se elige por los módulos del actor (`allowedModules`); el primero que cumpla
gana. La navegación usa `router.push`.

| Tipo | 1.º | 2.º | 3.º | Sin ninguno |
| --- | --- | --- | --- | --- |
| **Solicitud** | `requests` → `/demanda/solicitudes/{id}` (ficha) | `portfolio` → `/seguimiento/portafolio/{id}` | `plan` **y** `requestStatus` planificable → `/seguimiento/plan?requestId={id}` | Fila no navegable |
| **Fase** | `plan` **y** `requestStatus` planificable → `/seguimiento/plan?requestId={requestId}&phaseId={phaseId}` | `requests` → `/demanda/solicitudes/{requestId}` | `portfolio` → `/seguimiento/portafolio/{requestId}` | Fila no navegable |
| **Tarea** | `plan` o `assigned` → `/seguimiento/tareas?taskId={id}` (detalle de tarea; **existe**) | `requests` → `/demanda/solicitudes/{requestId}` | `portfolio` → `/seguimiento/portafolio/{requestId}` | Fila no navegable |

Decisiones de destino:

- **«Planificable»** es el mismo conjunto de estados de solicitud que el Plan acepta hoy para adoptar `?requestId=`
  (comprometida, en planificación o en ejecución; la implementación lo toma de la misma constante que usa
  `plan-view.tsx`, no lo copia). Fuera de ese conjunto (cerrada, cancelada, etc.), el Plan mostraría `NOT_PLANNABLE`
  y limpiaría el parámetro, así que el destino cae a la ficha o al portafolio. `requestStatus` llega en el
  `CodeResolutionDto` (§1) precisamente para decidir esto sin una segunda llamada.
- **Tarea con `plan` no planificable**: el destino de tarea (`/seguimiento/tareas?taskId=`) no depende del Plan y
  no necesita `requestStatus`.
- **Tarea → página de detalle (`/seguimiento/tareas?taskId=`)**. Es el único deep link a tarea que existe hoy (lo usa
  «Mi trabajo»). El Plan abre el detalle como panel lateral pero **sin parámetro de URL**, así que no se promete.
  Mejora posible, fuera de este PR: `?taskId=` en el Plan para abrir el panel en contexto (§8).
- **Fase → Plan con `phaseId`**. El Plan hoy solo lee `?requestId=`. Para esta entrega, la vista del Plan debe
  **aceptar `?phaseId=`** con este comportamiento exacto (P3):
  1. Lee `phaseId` **una sola vez** al montar y lo guarda en una referencia.
  2. **Espera** a que `planState === 'success'` y a que las fases estén cargadas (`fetchPlan` → `listPhases`);
     mientras tanto no hace nada, así que la carga posterior de fases no pierde la carrera.
  3. Hace `scrollIntoView({ block: 'start' })` sobre el elemento con `id="fase-{phaseId}"`, que es la **cabecera de la
     fase** (la fila o tarjeta de fase) y existe en la vista de tabla y en la de tablero; si la fase está contraída
     u oculta, la expande antes. La marca unos segundos con `ring-2 ring-ring` (sin color nuevo; sin animación con
     `prefers-reduced-motion`).
  4. Después **quita `phaseId` de la URL** con `router.replace` **conservando `requestId`** (a diferencia de
     `useRequestIdParam.setRequestId`, que reemplaza toda la query y borraría `phaseId` antes de usarlo). Así una
     selección posterior de solicitud no arrastra un `phaseId` viejo.
  5. Si la fase no existe en el plan, no hace nada y **no muestra error**.
  Es el único cambio de pantalla fuera de la cabecera que este diseño exige.
- **Solicitud → ficha** si el actor ve «Solicitudes», porque es la pantalla que concentra los datos de la solicitud
  (la convención actual de los enlaces a una solicitud, p. ej. en Priorización y Revisión). Si no, portafolio.
- La API ya filtró por alcance: el cliente **nunca** reintenta con otra ruta ante un 403/404 de la pantalla destino;
  eso lo resuelve la propia pantalla.
- Un enlace dentro del panel es una **fila `option`**, no un `<a>`. Aun así, la fila lleva `data-href` solo para las
  pruebas; no se ofrece «abrir en pestaña nueva» (los códigos se pegan en el campo desde cualquier sitio).

### 2.7 Accesibilidad (aria-live, nombres, foco)

- **Región de estado** `div role="status" aria-live="polite" aria-atomic="true" className="sr-only"`, **siempre
  montada en la instancia activa** (aunque vacía; la instancia inactiva no renderiza nada, B13) y **fuera** del listbox, hermana del panel. Cambia su texto según la columna «Anuncio» de
  §2.3. `polite`, no `assertive`: ningún estado es urgente. «Error» y «No encontrado» se anuncian igual de forma
  educada; son resultados de una acción del usuario (`Enter`), no alertas del sistema.
- No se anuncia mientras se escribe ni en «Cargando» (evita ruido). Un texto idéntico consecutivo se re-anuncia
  alternando un carácter invisible o limpiando el nodo antes de escribir (técnica ya usada para el contador de
  `SearchableSelect`).
- **Nombres**: `role="search"` + `aria-label="Búsqueda por código"`; input `aria-label="Buscar por código"`;
  `aria-describedby` apunta a un `id` oculto con la ayuda («Escribe un código completo, por ejemplo PRY-0012-T07.
  Pulsa / para llegar aquí desde cualquier página.»); `aria-keyshortcuts="/"`.
- **Combobox**: `role="combobox"` en el input con `aria-expanded` (panel con listbox abierto), `aria-controls`
  (id del listbox), `aria-autocomplete="none"` (no completa texto), `aria-haspopup="listbox"` y
  `aria-activedescendant` (id de la fila) solo en «Encontrado». Los paneles de ayuda y aviso **no** son listbox: se
  pintan como `div` y `aria-expanded` queda en `false` mientras se muestran.
- `aria-invalid` solo en «Formato no válido» y «No encontrado».
- La fila de resultado tiene nombre accesible por su contenido: «Tarea, código PRY-0012-T07, Migrar endpoints, fase 2,
  PRY-0012». El `IdChip` no copiable ya añade «Código » como `sr-only`.
- Contraste y objetivos: texto normal 4.5:1, bordes de control 3:1 (WCAG 2.2 AA); objetivos táctiles ≥ 44 px en
  móvil (campo `h-11`, fila `min-h-12`, botones `size-11`). Medir en ambos temas (§7).
- Sin trampas de foco: el panel no es modal y no atrapa `Tab`.

---

## 3. Móvil (< 1024 px)

`MobileNav` es una barra `h-14` con menú, marca, asistente, campana, tema y usuario. A 390 px no hay sitio para un
campo, y un segundo renglón desplazaría el `sticky` y el filete degradado. Se añade un **modo búsqueda** dentro de la
misma barra.

```
Normal:   [☰]  GIBO            [✦][🔍] [🔔] [☾] (JA)
Búsqueda: [🔍 Buscar código (PRY-0012)…          ✕]  [Cerrar]
          ┌───────────────────────────────────────┐
          │ ▌Tarea  PRY-0012-T07                   │  panel a todo el ancho
          │ Migrar endpoints                       │
          │ Fase 2 · PRY-0012 · Portal de clientes │
          └───────────────────────────────────────┘
```

| Parte | Clases / comportamiento |
| --- | --- |
| Botón de búsqueda | `Button variant="ghost" size="icon"` con `Search` y `aria-label="Buscar por código"`, `aria-expanded` del modo, 44×44 (`size-11`). Va **antes** de `AssistantTrigger` dentro de `ml-auto flex items-center gap-1`. Sin tooltip (mismo criterio que «Abrir menú»: el foco regresa a él). |
| Barra en modo búsqueda | Mismos contenedor y filete. Se **ocultan** (`hidden`, no se desmontan) menú, marca, asistente, campana, tema y usuario; el `form` ocupa `flex-1`. El filete degradado se conserva. |
| Campo | `h-11 w-full min-w-0 rounded-md border border-input bg-background pl-9 pr-10 text-base sm:text-sm` (16 px en móvil para evitar el zoom automático de iOS). |
| «Cerrar» | `Button variant="ghost" size="sm"` con texto «Cerrar» y `aria-label="Cerrar búsqueda"`. |
| Panel | `absolute inset-x-2 top-full mt-1.5` (ancho de pantalla menos márgenes); misma fila (§2.2). |
| Entrada | Al activar el botón, el modo se abre y el foco pasa al input (`autoFocus` por efecto, no por atributo). |
| Salida | Con «Cerrar», `Escape` con campo vacío, o tras navegar: se vuelve a la barra normal y el foco regresa al botón «Buscar por código» (salvo tras navegar: ver B11). Los controles ocultos recuperan su orden de tabulación. |
| Rotación o paso a ≥ 1024 px | Mismo `matchMedia('(min-width: 1024px)')` que `MobileNav` ya usa para el cajón: al cruzar, se sale del modo búsqueda y se limpia el panel. |

- El teclado virtual: el panel está en el flujo del `header` `sticky top-0`, así que sigue visible bajo el campo. Se
  limita su alto con `max-h-[min(20rem,60dvh)] overflow-y-auto`. El bloque de ayuda de «Escribiendo» es corto y cabe.
- Sin atajo de teclado en móvil. `/` sigue funcionando con un teclado físico (abre el modo búsqueda).
- No se usa `Sheet`: abrir un diálogo modal desde la cabecera bloquearía el scroll y el atajo, y el resultado ya está
  en la propia barra.

---

## 4. Tokens y clases (resumen)

Todo con tokens semánticos ya definidos en `globals.css`. **No se crea ningún token ni valor de color.**

| Elemento | Claro | Oscuro | Token |
| --- | --- | --- | --- |
| Barra | lienzo claro translúcido | marino translúcido | `bg-card/90` (existente) |
| Campo | fondo `--background` sobre la barra | ídem | `bg-background`, `border-input` |
| Texto del campo | marino | blanco | `text-foreground` |
| Placeholder, lupa, pista, ayuda | gris-azulado | gris-azulado claro | `text-muted-foreground` |
| Panel | blanco | superficie `--popover` | `bg-popover`, `text-popover-foreground`, `border-border`, `shadow-card` |
| Fila activa | azul muy suave | azul muy suave | `bg-primary-subtle` + barra `bg-primary` |
| Chip de código | gris neutro | gris neutro | `IdChip` (sin cambios) |
| Foco | azul eléctrico | azul eléctrico | `outline-ring` |
| Error de campo | rojo del sistema | ídem | `border-danger`, `outline-danger` |

- No hay `z-*` nuevos. El panel es hijo `absolute` de la barra, que ya es `sticky top-0 z-30`; hereda esa capa y
  queda **sobre** el `main`. Debe verificarse que el panel del asistente y los `Sheet` (que viven en portal y capas
  superiores) siguen por encima (pendiente P4).
- No se usa `bg-blue-*`, `text-gray-*`, ni un `shadow` arbitrario. `shadow-card` es la utilidad existente.
- `kbd` usa `font-mono`, permitido por `25-marca-gibo.md` para códigos que se leen carácter a carácter.

---

## 5. Modo claro y oscuro

- **Claro («Lienzo Claro»):** barra clara translúcida, campo `--background` (gris-azulado del lienzo) con borde
  `border-input` visible, panel blanco con sombra suave. La fila activa lleva `primary-subtle` y la barra de 3 px.
- **Oscuro («Dark Tech»):** barra marino translúcida, campo `--background` marino profundo, panel `--popover` más claro
  que el fondo para separar niveles. No se invierten logos ni se aplican filtros.
- Ambos temas se capturan a 1440, 1024 y 390 px (§7). El paso de tema no cambia dimensiones ni posición.

---

## 6. Responsive (resumen)

| Ancho | Barra | Campo | Panel |
| --- | --- | --- | --- |
| ≥ 1280 (`xl`) | `h-12` | `w-72` + pista `/` | `w-[28rem]` anclado a la derecha del campo |
| 1024-1279 | `h-12` | `w-56` + pista `/` | ídem; las migas se truncan antes que el campo |
| < 1024 | `h-14` (`MobileNav`) | botón de icono; modo búsqueda a ancho completo | `inset-x-2`, ancho de pantalla |
| 390 (verificación) | igual que < 1024 | `h-11`, 16 px | filas `min-h-12` |

390 px es el ancho de **verificación**, no un breakpoint.

---

## 7. Verificación, pruebas y medición

Pares a **medir** (no se estiman) en claro y oscuro:

- `text-muted-foreground` sobre `bg-background` (placeholder, lupa) y sobre `bg-popover` (ayuda, contexto, pie).
- `text-muted-foreground` sobre `bg-muted` (`kbd`).
- `text-foreground` sobre `bg-primary-subtle` (fila activa) y borde de la barra `bg-primary` contra `bg-popover` (3:1).
- `border-input` contra `bg-background` y `bg-card/90` (3:1).

Pruebas Playwright (selectores por rol y nombre, no por clases):

1. Escritorio: `/` enfoca el campo; escribir `PRY-xxxx` muestra la fila de solicitud; `Enter` abre la ficha.
2. `PRY-xxxx-F1` abre el Plan con la fase visible; `PRY-xxxx-T01` abre el detalle de tarea.
3. Código inexistente → «No encontramos…» con el `role="status"` actualizado.
4. Texto inválido + `Enter` → «No es un código válido».
5. `Escape` (cerrar, borrar, salir) y `Tab` según §2.5.
6. `/` **no** actúa dentro de un `input`/`textarea` ni con un diálogo abierto.
7. Móvil (390): botón «Buscar por código» → modo búsqueda → resolver → navegar; «Cerrar» devuelve la barra normal.
8. Minúsculas (`pry-xxxx-t01`) y con espacios (`PRY 0012 T07`) resuelven.
9. Error de red (ruta interceptada) → «No se pudo buscar» y «Reintentar».
10. Un integrante sin acceso a la solicitud → «No encontramos… o no tienes acceso».
11. `ADMIN` o actor sin resolver: no hay campo ni botón de búsqueda en el DOM.
12. Fase de una solicitud no planificable (cerrada/cancelada) → abre la ficha o el portafolio, no el Plan.
13. Solo una región `role="status"` y un `role="search"` en el DOM a 1440 y a 390 px (sin ids duplicados).
14. Tras navegar, el foco queda en `main#contenido` de la ruta nueva.
15. axe sobre la cabecera en cada estado (reposo, encontrado, no encontrado, error) en claro y oscuro.

Unitarias (sin red): normalización (B6, incluidos espacios intermedios), forma del código (`PRY-12`, `PRY-0012-X1`,
`PRY-0012-T` inválidos; `PRY-00012` válido; más de 32 caracteres inválido), elección del destino por módulos y por
`requestStatus` (§2.6). En la API, las mismas cadenas contra la validación del endpoint (400 / 200 / 404).

---

## 8. Pendientes y mejoras posibles

| # | Tema | Tratamiento |
| --- | --- | --- |
| P1 | **Contrato** | Esta spec fija un endpoint genérico `GET /codes/{code}`; el nombre y la forma exactos los cierra la implementación y se reflejan aquí si cambian. |
| P2 | **Foco al navegar** | Resuelto en B11 (el shell no lo hace hoy; lo hace `GlobalCodeSearch` con `pendingFocus`). |
| P3 | **`?phaseId=` en el Plan** | Cambio en `plan-view.tsx` con el comportamiento exacto de §2.6 (lectura única, espera a `planState === 'success'`, ancla `id="fase-{phaseId}"`, limpieza de la URL conservando `requestId`). Si no se hace, la fase abre el Plan sin desplazarse y se anota. |
| P4 | **Capas** | Verificar con capturas que el panel queda bajo los `Sheet`/asistente y sobre el `main`, y que no tapa el filete degradado ni genera scroll horizontal. Ver memoria `control-phari-layout-menu-fijo-capas`. |
| P5 | **Shell en e2e** | Los e2e usan JWT y el shell de usuario (memoria `control-phari-e2e-jwt-y-shell-usuario`): la búsqueda aparece solo con el actor ya resuelto y con rol permitido (B12); no debe romper `shell-navigation`. |
| P6 | **Forma corta** | Mejora posible: aceptar `T07`/`F2` solo cuando la ruta publique el `requestId` en contexto (Plan, ficha). Fuera de este PR (B5). |
| P7 | **Deep link de tarea en el Plan** | Mejora posible: `?taskId=` en el Plan para abrir el panel lateral en contexto. Fuera de este PR (§2.6). |

---

## 9. Respuesta a la revisión de diseño

| # | Hallazgo | Resolución |
| --- | --- | --- |
| 1 | Cuándo se muestra y 403 | Atendido: B12, fila «Sin permiso (403)» en §2.3, §1 (roles). |
| 2 | Expresión de código | Atendido: B6 (regex compartida, 32 caracteres, espacios intermedios), pruebas en §1 y §7. |
| 3 | Plan en solicitudes no planificables | Atendido: `requestStatus` en el DTO (§1), regla en §2.6 y prueba 12. |
| 4 | `?phaseId=` en el Plan | Atendido: lectura única, espera, ancla `fase-{phaseId}`, limpieza conservando `requestId` (§2.6, P3). |
| 5 | Doble montaje | Atendido: B13 (`useId`, instancia activa única, hook de atajo único, `null` en la inactiva). |
| 6 | Foco y teclado | Atendido: B11 con `pendingFocus`, `Escape` vacío con `blur()`, `Tab`/«Reintentar» y `focusout` en §2.5. |
| 7 | Dos `searchbox` | Atendido: reescrito en §2.1 (nombres accesibles distintos). |
| 8 | `text-[0.6875rem]` | Atendido: `text-meta` (token existente); §4 sigue sin crear tokens. |
| 9 | Antirrebote y parpadeo | Atendido: 400 ms y resultado anterior conservado (B9). |
| 10 | Estado duplicado | Atendido: el estado va en el badge; el contexto de solicitud no lo repite (§2.2, §2.4). |
| 11 | `aria-activedescendant` sin pantalla | Atendido: se mantiene con `aria-disabled="true"` (§2.3). |
| 12 | Relación con BL-048 | Atendido: aclarado en §1; los endpoints específicos se implementan aparte. |
