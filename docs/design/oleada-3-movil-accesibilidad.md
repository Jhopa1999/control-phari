# Oleada 3 · PR-C «Móvil y accesibilidad»

Especificación visual previa. Solo especificación: no hay código de la aplicación
en este cambio. Cubre los ítems 5 y 6 de la oleada 3 y los P2 de 2.1, 4.3 y 6.7
de `docs/plan-mejora/README.md`.

Base: `docs/design/tarjetas-moviles-bl-024.md` (patrón de `DataCardList`, que ya
existe en `components/data-card-list.tsx`), `.kiro/steering/25-marca-gibo.md` y
`globals.css`. Todo valor de color es un token semántico; no hay colores crudos.

Revisión de diseño: no existe `.agents/tasks/oleada-3/design-review-c.json`, así
que no hay hallazgos previos que corregir. Si aparece, este documento se
revisa contra su `reviewDoc`.

## 0. Resumen de decisiones

| Tema | Decisión |
| --- | --- |
| Tarjetas | Se reutiliza `DataCardList`. Se le añaden cuatro piezas pequeñas: ranura `code` (IdChip sobre el título), ranura `footer` (botones a todo el ancho), `tone="danger"` y `wide` en un metadato. Ver §1.2. |
| Aprobar y Devolver | Quedan **visibles** en el pie de la tarjeta, no en el menú «…». |
| `IdChip` | `h-5` pasa a `min-h-6 min-w-6` (24 × 24 px). |
| Campana en oscuro | `bg-danger text-white` mide 2,27:1. Pasa a `bg-destructive text-destructive-foreground` (5,35:1 en oscuro, 5,82:1 en claro). No hace falta token nuevo. |
| «Vencido» | `--danger` claro baja de L 0,50 a **0,47**. Sube el peor caso de 4,37:1 a 4,90:1. El tema oscuro no cambia (5,94:1). |
| Presupuesto de IA | El `id` de `Field` hoy cae en un `<div>`, no en el `<input>`. Se corrige con `children` como función. Además se aclara la etiqueta del umbral. |
| Pestañas de Reuniones | `TabsList` con `max-w-full overflow-x-auto`; el ancho de la página no cambia. |

## 1. Tarjetas móviles

### 1.1 Reglas comunes (heredan BL-024 §2 y §4)

- Corte `md` (768 px). Tabla `hidden md:block`; lista `md:hidden`. A 1440 px
  nada cambia: la tabla sigue igual y la lista no existe en el árbol de
  accesibilidad.
- A 390 px: página `p-4` (358 px) → `ul` `p-3` (334 px) → tarjeta `p-3`
  (310 px de contenido). A 320 px quedan 240 px de contenido.
- Superficie de la tarjeta: `rounded-lg bg-muted/40 p-3`. En **oscuro** se añade
  `dark:ring-1 dark:ring-inset dark:ring-border`, porque `muted` (L 0,275) sobre
  `card` (L 0,245) apenas se distingue. El anillo es decorativo; la tarjeta no
  es un control.
- Título: `CellTitle touch` (`min-h-11 inline-flex items-center`,
  `text-sm font-medium text-foreground`, `line-clamp-2 wrap-break-word`).
- Metadatos: `dl` en dos columnas, `dt` visible `text-muted-foreground`, `dd`
  `text-foreground tabular-nums`. Los valores vacíos se omiten salvo que la vista
  ponga «—».
- Badges: solo `StatusBadge`, `PriorityBadge variant="compact"`, `DueBadge` y
  `Badge`. Siempre con etiqueta; el icono acompaña, el color no va solo. Máximo
  3 por tarjeta.
- Objetivos táctiles: 44 × 44 px en título, menú «…», botones de pie y
  «Ordenar por». Separación mínima `gap-2` (8 px). El `IdChip` mide 24 px
  (mínimo AA, WCAG 2.5.8) y va separado ≥ 8 px de cualquier otro control.
- Orden: `Select` «Ordenar por» solo donde la tabla tiene cabeceras ordenables
  (Plan tareas y Capacidad resumen). Sin él en las demás.

### 1.2 Ajustes a `DataCardList` (cuatro, todos de presentación)

```tsx
interface DataCard {
  code?: React.ReactNode;       // NUEVO: IdChip(s) sobre el título
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode[];
  note?: React.ReactNode;
  meta?: { label: string; value: React.ReactNode; wide?: boolean }[]; // wide: NUEVO
  actions?: React.ReactNode;    // arriba a la derecha: «…» o un solo botón compacto
  footer?: React.ReactNode;     // NUEVO: botones a todo el ancho
  tone?: 'default' | 'danger';  // NUEVO
}
```

| Pieza | Clases |
| --- | --- |
| `code` | `<div className="mb-1 flex flex-wrap items-center gap-2">` antes del título. No va dentro del `span.truncate` del subtítulo: `overflow:hidden` recortaría el contorno de foco del chip. |
| `wide` | `col-span-2` en el `div` del metadato. |
| `footer` | `<div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 [&>*]:h-11 [&>*]:w-full">`. Con un solo botón: `grid-cols-1`. |
| `tone="danger"` | Sustituye `bg-muted/40` por `border-l-4 border-l-danger bg-danger-subtle/50`. La alerta nunca es solo el borde: siempre hay un badge con texto. |
| Esqueleto | `CardListSkeleton` acepta `withFooter` (una `Skeleton` `h-11 w-full` al final). |

`RowActions` gana `footer?: boolean`. Con él, las acciones `placement:'inline'`
se pintan como botones `h-11 w-full` (variante `default` para la acción
afirmativa, `outline` para el resto) y las `placement:'menu'` van al «…» del
cabezal de la tarjeta. Sin `footer`, `menuOnly` sigue como en BL-024.

Regla para elegir:

| Situación | Dónde van las acciones |
| --- | --- |
| Dos acciones que son el motivo de la pantalla (Aprobar y Devolver) | `footer`, visibles |
| Una acción principal y única (Ver cambio, Revocar, Reenviar invitación) | `actions` como botón compacto `h-11`, o `footer` si el texto es largo |
| Varias acciones secundarias (Editar, Eliminar) | `menuOnly` («…», 44 × 44 px) |

### 1.3 `id` duplicados y foco al quitar una fila

Tabla y tarjetas viven a la vez en el DOM (una con `display:none`). Dos
consecuencias que el implementador debe resolver:

1. `RowAction.id` se usa con `document.getElementById` para devolver el foco
   (`taskActionId`, `assignmentActionId`, `inviteButtonId`, `revokeButtonId`).
   En la tarjeta el id lleva el sufijo `-card`. El código que devuelve el foco
   prueba ambos y elige el que tenga `offsetParent !== null`.
2. En Aprobaciones, `focusTargetAfterRemoval(bodyRef, rowIndexRef, headingRef)`
   lee el `tbody`. Cada variante necesita su referencia: la `ul` de tarjetas
   lleva `ref` y el índice de fila sirve igual. Tras aprobar o devolver, el foco
   pasa a la tarjeta siguiente (su título), o al encabezado de la sección si no
   quedan.

### 1.4 Campos por tabla

Convención: **T** título, **S** subtítulo, **C** `code`, **B** badges, **M**
metadatos (`dt → dd`), **A** `actions`, **F** `footer`, **N** `note`.
`list` es el `aria-label` de la lista.

#### 2.5 Aprobaciones (`/administracion/revision`)

Cuatro tablas, cuatro listas. Aprobar y Devolver o Rechazar van en el pie,
con el `ConfirmDialog` y el `DevolverDialog` existentes. Sin permiso de
decidir (`canDecide` o `isJefe` falsos) el pie se sustituye por el texto
«Solo lectura» (`text-sm text-muted-foreground`, sin botones).

| Tabla | list | C | T | S | B | M | F |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Compromisos por aprobar (`revision-view`) | Compromisos por aprobar | `IdChip` full (`req.code`) | `CellTitle touch href` a la solicitud | — | `PriorityBadge compact` | Registro → `formatDate` | **Aprobar** (`default`, icono `Check`), **Devolver** (`outline`) |
| Planes por autorizar (`plan-authorization-section`) | Planes por autorizar | `IdChip` full (`request.code`) | `CellTitle touch href` al plan | — | `StatusBadge plan` | — | acciones de `rowActions(row, index)`, en el mismo orden y con las mismas condiciones |
| Documentación por aprobar (`pending-reviews-sections`) | Documentación por aprobar | — | `CellTitle touch href` al documento | «Documentación de cierre» solo si `categoryCode === 'CIERRE'` | — | Enviado → `formatDateTime` | **Aprobar**, **Rechazar** (`outline`) |
| Cierres por aprobar (`pending-reviews-sections`) | Cierres por aprobar | `IdChip` full (`requestCode`) | `CellTitle touch href` a la solicitud | «Solicitado por {nombre}» si existe | — | Solicitado → `formatDateTime` | **Aprobar cierre**, **Rechazar** (`outline`) |

Estados del pie:

- **Ocupado**: el botón muestra spinner y «Aprobando…» (`busyLabel` actual); el
  otro botón queda `disabled`. La tarjeta lleva `aria-busy="true"`.
- **Deshabilitado**: `opacity-50` del `Button`; si hay motivo, `DisabledHint`
  como en la tabla.
- **Éxito**: la tarjeta sale de la lista, el toast existente se anuncia y el
  foco sigue la regla de §1.3.
- **Vacío y error**: los de `DataView`, sin cambios («Reintentar» a 44 px).

Texto de los botones en 320 px: «Aprobar cierre» necesita ≈ 127 px y en 320 px
cada botón dispone de 116 px. Por eso `footer` apila en una columna por debajo
de 360 px.

#### 3.1 Planificación (`/seguimiento/plan`)

Hay **dos** tablas con desborde: fases (7 columnas) y tareas (7 columnas). No
existe una tabla de dependencias en esta vista; las predecesoras son un badge
dentro de la fila de la tarea. El árbol de fases, si se muestra apilado, no
cambia.

| Tabla | list | C | T | S | B | M | A / F |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fases | Fases del plan | `IdChip short` (`F2`) | Nombre de la fase | Entregable (1 línea; vacío si no hay) | — | Fechas → `inicio → fin`; Tareas → número | A: `menuOnly` (solo con `canEdit`) |
| Tareas | Tareas del plan | `IdChip short` (`T07`) | `CellTitle touch` → abre el detalle | Nombre de la fase solo si `phases.length > 1` | `Hito` (`Badge outline`), «N predecesoras pendientes» (`Badge warning`, icono `Link2`), plazo vencido (`Badge danger`, icono `AlarmClock`) o próximo (`Badge warning`) | Responsable → nombre; Avance → `N %`; Plazo → `inicio → fin` o «Sin fechas» | A: `menuOnly` Editar y Eliminar tarea (solo `canEdit`). F: `TaskStatusControl` a todo el ancho |

Decisiones de la tarea:

- El **estado** sigue editable en la tarjeta porque el integrante lo cambia en
  ejecución aunque el plan no sea editable. Va en el pie: `Select` de 44 px de
  alto con su `aria-label` actual. Si está bloqueado, el motivo
  (`BlockedReasonLine`) aparece en `note` (`line-clamp-2`) y el control mantiene
  `disabledReason`.
- **Responsable** y **avance** pasan a solo lectura en la tarjeta. Se editan
  con «Editar» o desde el detalle que abre el título. Tres selectores en línea
  en 310 px de ancho no caben sin apilarse; con dos que ya son estados el
  bloque pasaría de 330 px de alto. Supuesto a verificar: el detalle de la
  tarea (`detailTaskId`) permite cambiar responsable y avance. Si no lo permite,
  el pie incluye también `TaskProgressControl` (ver «Puntos abiertos»).
- «Ordenar por» ofrece **Plazo** y **Estado** (las dos cabeceras ordenables).

#### 3.2 Capacidad (`/activos/capacidad`)

| Tabla | list | C | T | B | M | A |
| --- | --- | --- | --- | --- | --- | --- |
| Resumen de carga | Resumen de carga por persona | — | Nombre de la persona | `StatusBadge capacity` con `srDescription` actual; `Badge outline` «Holgura» si `tieneHolgura`; `Badge warning` «Plan supera lo disponible» si `planSobreDisponible` | Disponible; Comprometido; Libre; Planificado; **Utilización** (`wide`, `UtilizationBar`); **Utilización plan** (`wide`, `UtilizationBar`) | — |
| Disponibilidad | Disponibilidad del mes | — | Nombre de la persona | — | Horas disponibles → `formatHours` | `menuOnly` → Editar |
| Asignaciones | Asignaciones del mes | `IdChip` full (`requestCode`) | Nombre de la persona | — | Proceso; Horas; Solicitud (`wide`, título a 2 líneas, `title=` completo); Descripción (`wide`, `line-clamp-2`, solo si existe) | `menuOnly` → Editar, Eliminar (`tone danger`) |

Reglas del resumen:

- `tone="danger"` cuando `sobrecargada` (hoy la fila usa `bg-danger-subtle/50`).
  Va siempre con el `StatusBadge` de sobrecarga, así que el color no es la única
  señal.
- **Libre** negativo: valor en `text-danger` y se añade «(sobre lo disponible)»
  en `text-meta`. Ejemplo: «−4 h (sobre lo disponible)».
- Estado `CARGA_PARCIAL`: el texto explicativo actual («Esta persona tiene
  asignaciones en procesos fuera de tu alcance…») va en `note`.
- `UtilizationBar` conserva su `label`, `aria-valuenow` y el porcentaje en
  texto. Alto de barra `h-2`, ancho completo de la columna doble.
- «Ordenar por»: Persona, Utilización, Utilización plan.
- Eliminar una asignación usa el `ConfirmDialog` existente; el foco vuelve
  según §1.3.

#### 4.3 Reuniones y compromisos (`/seguimiento/reuniones`)

- **Mis compromisos abiertos** hoy tiene tabla y una `ul` propia (`md:hidden`,
  con estilo distinto: `rounded-xl bg-card shadow-card`). Se migra a
  `DataCardList` para que las ocho listas se vean igual.
- **Compromisos** y **Actas** no son tablas: usan `MasterDetail` +
  `SelectableList`, que ya apila. No se tarjetizan. Se verifica a 390 y 320 px
  que título, `StatusBadge` y `DueBadge` envuelven sin desbordar.
- Lista «Compromisos del acta» (dentro del detalle del acta): se queda como
  está (`ul` con `li` de `rounded-md border`). Solo se verifica su ancho.

| Lista | list | T | S | B | M | F |
| --- | --- | --- | --- | --- | --- | --- |
| Mis compromisos abiertos | Compromisos abiertos de mis reuniones | Título del compromiso (`font-medium`, sin enlace) | Resultado esperado, como `note` con `line-clamp-2` | `DueBadge`, `StatusBadge record` | Asignado a → `Avatar` + nombre o «Sin asignar»; Reunión → «{título} · {fecha}» (`wide`, texto plano) | **Abrir acta** (`outline`), **Ver compromiso** (`outline`); conservan sus `aria-label` actuales |

- `tone="danger"` cuando `dueStatus === 'VENCIDO'` (hoy `border-l-2 border-l-danger`).
- «Reunión» deja de ser un botón con aspecto de enlace dentro de la lista. La
  acción «Abrir acta» del pie cumple esa función con un objetivo de 44 px.
- **Pestañas**. La página se ensancha a 581 px porque `TabsList` no encoge. Clases:

  ```
  TabsList: flex max-w-full items-end gap-1 overflow-x-auto border-b
  TabsTrigger: shrink-0 pointer-coarse:h-11 (h-9 en puntero fino, sin cambio)
  ```

  Sin ocultar la barra de desplazamiento, para que se note que hay más
  pestañas. El `Tabs` raíz lleva `min-w-0`. Al seleccionar una pestaña
  parcialmente visible, se desplaza a la vista (`scrollIntoView({ inline:
  'nearest' })`). `aria-label` «Vistas de reuniones y compromisos» se
  conserva. Sin scroll horizontal de página a 390 y 320 px.

#### 4.4 Actividades recurrentes · Gestión

| list | T | S | B | M | A |
| --- | --- | --- | --- | --- | --- |
| Definiciones de actividades recurrentes | Título de la actividad (`font-medium`) | «{tipo} · {cadencia}» (por ejemplo «Reporte · Cada 1 semana») | `StatusBadge recurringDefinition` | Esfuerzo → `formatHours`; Inicio → `formatDateOnly`; Responsable (`wide`) → «Persona: Ana Pérez» o «Área: Calidad» | `menuOnly` → `definitionActions(activity)` |

El tab «Cumplimiento» (tres tablas con ocho columnas de métricas) queda fuera
de esta oleada. Se anota en «Puntos abiertos».

#### 5.4 Auditoría (`/gobierno/auditoria`)

La API ya pagina; la lista usa los mismos `rows` y la misma paginación.

| list | T | S | B | M | F |
| --- | --- | --- | --- | --- | --- |
| Eventos de auditoría | `auditActionLabel(event.action)` (`text-sm font-medium`, sin enlace) | Actor: nombre, «Sistema», o id corto `font-mono text-meta` con `title` del id completo si está fuera de alcance | `Badge neutral` con `auditObjectLabel(objectType)` | Fecha → `formatDateTime` (`wide`); Proceso → `processLabel` (`wide`) | **Ver cambio** (`outline`, icono opcional), a todo el ancho |

Cuando la API entregue el código del objeto (PR-D), pasa a la ranura `code` con
`IdChip`. Sin él, la tarjeta no inventa nada.

#### 6.1 Equipo y permisos (`/gobierno/equipo`)

Dos listas compactas. Sin `footer`: la acción va arriba a la derecha para que
cada tarjeta mida unos 90 px (hoy la tabla pasa de 11 000 px).

| list | T | S | B | A |
| --- | --- | --- | --- | --- |
| Usuarios | Nombre (`font-medium`) | Identificador (`text-muted-foreground`, `truncate`) | `StatusBadge active` | Botón icono `size-11` `outline` con `Mail` y `aria-label` «Reenviar invitación a {nombre}»; `LabelTooltip` solo en puntero fino. Conserva `busy`, `disabled` e id (con sufijo `-card`). |
| Roles asignados | Nombre del usuario | Nombre del proceso | `StatusBadge grant` | Solo si `grant.active`: botón `ghost-destructive` `h-11 px-3` con el texto «Revocar» y `aria-label` «Revocar rol de {usuario} en {proceso}». Abre el `ConfirmDialog` actual. |

Verificar que el contraste del texto «Revocar» (`text-destructive` sobre
`bg-muted/40`) pasa 4,5:1 en ambos temas; es un par nuevo (§4).

### 1.5 Estados comunes de las ocho listas

| Estado | Claro | Oscuro |
| --- | --- | --- |
| Cargando | `CardListSkeleton` (3 tarjetas, `withFooter` donde haya pie); contenedor `aria-busy="true"`; el `role="status"` de `ResultCount` anuncia el cambio | igual |
| Vacío / sin resultados | `EmptyState` dentro de `DataView`, fuera de las dos variantes | igual |
| Error | `ErrorState` con «Reintentar» a 44 px | igual |
| Foco | `focus-visible:outline-2 outline-offset-2 outline-ring` en título, botones, chip y «…» | igual |
| Deshabilitado | `disabled:opacity-50` y `DisabledHint` si hay motivo | igual |
| `prefers-reduced-motion` | Sin transiciones nuevas; el skeleton usa el `animate-pulse` existente, que `motion-reduce` ya detiene | igual |

### 1.6 Responsive

| Ancho | Comportamiento |
| --- | --- |
| 1440 px | Tablas como hoy. Sin lista. `IdChip` de 24 px dentro de filas de 40 px o más. |
| 768–1439 px | Tablas, con su `scrollLabel`. |
| 390 px | Tarjetas. Pie en dos columnas. Sin scroll horizontal de página. |
| 320 px | Tarjetas. Pie en una columna (< 360 px). `min-w-0` en toda columna de texto. |

## 2. `IdChip` con área de toque de 24 px

Archivo de referencia: `components/id-chip.tsx` (`CHIP_CLASS`).

| | Antes | Después |
| --- | --- | --- |
| Alto y ancho | `h-5` (20 px), sin ancho mínimo | `min-h-6 min-w-6` (24 × 24 px) |
| Alineación | `inline-flex items-center` | `inline-flex items-center justify-center` |
| Resto | `shrink-0 rounded-md border border-border-strong/60 bg-muted px-1.5 font-mono text-xs font-medium whitespace-nowrap text-foreground tabular-nums` | igual |

`CHIP_CLASS` final:

```
inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-border-strong/60 bg-muted px-1.5 font-mono text-xs font-medium whitespace-nowrap text-foreground tabular-nums
```

- Aplica a las dos variantes (botón copiable y `span` sin copia) para que no
  cambie la altura de la línea según el contexto. Texto `text-xs` (12 px) con
  `leading` por defecto de `text-xs` (16 px) más el relleno vertical que da el
  `min-h`.
- Copiable: foco `focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-ring` (sin cambio). Alrededor del chip no puede haber
  `overflow-hidden` (ver `code` en §1.2).
- Filas existentes: una celda con chip mide ≥ 40 px; el chip de 24 px no estira
  la fila. En densidad `compact` (filas de 28 px de acción) tampoco.
- Título de tarea en Mi trabajo (`CellTitle` de `mi-trabajo-parts.tsx`): se
  añade `inline-flex min-h-6 items-center` al enlace. En tarjeta ya usa
  `touch` (44 px).
- Contraste del texto del chip (no cambia, se registra): `text-foreground` sobre
  `bg-muted`: claro 11,84:1; oscuro ≈ 13,7:1. El borde es decorativo (el
  identificador es texto).
- Prueba: `boundingBox()` de `[data-id-chip]` con `width ≥ 24` y `height ≥ 24`,
  en Mi trabajo y en Aprobaciones. La WCAG 2.5.8 exige 24 px a los objetivos
  interactivos; el `span` sin copia se mide igual por coherencia visual.

## 3. Campana de notificaciones en tema oscuro

Archivo: `components/notification-bell.tsx`, insignia del contador.

**Causa.** `bg-danger` + `text-white`. En oscuro `--danger` vale
`oklch(0.76 0.13 22)` (un salmón claro, `#F98E8B`), pensado como color de
**texto** sobre fondo oscuro. Blanco sobre ese fondo da 2,27:1.

| Tema | Fondo | Texto | Ratio | AA 4,5:1 |
| --- | --- | --- | --- | --- |
| Claro (actual) | `bg-danger` L 0,50 (`#B32322`) | `text-white` | 6,59:1 | Sí |
| **Oscuro (actual)** | `bg-danger` L 0,76 (`#F98E8B`) | `text-white` | **2,27:1** | **No** |
| Claro (nuevo) | `bg-destructive` L 0,52 | `text-destructive-foreground` | 5,82:1 | Sí |
| Oscuro (nuevo) | `bg-destructive` L 0,54 | `text-destructive-foreground` | 5,35:1 | Sí |

Clases de la insignia:

```
absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none text-destructive-foreground ring-2 ring-card tabular-nums
```

- Cambios frente al código actual: `bg-danger` → `bg-destructive`; `text-white` →
  `text-destructive-foreground`; `text-[10px]` → `text-[11px]`; se añade
  `ring-2 ring-card` para separar la insignia del icono y de la barra en ambos
  temas. El alto pasa de `leading-4` a `h-[1.125rem]` (18 px) para el texto de
  11 px.
- Sin token nuevo en `globals.css`: `--destructive` ya existe en los dos temas.
- La insignia sigue `aria-hidden`; el nombre accesible lo da el botón
  («Notificaciones: N sin leer»). El contador no es la única señal: el texto
  numérico está dentro del color.
- Contraste no textual: en oscuro la insignia (`destructive`, Y 0,138) frente a
  `card` (Y 0,014) da 2,93:1. Queda 0,07 por debajo de 3:1, pero el anillo
  `ring-card` la une al borde del botón y lo que se debe distinguir es el número
  (5,35:1). Se registra el valor en el PR.
- Icono de la campana y foco: sin cambios (`ghost`, `text-foreground`). Se mide
  el icono sobre la barra `bg-card/90` en ambos temas y se adjunta el valor.
- «99+»: con `px-1` y 11 px el ancho es ≈ 28 px y no se corta.

## 4. Contraste de «Vencido»

Archivo: `components/due-badge.tsx` usa `Badge variant="danger"` =
`bg-danger/12 text-danger`. El hallazgo: 4,41:1 en claro.

**Causa.** `--danger` claro `oklch(0.50 0.18 27)` (`#B32322`, luminancia
0,1094) sobre el 12 % del mismo rojo mezclado con la superficie. La
superficie peor es `bg-muted` sólida (fila seleccionada o con hover).

**Corrección elegida: cambiar el token, no la variante.** Se baja
`--danger` claro a `oklch(0.47 0.18 27)` (≈ `#A91518`, luminancia 0,0900).
Motivos: un solo punto de cambio (`globals.css`, como pide la marca); el
hallazgo se repite en todos los usos de `danger` (Plan, Capacidad, errores de
campo); y oscurecer solo sube el contraste de `text-danger` sobre fondos claros.
No cambia el tema oscuro. Alternativa descartada: variante solo de vencimiento;
dejaría el mismo rojo en 5 sitios más.

Ratios del texto de `Badge danger` sobre su propio fondo (12 % mezclado):

| Superficie bajo el badge | Claro antes (L 0,50) | Claro después (L 0,47) | Oscuro (sin cambio) |
| --- | --- | --- | --- |
| `bg-card` | 5,40:1 | **6,06:1** | 5,94:1 |
| `bg-muted/40` sobre card (tarjeta móvil) | 4,97:1 | **5,57:1** | ≈ 5,7:1 |
| Lienzo `--background` | 4,74:1 | **5,32:1** | ≈ 5,9:1 |
| `bg-muted` sólida (peor caso) | **4,37:1** (≈ 4,41 del hallazgo) | **4,90:1** | ≈ 5,6:1 |

Otros pares con `--danger` (después del cambio):

| Par | Claro | Oscuro |
| --- | --- | --- |
| `text-danger` sobre `bg-card` (error de campo, «Libre» negativo) | 7,5:1 | 7,2:1 |
| `text-danger` sobre `bg-danger-subtle/50` (fila sobrecargada) | ≈ 6,9:1 | ≈ 6,1:1 |
| `text-muted-foreground` sobre `bg-muted/40` sobre card | 6,54:1 | ≈ 7,3:1 |
| `text-link` sobre `bg-muted/40` sobre card | 5,63:1 | ≈ 7,1:1 |

Tareas del implementador:

1. Editar solo `--danger` en `:root` (`oklch(0.47 0.18 27)`).
2. Buscar `bg-danger` sin opacidad (`grep -rn "bg-danger\b" apps/web/src`) y
   confirmar que ninguno lleva texto blanco ni de baja luminancia: un fondo más
   oscuro solo mejora el texto claro, pero hay que mirarlo.
3. Revisar `status-badge` y el badge de plazo vencido del Plan: usan el mismo
   token y deben pasar en la medición.
4. Adjuntar al PR la salida del script de §6, en ambos temas.

`DueBadge` conserva icono `CircleAlert` y el texto «Vencido hace N d»: el
significado no depende del color.

## 5. Presupuesto de Agentes de IA (6.7)

Archivo: `administracion/ia/presupuesto-ia-form.tsx`.

**Hallazgo.** Los dos campos tienen etiqueta visible, pero `Field` clona su
`children` con `id`. Aquí `children` es el `<div className="relative">` que
envuelve al `<Input>`, así que el `id` (`ai-budget-usd`, `ai-budget-alert`)
cae en el contenedor. El `<label htmlFor>` apunta a un `div`: el `input` no
tiene nombre accesible, y `aria-describedby`, `aria-invalid` y `aria-required`
tampoco le llegan. Un lector de pantalla anuncia «campo numérico» sin nombre.

**Corrección.** Usar `children` como función y esparcir las props en el
`Input`:

```tsx
<Field id="ai-budget-usd" label="Tope mensual (USD)" help="…" error={errors.budget}>
  {(control) => (
    <div className="relative">
      <span aria-hidden="true" className="…">US$</span>
      <Input {...control} type="number" inputMode="decimal" min={0} step="0.01" className="pl-11" … />
    </div>
  )}
</Field>
```

Textos (español, tildes, sin cambiar el significado ni la validación):

| Campo | Etiqueta | Ayuda | Error (ya existe en `ia-validation.ts`) |
| --- | --- | --- | --- |
| Tope | «Tope mensual (USD)» (sin cambio) | «Déjalo vacío para no poner tope.» (sin cambio) | «Escribe un número igual o mayor que 0.» |
| Umbral | **«Umbral de aviso (% del tope)»** (antes «Avisar al llegar al (%)») | **«Número entero de 1 a 100. Se avisa a los administradores cuando el gasto alcance este porcentaje del tope.»** | «Escribe un entero entre 1 y 100.» |

- La etiqueta anterior se lee mal («al llegar al (%)») y el lector de pantalla
  dice «paréntesis porcentaje». La nueva nombra el concepto y su unidad.
- Los adornos `US$` y `%` siguen `aria-hidden`: la unidad ya está en la
  etiqueta.
- Ninguna prueba del repositorio usa los textos actuales de estas etiquetas
  (búsqueda en `e2e/` y `apps/`), así que el cambio no rompe selectores.
  Si alguna prueba nueva los usa, que lo haga con `getByLabel`.
- Orden de tabulación: Tope → Umbral → Guardar presupuesto. Sin cambios.
- Prueba: `getByLabel('Tope mensual (USD)')` y
  `getByLabel('Umbral de aviso (% del tope)')` devuelven un `input`
  (`toHaveAttribute('type', 'number')`); con error, `aria-invalid="true"`.

## 6. Cómo medir (reproducible)

Los valores de este documento se calcularon con la conversión OKLCH → sRGB
lineal (matrices de Björn Ottosson) y la luminancia relativa de WCAG. Cada
fondo con transparencia se mezcla en sRGB codificado, como hace el
navegador. El PR debe confirmarlos con este script (tolerancia ±0,05) y
adjuntar la salida; si alguno baja de 4,5:1, el valor del token se ajusta y
este documento se corrige.

```js
// node medir-contraste.mjs  (no se versiona en el repositorio)
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toEnc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklch([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((v) => Math.min(1, Math.max(0, toEnc(v)))); // sRGB codificado
}
const mix = (fg, bg, alpha) => fg.map((v, i) => alpha * v + (1 - alpha) * bg[i]);
const Y = (rgb) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [hi, lo] = [Y(a), Y(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
// Ejemplo: «Vencido» sobre bg-muted, claro, después del cambio
const danger = oklch([0.47, 0.18, 27]), muted = oklch([0.925, 0.014, 254.6]);
console.log(ratio(danger, mix(danger, muted, 0.12)).toFixed(2));
```

Pares a medir y adjuntar: los de §3 y §4, `text-foreground`,
`text-muted-foreground` y `text-link` sobre `bg-muted/40` sobre `card` (claro y
oscuro), «Revocar» (`destructive`) sobre `bg-muted/40`, y el icono de la campana
sobre `bg-card/90`.

## 7. Accesibilidad y pruebas

- **Semántica de cada lista**: `ul` con `aria-label` > `li` > `dl`. Sin
  `role="table"` ni `role="row"`. El conteo lo anuncia el `role="status"` de
  `ResultCount`.
- **Orden de tabulación en una tarjeta**: `IdChip` → título → acción de
  cabecera («…» o botón) → botones del pie. Un solo `tab stop` por control; la
  tarjeta no es clicable entera.
- **Botones del pie**: nombre accesible con la fila, por ejemplo «Aprobar
  PRY-0012: título». Si el texto visible es «Aprobar», el nombre accesible
  empieza por esa palabra (WCAG 2.5.3).
- **Lector de pantalla**: el badge «Vencido hace N d» tiene texto; el borde
  `tone="danger"` es decorativo.
- **Pruebas** (las escribe quien implemente):
  - `e2e/tarjetas-moviles.spec.ts`: a 375 px, cada una de las ocho pantallas
    muestra su `list` con nombre, no muestra la tabla, tiene
    `scrollWidth <= clientWidth` y expone Aprobar y Devolver sin abrir menús.
    A 1280 px ocurre lo contrario.
  - `e2e/accessibility.spec.ts` (axe, solo `serious` y `critical`): rutas
    `/administracion/ia`, `/administracion/revision`, `/seguimiento/reuniones`,
    `/mi-trabajo`, `/gobierno/auditoria`, `/activos/capacidad`,
    `/seguimiento/plan`, en claro y oscuro, a 1440 y 390 px.
  - `IdChip`: `boundingBox` ≥ 24 × 24.
  - Reuniones a 390 px: el `body` no desborda y la `TabsList` tiene scroll
    propio.
  - Jest o unidad de `DataCardList`: `footer`, `code`, `wide` y `tone`.
- La conformidad completa con WCAG 2.2 AA requiere además pruebas manuales con
  lector de pantalla (NVDA y VoiceOver) y revisión experta; axe cubre una
  parte de los criterios.

## 8. Puntos abiertos

1. **3.1 · edición en línea.** La spec supone que el detalle de la tarea permite
   cambiar responsable y avance. Si no es así, el pie lleva `TaskProgressControl`
   además del estado.
2. **4.4 · Cumplimiento.** Sus tres tablas de ocho columnas de métricas no están
   en el alcance del plan. Quedan sin tarjeta; a 390 px conservan el scroll con
   `scrollLabel`. Se propone una tarjeta con un `dl` de métricas en una oleada
   posterior.
3. **4.3 · Compromisos y Actas.** Se mantienen con `SelectableList`; si la
   verificación a 390 px muestra desborde, se corrige dentro del mismo PR.
4. **Longitud en móvil.** 25 tarjetas de auditoría miden ≈ 3 500 px. Se
   recomienda un tamaño de página inicial de 10 en `< md`; es un ajuste de
   comportamiento, no visual, y queda a decisión del implementador.
5. **Medición.** Los ratios de esta spec están calculados a mano. Los marcados
   con «≈» son estimaciones; el script de §6 los sustituye por el valor
   exacto.
