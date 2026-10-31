# BL-024 · Vista de tarjetas por fila en móvil (< 768 px)

Cierra el hallazgo A3 de `auditoria-ux-2026-10.md`. Solo especificación: no hay
código de la app en este cambio. Alcance: Solicitudes, Portafolio, Mi trabajo,
Activos y Documentos. Los demás listados (Capacidad, Catálogos, Auditoría…)
quedan como están.

## 1. Decisión de arquitectura

**Un solo componente nuevo, `DataCardList`, en `components/data-table.tsx`
(o `data-card-list.tsx` si el archivo crece), y un corte por CSS, no por JS.**

Se descartó la prop `renderMobileCard` dentro de `DataView`: `DataView` no
conoce filas (recibe `children` ya armados), así que la prop no tendría de dónde
sacar los datos. La unidad que sí tiene las filas es cada vista (`table.pageRows`).
Por tanto:

- `DataView` **no cambia**. Sigue pintando estados y `children`.
- Cada vista pasa a `DataView` dos hermanos, uno por variante, más la
  paginación compartida:

```tsx
<DataView ...>
  <div className="hidden md:block">
    <Table scrollLabel="Tabla de solicitudes">…sin cambios…</Table>
  </div>
  <DataCardList
    label="Solicitudes"                    // aria-label de la <ul>
    rows={table.pageRows}
    getKey={(r) => r.id}
    sort={{ value: table.sort, onChange: table.setSort, options: SORT_OPTIONS }}
    card={(r) => ({
      title: <CellTitle onOpen={() => openEdit(r)}>{r.title}</CellTitle>,
      subtitle: processName(r.mainProcessId),
      badges: [<StatusBadge … />, <PriorityBadge … />],
      meta: [{ label: 'Registro', value: formatDate(r.registeredAt) }],
      actions: <RowActions rowLabel={r.title} actions={rowActions(r)} menuOnly />,
    })}
  />
  <DataTablePagination … />   {/* una sola, fuera de las dos variantes */}
</DataView>
```

- `DataCardList` ya es `md:hidden`. La vista **no** duplica lógica: reutiliza
  `table.pageRows`, `rowActions(r)`, `CellTitle`, `StatusBadge`, `PriorityBadge`
  y los formateadores que usa la tabla. Solo declara qué campo va en qué ranura.
- `card(row)` devuelve `{ title, subtitle?, badges?, meta?, actions? }`
  (`meta`: `{ label, value: ReactNode }[]`; se omiten los vacíos salvo que la
  vista ponga «—»).
- **Ordenar**: sin cabeceras no hay `SortableTableHead`. `DataCardList` pinta
  arriba (md:hidden) un `Select` «Ordenar por» con las columnas ordenables de la
  tabla y un botón icono «Invertir orden» (ArrowUp/ArrowDown, `aria-label`
  «Orden ascendente/descendente», 44 px). Requiere añadir `setSort(sort|null)`
  a `ClientTable` en `use-client-table.ts` (hoy solo expone `toggleSort`); es el
  único cambio de lógica y es de presentación.

## 2. Anatomía de la tarjeta

Contenedor de lista: `<ul aria-label={label} className="flex flex-col gap-3 p-3 md:hidden">`.
`DataView` ya aporta la superficie (`rounded-xl border bg-card shadow-card`);
las tarjetas internas se leen como filas elevadas por nivel, sin sombra propia
para no apilar sombras:

```
<li class="rounded-lg bg-muted/40 p-3">          ← tarjeta (fila)
  <div class="flex items-start gap-2">
    <div class="min-w-0 flex-1">
      título  (CellTitle, min-h-11, font-medium text-foreground, line-clamp-2)
      subtítulo  (text-meta text-muted-foreground, truncate a 1 línea)
    </div>
    acciones  (RowActions menuOnly, size-11, -mr-1 -mt-1)
  </div>
  <div class="mt-2 flex flex-wrap items-center gap-1.5">  badges  </div>
  <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-meta">
    <div><dt class="text-muted-foreground">Registro</dt>
         <dd class="tabular-nums text-foreground">12 jul 2026</dd></div>
  </dl>
</li>
```

Reglas:

- Tokens permitidos: `bg-card`, `bg-muted/40`, `rounded-xl` (contenedor) /
  `rounded-lg` (fila interna), `shadow-card` (solo contenedor), `text-foreground`,
  `text-muted-foreground`, `text-link` (enlaces; `CellTitle` usa
  `text-foreground` con subrayado en hover, igual que la tabla), `bg-primary-subtle`
  para estado `data-state=selected`. **Prohibido** `text-gray-*`, `bg-blue-*`,
  hex y `text-primary`.
- Variante alternativa si `bg-muted/40` no contrasta sobre `bg-card` en oscuro:
  separar con `divide-y` en lugar de fondos, sin ul con gap. El implementador
  mide y elige una; por defecto la de arriba.
- Un título largo se recorta a 2 líneas (`line-clamp-2 wrap-break-word`) y
  conserva `title=`. Nada desborda en 320 px: `min-w-0` en la columna de texto.
- Badges: siempre `StatusBadge` / `PriorityBadge variant="compact"` (etiqueta +
  icono; no solo color). Máximo 3 por tarjeta; el resto va a `meta`.
- Tipografía: título `text-sm font-medium`; meta `text-meta` (13/18 px).
- `dt` visibles (no solo `sr-only`): el valor suelto («15 jul») no se entiende
  sin su etiqueta.

## 3. Campos por pantalla

| Pantalla | Título | Subtítulo | Badges | Metadatos (dt → dd) | Acciones |
| --- | --- | --- | --- | --- | --- |
| Solicitudes (`/demanda/solicitudes`) | `CellTitle onOpen` → `openEdit` | Proceso (`processName`, «—» si falta) | Estado (`request`), Triage (`triage`, solo si hay decisión), Prioridad (`PriorityBadge compact`) | Registro → `formatDate(registeredAt)` | `RowActions` con `rowActions(r)` |
| Portafolio (`/seguimiento/portafolio`) | `CellTitle href` a la ficha | `rowMeta(item, routes)` (proceso y ruta; ya es el `meta` actual) | Estado (`request`), «Bloqueada» (`blocked`) si aplica, Banda (`PriorityBadge band`) | Avance → `ProgressCell`; Responsable; Objetivo → fecha + `DueBadge` + «Compromiso: …»; Registro. Si `blocked`, motivo en línea (`line-clamp-2`) bajo los badges | Ninguna |
| Mi trabajo (`/mi-trabajo`) | `CellTitle href` a la tarea + `Badge outline «Hito»` si `isMilestone` | `requestTitle` · `phaseName` (una línea, separador « · ») | Estado (`task`) | Vence → `formatDateOnly(endDate)`; Avance → `formatPercent(progress)` | Ninguna |
| Activos (`/activos/catalogo`) | `CellTitle` (sin enlace) | Proceso (`processName`) | Estado (`asset`) | Solicitud → `requestTitle` (2 líneas); Responsable → `ownerName` | `RowActions` con `rowActions(asset)` |
| Documentos (`/activos/documentos`) | `CellTitle` con `meta` actual (motivo del rechazo / «Documentación de cierre») | Activo (`assetName`) | Estado (`document`) | Proceso → del activo (o «—»); Versión → `vN` o «—» | `RowActions` con `rowActions(doc)` |

Los textos y formatos son los mismos que en la tabla: no se reescriben.

## 4. Acciones, estados, foco, accesibilidad

**Acciones.** En tarjeta todas las acciones van en un único menú «…»
(`menuOnly`), nunca dos botones en línea: ahorra ancho en 320 px.
Cambios en `row-actions.tsx`: prop `menuOnly?: boolean` (fuerza `placement:'menu'`
a todas) y, en ese modo, el disparador usa `size-11` (44 × 44 px; hoy
`icon-sm` = 32 px, 40 con `pointer-coarse`). Conserva `aria-label`
«Más acciones para «{rowLabel}»», sin tooltip, `aria-busy` y spinner. Los ítems
del menú ya heredan `DropdownMenuItem`; verificar `min-h-11` en táctil. Sin
acciones (Portafolio, Mi trabajo) no se pinta el hueco.

**Objetivos táctiles ≥ 44 px**: título (`CellTitle` con `min-h-11 inline-flex
items-center` en tarjeta; nueva prop `touch`), «…», botón «Invertir orden»,
`Select` «Ordenar por» (`h-11`), controles de paginación (ya sigue
`pointer-coarse:min-h-10`; en < md subirlos a `h-11`). Separación mínima 8 px
entre objetivos (`gap-2`).

**Cargando.** `DataView` ya muestra `TableSkeleton` (cabecera + filas
horizontales). En < md añadir `CardListSkeleton` (3 tarjetas con 3 `Skeleton`:
línea de título, badges, dos metadatos) y envolver ambos con la misma clase
`hidden md:block` / `md:hidden`. Mantener `aria-busy="true"` y el `role=status`
del `statusText`/`ResultCount`.

**Vacío, sin resultados y error.** Sin cambios: `EmptyState`/`ErrorState` ya
viven dentro de `DataView`, fuera de las dos variantes, y se ven igual en
cualquier ancho. «Reintentar» y «Limpiar filtros» deben medir 44 px en < md.

**Foco y teclado.** Orden natural: Ordenar por → (por tarjeta) título → «…» →
paginación. Foco visible con `focus-visible:outline-2 outline-offset-2
outline-ring` (el de `CellTitle` y `Button`). No hay `tabindex` en `li` ni
tarjeta clicable entera: dos controles anidados romperían el teclado. El menú
«…» devuelve el foco a su disparador al cerrar (Radix). Tras paginar, el foco
queda en el control de paginación como hoy.

**Semántica.** `ul` rotulada (`aria-label` «Solicitudes», etc.) > `li` >
`dl/dt/dd`. Sin `role="table"`/`row`. El número de elementos lo anuncia el
`role=status` existente (`ResultCount`). Se pierde `region` desplazable: no hay
scroll horizontal en esta variante.

**Contraste (WCAG 2.2 AA, medir en claro y oscuro).** Texto 4.5:1 y bordes de
controles 3:1. Pares a medir: `text-muted-foreground` sobre `bg-muted/40`
y sobre `bg-card` (el token es 4.5:1 sobre el lienzo, pero `muted/40` sobre
tarjeta cambia el fondo: **medir**, no asumir); `text-foreground` sobre
`bg-muted/40`; badges sobre su fondo; `text-link` sobre `bg-card`. Si algún
par no llega a 4.5:1, usar la variante `divide-y` sobre `bg-card`. Con
`prefers-reduced-motion` sin transiciones nuevas.

## 5. Corte md y E2E

**Corte**: `md` = 768 px. Tabla `hidden md:block`; tarjetas `md:hidden`.
Nota: el `Toolbar collapseOnMobile` pliega filtros a < `sm` (640 px). Entre 640
y 767 px habrá filtros en línea con tarjetas; es aceptable. Si se quiere
alinear, subir el pliegue del Toolbar a `md` en un ticket aparte (no es parte
de BL-024).

**Una sola variante visible, ambas en el DOM (display:none).** Decisión: CSS
(`hidden`/`md:hidden`) y **no** `useMediaQuery` para montar una sola. Razones:
sin parpadeo ni desajuste de hidratación en SSR, sin hook nuevo, y
`display:none` saca la variante oculta del árbol de accesibilidad y del tab
order (no hay duplicados para lector de pantalla ni para
`getByRole`). Costo: se renderiza dos veces como máximo 100 filas; aceptable.
Reglas para que no haya duplicados reales:

- Ni la tabla ni las tarjetas llevan `id` repetidos. `RowActions` no usa `id`
  en estas cinco vistas; si algún `RowAction.id` existiera, la tarjeta no lo
  pasa.
- Diálogos y estados de las vistas (`openEdit`, confirmaciones) siguen siendo
  uno por vista, fuera de ambas variantes.
- La paginación y el `ResultCount` son únicos.

**E2E actuales (`e2e/`, proyecto único `chromium` = `Desktop Chrome`, 1280 px,
así que las tarjetas están `display:none` y la tabla visible)**:

| Spec | Selectores sobre estas pantallas | Riesgo |
| --- | --- | --- |
| `accessibility.spec.ts` | `getByRole('region', { name: 'Tabla de solicitudes' })` visible | Mantener ese `scrollLabel` exacto. axe corre en 1280 px; el DOM oculto no se audita |
| `shell-navigation.spec.ts` (fixture de 30 solicitudes) | `getByRole('group', { name: 'Filtros de solicitudes' }).getByRole('status')`; `region` «Tabla de solicitudes» → `getByRole('row')`, `columnheader` «Registro, ordenar», `th[aria-sort]`; `getByRole('navigation', { name: 'Paginación de solicitudes' })` | Mantener `Table`, `scrollLabel` y `DataTablePagination id`/`noun`. Los `row` están acotados a la `region`, no ven las `li` |
| `date-display.spec.ts` (`/mi-trabajo`) | `page.getByRole('row').filter({ hasText })` | `getByRole` ignora lo oculto; las `li` no tienen rol `row`. No poner `role="row"` en tarjetas |
| `catalogs.spec.ts`, `plan-inline-status.spec.ts` | `getByRole('row')` en otras pantallas (catálogos, plan) | No se tocan |
| `jwt-session.spec.ts`, `web-lib.spec.ts` | Solo `goto` y encabezados `h1` de las cinco rutas | Sin riesgo |

No se usan `getByText` ni `locator('tr')` globales sobre estas tablas, que sí
verían el contenido oculto (`getByText` no filtra por visibilidad en el conteo
estricto). Regla para specs nuevos: acotar siempre a `getByRole` o a
`region`/`list` con nombre.

**Pruebas nuevas (las escribe quien implemente)**
1. E2E móvil (`test.use({ viewport: { width: 375, height: 800 } })`) sobre
   Solicitudes con el fixture de 30: `getByRole('list', { name: 'Solicitudes' })`
   visible con 25 `listitem`; la `region` «Tabla de solicitudes» **no** visible;
   sin scroll horizontal (`scrollWidth <= clientWidth`); abrir «Más acciones
   para «…»» con teclado; ordenar con «Ordenar por».
2. E2E a 1280 px: `list` oculta y `region` visible (regresión del corte).
3. axe en 375 px y en ambos temas sobre las cinco pantallas.
4. Jest/unidad de `DataCardList`: omite metas vacías, una `li` por fila,
   `aria-label` de la lista.
5. Medir contrastes en ambos temas y adjuntar valores en el PR (§25).

## 6. Orden de implementación sugerido

1. `use-client-table.ts`: añadir `setSort`.
2. `row-actions.tsx`: `menuOnly` + `size-11`; `CellTitle`: `touch`.
3. `DataCardList` + `CardListSkeleton`, con prueba unitaria.
4. Solicitudes primero (usa todo: acciones, tres badges); revisar con
   `disenador`/`revisor`; luego Activos, Documentos, Mi trabajo y Portafolio.
5. E2E móvil + axe, y actualizar `auditoria-ux-2026-10.md` (A3 → hecho) y
   `docs/BACKLOG.md` (BL-024).

## Supuestos y puntos abiertos

- Se asume 375 px como ancho de referencia y 320 px como mínimo.
- `bg-muted/40` para la fila interna es una propuesta pendiente de medición de
  contraste; la alternativa `divide-y` está especificada.
- El id BL-024 viene de la tabla «Pendiente» de la auditoría; no se verificó su
  entrada en `docs/BACKLOG.md`.
