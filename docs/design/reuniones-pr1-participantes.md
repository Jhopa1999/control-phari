# Reuniones PR-1: participantes, responsable por proceso y acceso de solo lectura

Especificación visual para `desarrollador`. No incluye código de aplicación. Base funcional: `.agents/tasks/reuniones/informe.md` (secciones 2, 8 y 9). Marca: `.kiro/steering/25-marca-gibo.md`. Reglas de frontend: `.kiro/steering/20-frontend-nextjs.md`.

Archivos que afecta (solo para ubicar el trabajo): `apps/web/src/app/seguimiento/reuniones/reunion-form-dialog.tsx`, `actas-panel.tsx` (lista y detalle del acta).

## 0. Supuestos y dependencias

1. **Decisión de producto 2 del informe** (quién edita el acta abierta). Esta spec asume la recomendación **b)**: editan responsable, líder del proceso y jefe; los demás participantes leen y trabajan solo sus compromisos. Si se adopta **a)** (cualquiera edita), el apartado 5 (solo lectura) no se implementa y el resto no cambia.
2. **Datos que la web necesita de la API** (la API decide, la web solo pinta; no se calcula el permiso en el cliente):
   - `participants: [{ id, name }]` en el acta (nombre visible, nunca el id suelto).
   - Un indicador de acceso del usuario sobre el acta, por ejemplo `viewerCanEdit: boolean`. Desarrollador y backend acuerdan el nombre; el diseño solo exige que exista.
   - Personas candidatas por proceso (parámetro `processId` en la lista de personas). Devuelve lo mismo que acepta la validación de la API: personas con acceso al proceso.
3. Componentes existentes que se reutilizan tal cual: `Field`, `FieldSet`, `FormError`, `Input`, `Select`, `Checkbox`, `Button`, `Dialog*`, `InlineNotice` (`components/inline-notice.tsx`), `StatusBadge`, `EmptyState`. No se añade ninguna dependencia.
4. Contrastes: calculados con la luminancia relativa WCAG a partir de la claridad OKLCH de `globals.css` (para tonos casi neutros, Y ≈ L³). Son medidas de diseño con un margen de ±0,2. **El desarrollador debe confirmarlas con axe y con una medición de los píxeles renderizados en ambos temas antes de cerrar el PR.**

## 1. Objetivo y acción principal

- **Formulario del acta**: elegir responsable y participantes entre las personas del proceso y entender de inmediato quién recibirá el acta. Acción principal: **Crear acta** / **Guardar cambios** (un solo botón `Button` primario, sin cambios).
- **Detalle del acta**: ver quién participó, con nombre, sin textos como «Persona fuera de tu alcance».
- **Acceso de solo lectura**: que un participante entienda qué puede y qué no puede hacer, sin ver botones que fallan. Acción principal para ese usuario: leer el acta y abrir sus compromisos.

## 2. Estructura y jerarquía

### 2.1 Formulario (`ReunionFormDialog`, `size="md"`)

Orden de bloques (se conserva el orden actual hasta Duración; cambia lo siguiente):

1. Proceso (sin cambios).
2. Título, Fecha y hora, Duración (sin cambios).
3. **Responsable** (depende del proceso).
4. **Participantes** (depende del proceso). Es el bloque con más peso visual del formulario: lleva borde de control, resumen de seleccionados y lista.
5. **Aviso de visibilidad** (solo al crear o al sumar personas): una línea informativa bajo Participantes.
6. Agenda, Decisiones y acuerdos, Observaciones (sin cambios).
7. Error general (`FormError`) y pie con Cancelar / Crear acta.

Destaca: título y Participantes. No destaca: el aviso (tono informativo, sin borde grueso).

### 2.2 Detalle del acta (`actas-panel.tsx`)

1. Cabecera del acta: título, estado, rol del usuario en el acta (chip) y acciones.
2. **Aviso de solo lectura** (solo si `viewerCanEdit` es falso), inmediatamente bajo la cabecera.
3. Datos (fecha, hora, duración, responsable).
4. **Participantes**: sección propia con contador, antes de Agenda.
5. Agenda, decisiones, observaciones, compromisos (sin cambios).

### 2.3 Lista de actas (maestro)

Cada fila añade, a la derecha del título o bajo él, un chip de rol del usuario: **Responsable**, **Participante** o ninguno (líder y jefe lo ven por jerarquía, sin chip). Sirve para que quien solo participa sepa por qué ve esa acta.

## 3. Formulario: Responsable y Participantes por proceso

### 3.1 Antes de elegir proceso (crear)

- Responsable: `SelectTrigger` deshabilitado, placeholder «Elige primero un proceso».
- Participantes: bloque deshabilitado con el texto de ayuda `text-meta text-muted-foreground`: «Elige primero un proceso para ver a sus integrantes.»
- Deshabilitado: `disabled:opacity-60 disabled:cursor-not-allowed`; el texto de ayuda explica la razón, así que el estado no depende solo de la opacidad. El texto de ayuda va enlazado con `aria-describedby`.

### 3.2 Responsable

Misma estructura de hoy (`Field` + `Select`), con opciones = personas del proceso elegido. Ayuda bajo el campo (`text-meta text-muted-foreground`): «Dirige la reunión y puede cerrar el acta.» (El texto exacto de permisos lo confirma el backend con la decisión 2.)

- Opción por defecto «Sin responsable» se mantiene.
- Al cambiar de proceso: si el responsable elegido no pertenece al proceso nuevo, se limpia y se anuncia en el aviso de cambio de proceso (3.5).
- Error de persona (`usePersonError`): se mantiene el comportamiento actual (mensaje junto al campo y foco en él).

### 3.3 Participantes: contenedor

`FieldSet` con leyenda «Participantes» y, a la derecha de la leyenda, un contador `text-meta text-muted-foreground`: «3 seleccionados». El contador va dentro de un `<span aria-live="polite">`.

Estructura dentro del `FieldSet`, de arriba abajo:

1. **Chips de seleccionados** (solo si hay al menos uno).
2. **Buscador** (solo si el proceso tiene más de 8 personas).
3. **Lista de personas** con casillas.

Clases:

| Elemento | Clases |
|---|---|
| Contenedor de chips | `flex flex-wrap gap-1.5` |
| Chip | `inline-flex items-center gap-1 rounded-full bg-primary-subtle py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground` |
| Botón quitar del chip | `inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/15 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-8`; icono `X` `size-3.5` con `aria-hidden`; `aria-label="Quitar a {nombre}"` |
| Buscador | `Input` con `type="search"`, label visible oculto solo visualmente (`sr-only`) «Buscar persona»; placeholder «Buscar por nombre»; icono `Search` decorativo a la izquierda (`pl-9`, icono `absolute left-3 size-4 text-muted-foreground`) |
| Lista (caja) | `max-h-56 overflow-y-auto rounded-md border border-input bg-card px-1 py-1` |
| Fila de persona | `label` con `flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted pointer-coarse:min-h-11` |
| Fila marcada | `bg-primary-subtle/60` además de la casilla marcada (el estado también lo da la casilla y `aria-checked`, no solo el color) |
| Iniciales | `grid size-7 shrink-0 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-link` con `aria-hidden="true"` |
| Nombre | `min-w-0 flex-1 truncate` |
| Etiqueta «Responsable» en la fila | `shrink-0 rounded-full border border-info-border bg-info-subtle px-2 py-0.5 text-xs font-medium text-info` con icono `UserCheck` `size-3` |

Reglas:

- El responsable elegido aparece en la lista con la etiqueta «Responsable». Su casilla **no** se marca ni se bloquea por sí sola: ver el acta no depende de ser participante cuando eres responsable. La ayuda lo dice: «El responsable ya puede ver el acta; no hace falta marcarlo.»
- Orden de la lista: alfabético por nombre. El usuario actual lleva el sufijo « (tú)» en `text-muted-foreground`.
- Sin botón «Seleccionar a todos» en esta entrega: marcar a todo un proceso por error amplía quién lee el acta. Si el producto lo pide más adelante, irá como enlace secundario con confirmación.
- El buscador filtra sin perder las casillas ya marcadas fuera del filtro. El resultado se anuncia en una región `aria-live="polite"` (`sr-only`): «5 personas coinciden» o «Ninguna persona coincide con “ana”».
- Sin resultados de búsqueda: dentro de la caja, `p` con `px-2 py-3 text-sm text-muted-foreground`: «Ninguna persona coincide. Revisa el nombre o borra la búsqueda.» y botón `variant="link"` «Borrar búsqueda».

### 3.4 Aviso de visibilidad (crear y al sumar personas)

`InlineNotice` `tone="info"` `role="note"` (no es un evento), debajo del bloque de participantes, con el texto:

> Cada participante recibirá una notificación y podrá leer el acta completa: agenda, decisiones y compromisos de todos.

Se muestra al crear y, al editar, solo cuando hay personas recién marcadas respecto del acta guardada. Con 0 participantes marcados no se muestra. Texto del aviso en `text-foreground`; icono `Info` en `text-info`.

Contraste: `text-foreground` sobre `bg-info-subtle`: ≈ 13,0:1 en claro; en oscuro el foreground blanco sobre `info-subtle` (L 0,28) ≈ 14:1. Borde `border-info-border` es decorativo (no es un control).

### 3.5 Cambio de proceso con selección previa (solo crear)

Si el usuario cambia el proceso y había responsable o participantes que no pertenecen al proceso nuevo:

- Se quitan de la selección automáticamente.
- Se muestra un `InlineNotice` `tone="warning"` `role="status"` justo encima del bloque Responsable: «Se quitaron 2 participantes y el responsable porque no pertenecen al proceso elegido. Revisa la lista.»
- El aviso se cierra cuando el usuario modifica de nuevo cualquiera de los dos campos o cambia otra vez el proceso. No lleva botón de cierre.
- El foco no se mueve; el `role="status"` lo anuncia.

En edición el proceso es de solo lectura, así que este caso no ocurre.

### 3.6 Participante guardado que ya no está en la lista del proceso

En edición, si un participante del acta ya no pertenece al proceso, aparece igualmente al principio de la lista, marcado, con la etiqueta `border-warning-border bg-warning-subtle text-warning` y texto «Ya no está en el proceso». Puede desmarcarse; si se deja, la API decide si guarda o devuelve el error, que se muestra con `FormError`. Contraste de `text-warning` sobre `bg-warning-subtle`: ≈ 6,3:1 en claro; en oscuro (`warning` L 0,83 sobre `warning-subtle` L 0,28) ≈ 9:1.

## 4. Estados del formulario

| Estado | Responsable | Participantes |
|---|---|---|
| Sin proceso (crear) | Select deshabilitado, ayuda «Elige primero un proceso» | Bloque deshabilitado con ayuda |
| Cargando personas | Select deshabilitado con `SelectValue` «Cargando personas…» | 5 filas esqueleto: `h-9 rounded-md bg-muted animate-pulse motion-reduce:animate-none`, dentro de la caja; `aria-busy="true"` en el `FieldSet` y texto `sr-only` «Cargando personas del proceso» |
| Proceso sin otras personas | Solo «Sin responsable» | `EmptyState` compacto sin ilustración: icono `Users` en círculo `primary-subtle`, título «Este proceso no tiene más personas», texto «Pídele a la persona líder o a la jefatura que agregue integrantes al proceso.» |
| Error al cargar personas | Select deshabilitado | `InlineNotice` `tone="danger"` `role="alert"`: «No pudimos cargar las personas del proceso. Intenta de nuevo.» con botón `variant="outline" size="sm"` «Reintentar». El foco no salta; el botón es alcanzable con Tab |
| Con datos | Normal | Lista, chips y contador |
| Enviando | Controles deshabilitados por `submitting` (comportamiento actual); botón con `loading` y texto «Guardando…» | Igual |
| Error del servidor | `FormError` general, o error de persona junto al Responsable | `FormError` general. El 400 «participante fuera de alcance» se traduce a: «Uno de los participantes no pertenece al proceso. Quítalo e intenta de nuevo.» |
| Éxito | Se cierra el diálogo y el padre muestra el toast existente. Al crear con participantes, el toast añade: «Acta creada. Se avisó a 3 participantes.» |
| Foco | Anillo `focus-visible:ring-2 ring-ring` en todo control; no se retira |

El error del campo Proceso sigue siendo el actual (`Selecciona un proceso.`).

## 5. Detalle del acta: lista de participantes

Sección `<section aria-labelledby="acta-participantes">` con encabezado `h3` `id="acta-participantes"` «Participantes (N)» (`text-sm font-semibold text-foreground`) y, debajo, la lista.

- Lista: `<ul class="mt-2 flex flex-wrap gap-2">`.
- Cada participante: `<li class="inline-flex min-h-8 items-center gap-2 rounded-full bg-muted py-1 pl-1 pr-3 text-sm text-foreground">` con iniciales `grid size-6 place-items-center rounded-full bg-primary-subtle text-[0.6875rem] font-semibold text-link` (`aria-hidden`) y el nombre completo.
- El responsable va primero y lleva la etiqueta «Responsable» (mismas clases info de 3.3). Si el usuario actual está en la lista: «(tú)» en `text-muted-foreground`.
- Hasta 8 se muestran todos. Con más: se muestran 8 y un botón `variant="ghost" size="sm"` «Ver los N restantes» con `aria-expanded` y `aria-controls`; al abrir cambia a «Ver menos». El foco permanece en el botón.
- Nombre truncado: `max-w-[16rem] truncate` con `title` igual al nombre completo.
- Nunca se muestra «Persona fuera de tu alcance» ni un id. Si la API no entrega el nombre de una persona, se muestra «Participante sin nombre disponible» en `text-muted-foreground italic`, sin iniciales (`?`), y se registra como defecto de datos. Es un caso que no debe ocurrir con `participants` en el DTO.
- Sin participantes: `p.text-sm.text-muted-foreground` «Nadie más participa en esta acta.»

Contraste: `text-foreground` sobre `bg-muted`: ≈ 11,9:1 en claro, ≈ 12:1 en oscuro. `text-link` sobre `bg-primary-subtle` (iniciales, texto de 11 a 12 px en negrita; es decorativo y duplicado por el nombre): ≈ 4,8:1 en claro (cumple 4,5:1 con poco margen), ≈ 5,6:1 en oscuro.

## 6. Acceso de solo lectura

### 6.1 Cuándo aplica

`viewerCanEdit` falso en un acta que el usuario puede ver (es participante y no es responsable, líder del proceso ni jefe).

### 6.2 Aviso en el detalle

`InlineNotice` `tone="neutral"` `role="note"` con icono `Eye` (`icon={Eye}`), título y texto:

- Título: «Solo puedes leer esta acta»
- Texto: «Participas en esta reunión. Solo el responsable, el líder del proceso y la jefatura pueden editarla. Tus compromisos los actualizas desde esta pantalla o desde Mi trabajo.»
- Acción (si el usuario tiene compromisos propios en el acta): botón `variant="outline" size="sm"` «Ver mis compromisos de esta acta», que lleva el foco y el desplazamiento al primer compromiso propio (ancla dentro de la misma pantalla, sin navegar).
- Acta cerrada y solo lectura a la vez: un único aviso con el título «Acta cerrada, solo lectura» y el texto «El acta está cerrada y tú participas en ella. Puedes leerla y descargarla.» No se apilan dos avisos.

Un aviso `neutral` es deliberado: no es un error ni una advertencia; es un estado normal. Contraste `text-foreground` sobre `bg-neutral-subtle` ≈ 12,5:1 en claro y ≈ 13:1 en oscuro. El icono `text-neutral` (≈ 7,2:1 sobre su fondo) es redundante con el texto.

### 6.3 Chip de rol en la cabecera

Junto al estado del acta: chip `inline-flex items-center gap-1 rounded-full border border-neutral-border bg-neutral-subtle px-2 py-0.5 text-xs font-medium text-neutral` con icono `Eye size-3` y texto «Solo lectura». Si el usuario edita, no aparece. Es complemento del aviso (no lo sustituye): el aviso explica, el chip permite reconocer el estado de un vistazo. Contraste `text-neutral` sobre `bg-neutral-subtle` ≈ 7,2:1 en claro; en oscuro (`neutral` L 0,82 sobre L 0,285) ≈ 9:1.

### 6.4 Botones

| Elemento | Participante de solo lectura |
|---|---|
| Editar acta, Cerrar acta, Reabrir, Eliminar, Registrar duración, Agregar compromiso | **No se muestran** (no se deshabilitan). El aviso 6.2 explica por qué faltan. Motivo: una fila de botones deshabilitados añade ruido y no se puede explicar cada uno con claridad |
| Descargar acta, Imprimir / PDF | Se muestran (leer y exportar) |
| Compromiso propio (asignado o responsable) | Mantiene su acción «Cambiar estado» y editar resultado o bloqueos, como hoy |
| Compromiso de otra persona | Solo lectura: sin acciones. Se ve título, responsable, fecha, estado |

### 6.5 Estados de acceso

| Estado | Tratamiento |
|---|---|
| Cargando acta | Esqueleto de la cabecera y de los bloques; los avisos no se muestran hasta saber `viewerCanEdit` (evita el parpadeo de botones que luego desaparecen). Botones de acción ocultos mientras carga |
| Acta no encontrada o sin acceso (404) | `EmptyState` dentro de la tarjeta: icono `FileX` en círculo `primary-subtle`, título «No encontramos esta acta», texto «Puede que se haya eliminado o que ya no participes en ella.» y botón «Volver a las actas» |
| Pérdida de permiso mientras edita (403 o 409 de la API) | Si el diálogo de edición estaba abierto: `FormError` «Ya no puedes editar esta acta. Se actualizó con tu acceso actual.»; al cerrar, el detalle se recarga y aparece el aviso 6.2. El foco vuelve al botón que abrió el diálogo (comportamiento actual de `useDialogReturnFocus`) o, si ese botón ya no existe, al `h2` del acta (con `tabIndex={-1}`) |
| Error al cargar | `InlineNotice` `tone="danger"` `role="alert"` con «Reintentar», dentro de la tarjeta de detalle |
| Éxito al cambiar estado de un compromiso propio | Toast actual |
| Deshabilitado | No hay controles deshabilitados por solo lectura; los que no se pueden usar no se pintan |

### 6.6 Lista de actas: chip de rol

En cada fila: chip pequeño `text-xs` con la misma estructura que 3.3.
- Responsable: tono info + icono `UserCheck`.
- Participante: tono neutral + icono `Users`.
- Sin chip para líder y jefe.

El chip nunca es el único indicador de significado: lleva texto. En móvil se pasa debajo del título (`mt-1`).

## 7. Badges semánticos usados

| Dónde | Texto | Tono (tokens) | Icono |
|---|---|---|---|
| Estado del acta (existente) | Abierta / Cerrada / Archivada | `StatusBadge` existente, sin cambios | el actual |
| Rol | Responsable | `border-info-border bg-info-subtle text-info` | `UserCheck` |
| Rol | Participante | `border-neutral-border bg-neutral-subtle text-neutral` | `Users` |
| Acceso | Solo lectura | `border-neutral-border bg-neutral-subtle text-neutral` | `Eye` |
| Participante fuera del proceso | Ya no está en el proceso | `border-warning-border bg-warning-subtle text-warning` | `TriangleAlert` |

Todo badge lleva texto y, salvo en el chip de nombre, icono. Si `StatusBadge` admite un tono genérico `info`/`neutral`/`warning`, úsese en lugar de las clases de la tabla; si no, estas clases son las fuente. No se crean colores nuevos.

## 8. Accesibilidad

Contrastes calculados (ver supuesto 4):

| Par | Claro | Oscuro |
|---|---|---|
| `text-foreground` / `bg-card` | ≈ 14,6:1 | ≈ 15:1 |
| `text-foreground` / `bg-info-subtle` | ≈ 13,0:1 | ≈ 14:1 |
| `text-foreground` / `bg-neutral-subtle` | ≈ 12,5:1 | ≈ 13:1 |
| `text-foreground` / `bg-primary-subtle` (chips) | ≈ 12:1 | ≈ 13:1 |
| `text-muted-foreground` / `bg-card` (ayudas) | ≈ 7,1:1 | ≈ 7,4:1 |
| `text-muted-foreground` / `bg-muted` | ≈ 5,7:1 | ≈ 6,3:1 |
| `text-info` / `bg-info-subtle` | ≈ 6,0:1 | ≈ 8:1 |
| `text-neutral` / `bg-neutral-subtle` | ≈ 7,2:1 | ≈ 9:1 |
| `text-warning` / `bg-warning-subtle` | ≈ 6,3:1 | ≈ 9:1 |
| `text-link` / `bg-primary-subtle` (iniciales) | ≈ 4,8:1 | ≈ 5,6:1 |
| Borde de control `border-input` / `bg-card` | ≥ 3:1 (token ya medido en `globals.css`) | ≥ 3:1 |

El valor más ajustado es `text-link` sobre `bg-primary-subtle` en claro. Si la medición real da menos de 4,5:1, las iniciales pasan a `text-foreground`.

Estructura y roles:
- `FieldSet` con `<legend>` para Participantes; cada fila es un `<label>` que envuelve su `Checkbox` (nombre accesible = nombre de la persona).
- Contador y resultados de búsqueda: regiones `aria-live="polite"` (`sr-only` para los resultados).
- Chip: botón de quitar con `aria-label` completo; tamaño de objetivo ≥ 24 px (WCAG 2.2 AA, 2.5.8) y 32 px con puntero táctil.
- Filas de lista: alto ≥ 40 px (44 px con puntero táctil).
- Avisos: `role="note"` para los permanentes, `role="status"` para el aviso de cambio de proceso, `role="alert"` solo para errores de carga.
- No se transmite nada solo por color: rol y acceso llevan texto e icono; la fila marcada tiene casilla marcada.
- Los iconos son `aria-hidden`.
- Movimiento: esqueleto con `motion-reduce:animate-none`; no hay otras animaciones.

Orden de tabulación del formulario: Proceso, Título, Fecha, Hora, Duración, Responsable, [chips: botones «Quitar a …» en orden], Buscador, casillas de la lista (en orden alfabético), Agenda, Decisiones, Observaciones, Cancelar, Crear acta.

Orden en el detalle: cabecera y acciones, aviso de solo lectura (y su botón), participantes (y «Ver los N restantes»), contenido, compromisos.

Escape cierra el diálogo (Radix). Al cerrar, el foco vuelve al botón de origen.

**Validación pendiente que este diseño no cubre.** Contraste, tamaño de objetivo y orden son comprobaciones de diseño. Falta una prueba manual con lector de pantalla (NVDA y VoiceOver) del bloque de casillas con filtro, de los avisos `aria-live` y de la navegación solo con teclado, más una revisión experta de accesibilidad. La deuda ya declarada `label-content-name-mismatch` (WCAG 2.5.3) en Reuniones no se resuelve aquí.

## 9. Responsive

| Ancho | Formulario | Detalle |
|---|---|---|
| Móvil (< 640 px) | Diálogo a ancho completo como el resto del portal. Fecha y hora en una columna. Caja de la lista `max-h-48`. Chips en varias líneas. Filas de 44 px | Participantes en chips que ocupan varias líneas, nombres con `truncate` y `max-w-full`. Aviso de solo lectura con la acción debajo del texto (el `InlineNotice` ya apila). Chip de rol bajo el título en la lista |
| Tablet (640 a 1023 px) | Igual que el actual (`sm:grid-cols-2` para fecha y hora). Caja `max-h-56` | Igual que escritorio |
| Escritorio (≥ 1024 px) | Diálogo `size="md"`. Caja `max-h-56`. Con más de 12 personas, lista en dos columnas: `sm:grid sm:grid-cols-2` en el `ul` | Chips en una o dos líneas; aviso con la acción a la derecha (comportamiento de `InlineNotice`) |

La página no debe ensanchar el viewport en 390 px (regla de BL-070/BL-080). Hay que comprobarlo con un nombre largo (60 caracteres) en chips y filas.

## 10. Textos (español, con tildes)

Los textos de esta spec son definitivos salvo el de permisos del Responsable, que depende de la decisión 2. Un texto de error de la API que llegue al usuario debe explicar qué pasó y qué hacer, no mostrar códigos HTTP.

## 11. Qué revisar al implementar

1. Con un integrante en un proceso de cinco personas: el selector lista a las otras cuatro. Con ninguna: aparece el vacío de 4.
2. Cambiar de proceso con selección: se quita y se avisa.
3. Un participante que no edita: ve el aviso 6.2, el chip «Solo lectura», sin botones de edición, con Descargar e Imprimir; mantiene sus compromisos.
4. Nombres visibles en la lista de participantes con un usuario sin alcance sobre los demás.
5. Pruebas axe en claro y oscuro a 1440 y 390 px del diálogo y del detalle (patrón de BL-080).
