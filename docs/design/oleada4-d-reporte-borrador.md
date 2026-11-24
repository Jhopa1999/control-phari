# Reporte semanal: «Proponer borrador» (Oleada 4, PR D, FEAT-004)

Vista afectada: `apps/web/src/app/seguimiento/semanal/semanal-view.tsx`, bloque
«Secciones del reporte» del detalle. No hay pantalla nueva ni tokens nuevos: todo se
compone con componentes existentes (`Button`, `InlineNotice`, `ConfirmDialog`) y
tokens semánticos de `25-marca-gibo.md`. Los dos temas se comportan igual porque
no se introduce ningún color propio.

## 1. Objetivo y acción principal

Quien redacta el reporte semanal parte de una página en blanco aunque ya registró
sus diarios. «Proponer borrador» le entrega un texto armado desde sus bitácoras
(resultados, bloqueos, compromisos de la semana siguiente) para que lo revise y
lo edite.

- Acción principal de la vista: **Guardar secciones** y luego **Enviar reporte**
  (no cambian).
- «Proponer borrador» es una acción **secundaria y de ayuda**: no debe competir
  con las dos anteriores. Va como botón `outline`, nunca `default`.
- Regla de producto: el borrador **nunca se guarda ni se envía solo**. Solo rellena
  los campos del formulario; lo guardado en la base no cambia hasta pulsar
  «Guardar secciones».

## 2. Estructura (orden en el detalle, solo cuando `actions.edit` es verdadero)

Dentro de `<Section title="Secciones del reporte" headingLevel={3}>`:

1. `renderStatusNotice(detail)` (sin cambios; aquí `BORRADOR` no muestra aviso,
   `DEVUELTO` sí).
2. **Barra de ayuda del borrador** (nueva): texto corto a la izquierda y botón a la
   derecha.
3. **Aviso del resultado del borrador** (nuevo, condicional): éxito informativo,
   vacío o error. Solo uno a la vez.
4. Formulario de cinco secciones (sin cambios) y «Guardar secciones».

Jerarquía: el foco visual sigue siendo el formulario y «Guardar secciones»
(`variant="secondary"`). La barra de ayuda es de bajo peso (texto
`text-muted-foreground`, botón `outline`). El aviso usa tono `info`, no `success`,
porque el borrador todavía no es un resultado confirmado.

El botón **no se muestra** en reportes enviados o revisados (los renderiza
`DescriptionList` en solo lectura). No se muestra deshabilitado con motivo: la
acción no existe en ese estado.

## 3. Clases Tailwind exactas

### 3.1 Barra de ayuda (fuera del `<form>`, para que el botón no envíe)

```tsx
<div className="flex max-w-[720px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
  <p id="semanal-borrador-help" className="text-sm text-muted-foreground">
    Arma un borrador con tus diarios de la semana. No se guarda hasta que pulses
    «Guardar secciones».
  </p>
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="w-full sm:w-auto sm:shrink-0"
    loading={drafting}
    disabled={saving || drafting}
    aria-describedby="semanal-borrador-help"
    onClick={() => void handleProposeDraft()}
  >
    <FileText aria-hidden="true" />
    {drafting ? 'Armando borrador…' : 'Proponer borrador'}
  </Button>
</div>
```

- Icono: `FileText` de `lucide-react` (ya es la librería del proyecto). No usar
  iconos de «magia» ni de IA: el borrador es determinista, no generado por un
  modelo, y no debe sugerirlo.
- `disabled={saving || drafting}`: mientras se guarda o ya se está armando no se
  permite un segundo clic. No hace falta `unavailable` ni `DisabledReason`: son
  estados transitorios de un segundo.
- Espaciado entre la barra, el aviso y el formulario: lo da el `gap` del contenedor
  de `Section`; si `Section` no apila con `gap-4`, envolver los tres bloques en
  `<div className="flex flex-col gap-4">`.

### 3.2 Aviso del resultado (`InlineNotice`, tokens ya definidos)

Contenedor común, con `className="max-w-[720px]"` y `role="status"` (el éxito y el
vacío se anuncian al lector de pantalla sin interrumpir; el error usa `alert`).

| Caso | `tone` | `role` | Título | Cuerpo |
| --- | --- | --- | --- | --- |
| Borrador con diarios | `info` | `status` | «Borrador generado desde {n} diario(s)» | «{m} actividad(es) de tu bitácora. Revísalo antes de guardar: todavía no se ha guardado nada.» |
| Borrador sin diarios, con texto | `info` | `status` | «No hay diarios tuyos en esta semana» | «El borrador solo trae los bloqueos o compromisos abiertos que se encontraron. Revísalo antes de guardar.» |
| Nada que proponer | `neutral` | `status` | «No hay nada que proponer para esta semana» | «No encontramos diarios, bloqueos ni compromisos. No se cambió ningún campo. Escribe las secciones a mano o registra tus diarios y vuelve a intentarlo.» |
| Error | `danger` | `alert` | «No se pudo armar el borrador» | Mensaje de la API en español (`messageOf(err)`: semana futura, proceso al que no perteneces, sesión). Después: «Puedes escribir las secciones a mano.» |

Reglas de texto:
- Singular y plural correctos: «1 diario» / «3 diarios», «1 actividad» /
  «2 actividades».
- El título del caso con diarios es exactamente el pedido por el FEAT («Borrador
  generado desde N diarios; revísalo antes de guardar»), repartido entre título y
  cuerpo para que se lea sin cortes.
- El aviso con `info` es el único caso en que el estado «hay un borrador sin
  guardar» sigue visible tras rellenar. Se retira al: guardar con éxito, cambiar de
  reporte, o pedir otro borrador (que lo reemplaza). No lleva botón de cerrar.
- Un error no borra ni toca lo que el usuario ya escribió.

### 3.3 Diálogo de confirmación (`ConfirmDialog`, `tone="default"`)

Se muestra **después** de recibir el borrador y **solo si** alguna sección que el
borrador va a reemplazar ya tiene texto (ver §4). Así el diálogo dice exactamente
qué se pisa.

```tsx
<ConfirmDialog
  open={replaceOpen}
  onOpenChange={setReplaceOpen}
  tone="default"
  title="¿Reemplazar el texto escrito?"
  description="El borrador sustituirá lo que ya escribiste en estas secciones. Lo que está guardado no cambia hasta que pulses «Guardar secciones»."
  confirmLabel="Reemplazar con el borrador"
  cancelLabel="Conservar mi texto"
  onConfirm={applyPendingDraft}
>
  <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
    {conflictLabels.map((label) => <li key={label}>{label}</li>)}
  </ul>
</ConfirmDialog>
```

- `tone="default"` (botón primario, no destructivo): lo guardado se conserva, así
  que el dolor es bajo y reversible recargando el reporte.
- Foco inicial en «Conservar mi texto» (lo hace `ConfirmDialog`: foco en Cancelar).
  Es la opción segura.
- Al cerrar, el foco vuelve al botón «Proponer borrador» (lo resuelve
  `useDialogReturnFocus`). No pasar `returnFocusTo`.
- `conflictLabels` son las etiquetas de `SECTION_FIELDS` afectadas, p. ej.
  «Resultados», «Bloqueos».

## 4. Comportamiento (qué rellena y cuándo confirma)

1. Clic: `drafting = true`, se llama al endpoint con el `processId` y `weekStart`
   del reporte abierto. Nada se escribe en los campos todavía.
2. Respuesta correcta: se calculan las **secciones afectadas** = las de
   `results`, `blockers` y `commitmentsText` cuyo texto del borrador no está vacío.
   `proposals` y `decisions` **nunca se tocan** (el borrador las trae vacías).
   Una sección vacía en el borrador **no borra** lo que el usuario escribió.
3. Las secciones afectadas que ya tienen texto no vacío (tras `trim()`, leyendo el
   estado **al llegar la respuesta**, no al hacer clic) son los **conflictos**.
   - Sin conflictos: se aplica de inmediato y se muestra el aviso §3.2.
   - Con conflictos: se abre el diálogo §3.3. «Reemplazar con el borrador» aplica
     solo las secciones afectadas; «Conservar mi texto» descarta el borrador y no
     muestra aviso.
4. Aplicar = `setSections` de las secciones afectadas. Los campos siguen
   editables. No se llama a `updateWeeklyReport`.
5. Error: aviso `danger` y los campos intactos.

## 5. Estados

| Estado | Comportamiento visual |
| --- | --- |
| Reposo | Barra de ayuda + botón `outline` habilitado. |
| Cargando | Botón con `loading` y texto «Armando borrador…», deshabilitado. El resto del formulario sigue editable. Sin skeleton: la espera es breve y el texto no cambia de lugar. |
| Éxito | Campos rellenados, aviso `info` con las cifras. |
| Vacío | Aviso `neutral`; ningún campo cambia. |
| Error | Aviso `danger` con `role="alert"`; campos intactos; el botón vuelve a quedar habilitado para reintentar. |
| Deshabilitado | Solo durante `saving` o `drafting`. Reporte enviado o revisado: el botón no se renderiza. |
| Foco | Anillo `--ring` heredado de `Button`. Tras el diálogo, el foco vuelve al botón. |

## 6. Formulario

Los cinco campos (`Field` + `Textarea`) no cambian de etiqueta ni de ayuda. El
borrador es texto plano con saltos de línea; el `Textarea` ya los conserva. Las
secciones rellenadas deben poder leerse sin desplazar horizontalmente: no usar
`whitespace-nowrap` ni anchos fijos. Los errores de guardado siguen el patrón
actual (toast, texto conservado).

## 7. Tablas y badges

No hay tablas nuevas. No se añaden badges: el estado del reporte sigue en
`StatusBadge kind="log"`. Los códigos de solicitud dentro del texto del borrador
(`PRY-0012`) van como texto plano porque viven dentro de un `Textarea`, donde un
`IdChip` no es posible (lo indica el FEAT).

## 8. Accesibilidad

- Contrastes: no se añade ningún par de colores nuevo. El botón `outline` y los
  `InlineNotice` (texto `text-foreground` sobre `*-subtle`, borde `*-border`,
  icono con su token de tono) y el texto `text-muted-foreground` reutilizan los
  pares ya validados por la marca en ambos temas (`25-marca-gibo.md`: primario con
  blanco 4.84:1, enlace 5.66:1 claro y 8.15:1 oscuro). En esta especificación no
  se recalculan ratios nuevos; el revisor debe confirmar con la medición de
  `docs/design/` que `text-muted-foreground` sobre `bg-card` mantiene ≥ 4.5:1 en
  ambos temas.
- No depender del color: cada aviso lleva icono propio y título textual.
- Orden de tabulación: filtros, lista de reportes, botones de la cabecera del
  detalle, **«Proponer borrador»**, cinco textareas, «Guardar secciones».
- El botón se asocia con su ayuda mediante `aria-describedby`.
- Anuncio: éxito y vacío con `role="status"` (cortés). Para que se anuncie, el
  contenedor del aviso debe existir antes del cambio, o bien montarse ya con
  `role="status"` en el mismo render en que aparece; lo más fiable es envolverlo
  siempre en `<div aria-live="polite">` que solo contiene el aviso cuando lo hay
  (mismo patrón que el consolidado). El error usa `role="alert"`.
- Diálogo: `alertdialog` de `ConfirmDialog`, foco inicial en la opción segura,
  Escape cierra, clic fuera no cierra.
- Tamaño de interacción: botón `size="sm"`. Debe cumplir el área mínima de
  24×24 px de WCAG 2.2 AA (2.5.8); `sm` ya la cumple en el resto del portal.
- `prefers-reduced-motion`: sin animaciones propias. El indicador de carga es el
  del `Button` existente.
- La conformidad completa requiere pruebas manuales con lector de pantalla
  (NVDA/Narrator sobre el anuncio del aviso y el diálogo) y revisión experta; esta
  especificación no las sustituye.

## 9. Responsive

| Ancho | Comportamiento |
| --- | --- |
| Móvil (< 640 px) | Barra apilada: texto arriba, botón `w-full` debajo. Diálogo `size="sm"` ocupa el ancho disponible. |
| Tablet (≥ 640 px, `sm`) | Texto a la izquierda, botón a la derecha (`sm:flex-row sm:justify-between`), alineados al centro vertical. |
| Escritorio (≥ 1024 px) | Igual que tablet; la barra y los avisos respetan `max-w-[720px]`, la misma columna que el formulario. |

## 10. Pruebas visuales y e2e que debe poder hacer la implementación

Selectores accesibles esperados para `e2e/semanal-borrador.spec.ts`:
- Botón: `getByRole('button', { name: 'Proponer borrador' })`.
- Aviso: `getByRole('status')` con texto «Borrador generado desde 1 diario».
- Diálogo: `getByRole('alertdialog', { name: '¿Reemplazar el texto escrito?' })`
  con botones «Reemplazar con el borrador» y «Conservar mi texto».
- Tras proponer, «Guardar secciones» sigue siendo la única acción que persiste.
