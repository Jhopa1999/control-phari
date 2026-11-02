# Administración > IA · Consumo, Presupuesto y Catálogo de modelos

Especificación visual (solo diseño; sin cambios de código). Amplía
`/administracion/ia` (`apps/web/src/app/administracion/ia/ia-agentes-view.tsx`).
Marca: `25-marca-gibo.md`. Frontend: `20-frontend-nextjs.md`. Tarjetas móviles:
`tarjetas-moviles-bl-024.md`. Solo tokens semánticos, `shadow-card`, `rounded-xl`.

## 1. Orden en la página

Sin pestañas nuevas: la página sigue siendo una sola columna (`PageLayout`,
`gap-6`) y el administrador revisa y configura en el mismo recorrido. Orden:

1. **IA global** (existente).
2. **Consumo del mes** (nuevo) y, justo debajo, **Presupuesto** (nuevo): gasto y tope se leen juntos.
3. **Agentes** (existente).
4. **Catálogo de modelos** (nuevo): va después de Agentes porque el modelo se elige allí; el catálogo es la ayuda de referencia.

Para escaneo, `PageHeader` no cambia. Se añade un índice de anclas no (YAGNI): son 5 secciones y caben en 2 pantallas.
Cada pieza es una `Section` (h2) con su propio estado de carga, así un fallo de `/admin/ai/usage` no bloquea configuración ni catálogo.

## 2. Consumo del mes

**Cabecera (`Section actions`)**: selector de mes a la derecha del título. En 375 px baja bajo la descripción, ancho completo.

- `Select` (existente) con `<Label>` visible «Mes» (`text-meta text-muted-foreground`), trigger `h-9 w-full sm:w-48`.
- 12 opciones, mes actual primero, texto «julio de 2026» (`Intl es`, valor `YYYY-MM`). Al cambiar: solo el cuerpo pasa a loading (`aria-busy`), el selector queda activo.

**Indicadores (`StatStrip` + `StatTile`, 5 tiles)**: Gasto del mes, Tope mensual, % usado, Llamadas, Tokens.
- `StatStrip` admite 2–4 tiles: **crear variante** o agrupar «Llamadas» y «Tokens» en un tile («12 340 llamadas · 1,2 M tokens», entrada/salida en `text-meta`). **Decisión: 4 tiles** (Gasto, Tope, % usado, Consumo de IA = llamadas + tokens). Móvil 2×2, `lg` 4×1.
- Valores `text-2xl font-semibold tabular-nums`, USD con `Intl` `es` («US$ 12,40»). Tope `null` → «Sin tope» con `text-muted-foreground`. % usado `null` → «—».
- Tokens: entrada y salida en `text-meta` bajo el valor («Entrada 1,0 M · Salida 0,2 M»).

**Barra de presupuesto (solo si `budgetUsd` ≠ null)**: tarjeta `rounded-xl bg-card p-4 shadow-card`.
- Fila superior: `StatusBadge`-estilo `Badge` con icono + etiqueta (tabla §6) a la izquierda; a la derecha «US$ 8,10 de US$ 10,00» (`tabular-nums text-sm`).
- Pista `relative h-3 w-full rounded-full bg-muted overflow-hidden`; relleno `absolute inset-y-0 left-0 rounded-full` con ancho `min(usedPct,100)%`, `transition-[width] motion-reduce:transition-none`. Marca del umbral: `absolute inset-y-0 w-0.5 bg-foreground` en `left: alertPct%` más etiqueta `text-meta` debajo «Alerta al 80 %» alineada con la marca (`-translate-x-1/2`, tope `max-sm:` a los bordes con `left-0/right-0` si cae <10 % o >90 %).
- Accesibilidad: contenedor `role="progressbar"` `aria-valuemin=0` `aria-valuemax=100` `aria-valuenow={min(usedPct,100)}` `aria-valuetext="80,5 % usado; alerta al 80 %; estado: en alerta"`, `aria-label="Consumo del presupuesto"`. La marca es `aria-hidden`; el umbral está en el texto.
- Si excede 100 %: barra llena y texto «125 % del tope» (no se trunca el número visible).
- `budgetUsd` null: en lugar de barra, `InlineNotice tone="info"` «Sin tope mensual. Define uno en Presupuesto para recibir avisos».

**Aviso `unpricedCalls > 0`**: `InlineNotice tone="warning"` (`role="status"`): título «N llamadas sin precio», texto «No suman al costo porque su modelo no tiene precio en el catálogo. El gasto real puede ser mayor.» + enlace `text-link` «Revisar precios» (ancla al catálogo).

**Desgloses**: dos bloques, «Por agente» y «Por modelo» (h3, `Section headingLevel={3}`). Columnas: Nombre, Llamadas, Tokens entrada, Tokens salida, Costo, (% del gasto en `UtilizationBar` tone default, 48×6, con texto sr-only).
- Escritorio (`hidden md:block`): `Table` existente, `rounded-xl shadow-card`, cifras `text-right tabular-nums`, orden por costo desc. Una fila «Total» `font-semibold` no se agrega (los tiles ya lo dan).
- Móvil (`md:hidden`): `DataCardList label="Consumo por agente"`; `title` = nombre (texto plano, sin `CellTitle` pues no abre nada), `subtitle` = «N llamadas», `meta`: Entrada, Salida, Costo, sin `actions`, sin `sort`.
- Nombre de agente: `displayName` si existe, si no la `key`; modelo: `label` del catálogo, si no el id en `font-mono text-meta`.

**Estados**
- Loading: `Skeleton` `h-24 rounded-xl` (tiles), `h-20 rounded-xl` (barra), `h-48 rounded-xl` (desglose); `aria-busy="true"`.
- Vacío (`calls = 0`): tiles en «0» / «US$ 0,00», se omiten barra y desgloses y se muestra `EmptyState` compacto «Sin consumo en julio de 2026», «Las llamadas de IA aparecerán aquí cuando se usen». La barra se conserva si hay tope (0 %).
- Error: `InlineNotice tone="danger"` dentro de `rounded-xl bg-card` con «No fue posible cargar el consumo.» + `Button outline sm` «Reintentar» (reintenta solo usage).
- Forbidden: la página completa ya lo resuelve (módulo `aiSettings`); un 403 individual usa `InlineNotice tone="neutral"`.

## 3. Presupuesto

Tarjeta `Section` + `form` (`noValidate`), `rounded-xl bg-card p-4 shadow-card`, `flex flex-col gap-4`. Se ubica junto al consumo: en `lg` ambos van en rejilla `lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` (consumo izquierda, presupuesto derecha, `items-start`); bajo `lg` apilados (consumo primero).

Campos (`Field`, error junto al campo, `FormError` arriba):
- **Tope mensual (USD)** `Input type=number inputMode=decimal min=0 step=0.01`, prefijo visual «US$» (`absolute left-3 text-muted-foreground`, `pl-10`). Ayuda: «Déjalo vacío para no poner tope.» Error: «Escribe un número igual o mayor que 0.»
- **Avisar al llegar al (%)** `Input type=number inputMode=numeric min=1 max=100 step=1`, sufijo «%». Ayuda: «Se avisa cuando el gasto alcance este porcentaje del tope.» Error: «Escribe un entero entre 1 y 100.»
- Los campos van en `grid gap-4 sm:grid-cols-2` solo cuando el contenedor es ancho; en la columna de `lg` quedan apilados.

Texto de ayuda (`InlineNotice tone="info"`, título «Qué pasa con el tope»): «Al agotar el tope, las llamadas de IA se rechazan hasta el mes siguiente o hasta que subas el tope. Se avisa a los administradores en el centro de notificaciones al llegar al umbral y al agotarse.»

Acciones: `Button type=submit loading` «Guardar presupuesto». Guardar con éxito: `toast.success('Presupuesto guardado.')` y recarga solo `usage` (la barra se actualiza). Error de API: `FormError` + `toast.error`. Botón deshabilitado sin cambios: no (calca el resto de la página). Validación en cliente al enviar; limpia el error del campo al editarlo.

## 4. Catálogo de modelos

`Section title="Catálogo de modelos"` `count={n}` con `actions`: `Button` «Nuevo modelo» (icono `Plus`). Descripción: «Modelos que los agentes pueden usar y su precio por millón de tokens.»

**Escritorio (`hidden md:block`, `Table` en `rounded-xl shadow-card`)**: columnas: Modelo (label `font-medium` + id `font-mono text-meta text-muted-foreground`), Nivel (`Badge`), Capacidades (badges), Precio (entrada / salida), Orden (`tabular-nums text-right`), Habilitado (`Switch`), Acciones (`RowActions` con «Editar»; botón ghost icono `Pencil` con `aria-label="Editar {label}"`, objetivo 36×36).
- Orden por `sortOrder` asc; sin ordenación por cabecera.

**Móvil (`md:hidden`, `DataCardList label="Modelos de IA"`)**: `title` label, `subtitle` id mono, `badges` = nivel + hasta 2 capacidades (el resto en `meta`), `meta`: «Entrada», «Salida» (`US$ 3 por millón de tokens` o «Sin precio»), «Orden»; `actions` = `RowActions menuOnly` («Editar»). El `Switch` va en `note` (fila `flex justify-between`, etiqueta «Habilitado»), alto 44 px de toque.

**Nivel**: `Badge` con icono y etiqueta: default → `success` + `Star` «Recomendado»; premium → `info` + `Gem` «Premium»; other → `neutral` + `Box` «Otro».
**Capacidades**: `Badge variant=neutral` `gap-1` con icono lucide `aria-hidden` y etiqueta: `Thermometer` «Temperatura», `Wrench` «Herramientas», `Eye` «Visión», `FileText` «Documentos». Las ausentes no se pintan; si no hay ninguna: «Solo texto» en `text-meta text-muted-foreground`. Contenedor `flex flex-wrap gap-1`, con `aria-label="Capacidades"`.
**Precio**: «US$ 3,00 por millón de tokens» (entrada/ salida en dos líneas con prefijo «Entrada» / «Salida» `text-meta`). Sin precio: `Badge warning` + icono `CircleDollarSign` «Sin precio» y `title`/sr-only «No suma al costo».

**Habilitar/deshabilitar**: `Switch` con `aria-label="Modelo {label} habilitado"`; cambio optimista deshabilitado mientras envía (`disabled aria-busy`). Si el modelo lo usa algún agente y se va a deshabilitar → `ConfirmDialog` (existente): título «¿Deshabilitar {label}?», texto «Lo usan: {agentes}. Dejará de ofrecerse en el catálogo; revisa su configuración para elegir otro modelo.», botones «Cancelar» / «Deshabilitar» (destructivo). Habilitar o deshabilitar un modelo libre no pide confirmación; éxito con toast. Foco vuelve al Switch (`useDialogReturnFocus`).

**Diálogo crear/editar** (`Dialog` existente; `Sheet` no): `max-w-lg`, cuerpo con scroll `max-h-[85dvh]`; en móvil casi pantalla completa (`max-sm:` margen 8 px). Pie `DialogFooter`: «Cancelar» (outline) y «Guardar» / «Crear modelo» (`loading`). Foco inicial en el primer campo editable.
- **ID del modelo** (solo alta; en edición `Input readOnly` con `bg-muted`, ayuda «No se puede cambiar»). Obligatorio, letras, números y `. _ : -`. Error: «Usa solo letras, números y . _ : -». Duplicado (409): «Ya existe un modelo con ese ID.» junto al campo.
- **Nombre visible** obligatorio, error «Escribe el nombre del modelo.».
- **Nivel** `Select`: Recomendado / Premium / Otro.
- **Capacidades** `<fieldset><legend>Capacidades</legend>` con 4 `Checkbox` + etiqueta en rejilla `grid-cols-2`.
- **Precios** (`grid sm:grid-cols-2`): «Entrada (USD por millón de tokens)» y «Salida (USD por millón de tokens)», `type=number min=0 step=0.0001`. Ayuda común: «Vacío = sin precio: no suma al costo.» Error: «Escribe un número igual o mayor que 0 o déjalo vacío.»
- **Orden** entero ≥ 0, ayuda «Los menores aparecen primero.»
- Error de API arriba con `FormError`; éxito: cierra, `toast.success`, recarga catálogo.

**Estados**: loading `Skeleton h-12 rounded-lg` ×4 (`aria-busy`); vacío `EmptyState` «Aún no hay modelos» + «Nuevo modelo»; error `InlineNotice danger` + «Reintentar»; fallo de cambio de Switch: revierte y `toast.error`.

## 5. Responsive y accesibilidad

| Elemento | 375 px | 1280 px |
|---|---|---|
| Selector de mes | ancho completo bajo descripción | `w-48` a la derecha del título |
| Tiles | 2×2 | 4×1 |
| Consumo + Presupuesto | apilados | rejilla 2fr/1fr |
| Desgloses y catálogo | `DataCardList` | `Table` |
| Diálogo | casi pantalla completa | `max-w-lg` centrado |

- Sin scroll horizontal a 375 px; texto largo (ids) con `break-all`/`truncate` + `title`.
- Foco visible `focus-visible:ring-2 ring-ring` en todo; orden de tabulación = orden visual; `Esc` cierra diálogos y devuelve el foco al disparador.
- Estado del presupuesto y capacidades nunca solo por color: icono + etiqueta + texto.
- Cambios asíncronos anunciados: aviso y resultados en `role="status"`, errores en `role="alert"`; cambio de mes anuncia «Consumo de {mes} cargado» en región `sr-only aria-live="polite"`.
- `prefers-reduced-motion`: sin transición en la barra. Objetivos táctiles ≥ 44 px en móvil (Switch, botones de tarjeta).

## 6. Estados del presupuesto y contraste medido

Criterio: `exceeded` → Agotado; si no `alert` → En alerta; si no → Normal. Relleno y texto usan el mismo token (`bg-*`/`text-*`); el badge usa `bg-*-subtle text-*` con borde `border-*-border`.

| Estado | Token | Icono + etiqueta | Texto/subtle claro | Texto/subtle oscuro | Relleno/card claro | Relleno/card oscuro |
|---|---|---|---|---|---|---|
| Normal | `success` | `CircleCheck` «Dentro del tope» | 6,07 | 8,36 | 6,74 | 9,19 |
| En alerta | `warning` | `TriangleAlert` «Cerca del tope» | 6,10 | 8,62 | 6,76 | 9,57 |
| Agotado | `danger` | `OctagonX` «Tope agotado» | 5,83 | 6,56 | 6,59 | 7,20 |
| Info (sin tope) | `info` | `Info` | 6,06 | 7,31 | 6,91 | 8,17 |

Medido (oklch de `globals.css` → sRGB → WCAG 2.x): texto ≥ 4,5:1 y relleno de barra/marca frente a la tarjeta ≥ 3:1 en ambos temas. Referencias: `foreground`/`card` 14,75 (claro) y 14,98 (oscuro); `muted-foreground`/`card` 7,13 y 7,62. La pista `bg-muted` es decorativa; el valor se da en texto. La marca del umbral usa `bg-foreground` (≥ 14:1 sobre la tarjeta).

## 7. Componentes: reutilizar vs. crear

**Reutilizar**: `PageLayout`, `PageHeader`, `Section`, `Field`/`FormError`, `InlineNotice`, `EmptyState`, `Skeleton`, `Switch`, `Select`, `Input`, `Checkbox`, `Button`, `Badge`, `Dialog`, `ConfirmDialog` (+ `useDialogReturnFocus`), `Table`, `DataCardList`, `RowActions`, `StatStrip`/`StatTile`, `UtilizationBar`, `toast` (sonner).

**Crear** (en `apps/web/src/app/administracion/ia/`, no genéricos hasta que haya segundo uso):
- `consumo-ia-section.tsx` (selector, tiles, aviso, desgloses).
- `budget-progress.tsx` (barra `role=progressbar` con marca de umbral; `UtilizationBar` no sirve: es 48×6 decorativa y sin umbral).
- `presupuesto-ia-form.tsx`.
- `catalogo-modelos-section.tsx` y `modelo-dialog.tsx`.
- `CapabilityBadges` y `ModelTierBadge` locales (iconos/etiquetas de §4).

Dividir `ia-agentes-view.tsx` ya es recomendable: pasa de ~450 líneas y cada pieza carga datos propios (`usage`, `models`).

## 8. Notas para el desarrollador
- Si `StatStrip` no admite 5 tiles, usa la decisión de 4 tiles de §2.
- `AgentCard` hoy usa `rounded-lg border`; las piezas nuevas siguen `rounded-xl shadow-card`. No se retoca lo existente salvo recargar el selector de modelos tras cambios en el catálogo.
