# Oleada 2 · Demanda (PR-A): especificación visual

Alcance: D3 (solicitud «Devuelta» y «Reenviar a triage»), D4 (quién edita y justificación desde «Comprometida», y lo que ve el solicitante de la decisión del triage), texto de «Devolver» en Aprobaciones y aviso de Triage tras un reenvío. Todo se construye con componentes existentes (`InlineNotice`, `ReasonDialog`, `ConfirmDialog`, `Field`, `DescriptionList`, `DisabledReason`, `StatusBadge`, `IdChip`, `Button`). Solo tokens semánticos; no se añaden colores, tokens ni dependencias. Los pares de color usados ya están definidos en `globals.css` y en uso (`InlineNotice` por tono, `text-muted-foreground`, `bg-primary` con `text-primary-foreground` a 4.84:1).

## Reutilización

| Necesidad | Componente existente | Cambio mínimo |
| --- | --- | --- |
| Aviso de estado «Devuelta» con motivo | `InlineNotice tone="warning"` | Ninguno |
| Confirmar «Reenviar a triage» | `ConfirmDialog` (`tone="default"`, foco inicial en Cancelar) | Usar el `children` añadido en oleada 1 para el resumen |
| Justificación de edición | `Field` + `Textarea` + `RequiredHint` + `FormError` dentro de `solicitud-form-dialog.tsx` | Campo nuevo condicionado por estado |
| Motivo y decisión en la ficha | `DescriptionList` de `ficha-detalles.tsx` (`TriageDetalle`) | Una fila más: «Motivo de la devolución» o «Motivo del rechazo» |
| Acción no disponible | `DisabledReason` | Ninguno |

Reglas de negocio (quién puede, qué estado) viven en la API. La web solo deshabilita y explica; ante un 403 o 409 muestra el mensaje del backend.

---

## 1. Ficha de solicitud «Devuelta»: aviso y «Reenviar a triage»

**Objetivo.** Quien creó la solicitud (o el líder o el jefe) entiende por qué volvió, corrige y la reenvía a triage sin buscar la acción.

**Acción principal:** «Reenviar a triage». Acción secundaria: «Editar ficha».

### 1.1 Estructura (orden vertical)

1. `PageHeader` de la ficha (sin cambios): título, `IdChip` (`PRY-0012`), `StatusBadge` «Devuelta» (variante `warning`, con icono y etiqueta; nunca solo color).
2. **Banda de devolución** (solo en estado `DEVUELTA`), justo debajo del header y encima de las etapas. Es el foco de la pantalla: contiene el motivo y la acción.
3. Etapas (`FichaStep`) como hoy. La etapa Triage muestra el historial (ver 3).

### 1.2 Banda de devolución

Contenedor: `InlineNotice tone="warning"` con `title="Solicitud devuelta"` y estructura interna:

```
┌ [!] Solicitud devuelta ─────────────────────────────────────┐
│ Motivo del triage                                           │
│ «Falta indicar el proceso afectado y el impacto esperado.»  │
│ Devuelta por Ana Pérez · 12 nov 2026                        │
│                                                             │
│ Corrige la ficha y reenvía la solicitud a triage.           │
│ [ Editar ficha ]  [ Reenviar a triage ]                     │
└─────────────────────────────────────────────────────────────┘
```

Clases (se aplican al contenido, el contenedor lo da `InlineNotice`):

- Etiqueta «Motivo del triage»: `text-meta font-medium text-muted-foreground`.
- Motivo: `mt-1 text-sm text-foreground whitespace-pre-wrap break-words` (texto del usuario, nunca `dangerouslySetInnerHTML`).
- Autor y fecha: `mt-1 text-meta text-muted-foreground tabular-nums`.
- Línea guía: `mt-3 text-sm`.
- Fila de acciones: `mt-3 flex flex-wrap items-center gap-2`.
  - «Editar ficha»: `Button variant="outline" size="default"`.
  - «Reenviar a triage»: `Button variant="default"` (`bg-primary text-primary-foreground`, 4.84:1), icono `Send` `aria-hidden` a la izquierda. Es la acción principal y queda a la derecha.
- Si no hay motivo registrado (devuelta desde Aprobaciones sin triage `DEVOLVER`): título «Solicitud devuelta», texto «El motivo está en el historial de aprobación.» y se muestra el motivo de la aprobación.

### 1.3 Quién ve qué

| Quien mira | Banda | «Editar ficha» | «Reenviar a triage» |
| --- | --- | --- | --- |
| Creador, líder del proceso o jefe | Visible con motivo | Habilitado | Habilitado |
| Integrante que no creó la solicitud | Visible con motivo | No se muestra | No se muestra; en su lugar `DisabledReason`: «Solo quien la registró, el líder o el jefe pueden reenviarla.» |
| Solicitud no `DEVUELTA` | No existe | Según 2.1 | No existe |

El `DisabledReason` va en `mt-3 text-meta text-muted-foreground`, enlazado con `aria-describedby`.

### 1.4 Diálogo «Reenviar a triage»

`ConfirmDialog`: `tone="default"`, `title="¿Reenviar a triage?"`, `description="La solicitud volverá a Registrada y aparecerá en «Pendientes de triage». El jefe de área recibirá un aviso."`, `confirmLabel="Reenviar a triage"`, `cancelLabel="Cancelar"`.

Resumen (`children`): `grid gap-2 rounded-lg bg-muted/50 p-3 min-w-0 break-words`, con `IdChip` + título (`text-sm font-medium line-clamp-3`) y `DescriptionList columns={1}` con «Motivo de la devolución» (el vigente). Se muestra para que quien reenvía confirme que corrigió lo pedido.

- Foco inicial en Cancelar. Clic fuera no cierra. Escape cierra salvo en curso.
- En curso: botón `loading` con «Reenviando…», Cancelar deshabilitado.
- Éxito: se cierra, toast «Solicitud reenviada a triage.», el estado de la ficha pasa a «Registrada» y la banda desaparece. El foco vuelve al encabezado de la ficha (`h1` con `tabIndex={-1}`), porque el botón disparador ya no existe.
- Error 403/409: el diálogo muestra el mensaje en línea con `FormError` (`role="alert"`), sin cerrarse. Un 409 por estado cambiado en paralelo ofrece «Recargar».

### 1.5 Estados

| Estado | Comportamiento |
| --- | --- |
| Carga | `Skeleton` de la banda (`h-24 rounded-xl`) para no mover el layout |
| Vacío (sin motivo) | Texto alterno de 1.2 |
| Error de carga del triage | La banda sigue visible con «No se pudo cargar el motivo. Recarga la página.» (`text-meta`) y las acciones habilitadas |
| Éxito | Toast y cambio de estado, ver 1.4 |
| Deshabilitado | Botón con `disabled` y `DisabledReason` enlazado; no se depende solo del gris |
| Foco | `focus-visible:ring` con `--ring` en botones y en el diálogo; nunca se elimina el outline |

### 1.6 Responsive

- **1440:** la banda ocupa el ancho de la columna de contenido (`max-w` del `PageLayout`), acciones en una fila debajo del texto guía, alineadas a la izquierda.
- **390:** `InlineNotice` a ancho completo (`mx-0`), motivo con `break-words`, acciones `grid grid-cols-1 gap-2` con botones `h-11 w-full` (objetivo táctil 44 px). «Reenviar a triage» primero (arriba), «Editar ficha» debajo. Sin scroll horizontal. Diálogo `w-[calc(100%-1rem)]`, footer apilado con Reenviar arriba.

### 1.7 Claro y oscuro

Sin colores propios: `InlineNotice warning` usa `--warning-subtle`, `--warning-border` y `--warning`, que cambian por tema (claro: fondo `oklch(0.965 0.034 86)`; oscuro: `oklch(0.28 0.045 70)`). El texto del motivo usa `text-foreground`, no el color del tono, para conservar el contraste del cuerpo. El botón primario es el mismo en ambos temas. En oscuro, `bg-muted/50` del resumen sigue separando niveles frente al diálogo (`bg-card`).

---

## 2. Edición: política por estado y justificación obligatoria desde «Comprometida»

**Objetivo.** Editar una solicitud ya comprometida deja constancia del porqué. Quien no puede editar lo sabe antes de abrir el formulario.

### 2.1 Visibilidad de «Editar ficha»

| Estado | Quién ve «Editar ficha» habilitado | Justificación |
| --- | --- | --- |
| `REGISTRADA`, `DEVUELTA` | Creador, líder o jefe | No |
| `EN_TRIAGE`, `BACKLOG_PRIORIZADO`, `RECHAZADA`, `RETIRADA` | Líder o jefe | No |
| `COMPROMETIDA` hasta `OPERATIVA` | Líder o jefe | Sí, obligatoria |
| `CERRADA` | Nadie | No aplica |

Quien no puede: el elemento de menú «Editar ficha» (`solicitudes-view.tsx`) y el botón de la ficha se muestran deshabilitados con `DisabledReason`: «Solo el líder del proceso o el jefe pueden editar una solicitud en este estado.» Para `CERRADA`: «La solicitud está cerrada y no se puede editar.» En el menú de fila, el motivo va como segunda línea `text-meta text-muted-foreground` del ítem y en `aria-describedby`.

### 2.2 Diálogo de edición con justificación

Se reutiliza `solicitud-form-dialog.tsx` (`DialogContent size="lg"`). Cuando el estado es `COMPROMETIDA` o posterior se añaden dos elementos; con estados anteriores el diálogo queda idéntico a hoy.

```
Editar solicitud
[ i ] Esta solicitud ya está comprometida. Los cambios quedan registrados
      con tu justificación y los verá el equipo en el historial.
 ... campos de la ficha (sin cambios) ...
 ────────────────────────────────────────────────
 Justificación del cambio *
 ┌────────────────────────────────────────────┐
 │                                            │ (3 filas)
 └────────────────────────────────────────────┘
 Mínimo 10 caracteres. Explica qué cambia y por qué.       0 / 10
                                   [Cancelar] [Guardar cambios]
```

- Aviso: `InlineNotice tone="info"`, `text-meta`, primer hijo del cuerpo del diálogo, antes de los grupos de campos.
- Campo: `Field id="sol-change-justification" required label="Justificación del cambio" help="Mínimo 10 caracteres. Explica qué cambia y por qué." error={fieldErrors.changeJustification}` con `Textarea rows={3}`. Va **al final del cuerpo**, encima del `DialogFooter`, para que sea lo último que se completa y quede cerca del botón de guardar. `RequiredHint` junto al título de grupo como en el resto del formulario.
- Contador: `<p className="text-meta text-muted-foreground tabular-nums text-right">` «{n} / 10» y, al llegar a 10, «{n} caracteres». Sin `aria-live`. Cuenta caracteres tras `trim()` (misma regla que `TRIAGE_REASON_MIN_LENGTH`).
- Botón de guardar: `variant="default"`, «Guardar cambios», en curso «Guardando…» con `loading`. Se mantiene habilitado aunque falte la justificación: la validación ocurre al enviar y explica el error (un botón gris sin motivo es peor para quien usa lector de pantalla).

### 2.3 Validación y errores

- Vacío: «Escribe la justificación del cambio.»
- Menos de 10 caracteres: «La justificación debe tener al menos 10 caracteres.»
- Todos los errores a la vez junto a su campo; el foco va al primer campo con error. El error se limpia al editar.
- Error del backend (400/403/409): `FormError` en el pie del cuerpo, `role="alert"`, y el diálogo queda abierto con todo lo escrito intacto (AC-031).
- Sin cambios en los campos de la ficha: «Guardar cambios» responde con el aviso «No hay cambios que guardar.» en lugar de enviar la justificación sola.

### 2.4 Estados

| Estado | Comportamiento |
| --- | --- |
| Carga del diálogo | Campos con `Skeleton` solo si el detalle no está cargado; la justificación aparece cuando se conoce el estado |
| En curso | `loading` en guardar, Cancelar y campos deshabilitados |
| Error | `FormError` y errores por campo, ver 2.3 |
| Éxito | Cierra, toast «Cambios guardados.», foco al disparador |
| Foco | Primer campo (título) al abrir; ring visible en todos |

### 2.5 Responsive

- **1440:** `size="lg"`, grupos en dos columnas como hoy; la justificación ocupa las dos (`md:col-span-2`).
- **390:** una columna, `DialogContent` `w-[calc(100%-1rem)]` con scroll interno del cuerpo (`DialogBody` ya lo hace), footer apilado con «Guardar cambios» arriba (`h-11 w-full`). El teclado en pantalla no tapa el campo: el cuerpo desplaza el foco al `Textarea` con `scroll-margin-bottom`.

### 2.6 Claro y oscuro

Aviso `info` con `--info-subtle`/`--info-border`/`--info`. `Textarea` con el borde de control del sistema (≥ 3:1) y el borde de error por `aria-invalid` (`--danger`). Sin colores propios.

---

## 3. Lo que el solicitante ve de la decisión del triage

**Objetivo.** El solicitante sabe qué decidió el triage y por qué, sin acceder a notas internas ni al endpoint de triage (su rol recibe 403 allí).

### 3.1 Fuente y contenido visible

Dato único: `currentTriageReason` de la respuesta de la solicitud (solo `decisionReason` de la última decisión `DEVOLVER` o `RECHAZAR`) más la decisión y su fecha. **Nunca** se muestran notas del triage, dependencias, evaluaciones ni nombres de quienes evaluaron fuera de la persona que decidió.

| Dato | Solicitante | Líder o jefe |
| --- | --- | --- |
| Decisión (Continuar, Devolver, Rechazar) y fecha | Sí | Sí |
| Motivo de la devolución o del rechazo | Sí | Sí |
| Notas internas, dependencias, proceso y activo evaluados | No | Sí (como hoy) |

### 3.2 Estructura en la etapa «Triage» de la ficha

Para el solicitante, `TriageDetalle` muestra un `DescriptionList columns={2}` reducido:

- «Decisión»: `StatusBadge` con icono y etiqueta («Devuelta» `warning`, «Rechazada» `danger`; «Continuó» `success` solo si la solicitud ya avanzó).
- «Fecha de la decisión»: `formatDate`, `tabular-nums`.
- «Motivo de la devolución» o «Motivo del rechazo» (`span: 2`): `text-sm whitespace-pre-wrap break-words`.

Se retira el texto «Triage no registrado» para este rol cuando existe decisión: hoy lo ve por el 403. Mientras no haya decisión, el estado vacío es «Aún sin decisión de triage.» (`text-sm text-muted-foreground`, con `EmptyState` compacto sin botón).

Para líder y jefe se conserva la vista completa actual y se añade, si hay varias decisiones, el historial: lista `ul` de la más reciente a la más antigua, cada ítem con `StatusBadge`, fecha y motivo; la más reciente primero y marcada «Vigente» con `Badge variant="neutral"`. Tras un reenvío se ve «Devuelta» (anterior) y debajo la nueva decisión cuando exista.

### 3.3 Etiqueta de privacidad

Bajo el bloque, solo para el solicitante: `text-meta text-muted-foreground` «Verás aquí la decisión y su motivo. Las notas internas del equipo no se muestran.» Es información, no un aviso con color.

### 3.4 Estados

| Estado | Contenido |
| --- | --- |
| Carga | `Skeleton` de dos líneas del bloque |
| Sin decisión | Mensaje de 3.2 |
| Error al cargar la solicitud | `ErrorState` de la ficha (sin cambios) |
| Motivo muy largo | `break-words`, sin truncar; el contenedor crece |

### 3.5 Responsive y temas

- **1440:** dos columnas, motivo a ancho completo.
- **390:** una columna; términos sobre valores (`DescriptionList` apila). Historial en tarjetas `rounded-xl bg-card shadow-card p-3`, sin scroll horizontal.
- Claro y oscuro solo con tokens de `StatusBadge` y `text-muted-foreground`; el motivo usa `text-foreground`.

---

## 4. Aprobaciones: texto de «Devolver»

El backend envía `DEVOLVER → EN_TRIAGE`; la solicitud vuelve a Priorización (el triage ya hecho se conserva), no a una bandeja de triage. El texto actual («regresa a triage») es impreciso.

- `DevolverDialog` (`ReasonDialog`), `description`: «La solicitud vuelve a Priorización con tu motivo. El triage ya registrado se conserva y el solicitante recibe un aviso.»
- `fieldLabel`: «Motivo de la devolución». `requiredMessage`: «El motivo es obligatorio para devolver.» Mínimo 10 caracteres con el mensaje «El motivo debe tener al menos 10 caracteres.» (coherente con oleada 1, 2.5).
- `revision-view.tsx` (~línea 217): mismo texto, en el aviso de la vista y en el `title` accesible del botón.
- Botones y móvil sin cambios respecto de `oleada-1-demanda.md` (secciones 1.1 y 1.2).

---

## 5. Triage: aviso tras un reenvío

- `triage-view.tsx` (~líneas 387, 917 a 938 y 1340): el aviso «El triage se registra una sola vez» pasa a `InlineNotice tone="info"` con «La decisión de triage queda registrada. Si la solicitud se devuelve y el solicitante la reenvía, volverás a decidir y se conserva el historial.»
- En la lista «Pendientes de triage», una solicitud reenviada lleva `Badge variant="warning"` con icono y la etiqueta «Reenviada». Se identifica por tener una decisión previa `DEVOLVER`. La etiqueta se acompaña de texto, no solo de color.
- Al abrir una solicitud reenviada, encima del formulario va una `InlineNotice tone="warning"` con «Decisión anterior: Devuelta» y su motivo, para que quien decide vea qué se pidió corregir. Misma clase de contenedor que la banda de 1.2.
- 390: igual patrón de tarjetas ya existente; el `Badge` pasa a la línea del `IdChip` (`flex flex-wrap gap-2`).

---

## Accesibilidad

- Contraste WCAG 2.2 AA (4.5:1 texto normal, 3:1 texto grande y bordes de controles). Solo se usan pares ya definidos en `globals.css` para ambos temas (`InlineNotice`, `StatusBadge`, `text-muted-foreground`, `bg-primary` con `text-primary-foreground` a 4.84:1). No se introducen pares nuevos. El implementador debe medir con axe en los dos temas; esta especificación no incluye un cálculo nuevo de ratios porque no hay colores nuevos.
- Orden de tabulación en la ficha devuelta: header, banda (Editar ficha, Reenviar a triage), etapas. En los diálogos: campos en orden visual, justificación al final, Cancelar, acción principal.
- Roles: `ConfirmDialog` es `alertdialog`; los errores usan `role="alert"`; los avisos informativos usan `role="status"` (sin `aria-live` por tecla).
- El significado no depende del color: cada estado lleva etiqueta e icono.
- Los textos de usuario (motivos, justificaciones) se renderizan como texto, nunca como HTML.
- `prefers-reduced-motion`: las apariciones usan `motion-safe:` y no animan la altura.
- La validación completa requiere pruebas manuales con lector de pantalla y revisión experta; axe cubre solo una parte.

## Verificación visual requerida (para el implementador)

Capturas a 1440 y 390, claro y oscuro, de: ficha `DEVUELTA` (con y sin permiso), diálogo «Reenviar a triage», diálogo de edición de una solicitud `COMPROMETIDA` con error de justificación, etapa Triage vista por el solicitante, diálogo «Devolver» de Aprobaciones y Triage con una solicitud reenviada.
