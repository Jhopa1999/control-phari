# Reuniones PR-4: pendientes de calidad (búsqueda, paginación, motivo de bloqueo, solicitud relacionada y usabilidad)

Especificación visual para `desarrollador`. No incluye código de aplicación. Base funcional: `.agents/tasks/reuniones/informe.md` (secciones 1, 3, 6, 7, 8 y 9). Marca: `.kiro/steering/25-marca-gibo.md`. Reglas de frontend: `.kiro/steering/20-frontend-nextjs.md`. Patrones que se reutilizan sin cambios visuales: `oleada-3-listados.md` (búsqueda `q`, contador, paginación, recarga sin atenuar), `bitacora-selectores.md` (`SearchableSelect`), `reuniones-pr1-participantes.md` (lista de personas, avisos) y `reuniones-pr3-ia-acta.md` (bloque del formulario). Los tres bloques del formulario (PR-1, PR-3 y este) conviven en el mismo diálogo: el orden final está en el apartado 2.1.

Archivos que afecta (solo para ubicar el trabajo): `apps/web/src/app/seguimiento/reuniones/` (`reuniones-view.tsx`, `actas-panel.tsx`, `compromisos-panel.tsx`, `compromiso-form-dialog.tsx`, `reunion-form-dialog.tsx`, `compromisos-mis-reuniones-panel.tsx`), `apps/web/src/app/seguimiento/plan/block-reason-dialog.tsx` (ver 4.2) y `apps/web/src/app/mi-trabajo/commitments-section.tsx` (solo una línea de motivo).

## 0. Supuestos, dependencias y decisiones abiertas

### 0.1 Qué entra y qué no

| Bloque | Origen en el informe | Entra en PR-4 |
|---|---|---|
| A. Búsqueda y paginación en Actas y Compromisos | 4.3-2, BL-081, mejora 3 | Sí |
| B. Motivo al bloquear un compromiso | D17, mejora 7 | Sí |
| C. Solicitud o proyecto relacionado en acta y compromiso | Resumen ejecutivo punto 6, mejora 2 | Sí |
| D1. Textos de ayuda de ambos formularios | Sección 6 y objetivo «fácil para cualquiera» | Sí |
| D2. Plantilla de acta simple | Mejora 4 | Sí |
| D3. Resumen del acta para quien no asistió | Mejora 5 | Sí (solo lectura de datos que ya existen) |
| D4. Botón «Compartir acta» | Mejora 5 | **Condicional**: solo si la API entrega el endpoint (0.3 y 6.4) |
| Límites de fecha del compromiso (4.3-1) | Decisión 5 | Solo la presentación del error (6.1): la regla vive en la API |
| «Mis compromisos abiertos» | tope 500 en servidor | No se pagina en esta entrega; se anota en la sección 10 |

### 0.2 Datos que la web necesita de la API (la API decide, la web solo pinta)

1. `GET /meetings` y `GET /commitments`: parámetros `q`, `page`, `pageSize` (25, 50, 100) y cabeceras `X-Total-Count` y `X-Truncated`, igual que los listados de la oleada 3 (`use-server-table`, `pagination`). `q` de actas: título, nombre del responsable y código o título de la solicitud relacionada. `q` de compromisos: título, resultado esperado, título del acta y código de la solicitud relacionada. El placeholder solo nombra lo que de verdad se busca.
2. Los DTO de acta y de compromiso traen el **código y el título de la solicitud relacionada** (`relatedRequestCode`, `relatedRequestTitle` o los nombres que acuerden backend y desarrollador). Regla BL-039: la web nunca muestra un UUID.
3. El DTO de compromiso trae el motivo del bloqueo (hoy el campo `blockers`) y la transición a `BLOQUEADO` lo recibe y lo guarda. Si el DTO de `my-work` no lo trae, la línea de motivo en Mi trabajo (4.5) no se pinta; el resto no cambia.
4. Un buscador de solicitudes visibles para el actor (con `q`, tope de 200 y `truncated`), con la misma visibilidad que valida el servidor al guardar (`requestVisibilityWhere`). Puede ser el listado de solicitudes de la oleada 3 si aplica esa visibilidad.
5. Un buscador de actas abiertas del proceso (`state`, `processId`, `q`, tope 25) para el selector «Acta de origen» y el filtro «Acta», porque la web deja de tener todas las actas en memoria.
6. Plantillas de agenda en Maestras (catálogo editable por el administrador). Sin plantillas, el selector no se pinta. Si el seed crea plantillas nuevas, el PR lo dice y el despliegue las inserta (`15-reglas-transversales.md`, `70-despliegue.md`).
7. Cuál de las dos columnas (`relatedRequestId` o `relatedProjectRequestId`) rellena el campo único de la interfaz. **Recomendación:** `relatedProjectRequestId`, porque es la que usan los avisos de compromiso para enlazar y el nombre que ya ve la Bitácora; al editar, si solo existe la otra, se muestra esa. Lo confirma el backend y queda escrito en el PR.

### 0.3 Decisiones abiertas que afectan al diseño

| Decisión | Efecto en esta spec |
|---|---|
| Informe, decisión 1 (quién lee el contenido del acta) | D4 «Compartir acta» solo tiene sentido si compartir convierte a la persona en participante de solo lectura (así puede abrir el acta). Si la decisión es «no», D4 no se construye y D3 basta |
| Informe, decisión 2 (quién edita) | Los botones de edición y de «Compartir acta» dependen del indicador de acceso `viewerCanEdit` de PR-1; no se calculan en el cliente |
| Informe, decisión 5 (límites de fecha) | Solo cambia el texto del error (6.1) |

### 0.4 Componentes que se reutilizan tal cual

`Field`, `FormError`, `Input`, `Textarea`, `Select`, `Checkbox`, `Button`, `Dialog*`, `InlineNotice`, `EmptyState`, `ErrorState`, `StatusBadge`, `DueBadge`, `IdChip`, `SearchableSelect` (con `isComboboxExpanded` para Escape dentro del diálogo), `ServerListBody`, `DisabledReason`, `BlockedReasonBox`, `BlockedReasonLine`, `MasterDetail`, `SelectableList`, `ConfirmDialog`. Iconos de `lucide-react` ya instalado. **No se añade ninguna dependencia.**

Componentes nuevos o ampliados, todos pequeños:

| Pieza | Qué es |
|---|---|
| `ListSearchBar` | Búsqueda + contador para la columna de 320 px (3.2). Es el patrón de la oleada 3 en versión estrecha |
| `ListPager` | Paginación compacta para la columna de 320 px (3.3). `DataTablePagination` no cabe: lleva selector de filas y 5 elementos en una fila. Si `DataTablePagination` admite una variante compacta, se prefiere ampliarlo; los textos y reglas de foco de abajo son los obligatorios |
| `BlockReasonDialog` parametrizable | Hoy es de tareas (texto «Marcar como bloqueada», «tarea»). Se amplía con props opcionales de texto (`title`, `confirmLabel`, `entityLabel`, `placeholder`, `prefill`, `helper`). Con las props omitidas queda idéntico al de hoy |

### 0.5 Contrastes

Los ratios de este documento reutilizan los **medidos** en `oleada-3-listados.md` (apartado 9, método OKLCH → luminancia WCAG, ±0,05) y los de `reuniones-pr1-participantes.md` (calculados con Y ≈ L³, margen ±0,2). Un valor nuevo se marca «calculado» o «inferido». **El desarrollador confirma todos con axe y midiendo píxeles renderizados en ambos temas antes de cerrar el PR.**

## 1. Objetivo y acción principal

| Vista | Objetivo | Acción principal |
|---|---|---|
| Lista de actas y de compromisos | Encontrar una acta o un compromiso entre cientos sin cargar todo | Escribir en el buscador y abrir un resultado |
| Marcar compromiso como bloqueado | Que el equipo sepa por qué está detenido | **Marcar como bloqueado** (con motivo) |
| Formularios de acta y compromiso | Ligar la reunión o el compromiso a su solicitud sin teclear un código a ciegas | Elegir una solicitud por código o título |
| Detalle del acta | Ponerse al día en un minuto | Leer el **Resumen** (qué se decidió y quién hace qué) |
| Formulario del acta | Empezar con una estructura y no con una página en blanco | Elegir una plantilla de agenda |

## 2. Estructura

### 2.1 Formulario del acta (orden final con PR-1, PR-3 y PR-4)

1. Proceso. 2. Título. 3. Fecha y hora. 4. Duración.
5. **Solicitud o proyecto relacionado** (nuevo, PR-4).
6. Responsable. 7. Participantes y su aviso de visibilidad (PR-1).
8. Bloque «Estructurar con IA» (PR-3, si la IA está disponible).
9. Agenda, con la **fila de plantilla** (nuevo, PR-4). 10. Decisiones y acuerdos. 11. Observaciones.
12. Compromisos que se crearán al guardar (PR-3, si hay). 13. Error general y pie.

Por qué la solicitud va antes de Responsable: es contexto de la reunión (de qué trata), igual que el título, y no depende de las personas. Destaca: título y Participantes (PR-1). La solicitud es opcional y no destaca.

### 2.2 Formulario del compromiso

Proceso, Título, Vencimiento, Asignado y Responsable (con su aviso si ambos están vacíos), Acta de origen, **Solicitud o proyecto relacionado** (nuevo), Resultado esperado, Bloqueos, error general y pie.

### 2.3 Detalle del acta (`actas-panel.tsx`)

1. Cabecera (título, estado, chip de rol, acciones; PR-1).
2. Aviso de solo lectura (PR-1, si aplica).
3. **Resumen** (nuevo; solo si el acta tiene decisiones o al menos un compromiso).
4. Datos: fecha, hora, duración, responsable y **Solicitud relacionada** (nueva fila, con `IdChip`).
5. Participantes (PR-1).
6. Agenda, decisiones, observaciones, compromisos (cada compromiso bloqueado muestra su motivo, 4.5).

### 2.4 Detalle del compromiso (`compromisos-panel.tsx`)

Cabecera con título, estado y vencimiento; **caja de motivo del bloqueo** si está bloqueado (nuevo); lista de datos con la fila **Solicitud relacionada**; «Cambiar estado a:».

## 3. A. Búsqueda y paginación en Actas y Compromisos

### 3.1 Qué cambia a la vista

Actas y Compromisos son listas de maestro-detalle (`MasterDetail`, columna de 320 px), no tablas. El comportamiento es el de la oleada 3 (servidor, `q` con debounce de 300 ms, página 1 al cambiar `q` o un filtro, petición anterior cancelada, recarga sin atenuar), con la presentación estrecha de 3.2 y 3.3. Tamaño de página fijo: **25** (sin selector en la columna estrecha). El estado (`q`, filtros, página) no va a la URL; solo `tab`, `meetingId` y `commitmentId` siguen viajando como hoy.

### 3.2 Búsqueda en la columna de la lista

Se pinta dentro del slot `list`, **encima** de los ítems, en su propia franja.

| Elemento | Clases |
|---|---|
| Franja (`div role="search"`) | `sticky top-0 grid gap-1.5 border-b bg-card p-3` (el `sticky` solo actúa desde `lg`, donde la lista tiene altura máxima y desplaza; por debajo no tiene efecto y no estorba) |
| Etiqueta | `Label` `sr-only`: «Buscar actas» / «Buscar compromisos» |
| Contenedor del campo | `relative` |
| Icono `Search` | `pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground`, `aria-hidden` |
| `Input` | `type="search"` `inputMode="search"` `enterKeyHint="search"` `maxLength={100}` `autoComplete="off"`, `h-9 pl-9 pr-10 max-md:h-11`, `aria-describedby` apuntando al contador |
| Botón «Borrar búsqueda» (solo con texto) | `Button variant="ghost" size="icon-sm"` `absolute right-1 top-1/2 -translate-y-1/2 max-md:size-11`, icono `X`, `aria-label="Borrar búsqueda"`; al pulsarlo se limpia, la página vuelve a 1 y el foco regresa al campo |
| Contador | `p` `text-meta tabular-nums text-muted-foreground` con `role="status"` |

Textos:

| Vista | Placeholder | Contador (carga / N / filtrado / uno / cero) |
|---|---|---|
| Actas | «Buscar por título, responsable o solicitud» | «Cargando actas…» / «300 actas» / «12 de 300 actas» / «1 acta» / «0 actas» |
| Compromisos | «Buscar por título, acta o solicitud» | «Cargando compromisos…» / «120 compromisos» / «12 de 120 compromisos» / «1 compromiso» / «0 compromisos» |

Comportamiento (igual que oleada 3, apartado 3): sin mínimo de caracteres; `Escape` limpia el campo si tiene texto; el campo **sigue activo** en recargas y solo se deshabilita en la carga inicial (`disabled:opacity-50`); el contador se actualiza al terminar la carga, nunca por tecla. Texto de ayuda `sr-only`: «La lista se actualiza mientras escribes. Máximo 100 caracteres.» El «de 300» solo aparece si la API entrega el total sin filtrar; si no, «12 actas».

**Filtros de Compromisos.** Estado, Persona y Acta siguen sobre la lista, en la fila actual (`flex flex-wrap items-end gap-3`), y pasan a filtrar en el servidor. Cambios:

- **Acta** deja de ser un `Select` con todas las actas y pasa a `SearchableSelect` (mismo ancho `w-56`): placeholder «Todas las actas», opción fija «Sin acta», búsqueda en servidor. La opción vacía (✕) equivale a «Todas». Motivo: ya no hay todas las actas en memoria.
- Aparece `Button variant="ghost" size="sm" className="text-link"` «Limpiar filtros» solo si algún filtro o `q` difiere de su valor por defecto (Estado «Abiertos», Persona «Todas», Acta «Todas», `q` vacío). Devuelve todo al valor por defecto y el foco al campo de búsqueda.
- El filtro de Estado conserva el valor por defecto «Abiertos».

### 3.3 Paginación compacta (`ListPager`)

Va al pie del slot `list`, dentro de la misma tarjeta, después de los ítems.

```
<nav aria-label="Paginación de actas"
     className="sticky bottom-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t bg-card px-3 py-2 text-meta text-muted-foreground">
  <span className="tabular-nums">Mostrando 26–50 de 300</span>
  <div className="flex items-center gap-1">
    <Button variant="outline" size="icon-sm" className="max-md:size-11" aria-label="Página anterior"><ChevronLeft aria-hidden /></Button>
    <span className="px-1 tabular-nums">Página 2 de 12</span>
    <Button variant="outline" size="icon-sm" className="max-md:size-11" aria-label="Página siguiente"><ChevronRight aria-hidden /></Button>
  </div>
</nav>
```

| Regla | Detalle |
|---|---|
| Visibilidad | Se pinta si el total es mayor que 0. Con **una sola página** se muestra solo la posición («Mostrando 1–12 de 12») y no los botones, para no dejar controles inertes en una columna de 320 px |
| Etiqueta del `nav` | «Paginación de actas» / «Paginación de compromisos» |
| Sin filas | «Sin resultados» en lugar de la posición |
| Foco y carga | Misma regla única de la oleada 3 (apartado 5.2): durante la carga los botones llevan `aria-disabled="true"` (no `disabled`), se ignora la activación y el botón pulsado conserva el foco; `disabled` real solo en el límite natural, y entonces el foco pasa al otro botón o, si no hay otro, a la lista (`tabIndex={-1}`) |
| Página fuera de rango tras un filtro | Salta a la última existente (lo hace `use-server-table`) |
| Al cambiar de página | La lista vuelve arriba (`scrollTop = 0`) y **el detalle abierto no cambia**: no se reemplaza lo que la persona está leyendo por otro acta |
| Al cambiar `q` o un filtro | Sí se autoselecciona el primer resultado si la selección actual no está en la nueva lista (comportamiento de hoy). Con cero resultados el detalle muestra su `EmptyState` actual |

### 3.4 Selección abierta desde fuera de la página

Un enlace de notificación (`?meetingId=` o `?commitmentId=`) o «Abrir acta» desde un compromiso puede apuntar a una fila que no está en la página 25 visible. El detalle se carga **por id** (`GET /meetings/:id`, `GET /commitments/:id`) y se muestra igual; la lista no resalta ningún ítem y no se mueve de página. Si la API responde 404, el `EmptyState` «No encontramos esta acta» de PR-1 (6.5); para compromisos: icono `FileX`, título «No encontramos este compromiso», texto «Puede que se haya eliminado o que ya no tengas acceso a él.».

### 3.5 Estados de la lista (Actas y Compromisos)

| Estado | Presentación |
|---|---|
| Carga inicial | `SelectableList loading` (4 esqueletos de 56 px, ya existe), contador «Cargando actas…», sin paginación aún, detalle con su esqueleto actual |
| Recarga (con filas ya visibles) | `ServerListBody`: la lista **no se vacía ni se atenúa** (sin `opacity-*` ni velo), `aria-busy`, cursor de progreso, filas sin puntero, barra fina `bg-primary` si pasa de 400 ms (`motion-reduce:animate-none`). Contador «Cargando…» con `Loader2` (`animate-spin motion-reduce:animate-none`) |
| Vacío real (sin `q` ni filtros) | Los textos actuales de cada `empty` se conservan |
| Sin resultados (con `q` o filtros) | `EmptyState size="compact"`: título «Sin resultados», descripción «Ninguna acta coincide con la búsqueda.» / «Ningún compromiso coincide con la búsqueda o los filtros.», botón `variant="outline" size="sm"` «Limpiar búsqueda» / «Limpiar búsqueda y filtros» (devuelve el foco al campo) |
| Error de carga inicial | `ErrorState` como hoy («No fue posible cargar las actas.» / «…los compromisos.») con «Reintentar» |
| Error de recarga | `InlineNotice tone="danger" role="alert"` arriba de la lista con «No se pudo actualizar la lista. Se muestran los resultados anteriores, que pueden no corresponder a la búsqueda actual.» y «Reintentar» (lo da `ServerListBody`) |
| Truncado | `ServerListBody` ya lo avisa; con página de 25 no debería aparecer |
| Éxito | Lista y paginación, sin toast |
| Deshabilitado | Botones de paginación: ver 3.3 |
| Foco | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` en todo control; el ítem seleccionado conserva su barra y `aria-current` |

### 3.6 Consecuencias que el desarrollador debe cubrir en la interfaz

1. **Contadores de las pestañas.** «Actas (N)» usa `X-Total-Count` de la consulta sin `q` ni filtros. «Compromisos (N abiertos)» usa el total de la consulta de abiertos. La búsqueda de la lista **no cambia** el número de la pestaña. Si la API no puede dar ese total sin un tercer pedido, el número se omite sin dejar hueco.
2. **«Acta de origen» del formulario de compromiso** pasa a `SearchableSelect` con búsqueda en servidor (acta abierta del mismo proceso, tope 25; el valor guardado se muestra aunque no esté en la lista). Placeholder «Buscar acta por título». Con `fixedMeeting` sigue siendo de solo lectura.
3. **Insignias de la lista de compromisos.** Hoy un compromiso vencido muestra solo `DueBadge` y oculta que está bloqueado. Con el motivo de bloqueo (apartado 4) deben verse ambos: la prop `badge` pasa un fragmento `flex flex-col items-end gap-1` con `DueBadge` y, si `state === 'BLOQUEADO'`, `StatusBadge kind="record"`.
4. **Nombres de personas** de las listas ya vienen del DTO (PR-1); no se resuelven contra `people`.

## 4. B. Motivo al bloquear un compromiso

### 4.1 Flujo

En «Cambiar estado a:» (detalle del compromiso y compromisos del acta), el botón **«Bloqueado»** deja de cambiar el estado al instante y abre el diálogo de motivo. Los demás botones no cambian. El botón lleva `aria-haspopup="dialog"`.

### 4.2 Diálogo (`BlockReasonDialog` parametrizado)

Misma estructura, clases, contador, validación y reglas de foco que el diálogo de tareas de `seguimiento/plan/block-reason-dialog.tsx` (`DialogContent size="sm"`, `Textarea rows={4}`, máximo 500 con contador `n/500`, aviso `text-warning` desde 450 y `text-danger` en 500, región `role="status"` `sr-only`, clic fuera no cierra con texto escrito, Escape y cierre bloqueados durante el envío). Cambian solo los textos:

| Elemento | Texto |
|---|---|
| Título | «Marcar como bloqueado» |
| Descripción | «“{título del compromiso}”» (`line-clamp-2`) y debajo «Cuéntale al equipo qué lo detiene.» |
| Etiqueta | «Motivo del bloqueo (obligatorio)» |
| Placeholder | «Ej.: falta la aprobación del área financiera» |
| Error de campo vacío | «Escribe el motivo del bloqueo.» (junto al campo, foco en el campo; se valida al enviar) |
| Botón principal | «Marcar como bloqueado» / «Guardando…» |
| Botón secundario | «Cancelar» |
| Error del servidor | `FormError` dentro del diálogo; el texto escrito se conserva |
| Éxito | Toast «Compromiso marcado como bloqueado.»; el diálogo se cierra y el foco va al encabezado del detalle (lógica actual de `handleTransition`) |

**Precarga.** Si el compromiso ya tiene texto en «Bloqueos», el diálogo se abre con ese texto y una línea de ayuda `text-meta text-muted-foreground`: «Ya había un texto en Bloqueos. Déjalo o cámbialo.» Sin texto previo, abre vacío.

El límite de 500 es el de la interfaz (igual que en tareas); el campo del compromiso admite 2000 y no se recorta lo que ya exista: si el texto precargado supera 500, el contador se muestra en `text-danger` y el error de campo dice «El motivo puede tener hasta 500 caracteres. Acórtalo.».

### 4.3 Salir del bloqueo

«En curso» (u otro destino) sigue siendo un cambio inmediato, sin motivo. Fuera del estado Bloqueado, el texto guardado se ve como hoy en la fila «Bloqueos» del detalle (historial); la caja de motivo (4.4) solo se pinta con el compromiso bloqueado. Si hoy esa fila ya aparece, no se duplica: con el compromiso bloqueado, la fila «Bloqueos» no se pinta y su contenido se ve en la caja.

### 4.4 Dónde se ve el motivo

Se reutilizan `BlockedReasonBox` y `BlockedReasonLine` (ya probados con axe en tareas).

| Lugar | Componente | Detalle |
|---|---|---|
| Detalle del compromiso (`CardContent`, antes de la lista de datos) | `BlockedReasonBox clamp={false} label="Motivo del bloqueo"` | `className="mb-0"`; el bloque solo existe con `state === 'BLOQUEADO'` |
| Compromisos dentro del acta | `BlockedReasonLine` bajo el título del compromiso | Una línea con `title` completo |
| «Mis compromisos abiertos» (tarjetas y filas) | `BlockedReasonBox` (tarjeta) o `BlockedReasonLine` (tabla) | Solo con estado Bloqueado |
| Mi trabajo, cola «Compromisos» (`commitments-section.tsx`) | `BlockedReasonLine` bajo la línea de meta | Solo si el DTO trae el motivo (0.2, punto 3). Sin motivo registrado, `BlockedReasonLine` ya dice «Sin motivo registrado.» |
| Lista de compromisos | No. La insignia «Bloqueado» basta (3.6, punto 3) | Evita listas de alto irregular |

### 4.5 Formulario de edición del compromiso

Texto de ayuda en «Bloqueos»: «Si el compromiso está detenido, explica por qué. Se muestra junto al compromiso.» Si el compromiso está en estado Bloqueado y la persona vacía el campo, el error del servidor (si lo hay) aparece junto al campo con foco en él; la web no duplica la regla.

## 5. C. Solicitud o proyecto relacionado (acta y compromiso)

### 5.1 Campo

Un único campo visible, opcional, en ambos formularios. Componente: `SearchableSelect` dentro de `Field` (spec `bitacora-selectores.md`; listado en línea, sin portal, Escape que solo cierra el listado, `isComboboxExpanded` en `onEscapeKeyDown` del diálogo).

| Propiedad | Valor |
|---|---|
| `Field` | `id="reu-solicitud"` (acta) / `id="com-solicitud"` (compromiso), `label="Solicitud o proyecto relacionado"`, sin `required` (el formulario marca solo los obligatorios con `RequiredHint`; «Opcional» va en la ayuda) |
| Ayuda del acta | «Opcional. Búscala por código (PRY-0012) o por título. Sirve para encontrar la reunión después por su solicitud.» |
| Ayuda del compromiso | «Opcional. Si registras el compromiso desde un acta con solicitud, se toma de ella y puedes cambiarla.» |
| `placeholder` | «Buscar por código o título» |
| `listLabel` | «Solicitudes y proyectos» |
| `clearLabel` / `clearSearchLabel` | «Quitar solicitud relacionada» / «Borrar búsqueda» |
| Opción | `code` = código de la solicitud (se pinta con `IdChip variant="full"`: la lista mezcla proyectos), `label` = título, `meta` solo `Cerrada` en tono neutral si la solicitud está cerrada; otros estados no se muestran |
| Valor elegido | `PRY-0012 · Título` en el input y línea de resumen con el título completo, como define el componente |
| Valor guardado que ya no se puede listar | Grupo «Valor actual» con etiqueta «No disponible» (regla E6 del componente); nunca queda el campo vacío ni se muestra un UUID |
| Truncado | Pie del componente «Mostrando las primeras 200. Escribe para acotar.» |
| Estado deshabilitado | Acta cerrada o archivada: el campo no se pinta en el formulario (solo admite duración) y la solicitud se lee en el detalle |

Valor por defecto del compromiso: con `fixedMeeting` (compromiso nacido de un acta) el campo nace con la solicitud del acta. Los compromisos que PR-3 crea después de guardar el acta heredan la del acta (se le pasa al `POST /commitments`). En ambos casos la persona puede cambiarla o quitarla.

### 5.2 Estados

| Estado | Tratamiento |
|---|---|
| Cargando opciones | El componente muestra el estado `loading` (con valor elegido es de solo lectura; sin valor, deshabilitado) |
| Sin resultados | Texto del componente |
| Error al cargar opciones | `InlineNotice tone="warning" role="note"` bajo el campo: «No pudimos cargar las solicitudes. Puedes guardar sin relacionar una y hacerlo después.» con `Button variant="outline" size="sm"` «Reintentar». El resto del formulario sigue usable |
| Error del servidor por solicitud sin acceso (400 o 404) | Error junto al campo (`Field error`), foco en el input: «No tienes acceso a la solicitud elegida. Quítala o elige otra.» |
| Enviando | Se deshabilita junto al resto (`submitting`) |
| Foco | Anillo `ring-ring` del componente |

### 5.3 Dónde se ve

| Lugar | Presentación |
|---|---|
| Detalle del acta (fila de datos) | Término «Solicitud relacionada». Valor: `IdChip variant="full"` copiable y, a su derecha, el título como enlace `text-link underline-offset-4 hover:underline` hacia `/demanda/solicitudes/{id}`. Sin solicitud: «—» con `sr-only` «Sin solicitud relacionada» |
| Detalle del compromiso (`DescriptionList`) | Misma fila con `span: 2` |
| Lista de actas y de compromisos (meta del ítem) | `IdChip variant="full" copyable={false}` al final de la línea de meta (`ml-1 align-middle`). `copyable={false}` es obligatorio: el ítem es un `<button>` y no se anidan controles |
| Resumen del acta (6.3) | Solo en el contexto de la línea de datos, no se repite |
| Mi trabajo | No se cambia en PR-4 |

Contraste del `IdChip`: el de `25-marca-gibo.md` (≥ 4,5:1, texto `text-foreground` sobre `bg-muted`, ≈ 11,9:1 claro y ≈ 12:1 oscuro según PR-1). Tamaño mínimo 24 × 24 px.

## 6. D. Usabilidad

### 6.1 Textos de ayuda de los formularios (`Field help`, `text-meta text-muted-foreground`)

Si un campo ya tiene una ayuda equivalente, se conserva y no se duplica. Todas se enlazan con `aria-describedby` (lo hace `Field`).

**Acta**

| Campo | Ayuda |
|---|---|
| Proceso | «Define quién puede ser responsable y participante.» |
| Título | «Un nombre corto que se entienda solo. Por ejemplo: Seguimiento semanal de soporte.» |
| Fecha | «Día en que ocurrió o va a ocurrir la reunión.» |
| Hora | «Formato de 24 horas, por ejemplo 14:30.» |
| Duración | «En minutos, de 15 en 15. Hace falta para cerrar el acta.» |
| Agenda | «Los temas a tratar. Puedes preparar el acta antes de la reunión: queda abierta hasta que la cierres.» |
| Decisiones y acuerdos | «Lo que se decidió. Para cerrar el acta hace falta al menos una decisión o un compromiso.» |
| Observaciones | «Notas que no son decisiones ni compromisos.» |

**Compromiso**

| Campo | Ayuda |
|---|---|
| Título | «Qué se compromete, empezando por un verbo. Por ejemplo: Enviar el informe de cierre.» |
| Vencimiento | «Avisamos a la persona asignada (o a la responsable si no hay asignada) un día antes, el mismo día y si se vence.» |
| Asignado | «Quien hace el trabajo.» |
| Responsable | «Quien responde porque se cumpla. Si no eliges asignado, a esta persona se le avisa.» |
| Resultado esperado | «Qué debe quedar hecho para dar el compromiso por cumplido.» |
| Bloqueos | Ver 4.5 |

**Aviso de compromiso sin persona.** Cuando Asignado y Responsable están vacíos, bajo la fila de ambos aparece `InlineNotice tone="warning" role="note"` sin título: «Sin asignado ni responsable, nadie verá este compromiso en Mi trabajo ni recibirá avisos.» No bloquea el envío (la API lo admite). Desaparece al elegir cualquiera de los dos. Texto en `text-foreground` sobre `bg-warning-subtle` (el par de texto saturado `warning` sobre `warning-subtle` está medido en 6,10:1 claro y 8,6:1 oscuro; `foreground` es más oscuro o más claro que ese texto, así que el ratio es mayor).

**Errores de fecha.** El rango permitido de `dueDate` (4.3-1) lo valida la API. El error del servidor se muestra junto al campo «Vencimiento» con foco en él, tal como llega («La fecha límite debe estar entre …»). La web no calcula el rango ni lo repite en la ayuda.

**Cierre del acta.** El botón «Cerrar acta», cuando no se puede cerrar por falta de datos, usa `unavailable` (queda enfocable con `aria-disabled="true"`) y un `DisabledReason` enlazado con `aria-describedby`: «Para cerrar el acta registra la duración y al menos una decisión o un compromiso.» No se añade si el botón ya explica ese motivo.

### 6.2 Plantilla de agenda («acta simple»)

**Fila de plantilla.** Encima del `Textarea` de Agenda, en el mismo bloque:

```
<div className="flex flex-wrap items-end justify-between gap-2">
  <Label htmlFor="reu-agenda">Agenda</Label>                    (la etiqueta del Field)
  <Select value="" onValueChange={insertTemplate}>
    <SelectTrigger aria-label="Insertar plantilla de agenda"
                   className="h-8 w-full sm:w-56 max-md:h-11">
      <SelectValue placeholder="Usar una plantilla" />
    </SelectTrigger> ...
```

| Regla | Detalle |
|---|---|
| Opciones | Las plantillas del catálogo de Maestras, por nombre. Sin opción «Sin plantilla»: el control vuelve siempre a su placeholder tras insertar |
| Cuándo se pinta | Solo al **crear** o editar un acta **abierta**, y solo si el catálogo tiene al menos una plantilla activa. Con catálogo vacío o error de carga, no se pinta y no deja hueco (la plantilla es una ayuda, no un requisito) |
| Al elegir | Agenda vacía: se rellena con el texto de la plantilla. Agenda con texto: la plantilla se **agrega al final** tras una línea en blanco. **Nunca reemplaza** lo escrito (acción no destructiva, por eso no pide confirmación) |
| Deshacer | Tras insertar aparece bajo el `Textarea` `p role="status"` `text-meta text-muted-foreground`: «Se insertó la plantilla “Acta simple”.» y `Button variant="link" size="sm" className="text-link"` «Deshacer». Restaura el texto previo y devuelve el foco al `Textarea`. Desaparece en cuanto la persona edita la agenda |
| Foco | Tras insertar, el foco va al `Textarea` y el cursor al final del texto insertado |
| No cabe | Si el texto resultante supera el máximo de la agenda (5000), no se inserta y bajo la fila aparece el error `text-danger` «La agenda ya es muy larga para agregar la plantilla.» |

**Textos de plantilla sugeridos para el seed** (editables por el administrador desde Maestras; son el valor inicial, no una constante del código):

*Acta simple*

```
1. Revisión de compromisos anteriores
2. Temas a tratar
3. Acuerdos y responsables
4. Próximos pasos y fecha de la siguiente reunión
```

*Reunión de seguimiento*

```
1. Avances desde la última reunión
2. Bloqueos y riesgos
3. Decisiones que se necesitan
4. Compromisos nuevos: quién, qué y para cuándo
```

### 6.3 Resumen del acta (para quien no asistió)

Bloque nuevo en el detalle del acta, **antes** de los datos. Solo lee lo que el acta ya trae: no hay llamada nueva ni IA.

| Elemento | Clases y contenido |
|---|---|
| Contenedor `<section aria-labelledby="acta-resumen-title">` | `grid gap-3 rounded-xl border border-border bg-muted/40 p-4` |
| Encabezado | Icono `ClipboardList` `size-4 shrink-0 text-link` (`aria-hidden`) y `h3#acta-resumen-title` `text-sm font-semibold text-foreground`: «Resumen» |
| Subtítulo | `text-meta text-muted-foreground`: «Lo esencial para ponerse al día: qué se decidió y quién hace qué.» |
| Bloque «Qué se decidió» | `h4` `text-sm font-semibold`; texto de `decisions` en `p` `whitespace-pre-line text-sm text-foreground wrap-break-word`, con `line-clamp-6` si supera unos 400 caracteres y un `Button variant="link" size="sm" className="text-link"` «Ver todo» / «Ver menos» con `aria-expanded`. Sin decisiones: `text-sm text-muted-foreground` «No se registraron decisiones.» |
| Bloque «Quién hace qué» | `h4` `text-sm font-semibold`; `<ul class="grid gap-2">`; cada fila `flex flex-col gap-1 rounded-lg bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between`: a la izquierda el título (`text-sm font-medium wrap-break-word`) y debajo `text-meta text-muted-foreground` «{persona asignada o responsable} · Vence {fecha}» (o «Sin persona asignada»); a la derecha `DueBadge` y, si está bloqueado, `StatusBadge`. Hasta 5 filas; con más, `Button variant="ghost" size="sm"` «Ver los N restantes» (`aria-expanded`, `aria-controls`) que despliega en el mismo sitio. Sin compromisos: «No se registraron compromisos.» |
| Pie | Sin botones: «Descargar acta» e «Imprimir / PDF» ya están en la cabecera |

Cuándo se pinta: el acta tiene decisiones o al menos un compromiso. Con ninguno de los dos, el bloque no existe (no se muestra un resumen vacío). Aplica a todas las personas que ven el acta, incluidas las de solo lectura; no distingue a quien asistió.

Estados: cargando (el esqueleto del detalle cubre el bloque, no se pinta antes de tener datos), error (hereda el del detalle), vacío (no se pinta), éxito, foco (los botones «Ver todo» y «Ver los N restantes» llevan anillo `ring-ring`). El nombre de la persona viene del DTO (PR-1), nunca «Persona fuera de tu alcance».

Contrastes: `text-foreground` sobre `bg-muted/40` (la mezcla es más clara que `bg-muted`, así que el ratio es mayor o igual al de `bg-muted`, ≈ 11,9:1 claro y ≈ 12:1 oscuro, PR-1); `text-foreground` sobre `bg-card` 14,75:1 claro y ≈ 14,9:1 oscuro; `text-muted-foreground` sobre `bg-card` 7,13:1 y 7,62:1.

### 6.4 Compartir acta (condicional a 0.3)

Se construye **solo si** la API entrega la acción y la decisión 1 del informe permite que compartir convierta a la persona en participante de solo lectura. Si no, se omite sin dejar rastro en la interfaz.

- **Botón.** En la cabecera del acta, junto a «Descargar acta»: `Button variant="outline" size="sm"` con icono `Send` y texto «Compartir acta». Se pinta solo si `viewerCanEdit` es verdadero y el acta no está archivada.
- **Diálogo** (`size="md"`): título «Compartir acta»; descripción «Avisa a otras personas del proceso para que lean esta acta.»
- **Cuerpo.** Aviso `InlineNotice tone="info" role="note"`: «Quienes elijas recibirán una notificación y quedarán como participantes de solo lectura: podrán leer el acta completa, con los compromisos de todos.» Lista de personas del proceso que **no** participan aún, con el mismo patrón de casillas, buscador (más de 8 personas), contador y estados que Participantes en PR-1 (3.3 y 4). Campo opcional `Field` «Mensaje (opcional)» con `Textarea` `rows={3}` `maxLength={300}`, ayuda «Se incluye en la notificación.»
- **Pie.** «Cancelar» (`outline`) y «Compartir» (`default`). «Compartir» usa `unavailable` mientras no haya ninguna persona marcada, con el texto de estado «Marca al menos una persona.» Sin personas disponibles: `EmptyState` compacto «Todo el proceso ya participa en esta acta.»
- **Resultado.** Toast «Acta compartida con 3 personas.» El diálogo se cierra, el detalle se recarga (la lista de participantes crece) y el foco vuelve al botón «Compartir acta». Error del servidor: `FormError` dentro del diálogo, con la selección conservada.

## 7. Badges semánticos usados

| Dónde | Texto | Componente o tono | Icono |
|---|---|---|---|
| Estado del compromiso (lista, detalle, acta) | Bloqueado / En curso / Completado | `StatusBadge kind="record"` existente | el actual |
| Vencimiento | Vencido, Vence hoy, etc. | `DueBadge` existente | el actual |
| Compromiso vencido y bloqueado | Ambos badges a la vez | `DueBadge` + `StatusBadge` (3.6, punto 3) | los actuales |
| Rol y acceso (PR-1) | Responsable, Participante, Solo lectura | Ver `reuniones-pr1-participantes.md`, apartado 7 | los de PR-1 |
| Solicitud cerrada en el listado del selector | Cerrada | `border-neutral-border bg-neutral-subtle text-neutral`, 7,2:1 claro y 9:1 oscuro (PR-1) | ninguno (el texto basta) |
| Código de solicitud | `PRY-0012` | `IdChip variant="full"` | ninguno |

Ningún estado ni prioridad va en texto plano. Nada se transmite solo por color: todos llevan texto.

## 8. Accesibilidad

### 8.1 Contrastes (tokens ya medidos; ver 0.5)

| Par | Claro | Oscuro | Mínimo | Origen |
|---|---|---|---|---|
| `text-muted-foreground` / `bg-card` (contador, paginación, ayudas) | 7,13:1 | 7,62:1 | 4,5:1 | medido, oleada 3 |
| `text-foreground` / `bg-card` | 14,75:1 | ≈ 14,9:1 | 4,5:1 | medido, oleada 3 |
| `text-foreground` / `bg-primary-subtle` | 12,0:1 | 12,2:1 | 4,5:1 | medido, oleada 3 |
| `text-muted-foreground` / `bg-primary-subtle` | 5,81:1 | 6,2:1 | 4,5:1 | medido, oleada 3 |
| `text-danger` / `bg-danger-subtle` (etiqueta «Motivo del bloqueo», contador al límite) | 5,83:1 | 6,56:1 | 4,5:1 | medido, oleada 3 |
| `text-foreground` / `bg-danger-subtle` (texto del motivo) | mayor que 5,83:1 | mayor que 6,56:1 | 4,5:1 | inferido: el texto `foreground` es más contrastado que `danger` sobre el mismo fondo |
| `text-warning` / `bg-warning-subtle` (aviso sin persona, contador en 450) | 6,10:1 | 8,6:1 | 4,5:1 | medido, oleada 3 |
| `text-link` / `bg-card` («Deshacer», «Ver todo», «Limpiar filtros», enlace de solicitud) | ≈ 6,1:1 | ≈ 8:1 | 4,5:1 | calculado del HEX `#145CCB` (Y ≈ 0,121) sobre blanco; oscuro, de la guía de marca (cian 8,15:1 sobre lienzo) |
| `text-neutral` / `bg-neutral-subtle` | ≈ 7,2:1 | ≈ 9:1 | 4,5:1 | calculado, PR-1 |
| Borde del `Input` de búsqueda / `bg-card` | 3,95:1 | 3,81:1 | 3:1 | medido, oleada 3 |
| `bg-primary` con `text-primary-foreground` (botones principales) | 4,84:1 | 4,84:1 | 4,5:1 | guía de marca |
| Barra de recarga `bg-primary` / `bg-card` (gráfico, no texto) | 4,84:1 | 3,37:1 | 3:1 | medido, oleada 3 |

Los valores «calculado» e «inferido» deben pasar por axe y por medición de píxeles.

### 8.2 Estructura y roles

- Búsqueda: `role="search"`, etiqueta real `sr-only`, `type="search"`, botón «Borrar búsqueda» con nombre accesible y 44 px en móvil.
- Contador: único `role="status"` de cada lista; se actualiza al terminar la carga, no por tecla.
- Paginación: `nav` con `aria-label` por lista; posición y «Página N de M» son texto; botones con `aria-label` y la regla de foco de 3.3.
- Selector de solicitud: combobox ARIA 1.2 del componente existente; el foco DOM permanece en el input.
- Diálogo de motivo: `aria-describedby` con el error y el contador; `role="status"` `sr-only` para los avisos de 450 y 500.
- Cajas de motivo: el texto está en el DOM completo (con `title` en la variante de una línea); los iconos son `aria-hidden`.
- Resumen: `section` con `aria-labelledby`; `h3` del bloque y `h4` de cada parte; botones de despliegue con `aria-expanded` y `aria-controls`.
- Plantilla: el `Select` tiene `aria-label` propio (la etiqueta visible «Agenda» pertenece al `Textarea`); «Deshacer» es un `button` real.
- Avisos: `role="note"` para los permanentes, `role="status"` para los que informan de un cambio, `role="alert"` solo para errores.

### 8.3 Orden de tabulación

- **Lista de actas:** buscador, «Borrar búsqueda» (si hay texto), ítems de la lista, Página anterior, Página siguiente, detalle.
- **Lista de compromisos:** Estado, Persona, Acta, «Limpiar filtros» (si aparece), buscador, «Borrar búsqueda», ítems, Página anterior, Página siguiente, detalle.
- **Formulario del acta:** Proceso, Título, Fecha, Hora, Duración, Solicitud relacionada, Responsable, Participantes (según PR-1), bloque de IA (según PR-3), selector de plantilla, Agenda, «Deshacer» (si aparece), Decisiones, Observaciones, Cancelar, Crear acta.
- **Formulario del compromiso:** Proceso, Título, Vencimiento, Asignado, Responsable, Acta de origen, Solicitud relacionada, Resultado esperado, Bloqueos, Cancelar, Guardar.
- **Detalle del acta:** cabecera y acciones, (Compartir acta), Resumen y sus botones, datos y enlace de solicitud, participantes, contenido y compromisos.

### 8.4 Teclado y foco

- Escape en el selector de solicitud solo cierra su listado; con el listado cerrado cierra el diálogo (E3 del selector).
- Al cerrar el diálogo de motivo por éxito, el foco va al encabezado del detalle; al cancelar, vuelve al botón «Bloqueado» que lo abrió.
- Al borrar la búsqueda, el foco regresa al campo. Al «Limpiar búsqueda y filtros» desde el estado sin resultados, también al campo.
- Tamaño de objetivos: ≥ 24 × 24 px en escritorio (WCAG 2.5.8) y 44 px con `max-md` o `pointer-coarse` en los controles nuevos.
- Movimiento: solo `animate-pulse` y `animate-spin`, ambos con `motion-reduce:animate-none`. No hay otra animación.

### 8.5 Lo que este diseño no valida

Contraste, tamaño de objetivo y orden son comprobaciones de diseño. Antes de cerrar el PR hacen falta pruebas manuales con lector de pantalla (NVDA y VoiceOver) del anuncio del contador al buscar, del cambio de página con teclado, del selector de solicitud dentro del diálogo y del diálogo de motivo, y una revisión experta de accesibilidad. La deuda declarada `label-content-name-mismatch` (WCAG 2.5.3) en Reuniones no se resuelve aquí.

## 9. Responsive

| Ancho | Búsqueda y paginación | Formularios | Detalle |
|---|---|---|---|
| Móvil (< 640 px; verificar a 390 px) | La lista queda sobre el detalle (`MasterDetail` ya apila por debajo de 1024 px). Buscador a ancho completo, 44 px; paginación en dos filas (posición arriba, botones debajo); filtros de Compromisos apilados y `w-full`; «Limpiar filtros» a ancho completo | Diálogo a ancho completo; el selector de plantilla ocupa toda la fila bajo la etiqueta Agenda; el selector de solicitud mide 44 px y su listado se limita al teclado virtual como define su spec | Resumen con filas apiladas (título arriba, insignias debajo); `IdChip` y enlace de solicitud en dos líneas, sin desbordar. Botones del motivo `max-sm:min-h-11` |
| Tablet (640 a 1023 px) | Igual que móvil con lista y detalle apilados; filtros en una o dos filas con `flex-wrap` | Como el actual (`sm:grid-cols-2` donde ya existe) | Resumen con fila en dos columnas desde `sm` |
| Escritorio (≥ 1024 px) | Columna de 320 px: buscador y paginación `sticky`, contenido desplazable con `lg:max-h-[calc(100dvh-8rem)]` (lo da `MasterDetail`) | Diálogo `size="md"`; plantilla alineada a la derecha de la etiqueta | Resumen a ancho del detalle |

La página no debe ensanchar el viewport en 390 px. Comprobar con un título de acta de 80 caracteres, una solicitud de título largo (`wrap-break-word`, `line-clamp-2` en la lista), un motivo de 500 caracteres sin espacios y un nombre de persona de 60 caracteres.

## 10. Notas para `desarrollador` y fuera de alcance

1. **Archivos grandes.** `actas-panel.tsx` (689 líneas) y `compromisos-panel.tsx` (414) crecen con esta entrega. Conviene extraer `acta-resumen.tsx`, `list-search-bar.tsx` y `list-pager.tsx` (nombres sugeridos) y no mezclar lógica nueva en los paneles.
2. **Reutilización.** El resumen y la caja de motivo no deben leer más datos que los del DTO. No se inventa ningún estado nuevo: se usan `dueStatusOf`, `DueBadge` y `StatusBadge`.
3. **Fuera de PR-4.** «Mis compromisos abiertos» conserva su carga completa (tope de 500 en servidor); si crece, será otra entrega con su especificación. Los avisos de notificación a participantes son de PR-1. El cambio de Mi trabajo que muestra compromisos futuros es de PR-2.
4. **Textos.** Son definitivos salvo el límite de 500 (alineado con las tareas) y los nombres de plantilla, que son valores iniciales del seed.
5. **Español con tildes, UTF-8 sin BOM.** Antes de commitear se pasa `npm run check:encoding`.

## 11. Qué revisar al implementar

1. Con 60 actas y 120 compromisos de prueba: buscar por título, por responsable y por código de solicitud; la página vuelve a 1; la lista no se vacía al recargar; el contador de la barra y «Mostrando X–Y de Z» coinciden.
2. Abrir un compromiso por enlace de notificación que no está en la página visible: el detalle carga y la lista no se mueve.
3. Enter repetido en «Página siguiente»: avanza sin perder el foco; en la última página pasa a «Página anterior».
4. Bloquear un compromiso: se pide motivo; sin motivo aparece el error junto al campo; con motivo, la caja se ve en el detalle y la línea en el acta. Un compromiso vencido y bloqueado muestra los dos badges.
5. Elegir una solicitud por código y por título en el acta y en el compromiso; editar y comprobar que se muestra el `IdChip` y nunca el UUID; probar una solicitud ya no visible («No disponible»).
6. Un compromiso nacido de un acta con solicitud la hereda; los compromisos propuestos por IA (PR-3) también.
7. Plantilla: insertar en agenda vacía y con texto, «Deshacer» y el límite de 5000.
8. Resumen: acta con 8 compromisos (5 visibles, «Ver los 3 restantes»), acta sin decisiones y sin compromisos (no hay bloque).
9. axe en claro y oscuro a 1440 y 390 px de la lista, los dos formularios y el diálogo de motivo, durante una recarga lenta simulada: cero `color-contrast`.
10. Sin colores crudos de Tailwind ni `opacity-*` en la lista durante la recarga.
