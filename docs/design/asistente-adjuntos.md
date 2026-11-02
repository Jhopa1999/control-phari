# Asistente de IA · Especificación visual de adjuntos (BL-032 F4a)

Solo especificación; sin código de la app. Extiende `asistente-chat-ui.md` (§3 composer, §2.1 mensaje del usuario) y `agente-ia-propuesta.md` §5.4 y §7. Cubre imágenes y documentos. **Audio: fuera de alcance**, solo un hueco previsto (§1). Marca: `25-marca-gibo.md` (solo tokens semánticos, `rounded-xl`, `shadow-card`).

## 0. Decisiones

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Visor/editor del texto extraído | **Diálogo modal** (`ui/dialog`), pantalla completa en `<640 px`. | El panel ya es un Sheet modal y 375 px no admite editar un texto largo en línea; el diálogo da foco atrapado, Escape y retorno de foco sin trabajo extra. |
| Envío con adjuntos en curso | `Enviar` deshabilitado con razón visible (`DisabledReason`), escribir sigue permitido. | Pedido funcional. |
| Principio D4 | Todo adjunto muestra «Esto entendí del adjunto:» antes de usarse. | `agente-ia-propuesta.md` §5.4. |
| Chip | Siempre `bg-card` (nunca transparente) con el estado en **icono + etiqueta de texto**, no solo color. | Contraste medido en §8 sobre `card`, `background` y `primary-subtle`. |
| Supuesto | La API entrega el límite de caracteres del texto y un indicador `truncated`. El tope de 5 / 10 MB también viene de la configuración, no se fija en el cliente. | Valores configurables en Admin. |

## 1. Anatomía del compositor

```
┌──────────────────────────────────────────────────────┐
│ ┌ zona de arrastre (borde discontinuo al arrastrar) ┐│
│ │ [📄 Informe.pdf · 2,1 MB · Listo   ✎ ✕]  [🖼 …]   ││ ← fila de chips (ul)
│ │ ┌────────────────────────────────────────────────┐││
│ │ │ Escribe tu pregunta…                           │││ ← textarea
│ │ └────────────────────────────────────────────────┘││
│ │ [📎] [🎙 hueco]                              [ ➤ ]││ ← barra de acciones
│ └───────────────────────────────────────────────────┘│
│ Hasta 5 archivos · 10 MB c/u            3 812 / 4 000│ ← ayuda + contador
│ ⚠ Enviar no disponible: se está leyendo 1 adjunto.   │ ← DisabledReason
└──────────────────────────────────────────────────────┘
```

- Contenedor del formulario existente (`composer.tsx`) con `relative`. La **zona de arrastre** es el propio recuadro del compositor: `rounded-xl border border-border-strong bg-card focus-within:ring-2 ring-ring`.
- **Barra de acciones** (`flex items-center gap-1`): botón clip a la izquierda, botón Enviar/Detener a la derecha (`ml-auto`). Se mueve el botón Enviar a esta barra solo cuando hay `onAttach`; sin adjuntos el layout actual (textarea + botón en fila) no cambia.
- **Botón clip**: `Button variant="ghost" size="icon"` `size-11 md:size-10`, icono `Paperclip`, `aria-label="Adjuntar archivos"`, `aria-describedby` = id de la ayuda de límites. Abre `<input type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.xlsx,.csv,.md,.txt">`. Con 5 adjuntos queda `aria-disabled` (enfocable) con el motivo en `DisabledReason`: «Ya adjuntaste 5 archivos. Quita uno para añadir otro.».
- **Hueco de audio**: espacio reservado a la derecha del clip (`<span class="contents">` vacío). No se pinta ni ocupa ancho hasta F4b; la barra se diseña con `gap-1` para recibir un segundo `size-11`.
- **Ayuda de límites** (`text-meta text-muted-foreground`, junto al contador): «Hasta 5 archivos · 10 MB cada uno». Detalle de tipos en el tooltip del clip: «Imágenes (PNG, JPEG, WebP, GIF) y documentos (PDF, Word, Excel, CSV, Markdown, TXT).» En móvil la ayuda va `sr-only` y el detalle completo está en el `aria-describedby`.
- **Zona de arrastre, estados**:
  - Reposo: sin cambios.
  - Arrastre sobre el compositor (`dragenter`): `border-dashed border-primary bg-primary-subtle`, capa interior `absolute inset-0 flex items-center justify-center gap-2 rounded-xl text-sm font-medium text-foreground` con `Upload` y «Suelta los archivos para adjuntarlos». La capa tiene `pointer-events-none`.
  - Arrastre no válido (no es archivo): sin cambios, no se muestra la capa.
  - Al soltar: se procesa cada archivo; los rechazados generan error de límite (§5) junto al compositor.
  - `motion-reduce`: sin transiciones de la capa.
- **Pegar imagen**: `onPaste` captura imágenes del portapapeles; se anuncia «Imagen pegada. Se está subiendo.» No intercepta texto.
- **Alternativa al arrastre**: el clip (teclado y táctil). El arrastre es un atajo, nunca la única vía.
- **Orden de tabulación**: textarea → clip → (hueco audio) → Enviar/Detener → **chips** (cada uno: botón principal, luego sus acciones) → enlaces de error. Los chips van antes del textarea en el DOM solo si se prefiere leerlos primero; se decide **después del botón Enviar** para no alargar el camino hacia escribir. Dentro de la fila, flechas izquierda/derecha no se usan (Tab simple, sin roving).

## 2. Chip de adjunto (en el compositor)

Contenedor de la fila: `<ul aria-label="Archivos adjuntos" class="flex flex-wrap gap-2 px-2 pt-2">`; cada `<li>` es un chip.

Base del chip: `inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-border-strong bg-card py-1 pl-2.5 pr-1 text-sm text-foreground md:min-h-9`. En móvil ocupa `w-full`.

Estructura (izq → der): icono de tipo (`size-4 text-muted-foreground`) · bloque `min-w-0` con **nombre** (`truncate max-w-[16ch] sm:max-w-[24ch] font-medium`, `title` y nombre completo accesible) y línea `text-meta text-muted-foreground tabular-nums`: «2,1 MB · {estado}» · acciones.

Iconos por tipo: imagen `Image` · PDF `FileText` · Word `FileText` · Excel/CSV `FileSpreadsheet` · MD/TXT `FileText`. Nombre accesible: «{nombre}, {tipo}, {tamaño}, {estado}».

| Estado | Icono de estado + etiqueta | Estilo adicional | Acciones (todas ≥ 44 px en móvil) |
| --- | --- | --- | --- |
| Subiendo | `LoaderCircle animate-spin motion-reduce:animate-none` · «Subiendo… 45 %» | Barra bajo el chip: `h-1 rounded-full bg-muted` con relleno `bg-primary` (`role="progressbar"` `aria-valuenow`, `aria-label="Subida de {nombre}"`). Sin dato de progreso: barra indeterminada → texto «Subiendo…». | `Quitar` (`X`, cancela la subida) |
| Extrayendo | `LoaderCircle` · «Leyendo contenido…» (tras 6 s añade «Puede tardar unos segundos.») | Fondo `bg-info-subtle`, texto de estado `text-info`. Barra indeterminada (`motion-reduce`: estática al 100 % con patrón rayado). | `Quitar` |
| Listo | `CircleCheck text-success` · «Listo» | Borde `border-border-strong`; fondo `bg-card`. | `Ver y editar texto` (`Eye`/`Pencil`, chip entero también abre), `Quitar` |
| Listo y editado | `CircleCheck` · «Listo · editado» | Igual. | Igual |
| Error | `CircleAlert text-danger` · motivo corto («No se pudo leer el archivo») | Fondo `bg-danger-subtle`, borde `border-danger-border`. Motivo completo en `InlineNotice` bajo la fila (§5). | `Reintentar` (`RotateCw`, solo si es recuperable), `Quitar` |

- Botones de acción: `Button variant="ghost" size="icon-sm"` con `pointer-coarse:size-11`; `aria-label` con el nombre del archivo: «Quitar Informe.pdf», «Reintentar Informe.pdf», «Ver y editar texto de Informe.pdf». Tooltips solo en puntero fino.
- El chip «Listo» es un botón (abre el diálogo §3); el nombre ocupa su área principal. El foco muestra `focus-visible:outline-2 outline-ring`.
- Al **quitar**: el chip se elimina, se anuncia «Se quitó {nombre}.» y el foco pasa al chip siguiente, o al anterior, o al clip.
- Errores no recuperables (tipo, tamaño) no crean chip: solo aviso (§5), para no ensuciar la fila.

## 3. Visor/editor del texto extraído (diálogo)

```
┌ Informe.pdf ────────────────────────────────────── ✕ ┐
│ Esto entendí del adjunto:                              │
│ ┌────────────────────────────────────────────────────┐ │
│ │ (textarea editable, font-mono text-sm, 12 líneas)  │ │
│ └────────────────────────────────────────────────────┘ │
│ 8 120 / 20 000 caracteres                              │
│ ⚠ Texto recortado: el archivo era más largo.           │
│ ℹ Este texto se enviará al asistente junto con tu      │
│   mensaje. Edítalo si algo no es correcto.             │
│                       [Descartar cambios] [Guardar]    │
└────────────────────────────────────────────────────────┘
```

- `Dialog` (`ui/dialog.tsx`) `DialogTitle` = nombre del archivo (truncado, completo en `title`). `max-sm:inset-0 max-sm:rounded-none sm:max-w-2xl`, `bg-card rounded-xl shadow-card`. Sobre el Sheet del panel se apila (z-index superior).
- Subtítulo `text-sm font-medium` «Esto entendí del adjunto:». Para imágenes, miniatura `max-h-32 rounded-lg` encima, con `alt="Vista previa de {nombre}"`.
- **Textarea** (`ui/textarea`) `min-h-48 max-h-[50dvh] font-mono text-base md:text-sm`, etiquetada por el subtítulo (`aria-labelledby`). `aria-describedby` = contador + avisos.
- **Contador**: `text-meta tabular-nums text-muted-foreground`; mismo patrón de umbrales de `counterState` (aviso al 90 %, error al superar con icono `CircleAlert text-danger` y texto «Supera el límite; acórtalo para guardar.»). Guardar `disabled` si supera el límite o queda vacío.
- **Aviso de truncado** (`InlineNotice tone="warning" role="status"`): «Texto recortado: el archivo era más largo de lo que puede leer el asistente. Solo se usará esta parte.»
- **Aviso de envío** (`InlineNotice tone="info"`): «Este texto se enviará al asistente junto con tu mensaje. Revisa que no incluya datos que no quieras compartir.»
- Pie `flex-col-reverse gap-2 sm:flex-row sm:justify-end`: `Descartar cambios` (`outline`, restaura el último guardado; si hay cambios sin guardar pide confirmación con `ConfirmDialog` «¿Descartar los cambios?») y `Guardar` (`default`). Escape / ✕ con cambios: mismo `ConfirmDialog`.
- Foco inicial: textarea. Al cerrar vuelve al chip que lo abrió. Tras guardar: `toast.success('Texto guardado.')` y el chip pasa a «Listo · editado».
- **Modo solo lectura** (mensaje enviado): mismo diálogo con textarea `readOnly` (`bg-muted/40`, enfocable, se puede seleccionar y copiar), sin Guardar/Descartar, un botón `Cerrar` y un `Copiar texto`. El aviso pasa a «Este fue el texto que se envió al asistente.». Sin aviso de envío.

## 4. Chips en mensajes enviados

- Bajo el texto del usuario, dentro del `article` («Tu mensaje»): `<ul aria-label="Archivos adjuntos del mensaje" class="mt-2 flex flex-wrap justify-end gap-1.5">`.
- Chip: `inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground md:min-h-8` con icono de tipo, nombre truncado (`max-w-[18ch]`), «· 2,1 MB» (`text-meta text-muted-foreground`) y `ChevronRight` discreto. Es un `button` con `aria-haspopup="dialog"` y nombre «Ver texto extraído de {nombre}, {tipo}, {tamaño}».
- Pulsar abre el diálogo en solo lectura (§3). Los chips se rehidratan al reabrir una conversación del historial; si el texto ya no está disponible: chip `aria-disabled` con «No disponible» y `DisabledReason` «El contenido de este archivo ya no está disponible.».
- Si hay >3 chips en móvil, apilar en columna (`flex-col items-stretch`).

## 5. Textos en español

| Caso | Dónde | Título | Cuerpo |
| --- | --- | --- | --- |
| Tipo no permitido | `InlineNotice tone="danger" role="alert"` bajo la fila | «No se puede adjuntar {nombre}» | «Este tipo de archivo no está permitido. Usa imágenes (PNG, JPEG, WebP, GIF) o documentos (PDF, Word, Excel, CSV, Markdown, TXT).» |
| Más de 5 adjuntos | ídem, `tone="warning"` | «Máximo 5 archivos por mensaje» | «Solo se adjuntaron los primeros {n}. Quita alguno para añadir más.» |
| Más de 10 MB | ídem, `danger` | «{nombre} es demasiado grande» | «Pesa {tamaño} y el máximo es 10 MB. Reduce el archivo o divídelo.» |
| Fallo de extracción | Chip en error + notice | «No pudimos leer {nombre}» | «Ocurrió un problema al procesarlo. Inténtalo de nuevo o quítalo y adjunta otro.» (`Reintentar`) |
| Adjunto vacío o ilegible | chip en error | «{nombre} no tiene contenido legible» | «El archivo está vacío o no se pudo leer (por ejemplo, está protegido con contraseña). Quítalo o adjunta otra versión.» (sin Reintentar) |
| Presupuesto agotado | `InlineNotice tone="warning"`, clip deshabilitado | «No se pueden leer más archivos» | «Se alcanzó el presupuesto mensual del asistente. Vuelve a intentarlo cuando se renueve.» |
| Subida fallida de red | chip en error | «No se pudo subir {nombre}» | «Revisa tu conexión e inténtalo de nuevo.» (`Reintentar`) |
| Razón del Enviar | `DisabledReason` | — | «Espera a que termine de leerse {n} adjunto(s) para enviar.» / «Hay un adjunto con error. Quítalo o reinténtalo.» |

Los avisos de límite se apilan en un único `InlineNotice` agrupado cuando se sueltan varios archivos inválidos a la vez («No se adjuntaron 3 archivos» con lista `ul`). Se descartan con `X` y se limpian solos al añadir un adjunto válido.

## 6. Accesibilidad

- **Región viva** `role="status" aria-live="polite" aria-atomic="true"` (reutiliza `assistant-live-region.tsx`) para transiciones: «Subiendo {nombre}.», «Leyendo {nombre}.», «{nombre} está listo.», «No se pudo leer {nombre}.», «Se quitó {nombre}.». Hitos, **no** porcentajes; la barra tiene `role="progressbar"` sin anuncio continuo. Los errores de límite usan `role="alert"`.
- Varios archivos a la vez: un anuncio resumen («Subiendo 3 archivos.») y luego uno por cambio de estado final, no por cada paso.
- Estado nunca solo por color: icono distinto (`Loader`, `CircleCheck`, `CircleAlert`) + etiqueta textual en cada chip. Barra de progreso con valor numérico en texto.
- Teclado completo: clip (Enter/Espacio) abre el selector; chip abre diálogo con Enter/Espacio; Supr o Retroceso sobre un chip enfocado no quitan (evita borrados accidentales); solo el botón `Quitar`. Diálogo: foco atrapado, Escape, retorno de foco.
- `aria-busy="true"` en el formulario mientras haya adjuntos en curso; el botón Enviar `aria-disabled` (enfocable) con razón vinculada por `aria-describedby`.
- Zona de arrastre: la capa visual es `aria-hidden`; el drop no cambia el foco. Objetivos ≥ 44 px (`pointer-coarse`), foco `outline-ring`, `prefers-reduced-motion` respetado.

## 7. Responsive

| | 375 px (panel/página, móvil) | 1280 px (panel 480 px / página) |
| --- | --- | --- |
| Chips | Apilados `w-full`, una por línea, nombre `max-w-[16ch]`; acciones 44×44. | En fila con wrap; nombre `max-w-[24ch]`; acciones `icon-sm` (32 px). |
| Barra de acciones | Clip + Enviar `size-11`; ayuda de límites `sr-only`, tipos en tooltip/diálogo de ayuda. | Ayuda visible junto al contador. |
| Arrastre | No aplica (sin puntero); solo clip y pegar. | Capa de arrastre sobre el compositor. |
| Visor | Pantalla completa, textarea `max-h-[40dvh]`, pie con botones a ancho completo apilados. | Diálogo `max-w-2xl` centrado. |
| Altura | Con teclado virtual, la fila de chips hace scroll (`max-h-28 overflow-y-auto`), el textarea no se aprieta bajo 1 línea. | Fila `max-h-32 overflow-y-auto`. |
| Página `/asistente` | Chips en compositor al ancho de la conversación (`max-w-3xl`). | ídem; en el panel estrecho (440–480 px) idéntico a móvil >640 px. |

## 8. Contraste medido (WCAG 2.2 AA)

Calculado desde los tokens de `globals.css` (OKLCH → sRGB, luminancia relativa). Mínimo 4,5:1 texto, 3:1 iconos y bordes.

| Par | Claro | Oscuro |
| --- | --- | --- |
| Texto «Extrayendo» `info` / `info-subtle` | 6,06 | 7,31 |
| Texto «Listo» `success` / `success-subtle` | 6,07 | 8,36 |
| Texto de aviso `warning` / `warning-subtle` | 6,10 | 8,62 |
| Texto «Error» `danger` / `danger-subtle` | 5,83 | 6,56 |
| Icono de estado `info` / `card` | 6,91 | 8,17 |
| Icono `success` / `card` | 6,74 | 9,19 |
| Icono `warning` / `card` | 6,76 | 9,57 |
| Icono `danger` / `card` | 6,59 | 7,20 |
| `foreground` / `*-subtle` (nombre del archivo en chip de error/extrayendo) | 12,94–13,32 | 13,40–13,64 |
| `muted-foreground` / `card` (tamaño, ayuda) | 7,13 | 7,62 |
| `muted-foreground` / `background` | 6,58 | 8,47 |
| `muted-foreground` / `primary-subtle` (burbuja del usuario) | 6,15 | 6,21 |
| `foreground` / `primary-subtle` | 12,71 | 12,20 |
| `border-strong` / `card` (borde del chip en compositor) | 3,64 | 3,51 |
| `border-strong` / `background` | 3,36 | 3,90 |
| `border-strong` / `primary-subtle` | 3,14 | **2,86** |

Todo cumple salvo `border-strong` sobre `primary-subtle` en oscuro (2,86): por eso los chips de mensajes enviados usan `border-border` (decorativo; el chip se identifica por texto e icono) y no dependen del borde para distinguirse. En ningún caso se usa `text-primary` como texto.

## 9. Componentes: reutilizar vs. crear

Reutilizar (todas en `apps/web/src/components/`):
- `ui/button.tsx`, `ui/textarea.tsx`, `ui/dialog.tsx`, `ui/tooltip.tsx`, `ui/skeleton.tsx`, `confirm-dialog.tsx`, `inline-notice.tsx`, `disabled-reason.tsx`, `ui/sonner.tsx` (toast).
- `assistant/composer.tsx` (se extiende: barra de acciones, drop, paste, fila de chips), `assistant/chat-messages.tsx` (`UserMessage` recibe `attachments`), `assistant/assistant-live-region.tsx` (anuncios), `assistant/assistant-provider.tsx` (estado de adjuntos y borrador).

Crear:
- `assistant/attachment-button.tsx`: clip + input de archivo + ayuda de límites.
- `assistant/attachment-chip.tsx`: chip del compositor con todos los estados y acciones.
- `assistant/attachment-list.tsx`: `ul` de chips (compositor).
- `assistant/attachment-text-dialog.tsx`: visor/editor y modo solo lectura (`mode="edit" | "readonly"`).
- `assistant/message-attachments.tsx`: chips de solo lectura en mensajes enviados.
- `assistant/use-attachment-dropzone.ts`: hook de drag/drop/paste (sin lógica de negocio; la validación real vive en la API, el cliente solo valida tipo y tamaño para dar respuesta inmediata).
- `assistant/attachment-format.ts`: tamaño (es-CO), etiquetas de tipo y mensajes de §5.

Puntos abiertos para el desarrollador: confirmar con la API el campo `truncated`, el límite de caracteres del texto extraído y si el progreso de subida es medible (`XMLHttpRequest`/`fetch` stream); si no, usar barra indeterminada.

## 10. Implementación (desviaciones respecto a la especificación)

- **Límites por tipo, no 10 MB.** Bedrock admite imágenes de hasta 3,75 MB y documentos de hasta 4,5 MB; los CSV, Markdown y TXT se leen en el backend (hasta 1 MB). La API publica los límites en `GET /assistant/status` (`attachments`) y el cliente solo tiene valores de respaldo (`FALLBACK_LIMITS`, comprobados contra las constantes de la API en `e2e/asistente-adjuntos.spec.ts`).
- **Clip en la misma fila del campo.** El clip va a la izquierda del campo y Enviar a la derecha (en vez de una barra de acciones bajo el campo), para no cambiar la anatomía actual del compositor. El hueco del audio (F4b) queda a la derecha del clip.
- **Errores que no son de red.** Un adjunto rechazado por el servidor (contenido ilegible, modelo sin capacidad) se muestra como chip en error sin «Reintentar»; los límites de tipo y tamaño se validan antes de subir y se muestran como aviso, sin chip.
- **Reintento de un envío fallido.** Si el envío falla antes de abrir la respuesta, los adjuntos siguen sin enviarse en el servidor y «Reintentar» los reutiliza.
- **Progreso.** Se mide con `XMLHttpRequest`; al terminar la subida el chip pasa a «Leyendo contenido…» (barra indeterminada).
