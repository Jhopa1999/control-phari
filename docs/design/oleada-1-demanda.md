# Oleada 1 · Demanda: especificación visual

Alcance: tres cambios de Aprobaciones, Triage y Priorización (plan de mejora 2.3, 2.4 y 2.5). Todo se construye con componentes existentes. Solo tokens semánticos; no se añaden colores ni dependencias. Los pares de color usados ya están en uso y medidos en `globals.css` (ver «Accesibilidad»).

## Reutilización

| Necesidad | Componente existente | Cambio mínimo |
| --- | --- | --- |
| Confirmar Aprobar | `ConfirmDialog` (`components/confirm-dialog.tsx`, `alertdialog`, `size="sm"`, foco inicial en Cancelar) | Añadir prop opcional `children` (resumen) que se pinta entre `DialogHeader` y `DialogFooter`. `DialogDescription` es un `<p>`: no se mete ahí una lista de datos. Compatible con los usos actuales. |
| Botones de Aprobar y Devolver | `RowActions` | Añadir `variant?: 'ghost' \| 'default' \| 'outline'` a `RowAction` (hoy solo ghost). Solo lo usa Aprobaciones. |
| Motivo en Triage | `Field` + `Textarea` + `RequiredHint` + `InlineNotice` + `FormError` | Ninguno. |
| Criterios de Priorización | `SegmentedRadio` + `Field`/`FormError` | Ninguno (ya acepta `describedBy`, `optionClassName`, `className`). |

---

## 1. Aprobaciones: botones con forma y confirmación al Aprobar

**Objetivo.** El jefe de área decide con seguridad. Aprobar deja de parecer un enlace y no se ejecuta con un solo clic.

### 1.1 Botones de fila (escritorio, 1440)

- Aprobar: `variant="default"` (`bg-primary text-primary-foreground`, 4.84:1), `size="sm"`, icono `Check` `aria-hidden`.
- Devolver: `variant="outline"`, `size="sm"`.
- Orden: Devolver a la izquierda, Aprobar a la derecha (acción principal al borde, donde termina la vista). `gap-1` del contenedor `RowActions`.
- Se conservan `busy`/`busyLabel` y la densidad compacta (`COMPACT_TEXT`, 28 px). La celda sigue sin relleno vertical.
- Solo lectura (líder): texto «Solo lectura» sin cambios.

### 1.2 Móvil (390)

La tabla cambia a tarjetas (patrón `docs/design/tarjetas-moviles-bl-024.md`). Hoy las acciones quedan fuera de pantalla.

- Tarjeta `rounded-xl bg-card shadow-card p-4`, `grid gap-3`.
- Cabecera: `IdChip` y `PriorityBadge variant="compact"` en una fila (`flex flex-wrap items-center gap-2`). Debajo, el título (`text-sm font-medium`, hasta 3 líneas con `line-clamp-3`, enlace a la ficha si hay permiso) y la fecha de registro (`text-meta text-muted-foreground tabular-nums`).
- Pie: `grid grid-cols-2 gap-2 border-t pt-3`. Dos botones de ancho completo con `h-11` (objetivo táctil 44 px): Devolver `outline`, Aprobar `default`. No usar `menuOnly` aquí: ocultar las dos acciones principales tras «…» es el defecto actual.
- Sin scroll horizontal. Con el diálogo abierto, ver 1.3.

### 1.3 Diálogo de confirmación (Aprobar)

`ConfirmDialog` con: `tone="default"` (botón primario, no destructivo), `title="¿Aprobar el compromiso?"`, `confirmLabel="Aprobar compromiso"`, `cancelLabel="Cancelar"`, `description="La solicitud pasará a Comprometida."`.

Resumen (slot `children`), dentro de `DialogBody`:

```
┌ ¿Aprobar el compromiso? ─────────────────[x]┐
│ La solicitud pasará a Comprometida.         │
│ ┌─────────────────────────────────────────┐ │
│ │ [PRY-0012]                [P1 · 84]     │ │
│ │ Título de la solicitud (hasta 3 líneas) │ │
│ │ Score      84 · P1 Primera consideración│ │
│ │ Registrada 12 nov 2026                  │ │
│ └─────────────────────────────────────────┘ │
│            [Cancelar] [Aprobar compromiso]  │
└─────────────────────────────────────────────┘
```

- Contenedor del resumen: `grid gap-2 rounded-lg bg-muted/50 p-3` (sin borde duro). Mismo fondo en claro y oscuro; el token ya cambia por tema.
- Fila 1: `IdChip` (código completo) y `PriorityBadge variant="full"` con score y etiqueta; `flex flex-wrap items-center gap-2`.
- Título: `text-sm font-medium line-clamp-3 break-words`.
- Datos secundarios: `DescriptionList columns={1}`: «Score» (número + banda en texto, no solo color) y «Registrada» (`formatDate`).
- Foco inicial en Cancelar (comportamiento actual). Clic fuera no cierra. Escape cierra salvo en curso. Enter en Cancelar no aprueba.
- En curso: botón `loading` con «Aprobando…», Cancelar deshabilitado. Al terminar se cierra y se mantiene el toast y el retorno de foco a la fila siguiente (`returnFocusTo` existente).
- Error del backend: toast (como hoy). El diálogo se cierra igual (comportamiento de `ConfirmDialog`); la fila sigue en la tabla.
- 390 px: `DialogContent` ocupa `w-[calc(100%-1rem)]`; `DialogFooter` ya apila (`flex-col-reverse`): Aprobar arriba, Cancelar abajo, ambos `h-11` de ancho completo. El resumen no desborda: `min-w-0 break-words`.
- Decisión de producto: se elige confirmar y no «Deshacer», porque el plan admite ambas y el deshacer exige una transición de estado nueva en la API.

---

## 2. Triage: motivo obligatorio al Devolver y Rechazar

**Objetivo.** Quien devuelve o rechaza deja por escrito el porqué; el solicitante lo verá en la ficha y la notificación.

### 2.1 Ubicación y estructura

Dentro del formulario de Triage, justo debajo del `FieldSet` «Decisión» y encima de `FormError` y del botón. No es un diálogo: el motivo forma parte de la misma decisión y el formulario ya valida al enviar.

Aparece solo con `DEVOLVER` o `RECHAZAR` y se retira con `CONTINUAR`. El texto escrito se conserva si el usuario cambia entre Devolver y Rechazar. Con `CONTINUAR` no se envía.

```
Decisión *   (•) Continuar  ( ) Devolver  ( ) Rechazar

[ i ] Al devolver, el solicitante verá este motivo en la ficha y en una notificación.
Motivo de la devolución *
┌──────────────────────────────────────┐
│                                      │  (4 filas)
└──────────────────────────────────────┘
Mínimo 10 caracteres.                         0 / 10
```

### 2.2 Clases

- Contenedor: `grid gap-3` con `motion-safe:animate-in motion-safe:fade-in-0` (respeta `prefers-reduced-motion`, sin animación de altura).
- Aviso de consecuencia (`InlineNotice`, texto `text-meta`):
  - Devolver: `tone="warning"`. Texto: «Devolver pide al solicitante que complete la información. Verá este motivo en la ficha y en una notificación.» El texto debe ajustarse a lo que resuelva D3 (qué pasa tras devolver).
  - Rechazar: `tone="danger"`. Texto: «Rechazar cierra la solicitud. El solicitante verá este motivo en la ficha y en una notificación.»
- Campo: `Field id="triage-reason" required label="Motivo de la devolución"` o `"Motivo del rechazo"` (cambia con la decisión), `help="Mínimo 10 caracteres. Explica qué falta o por qué no procede."`, `error={fieldErrors.reason}`. Control: `Textarea` con `rows={4}` (el componente ya pinta el borde de error con `aria-invalid`).
- Contador: `<p className="text-meta text-muted-foreground tabular-nums text-right">` con «{n} / 10» y, al llegar a 10, «{n} caracteres». Sin `aria-live` para no anunciar cada tecla; el mínimo ya está en la ayuda enlazada por `aria-describedby`. Cuenta caracteres tras `trim()`.
- Botón de guardar: Rechazar usa `variant="destructive"` y texto «Rechazar solicitud»; Devolver usa `variant="default"` y «Devolver solicitud»; Continuar mantiene «Guardar triage». El texto en curso es «Guardando…».

### 2.3 Validación

- Al enviar, con motivo vacío: «Escribe el motivo de la devolución.» / «Escribe el motivo del rechazo.».
- Con menos de 10 caracteres: «El motivo debe tener al menos 10 caracteres.».
- Todos los errores a la vez, junto al campo (patrón `Field`). El foco va al primer campo con error; si el único error es el motivo, a su `Textarea`. El error se limpia al editar.
- Errores del backend (400): `FormError` del formulario y toast; lo escrito se conserva.

### 2.4 Visibilidad posterior (referencia para el desarrollador)

En la ficha de la solicitud, el motivo se muestra en `DescriptionList` con término «Motivo de la devolución» o «Motivo del rechazo», `span: 2`. Es un ajuste menor dentro del patrón de la ficha y no necesita spec aparte.

### 2.5 Aprobaciones › Devolver

El `DevolverDialog` (`ReasonDialog`) ya exige motivo. Para coherencia, aplicar el mismo mínimo de 10 caracteres y el mismo mensaje con `requiredMessage`, y ajustar el texto «devolverla regresa a triage» tras resolver D3.

---

## 3. Priorización: ocho criterios sin valor por defecto

**Objetivo.** Evitar guardar un score que nadie evaluó. Cada criterio nace «sin evaluar» y el usuario debe valorar los ocho.

### 3.1 Estado inicial

- Los ocho valores empiezan en `null`: ningún radio marcado (`value=''` en `SegmentedRadio`; ninguna opción coincide).
- Cada fila muestra a la derecha de la etiqueta, bajo el peso, el texto «Sin evaluar» con icono `CircleDashed` (`aria-hidden`): `inline-flex items-center gap-1 text-meta text-muted-foreground`. Al elegir un valor el texto desaparece (el valor marcado ya lo comunica con relleno `bg-primary` y negrita, que no depende solo del color).
- Encabezado de la tarjeta, junto al título «Evaluación de prioridad»: contador «{n} de 8 criterios evaluados», `text-meta text-muted-foreground tabular-nums`, con `role="status"` y `aria-live="polite"` (cambia con un clic, no por tecla). Con 8 de 8: «Los 8 criterios están evaluados.».
- Línea de escala bajo la cabecera de la tabla de criterios, `text-meta text-muted-foreground`: «1 = más bajo · 5 = más alto». Se retira cuando se defina la escala configurable (plan 2.4, P2).
- Botón «Guardar evaluación»: siempre habilitado, para que la validación sea visible (un botón deshabilitado sin motivo no explica qué falta).

### 3.2 Validación al enviar

- Si falta algún criterio no se llama a la API. Cada fila sin valor entra en error:
  - Fila: `bg-danger-subtle/40` y filete izquierdo `border-l-2 border-danger` (indicador adicional al texto, no solo color).
  - Mensaje bajo el criterio: «Elige una valoración de 1 a 5.» con el estilo de `FieldMessage` en error (`flex gap-1 text-meta text-danger`, icono `CircleAlert`). Id `priority-{key}-error`; se pasa a `SegmentedRadio` por `describedBy`, y se añade `aria-invalid` al `radiogroup` mientras falte.
  - El borde del `SegmentedRadio` pasa a `border-danger` mientras esté en error (`className`).
- `FormError` resume: «Faltan {n} criterios por evaluar: {lista}.» (`role="alert"`).
- El foco va al primer radio de la primera fila con error (`priority-{key}-1`).
- El error de una fila se limpia al elegir su valor. El resumen se actualiza o desaparece cuando ya no falta ninguno.
- Cambiar de solicitud reinicia los ocho a «Sin evaluar» (`selectRequest` ya reinicia el formulario). Tras guardar con éxito, el formulario conserva los valores guardados y el detalle de lo registrado aparece debajo (comportamiento actual).

### 3.3 Responsive

- 1440: filas en dos columnas (`sm:grid-cols-[minmax(0,1fr)_auto]`) como hoy. «Sin evaluar» queda bajo el peso, en la columna de la etiqueta.
- 390: etiqueta arriba, control abajo. `SegmentedRadio` con `className="w-full"` y `optionClassName="h-11 min-w-0 flex-1"` (objetivo táctil 44 px, cinco opciones repartidas). El mensaje de error va bajo el control. El contador del encabezado pasa a una línea propia.

### 3.4 Teclado y lectores de pantalla

- Un radiogroup por fila con la etiqueta visible; flechas cambian de opción (nativo). Tabulación: un solo punto de entrada por grupo.
- Sin valor marcado, la flecha o el Tab entran al primer radio. El foco visible es `has-[:focus-visible]:outline-ring` (ya existente).
- El estado «Sin evaluar» se asocia al grupo por `aria-describedby` (id `priority-{key}-state`), para que el lector lo anuncie.

---

## Estados

| Vista | Loading | Vacío | Error | Éxito | Deshabilitado | Foco |
| --- | --- | --- | --- | --- | --- | --- |
| Aprobaciones (acciones) | `Button loading` «Aprobando…» | Estado vacío existente | Toast y fila intacta | Toast «Solicitud aprobada. Pasa a Comprometida.» y foco a la fila siguiente | Acciones de otras filas con `disabled` mientras una actúa | Anillo `--ring` |
| Diálogo Aprobar | Botón `loading`, Cancelar deshabilitado | n/a | Toast, el diálogo se cierra | Se cierra | n/a | Inicial en Cancelar |
| Triage (motivo) | Botón `loading` | Campo oculto con Continuar | Error junto al campo; `FormError` si viene del backend | Toast existente | n/a | Al primer error |
| Priorización | Botón `loading` | «Sin evaluar» por fila | Error por fila y resumen | Toast con el score (existente) | n/a | Primer criterio faltante |

## Accesibilidad

- Pares de color reutilizados, todos ya definidos y medidos en `globals.css` y la guía de marca: `primary-foreground` sobre `primary` (4.84:1), `text-danger` sobre `bg-card` y `bg-danger-subtle` en `Field`/`InlineNotice`, `text-muted-foreground` sobre `bg-card` y `bg-muted/50`. No se introduce ningún par nuevo, salvo `bg-danger-subtle/40` con texto `text-foreground` (la fila con error): el texto del criterio sigue en `foreground`, y el mensaje de error de la fila va en `text-danger`. El desarrollador debe medir el ratio de `text-danger` sobre `bg-danger-subtle/40` en ambos temas con la utilidad de contraste del repositorio antes de cerrar. Si queda bajo 4.5:1, quitar el fondo y dejar solo el filete.
- El estado de error nunca se transmite solo por color: icono `CircleAlert`, texto y `aria-invalid`.
- Objetivos táctiles: 44 px en móvil para las acciones de tarjeta y criterios; 28 px o más en tabla compacta (WCAG 2.5.8).
- El diálogo de aprobación es `alertdialog`, con foco inicial en Cancelar y retorno de foco.
- `prefers-reduced-motion`: el campo de motivo usa `motion-safe:`; no hay otra animación.
- Esta especificación no sustituye una prueba manual con lector de pantalla (NVDA o VoiceOver) ni una revisión experta de accesibilidad.

## Entrega al desarrollador

1. `ConfirmDialog`: prop `children` opcional. `RowAction`: prop `variant`.
2. Aprobaciones: botones con forma, `ConfirmDialog` de aprobación con resumen y tarjetas móviles con las dos acciones.
3. Triage: bloque de motivo con validación (mínimo 10 caracteres, validado también en API) y botón con texto según la decisión.
4. Priorización: `scores` con `null`, texto «Sin evaluar», contador, validación por fila y resumen. La API debe rechazar valores fuera de 1 a 5, sin depender del cliente.
5. Pruebas: Playwright del flujo feliz (ya previsto antes de tocar estas vistas) con casos de motivo vacío, motivo corto, criterio sin valorar y cancelar la aprobación.
