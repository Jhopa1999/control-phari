# Oleada 4 · PR E: aprobar solicitudes en lote

Especificación visual de FEAT-005. Vistas tocadas:

1. Aprobaciones, sección «Compromisos por aprobar»
   (`apps/web/src/app/administracion/revision/revision-view.tsx`).
2. Detalle de un evento de auditoría
   (`apps/web/src/app/gobierno/auditoria/ver-cambio-dialog.tsx`).

No hay componentes nuevos de librería. Se reutilizan `Checkbox`, `Button`,
`ConfirmDialog`, `InlineNotice`, `IdChip`, `PriorityBadge`, `DataCardList`,
`Table`, `DescriptionList`. Solo tokens semánticos; ningún color crudo.

## 1. Objetivo y acción principal

- **Objetivo.** El jefe de área aprueba varias solicitudes priorizadas con una
  sola confirmación, sin perder la revisión individual.
- **Acción principal.** Marcar solicitudes y pulsar «Aprobar N solicitudes».
- **Quién ve la selección.** Solo quien tiene `canDecide` (rol `JEFE_AREA`).
  Líder: sin casillas ni barra, como hoy («Solo lectura»). El backend sigue
  siendo el control real (403 para el líder).
- **Fuera de alcance.** «Devolver» exige un motivo por solicitud y se queda
  individual. La confirmación individual de «Aprobar» no cambia.

## 2. Estructura y jerarquía

Orden dentro de `Section «Compromisos por aprobar»`:

1. `InlineNotice` informativo existente. Para el jefe se amplía el texto:
   «Aprobar pide confirmación y lleva la solicitud a Comprometida. Puedes
   marcar varias y aprobarlas juntas (hasta 25). Devolver se hace de una en
   una, con un motivo.»
2. `PriorityLegend` (sin cambios).
3. **Panel de resultado del último lote** (solo si hay resultado; ver §4.5).
4. **Barra de selección** (solo con N ≥ 1; ver §3.2).
5. Tabla (escritorio y tablet) o tarjetas (móvil) con casilla por fila.

Foco visual: la barra de selección es el único elemento nuevo con énfasis.
Dentro de ella solo «Aprobar N solicitudes» usa `variant="default"`; lo demás
es secundario. En las filas, la selección se marca con casilla y fondo suave
(el color nunca es la única señal).

## 3. Clases Tailwind por bloque

### 3.1 Casillas

Se usa `Checkbox` (`components/ui/checkbox.tsx`) siempre dentro de un
`<label>` (da nombre accesible y área de toque, WCAG 2.5.8).

**Tabla (≥ `md`).** Nueva primera columna solo si `canDecide`:

- Cabecera: `<TableHead className="w-10 pr-0">` con
  `<label className="flex min-h-8 min-w-8 cursor-pointer items-center justify-center">`
  y `<Checkbox aria-label="Seleccionar todas las solicitudes (hasta 25)" />`.
  Estado `indeterminate` (propiedad DOM del input) cuando hay selección parcial.
- Fila: `<TableCell className="w-10 pr-0">` con el mismo `label` y
  `<Checkbox aria-label={`Seleccionar ${req.code}: ${req.title}`} />`.
- Fila seleccionada: `TableRow` con `className="bg-primary-subtle/60"`
  (ambos temas; el token ya cambia con el tema). Hover de fila sin cambios.
- Casilla deshabilitada: `disabled` nativo (ya aplica `opacity-50` y
  `cursor-not-allowed`). Se deshabilita durante un lote en curso y, al
  llegar a 25, las casillas no marcadas (con `aria-describedby` al texto del
  tope, §3.2).

**Tarjetas (< `md`).** `DataCardList` no tiene ranura inicial; la casilla va
en el `footer`, a la izquierda de las acciones:

```
footer: (
  <div className="flex w-full items-center justify-between gap-3">
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <Checkbox className="size-5" aria-label={`Seleccionar ${req.code}`} />
      Seleccionar
    </label>
    <RowActions footer rowLabel={req.title} actions={decisionActions(...)} />
  </div>
)
```

Tarjeta seleccionada: añadir `ring-2 ring-primary` a la tarjeta (si
`DataCardList` no admite clase por tarjeta, basta la casilla marcada y el texto
de la barra; no se modifica el componente para esto).

### 3.2 Barra de selección

Contenedor, entre la leyenda y la tabla (`mb-3`):

```
<div
  role="region"
  aria-label="Acciones sobre la selección"
  className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-primary/30 bg-card px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between md:static md:bottom-auto"
>
  <p className="text-sm font-medium" aria-live="polite" aria-atomic="true">
    {n} {n === 1 ? 'solicitud seleccionada' : 'solicitudes seleccionadas'}
    <span className="font-normal text-muted-foreground"> · máximo 25</span>
  </p>
  <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="ghost" onClick={clear}>Limpiar selección</Button>
    <Button type="button" variant="default" onClick={openDialog}>
      <Check aria-hidden="true" /> Aprobar {n} {n === 1 ? 'solicitud' : 'solicitudes'}
    </Button>
  </div>
</div>
```

- En móvil la barra queda pegada abajo (`sticky bottom-4`) para no obligar a
  volver arriba; en `md` y más es estática encima de la tabla. En móvil los
  botones ocupan el ancho: `w-full sm:w-auto` en cada uno.
- Al llegar a 25: el texto añade
  `<span id="tope-lote" className="text-warning">Llegaste al máximo de 25. Aprueba este lote y selecciona el resto.</span>`
  (con icono `Info` y texto; no solo color). `text-warning` es el token de
  `InlineNotice` tono warning; ver §8 sobre contraste.
- «Aprobar N» con una sola solicitud sigue permitido y usa el diálogo de lote
  (misma ruta; no se mezcla con la confirmación individual de la fila).
- Se oculta (se desmonta) con N = 0. Al desmontarse, el foco no se pierde: se
  desmonta solo tras «Limpiar selección», que devuelve el foco a la casilla de
  cabecera (o al encabezado de la Section en móvil).

### 3.3 Diálogo de confirmación del lote

Se reutiliza `ConfirmDialog` (alertdialog, foco inicial en «Cancelar», clic
fuera no cierra, Escape cierra salvo en curso).

- `title`: «¿Aprobar {n} solicitudes?» (singular: «¿Aprobar 1 solicitud?»).
- `description`: «Pasarán a Comprometida. Cada una se aprueba por separado: si
  alguna ya cambió de estado, se omite y las demás sí se aprueban.»
- `confirmLabel`: «Aprobar {n} solicitudes». `tone="default"`.
- `busy` mientras corre la petición; el botón muestra `loading`.
- `children`: lista con scroll. Si `DialogContent` admite `size="md"`, úsalo;
  si no, queda en `sm` (la lista scrollea):

```
<ul
  aria-label="Solicitudes que se aprobarán"
  className="grid max-h-64 min-w-0 gap-2 overflow-y-auto rounded-lg bg-muted/50 p-2"
  data-testid="approve-batch-summary"
  tabIndex={0}
>
  <li className="grid min-w-0 gap-1 rounded-md bg-card p-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <IdChip code={req.code} />
      <PriorityBadge variant="full" score={req.currentScore} label={req.priorityLabel} />
    </div>
    <p className="line-clamp-2 break-words text-sm font-medium">{req.title}</p>
  </li>
  …
</ul>
```

- El score va dentro de `PriorityBadge variant="full"` («P2 · 63» según el
  componente actual). Si el score es nulo, el badge ya muestra su estado
  vacío; no inventar texto.
- `tabIndex={0}` en la lista para poder desplazarla con teclado; foco visible
  con `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.
- Lista ordenada igual que la cola (no por selección), para que coincida con
  lo que ve el usuario.

### 3.4 Botón de la cabecera

«Actualizar» no cambia. Actualizar no borra la selección de solicitudes que
siguen en la cola; elimina de la selección las que ya no están.

## 4. Estados

| Estado | Comportamiento |
| --- | --- |
| Loading | Skeleton existente (`DataView` loading, 3 filas). Sin casillas hasta cargar. En lote en curso: casillas, «Limpiar» y acciones de fila `disabled`; el botón de confirmar con `loading`. |
| Vacío | `EmptyState` existente. Sin casillas ni barra. |
| Error de carga | `DataView` error con «Reintentar» (sin cambios). |
| Error del lote (red o 5xx) | `toast.error(mensaje)` y la selección se conserva para reintentar. Sin panel de resultado. |
| 403 (rol no autorizado) | `toast.error` con el mensaje de la API; no ocurre con la UI normal porque el líder no ve la selección. |
| Éxito total | Panel de resultado tono success + `toast.success('N solicitudes aprobadas. Pasan a Comprometida.')`. |
| Éxito parcial | Panel de resultado tono warning con las omitidas (ver §4.5) + toast `warning`. |
| Todas omitidas | Panel tono warning: «No se aprobó ninguna solicitud.» + lista. |
| Deshabilitado | Casillas `disabled:opacity-50`; «Aprobar N» deshabilitado si N = 0 (la barra no se muestra) o mientras corre el lote. |
| Foco | Anillo estándar `--ring` (`focus-visible:outline-2 outline-offset-2 outline-ring`) en casillas y botones. |

### 4.5 Panel de resultado del lote

El `ConfirmDialog` se cierra al terminar `onConfirm`, así que el resultado se
muestra en la página, no en el diálogo. Un `InlineNotice` descartable, encima
de la barra y de la tabla:

```
<InlineNotice tone={skipped === 0 ? 'success' : 'warning'} title={título} ref/tabIndex={-1}>
  …
</InlineNotice>
```

- Título: «{approved} {approved === 1 ? 'solicitud aprobada' : 'solicitudes aprobadas'}»
  y, si hay omitidas, « · {skipped} omitida(s)».
- Cuerpo si hay omitidas: lista `<ul className="mt-2 grid gap-1.5 text-sm">`;
  cada `<li className="flex flex-wrap items-baseline gap-x-2">` con
  `<IdChip code={item.code} />` y `<span>{item.reason}</span>`
  (por ejemplo «Ya no está en backlog priorizado.», «No encontrada.»). Sin
  código si la API no lo devuelve: mostrar solo el motivo.
- Las aprobadas no se listan una a una (ya salieron de la cola); basta el
  recuento. Para trazabilidad, el texto remite a Auditoría solo si el usuario
  tiene el módulo (no se añade enlace nuevo en este PR).
- Botón «Cerrar aviso» (`Button variant="ghost" size="sm"`, `aria-label="Cerrar resultado del lote"`).
  Si `InlineNotice` no admite acciones, colocarlo a la derecha en un
  `div flex justify-between` que envuelve el aviso.
- Foco: tras la respuesta y el refresco de la cola, el foco pasa al panel
  (`tabIndex={-1}` + `focus()`), para que lector de pantalla y teclado
  lleguen al resultado. Si no hay resultado visible (error), el foco vuelve al
  botón «Aprobar N».
- El panel desaparece al cerrarlo, al iniciar un nuevo lote o al pulsar
  «Actualizar».

## 5. Formularios

No hay campos de texto. La «entrada» es la selección:

- Label de cada casilla: nombre accesible con código y título (§3.1).
- Ayuda: el `InlineNotice` superior y el texto «· máximo 25» de la barra.
- Error junto al control: el tope de 25 se explica en la barra
  (`aria-describedby="tope-lote"` en las casillas deshabilitadas); el
  servidor repite el límite (400) y se muestra por `toast.error`.
- Envío: botón de confirmación con `loading`, sin doble envío.
- Confirmación: obligatoria (diálogo, §3.3).

## 6. Tabla

- Cabecera: casilla de selección + columnas existentes (Título, Prioridad,
  Registro, Acciones). La columna de casilla no lleva texto visible; su
  `aria-label` explica el tope.
- Fila: igual que hoy. Fondo `bg-primary-subtle/60` al estar seleccionada.
- Hover: el existente de `TableRow`.
- Acciones: «Aprobar» y «Devolver» individuales siguen en la fila (inline).
  Con un lote en curso quedan deshabilitadas.
- Vacío: sin cambios (`EmptyState` dentro de la tarjeta).
- Paginación: la cola no se pagina hoy. Si hay más de 25 pendientes, la
  casilla de cabecera selecciona solo las primeras 25 visibles y la barra
  muestra el aviso del tope.
- Cuando la selección queda vacía por un refresco, la barra se retira y se
  anuncia por el `aria-live` de la barra solo si estaba visible.

## 7. Badges

- Prioridad: `PriorityBadge` (`compact` en tabla y tarjeta, `full` en el
  diálogo). Nunca texto plano.
- Estado: «Comprometida» no se muestra como badge nuevo; aparece en el texto
  de descripción y en el toast.
- **Nuevo, solo en Auditoría:** marca «Aprobada por el creador» (§9).

## 8. Accesibilidad

- Orden de tabulación: botón «Actualizar» → casilla de cabecera → por fila
  (casilla → título enlace → acciones) → barra («Limpiar», «Aprobar N»). En
  móvil: por tarjeta (título → casilla → acciones). La barra va en el DOM
  **antes** de la tabla para que el usuario de teclado la encuentre sin
  recorrer toda la cola; `sticky` solo cambia la posición visual.
- Roles: la barra es `role="region"` con nombre; el contador usa
  `aria-live="polite"`; el diálogo es `alertdialog` (ya lo da `ConfirmDialog`);
  el panel de resultado recibe el foco.
- Casilla de cabecera con tres estados (`checked`, `indeterminate`,
  sin marcar) anunciados nativamente.
- Tamaños de interacción: casillas de tabla en área ≥ 32 × 32 px (label
  `min-h-8 min-w-8`, supera los 24 px de WCAG 2.5.8); en móvil ≥ 44 px
  (`min-h-11`).
- No depender del color: selección = casilla marcada + texto de la barra;
  resultado = icono del tono + título con recuento + texto del motivo.
- Contrastes. No se introduce ningún par de colores nuevo; se reutilizan los
  pares de componentes ya existentes. Valores **aproximados** calculados a
  partir de los OKLCH de `globals.css` (luminancia relativa); deben
  confirmarse con una herramienta antes de aprobar el PR:
  - `text-foreground` sobre `bg-primary-subtle/60` sobre `bg-card` (claro):
    ≈ 11:1; en oscuro (blanco sobre `primary-subtle` oscuro): ≈ 13:1.
  - `text-muted-foreground` sobre `bg-card` (claro) ≈ 7:1, sobre
    `bg-muted/50` ≈ 6:1; oscuro ≈ 6:1.
  - `text-warning` sobre `bg-card` y sobre `bg-warning-subtle`: par ya usado
    por `InlineNotice` tono warning. Mantener `font-medium` y icono.
  - Borde de la barra (`border-primary/30`) es decorativo: la barra se separa
    por `shadow-card` y el texto; no es un borde de control, no exige 3:1.
  - Casilla: contraste del control lo da `accent-primary` (azul `#176BEB` sobre
    blanco ≈ 4.8:1 ≥ 3:1).
- Movimiento: sin animaciones nuevas. Si el desarrollador anima la entrada de
  la barra, debe envolverla en `motion-safe:`.
- Pendiente de validación manual: prueba con lector de pantalla (NVDA o
  VoiceOver) del anuncio del contador y del foco al panel de resultado, y
  revisión experta de accesibilidad. Esta especificación no sustituye esas
  pruebas.

## 9. Auditoría: «Aprobada por el creador»

En `ver-cambio-dialog.tsx`, cuando `current.after` es un objeto con
`approvedByCreator === true` (eventos `CREATE`/`APPROVAL` y
`UPDATE`/`REQUEST`), se añade un ítem al `DescriptionList` de la cabecera,
después de «Objeto»:

- `term`: «Observación»
- `value`:

```
<span className="inline-flex items-center gap-1.5 rounded-full border border-info-border bg-info-subtle px-2.5 py-0.5 text-xs font-medium text-info">
  <UserCheck className="size-3.5" aria-hidden="true" />
  Aprobada por el creador
</span>
```

- Tono **info**, no danger: es un dato informativo, no una infracción (la
  separación de funciones del jefe no cambia).
- Debajo, texto de apoyo opcional en `text-meta text-muted-foreground`:
  «Quien aprobó también registró la solicitud.»
- Sin la marca, el ítem «Observación» no se muestra (no poner «—»).
- El bloque «Después» sigue mostrando el JSON con la clave
  `approvedByCreator`; la etiqueta es la lectura humana.
- Contraste: `text-info` sobre `bg-info-subtle` es el par de `InlineNotice`
  tono info; confirmar ≥ 4.5:1 en ambos temas al medirlo (§8).
- Columna `lg:grid-cols-2` y resto del diálogo sin cambios.

## 10. Responsive

| Ancho | Comportamiento |
| --- | --- |
| Móvil (< `md`, 768 px) | Tarjetas (`DataCardList`). Casilla «Seleccionar» en el pie de cada tarjeta, 44 px de alto. Barra `sticky bottom-4`, apilada, botones a ancho completo. Diálogo ocupa el ancho disponible; lista con `max-h-64`. Panel de resultado a ancho completo. |
| Tablet (`md`–`lg`) | Tabla con columna de casilla (`w-10`). Barra estática encima de la tabla; texto y botones en fila si caben (`sm:flex-row`), si no se apilan. La tabla conserva el scroll horizontal de `Table` (`scrollLabel`). |
| Escritorio (≥ `lg`) | Igual que tablet con más aire. Barra en una sola línea: contador a la izquierda, acciones a la derecha. |

## 11. Notas para el desarrollador

- Estado local: `selected: Set<string>` de ids; se purga al recargar la cola
  (intersección con los ids vigentes) y se vacía tras un lote.
- Tope de 25 y «sin duplicados» son del contrato; la UI los hace cumplir
  antes de enviar (el servidor valida igualmente).
- Tras la respuesta: recargar con `load()`, guardar `{approved, skipped,
  results}` para el panel y enfocar el panel.
- El `data-testid="approve-batch-summary"` y los nombres accesibles de §3 son
  la base de la e2e `aprobar-lote.spec.ts`.
- No se tocan `DevolverDialog`, `PlanAuthorizationSection` ni
  `PendingReviewsSections`.
