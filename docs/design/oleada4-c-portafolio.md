# Oleada 4 · PR C. Portafolio: franja de alertas y sección «Ejecución». Especificación visual

Especificación (rol Director de Arte Frontend) del FEAT-003. Cubre dos piezas:

1. **Franja de cuatro contadores clicables** sobre el listado de `portafolio-view.tsx`.
2. **Sección «Ejecución» de solo lectura** en la ficha (`demanda/solicitudes/[id]/ficha-view.tsx`).

Reglas vigentes: `25-marca-gibo.md`, `20-frontend-nextjs.md`, `15-reglas-transversales.md` (IDs visibles con `IdChip`, un solo alcance en la API). Solo tokens semánticos (sin color crudo de Tailwind), foco con `--ring`, español con tildes. **Sin dependencias nuevas.** Los fragmentos de clases son especificación, no código de producto.

Patrones que se reutilizan (no se reinventan): `CounterCard` de `mi-trabajo/mi-trabajo-parts.tsx` (contador-interruptor con `aria-pressed`), `Section`, `Table`/`DataCardList`, `StatusBadge`, `PriorityBadge`, `Badge`, `IdChip`, `ProgressCell` de `portafolio-view.tsx`, `InlineNotice`, `Button`/`buttonVariants`.

---

## 0. Decisiones

| # | Punto | Decisión | Por qué |
| --- | --- | --- | --- |
| D1 | **Componente de la franja** | Componente local `AlertStrip` en `seguimiento/portafolio/` con las mismas clases que `CounterCard`. No se importa `CounterCard` desde «Mi trabajo». | El PR F reordena «Mi trabajo». Importarlo crea acoplamiento entre PR independientes. Si luego conviene, se extrae a `components/` en otro cambio. |
| D2 | **Selección única** | Un contador activo a la vez. Clic en el activo lo apaga. Refleja `?alert=VENCIDA\|PROXIMA\|CON_DESVIACION\|BLOQUEADA` en la URL (`router.replace`, sin añadir historial). Un valor desconocido en la URL se ignora. | Coincide con el filtro `alert` de la API (uno solo). |
| D3 | **Cifras = alcance filtrado, sin `alert`** | Los contadores usan `GET /portfolio/summary` con búsqueda, proceso, estado y prioridad vigentes, **sin** `alert`. Al activar uno, las cifras no cambian; cambia el listado. | Las cuatro cifras siguen siendo comparables entre sí y el usuario puede saltar de un contador a otro sin que desaparezcan. |
| D4 | **Una iniciativa puede estar en varios grupos** | Texto de ayuda fijo bajo la franja: «Una iniciativa puede aparecer en más de un grupo». | Evita que el usuario sume las cifras y espere el total. |
| D5 | **Cero** | Contador en 0 y sin seleccionar: deshabilitado (igual que «Mi trabajo»). Activo con valor 0 (por ejemplo tras cambiar un filtro): sigue habilitado para poder apagarlo. | Evita un clic que lleva a una lista vacía; nunca deja atrapado al usuario. |
| D6 | **Fallo de la franja no bloquea el listado** | Si `summary` falla, se muestra un aviso compacto con «Reintentar» y el listado sigue funcionando. | El listado es la tarea principal; los contadores son un atajo. |
| D7 | **Posición de «Ejecución»** | En la ficha, después del recorrido por etapas (`Stepper`) y antes de `ClosurePanel`. Es una sección propia, no un paso del recorrido. | El recorrido es el flujo de decisión; la ejecución es un resumen de lectura de lo que ya ocurre. |
| D8 | **Visibilidad** | Se muestra con el módulo `portfolio`. El enlace «Abrir en Planificación» solo aparece además con el módulo `plan`. Sin `portfolio`, la sección no se monta ni se llama a la API. | Ver `FEAT-003` y plan.md: no exigir `plan` a quien solo tiene Portafolio. |
| D9 | **Fases plegables sin dependencia** | Botón con `aria-expanded` y `aria-controls` más un panel. Si `ui/collapsible.tsx` ya existe en el repo se puede usar; si no, no se añade Radix Collapsible. | Sin dependencias nuevas. |
| D10 | **Solo lectura estricta** | Ninguna fila de tarea lleva controles de edición (sin selector de estado, sin campo de avance, sin enlaces a edición). El único control de navegación es «Abrir en Planificación». | Edición es de Planificación; evita duplicar reglas de transición. |

---

## 1. Franja de alertas del Portafolio

### 1.1 Objetivo y acción principal

**Objetivo.** Ver de un vistazo cuántas iniciativas requieren atención y filtrar el listado con un clic.
**Acción principal.** Pulsar un contador para ver solo esas iniciativas.
**Qué destaca.** Cifras en rojo o ámbar cuando son mayores que 0. **Qué no destaca.** Los contadores en 0 (gris, sin filete de color).

### 1.2 Estructura de la página (de arriba abajo)

1. `PageHeader` (sin cambios).
2. **Franja de alertas** (nueva).
3. `Toolbar` de filtros (sin cambios).
4. Nota de alcance y `PriorityLegend` (sin cambios).
5. Listado (sin cambios).

La franja va **antes** del `Toolbar`, porque los contadores son el punto de entrada y la barra de filtros los refina.

### 1.3 Contadores

| Clave `alert` | Etiqueta | Pista | Icono (lucide) | Tono con valor > 0 | Origen |
| --- | --- | --- | --- | --- | --- |
| `VENCIDA` | Vencidas | «pasaron su fecha» | `AlarmClock` | `danger` | `overdue` |
| `PROXIMA` | Próximas a vencer | «vencen pronto» | `CalendarClock` | `warning` | `dueSoon` |
| `CON_DESVIACION` | Con desviación | «terminan después del plan» | `TrendingUp` | `warning` | `withVariance` |
| `BLOQUEADA` | Bloqueadas | «esperan algo» | `OctagonAlert` | `danger` | `blocked` |

El icono distingue los dos grupos rojos (reloj frente a octágono); el color nunca es el único canal.

### 1.4 Clases Tailwind exactas

Contenedor (`section` con rótulo y grupo de botones):

```
<section aria-label="Alertas del portafolio" class="flex flex-col gap-2">
  <div role="group" aria-label="Filtrar por alerta" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    …4 botones…
  </div>
  <p class="text-meta text-muted-foreground">Una iniciativa puede aparecer en más de un grupo.</p>
</section>
```

Botón del contador (mismo patrón que `CounterCard`):

```
flex min-h-20 min-w-0 flex-col gap-0.5 rounded-xl border-t-2 bg-card p-4 text-left shadow-card
transition-colors motion-reduce:transition-none hover:bg-muted/50
focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring
disabled:cursor-default disabled:hover:bg-card
```

Variantes por estado:

| Estado | Clases añadidas |
| --- | --- |
| Valor > 0, inactivo | borde superior por tono: `border-t-danger` (vencidas, bloqueadas) o `border-t-warning` (próximas, desviación). Valor: `text-danger` o `text-warning`. |
| Valor = 0, inactivo | `border-t-border`, valor `text-muted-foreground`, `disabled`. |
| Activo | `ring-2 ring-primary` y fondo `bg-primary-subtle/60`; icono `Check size-4` junto a la etiqueta y `<span class="sr-only">Filtro activo</span>`. El valor conserva su color de tono. |
| Foco de teclado | `focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring` (ya incluido). |
| Deshabilitado | `disabled` real, sin `opacity-50` sobre el texto (el texto se mantiene legible a 4.5:1). |

Contenido interno:

```
<span class="flex items-center gap-1.5 text-meta text-muted-foreground">
  <Icon class="size-4 shrink-0" aria-hidden="true" /> Etiqueta [Check + sr-only si activo]
</span>
<span class="text-2xl font-semibold tabular-nums {valor>0 ? tono : 'text-muted-foreground'}">{n}</span>
<span class="text-meta text-muted-foreground">{pista}</span>
```

Los dos temas usan los mismos tokens; `globals.css` los cambia solos. No hay clase distinta por tema.

### 1.5 Estados

| Estado | Comportamiento |
| --- | --- |
| **Cargando** | Cuatro bloques con la misma caja (`min-h-20 rounded-xl bg-card shadow-card p-4`) y dentro tres barras `h-3 rounded bg-muted animate-pulse motion-reduce:animate-none` (etiqueta 40 %, valor `h-7` 20 %, pista 60 %). `aria-busy="true"` en el `section`. Sin texto «…» suelto. |
| **Recarga** (cambió un filtro y hay cifras previas) | Las cifras anteriores se conservan sin atenuar (la opacidad rompería el contraste) y se actualizan al llegar. `aria-busy="true"`. |
| **Éxito** | Cuatro contadores con cifras. |
| **Todo en 0** | Las cuatro tarjetas en gris y deshabilitadas. Bajo la franja, en lugar de la ayuda de grupos: «Ninguna iniciativa tiene alertas con los filtros actuales». Es una buena noticia: sin icono de error. |
| **Error de `summary`** | Se retira la franja y se muestra `InlineNotice` tono `danger` (`role="alert"`): «No fue posible calcular los contadores. El listado sigue disponible.» con botón `Button variant="outline" size="sm"` «Reintentar». |
| **Filtro activo con listado vacío** | Lo cubre el estado `no-results` existente («Ninguna iniciativa coincide…»). Se añade a la descripción: «Quita el filtro de alerta para ver más.» con botón «Quitar alerta». |
| **Limpiar filtros** | «Limpiar filtros» también quita `alert` y borra el parámetro de la URL (`showClear` considera `alert`). |

### 1.6 Interacción

- Clic o `Espacio`/`Intro` alterna. El foco **permanece** en el botón pulsado; no salta a la tabla.
- La página vuelve a la primera página del listado al cambiar `alert` (mismo `filtersKey` que el resto de filtros).
- El resultado se anuncia con la región viva que ya usa `ResultCount` (`aria-live="polite"`). Añadir al nombre del conteo el filtro: «12 iniciativas · Alerta: Vencidas».
- Con filtro activo se muestra además un chip descartable bajo la franja, a la izquierda de «Limpiar filtros»: `Badge variant="accent"` con texto «Alerta: Vencidas» y botón `X` (`size-6`, área de toque 24 px mínimo, `aria-label="Quitar alerta Vencidas"`). Si el chip complica el `Toolbar`, basta con el estado `aria-pressed` y el `Check`.

### 1.7 Responsive

| Ancho | Disposición |
| --- | --- |
| Móvil (< 640 px) | `grid-cols-2`, cuatro tarjetas en 2 × 2. Etiquetas largas («Próximas a vencer») pueden ocupar dos líneas: sin `truncate`, `wrap-break-word`. Área de toque ≥ 80 px de alto (`min-h-20`). |
| Tablet (640–1023 px) | `grid-cols-2` igualmente. |
| Escritorio (≥ 1024 px) | `lg:grid-cols-4`, una fila. |

La franja no se pliega en móvil (a diferencia del `Toolbar`): son cuatro cifras y es el filtro más rápido.

### 1.8 Accesibilidad

- Cada contador es un `<button type="button" aria-pressed>`. Nombre accesible = etiqueta + cifra + pista, por su contenido de texto. No añadir `aria-label` que lo oculte.
- Orden de tabulación: `PageHeader` → los cuatro contadores (los deshabilitados se saltan) → `Toolbar` → listado.
- Significado no solo por color: icono distinto por contador, texto, y `Check` + «Filtro activo» para el estado activo.
- Contraste: se usan únicamente pares que ya existen y están en uso en «Mi trabajo» y en `Badge`: `text-danger`, `text-warning`, `text-muted-foreground` y `text-foreground` sobre `bg-card`. Del par `text-warning` sobre blanco consta 6.76:1 (`planeacion-ux.md`). **No se calcularon ratios nuevos en esta especificación** (sin herramienta de cálculo en el paso). Debe medirse con axe en claro y oscuro: `text-danger`/`text-warning` sobre `bg-card` y sobre `bg-primary-subtle/60` (fondo del contador activo), y el anillo `ring-primary` contra `bg-card` en oscuro (objetivo ≥ 3:1, WCAG 1.4.11). Si el anillo oscuro no llega a 3:1, sustituir por `ring-ring ring-offset-2 ring-offset-card`.
- Movimiento: sin animación salvo `transition-colors` y el pulso del esqueleto, ambos con `motion-reduce`.
- La validación completa requiere pruebas manuales con lector de pantalla (NVDA/VoiceOver) y revisión experta.

---

## 2. Sección «Ejecución» en la ficha

### 2.1 Objetivo y acción principal

**Objetivo.** Que quien tiene Portafolio vea cómo va la ejecución de una iniciativa (plan, fechas, avance, tareas) sin salir de la ficha y sin acceso a Planificación.
**Acción principal.** Leer el estado y, si hace falta actuar, usar «Abrir en Planificación» (solo con módulo `plan`).
**Qué destaca.** La desviación cuando es mayor que 0 y el avance global. **Qué no destaca.** Las tareas de las fases terminadas (plegadas).

### 2.2 Estructura (de arriba abajo)

```
Ejecución                                          [ Abrir en Planificación ]
Solo lectura. Estado del plan y avance de las tareas.
┌───────────────────────────────────────────────────────────────────────┐
│ Plan        Línea base     Pronóstico     Desviación     Avance        │  ① Resumen
│ [Autorizado] 30 jun 2026    12 jul 2026   [+12 d]        ▓▓▓▓░░ 64 %   │
└───────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────┐
│ ▾ [F1] Fase 1 · Descubrimiento   [Terminada]  ▓▓▓▓▓▓ 100 %  3 de 3     │  ② Fases (plegables)
│ ▸ [F2] Fase 2 · Construcción     [En curso]    ▓▓▓░░░ 40 %   2 de 5     │
│   ┌ Tarea        Estado     Avance   Fechas             Responsable ┐   │  ③ Tareas de la fase abierta
│   │ [T07] Migrar  En curso   40 %     1 jun – 20 jun     Ana Pérez   │   │
└───────────────────────────────────────────────────────────────────────┘
```

Encabezado: `Section` (`title="Ejecución"`, `headingLevel` 2, `description="Solo lectura. Estado del plan y avance de las tareas."`). `actions`: enlace «Abrir en Planificación» solo con módulo `plan`:

```
<Link href={`/seguimiento/plan?requestId=${id}`} class={buttonVariants({ variant: 'outline', size: 'sm' })}>
  Abrir en Planificación <ArrowUpRight class="size-4" aria-hidden="true" />
</Link>
```

Si el módulo `plan` está permitido pero la solicitud aún no es planificable, no se muestra el enlace (la ficha ya explica el motivo en el paso «Plan»; no se duplica).

### 2.3 ① Resumen del plan

Contenedor: `rounded-xl bg-card p-4 shadow-card` (sin borde marcado).
Contenido: lista de definición `<dl>` en rejilla:

```
<dl class="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-5">
  <div class="flex min-w-0 flex-col gap-1">
    <dt class="text-meta text-muted-foreground">Plan</dt>
    <dd>…</dd>
  </div>
  …
</dl>
```

| Campo | Contenido del `dd` |
| --- | --- |
| Plan | `StatusBadge` del estado del plan (kind según el catálogo existente del plan). Si no hay plan: texto «Sin plan» en `text-muted-foreground`. |
| Línea base | Fecha con `formatDateOnly`, `tabular-nums`. Sin dato: «—». |
| Pronóstico | Fecha, `tabular-nums`. Sin dato: «—». |
| Desviación | `desviación > 0`: `Badge variant="warning"` con `TrendingUp` y texto «+N d» (usar el helper `signedDays`) y `title` «Las tareas abiertas terminan después del compromiso del plan.». `= 0` o ausente: `Badge variant="success"` «Sin desviación». Negativo (adelanto): `Badge variant="success"` «−N d (adelantada)». |
| Avance | Barra de `ProgressCell` ampliada: `h-2 w-full max-w-40` y el porcentaje `text-meta tabular-nums`. Sin tareas: «Sin tareas» en `text-muted-foreground`. |

Barra de avance (ya existe): pista `bg-muted`, relleno `bg-primary`, `role="progressbar"` con `aria-label` («Avance de la ejecución», «Avance de la fase 2») y `aria-valuenow`. La cifra siempre acompaña a la barra (no depende del relleno).

### 2.4 ② Fases plegables

Lista: `<ul class="flex flex-col gap-3">`; cada fase es un `<li>` con tarjeta `rounded-xl bg-card shadow-card`.

Cabecera de fase (un `<button>` que ocupa todo el ancho; **no** anidar otros botones dentro):

```
flex w-full min-h-11 items-center gap-3 rounded-xl p-3 text-left sm:p-4
hover:bg-muted/50 motion-reduce:transition-none
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring
```

Atributos: `aria-expanded`, `aria-controls="{id}-panel"`. Contenido, en este orden:

1. `ChevronRight` (`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none`), con `rotate-90` cuando está abierta. `aria-hidden`.
2. `IdChip` de la fase en **forma corta** (`F2`), porque la ficha ya muestra el proyecto. Si la API del `IdChip` no ofrece forma corta, usar el código completo.
3. Título de la fase: `min-w-0 flex-1 truncate font-medium` en una línea (el título completo en `title`).
4. `StatusBadge` del estado de la fase.
5. Avance: barra `h-2 w-16 sm:w-24` + `text-meta tabular-nums` «40 %»; en móvil se oculta la barra (`max-sm:hidden`) y queda la cifra.
6. Recuento: `text-meta text-muted-foreground tabular-nums` «2 de 5 terminadas» (oculto en móvil: `max-sm:hidden`; el dato completo pasa al panel).

Panel (`id="{id}-panel"`, `role="region"`, `aria-labelledby` el id del botón; con `hidden` cuando está cerrado). Padding `px-3 pb-3 sm:px-4 sm:pb-4`.

**Estado inicial.** Se abre solo la **primera fase no terminada**. Las demás quedan cerradas. Si todas están terminadas, todas cerradas. El estado de apertura no se guarda entre visitas.

Junto a la lista, un control «Expandir todas / Plegar todas» solo si hay más de 3 fases: `Button variant="ghost" size="sm"` en `actions` de la sección.

### 2.5 ③ Tareas de una fase

**Escritorio y tablet (≥ 768 px): tabla** `Table` con `scrollLabel="Tareas de la fase F2"` y `TableCaption` («Tareas de la fase F2 con su estado, avance, fechas y responsable.»).

| Columna | Contenido | Clases de la celda |
| --- | --- | --- |
| Tarea | `IdChip` forma corta (`T07`) + título en texto plano (no enlace) | `min-w-56 max-w-[28rem]`; título `line-clamp-2 wrap-break-word` |
| Estado | `StatusBadge` de tarea | `min-w-32` |
| Avance | Barra `h-2 w-20` + `%` (`ProgressCell`) | `min-w-32` |
| Fechas | «1 jun – 20 jun» o «Sin fechas» en `text-muted-foreground` | `whitespace-nowrap tabular-nums` |
| Responsable | Nombre, o «Sin responsable» en `text-muted-foreground` (D22 queda fuera) | `min-w-36 max-w-[14rem] line-clamp-2` |

Las filas no tienen hover de navegación (no son clicables). Se mantiene el separador sutil de la tabla. No hay paginación (las tareas de una fase son pocas; si superan 50, el desarrollador las corta con «Ver todas en Planificación» solo cuando hay módulo `plan`).

**Móvil (< 768 px): lista de tarjetas** `<ul class="flex flex-col divide-y divide-border">`; cada `<li class="flex flex-col gap-1.5 py-3">`:

1. Línea 1: `IdChip` + título (`font-medium wrap-break-word`).
2. Línea 2: `StatusBadge` + `text-meta tabular-nums` fechas.
3. Línea 3: barra de avance + `%`.
4. Línea 4: responsable en `text-meta text-muted-foreground`.

Fase sin tareas: texto `text-sm text-muted-foreground` «Esta fase aún no tiene tareas.».

### 2.6 Estados de la sección

| Estado | Comportamiento |
| --- | --- |
| **Cargando** | El `Section` con su título ya visible y debajo: tarjeta de resumen en esqueleto (cinco bloques `h-4`/`h-6` `bg-muted animate-pulse motion-reduce:animate-none`) y dos filas de fase en esqueleto (`h-14 rounded-xl bg-muted`). `aria-busy="true"` en la sección. |
| **Vacío** (solicitud sin plan, o plan sin fases) | Tarjeta `rounded-xl bg-card p-4 shadow-card` con icono `ListChecks size-5 text-muted-foreground` en un círculo `bg-primary-subtle`, título «Aún no hay ejecución que mostrar» y texto «Cuando la solicitud tenga un plan con fases y tareas, aquí verás su avance.». Sin botones (solo lectura). |
| **Error** | `InlineNotice` tono `danger` con `role="alert"`: «No fue posible cargar la ejecución.», mensaje de la API y botón «Reintentar». El resto de la ficha no se ve afectado. |
| **No encontrada o fuera de alcance (404)** | La sección no se muestra (la ficha ya habría fallado antes por el mismo motivo). |
| **Éxito** | Resumen y fases. |
| **Deshabilitado** | No aplica: es de solo lectura. El enlace «Abrir en Planificación» no se renderiza si falta el módulo. |
| **Foco** | Botones de fase y enlace: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`. |

### 2.7 Badges semánticos

| Dato | Componente | Tono |
| --- | --- | --- |
| Estado del plan | `StatusBadge` | el del catálogo de estados del plan |
| Estado de fase | `StatusBadge` | el del catálogo de estados de fase |
| Estado de tarea | `StatusBadge kind` de tarea | el del catálogo de estados de tarea |
| Desviación > 0 | `Badge variant="warning"` + icono `TrendingUp` + «+N d» | ámbar |
| Sin desviación / adelanto | `Badge variant="success"` + icono `CircleCheck` | verde |
| Bloqueada (si la tarea lo está) | `StatusBadge kind="blocked"` bajo el estado | rojo |
| Alerta activa en la franja | `Badge variant="accent"` «Alerta: …» | marca |

Ningún estado ni prioridad va en texto plano.

### 2.8 Accesibilidad

- Estructura: `h2` «Ejecución» (de `Section`); cada fase es un botón dentro de un `li`; el panel es `role="region"` con nombre. No usar `h3` dentro del botón.
- Teclado: `Tab` recorre «Abrir en Planificación» → «Expandir todas» (si existe) → botones de fase (en orden). `Intro`/`Espacio` pliega y despliega. Dentro de un panel abierto la tabla no tiene controles interactivos, de modo que `Tab` salta a la siguiente fase.
- El estado plegado se comunica con `aria-expanded`, no solo con el giro del chevron.
- Barras de progreso con `role="progressbar"`, nombre y valores; la cifra aparece también como texto.
- IDs visibles con `IdChip` (copiables, ≥ 4.5:1). Pares de color: los mismos que `StatusBadge` y `Badge` ya medidos para ambos temas. **No se calcularon ratios nuevos aquí**; verificar con axe en claro y oscuro: `text-warning` sobre `bg-warning/14` (badge de desviación), `text-meta text-muted-foreground` sobre `bg-card`, y el relleno `bg-primary` de la barra contra su pista `bg-muted` (≥ 3:1 en ambos temas).
- Objetivos de interacción: el botón de fase mide ≥ 44 px de alto (`min-h-11`); el enlace «Abrir en Planificación» usa `Button size="sm"` (con `pointer-coarse:min-h-11` si el tamaño `sm` no lo trae).
- Movimiento: solo el giro del chevron y el pulso del esqueleto, ambos con `motion-reduce`.
- La validación completa requiere pruebas manuales con tecnologías de asistencia y revisión experta.

### 2.9 Responsive

| Ancho | Disposición |
| --- | --- |
| Móvil (< 640 px) | Resumen en `grid-cols-2`. Cabecera de fase: chevron, `IdChip`, título, `StatusBadge` y `%` (sin barra ni recuento). Tareas como lista de tarjetas. El enlace «Abrir en Planificación» pasa debajo de la descripción, ancho completo (`max-sm:w-full`). |
| Tablet (640–1023 px) | Resumen `md:grid-cols-3`. Cabecera con barra corta y recuento. Tareas en tabla con scroll horizontal rotulado si no caben. |
| Escritorio (≥ 1024 px) | Resumen `lg:grid-cols-5` en una fila. Cabecera completa. Tabla de tareas sin scroll. |

---

## 3. Notas para el desarrollador

- Orden de montaje en `ficha-view.tsx`: `Section «Ficha de la solicitud»` → `Stepper` → **`<ExecutionSection />`** (condicionada por `allowedModules.has('portfolio')`) → `ClosurePanel`.
- La franja y la sección consumen el cliente tipado generado (`GET /portfolio/summary`, `GET /portfolio/{id}/execution`); sin tipos copiados a mano. Las etiquetas de estado salen de los catálogos que ya usa `StatusBadge`, no de textos nuevos.
- No hay parámetros nuevos ni textos de ayuda configurables en este PR; los textos de arriba son rótulos de interfaz.
- Pruebas e2e sugeridas (`e2e/portafolio-franja.spec.ts`): el contador `aria-pressed` filtra y deja `?alert=` en la URL; recargar con la URL conserva el filtro; la ficha muestra «Ejecución» sin módulo `plan` y sin «Abrir en Planificación».
