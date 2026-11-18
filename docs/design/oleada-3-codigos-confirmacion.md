# Oleada 3 · PR-D · Códigos visibles y confirmación

Especificación visual previa. No hay código de la aplicación en este cambio.
Base: `a8ba913` más lo que PR-C aporta a `DataCardList` (ranura `code`, `wide`,
`footer`, anillo en oscuro; ver `oleada-3-movil-accesibilidad.md` §1.2). Orden de
fusión: A → C → B → D. Si PR-C no está fusionado cuando se implemente PR-D, la
tarjeta de §2 no se puede construir tal cual: se espera a PR-C, no se improvisa
otra ranura.

Fuentes: `25-marca-gibo.md`, `15-reglas-transversales.md` (IDs visibles),
plan de la oleada (PR-D), `docs/plan-mejora/README.md` (2.5, 5.1, 5.3, 5.4, 6.6),
`tarjetas-moviles-bl-024.md`, `components/id-chip.tsx`, `confirm-dialog.tsx`,
`data-card-list.tsx`, `ui/sonner.tsx` y las vistas reales del worktree.

## 0. Hallazgos que cambian el alcance

Comprobados en el código del worktree, no en el plan:

| # | Hallazgo | Consecuencia para PR-D |
| --- | --- | --- |
| H1 | **6.6 no confirma hoy.** `configuracion-smtp-view.tsx` cambia el rol con un `Switch` que llama a `setAdminFlag` al instante (`onCheckedChange`). El plan dice que ya confirma desde la oleada 1. | 6.6 **sí lleva código** en PR-D: `ConfirmDialog` antes de dar o quitar el rol (§3.5). |
| H2 | **2.5 confirma solo «Aprobar compromiso».** «Autorizar» plan (`plan-authorization-section.tsx`), «Aprobar» documento y «Aprobar cierre» (`pending-reviews-sections.tsx`) ejecutan al primer clic. | Esos tres reciben `ConfirmDialog` (§3.5). El plan los daba por cubiertos. |
| H3 | 5.3: «Aprobar GC4» y «No aplica» confirman. «Solicitar cierre» y «Rechazar cierre» confirman. | Solo constancia. |
| H4 | `Activar` (BORRADOR → ACTIVO) no tiene transición inversa (`asset-status.ts`). | No se le ofrece «Deshacer». Ver punto abierto P1. |
| H5 | La regla de IDs visibles exige código en toda pantalla que nombre una solicitud. La columna «Solicitud» de Activos hoy muestra solo el título. | Se añade `requestCode` con `IdChip` en esa columna (§2.2). |

## 1. Tokens y contraste

Sin tokens nuevos ni valores crudos. Todo sale de `globals.css`.

Ratios calculados con luminancia relativa WCAG a partir de los OKLCH del archivo
(conversión OKLab → sRGB lineal). Se redondean a dos decimales. La medición final
con la herramienta de contraste del navegador sobre la implementación sigue
siendo obligatoria (`25-marca-gibo.md`: medir ambos temas).

| Uso | Primer plano / fondo | Claro | Oscuro | Mínimo |
| --- | --- | --- | --- | --- |
| Texto del `IdChip` | `text-foreground` / `bg-muted` | 11,83 | 13,60 | 4,5 |
| Texto de tabla y tarjeta | `text-foreground` / `bg-card` | 14,75 | 14,98 | 4,5 |
| Etiqueta secundaria (`text-meta`, `dt`, tipo de objeto) | `text-muted-foreground` / `bg-card` | 7,13 | 7,62 | 4,5 |
| Igual, peor caso sobre `bg-muted` | `text-muted-foreground` / `bg-muted` | 5,72 | 6,95 | 4,5 |
| Texto del toast | `text-popover-foreground` / `bg-popover` | 14,75 | 14,10 | 4,5 |
| Texto de «Deshacer» | `text-primary-foreground` / `bg-primary` | 4,84 | 4,84 | 4,5 |
| Borde del botón «Deshacer» frente al toast | `bg-primary` / `bg-popover` | 4,84 | 3,18 | 3 |
| Anillo de foco | `outline-ring` (= `--primary`) / `bg-card` | 4,84 | 3,37 | 3 |

Ningún dato se transmite solo por color: el código lleva texto, el tipo de objeto
va escrito, y el aviso de la acción dice qué pasó con palabras.

## 2. Códigos visibles

### 2.1 Reglas comunes

- Componente: `IdChip` con `variant="full"` (`ACT-0007` y `DOC-0012` se muestran
  completos; la forma corta solo aplica a F y T). PR-D **no edita** `id-chip.tsx`
  (el tamaño de 24 px lo pone PR-C).
- Copiable (`copyable`, valor por defecto) en tablas, tarjetas y cabeceras: la
  fila no es un control, así que el chip no anida interactivos. Este punto
  **corrige** la nota del plan para Auditoría (`copyable={false}`): ahí la fila
  tampoco es un control, y copiar el código es justo lo que sirve para pegarlo en
  el filtro «Código del objeto». `copyable={false}` queda para el resumen dentro
  de diálogos (§3.2), donde un botón extra rompería el orden de tabulación.
- Dos chips en una fila (Activos: código propio y de la solicitud) se separan con
  `gap-2` como mínimo. Cada chip se lee «Código ACT-0007, copiar».
- Código ausente (dato anterior a la migración o respuesta sin `code`): `IdChip`
  no pinta nada. La celda muestra `<span className="text-muted-foreground" aria-hidden="true">—</span><span className="sr-only">Sin código</span>`.
- Cargando: en la columna «Código» un `Skeleton className="h-6 w-20"` (mismo alto
  que el chip). El resto del esqueleto de tabla no cambia.
- Orden por código: se ordena por el **número**, no por el texto. `ACT-10000`
  quedaría antes que `ACT-9999` en orden alfabético. Quien implemente la
  ordenación en servidor debe mapear `sort=code` a la columna `number`.

### 2.2 Activos (`/activos/catalogo`)

**Tabla (≥ 768 px, probada a 1440).** Columna «Código» primera, igual que
Solicitudes. Orden de columnas: Código · Nombre · Proceso · Solicitud ·
Responsable · Estado · Acciones.

| Pieza | Clases |
| --- | --- |
| Cabecera «Código» | `SortableTableHead label="Código" sortKey="code" className="w-28"` |
| Celda | `<TableCell className="whitespace-nowrap"><IdChip code={asset.code} /></TableCell>` |
| Solicitud (celda) | `min-w-40 max-w-64`; en dos líneas: `IdChip code={asset.requestCode}` y debajo el título `line-clamp-2 wrap-break-word text-muted-foreground`. Sin solicitud: «—». |

`w-28` (112 px) deja 88 px útiles tras el relleno de la celda; `ACT-10000` mide unos
79 px, así que cabe aun con cinco dígitos.

**Tarjeta (< 768 px, probada a 390).** Usa la ranura `code` de PR-C.

| Ranura | Contenido |
| --- | --- |
| `code` | `<IdChip code={asset.code} />` |
| `title` | `<CellTitle touch>{asset.name}</CellTitle>` (sin cambios) |
| `subtitle` | Proceso (sin cambios) |
| `badges` | `StatusBadge kind="asset"` (sin cambios) |
| `meta` | `Solicitud` (`wide`): `IdChip requestCode` y debajo `requestTitle`; `Responsable` |
| `actions` | `RowActions menuOnly` (sin cambios) |

Para que el chip no quede recortado, no va en `subtitle` (ahí hay `truncate` y su
contorno de foco se cortaría). Por eso la ranura `code`.

**Búsqueda por código.** El `SearchInput` actual cambia el rótulo accesible y el
`placeholder` a «Buscar por nombre o código» y entiende `act-7`, `ACT-0007` y
`0007` (la API normaliza; la vista envía el texto tal cual como `q`). Sin
control nuevo.

### 2.3 Documentos (`/activos/documentos`)

**Tabla.** Orden: Código · Título · Activo · Proceso · Versión · Estado ·
Acciones.

| Pieza | Clases |
| --- | --- |
| Cabecera «Código» | `SortableTableHead label="Código" sortKey="code" className="w-28"` |
| Celda | `<TableCell className="whitespace-nowrap"><IdChip code={doc.code} /></TableCell>` |
| Activo (celda) | `min-w-40 max-w-64` con `flex flex-wrap items-center gap-x-2 gap-y-1`: `IdChip code={doc.assetCode}` y el nombre `line-clamp-2 wrap-break-word`. |

**Tarjeta.**

| Ranura | Contenido |
| --- | --- |
| `code` | `<IdChip code={doc.code} />` |
| `title` | `CellTitle touch` con el `meta` actual (motivo de rechazo o «Documentación de cierre») |
| `subtitle` | Nombre del activo (sin cambios) |
| `meta` | `Código del activo` → `IdChip assetCode`; `Proceso`; `Versión` |

Aquí el código del activo va en `meta` y no en `subtitle` por la misma razón de
recorte que en Activos.

**Búsqueda.** Mismo cambio de rótulo que Activos: «Buscar por título o código».
La API ya acepta `q`.

### 2.4 Auditoría (`/gobierno/auditoria`)

**Columna «Objeto» (tabla).** Deja de ser `whitespace-nowrap`.

```tsx
<TableCell className="min-w-64 max-w-[26rem]">
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <IdChip code={event.objectCode} />
    <span className="line-clamp-2 wrap-break-word text-foreground">{event.objectLabel}</span>
  </div>
  <span className="text-meta text-muted-foreground">{auditObjectLabel(event.objectType)}</span>
</TableCell>
```

| Caso | Resultado |
| --- | --- |
| `REQUEST`, `PHASE`, `TASK`, `ASSET`, `DOCUMENT` | Chip + etiqueta + tipo debajo. |
| `USER`, `AREA`, `PROCESS`, `CATALOG_ITEM` (sin código) | Sin chip. Etiqueta (nombre) + tipo debajo. |
| Sin etiqueta (objeto eliminado o fuera de alcance) | Solo el tipo, como hoy. No se escribe un texto inventado. |

El tipo se conserva siempre visible: el prefijo del código no basta para quien
filtra por «Objeto».

**Tarjeta (< 768 px).** Parte de la tarjeta de PR-C (título = acción, subtítulo =
actor, `Badge neutral` con el tipo, `footer` «Ver cambio»). PR-D añade:

| Ranura | Contenido |
| --- | --- |
| `code` | `<IdChip code={event.objectCode} />` (si existe) |
| `meta` | `Objeto` (`wide`) → `objectLabel`, primero de la lista; después Fecha y Proceso (ya en PR-C). Se omite si no hay etiqueta. |

Orden de lectura con lector de pantalla: código, acción, actor, tipo, objeto,
fecha, proceso, «Ver cambio». Se lee «PRY-0012, Actualizó, Ana Pérez…».

**Filtro «Código del objeto».** Tercer campo de la `Toolbar`, tras «Acción».

| Parte | Especificación |
| --- | --- |
| Contenedor | `<Field id="aud-filtro-codigo" label="Código del objeto" help="Por ejemplo PRY-0012, PRY-0012-T07, ACT-0007 o DOC-0003." className="w-full sm:w-auto">` |
| Control | `Input` `w-full sm:w-52`, `autoComplete="off"`, `autoCapitalize="characters"`, `spellCheck={false}`, `maxLength={20}`, `placeholder="PRY-0012"`. En táctil hereda `pointer-coarse:h-11`. |
| Valor | La vista pasa el texto a mayúsculas al escribir y lo recorta. |
| Cuándo consulta | Con 400 ms de pausa **solo si el texto está vacío o es válido** (`^(PRY\|ACT\|DOC)-\d{4,}(-F\d+\|-T\d+)?$`; F y T solo con PRY). Con Enter, al instante. Un texto inválido no llama a la API. |
| Error | Al salir del campo o con Enter, con texto no vacío e inválido: `FormError` «Escribe un código completo, por ejemplo PRY-0012 o ACT-0007.», `aria-invalid="true"` y `aria-describedby` hacia ayuda y error. |
| Limpiar | «Limpiar filtros» ya existente; `hasFilters` cuenta también el código válido aplicado. Vuelve a página 1. |
| Sin resultados | `EmptyState`/no-results: «No hay eventos para PRY-0099 dentro de tu alcance.» Es el mismo texto exista o no el objeto fuera del alcance, para no revelar su existencia. Acción «Limpiar filtros». |

La `q` de texto libre que acepta la API no se expone en esta oleada.

### 2.5 Selector de activo, historial y diálogos

- **Selector de activo en Documentos** (formulario y filtro). Cada opción muestra
  `ACT-0007 · Nombre`. En un `Select` no se usa `IdChip` (una opción con botón
  adentro rompe la navegación por teclado). Se pinta texto plano:
  `<SelectItem value={a.id} textValue={`${a.code} ${a.name}`}><span className="font-mono text-xs tabular-nums">{a.code}</span><span> · {a.name}</span></SelectItem>`.
  `textValue` permite escribir `ACT-0007` para saltar a la opción.
- **Historial del activo** (`catalogo/[id]/historial`). Bajo el título de
  `PageHeader` una línea `flex flex-wrap items-center gap-2` con
  `IdChip code={asset.code}` y el texto «Historial de solicitudes trabajadas sobre
  este activo.». Cada solicitud de la lista ya lleva su `IdChip`.
- **Diálogos «Historial de versiones» y «Ver documento».** El código va en el
  **texto** del título: «Historial de versiones — DOC-0012 · Título». Sin chip en
  el título: un botón dentro del encabezado ensucia el nombre accesible del
  diálogo (`aria-labelledby`) y añade una parada de tabulación antes del
  contenido. Para copiar el código se usa la tabla.

### 2.6 Estados de las vistas con código

| Estado | Comportamiento |
| --- | --- |
| Cargando | `TableSkeleton` / `CardListSkeleton` existentes; en «Código» un `Skeleton h-6 w-20`. |
| Vacío / sin resultados / error | Sin cambios; dentro de `DataView`. |
| Copiado | `IdChip` ya muestra `toast.success('Copiado ACT-0007')`. |
| Foco | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` (ya en `IdChip`). |
| Deshabilitado | El chip no se deshabilita. |

## 3. Confirmación o «Deshacer»

### 3.1 Criterio único

| La acción… | Patrón | Ejemplo |
| --- | --- | --- |
| Es irreversible, borra datos, notifica a terceros o cambia el estado de gobierno | `ConfirmDialog` con la consecuencia concreta. `tone="danger"` si destruye o niega algo; `tone="default"` si avanza un flujo. | Aprobar, autorizar, quitar el rol, rechazar |
| Pide una justificación | `ReasonDialog` (ya existe). | Devolver, «No aplica», rechazar cierre |
| Es reversible con una acción inversa, no notifica a nadie y no tiene dependientes | Se ejecuta de inmediato y aparece un toast con **Deshacer** 8 s. | Retirar o recuperar un activo sin dependientes |
| Es reversible pero tiene dependientes | `ConfirmDialog` con `tone="default"` que da el recuento y dice que se puede recuperar. Sin «Deshacer» después. | Retirar un activo con solicitudes o documentos |

El color rojo se reserva para lo irreversible o lo que quita acceso. Un retiro
reversible no es rojo.

### 3.2 `ConfirmDialog`: anatomía y comportamiento

Se reutiliza el componente tal cual (alertdialog `size="sm"`).

| Parte | Regla |
| --- | --- |
| Título | Pregunta con el verbo y el objeto, con su código si lo tiene: «¿Retirar ACT-0007?». Texto plano, sin chip. |
| Descripción | Una o dos frases: qué pasa, a quién afecta, si se puede deshacer. Sin repetir el título. |
| Resumen (`children`) | Opcional. `<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-sm dark:ring-1 dark:ring-inset dark:ring-border">`, `dt` `text-muted-foreground`, `dd` `text-foreground wrap-break-word`. El código va con `IdChip copyable={false}`. |
| Botones | «Cancelar» (outline) y el verbo concreto («Retirar activo», «Autorizar plan»); nunca «Aceptar» ni «Sí». |
| Pie en móvil | `DialogFooter` ya apila. Botones `pointer-coarse:h-11`. |

Comportamiento (ya implementado; no cambia):

- Foco inicial en «Cancelar». Tab recorre Cancelar → Confirmar → vuelve (atrapa
  foco). Escape cancela salvo con la acción en curso. Clic fuera no cierra.
- Al confirmar, el botón muestra `loading` y ambos se deshabilitan. El diálogo
  se cierra al terminar, con éxito o error; el error lo informa un toast.
- El foco vuelve al disparador (`useDialogReturnFocus`). Si la fila desapareció
  (aprobar quita la fila), va a `returnFocusTo`: la fila siguiente o el
  encabezado de la `Section`.
- Anuncio: `role="alertdialog"` con título y descripción asociados lo lee el
  lector al abrir. El resultado lo anuncia el toast (región `aria-live` de
  `Toaster`).

### 3.3 Toast con «Deshacer»

Se usa `toast()` neutro (superficie `popover`), no `toast.success`: el botón de
acción mide 3,18:1 contra el toast oscuro y quedaría por debajo de 3:1 sobre el
fondo verde translúcido de `success`. El texto lleva el resultado con palabras.

```ts
toast('ACT-0007 retirado.', {
  id: 'activo-estado-deshacer',          // un solo toast de este tipo a la vez
  description: '«Contrato marco» está en Retirado. Puedes deshacerlo ahora o recuperarlo después desde el menú de la fila.',
  duration: 8000,
  action: {
    label: <>Deshacer<span className="sr-only"> el retiro de ACT-0007</span></>,
    onClick: undo,
  },
  classNames: {
    actionButton:
      'h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-11',
  },
});
```

| Aspecto | Especificación |
| --- | --- |
| Posición | La del `Toaster` (abajo a la derecha en escritorio; sonner lo ajusta a ancho completo en móvil). A 390 px no se superpone con la paginación porque el toast es transitorio y descartable. |
| Duración | 8 000 ms, como el resto del repo (Mi trabajo). Sonner pausa el temporizador con el puntero encima. **Verificar a mano** que también pause con el foco de teclado; si no, añadir `duration: Infinity` mientras haya foco dentro del toast. |
| Por qué 8 s es aceptable | «Deshacer» no es la única vía: «Recuperar» queda en el menú de la fila (WCAG 2.2.1: el límite de tiempo no bloquea la tarea). |
| Texto | Título: resultado en pasado. Descripción: estado actual y la otra vía. No se cuentan segundos. |
| Cierre | Botón ✕ ya incluido («Cerrar notificación»). |
| Un solo toast | `id` fijo. Una acción nueva reemplaza al toast anterior; «Deshacer» siempre revierte la última acción. |
| Tamaño táctil | Botón «Deshacer» y ✕ de 44 px con `pointer-coarse`. |
| Movimiento | Sonner anima la entrada. Respeta `prefers-reduced-motion` si el `Toaster` ya lo hace; si no, verificar y añadir `motion-reduce:transition-none` en `classNames.toast`. |

**Foco y teclado.**

1. Al ejecutar «Retirar» desde el menú «…», Radix devuelve el foco al botón «…»
   de la fila. El foco no salta al toast: no roba el contexto.
2. Para llegar al toast con teclado: `Alt+T` (atajo por defecto de sonner; fijado
   en `hotkey` del `Toaster` y documentado en la ayuda del portal), o la vía
   equivalente «Recuperar» del menú. Dentro del toast Tab pasa por «Deshacer» y
   «Cerrar».
3. Tras pulsar «Deshacer» y completarse: el foco va al botón «…» de la misma
   fila (id de la acción, con el sufijo `-card` en móvil; se usa el que tenga
   `offsetParent !== null`). Si la fila ya no está en la lista (filtro por
   estado), el foco va al `h1` de la página.

**Anuncio a lectores de pantalla.** La región de sonner (`aria-live="polite"`,
«Notificaciones») lee el título y la descripción al aparecer y luego «Deshacer…».
Es la única fuente: la vista **no** añade otra región viva para el mismo mensaje
(Mi trabajo la usa por su lista agrupada, aquí `ResultCount` con `role="status"`
ya anuncia el cambio del total cuando la fila sale del filtro). Tras deshacer, el
toast de resultado dice «ACT-0007 recuperado.» (`toast.success`).

**Errores.** Falla la acción: `toast.error('No se pudo retirar ACT-0007. <motivo del servidor>')` y la fila queda como estaba. Falla «Deshacer»: `toast.error('No se pudo deshacer. Recupera el activo desde el menú de la fila.')`. Nunca se cierra el error solo.

### 3.4 5.1 Activos: Retirar y Recuperar

Árbol de decisión de `handleStatus` (la lógica la define `desarrollador`; aquí
solo el comportamiento visible):

| Acción | Condición | Resultado |
| --- | --- | --- |
| Retirar | Sin solicitudes ni documentos asociados | Inmediato + toast «Deshacer» (§3.3) |
| Retirar | Con dependientes (`requestsCount + documentsCount > 0`) | `ConfirmDialog` (abajo) y, al confirmar, `toast.success('ACT-0007 retirado. Puedes recuperarlo desde el menú de la fila.')` sin «Deshacer» |
| Retirar | Recuentos no disponibles | `ConfirmDialog` genérico (sin cifras) |
| Recuperar | Siempre | Inmediato + toast «Deshacer» («ACT-0007 recuperado.», deshacer = volver a retirar) |
| Activar | Siempre | Como hoy: `toast.success`. Sin «Deshacer» (H4, punto abierto P1). |

**Diálogo con dependientes** (`tone="default"`, confirmar «Retirar activo»):

- Título: «¿Retirar ACT-0007?»
- Descripción: «Este activo está asociado a 3 solicitudes y 2 documentos. El retiro no borra ningún dato y puedes recuperarlo cuando quieras.»
- Resumen: Activo → `IdChip` + nombre; Solicitudes asociadas → 3; Documentos asociados → 2.
- Plurales: «1 solicitud», «2 solicitudes»; si un recuento es 0 se omite esa parte («asociado a 3 solicitudes»).

El texto «no borra ningún dato» debe coincidir con las reglas de `asset-state`;
`desarrollador` lo confirma antes de publicarlo (punto abierto P2).

### 3.5 Pantallas citadas

| Ítem | Pantalla | Estado real | Qué hace PR-D |
| --- | --- | --- | --- |
| 2.5 | Aprobar compromiso | Confirma: «¿Aprobar el compromiso?» / «La solicitud pasará a Comprometida.» | Constancia. Ajuste menor recomendado: añadir resumen con `IdChip copyable={false}`, título y el puntaje que ya muestra la fila (el plan de mejora pide ID, título y score). |
| 2.5 | Autorizar plan | **No confirma** (H2) | `ConfirmDialog` `default`: «¿Autorizar el plan de PRY-0012?» / «La solicitud pasará a En ejecución. Si hay que corregir algo, usa Devolver.» / «Autorizar plan». Resumen: código, título. |
| 2.5 | Aprobar documento | **No confirma** (H2) | `ConfirmDialog` `default`: «¿Aprobar «Título»?» / «El documento pasará a {estado destino}.» (etiqueta de `getStatus('document', …)`, no escrita a mano) / «Aprobar documento». |
| 2.5 | Aprobar cierre | **No confirma** (H2) | `ConfirmDialog` `default`: «¿Aprobar el cierre de PRY-0012?» / «El proyecto quedará cerrado. Si hace falta, se puede reabrir con un motivo.» (coincide con «Reabrir proyecto» de `closure-panel`) / «Aprobar cierre». |
| 5.3 | Aprobar GC4 | Confirma | Constancia. |
| 5.3 | «No aplica» | `ReasonDialog` | Constancia. |
| 5.3 | Solicitar y rechazar cierre | Confirma | Constancia. GC5 no tiene aprobación manual en esta base. |
| 6.6 | Dar o quitar rol de administrador | **No confirma** (H1) | Ver abajo. |

**6.6 en detalle.** El `Switch` pasa a ser controlado: al cambiarlo no llama a la
API, abre el diálogo y se queda en su valor actual hasta confirmar. Cancelar o
Escape deja el interruptor como estaba. El interruptor lleva nombre accesible
«Administrador: {nombre}».

| | Dar | Quitar |
| --- | --- | --- |
| Título | «¿Dar el rol de administrador a {nombre}?» | «¿Quitar el rol de administrador a {nombre}?» |
| Descripción | «{nombre} podrá cambiar la configuración técnica del portal: correo, áreas, procesos, solicitantes e IA. El cambio se aplica de inmediato.» | «{nombre} dejará de poder cambiar la configuración técnica del portal. Puedes darle el rol de nuevo. No se puede quitar al último administrador activo.» |
| Botón | «Dar rol de administrador» | «Quitar rol» |
| Tono | `default` | `danger` |

El foco vuelve al interruptor de esa fila. El resultado lo anuncia el toast
existente. Si la API rechaza (último administrador), el interruptor queda en su
valor y el toast de error dice el motivo del servidor.

## 4. Accesibilidad: lista de verificación

- Contraste: §1, ambos temas. Revisar con la herramienta del navegador.
- Orden de tabulación en tabla: chip de código → título → … → acciones. En
  tarjeta: chip → título → «…» → resto.
- Tamaño de objetivos: `IdChip` ≥ 24 × 24 px (PR-C); título, «…», «Deshacer» y
  botones de diálogo 44 px en táctil.
- Roles: `role="alertdialog"` (ya), región «Notificaciones» `aria-live="polite"`
  (ya), `Field` con `aria-invalid` y `aria-describedby`.
- No depende del color: código escrito, tipo de objeto escrito, resultado en texto.
- Reducir movimiento: sin animación decorativa nueva.
- **Revisión manual pendiente** (no se puede validar sin ella): lectura con NVDA
  o VoiceOver del toast con «Deshacer» y del orden de lectura de la tarjeta de
  Auditoría; pausa del temporizador con el foco; `Alt+T`. Esta especificación
  no sustituye una revisión experta de accesibilidad.

## 5. Responsive

| Ancho | Comportamiento |
| --- | --- |
| 1440 px | Tablas con columna «Código» de 112 px. Auditoría con «Objeto» de hasta 26 rem. Toast abajo a la derecha. |
| 768–1023 px | Tablas con scroll horizontal ya existente (`Table scrollLabel`). La columna «Código» queda fija a la izquierda por orden, sin `sticky`. |
| 390 px | Lista de tarjetas con el chip sobre el título; filtro de código a ancho completo; toast a ancho completo; diálogos casi a pantalla completa con botones apilados. |
| 320 px | El chip (79 px máx.) cabe en 240 px de contenido; si hay dos chips, `flex-wrap` los baja de línea. |

## 6. Pruebas que dependen de esta especificación

- `getByRole('button', { name: /Código ACT-\d{4}, copiar/ })` en tabla y tarjeta.
- Retirar sin dependientes: `getByRole('button', { name: /Deshacer/ })` visible,
  al pulsarlo el estado vuelve a Activo y el foco queda en el «…» de la fila.
- Retirar con dependientes: `getByRole('alertdialog', { name: '¿Retirar ACT-0007?' })`,
  foco inicial en «Cancelar», Escape cierra sin cambiar el estado.
- 6.6: el interruptor no cambia hasta confirmar; cancelar lo deja igual.
- Auditoría: código inválido no dispara petición; código válido sin coincidencia
  muestra el texto de «sin resultados».
- axe (`serious` y `critical`) en `/activos/catalogo`, `/activos/documentos` y
  `/gobierno/auditoria`, claro y oscuro, a 1440 y 390 px.

## 7. Puntos abiertos

| # | Tema | Recomendación |
| --- | --- | --- |
| P1 | **Activar** un borrador no se puede deshacer y no pide confirmación. | Dejarlo como está: el efecto es bajo y el activo se puede retirar. Si el usuario prefiere simetría, usar `ConfirmDialog` `default`. |
| P2 | El texto «no borra ningún dato» del retiro con dependientes. | `desarrollador` lo contrasta con `asset-state` antes de publicarlo. |
| P3 | H1 y H2 amplían el alcance de PR-D frente al plan (cuatro diálogos nuevos y el cambio del interruptor). | Aceptarlo en PR-D: son de bajo riesgo y usan solo `ConfirmDialog`. Avisar en la descripción del PR. |
| P4 | Pausa del temporizador del toast con el foco de teclado. | Verificar con sonner 2.0.8 en la implementación. |
| P5 | Sin `GET /codes/{code}` para ACT y DOC, el buscador global no resuelve estos códigos. | Queda fuera de la oleada (BL-082). |
