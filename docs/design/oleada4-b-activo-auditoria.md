# Oleada 4 · PR B «ficha del activo y Auditoría investigable» · Especificación visual

Solo especificación: no hay código de la aplicación en este cambio. Fuentes:
`.kiro/steering/25-marca-gibo.md`, `20-frontend-nextjs.md`, plan de la oleada 4
(secciones «Ficha del activo» y «Auditoría que permite investigar»), FEAT-002 y el
código actual de `activos-view.tsx`, `[id]/historial/historial-view.tsx`,
`gobierno/auditoria/auditoria-view.tsx` y los componentes `PageHeader`,
`StatusBadge`, `IdChip`, `Toolbar`, `Field`, `DataView`, `DataCardList`,
`ErrorState`, `EmptyState`, `ui/tabs`.

Es un **anexo a patrones existentes**. No se crea ningún token, componente base
ni dependencia nuevos. Las clases usan solo tokens semánticos.

## 0. Contrastes medidos

Valores tomados de `globals.css` (OKLCH). La luminancia relativa se calculó a
partir de L de OKLCH (Y ≈ L³ para tonos casi neutros, error menor de 3 %) y el
ratio con (Y1 + 0,05) / (Y2 + 0,05). Las cifras de marca ya medidas en
`25-marca-gibo.md` se citan tal cual. La revisión debe confirmar los ratios con
una herramienta (p. ej. el medidor de contraste de DevTools) sobre la
implementación.

| Par | Tema | Ratio | Mínimo |
| --- | --- | --- | --- |
| `text-foreground` sobre `bg-card` | claro | 14,8 : 1 | 4,5 |
| `text-foreground` sobre `bg-background` | claro | 12,9 : 1 | 4,5 |
| `text-muted-foreground` sobre `bg-card` | claro | ≈ 7,1 : 1 | 4,5 |
| `text-muted-foreground` sobre `bg-background` | claro | ≈ 6,2 : 1 | 4,5 |
| `text-muted-foreground` sobre `bg-card` | oscuro | ≈ 7,4 : 1 | 4,5 |
| `text-link` sobre lienzo | claro | 5,66 : 1 (marca) | 4,5 |
| `text-link` sobre card oscuro | oscuro | 8,15 : 1 (marca) | 4,5 |
| `text-primary-foreground` sobre `bg-primary` | ambos | 4,84 : 1 (marca) | 4,5 |
| `text-foreground` sobre `bg-primary-subtle` (chips de filtro) | claro | ≈ 12 : 1 | 4,5 |
| `text-foreground` sobre `bg-primary-subtle` | oscuro | ≈ 13 : 1 | 4,5 |

Regla derivada: **no se pone `text-link` sobre `bg-primary-subtle`** (≈ 4,8 : 1,
sin margen). Los chips de filtro activo usan `text-foreground`.

---

# Parte 1 · Ficha del activo (`/activos/catalogo/[id]`)

## 1. Objetivo y acción principal

Un solo lugar para **entender un activo y llegar a lo que lo toca**: qué es,
quién lo posee, en qué estado está, qué solicitudes lo usan y qué documentos
tiene. La acción principal de lectura es cambiar de pestaña; la de gestión
(editar, cambiar estado) ya existe y se reutiliza sin cambiar reglas (D8 intacta).
«Ver auditoría» es secundaria.

## 2. Estructura (orden de bloques)

1. `PageLayout`.
2. `PageHeader` con migas, título, `meta` y `actions`.
3. Tarjeta de pestañas (`Tabs`): **Resumen** (por defecto), **Solicitudes**,
   **Documentos**.
4. Contenido de la pestaña activa.

Jerarquía: el foco es el nombre del activo y su estado. Las acciones de gestión
son `outline`; ninguna usa `bg-primary` (la ficha es de lectura). «Ver auditoría»
es `ghost`, la de menos peso.

### 2.1 Cabecera

```tsx
<PageHeader
  breadcrumbs={[{ label: 'Activos', href: '/activos/catalogo' }, { label: 'Catálogo', href: '/activos/catalogo' }]}
  title={asset.name}
  description={tipo y proceso en una línea: «Documento de proceso · Gestión de demanda»}
  meta={<>
    <IdChip code={asset.code} />               {/* ACT-0007, forma completa */}
    <StatusBadge kind="asset" value={asset.status} />
    <span className="text-meta text-muted-foreground">Propietario: {ownerName}</span>
  </>}
  actions={<>…acciones…</>}
/>
```

- Las migas muestran solo ancestros; la página actual es el `<h1>`. Un único
  `<h1>`: el nombre del activo. Si el nombre es largo, `wrap-break-word` (ya lo
  trae `PageHeader`); no se trunca.
- Estado con `StatusBadge` (icono + etiqueta, nunca solo color). Usar el `kind`
  que ya emplea `activos-view.tsx` para el estado del activo.
- Propietario sin nombre disponible: «Sin propietario asignado» en
  `text-muted-foreground`. Nunca se muestra un UUID.
- Proceso fuera de alcance: «Proceso fuera de tu alcance» (misma frase que el
  historial actual).

### 2.2 Acciones de la cabecera (orden, de izquierda a derecha)

| Acción | Clases / variante | Visible si |
| --- | --- | --- |
| Editar | `<Button variant="outline" size="sm">` con icono `Pencil` | El actor puede editar hoy en `activos-view.tsx` (misma condición, sin cambiarla) |
| Cambiar estado | `<Button variant="outline" size="sm">` con icono `RefreshCw` | Igual: misma condición que el catálogo |
| Ver auditoría | `<Link className={buttonVariants({ variant: 'ghost', size: 'sm' })}>` con icono `History`, `href="/gobierno/auditoria?objectCode=ACT-0007"` | `useActor().allowedModules` incluye `audit` |

- Editar y Cambiar estado abren los **diálogos existentes**
  (`activo-form-dialog.tsx` y el de estado de `activos-view.tsx`); al guardar con
  éxito se recarga la ficha y se anuncia en la región `role="status"` existente
  del patrón de la vista («Activo actualizado.»).
- «Ver auditoría» es un enlace (navega), no un botón. Texto visible «Ver
  auditoría»; el icono es `aria-hidden`.
- Si el actor no tiene el módulo de auditoría, el enlace **no se renderiza**
  (no se deshabilita: un deshabilitado sin explicación no ayuda).
- Móvil: las acciones bajan debajo de la descripción (comportamiento de
  `PageHeader`); cada una `max-md:min-h-11`.

## 3. Pestañas

Se usa `ui/tabs` (Radix: `role="tablist"`, flechas, Inicio/Fin).

```tsx
<Tabs value={tab} onValueChange={changeTab} className="flex min-w-0 flex-col gap-4">
  <TabsList aria-label="Secciones del activo" className="overflow-x-auto">
    <TabsTrigger value="resumen">Resumen</TabsTrigger>
    <TabsTrigger value="solicitudes">Solicitudes{count}</TabsTrigger>
    <TabsTrigger value="documentos">Documentos{count}</TabsTrigger>
  </TabsList>
  <TabsContent value="resumen">…</TabsContent>
  …
</Tabs>
```

- `count` = ` (N)` con `requestsCount` y `documentsCount` de `GET /assets/{id}`
  (disponibles antes de abrir la pestaña). Si aún no cargó: sin paréntesis.
- Pestaña activa en la URL: `?tab=solicitudes|documentos` (`resumen` es el valor
  por defecto y no se escribe). `/activos/catalogo/[id]/historial` redirige a
  `/activos/catalogo/[id]?tab=solicitudes`. Cambiar de pestaña usa
  `router.replace` (sin añadir entradas al historial del navegador).
- Un `tab` desconocido en la URL cae en Resumen.
- Móvil (< 640 px): `TabsList` con `overflow-x-auto`; la pestaña activa se lleva
  a la vista con `scrollIntoView({ inline: 'nearest', block: 'nearest' })`, como
  en `reuniones-view.tsx`. Cada `TabsTrigger` mantiene alto táctil ≥ 44 px
  (`max-md:min-h-11`).
- Los datos de Solicitudes y Documentos se piden al abrir la pestaña por primera
  vez y se conservan al volver. El Resumen se carga con la página.

## 4. Pestaña Resumen

Una tarjeta con una lista de definiciones (`<dl>`), sin bordes marcados.

```tsx
<section aria-labelledby="ficha-resumen" className="rounded-xl bg-card p-5 shadow-card">
  <h2 id="ficha-resumen" className="sr-only">Resumen del activo</h2>
  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
    <div className="flex flex-col gap-1">
      <dt className="text-meta font-medium text-muted-foreground">Propietario</dt>
      <dd className="text-sm text-foreground wrap-break-word">…</dd>
    </div>
    …
    <div className="flex flex-col gap-1 sm:col-span-2"> {/* descripción */}
      <dt …>Descripción</dt>
      <dd className="max-w-prose whitespace-pre-line text-sm text-foreground wrap-break-word">…</dd>
    </div>
  </dl>
</section>
```

Campos, en este orden (los vacíos muestran «—» en `text-muted-foreground`, nunca
se ocultan, para que la ficha tenga siempre la misma forma):

1. Propietario.
2. Proceso.
3. Estado (repetido como `StatusBadge`; la cabecera es la fuente visual, aquí
   ayuda al lector de pantalla que recorre el `<dl>`).
4. Solicitud de origen: `IdChip` `PRY-` como enlace a
   `/demanda/solicitudes/<id>`; sin origen: «—».
5. Referencia de documentación: texto; si es una URL `https://`, enlace
   `text-link underline underline-offset-4` con `rel="noopener noreferrer"` y
   `target="_blank"` más texto `sr-only` «(se abre en una pestaña nueva)».
6. Descripción (ancho completo).
7. Dependencias (ancho completo): lista `<ul className="flex flex-wrap gap-2">`
   de enlaces tipo chip a la ficha de cada activo del que depende
   (`IdChip` + nombre, `text-link`). Sin dependencias: «Sin dependencias
   registradas.» en `text-muted-foreground`.

Pie de la tarjeta (solo si hay datos): `text-meta text-muted-foreground`,
«Registrado el {fecha}» con `formatDate`.

## 5. Pestaña Solicitudes

Reutiliza la tabla y la lógica de `historial-view.tsx` (orden por título, fecha y
estado; fecha de registro descendente por defecto), **sin** su `PageHeader` ni
su enlace «Volver al catálogo» (la cabecera de la ficha los sustituye). Se
extrae el bloque de tabla; no se duplica.

- Columnas: Solicitud (`CellTitle` con `IdChip` `PRY-` y título enlazado, como
  hoy), Proceso, Estado (`StatusBadge`), Registrada.
- Enlace de fila: el título, `text-link underline-offset-4 hover:underline`.
- `caption` de la tabla (visible para lectores): «Solicitudes que usan este
  activo».
- Móvil (< 768 px): `DataCardList` con código, título, badge de estado y meta
  «Proceso» y «Registrada» (`wide`), igual que el catálogo.
- Pie de la pestaña: `ResultCount` («3 solicitudes»).

Estados:

| Estado | Presentación |
| --- | --- |
| Cargando | Dentro de la pestaña: `aria-busy="true"` con `Skeleton` (`h-10 rounded-lg` y `h-56 rounded-xl`); la cabecera y las demás pestañas siguen usables |
| Vacío | `EmptyState` icono `FileClock`, título «Ninguna solicitud usa este activo todavía.», descripción «Aparecerán aquí cuando una solicitud lo elija como base.» (sin botón: crear solicitudes no es acción de esta pantalla) |
| Error | `ErrorState` con «No fue posible cargar las solicitudes del activo.» y «Reintentar» (reintenta solo esta pestaña) |

## 6. Pestaña Documentos

Tabla ligera de solo lectura con `GET /documents?assetId=`.

- Columnas: Documento (`IdChip` `DOC-` + título enlazado a
  `/activos/documentos?…` en la forma que use hoy la vista de documentos para
  abrir uno; el desarrollador reutiliza esa ruta, no inventa otra), Tipo,
  Estado (`StatusBadge` de documento), Actualizado (`formatDate`).
- Móvil: `DataCardList` con la misma información.
- Sin paginación visible mientras el servidor devuelva una página completa; si el
  contrato devuelve `X-Truncated`, mostrar `InlineNotice tone="info"` «Se
  muestran los primeros {n} documentos. Abre Documentos para ver el resto.» con
  enlace a `/activos/documentos`.
- Si el actor **no** tiene el módulo de documentos: no se muestra la pestaña
  (no se deja una pestaña que solo dice «sin acceso»).

| Estado | Presentación |
| --- | --- |
| Cargando | Igual que Solicitudes |
| Vacío | `EmptyState` icono `FileText`, «Este activo aún no tiene documentos.», descripción «Los documentos vinculados a este activo aparecerán aquí.» |
| Error | `ErrorState` «No fue posible cargar los documentos del activo.» + «Reintentar» |

## 7. Estados de la página completa

| Estado | Presentación |
| --- | --- |
| Cargando (carga inicial) | `PageLayout` con `aria-busy="true"`: `Skeleton` `h-8 w-64` (título), `h-5 w-48` (meta) y `h-10` (pestañas) y `h-56 rounded-xl` (contenido). Sin mover el diseño al llegar los datos |
| Error | `ErrorState` dentro de `rounded-xl bg-card shadow-card`: «No fue posible cargar el activo.» con «Reintentar» y un enlace «Volver al catálogo» |
| No existe o fuera de alcance (404) | `EmptyState` «No encontramos este activo.» descripción «Puede que no exista o que no esté dentro de tu alcance.» y enlace «Volver al catálogo». El mensaje es el mismo en ambos casos |
| Éxito tras editar o cambiar estado | Se recarga la ficha y se anuncia por `role="status"` («Activo actualizado.» / «Estado del activo actualizado.»); el foco vuelve al botón que abrió el diálogo |
| Deshabilitado | Mientras se guarda un diálogo, sus botones usan el estado de envío existente. La ficha no tiene controles propios deshabilitados |

## 8. Enlaces desde el catálogo (`activos-view.tsx`)

- El **nombre** del activo pasa a ser enlace a `/activos/catalogo/<id>`:
  `text-link font-medium underline-offset-4 hover:underline` con foco
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.
- El `IdChip` del activo sigue siendo el chip copiable (no se envuelve en el
  enlace: copiar y navegar son acciones distintas y anidar interactivos rompe
  la accesibilidad). El nombre es el único destino de navegación de la celda.
- Tarjetas móviles: el título es el enlace; área táctil ≥ 44 px
  (`inline-flex min-h-11 items-center`).
- La acción de fila «Historial» (si existe) apunta a
  `/activos/catalogo/<id>?tab=solicitudes`.

## 9. Accesibilidad de la ficha

- Un `<h1>` (nombre) y `<h2>` por sección. Las pestañas son `role="tab"` con
  `aria-controls`; el contenido, `role="tabpanel"` (Radix).
- Orden de tabulación: migas → acciones de cabecera (Editar, Cambiar estado, Ver
  auditoría) → lista de pestañas (una sola parada; flechas entre pestañas) →
  contenido del panel activo.
- Cambiar de pestaña **no** mueve el foco fuera del tablist; el panel recibe el
  foco solo con Tab.
- El estado y el propietario no dependen del color: el `StatusBadge` lleva icono
  y etiqueta; el propietario es texto.
- Enlaces en `text-link` (5,66 : 1 / 8,15 : 1) con subrayado al foco y al
  pasar el ratón.
- Anillo de foco: token `--ring` en todos los controles.
- Animación: ninguna propia. Los esqueletos usan el pulso del `Skeleton`
  existente, que ya respeta `motion-reduce`.

## 10. Responsive de la ficha

| Ancho | Comportamiento |
| --- | --- |
| < 640 px | Cabecera apilada; acciones en fila que puede envolver; pestañas con scroll horizontal; Resumen en una columna; Solicitudes y Documentos como tarjetas |
| 640–767 px | Resumen en dos columnas; resto igual que móvil |
| 768–1023 px | Tablas de Solicitudes y Documentos (columna Proceso/Tipo puede ocultarse con `hidden lg:table-cell` si no cabe; el contenido sigue disponible al abrir la fila) |
| ≥ 1024 px | Todas las columnas; `PageLayout` con su ancho máximo actual |

---

# Parte 2 · Auditoría que permite investigar (`/gobierno/auditoria`)

## 11. Objetivo y acción principal

Pasar de «ver cambios» a **investigar**: llegar ya filtrado por el código de un
objeto (desde una ficha), acotar por **quién** (actor), **cuándo** (fechas) y
**dónde** (proceso), y leer el nombre de quien actuó, no un identificador. La
acción principal sigue siendo encontrar un evento y abrir «Ver cambio».

## 12. Estructura (orden de bloques)

1. `PageHeader` (sin cambios).
2. `Toolbar` de filtros, ahora en **dos filas lógicas** (la barra ya envuelve
   sola con `flex-wrap`): fila 1 existente (Objeto, Acción, Código del objeto);
   fila 2 nueva (Actor, Desde, Hasta, Proceso).
3. Línea de **filtros activos** (chips), solo si hay alguno, con «Limpiar
   filtros» al final.
4. `DataView` con tabla (≥ 768 px) o tarjetas (< 768 px) y paginación de
   servidor, sin cambios de estructura.

Jerarquía: la tabla sigue siendo el foco. Los filtros nuevos usan los mismos
controles que los actuales (mismas alturas y bordes). Los chips son discretos.

## 13. Filtros nuevos

Todos con `Field` (label visible, ayuda y error junto al campo) dentro del
`Toolbar`, con `className="w-full sm:w-auto sm:self-start"` como los actuales.

### 13.1 Actor

```tsx
<Field id="aud-filtro-actor" label="Actor" className="w-full sm:w-auto sm:self-start">
  {(control) => (
    <Select value={actorFilter} onValueChange={handleActorChange}>
      <SelectTrigger {...control} className="w-full sm:w-56"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos</SelectItem>
        {actors.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )}
</Field>
```

- Opciones: la lista de personas del alcance que ya se carga
  (`listCoordinationPeople`), ordenada alfabéticamente. «Sistema» no es opción
  (el filtro por actor es por usuario).
- Si la URL trae `?actorUserId=` de una persona fuera de la lista, el
  `SelectTrigger` muestra «Persona fuera de tu alcance» y el filtro sigue
  aplicado (el servidor decide). No se muestra el UUID.
- Con más de 15 personas el desarrollador puede reutilizar el selector con
  búsqueda que ya use el portal (`filtros-seleccion-multiple.md`); no se crea
  uno nuevo.

### 13.2 Fechas (Desde / Hasta)

```tsx
<Field id="aud-filtro-desde" label="Desde" error={rangeError}
       help="Incluye todo el día." className="w-full sm:w-auto sm:self-start">
  {(control) => <Input {...control} type="date" value={from} max={to || today}
                        onChange={…} className="w-full sm:w-44" />}
</Field>
<Field id="aud-filtro-hasta" label="Hasta" …>
  {(control) => <Input {...control} type="date" value={to} min={from || undefined}
                        max={today} className="w-full sm:w-44" />}
</Field>
```

- Se usa `<input type="date">` nativo (ya hay estilos globales para
  `input[type='date']` en `globals.css`); formato enviado `YYYY-MM-DD`.
- **Se aplica al cambiar el valor completo** (no por tecla). Si el navegador
  entrega un valor vacío por fecha incompleta, no se consulta.
- Validación en el cliente, solo para guiar (la regla vive en la API):
  - `Hasta` anterior a `Desde`: error junto a «Hasta»:
    «La fecha final no puede ser anterior a la inicial.» No se consulta.
  - Rango mayor de 366 días: error junto a «Hasta»: «El rango máximo es de un
    año. Acota las fechas.» No se consulta.
  - Si la API responde 400 por estas reglas, se muestra el mensaje del servidor
    en el mismo lugar.
- Cada campo de fecha puede quedar solo (solo «Desde» o solo «Hasta»).
- Móvil: `type="date"` abre el selector del sistema; alto `max-md:h-11`.

### 13.3 Proceso

`Select` con «Todos» y los procesos de `listProcesses()` (`nombre (código)`,
igual que la columna Proceso). `className="w-full sm:w-56"`. Un `processId` de la
URL fuera de la lista se muestra como «Proceso fuera de tu alcance».

### 13.4 Reinicio de página

Todo cambio de filtro vuelve a la página 1 y descarta la respuesta anterior
(mecanismo `requestRef` actual).

## 14. Filtros desde la URL (enlaces «Ver auditoría»)

- Parámetros leídos al montar: `objectCode`, `objectType`, `actorUserId`.
  Un valor inválido (código con formato incorrecto, tipo desconocido, UUID mal
  formado) se **ignora** sin error visible y se carga la lista sin ese filtro.
- Con `objectCode` válido, el campo «Código del objeto» aparece ya relleno y
  aplicado; el contador y los chips lo reflejan.
- Los cambios posteriores en los filtros **no** reescriben la URL (se mantiene
  la decisión de oleada 3: el estado no vive en la URL salvo la entrada). «Limpiar
  filtros» sí quita los parámetros de entrada con `router.replace('/gobierno/auditoria')`
  para que recargar no los restituya.
- Foco al llegar con filtros desde un enlace: en el `<h1>`; el contador anuncia el
  resultado por la región `aria-live="polite"` existente de `ResultCount`.

## 15. Chips de filtros activos

Fila bajo la barra, solo con al menos un filtro activo. Contiene un chip por
filtro y, al final, el botón «Limpiar filtros» (que se **mueve** aquí desde el
extremo de la `Toolbar`; si hay filtros, solo existe uno de los dos).

```tsx
<ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-2">
  <li>
    <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary-subtle py-1 pl-3 pr-1 text-meta font-medium text-foreground">
      <span className="text-muted-foreground">Actor:</span> Ana Pérez
      <button type="button" aria-label="Quitar filtro Actor: Ana Pérez"
        className="inline-flex size-6 items-center justify-center rounded-full hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring max-md:size-11">
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  </li>
  …
</ul>
```

- Texto: `text-foreground` sobre `bg-primary-subtle` (≈ 12 : 1 claro, ≈ 13 : 1
  oscuro). La etiqueta del campo («Actor:») va en `text-muted-foreground` sobre
  `primary-subtle`; para no depender de un par sin medir, el desarrollador la
  deja en `text-foreground` con `font-normal` si la medición en revisión da menos
  de 4,5 : 1.
- Cada chip nombra el filtro y su valor, en lenguaje de usuario:
  «Objeto: Solicitud», «Acción: Creación», «Código: PRY-0012»,
  «Actor: Ana Pérez», «Desde: 01/03/2026», «Hasta: 31/03/2026»,
  «Proceso: Gestión de demanda (GDE)». Fechas con `formatDate`.
- Quitar un chip aplica ese filtro como «Todos/vacío», vuelve a la página 1 y
  mueve el foco al **campo** del filtro quitado (si «Limpiar filtros» desaparece
  por quitar el último, el foco va al filtro Objeto, como hoy).
- Orden fijo: Objeto, Acción, Código, Actor, Desde, Hasta, Proceso.
- La `X` es un `button` real; el chip entero no es clicable (un solo control por
  chip). Área táctil de la `X` ≥ 44 px en móvil.
- Con muchos chips la fila envuelve (`flex-wrap`); no hay scroll horizontal.

## 16. Nombre del actor

- Tabla y tarjetas muestran `event.actorName`. Reglas:
  1. `actorUserId === null` → «Sistema» (texto normal).
  2. `actorName` presente → el nombre.
  3. Actor con id pero sin nombre (eliminado o fuera de alcance) →
     «Persona no disponible» en `text-muted-foreground`, con
     `title="Ya no figura en el portal o está fuera de tu alcance"`. **Se retira
     el UUID abreviado de la vista** (`slice(0, 8)…`).
- El nombre del actor en la celda es **texto**, no enlace. Para filtrar por
  actor se usa el selector o el chip (evita otra acción dentro de la celda).
- `VerCambioDialog` recibe `actorName` del evento (ya no lo resuelve con
  `personById`); el resto del diálogo no cambia.

## 17. Estados de la Auditoría

| Estado | Presentación |
| --- | --- |
| Cargando | `DataView` `loading` actual (8 filas, 6 columnas). Los filtros siguen activos para no perder lo elegido |
| Vacío sin filtros | Igual: «No hay eventos visibles.» |
| Sin resultados con filtros | `DataView` `no-results`. Título según el filtro más específico: con código, «No hay eventos para {código} dentro de tu alcance.»; con otros, «No hay eventos con estos filtros dentro de tu alcance.» Descripción: «Amplía las fechas, quita algún filtro o limpia todos para ver más.» y botón «Limpiar filtros» |
| Error de carga | `ErrorState` actual con «Reintentar» (conserva los filtros) |
| Error 400 por fechas | No se muestra `ErrorState`: se conserva la tabla anterior y el mensaje aparece junto a «Hasta» (13.2) |
| Éxito | Contador «N eventos» actualizado |
| Deshabilitado | Los filtros **no** se deshabilitan durante la recarga. Solo «Hasta» tiene `min` y «Desde» `max` para guiar |

## 18. Enlaces «Ver auditoría» desde otras vistas

Tres lugares: ficha de solicitud (`demanda/solicitudes/[id]/ficha-view.tsx`),
ficha del activo (sección 2.2) y documento (`activos/documentos/documentos-view.tsx`).

- Aspecto único: `buttonVariants({ variant: 'ghost', size: 'sm' })`, icono
  `History` `aria-hidden`, texto «Ver auditoría».
- Destino: `/gobierno/auditoria?objectCode=<código>` (PRY-, ACT- o DOC-).
- Visible solo si `useActor().allowedModules` incluye `audit`. Sin acceso: no se
  renderiza.
- **Ficha de solicitud**: en `actions` de `PageHeader`, antes de las acciones
  existentes de gestión y después de las de lectura; no compite con la acción
  principal de la solicitud.
- **Documento**: acción de fila/tarjeta en el menú de acciones de la fila
  existente (`RowActionsCell`) y en la cabecera del diálogo o detalle del
  documento si lo hay; mismo texto y destino. En tarjetas móviles va en el
  `footer` como botón `outline` de alto ≥ 44 px.
- El enlace abre en la misma pestaña (es navegación interna).
- Nombre accesible cuando el contexto no lo aclara (filas de tabla):
  `aria-label="Ver auditoría de {código}"`. En la cabecera de una ficha basta el
  texto visible.

## 19. Accesibilidad de la Auditoría

- Todos los filtros nuevos tienen `<label>` visible (vía `Field`); el error de
  fechas se enlaza con `aria-describedby` y `aria-invalid="true"` (lo hace `Field`).
- Orden de tabulación: Objeto → Acción → Código → Actor → Desde → Hasta →
  Proceso → chips (cada «Quitar») → «Limpiar filtros» → tabla (botones «Ver
  cambio») → paginación.
- La región de resultados anuncia el cambio de contador con `aria-live="polite"`
  (ya existe en `ResultCount`). Los chips no se anuncian por separado.
- Los chips no transmiten nada solo por color: llevan el nombre del filtro y el
  valor en texto.
- Contrastes: ver sección 0. Bordes de controles heredan el 3 : 1 ya medido en
  `globals.css`.
- Sin animación nueva.

## 20. Responsive de la Auditoría

| Ancho | Comportamiento |
| --- | --- |
| < 640 px | Cada filtro ocupa una fila (`w-full`); fechas pueden compartir fila en dos columnas con `grid grid-cols-2 gap-3` solo si caben (≥ 360 px), si no una por fila; chips envueltos; tarjetas en lugar de tabla; `X` de chip de 44 px |
| 640–1023 px | Filtros en línea con envoltura; tabla desde 768 px |
| ≥ 1024 px | Dos filas de filtros según la sección 12 |

---

# Parte 3 · Pruebas manuales y límites de la validación

- Esta especificación define contrastes calculados, roles y orden de
  tabulación. **No sustituye** la prueba manual con lector de pantalla (NVDA y
  VoiceOver), con teclado solo, con zoom al 200 % y 400 %, y con
  `prefers-reduced-motion` ni la revisión experta de accesibilidad.
- Revisión sugerida antes de fusionar: recorrer con teclado la ficha del activo
  (pestañas con flechas, acciones, enlaces) y la Auditoría con los siete filtros
  y los chips.
- Datos para e2e: los selectores se deben anclar a roles y nombres accesibles
  (`getByRole('tab', { name: 'Solicitudes' })`, `getByRole('link', { name: 'Ver
  auditoría' })`, `getByLabel('Actor')`, `getByLabel('Desde')`,
  `getByRole('button', { name: /Quitar filtro Actor/ })`).
