# Oleada 3 · PR-B «listados paginados» · Especificación visual

Solo especificación: no hay código de la aplicación en este cambio. Fuentes:
`.kiro/steering/25-marca-gibo.md`, plan de la oleada 3 (sección PR-B, decisión
D-pag), `docs/plan-mejora/README.md` (fila «Listados», BL-039),
`tarjetas-moviles-bl-024.md` y el código actual de `components/data-table.tsx`,
`data-view.tsx`, `error-state.tsx`.

Es un **anexo a patrones ya existentes** (`DataView`, `DataTablePagination`,
`ResultCount`, `DataCardList`, `IdChip`, `InlineNotice`, `ErrorState`). No se
crea ninguna familia visual nueva ni ningún token nuevo.

Revisión previa (`design-review-b.json`, veredicto «CHANGES_REQUESTED»):
corregidos en esta versión los dos bloqueantes y las dos notas.

| Hallazgo | Corrección | Dónde |
| --- | --- | --- |
| B-1 contraste estimado y `opacity-60` | Ratios calculados desde los valores OKLCH de `globals.css` (conversión OKLab → sRGB lineal → luminancia WCAG) para ambos temas. La recarga **no atenúa texto ni fondo**: no hay `opacity-*`, así que el contraste del texto es el medido en todo momento | §5.4, §9 |
| B-2 foco contradictorio | Durante la carga los botones de paginación usan `aria-disabled="true"` (no `disabled`) y se ignora la activación. `disabled` real solo en el límite natural, y entonces el foco pasa al otro botón o al contenedor. Regla única en §5.2, §5.4 y §10 | §5.2, §5.4, §10 |
| Nota §13 `showingPrefix` | Decidido: prop `showingPrefix?: boolean` (por defecto `false`); las cuatro vistas de este PR pasan `true`. No cambia el texto de otras vistas | §5.2, §13 |
| Nota §8.2 tres presentaciones | Decidido: la de la tabla de columnas (código del proceso en segunda línea) | §8 |

## 1. Objetivo y acción principal

Listados de **Solicitudes, Portafolio, Activos y Documentos** (y Auditoría en
lo referente a etiqueta y código) que filtran, buscan, ordenan y paginan en el
servidor. La acción principal sigue siendo **encontrar una fila y abrirla**; la
paginación y los filtros no deben competir con la tabla.

Decisión del plan (D-pag) que condiciona la interfaz:

- Paginación por **página y tamaño** (`page`, `pageSize`), no cursor ni «Cargar
  más». El usuario puede saltar a otra página y ver «Página N de M».
- El total llega en cabecera `X-Total-Count` y es el total **tras alcance y
  filtros**. Si falta la cabecera, la web usa `filas.length`.
- Sin `pageSize` el servidor devuelve hasta 1000 filas y marca `X-Truncated`.
  Solo las vistas que piden todo (lookups) pueden toparse con eso. Las cuatro
  vistas de este PR siempre piden `pageSize`, así que el aviso de truncado es
  una red de seguridad y no un estado habitual.
- **«Cargar más» no se usa** en estas cuatro vistas. Se deja anotado para BL-081
  solo si un listado futuro es de tipo línea de tiempo.

## 2. Estructura (orden de bloques, igual en las cuatro vistas)

1. `PageHeader` (sin cambios).
2. Contenedor `DataView` (tarjeta flotante, sin cambios).
3. **Toolbar**: búsqueda `q` a la izquierda, filtros a continuación, contador
   `ResultCount` a la derecha (`end`).
4. Línea de **filtros activos** (chips) solo si hay alguno. Incluye «Limpiar
   filtros».
5. Aviso de truncado (solo si `X-Truncated: true`).
6. Tabla (≥ 768 px) o `DataCardList` (< 768 px), con el estado correspondiente.
7. **Paginación del servidor**, siempre al pie y fuera de las dos variantes.

Jerarquía: el foco es la tabla. Búsqueda es el control más ancho de la barra;
los filtros son botones `outline`; la paginación es texto `text-meta` con
botones `outline` pequeños. Nada usa `bg-primary` salvo la acción primaria de
página («Nueva solicitud», etc.), que no cambia.

## 3. Búsqueda `q`

Estructura (un solo campo, no hay botón «Buscar»; se busca al escribir, con
debounce de 300 ms):

```tsx
<div role="search" className="relative w-full min-w-0 sm:max-w-xs lg:max-w-sm">
  <Label htmlFor="solicitudes-q" className="sr-only">Buscar solicitudes</Label>
  <Search aria-hidden="true"
    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  <Input id="solicitudes-q" type="search" inputMode="search" maxLength={100}
    autoComplete="off" enterKeyHint="search"
    placeholder="Buscar por código, título o solicitante"
    aria-describedby="solicitudes-q-ayuda"
    className="h-9 pl-9 pr-10 max-md:h-11" />
  <Button type="button" variant="ghost" size="icon-sm"
    aria-label="Borrar búsqueda"
    className="absolute right-1 top-1/2 -translate-y-1/2 max-md:size-11 …solo si hay texto" >
    <X aria-hidden="true" />
  </Button>
  <p id="solicitudes-q-ayuda" className="sr-only">
    La lista se actualiza mientras escribes. Máximo 100 caracteres.
  </p>
</div>
```

Clases por estado:

| Estado | Clases / comportamiento |
| --- | --- |
| Reposo | Las del `Input` del sistema (`border-input`, `bg-card`). Borde de control 3:1, ya medido en `globals.css` |
| Foco | `focus-visible:ring-2 focus-visible:ring-ring` (token `--ring`) |
| Con texto | Aparece el botón «Borrar búsqueda»; al pulsarlo se limpia, la página vuelve a 1 y el foco regresa al campo |
| Buscando (debounce o petición) | Sin spinner en el campo; el cambio se comunica en el contador (sección 5) |
| Deshabilitado | Solo mientras la carga **inicial** (`state === 'loading'`): `disabled:opacity-50`. En recargas el campo **sigue activo** para no perder lo escrito |
| Texto de 1 carácter | Se busca igual; no hay mínimo |
| `Escape` | Limpia el campo si tiene texto |

Placeholders por vista (el placeholder no sustituye al label):

| Vista | Label sr-only | Placeholder |
| --- | --- | --- |
| Solicitudes | Buscar solicitudes | Buscar por código, título o solicitante |
| Portafolio | Buscar iniciativas | Buscar por código o título |
| Activos | Buscar activos | Buscar por nombre |
| Documentos | Buscar documentos | Buscar por título |

Los campos de `q` salen del plan: Solicitudes `code`, `title`, `requesterName`;
Activos `name`. Portafolio y Documentos: los que defina el contrato; el
placeholder debe listar solo lo que de verdad se busca.

Cualquier cambio de `q` o de filtros **reinicia la página a 1** y cancela la
petición anterior. El estado (`q`, filtros, página, tamaño, orden) no se guarda
en la URL en este PR; si se decide hacerlo es otra especificación.

## 4. Filtros

Se reutilizan `MultiSelectFilter` y el patrón de `filtros-seleccion-multiple.md`
sin cambios visuales. Lo que cambia es el comportamiento visible:

- Cada cambio de filtro **recarga desde el servidor**; el contador pasa a
  «Cargando…» (sección 5) y la tabla o lista anterior se conserva **sin
  atenuar** (texto a opacidad completa, sin `opacity-*` ni velo: ver §5.4 y
  §9). El contenedor lleva `aria-busy="true"` y el indicador de carga se
  muestra aparte, en el contador con `role="status"`, la barra fina y el
  cursor de §5.4.
- Los filtros múltiples viajan como parámetros repetidos; la interfaz no lo
  muestra.
- «Sin proceso» (`SIN_PROCESO`) y las bandas se conservan.
- Línea de filtros activos (chips), solo si hay alguno:

```tsx
<div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
  <span className="text-meta text-muted-foreground">Filtros activos:</span>
  <button type="button"
    className="inline-flex min-h-6 items-center gap-1 rounded-full bg-primary-subtle px-2.5 text-meta font-medium text-foreground hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-md:min-h-11"
    aria-label="Quitar filtro Estado: En revisión">
    Estado: En revisión <X aria-hidden="true" className="size-3" />
  </button>
  <Button type="button" variant="ghost" size="sm" className="text-link">Limpiar filtros</Button>
</div>
```

El chip lleva etiqueta y valor en texto; no se distingue solo por color.
El texto usa `text-foreground` sobre `bg-primary-subtle`; el enlace «Limpiar
filtros» usa `text-link` (nunca `text-primary`).

En móvil (< 768 px) la barra se apila: búsqueda a todo el ancho, debajo los
filtros en `flex flex-wrap gap-2` y el contador debajo. Cada control mide 44 px
de alto (`max-md:h-11`).

## 5. Contador, total y estados de carga

### 5.1 Contador `ResultCount` (región viva)

El componente actual recibe `total` (filas recibidas) y `filtered`. En el patrón
servidor el significado cambia y la vista debe pasar:

- `total` = total sin filtros ni `q` **cuando se conoce**; si el servidor solo
  da el total filtrado, se pasa el mismo valor en ambos y se muestra solo
  «N solicitudes».
- `filtered` = `X-Total-Count`.

Textos exactos (plural con `formatCount`, separador de miles `es`):

| Situación | Texto visible |
| --- | --- |
| Carga inicial o recarga | `Cargando solicitudes…` |
| Sin filtros, N filas | `300 solicitudes` |
| Con filtros o `q` | `12 de 300 solicitudes` si se conoce el total sin filtrar; si no, `12 solicitudes` |
| Una sola | `1 solicitud` |
| Cero | `0 solicitudes` |

Clases (sin cambios): `text-meta tabular-nums text-muted-foreground`,
`role="status"`. Para no anunciar cada tecla, la vista actualiza el texto solo
cuando **termina** la carga o empieza una (no durante el debounce).

La **posición dentro del total** vive solo en la paginación («Mostrando 26–50
de 300 solicitudes»). El contador de la barra y el de la paginación no se
duplican en lectores de pantalla: la paginación es `nav` con su propia
etiqueta, sin `role="status"`.

### 5.2 Paginación del servidor

Se reutiliza `DataTablePagination` con las mismas props (`page`, `pageCount`,
`from`, `to`, `filtered`, `pageSize`). `pageCount = ceil(total / pageSize)` (mínimo 1).
Tamaños: `25, 50, 100` (el máximo del servidor es 100, coincide).

Textos en español:

| Elemento | Texto |
| --- | --- |
| Posición | `Mostrando 26–50 de 300 solicitudes` (hoy dice «26–50 de 300 solicitudes»; añadir «Mostrando»; es el texto que cita el plan) |
| Tamaño | Label `Filas por página`; opciones 25, 50, 100 |
| Página | `Página 2 de 12` |
| Botones | `aria-label` «Página anterior» y «Página siguiente», tooltip igual |
| Con 0 filas | `Sin resultados` en lugar de la posición; botones deshabilitados |
| Nav | `aria-label="Paginación de solicitudes"` |

Clases (ya vigentes, no cambian): contenedor
`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-3 py-2 text-meta text-muted-foreground`;
botones `variant="outline" size="icon-sm" max-md:size-11`; selector
`h-8 w-20 max-md:h-11`.

Comportamiento:

- Se muestra **siempre** en estado `ready`, con una o varias páginas, como hoy.
- Prop `showingPrefix?: boolean` (por defecto `false`) en `DataTablePagination`:
  con `true` la posición lleva el prefijo «Mostrando ». Las cuatro vistas de
  este PR pasan `true`; las demás vistas no cambian.
- **Regla única de foco** (vale también para §5.4 y §10):
  1. El botón pulsado **conserva el foco** durante toda la carga. Mientras hay
     una petición en curso los dos botones llevan `aria-disabled="true"` y
     **no** el atributo `disabled`; la activación (clic, Enter, Espacio) se
     ignora en el manejador. Un `disabled` real expulsaría el foco a `body`.
  2. `disabled` real solo se usa en el **límite natural** (anterior en la
     página 1, siguiente en la última), calculado cuando la carga termina. En
     ese momento el foco pasa al otro botón de paginación; si solo hay una
     página (ambos en el límite), pasa al contenedor de la tabla
     (`tabIndex={-1}`, nunca a `body`).
  3. El contenedor de la tabla recibe el foco programático además (con
     `scrollIntoView({ block: 'nearest' })`) solo en «Limpiar búsqueda y
     filtros» y al saltar de página por rango inválido; no se mueve el foco
     en un cambio de página normal.
- Si la página pedida queda fuera de rango tras un filtro (p. ej. página 5 y el
  nuevo total tiene 2), la vista salta a la última página existente.
- En móvil (390 px) la paginación se apila en dos filas: posición arriba,
  luego tamaño + «Página N de M» + botones. Sin scroll horizontal.

### 5.3 Aviso de truncado

Solo si `X-Truncated: true`. `InlineNotice tone="warning"`, `role="status"`,
encima de la tabla, dentro de la tarjeta:

> **Mostramos solo las primeras 1.000 filas.** Hay más resultados. Afina la
> búsqueda o los filtros para verlos.

Sin botón de acción. El icono ya lo aporta `InlineNotice` y el texto lleva el
mensaje, así que no depende del color. Contraste del par `warning` / `warning-subtle` ya medido en el sistema (ver sección 9).

### 5.4 Estados de la lista

| Estado | Presentación |
| --- | --- |
| **Carga inicial** (sin filas aún) | `TableSkeleton` en escritorio y `CardListSkeleton` en móvil dentro de un contenedor `aria-busy="true"` (`DataView` ya lo hace). Contador: «Cargando solicitudes…». La paginación no se muestra aún |
| **Recarga** (cambia página, filtro, `q` u orden con filas ya visibles) | **No se vacía la tabla ni se atenúa.** Sin `opacity-*` ni velo sobre texto o fondo de las filas: el contraste del texto es el de la sección 9 en todo momento. El contenedor de la tabla lleva `aria-busy="true"` y las filas `pointer-events-none` (no se abre una fila obsoleta). Indicadores de carga, los tres sin depender del color: (1) contador «Cargando solicitudes…» con icono `Loader2` (`size-3.5 animate-spin motion-reduce:animate-none`, `aria-hidden`); (2) barra fina `h-0.5 bg-primary` en el borde superior de la tabla, `aria-hidden`, que aparece si la carga pasa de 400 ms (`animate-pulse motion-reduce:animate-none`; con movimiento reducido queda fija); (3) cursor `cursor-progress` en la tabla. Los botones de paginación llevan `aria-disabled="true"` (no `disabled`) y no actúan hasta terminar: ver regla de foco en 5.2 |
| **Vacío real** (sin filtros ni `q`, total 0) | `EmptyState` actual de cada vista. Icono en círculo `bg-primary-subtle`. Título y descripción de la sección 6 |
| **Sin resultados** (con filtros o `q`, total 0) | `noResults` de `DataView`: título «Sin resultados», descripción «Ninguna solicitud coincide con la búsqueda o los filtros.» y botón `outline` «Limpiar búsqueda y filtros» (devuelve foco al campo `q`) |
| **Error de carga inicial** | `ErrorState` dentro de la misma tarjeta, con la variante por tipo de error de D-err (sección 7) |
| **Error de recarga** (ya había filas) | Se conserva la tabla anterior sin atenuar y aparece arriba `InlineNotice tone="danger"` con el mensaje y botón «Reintentar». Las filas visibles son de la consulta anterior: el aviso lo dice (sección 7) |
| **Éxito** | Tabla y paginación. Sin toast |
| **Deshabilitado** | Límite natural (anterior en página 1, siguiente en la última): atributo `disabled` y `disabled:opacity-50`, sin `DisabledReason`; el foco se reubica según 5.2. Durante la carga: `aria-disabled="true"` sin cambio de aspecto (no `opacity`), para no ensombrecer el control que conserva el foco |
| **Foco** | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` en todos los controles |

La carga de una recarga **nunca** muestra «No hay solicitudes» ni parpadea a
vacío: ese es el principal riesgo visual del patrón servidor.

## 6. Textos de vacío, sin resultados y error por vista

| Vista | Vacío real (título / descripción) | Sin resultados (descripción) |
| --- | --- | --- |
| Solicitudes | «Aún no hay solicitudes» / «Cuando se registre una solicitud aparecerá aquí.» | «Ninguna solicitud coincide con la búsqueda o los filtros.» |
| Portafolio | «Aún no hay iniciativas» / «Las solicitudes aprobadas aparecen aquí como iniciativas.» | «Ninguna iniciativa coincide con la búsqueda o los filtros.» |
| Activos | «Aún no hay activos» / «Los activos se crean al cerrar una solicitud o desde Nuevo activo.» | «Ningún activo coincide con la búsqueda o los filtros.» |
| Documentos | «Aún no hay documentos» / «Sube el primer documento desde un activo.» | «Ningún documento coincide con la búsqueda o los filtros.» |

Si una vista ya tiene un texto de vacío propio y vigente, **se conserva** el
actual; los de la tabla son referencia. Lo obligatorio es la estructura de
sección 5.4 y la descripción de «sin resultados».

## 7. Errores

Se usa `ErrorState` con la prop `error` de D-err. Textos:

| Tipo | Título | Mensaje | Acción |
| --- | --- | --- | --- |
| `network` | No fue posible cargar las solicitudes. | Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal. | «Reintentar» |
| `server` | No fue posible cargar las solicitudes. | Mensaje del servidor, en español y sin identificadores | «Reintentar» |
| `forbidden` | No tienes acceso a esta lista. | Mensaje del servidor | Ninguna (sin «Reintentar»), icono `Lock`, tono neutral |
| `notFound` en página fuera de rango | No se aplica: la vista salta a la última página | | |

Error durante una **recarga** con filas visibles (`InlineNotice tone="danger"`):

> **No se pudo actualizar la lista.** Se muestran los resultados anteriores,
> que pueden no corresponder a la búsqueda actual. [Reintentar]

`role="alert"`. Mantiene el botón «Reintentar», que relanza la consulta con el
estado de filtros actual.

## 8. Nombre y código de lo referenciado (BL-039)

Regla general: **la persona nunca ve un UUID ni un nombre sin su código cuando
el código existe**. Lo referenciado se muestra como **nombre** (texto
legible) y, si tiene código visible, su `IdChip`. El nombre es lo que identifica
para leer; el código es lo que se copia y se cita.

Reglas de presentación:

1. **Solicitud referenciada** (de un activo o un documento): `IdChip` corto con
   el código (`PRY-0012`) seguido del título en una segunda línea
   (`text-meta text-muted-foreground`, `line-clamp-1`). El título completo va en
   `title`.
2. **Proceso**: nombre en texto normal y, debajo, en segunda línea, su código
   (`mainProcessCode`) con `text-meta text-muted-foreground`, sin `font-mono`,
   sin paréntesis y sin `IdChip` (no es un ID visible que se cite). Sin código,
   solo el nombre. En tarjeta móvil el código va tras el nombre separado por
   « · ».
3. **Activo referenciado** (de un documento): nombre en texto normal. El
   `assetCode` llega en PR-D; hasta entonces no se muestra código ni hueco
   vacío.
4. **Persona** (responsable de un activo): nombre; sin correo.
5. **Dato ausente** (relación sin valor): guion largo «—» con
   `<span className="sr-only">Sin proceso</span>` (o el sustantivo que
   corresponda). Nunca dejar la celda vacía ni mostrar «null» o el UUID.
6. **Dato fuera de alcance o eliminado**: «No disponible» en
   `text-muted-foreground`, sin código.
7. Los códigos no son enlaces por sí mismos salvo que ya lo sean hoy; el
   `IdChip` mantiene su comportamiento (copiable, foco visible, `min-h-6`).

Columnas resultantes (escritorio):

| Vista | Columnas con referencia | Presentación |
| --- | --- | --- |
| Solicitudes | Código · Título · **Proceso** · **Activo** · Estado · Registro | Código con `IdChip` corto; Proceso = `mainProcessName` y debajo `mainProcessCode` (punto 2); Activo = `assetName` o «—» |
| Portafolio | Código · Iniciativa · Proceso · Estado · … | Igual que Solicitudes; sin columnas nuevas más allá de las ya existentes |
| Activos | Nombre · **Proceso** · **Responsable** · **Solicitud de origen** · Estado | Proceso = `processName`; Responsable = `ownerName`; Origen = `IdChip` corto con `requestCode` y debajo `requestTitle` |
| Documentos | Título · **Activo** · **Solicitud** · Versión · Estado | Activo = `assetName`; Solicitud = `IdChip` + `requestTitle`; Versión = `v3` en `tabular-nums` |
| Auditoría | Fecha · Actor · Acción · **Objeto** | Objeto = etiqueta legible (p. ej. título de la solicitud) y, si el objeto tiene código, su `IdChip`. La etiqueta llega del API; sin etiqueta se muestra el tipo («Solicitud») y nunca el UUID |

Ancho y recorte: las celdas de referencia llevan `min-w-40 max-w-[18rem]`,
nombre en `line-clamp-1` con `title` completo. La celda de título conserva
`min-w-56 max-w-[28rem]`. Si la suma excede el ancho, la tabla ya hace scroll
horizontal dentro de su contenedor (`Table scrollLabel`), no de la página.

Tarjeta móvil (< 768 px; `DataCardList`): las referencias van en `meta`, en
este orden y omitiendo las vacías salvo que la vista indique «—»:

| Vista | `title` | `subtitle` | `badges` | `meta` |
| --- | --- | --- | --- | --- |
| Solicitudes | título | `IdChip` corto + proceso (`mainProcessName`) | Estado, Prioridad | Activo (`assetName`), Registro |
| Portafolio | título | `IdChip` + proceso | Estado, Prioridad | Responsable, Fecha objetivo |
| Activos | nombre | proceso (`processName`) | Estado | Responsable (`ownerName`), Origen (`IdChip` + `requestTitle`) |
| Documentos | título | activo (`assetName`) | Estado, `v3` | Solicitud (`IdChip` + `requestTitle`), Fecha |

El `IdChip` en tarjeta mide al menos 24 × 24 px (regla del PR-C) y no se coloca
junto a otro control táctil sin 8 px de separación.

## 9. Colores, tokens y contraste

Solo tokens semánticos existentes en `globals.css`. Ninguno nuevo.

| Uso | Token / clase |
| --- | --- |
| Superficie de la tabla | `bg-card`, `rounded-xl`, `shadow-card` (los de `DataView`) |
| Separadores | `border-t` (borde marino 9 % en claro, blanco 10 % en oscuro) |
| Texto de contadores y paginación | `text-muted-foreground` |
| Texto de datos | `text-foreground` |
| Chip de filtro activo | `bg-primary-subtle text-foreground` |
| Enlaces («Limpiar filtros») | `text-link` |
| Aviso de truncado | `InlineNotice tone="warning"` (`warning`, `warning-subtle`, `warning-border`) |
| Error de recarga | `InlineNotice tone="danger"` (`danger`, `danger-subtle`) |
| Barra de recarga | `bg-primary` (elemento gráfico, no texto) |
| Fila durante la recarga | Sin cambio de color ni `opacity-*` (ver 5.4) |

### Ratios medidos

Método: valores OKLCH de `apps/web/src/app/globals.css` de esta rama → OKLab →
sRGB lineal (matriz de Ottosson) → luminancia relativa WCAG
(0,2126 R + 0,7152 G + 0,0722 B) → ratio (L1 + 0,05) / (L2 + 0,05). Calculado
con aritmética de 6 decimales; el margen de error es de ±0,05 en el ratio.
Luminancias (Y): claro, `card` 1,000, `background` 0,867, `foreground` 0,021,
`muted-foreground` 0,097, `primary-subtle` 0,805, `secondary-hover` 0,706;
oscuro, `card` 0,0143, `background` 0,0078, `muted-foreground` 0,440,
`foreground` ≈ 0,91, `primary-subtle` 0,0289, `secondary-hover` 0,0370.

| Texto sobre fondo | Claro | Oscuro | Mínimo |
| --- | --- | --- | --- |
| `muted-foreground` sobre `card` (contadores, paginación) | 7,13:1 | 7,62:1 | 4,5:1 |
| `muted-foreground` sobre `background` | 6,23:1 | 8,47:1 | 4,5:1 |
| `foreground` sobre `card` (datos de tabla) | 14,75:1 | ≈ 14,9:1 | 4,5:1 |
| `foreground` sobre `primary-subtle` (chip de filtro) | 12,0:1 | 12,2:1 | 4,5:1 |
| `foreground` sobre `secondary-hover` (chip en hover) | 10,6:1 | 11,0:1 | 4,5:1 |
| `muted-foreground` sobre `primary-subtle` («Filtros activos:» si queda sobre el chip) | 5,81:1 | 6,2:1 | 4,5:1 |
| Texto `warning` sobre `warning-subtle` (aviso de truncado) | 6,10:1 | 8,6:1 | 4,5:1 |
| Texto `danger` sobre `danger-subtle` (error de recarga) | 5,83:1 | 6,56:1 | 4,5:1 |
| Borde de `Input` (`--input`) sobre `card` | 3,95:1 | 3,81:1 | 3:1 |
| Borde de `Input` (`--input`) sobre `background` | 3,44:1 | 4,24:1 | 3:1 |
| Barra de recarga `bg-primary` (#176BEB) sobre `card` | 4,84:1 | 3,37:1 | 3:1 |

`text-link` sobre el lienzo (5,66:1 claro) y cian sobre oscuro (8,15:1) se
toman de la guía de marca, que ya los midió. El texto del `IdChip` conserva su
contraste vigente (≥ 4,5:1, regla de `25-marca-gibo.md`).

**Recarga sin atenuar.** La versión anterior de este documento atenuaba la
tabla con `opacity-60`; la opacidad mezcla el texto con el fondo y baja su ratio. En el texto
secundario de claro (7,13:1 sin atenuar), la mezcla al 60 % queda por debajo
de 4,5:1. Se descarta cualquier tratamiento que reduzca opacidad o mezcle un
velo con el texto. La recarga se comunica con contador, barra y cursor (5.4),
de modo que todos los textos mantienen los ratios de la tabla anterior en todo
momento y axe no puede marcar `color-contrast` durante la carga.

Pendiente de verificación en navegador (no sustituye la medición anterior):
axe sobre las cuatro vistas en ambos temas durante una recarga lenta simulada
(`page.route` con retraso) debe dar cero `color-contrast`.

## 10. Accesibilidad

- **Búsqueda**: `role="search"`, label real (sr-only), `type="search"`, botón
  «Borrar búsqueda» alcanzable con teclado y con 44 px en móvil.
- **Contador**: único `role="status"` del listado (más el de `DataView` solo si
  la vista no usa `ResultCount`). Se actualiza al terminar la carga, nunca por
  tecla.
- **Carga**: `aria-busy="true"` en el contenedor que se recarga. Para evitar
  solicitudes cruzadas, los botones de paginación llevan `aria-disabled="true"`
  (no `disabled`) y el manejador ignora la activación, de modo que el foco
  permanece en el botón pulsado y el usuario de teclado puede avanzar página a
  página con Enter. El foco solo se mueve cuando el límite natural pone
  `disabled` al botón: pasa al otro botón de paginación o, si solo hay una
  página, al contenedor de la tabla (`tabIndex={-1}`), nunca a `body` (regla
  completa en 5.2).
- **Paginación**: `nav` con `aria-label` por listado. «Página N de M» y la
  posición son texto, no solo icono. Los botones tienen `aria-label` en español.
- **Orden**: `SortableTableHead` mantiene `aria-sort` y el texto sr-only
  «, ordenar». Las columnas fuera de la lista blanca del servidor **no se
  renderizan como botón** (texto simple); no se deja un control que no hace
  nada. En móvil, el `Select` «Ordenar por» solo ofrece las columnas permitidas.
- **Referencias**: el nombre es texto real; el `IdChip` es un control con foco
  y nombre accesible «Copiar código PRY-0012». El guion «—» lleva texto sr-only.
- **Orden de tabulación**: búsqueda → filtros → «Limpiar filtros» → cabeceras
  ordenables → enlaces/acciones de fila (y `IdChip`) → selector de filas por
  página → anterior → siguiente.
- **Movimiento**: `animate-pulse` y `animate-spin` con `motion-reduce:animate-none`.
- **Zoom y reflujo**: a 200 % y 320 px de ancho no hay scroll horizontal de
  página (WCAG 1.4.10); solo la tabla desplaza dentro de su contenedor.
- **Tamaño de objetivos**: ≥ 24 × 24 px en escritorio (WCAG 2.5.8) y 44 px en
  `max-md` para los controles de este documento.

Validación pendiente que no puede darse por hecha solo con axe: recorrer con
lector de pantalla (NVDA o VoiceOver) el anuncio del contador al cambiar de
filtro, y probar con teclado la devolución del foco tras «Limpiar búsqueda y
filtros» y tras el cambio de página. Requiere prueba manual y revisión experta.

## 11. Responsive y temas

| Ancho | Comportamiento |
| --- | --- |
| **1440 px, claro y oscuro** | Toolbar en una fila: búsqueda `lg:max-w-sm`, filtros, contador a la derecha (`ml-auto`). Tabla completa; paginación en una fila (`justify-between`). Contenedor `max-w` del shell sin cambios |
| **768–1023 px** | Toolbar en dos filas (búsqueda y filtros arriba, contador debajo a la derecha). Tabla con scroll horizontal interno si hace falta |
| **390 px, claro y oscuro** | Búsqueda a ancho completo y 44 px; filtros en `flex-wrap`; contador debajo. `DataCardList` en lugar de tabla (con `Select` «Ordenar por»). Paginación apilada en dos filas, botones 44 px. Aviso de truncado y error de recarga a ancho completo |

Ambos temas usan los mismos tokens; la diferencia la aportan las variables de
`globals.css`. No hay clases `dark:` propias en este patrón. En oscuro la
tarjeta es una superficie más clara que el fondo (sin borde duro) y los chips
de filtro usan `primary-subtle` oscuro (`oklch(0.31 0.09 262)`) con texto
`foreground`.

## 12. Qué debe verificar `revisor`

1. Ninguna recarga vacía la tabla ni muestra el estado «vacío».
2. `X-Total-Count` ausente (fixtures de e2e) sigue dando una paginación
   coherente.
3. «Mostrando X–Y de TOTAL» coincide con el contador de la barra.
4. Ningún UUID ni «null» en las celdas de referencia; «—» con texto sr-only.
5. Orden en servidor: solo las columnas de la lista blanca son botones.
6. Que no exista `opacity-*` en la tabla durante la recarga y que axe no
   reporte `color-contrast` en una recarga lenta, en claro y oscuro, a 1440 y
   390 px.
6b. Foco: pulsar «Página siguiente» con Enter repetido avanza de página en
   página sin perder el foco; al llegar a la última, el foco pasa a «Página
   anterior».
7. Sin scroll horizontal de página a 390 px.
8. Sin colores crudos de Tailwind.

## 13. Hallazgos para `desarrollador` (código existente, no se modifica aquí)

- `ResultCount` y `DataTablePagination` asumen paginación en cliente (`filtered`
  filas ya cargadas). Para el servidor hace falta pasar `from`, `to` y
  `filtered` desde el hook `useServerTable`. Lo único textual que cambia es
  anteponer «Mostrando » a la posición en `DataTablePagination`; ese cambio
  alcanza también a las vistas de paginación en cliente que no son parte de este PR.
  Decisión: añadir la prop `showingPrefix?: boolean` (por defecto `false`),
  que pasan en `true` solo las cuatro vistas de este PR; no se cambia el texto
  global ni los e2e de otras vistas. Anotarlo en la descripción del PR.
- `ErrorState` aún no acepta `error`. Mientras PR-A no entregue D-err, las
  vistas pasan `message` explícito.
