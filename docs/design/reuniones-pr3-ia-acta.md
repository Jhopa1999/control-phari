# Reuniones PR-3: IA en el acta (estructurar texto y proponer compromisos)

Especificación visual para `desarrollador`. No incluye código de aplicación. Base funcional: `.agents/tasks/reuniones/informe.md` (sección 4 «IA», decisiones 6 a 9). Marca: `.kiro/steering/25-marca-gibo.md`. Reglas de frontend: `.kiro/steering/20-frontend-nextjs.md`. Patrón de referencia en el repo: panel «Sugerencia de IA» del triage (`apps/web/src/app/demanda/triage/triage-view.tsx`, icono `Sparkles`, mensajes por estado en `lib/ai-triage.ts`). Complementa a `reuniones-pr1-participantes.md`: el formulario del acta ya trae el selector de personas por proceso, y esta spec se apoya en él.

Archivos que afecta (solo para ubicar el trabajo): `apps/web/src/app/seguimiento/reuniones/reunion-form-dialog.tsx` (punto de entrada) y componentes nuevos junto a él. El informe (sección 6, «Deuda técnica») pide un componente aparte para no engordar `actas-panel.tsx`; esta spec asume `acta-ia-panel.tsx` (bloque del formulario) y `acta-ia-preview.tsx` (vista previa).

## 0. Supuestos y dependencias

1. **La IA solo propone.** Nada se guarda ni se crea hasta que la persona pulsa «Crear acta» o «Guardar cambios». El texto de las notas no se persiste (no es un campo del acta). Esta spec no cambia ninguna regla de negocio.
2. **Datos que la web necesita de la API** (la API decide, la web solo pinta):
   - Respuesta de `POST /meetings/ai/structure`: `agenda`, `decisions`, `notes`, `commitments[]` (`title`, `assignedUserId | null`, `assigneeText | null`, `dueDate | null`, `expectedResult | null`, `sourceQuote`), `warnings[]`, `model`.
   - **Disponibilidad de la IA** para usuarios que no son administradores. Hoy no existe un endpoint así (búsqueda hecha en `apps/`). Esta spec define tres estados de interfaz (apartado 6) y funciona en dos modos: con endpoint (decisión 6 b) o sin él (decisión 6 a, el estado se descubre con el primer 409). La recomendación del informe es a) en esta entrega; el diseño ya deja el hueco para b).
   - Mensajes de error del cuerpo (`message`) en español y aptos para mostrar, como hace `lib/ai-triage.ts`. Si el cuerpo no trae mensaje, la web usa los del apartado 7.
3. **Componentes existentes que se reutilizan tal cual:** `Field`, `FieldSet`, `FormError`, `Input`, `Textarea`, `Select`, `Checkbox`, `Button` (con `loading` y con `unavailable`, que deja el botón enfocable con `aria-disabled`), `Dialog*`, `InlineNotice`, `EmptyState`. Iconos de `lucide-react`: `Sparkles`, `Info`, `TriangleAlert`, `X`, `Quote`. No se añade ninguna dependencia.
4. **Contrastes.** Los ratios de este documento se calcularon con la luminancia relativa WCAG a partir de la claridad OKLCH de `apps/web/src/app/globals.css` (valores vigentes en el worktree). En tonos casi neutros se usa Y ≈ L³; en tonos saturados el error es mayor, de ±0,5. Son medidas de diseño. **El desarrollador debe confirmarlas con axe y midiendo los píxeles renderizados en ambos temas antes de cerrar el PR.**
5. Los textos de esta spec son definitivos, salvo los que dependen de una decisión abierta y están marcados.

## 1. Objetivo y acción principal

- **Objetivo.** Que cualquier persona pueda registrar una reunión pegando sus notas tal como las tiene, y que la IA las ordene en agenda, decisiones y observaciones y sugiera compromisos, sin perder el control.
- **Acción principal 1 (en el formulario):** pulsar **Estructurar con IA**.
- **Acción principal 2 (en la vista previa):** revisar y pulsar **Usar en el acta**.
- **Acción final, sin cambios:** **Crear acta** / **Guardar cambios**. Es el único momento en que algo se guarda.
- La IA es una ayuda, nunca un requisito: si falla o no está disponible, la persona sigue escribiendo el acta a mano sin perder nada.

## 2. Estructura y jerarquía

Flujo en tres momentos, todos dentro del mismo diálogo del acta (`ReunionFormDialog`, `size="md"`, sin cambiar de ancho):

1. **Formulario con bloque de IA.** Nuevo bloque «Estructurar con IA» entre Participantes y Agenda.
2. **Vista previa.** Segunda vista del mismo diálogo que sustituye al cuerpo del formulario mientras se revisa la propuesta.
3. **Formulario con lo aplicado.** Vuelve el formulario con los campos rellenos y, al final, el resumen de compromisos que se crearán al guardar.

Orden del formulario (cambian solo los puntos 7 y 11):

1. Proceso. 2. Título. 3. Fecha y hora. 4. Duración. 5. Responsable. 6. Participantes (con su aviso de visibilidad de PR-1).
7. **Bloque «Estructurar con IA»** (nuevo).
8. Agenda. 9. Decisiones y acuerdos. 10. Observaciones.
11. **Compromisos que se crearán al guardar** (nuevo; solo si hay alguno aceptado).
12. Error general (`FormError`) y pie.

Por qué ese lugar: la IA necesita el proceso y conviene que las personas ya estén elegidas, porque propone responsables entre ellas. El texto pegado queda justo encima de los campos que va a rellenar, y la persona ve el vínculo sin explicación.

Qué destaca: el botón **Estructurar con IA** (único botón del bloque) y, en la vista previa, los compromisos y el botón **Usar en el acta**. Qué no destaca: el aviso de privacidad (informativo, tono `info`, sin título).

El botón queda **debajo y pegado al cuadro de texto**, no dentro. Motivo: un botón flotando dentro del `textarea` se solapa con el texto largo, con la barra de desplazamiento y con el tirador de redimensionado, y en móvil queda tapado por el teclado.

## 3. Bloque «Estructurar con IA» en el formulario

### 3.1 Anatomía (de arriba abajo)

| # | Elemento | Contenido |
|---|---|---|
| 1 | Encabezado | Icono `Sparkles` y título `h3` «Estructurar con IA» |
| 2 | Subtítulo | «Señal orientativa: nada se registra por sí solo. Revisa y confirma antes de usar el resultado.» |
| 3 | Campo | `Field` «Notas de la reunión» con ayuda y `Textarea` |
| 4 | Aviso de privacidad | `InlineNotice` `tone="info"` `role="note"` |
| 5 | Fila de acción | Estado a la izquierda, botones a la derecha |
| 6 | Resultado previo (opcional) | Aviso de éxito tras aplicar, apartado 5.3 |

### 3.2 Clases por elemento

| Elemento | Clases |
|---|---|
| Contenedor `<section aria-labelledby="reu-ia-title">` | `grid gap-3 rounded-xl border border-border bg-muted/40 p-4` |
| Fila del título | `flex items-center gap-2` |
| Icono | `Sparkles` con `size-4 shrink-0 text-link` y `aria-hidden="true"` |
| Título `h3#reu-ia-title` | `text-sm font-semibold text-foreground` |
| Subtítulo | `text-meta text-muted-foreground` |
| `Field` | `id="reu-ia-text"`, `label="Notas de la reunión"`, `help="Pega o escribe lo que se habló, tal como lo tengas. Este texto no se guarda en el acta: solo sirve para que la IA lo ordene."` |
| `Textarea` | `min-h-32 max-h-80 resize-y` (el resto, del componente). `name` sin autocompletar: `autoComplete="off"`, `spellCheck` activo |
| Aviso de privacidad | `InlineNotice` `tone="info"` `role="note"` con el texto del apartado 3.3 |
| Fila de acción | `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between` |
| Texto de estado | `text-meta text-muted-foreground` dentro de `<span aria-live="polite">` |
| Grupo de botones | `flex flex-col-reverse gap-2 sm:flex-row sm:items-center` |
| Botón principal | `Button` `variant="outline"` `size="default"` con `<Sparkles aria-hidden="true" />` delante y texto «Estructurar con IA»; en móvil `w-full`, con puntero táctil `pointer-coarse:min-h-11` |
| Botón «Cancelar» (solo mientras carga) | `Button` `variant="ghost"` `size="default"` |

El bloque lleva fondo tintado (`bg-muted/40`) para distinguirse del resto del formulario sin añadir un borde marcado; el borde `border-border` (9 % de marino en claro, 10 % de blanco en oscuro) es decorativo. En oscuro todo cambia solo por los tokens.

El botón es `outline`, como en el triage, y no `default`, porque la acción primaria del diálogo sigue siendo «Crear acta». Dos botones con relleno `primary` compitiendo en el mismo diálogo restan jerarquía.

### 3.3 Textos

- Aviso de privacidad (definitivo; depende de la decisión 9 a del informe):
  > El texto que escribas aquí, la fecha de la reunión y los nombres de las personas del proceso se envían al modelo de IA configurado por la organización. No se envían correos, identificadores ni el resto del acta. No pegues información que no deba salir de la organización.
- El aviso siempre está visible cuando el bloque está activo, **antes** del botón; no se esconde en un tooltip ni se pide marcar una casilla. Si la decisión 9 cambia a b) (no enviar nombres), el aviso pierde «y los nombres de las personas del proceso» y el diseño del responsable (apartado 4.4) se reduce a «elegir de la lista».
- Placeholder del `Textarea`: «Ejemplo: Se acordó mover el lanzamiento al 15. Marta envía el informe el viernes…» (`placeholder:text-muted-foreground`, el contraste del placeholder lo cubre el componente existente).

### 3.4 Estados del bloque

| Estado | Tratamiento |
|---|---|
| **Sin proceso elegido** (crear) | Botón con `unavailable` (queda enfocable, `aria-disabled="true"`) y `aria-describedby` apuntando al texto de estado: «Elige primero un proceso para usar la IA.» El `Textarea` sí se puede escribir |
| **Texto vacío al pulsar** | No se llama a la API. Error de campo junto al `Textarea` (`Field` `error`): «Escribe o pega el texto de la reunión para que la IA lo ordene.» El foco pasa al `Textarea` |
| **Listo** | Botón activo. Texto de estado vacío |
| **Cargando** | Botón con `loading` y texto «Estructurando…». `Textarea` con `readOnly` y `aria-busy="true"` (no `disabled`, para que no cambie el color del texto ni se pierda la selección). Texto de estado: «Estructurando tu texto. Puede tardar unos segundos.» Aparece «Cancelar» a la derecha del botón. Un `<span class="sr-only" role="status">` anuncia lo mismo una sola vez |
| **Cancelado** | Se aborta la petición, el bloque vuelve a «Listo» sin mostrar error. El foco regresa al botón «Estructurar con IA» |
| **Error** | `InlineNotice` entre el aviso de privacidad y la fila de acción, según el apartado 7. El texto escrito se conserva siempre |
| **Éxito** | Se abre la vista previa (apartado 4). El `Textarea` conserva el texto por si la persona descarta y quiere reintentar |
| **Aplicado** | Aviso de éxito del apartado 5.3 |
| **IA no disponible** | Apartado 6 |
| **Foco** | Anillo `focus-visible:ring-2 ring-ring` en el `Textarea`, el botón y «Cancelar»; no se retira |
| **Durante el envío del acta** | El bloque se deshabilita junto con el resto del formulario (`submitting`) |

Mientras la petición está en curso, el botón «Crear acta» sigue activo por regla de la aplicación. Si la persona lo pulsa, se cancela la petición de IA antes de enviar el acta (el acta no depende de la IA).

### 3.5 Cuándo no se muestra el bloque

- Acta **cerrada** o **archivada** (solo admite duración): el bloque no se pinta.
- Persona de **solo lectura** (PR-1): ni siquiera abre este formulario.
- IA **apagada** (apartado 6): el bloque se oculta por completo.

## 4. Vista previa (segunda vista del diálogo)

Al recibir la propuesta, el diálogo cambia de vista: la cabecera, el cuerpo y el pie pasan a los de la vista previa. El formulario no se desmonta: su estado vive en `ReunionFormDialog` y se conserva. El ancho `size="md"` (560 px) no cambia para no mover el diálogo.

### 4.1 Cabecera

- `DialogTitle`: «Revisa lo que propone la IA».
- `DialogDescription`: «Nada se guarda todavía. Elige qué usar y edita lo que haga falta; después guardas el acta como siempre.»
- Chip «Generado con IA» junto al título: `inline-flex items-center gap-1 rounded-full border border-info-border bg-info-subtle px-2 py-0.5 text-xs font-medium text-info` con `Sparkles` `size-3` (`aria-hidden`).
- Al abrir la vista previa, el foco va al `DialogTitle` (con `tabIndex={-1}`), para que el lector de pantalla lo lea y la persona empiece desde arriba. Se anuncia en `role="status"` (sr-only): «Propuesta lista: 3 secciones del acta y 4 compromisos para revisar.»

### 4.2 Estructura del cuerpo (`DialogBody className="grid gap-5"`)

1. Aviso «Señal orientativa» (siempre).
2. Avisos de la IA (`warnings[]`), solo si hay.
3. Sección **Acta reestructurada**: tres bloques (Agenda, Decisiones y acuerdos, Observaciones).
4. Sección **Compromisos propuestos**.
5. Pie informativo: «Generado con {model}. Revisa siempre el resultado.» (`text-meta text-muted-foreground`).

### 4.3 Avisos

| Aviso | Componente |
|---|---|
| Señal orientativa | `InlineNotice` `tone="neutral"` `role="note"` con icono `Sparkles` (`icon={Sparkles}`), texto «Señal orientativa: nada se registra por sí solo. Revisa y confirma antes de usar el resultado.» Es un estado normal, no una advertencia |
| Avisos de la IA | `InlineNotice` `tone="warning"` `role="note"`, título «La IA tuvo dudas», con una `<ul class="list-disc pl-4">` con cada `warnings[]` en una línea. Ejemplos de lo que llega: fecha anterior a la reunión que se dejó vacía, responsable que no se reconoció, texto recortado |

### 4.4 Acta reestructurada

Tres bloques iguales, cada uno un `<fieldset class="grid gap-2 rounded-lg border border-border bg-card p-3">` con `<legend class="px-1 text-sm font-semibold text-foreground">` (Agenda, Decisiones y acuerdos, Observaciones).

Dentro, de arriba abajo:

1. `Textarea` editable con la propuesta (`min-h-24 resize-y`). Nombre accesible: `aria-label="Agenda propuesta"` (y los equivalentes). No se repite la leyenda como label visible: la leyenda ya la nombra.
2. Fila de control: `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`.
   - A la izquierda, `Checkbox` con label «Usar en el acta» (`text-sm font-medium`, fila `flex min-h-10 items-center gap-2 pointer-coarse:min-h-11`). Marcado por defecto cuando la propuesta tiene texto.
   - A la derecha, **solo si el campo del formulario ya tiene texto**: `Select` de ancho `sm:w-60` con `aria-label="Qué hacer con lo que ya escribiste en Agenda"` y dos opciones: «Agregar al final» (valor por defecto) y «Reemplazar lo que escribí». El texto de ayuda `text-meta text-muted-foreground` justo debajo del select: «Ya escribiste en este campo.» Reemplazar no es el valor por defecto porque pierde texto de la persona.
3. **Propuesta vacía** (la IA no encontró nada para ese campo): el `Textarea` no se pinta; en su lugar `p.text-sm.text-muted-foreground` «La IA no encontró {agenda | decisiones | observaciones} en el texto.» y el `Checkbox` queda deshabilitado y desmarcado (`disabled`, con el motivo ya escrito a su lado).

Si el campo se desmarca, el `Textarea` sigue editable (se puede recuperar la idea), pero no se aplica.

### 4.5 Compromisos propuestos

Encabezado de sección: `h3` «Compromisos propuestos (N)» `text-sm font-semibold`, y a la derecha `<span aria-live="polite" class="text-meta text-muted-foreground">2 de 5 aceptados</span>`.

Ayuda bajo el encabezado (`text-meta text-muted-foreground`): «Acepta cada compromiso por separado. Los que no aceptes se descartan. Al guardar el acta se crean y cada persona recibe su aviso.»

**Se aceptan uno a uno.** Todas las tarjetas nacen **sin aceptar**. No hay «Aceptar todos» (mismo criterio que PR-1 con «Seleccionar a todos»: una aceptación masiva por descuido crea tareas a personas reales con fecha límite).

Lista: `<ul class="grid gap-3">`; cada elemento es `<li>` con un `<fieldset>` y `<legend class="sr-only">Compromiso 2 de 5</legend>`.

#### Tarjeta de compromiso

| Elemento | Clases |
|---|---|
| Tarjeta no aceptada | `grid gap-3 rounded-lg border border-border bg-card p-3` |
| Tarjeta aceptada | `grid gap-3 rounded-lg border border-primary bg-primary-subtle/40 p-3` (el estado también lo dan la casilla marcada y el contador; el color es refuerzo) |
| Fila de aceptación | `flex items-center justify-between gap-2`. Izquierda: `Checkbox` con label «Aceptar este compromiso» (`text-sm font-medium`, `min-h-10 pointer-coarse:min-h-11`). Derecha: «2 de 5» (`text-meta text-muted-foreground`) |
| Título | `Field` `label="Título"`, `Input` editable, obligatorio si se acepta. `maxLength` lo fija la API; la web no lo duplica: se recorta el sobrante en el servidor |
| Cuadrícula responsable y fecha | `grid gap-3 sm:grid-cols-2` |
| Responsable | `Field` `label="Responsable"` con `Select`: «Sin responsable» y las personas del proceso (las mismas de `listProcessPeople`, ya cargadas para el formulario). Preseleccionado cuando la IA devolvió `assignedUserId` |
| Fecha límite | `Field` `label="Fecha límite"` con `Input type="date"`, obligatorio si se acepta. Preseleccionada cuando la IA devolvió `dueDate` |
| Resultado esperado | Solo si la IA lo devolvió: `Field` `label="Resultado esperado (opcional)"` con `Textarea` `min-h-16` |
| Frase del texto | `<details>`; `<summary class="cursor-pointer text-meta font-medium text-link underline-offset-4 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">` «Ver la frase de tus notas»; contenido: `<blockquote class="mt-2 border-l-2 border-border-strong pl-3 text-meta italic text-muted-foreground">` con `sourceQuote` |
| Ayudas de la IA | `p.text-meta.text-muted-foreground` bajo la cuadrícula, ver abajo |

Nombres accesibles: el `Select` y el `Input` usan su `label` visible. La casilla «Aceptar este compromiso» queda dentro de un `fieldset` cuyo `legend` sr-only da el contexto («Compromiso 2 de 5»), así cada casilla se distingue sin repetir el título en el nombre accesible.

#### Mensajes por tarjeta

| Situación | Tratamiento |
|---|---|
| La IA entendió un nombre pero no lo reconoció (`assigneeText` con `assignedUserId` nulo) | Responsable en «Sin responsable» y bajo la cuadrícula: «En tus notas aparece “{assigneeText}”, pero no coincide con nadie del proceso. Elige a quién asignarlo.» |
| Sin responsable y la tarjeta está aceptada | Chip de advertencia (apartado 9) «Sin responsable» y ayuda: «Sin responsable, el compromiso no aparecerá en Mi trabajo de nadie.» No bloquea: la API acepta compromisos sin responsable |
| La IA no encontró fecha (`dueDate` nulo) | Campo vacío. Si la tarjeta está aceptada y la fecha falta, el error aparece junto al campo al pulsar **Usar en el acta**: «Elige la fecha límite del compromiso.» |
| Título vacío en una tarjeta aceptada | Error junto al campo: «El título es obligatorio.» |
| Validación fallida al pulsar **Usar en el acta** | Todos los errores a la vez, foco en el primer campo con error en orden del DOM (patrón del formulario actual). Un `InlineNotice` `tone="danger"` `role="alert"` al inicio de la sección de compromisos: «Revisa los compromisos aceptados: faltan datos obligatorios.» |

Las tarjetas **no aceptadas** no se validan.

#### Sin compromisos propuestos

Si `commitments` viene vacío: en lugar de la lista, `p.text-sm.text-muted-foreground` «La IA no encontró compromisos en el texto. Puedes agregarlos después desde el acta.» El resto de la vista previa funciona igual.

### 4.6 Pie de la vista previa

`DialogFooter` (el estándar: en móvil apilado con el botón principal arriba por `flex-col-reverse`; desde `sm` en fila a la derecha). A la izquierda, un resumen `text-meta text-muted-foreground` en `aria-live="polite"`: «Se usarán 2 secciones y 1 compromiso.» (el pie lo dice, no solo los contadores de arriba).

| Botón | Variante | Acción |
|---|---|---|
| «Descartar propuesta» | `variant="outline"` | Cierra la vista previa y vuelve al formulario sin aplicar nada. El texto de las notas se conserva. El foco vuelve al botón «Estructurar con IA» |
| «Usar en el acta» | `variant="default"` | Valida (apartado 4.5), rellena los campos marcados y deja los compromisos aceptados pendientes. Vuelve al formulario |

El botón principal queda **deshabilitado por regla (`unavailable`)** cuando no hay nada para usar (ninguna sección marcada y ningún compromiso aceptado), con el texto de estado del pie: «Marca al menos una sección o un compromiso para continuar.»

**Escape** en la vista previa vuelve al formulario (equivale a «Descartar propuesta») y **no** cierra el diálogo; el diálogo se intercepta con `onEscapeKeyDown` solo mientras esta vista esté abierta. Motivo: un Escape inadvertido no debe perder el formulario completo. Clic fuera del diálogo: no cierra mientras la vista previa esté abierta. Si la persona edita algo en la propuesta y pulsa «Descartar propuesta», se pide confirmación solo si cambió algún texto de la propuesta (`ConfirmDialog` existente: «¿Descartar tus cambios en la propuesta?», acciones «Seguir revisando» y «Descartar»). Sin ediciones, descarta directo.

### 4.7 Estados de la vista previa

| Estado | Tratamiento |
|---|---|
| Cargando | No existe: la petición se hace desde el formulario (apartado 3.4). La vista previa solo se abre con datos |
| Propuesta vacía por completo (sin secciones y sin compromisos) | `EmptyState` compacto en el cuerpo: icono `Sparkles` en círculo `primary-subtle`, título «La IA no encontró nada que ordenar», texto «Prueba con un texto más completo o escribe el acta a mano.», botón `variant="outline"` «Volver a mis notas». El pie solo lleva ese mismo botón; no hay «Usar en el acta» |
| Con datos | Apartados 4.3 a 4.6 |
| Error de validación | Apartado 4.5 |
| Éxito | Se aplica y se cierra la vista previa (apartado 5) |
| Deshabilitado | Casilla de una sección vacía; «Usar en el acta» cuando no hay nada seleccionado |
| Foco | Anillo `ring-ring` en cada control; orden en el apartado 10 |

## 5. Al volver al formulario

### 5.1 Campos rellenados

- Cada sección marcada pasa a su campo (Agenda, Decisiones y acuerdos, Observaciones) según la elección de «Agregar al final» o «Reemplazar». «Agregar al final» añade una línea en blanco y el texto propuesto.
- El **título, la fecha, el proceso y las personas del acta no se modifican nunca** desde la IA.
- El foco va al primer campo rellenado (su `Textarea`). Un `<span class="sr-only" role="status">` anuncia: «Se llenaron Agenda y Decisiones y acuerdos. Revisa y edita antes de guardar.»

### 5.2 Compromisos pendientes de crear

Los compromisos aceptados se guardan **en el estado del formulario**, no en la API. Se crean después de guardar el acta (el compromiso necesita el acta de origen). Se muestran en un bloque nuevo al final del formulario, antes del error general:

- `<section aria-labelledby="reu-pend-title">` con `h3` «Compromisos que se crearán al guardar (2)» (`text-sm font-semibold`).
- Ayuda: «Primero se guarda el acta y luego se crean estos compromisos. Cada persona recibe su aviso.» (`text-meta text-muted-foreground`).
- Lista `<ul class="grid gap-2">`. Cada fila: `flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3`.
  - Texto: título (`text-sm font-medium text-foreground`, `min-w-0 break-words`), debajo una línea `text-meta text-muted-foreground`: «Responsable: Marta Ruiz · Vence 22 may 2026» (formato de fecha con el formateador que ya usa la web; «Sin responsable» si no hay). Chip «Propuesto por IA» (apartado 9).
  - Acciones: botón `variant="ghost" size="sm"` «Quitar» con icono `X` `size-3.5` y `aria-label="Quitar el compromiso: {título}"`; con puntero táctil `pointer-coarse:min-h-11`.
  - Un segundo botón `variant="outline" size="sm"` «Editar» abre de nuevo la vista previa **solo si** la propuesta sigue en memoria (no se perdió al cerrar el diálogo). Si no hay propuesta en memoria, no se muestra. Esta entrega puede omitirlo: «Quitar» basta.
- Al quitar el último: el bloque desaparece y el foco va al botón «Estructurar con IA». Si quedan más, el foco va al «Quitar» de la siguiente fila (o de la anterior si era la última).
- El texto del botón principal del pie del formulario refleja el efecto: «Crear acta y 2 compromisos» / «Guardar cambios y crear 2 compromisos». Sin pendientes, los textos de hoy.

### 5.3 Aviso de éxito en el bloque de IA

`InlineNotice` `tone="success"` `role="status"` dentro del bloque, bajo el campo: «Se aplicó la propuesta: Agenda, Decisiones y acuerdos y 2 compromisos pendientes. Revisa todo antes de guardar.» Desaparece al cambiar el texto de las notas o al volver a estructurar.

### 5.4 Resultado al guardar

El padre (`actas-panel`) usa los mensajes de hoy. Con compromisos pendientes:

| Resultado | Mensaje (toast existente) |
|---|---|
| Acta y todos los compromisos creados | «Acta creada con 2 compromisos. Se avisó a las personas asignadas.» |
| Acta creada, algún compromiso falló | Toast de tono advertencia: «Acta creada. 1 de 2 compromisos no se pudo crear: “{título}”. Agrégalo desde el acta.» El diálogo se cierra (el acta ya existe); el detalle del acta queda abierto para agregarlo |
| El acta no se guardó | `FormError` como hoy. **Los compromisos pendientes y los textos se conservan** (AC-031) |

## 6. Disponibilidad de la IA

El estado lo decide la API, no la web. Hay tres estados de interfaz.

| Estado | Cuándo | Qué se ve |
|---|---|---|
| **Disponible** (`available`) | IA global y agente `ACTAS` encendidos, con presupuesto | Bloque completo, apartado 3 |
| **Apagada** (`off`) | IA global apagada, o el agente `ACTAS` apagado, o la persona no tiene permiso para usarla | **Oculto:** el bloque no se pinta y no deja hueco. La persona no puede cambiarlo y un bloque inactivo permanente sería ruido; el formulario queda como el de hoy |
| **No disponible por ahora** (`unavailable`) | Presupuesto mensual agotado o fallo sostenido | **Deshabilitado con motivo:** bloque visible, `Textarea` activo, botón con `unavailable` (`aria-disabled="true"`, enfocable) y el texto del motivo a la vista: «La ayuda de IA no está disponible por ahora. Puedes escribir el acta a mano.» (`InlineNotice` `tone="warning"` `role="note"`, sin botón). Si la API trae un motivo, se muestra el suyo |

Modo **sin endpoint de disponibilidad** (decisión 6 a, primera entrega):

- El bloque se muestra y funciona como «Disponible».
- Al recibir un **409** el bloque pasa a «No disponible por ahora» durante el resto de la sesión del diálogo, con el mensaje del apartado 7. El texto de las notas se conserva.
- En ese modo la IA «apagada» solo se descubre al pulsar el botón. Es una limitación conocida: un botón visible que falla con 409 para quienes no usan IA. Por eso la recomendación del informe es pasar a b) en cuanto se necesite en otro lugar.

Modo **con endpoint** (decisión 6 b):

- Mientras responde la disponibilidad: no se pinta el bloque (no hay hueco: el bloque aparece al llegar el dato, un desplazamiento único y previsible del contenido que está debajo; si la respuesta tarda más de 400 ms, un esqueleto `h-24 rounded-xl bg-muted animate-pulse motion-reduce:animate-none` con `aria-hidden` y un texto sr-only «Comprobando la ayuda de IA»).
- Si el endpoint falla: se trata como «Apagada» (oculto). El acta se puede escribir sin IA y no se alarma a la persona.

El estado de disponibilidad nunca se transmite solo por opacidad ni por color: lleva texto.

## 7. Errores por estado HTTP

Se muestran en el bloque del formulario (nunca en la vista previa, que solo existe con éxito). `InlineNotice` entre el aviso de privacidad y la fila de acción, `role="alert"` para los que ocurren por un evento. El mensaje explica qué ocurrió, qué hacer y cómo continuar. Se usa el `message` del cuerpo cuando viene (la API lo escribe en español y apto para mostrar, igual que el triage); si no, el de esta tabla.

| Estado | Tono | Título | Texto por omisión | Acción |
|---|---|---|---|---|
| Sin respuesta (red, CORS, sin conexión) | `warning` | «No pudimos comunicarnos con el servidor» | «Revisa tu conexión e inténtalo de nuevo. Tu texto sigue aquí.» | «Reintentar» |
| **400** | `warning` | «No pudimos enviar el texto» | «Revisa que las notas tengan contenido y no sean demasiado largas. Si el texto es muy extenso, divídelo por partes.» | Ninguna: la persona edita el texto |
| **401** | `warning` | «Tu sesión terminó» | «Vuelve a iniciar sesión. Tu texto de las notas no se guarda en el servidor: cópialo antes de salir.» | Lo resuelve el manejo global de sesión del portal; esta pantalla no añade redirección propia |
| **403** | `warning` | «No puedes usar la IA aquí» | «No tienes permiso para usar la IA en esta reunión. Puedes escribir el acta a mano.» | Ninguna. El bloque pasa a «No disponible» para esta sesión |
| **404** | `warning` | «El proceso ya no está disponible» | «El proceso elegido no existe o ya no tienes acceso. Elige otro proceso.» | Foco en el selector de proceso (al crear) |
| **409** | `warning` | «La ayuda de IA no está disponible ahora» | «Puede estar apagada o haber agotado su presupuesto mensual. Puedes seguir escribiendo el acta a mano. Si la necesitas, avisa a quien administra el portal.» | Ninguna. El bloque pasa a «No disponible por ahora» (apartado 6) |
| **413** | `warning` | «El texto es demasiado largo» | «Resume lo esencial o divide las notas en partes y estructura cada una.» | Ninguna |
| **422** | `warning` | «La IA no devolvió algo que se pueda usar» | «Inténtalo de nuevo. Si se repite, escribe el acta a mano.» | «Reintentar» |
| **429** | `warning` | «Hay muchas solicitudes de IA» | «Espera un minuto e inténtalo de nuevo.» | «Reintentar» |
| **500** | `danger` | «Algo falló de nuestro lado» | «Inténtalo de nuevo en unos minutos. Si se repite, avisa a quien administra el portal. Puedes escribir el acta a mano.» | «Reintentar» |
| **503** | `warning` | «La IA no respondió a tiempo» | «Inténtalo de nuevo en unos minutos. Tu texto sigue aquí.» | «Reintentar» |
| Otros | `danger` | «No se pudo estructurar el texto» | «Ocurrió un error inesperado. Inténtalo de nuevo.» | «Reintentar» |

Reglas:

- El tono `danger` se reserva para el fallo del servidor (500 y otros). Un 409, 503 o 422 no es culpa de la persona ni del sistema de forma grave: es `warning`.
- El botón «Reintentar» es un `Button variant="outline" size="sm"` dentro de `action` del `InlineNotice`; vuelve a lanzar la misma petición con el texto actual.
- Nunca se muestran códigos HTTP ni trazas.
- El error no mueve el foco (el `role="alert"` lo anuncia); «Reintentar» es alcanzable con Tab, justo antes del botón principal.
- Si la persona edita el texto o cambia el proceso, el error se retira.
- Un error de validación al **crear los compromisos** tras guardar el acta no entra aquí: lo cubre el apartado 5.4.

## 8. Estados consolidados

| Estado | Formulario (bloque) | Vista previa |
|---|---|---|
| Loading | Botón «Estructurando…» con spinner (`motion-reduce:animate-none` ya en `Button`), «Cancelar», `Textarea` de solo lectura | No aplica |
| Vacío | Texto vacío: error de campo. Sin proceso: botón `unavailable` con motivo | Sin nada que ordenar: `EmptyState`. Sin compromisos: texto de apoyo |
| Error | `InlineNotice` por estado HTTP (apartado 7) | Validación de compromisos aceptados |
| Éxito | Aviso verde de «Se aplicó la propuesta» | Se cierra y se vuelve al formulario |
| Deshabilitado | `unavailable` (IA no disponible, sin proceso). Bloque oculto (IA apagada) | Casilla de sección vacía; «Usar en el acta» sin selección |
| Foco | `ring-ring` en todos los controles | Foco inicial en el título; anillo en todos los controles |

## 9. Badges semánticos usados

Los estados y prioridades siguen yendo con `StatusBadge` / `PriorityBadge` donde existan. Estos son chips informativos locales de esta vista; se pintan con las clases de `InlineNotice` y no crean colores nuevos.

| Dónde | Texto | Tokens | Icono |
|---|---|---|---|
| Cabecera de la vista previa y filas de pendientes | «Generado con IA» / «Propuesto por IA» | `border-info-border bg-info-subtle text-info` | `Sparkles` |
| Tarjeta de compromiso sin responsable (aceptada) | «Sin responsable» | `border-warning-border bg-warning-subtle text-warning` | `TriangleAlert` |
| Tarjeta de compromiso sin fecha (aceptada) | «Sin fecha» | `border-warning-border bg-warning-subtle text-warning` | `TriangleAlert` |

Forma común: `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium` más los tres tokens de la fila. Todos llevan texto y, salvo cuando el espacio lo impide, icono. El significado nunca depende solo del color.

## 10. Accesibilidad

### 10.1 Contrastes calculados (ver supuesto 4)

| Par | Claro | Oscuro |
|---|---|---|
| `text-foreground` / `bg-card` | ≈ 14,6:1 | ≈ 15:1 |
| `text-foreground` / `bg-muted/40` (fondo del bloque de IA) | ≈ 13,5:1 | ≈ 14:1 |
| `text-foreground` / `bg-primary-subtle/40` (tarjeta aceptada) | ≈ 13,9:1 | ≈ 12:1 |
| `text-muted-foreground` / `bg-card` (ayudas, estado, cita) | ≈ 7,1:1 | ≈ 7,4:1 |
| `text-muted-foreground` / `bg-muted/40` (subtítulo y estado del bloque) | ≈ 6,5:1 | ≈ 7,3:1 |
| `text-muted-foreground` / `bg-primary-subtle/40` (ayuda en tarjeta aceptada) | ≈ 6,8:1 | ≈ 7,0:1 |
| `text-link` / `bg-card` («Ver la frase de tus notas», icono) | ≈ 6,5:1 | ≈ 7,5:1 |
| `text-link` / `bg-muted/40` (icono `Sparkles` del bloque) | ≈ 6,0:1 | ≈ 6,7:1 |
| `text-info` / `bg-info-subtle` (chip «Generado con IA») | ≈ 6,0:1 | ≈ 8:1 |
| `text-warning` / `bg-warning-subtle` (chips «Sin responsable», «Sin fecha») | ≈ 6,3:1 | ≈ 9:1 |
| `text-foreground` / `bg-warning-subtle`, `bg-info-subtle`, `bg-neutral-subtle`, `bg-success-subtle`, `bg-danger-subtle` (texto de los avisos) | ≥ 12:1 | ≥ 12:1 |
| `text-primary-foreground` / `bg-primary` («Usar en el acta») | 4,84:1 (valor de marca) | 4,84:1 |
| Borde de control (`border-input`) / `bg-card` y `bg-muted/40` | ≥ 3:1 (token ya medido en `globals.css`) | ≥ 3:1 |

El par más ajustado es `text-primary-foreground` sobre `bg-primary` (4,84:1, cumple 4,5:1 por poco; es el botón estándar del portal). En los textos de 12 px de los chips conviene vigilar que el contraste real no baje de 4,5:1 por el renderizado.

Los bordes `border-border`, `border-primary` y `border-info-border` de tarjetas y avisos son decorativos, no delimitan un control; los controles interiores (inputs, select, casillas) llevan `border-input` ≥ 3:1.

### 10.2 Estructura y roles

- El bloque de IA es una `<section aria-labelledby>` con su `h3`. La vista previa mantiene la jerarquía del diálogo: `DialogTitle` (h2 efectivo), secciones en `h3`.
- Cada sección de la propuesta del acta es un `<fieldset>` con `<legend>`; cada compromiso, un `<fieldset>` con `<legend class="sr-only">`.
- Casillas con `<label>` asociado; el `Select` de «Agregar al final / Reemplazar» tiene `aria-label` completo.
- `role="note"` para avisos permanentes (privacidad, señal orientativa), `role="status"` para el aviso de éxito y los anuncios, `role="alert"` para errores por evento. El texto «Estructurando…» se anuncia una sola vez.
- Contadores y resúmenes de selección en `aria-live="polite"`.
- Los iconos son `aria-hidden`. Nada se dice solo con color: aceptación (casilla y contador), advertencias (texto e icono), disponibilidad (texto).
- `<details>` nativo para la frase de origen: teclado y lector de pantalla funcionan sin código adicional.
- Objetivos táctiles: casillas y filas de control ≥ 40 px (44 px con puntero táctil); «Quitar» y botones pequeños ≥ 24 px (WCAG 2.5.8) y 44 px con puntero táctil.
- Movimiento: el único movimiento es el spinner del `Button` y el esqueleto de disponibilidad, ambos con `motion-reduce:animate-none`. No hay transición entre vistas más allá del cambio de contenido (sin animación decorativa; si el desarrollador añade un fundido, debe respetar `prefers-reduced-motion`).

### 10.3 Orden de tabulación y gestión del foco

Formulario: …Participantes → `Textarea` «Notas de la reunión» → («Reintentar» del error, si lo hay) → «Cancelar» (solo mientras carga) → «Estructurar con IA» → Agenda → Decisiones → Observaciones → «Quitar» de cada compromiso pendiente → Cancelar → Crear acta.

Vista previa: título (foco programático) → aviso → casilla «Usar en el acta» y `Textarea` de Agenda → ídem Decisiones y Observaciones → por cada compromiso: «Aceptar este compromiso», Título, Responsable, Fecha límite, Resultado esperado, «Ver la frase de tus notas» → «Descartar propuesta» → «Usar en el acta».

Foco al abrir la vista previa: `DialogTitle`. Al volver al formulario: primer campo rellenado (con «Usar en el acta») o botón «Estructurar con IA» (con «Descartar»). Cerrar el diálogo del acta devuelve el foco al botón que lo abrió (`useDialogReturnFocus`, comportamiento actual).

### 10.4 Validación pendiente que este diseño no cubre

Los ratios, tamaños y órdenes son comprobaciones de diseño. Falta una **prueba manual con lector de pantalla (NVDA y VoiceOver)** de: la apertura y cierre de la vista previa dentro del diálogo, los anuncios `aria-live` (carga, éxito, contadores), las tarjetas de compromiso con `fieldset`, y la navegación solo con teclado, incluido Escape que vuelve al formulario sin cerrar el diálogo. Se requiere también **revisión experta de accesibilidad**. Esto no sustituye una auditoría completa. La deuda ya declarada `label-content-name-mismatch` (WCAG 2.5.3) en Reuniones no se resuelve aquí; en esta spec se evita repetir en `aria-label` textos distintos de los visibles, salvo los de `Select` y `Textarea` de la propuesta, cuyo nombre visible es la leyenda del grupo.

## 11. Responsive

| Ancho | Bloque de IA | Vista previa |
|---|---|---|
| Móvil (< 640 px) | Diálogo a ancho completo como el resto del portal. Fila de acción apilada; botón principal `w-full` y arriba de «Cancelar» (`flex-col-reverse`). `Textarea` `min-h-28`. Aviso de privacidad ocupa todo el ancho | Una sola columna. Responsable y fecha apilados. Pie apilado con «Usar en el acta» arriba. Resumen de selección encima de los botones. Altura del cuerpo con desplazamiento propio (`DialogBody`), sin ensanchar el viewport |
| Tablet (640 a 1023 px) | Fila de acción en una línea (`sm:flex-row`) | Responsable y fecha en dos columnas (`sm:grid-cols-2`). Pie en fila |
| Escritorio (≥ 1024 px) | Igual que tablet; diálogo `md` (560 px) | Igual que tablet |

La página no debe ensanchar el viewport en 390 px (regla de BL-070/BL-080). Hay que comprobarlo con un título de compromiso de 300 caracteres, un nombre de persona de 60 caracteres y una frase de origen larga (`break-words` en todos).

Con el teclado en pantalla abierto en móvil, el botón «Estructurar con IA» debe seguir alcanzable por desplazamiento; no se fija en una barra inferior propia.

## 12. Textos clave (español, con tildes, UTF-8 sin BOM)

| Dónde | Texto |
|---|---|
| Título del bloque | Estructurar con IA |
| Botón | Estructurar con IA |
| Botón en curso | Estructurando… |
| Señal orientativa | Señal orientativa: nada se registra por sí solo. Revisa y confirma antes de usar el resultado. |
| Privacidad | El texto que escribas aquí, la fecha de la reunión y los nombres de las personas del proceso se envían al modelo de IA configurado por la organización. No se envían correos, identificadores ni el resto del acta. No pegues información que no deba salir de la organización. |
| Vista previa | Revisa lo que propone la IA |
| Pie de la propuesta | Descartar propuesta · Usar en el acta |
| Compromisos pendientes | Compromisos que se crearán al guardar |

Los errores por estado HTTP están en el apartado 7.

## 13. Qué revisar al implementar

1. Sin proceso elegido: el botón es `unavailable`, enfocable, con el motivo escrito al lado.
2. Texto vacío: error junto al campo, sin llamada a la API.
3. IA apagada: el bloque no aparece (modo con endpoint). Presupuesto agotado: bloque visible con botón `unavailable` y aviso.
4. 409, 422, 503: aviso con la acción correcta, texto de las notas intacto.
5. Vista previa: todas las tarjetas nacen sin aceptar; no existe «Aceptar todos».
6. Aceptar un compromiso sin fecha: error junto al campo y foco en él.
7. Escape en la vista previa vuelve al formulario y no cierra el diálogo; clic fuera tampoco cierra.
8. Campo con texto previo: el valor por defecto es «Agregar al final»; «Reemplazar» exige elegirlo.
9. Guardar un acta: el título, la fecha, el proceso y las personas no cambian por la IA; los compromisos se crean después de guardar, y si el acta falla, los pendientes se conservan.
10. Pruebas axe en claro y oscuro a 1440 y 390 px: formulario con el bloque, vista previa con propuesta completa y vista previa vacía (patrón de BL-080).
11. Contrastes de la sección 10.1 verificados con medición de píxeles, en ambos temas.

## 14. Fuera de esta entrega

- Plantillas de acta, asistentes externos y reuniones recurrentes (decisión 10 a del informe).
- Estructurar un acta ya guardada desde el detalle sin abrir el formulario de edición.
- Mostrar el contador de caracteres de la entrada: el tope lo gobierna la API (decisión 8) y la web no lo duplica. Si la API pasa a entregar `maxInputChars` en la disponibilidad, se añade un contador `text-meta` bajo el `Textarea` que aparece desde el 80 %.
- Una propuesta de asignación de múltiples responsables por compromiso.
