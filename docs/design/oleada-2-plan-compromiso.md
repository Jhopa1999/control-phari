# Oleada 2 · PR-B · Plan: datos del plan y compromiso obligatorio

Alcance: decisión D6 del plan de mejora (módulo 3.1) y la validación de periodo. El compromiso es obligatorio para enviar el plan a autorización y se precarga con la fecha fin de la última tarea, como valor editable. Se construye con componentes existentes (`Field`, `Input type="date"`, `Textarea`, `InlineNotice`, `RequirementsPanel`, `ConfirmDialog`, `Button`). Solo tokens semánticos; no se añaden colores ni dependencias. No se toca BL-051 ni BL-052 (línea base y `rebaseline`).

Archivos que lo implementan: `app/seguimiento/plan/plan-view.tsx`, nuevo `plan-data-card.tsx`, `plan-guide-panel.tsx`, `plan-summary.tsx`, `lib/plan-guide.ts` y `lib/plan.ts` (`updatePlan` ya existe y hoy no se usa).

## 1. Objetivo de la vista

Quien prepara el plan (líder o jefe, plan en `BORRADOR` o `DEVUELTO`) fija la fecha de compromiso sin salir de la pantalla del plan. La acción principal sigue siendo «Enviar a autorización»; el compromiso es el pendiente que más rápido se resuelve, por eso llega ya propuesto.

## 2. Estructura y jerarquía

Orden de bloques en la pantalla del plan (solo cuando el plan es editable; si no, se queda el resumen de solo lectura):

1. `PlanSummary` (sin cambio de estructura).
2. **Nuevo: tarjeta «Datos del plan»** (`PlanDataCard`), encima de «Fases» y de las tareas. Es el único bloque nuevo y el compromiso es su campo destacado.
3. Fases y tareas (sin cambio).
4. `PlanGuidePanel` al final (sin cambio de posición, PLA-06). Gana el pendiente «Falta la fecha de compromiso» con la acción «Ir al compromiso».

Foco principal: el campo «Fecha de compromiso». Periodo, riesgos y mitigaciones son secundarios y opcionales.

```
┌ Datos del plan ───────────────────────────────────────────┐
│ Define el periodo y el compromiso antes de enviar.        │
│                                                           │
│ Fecha de compromiso *                 Inicio del periodo  │
│ [ 12/11/2026      ] [Sugerida]        [ __/__/____ ]      │
│ Sugerida: fin de la última tarea      Fin del periodo     │
│ (PRY-0012-T07, 12 nov 2026).          [ __/__/____ ]      │
│                                                           │
│ Riesgos                                                   │
│ [ textarea 3 filas                                      ] │
│ Mitigaciones                                              │
│ [ textarea 3 filas                                      ] │
│                                       [Guardar datos]     │
└───────────────────────────────────────────────────────────┘
```

## 3. Clases por bloque

### 3.1 Tarjeta

- Contenedor: `section` con `aria-labelledby`, `flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 shadow-card sm:p-5` (patrón de tarjeta de la marca; sin borde duro).
- Título: `h2` `text-base font-semibold`. Descripción: `p` `text-meta text-muted-foreground`.
- Cuadrícula de campos: `grid gap-4 sm:grid-cols-2`. El compromiso ocupa la primera celda; Inicio y Fin del periodo van apilados en la segunda (`grid gap-4`). Riesgos y Mitigaciones: `sm:col-span-2`.
- Pie: `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` con `Button` por defecto «Guardar datos del plan» (`Guardando…` en curso).

### 3.2 Campo «Fecha de compromiso»

- `Field id="plan-commitment" label="Fecha de compromiso" required error={errors.commitmentDate}` con `Input type="date"`, `className="w-full sm:w-44"`, `aria-describedby` hacia la ayuda y el error.
- Ayuda bajo el campo (`text-meta text-muted-foreground`):
  - Con sugerencia: «Sugerida: fin de la última tarea ({IdChip corto} · {fecha}). Puedes cambiarla.»
  - Sin tareas con fecha: «Aún no hay tareas con vencimiento. Escribe la fecha a la que te comprometes.»
- Marca de valor sugerido, solo mientras el valor mostrado es la sugerencia y aún no está guardado: `Badge variant="outline"` con el texto «Sugerida, sin guardar» junto a la etiqueta (texto, no solo color). Desaparece al guardar o al editar el valor.
- Botón «Usar la sugerida»: `Button variant="ghost" size="sm"` (texto `text-link` por la variante), visible solo si el valor actual difiere de la sugerida y esta existe. Al pulsar, rellena el campo y devuelve el foco al campo.
- Aviso informativo opcional, bajo la ayuda (no bloquea): si el compromiso guardado es anterior a la sugerida, `InlineNotice tone="info"` «Hay tareas que terminan después del compromiso. La última termina el {fecha}.». Es solo orientación: no replanifica ni cambia la línea base (BL-052).

### 3.3 Periodo, riesgos y mitigaciones

- Inicio y Fin: `Field` + `Input type="date"`, `className="w-full sm:w-44"`; Fin con `min={inicio || undefined}`. Opcionales.
- Riesgos y Mitigaciones: `Textarea rows={3}`, `maxLength` según el DTO. Contador solo si el DTO tiene tope, con el patrón `text-meta text-muted-foreground tabular-nums text-right`, sin `aria-live`.

### 3.4 Pendiente en la guía

En `PlanGuidePanel`, el código `NO_COMMITMENT` se presenta en una categoría «Datos del plan» (etiqueta de `guideCategoryLabel`) con el texto «Falta la fecha de compromiso.» y la acción «Ir al compromiso» (`type="button"`). Al activarla: `document.getElementById('plan-commitment')` recibe el foco y `scrollIntoView({ block: 'center', behavior: 'auto' })` (sin animación de desplazamiento si `prefers-reduced-motion`; se usa `auto` siempre para evitar la rama). El texto «Resuelve los pendientes de la lista para enviar el plan.» no cambia.

## 4. Estados

| Estado | Comportamiento |
| --- | --- |
| Cargando | Bloque `Skeleton` (`h-40 rounded-xl`) mientras se resuelve el plan; la guía conserva el suyo. |
| Plan sin compromiso, con tareas | Campo precargado con la sugerida, marca «Sugerida, sin guardar». La guía sigue mostrando `NO_COMMITMENT` hasta guardar. Precargar no guarda nada. |
| Plan sin compromiso, sin tareas con fecha | Campo vacío, ayuda «Aún no hay tareas con vencimiento…». |
| Compromiso guardado | Sin marca; la guía no lista `NO_COMMITMENT`. Si la sugerida cambió después, no se pisa el valor guardado. |
| Valor editado, sin guardar | Botón «Guardar» habilitado. Navegar a otra solicitud con cambios pendientes: sin diálogo nuevo (el patrón del plan ya refresca al guardar). |
| Guardando | `Button` en `loading` («Guardando…»), campos `disabled`. |
| Error de validación (cliente) | «Escribe la fecha de compromiso.» solo al intentar enviar con el campo vacío. «La fecha de fin del periodo no puede ser anterior al inicio.» junto al campo Fin. Todos los errores a la vez; el foco va al primero. |
| Error de la API | 400 de periodo invertido: mismo mensaje junto a Fin. 409 al enviar sin compromiso: toast con el mensaje y el foco al campo (`plan-commitment`). Lo escrito se conserva. |
| Éxito | `toast.success('Datos del plan guardados.')`; la guía se refresca (`refreshGuideOnly`). |
| Plan no editable (`EN_AUTORIZACION`, `AUTORIZADO`) | No se pinta la tarjeta; el compromiso se ve en `PlanSummary` («Fecha de compromiso»). Los planes antiguos sin compromiso no muestran una fila vacía. |
| Sin permiso | Sin tarjeta, igual que hoy la guía (`canEdit`). |
| Foco | `focus-visible` del sistema (`--ring`); el diálogo de envío conserva «Cancelar» como foco inicial. |

## 5. Envío a autorización

Sin diálogo nuevo. El `ConfirmDialog` existente («¿Enviar el plan a autorización?») añade el compromiso en la descripción cuando existe: «Compromiso: {fecha}. Mientras esté en autorización no podrás editar fases ni tareas.». El botón «Enviar a autorización» sigue `unavailable` mientras la guía tenga pendientes, con la razón visible (`DisabledReason`) que ya existe.

## 6. Accesibilidad

- Contrastes: todos los pares son tokens ya medidos en `docs/design/identidad-color-menu.md` (§4): `foreground`/tarjeta 14,92 en oscuro, `muted-foreground`/lienzo 6,25, `muted-foreground`/tarjeta oscura 7,58, `text-link`/lienzo 5,36, botón primario 4,84. El texto de `InlineNotice` usa `text-foreground` sobre `info-subtle`; el tono solo colorea borde e icono. Borde de control/tarjeta 3,63 claro y 3,49 oscuro (umbral 3). El `Badge outline` usa `foreground`. Antes de implementar, `desarrollador` mide `foreground`/`info-subtle` en ambos temas con el script de contraste del repo; no se estima aquí.
- La marca «Sugerida, sin guardar» es texto y el significado no depende del color.
- Orden de tabulación: compromiso, «Usar la sugerida», inicio, fin, riesgos, mitigaciones, «Guardar datos del plan».
- `Field` enlaza etiqueta, ayuda y error con `aria-describedby`; el error lleva `aria-invalid` en el control. La ayuda de la sugerida no es `aria-live`.
- Objetivos táctiles: `Input` y `Button` a `h-9` en escritorio; en móvil `pointer-coarse:` del sistema (mínimo 40 px). «Usar la sugerida» en móvil `min-h-10`.
- Tras «Ir al compromiso» el foco queda en el campo; tras «Usar la sugerida», también.
- Validación completa con lector de pantalla y teclado: pendiente de prueba manual con tecnologías de asistencia y revisión experta. axe cubre solo reglas automáticas.

## 7. Responsive

| Ancho | Comportamiento |
| --- | --- |
| 1440 | Tarjeta a ancho de contenido (`PageLayout`), dos columnas `sm:grid-cols-2`; pie alineado a la derecha. |
| 390 | Una columna; campos a `w-full`; «Usar la sugerida» bajo el campo, a ancho completo (`w-full`); pie apilado con «Guardar» arriba a `w-full h-11`. Sin scroll horizontal. El campo de fecha usa el selector nativo del dispositivo. |

## 8. Temas

Todos los colores salen de tokens, así que ambos temas cambian solos. Revisar en oscuro: borde de control sobre `bg-card` (3,49), `InlineNotice info` (`info-subtle`/`info-border` oscuros), `Badge outline` y el icono del calendario nativo (`color-scheme: dark` ya lo fija `globals.css` en `.dark`; verificarlo en captura). Capturas obligatorias: 1440 y 390, claro y oscuro, en los estados «precargada sin guardar», «guardada», «error de periodo» y «plan no editable».

## 9. Textos (todo en español)

| Elemento | Texto |
| --- | --- |
| Título | «Datos del plan» |
| Descripción | «Define el periodo y el compromiso antes de enviar el plan a autorización.» |
| Etiqueta | «Fecha de compromiso» |
| Marca | «Sugerida, sin guardar» |
| Botón auxiliar | «Usar la sugerida» |
| Guardar | «Guardar datos del plan» / «Guardando…» |
| Pendiente de la guía | «Falta la fecha de compromiso.» · acción «Ir al compromiso» |
| Éxito | «Datos del plan guardados.» |
