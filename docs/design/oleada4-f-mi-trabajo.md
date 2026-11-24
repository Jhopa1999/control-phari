# Oleada 4 · PR F: «Mi trabajo» (orden de la página y aprobar en lote)

Especificación visual de la vista rediseñada `/mi-trabajo`. Marca y tokens: `.kiro/steering/25-marca-gibo.md`.
Sin componentes ni dependencias nuevas salvo `QueueFold` (disclosure propio de la página).

## 1. Orden de la página

1. Encabezado (`PageHeader`, «Mi trabajo» + Actualizar).
2. Franja de contadores propios (vencidas, para hoy, en curso, bloqueadas): ya existe, ahora arriba.
3. Conmutador Lista/Tablero, filtros y **Mis tareas** (grupos por urgencia; sin cambios).
4. Colas plegables, en este orden: **Por aprobar** (solo jefe y líder), **Actividades recurrentes**, **Compromisos**.

Las colas ya no van encima de las tareas: lo primero que se ve es lo propio.

## 2. Cola plegable (`QueueFold`)

- Encabezado: botón de ancho completo, `min-h-11` en móvil y `md:min-h-10`, `rounded-xl bg-card shadow-card`,
  `font-heading text-base font-semibold`. Chevron a la izquierda (derecha = cerrada, abajo = abierta),
  título y recuento en una pastilla `bg-muted text-xs tabular-nums`.
- Accesibilidad: `aria-expanded` y `aria-controls` sobre el contenido; el recuento lleva texto oculto
  «elemento(s)». Foco visible con el anillo estándar (`outline-ring`).
- Estado por defecto: **cerrada**. La elección se recuerda por cola y por navegador en `localStorage`
  (`miTrabajoPorAprobarAbierto`, `miTrabajoRecurrentesAbierto`, `miTrabajoCompromisosAbierto`), igual que «Terminadas».
- El contenido sigue montado cuando está cerrado (`hidden`), así el recuento del encabezado es real aunque no se abra.
- Recurrentes y Compromisos sin elementos no pintan la cola (igual que antes no pintaban la sección).
  Por aprobar vacía sí se pinta, con recuento 0 y su estado vacío al abrirla.
- Recuento mientras carga o si falló: no se muestra la pastilla.

## 3. Ancla `#por-aprobar`

`/mi-trabajo#por-aprobar` abre la cola **sin cambiar la preferencia guardada**, desplaza hasta la sección y enfoca su
título. Si la persona la cierra con el ancla en la URL, se respeta su decisión.

## 4. Selección múltiple en «Por aprobar»

- Casilla por fila (`Checkbox` dentro de `label`, objetivo mínimo `min-h-8`; `max-sm:min-h-11`), con nombre accesible
  «Seleccionar PRY-0012-T07: título».
- Sobre la lista: «Seleccionar todas» (marca las visibles, hasta 25) y, con selección, una región «Acciones sobre la
  selección» con «N seleccionadas», «Limpiar selección» y **«Aprobar N tareas»** (botón primario).
- Tope de 25 (el del contrato): al llegar, las demás casillas quedan deshabilitadas y el contador lo dice.
- Confirmación: `ConfirmDialog` (`tone="default"`) «¿Aprobar N tareas?». Cuerpo: lista con `IdChip` (sin copiar,
  dentro del diálogo) y título (2 líneas máx.), `max-h-64` con desplazamiento y `tabIndex=0`. Texto: «Quedarán
  terminadas. Cada una se aprueba por separado: si alguna ya cambió de estado, se omite y las demás sí se aprueban.»
- Resultado: `InlineNotice` (verde si no hubo omitidas, ámbar si las hubo) con el recuento y, por cada omitida,
  `IdChip` + motivo en español. El foco pasa al aviso; «Cerrar aviso» lo retira. La cola se vuelve a leer.
- Las acciones individuales Aprobar y Devolver siguen igual y se deshabilitan mientras corre el lote.

## 5. Móvil (< 640 px)

- La casilla va encima del contenido de la tarjeta (columna), con área táctil de 44 px.
- La barra de selección envuelve en varias líneas; los botones mantienen `min-h-11`.
- El encabezado de cada cola ocupa todo el ancho y mide 44 px.
- `IdChip` ya mide 24 × 24 px (oleada 3, PR-C): no se toca.
