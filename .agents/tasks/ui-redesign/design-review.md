# Revisión de diseño: renovación integral de UI/UX (control-phari), iteración 4

Documento revisado: `design.md`, iteración 4 (respuesta a la revisión 3: 0 HIGH, 2 MEDIUM, 6 NIT). La revisión se hizo en frío y por lectura contra el worktree `.worktrees/ui-redesign` (rama `feat/ui-redesign`, baseline `0918f1b`), el inventario de capacidades, el backend y el cliente generado en solo lectura, los specs E2E actuales, el lockfile y la documentación de Next incluida en `node_modules`. No ejecuté comandos, builds ni pruebas.

**Veredicto: CHANGES_REQUESTED.** 0 HIGH, 2 MEDIUM, 8 NIT.

Los 8 hallazgos de la iteración 3 están atendidos en el cuerpo del diseño, y la autocorrección de esta iteración (`TooltipTarget`) es correcta: lo comprobé en el código de `@radix-ui/react-slot@1.4.0` instalado. Estado de los criterios de bloqueo:

1. Tokens claro y oscuro en OKLCH, tipografía, espaciado y densidad: completos y concretos; recalculé cuatro contrastes y coinciden.
2. Primitivas y componentes compartidos: completos, salvo `useClientTable` (hallazgo 1), las variantes de `RowActions` (hallazgo 5) y la regla de `ResultCount` (hallazgo 7).
3. Arquitectura del menú: 23 `href` en §8.5 más `/seguimiento/tareas`, `/catalogs` y `/login` son las 26 rutas; `/` sigue redirigiendo y `/catalogs` sigue siendo el healthcheck.
4. `allowedModules` y doble modo de autenticación: se conservan; la única corrección funcional en jwt es la de §8.7, sancionada por el orquestador.
5. Bloqueos: salen de la API o de los predicados actuales extraídos; no hay reglas nuevas.
6. Dependencias: tres paquetes Radix con versión exacta y justificación; sin librerías de UI nuevas.
7. Estados y copys: cubiertos y con ortografía correcta, salvo los mensajes del hallazgo 6.
8. WCAG 2.2 AA: el marcado especificado es correcto; los hallazgos 3, 4 y 9 son huecos de foco y de acceso al dato.

No hay riesgo de tocar backend ni contrato. Los dos MEDIUM bloquean porque, implementados al pie de la letra, ocultan filas (hallazgo 1) o presentan como completo un listado truncado en Auditoría (hallazgo 2).

## Hallazgos

### 1. MEDIUM: `useClientTable` no tiene modo sin paginación, y dos tablas lo necesitan (§7.6, §9 A, §11.9, §11.11)

**Dónde.**

- §7.6 define `UseClientTableOptions` (`rows`, `filter`, `comparators`, `defaultSort`, `resetKey`) y un `ClientTable` que solo expone `pageRows`, con «Tamaño de página por defecto: 25».
- §9 A fija «Paginación: No» para «Planificación · Tareas» y para «Capacidad · Resumen de carga», las dos con orden en cliente.
- §11.11 lo pide de forma literal: «useClientTable sin paginación; orden de la API por defecto».

**Problema.** La opción «sin paginación» no existe en la API especificada. Una vista que use `useClientTable` para ordenar recibe como mucho 25 filas en `pageRows`:

- Si sigue §9 A y no pinta `DataTablePagination`, las filas 26 en adelante desaparecen sin aviso: un plan con más de 25 tareas, o un jefe con más de 25 personas en su alcance.
- Si pinta la paginación (`DataTablePagination` se muestra sola con `filtered > 25`), contradice §9 A.

El número de tareas por plan no tiene tope. Los datos de prueba ya suman 33 tareas en 14 fases, así que el caso es realista en Planificación.

**Por qué bloquea.** Es una firma citada pero no definida (criterio 2), y su lectura literal oculta datos.

**Corrección.** Añadir el modo de forma explícita y decir quién lo usa:

```ts
interface UseClientTableOptions<T, K extends string> {
  // …opciones actuales…
  paginate?: boolean; // por defecto true
}
// paginate === false:
//   pageRows = todas las filas filtradas y ordenadas; page = 1; pageCount = 1;
//   from = filtered > 0 ? 1 : 0; to = filtered; setPage y setPageSize no hacen nada.
//   La vista no pinta DataTablePagination.
```

«Planificación · Tareas» y «Capacidad · Resumen de carga» pasan `paginate: false`. La alternativa equivalente es que esas dos vistas usen `sortRows` y `nextSort` de `table-sort.ts` con su propio estado de orden, y que §11.11 deje de citar `useClientTable`.

### 2. MEDIUM: Auditoría filtra, cuenta y pagina en cliente sobre una respuesta truncada a 500 eventos, sin decirlo (§11.19, §9 A, §17)

**Dónde.** §11.19 añade sobre `listAuditEvents()` los filtros en cliente «Objeto» (`aud-filtro-objeto`, «con las opciones presentes en los datos») y «Acción», un `ResultCount` de eventos y paginación de 25.

**Problema.** Esto es lo que hay hoy en el código:

- `apps/api/src/modules/audit/audit.service.ts` devuelve como mucho `MAX_AUDIT_TAKE = 500` eventos, los más recientes (`orderBy: { createdAt: 'desc' }`, `take ≤ 500`).
- El mismo endpoint ya acepta `objectType`. `ListAuditEventsDto` admite 26 valores con `@IsIn`, los mismos 26 que etiqueta §11.19. También acepta `take`.
- El wrapper `apps/web/src/lib/audit.ts` ya los envía (`AuditFilters { objectType?, take? }`), aunque su tipo local `AuditObjectType` solo enumera 4 valores.
- `auditoria-view.tsx` llama hoy a `listAuditEvents()` sin filtros.

Cada alta, edición, transición y revocación genera un evento de auditoría. En cuanto el alcance supere los 500 eventos:

- `ResultCount` dirá «500 eventos» como si fuera el total.
- Filtrar por Objeto mostrará solo los de esa ventana. «Plan» puede dar «3 de 500 eventos», o «Ningún resultado coincide con los filtros.», aunque existan cientos de eventos de planes más antiguos.

Hoy la tabla también se corta en 500, pero sin filtros ni contador se lee como «lo más reciente». El filtro por objeto y el conteo convierten ese corte en un dato engañoso, justo en la pantalla de auditoría.

**Por qué bloquea.** Se presenta como completa información que no lo es, en Gobierno, y el diseño no menciona el tope. Hace falta decidir antes de implementar.

**Corrección.** No toca backend ni contrato. Hay que elegir:

- Opción preferida: «Objeto» pasa a filtro de servidor con el parámetro que ya existe, como en Portafolio.
  - Al cambiar el filtro, la vista llama a `listAuditEvents({ objectType, take: AUDIT_TAKE })` y recarga.
  - Las opciones son las 26 etiquetas de §11.19, no «las presentes en los datos».
  - Se amplía el tipo local `AuditObjectType` de `lib/audit.ts` a esos 26 valores, un cambio solo de web.
  - «Acción» sigue en cliente.
- Opción mínima: los dos filtros siguen en cliente, como dice §11.19, y solo se añade el aviso del tope que sigue.
- En cualquiera de las dos opciones:
  - Pedir `take` de forma explícita con una constante del frontend (`AUDIT_TAKE = 500`), sin depender del valor interno del servidor.
  - Si `events.length === AUDIT_TAKE`, mostrar bajo el toolbar `InlineNotice tone="info"` con «Se muestran los 500 eventos más recientes de tu alcance. Usa el filtro Objeto para acotar la búsqueda.».
  - En ese caso, `ResultCount` usa el sustantivo «eventos más recientes».
- Añadir el caso a §16 y §17, y a la QA manual de §20.

### 3. NIT: el foco que se restaura por script abre los tooltips de etiqueta también con ratón (§8.4, §7.6, §11.9, §14)

**Problema.** El diseño quita el tooltip de «Más acciones» y de «Abrir menú» porque, cuando Radix les devuelve el foco, «el tooltip se abriría solo, también con ratón» (§7.6 y §14). Pero introduce tres movimientos de foco por script hacia controles con `LabelTooltip`:

- §8.4: tras pulsar «Contraer menú» con el ratón, el foco pasa a «Expandir menú».
- §7.6: al llegar al extremo con «Página siguiente», el foco pasa a «Página anterior».
- §11.9: tras reordenar, el foco vuelve a `#phase-{id}-{dir}`, que está en `LabelTooltip` o en `DisabledHint`.

Según la secuencia de `TooltipTrigger` que describe §7.4, `onFocus` abre el tooltip si el foco no viene de un `pointerdown`. Esa marca es de cada disparador. En los tres casos el `pointerdown` ocurrió en otro botón, o ya terminó, así que el tooltip se abre. Con ratón, cada uno de esos clics deja abierto un tooltip que no sigue al puntero, hasta que el usuario hace otra cosa.

**Corrección.** Abrir por foco solo cuando el foco es visible. En `LabelTooltip` y en `DisabledHint`:

```tsx
<TooltipTrigger
  asChild
  onFocus={(e) => {
    if (!e.currentTarget.matches(':focus-visible')) e.preventDefault();
  }}
>
```

El `composeEventHandlers` de Radix no ejecuta su apertura si el evento llega con `defaultPrevented`, y React lo marca aunque el evento nativo de foco no sea cancelable. Chromium marca `:focus-visible` cuando la interacción anterior fue de teclado, también si el foco llega después por script, y no lo marca tras un clic. Así se conserva la restauración de foco para todos, incluidos los lectores de pantalla, y desaparece el tooltip suelto. La apertura por clic de `DisabledHint` (`onUnavailableClick`) no cambia.

Alternativa: restaurar el foco solo si la activación fue por teclado (`event.detail === 0`), guardando ese dato en la ref de `handleMovePhase`.

### 4. NIT: el foco se pierde cuando la acción retira el control enfocado (§9 A, §10.2, §11.18, §7.5, §11.21, §14)

**Problema.** El diseño cuida el foco en la paginación, al reordenar fases y en el botón de riel (§14: «el foco no se pierde…»). No lo hace con los controles que desaparecen al usarse:

- «Limpiar filtros» solo existe con algún filtro activo (§9 A). Al pulsarlo deja de existir y el foco cae en `body`. El paso 8 del E2E lo pulsa.
- «Ver validaciones» cambia a la pestaña Validaciones. Radix desmonta el `TabsContent` inactivo, y con él el botón enfocado.
- `ConfirmDialog` de eliminar (fase, tarea, diario, actividad, reunión, asignación) y «Revocar», que se oculta al revocar (§11.21): Radix devuelve el foco al disparador, que ya no está en el DOM.

Con teclado o con lector de pantalla, el usuario vuelve al principio del documento o se queda sin posición.

**Corrección.** Añadir una regla en §14 y una línea por caso:

- «Limpiar filtros» lleva el foco al primer control del toolbar: `#sol-buscar`, `#mt-buscar`, `#portafolio-buscar`, `#filtro-busqueda`, `#doc-filtro-busqueda` o `#aud-filtro-objeto`.
- «Ver validaciones», después de cambiar de pestaña y en el siguiente `requestAnimationFrame`, lleva el foco al `TabsContent` de Validaciones, al que Radix da `tabIndex=0`.
- `ConfirmDialog` y `ReasonDialog` reciben la prop `returnFocusTo?: () => HTMLElement | null`. En `onCloseAutoFocus`, si el disparador ya no está conectado (`!trigger.isConnected`), se llama a `e.preventDefault()` y se enfoca el destino:
  - En tablas, la fila siguiente (su `CellTitle` o su primera acción) o, si la tabla quedó vacía, el encabezado de la `Section` (`tabIndex=-1`).
  - En maestro‑detalle, el encabezado del detalle del registro que queda seleccionado o, si no quedan registros, el título de la lista.

### 5. NIT: los botones de fila de Aprobaciones usan variantes que `RowActions` no admite (§11.8 frente a §7.6 y §1)

**Problema.**

- §11.8 pide en cada fila «Aprobar» `default sm` y «Devolver» `outline sm` (y, por analogía, «Autorizar»).
- §7.6 pinta toda acción inline como `ghost` (o `ghost-destructive`), y `RowAction` no tiene `variant`.
- Un botón primario en cada fila choca además con el principio 2 de §1 («Una acción principal por región») y con el problema que señala §2 («Bitácora muestra 3 botones primarios a la vez»).

El implementador tiene que elegir entre cambiar la API compartida o ignorar §11.8.

En la misma línea, §11.11 pide un `Badge warning` «Plan supera lo disponible» «con srDescription», pero esa prop solo existe en `StatusBadge`.

**Corrección.**

- Usar `RowActions` sin excepción: «Aprobar», «Autorizar» y «Devolver» como `ghost sm`, igual que en el resto de tablas. Si se quiere más énfasis, añadir a `RowAction` `variant?: 'ghost' | 'outline'` (sin `default`) y documentarlo en §7.6.
- En §11.11, pintar `<Badge variant="warning">Plan supera lo disponible</Badge>` seguido de `<span className="sr-only">: {explicación}</span>` como hermano, o añadir un `kind` a `StatusKind`.

### 6. NIT: tres puntos sin cerrar en los mensajes de validación (§9, §11.18, §7.5)

**Problema.**

- (a) §11.18 dice «Errores de "tipo, caso, resultado, ejecutor, fecha" en sus campos». Hoy esa regla tiene un único mensaje combinado: «Completa tipo, caso, resultado, ejecutor y fecha de ejecucion.» (`frameworks-view.tsx`, validación de `handleCreateValidation`). §9 exige que los mensajes sean «exactamente los del inventario», y no hay cinco mensajes por campo definidos.
- (b) La regla 3 de §9 dice que «los campos implicados en una regla combinada llevan `aria-invalid`», pero no aclara si son todos o solo los que incumplen. Con «Catálogo y código son obligatorios.» y el catálogo ya relleno, marcarlo como inválido es incorrecto. Lo mismo pasa con «Identificador y nombre son obligatorios.» y con «Usuario, rol y proceso son obligatorios.».
- (c) `ReasonDialog` fija «Escribe el motivo.», distinto del texto actual de `DevolverDialog` («El motivo es obligatorio para devolver.»), sin declararlo como cambio.

**Corrección.**

- (a) Fijar cinco mensajes por campo: «Elige el tipo de validación.», «Escribe el caso de prueba.», «Elige el resultado.», «Indica quién ejecutó la validación.» e «Indica la fecha y hora de ejecución.». Es coherente con «se muestran todos los errores a la vez». La otra opción es mantenerla como regla combinada en `FormError`.
- (b) `aria-invalid`, y el `aria-describedby` hacia el `FormError`, solo en los campos implicados que incumplen la regla.
- (c) Declarar el cambio de texto en §13, o fijar el mensaje según `kind`: «El motivo es obligatorio para devolver.» para devolver y «Escribe por qué este control no aplica.» para «No aplica».

### 7. NIT: no está definida la regla de `ResultCount` («N» frente a «N de M»), ni la de vacío frente a sin resultados con filtros de servidor (§7.6, §9 A, §11.12)

**Problema.** `ResultCount({ loading, total, filtered, noun })` distingue «sin filtros» y «con filtros», pero no recibe si hay filtros, así que hay que deducirlo. Tampoco se dice cómo elige `DataView` entre `empty` y `no-results` en Portafolio, donde los tres filtros son de servidor. Con filtros activos y 0 filas, `useClientTable` ve `total = 0`, y la vista caería en el vacío («No hay iniciativas…») en lugar de «Ningún resultado coincide con los filtros.», aunque «Limpiar filtros» sí aparece en el toolbar.

**Corrección.** Fijar:

```ts
// ResultCount: filtered === total → formatCount(total, noun)
//              en otro caso      → `${filtered} de ${formatCount(total, noun)}`
// Estado de DataView en listados:
//   hasFilters = búsqueda no vacía || algún filtro ≠ su centinela (incluidos los de servidor);
//   total === 0 && !hasFilters → 'empty';  filtered === 0 && hasFilters → 'no-results'.
// Portafolio: total = filas que devuelve el servidor con sus filtros; filtered = tras la búsqueda en cliente.
// Maestras conserva su excepción (§11.22).
```

### 8. NIT: `StatStrip` con `divide-x divide-y` deja bordes dobles en la rejilla de 2 columnas (§7.6, §5.3)

**Problema.** `StatStrip` usa `grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 rounded-lg border`. Las utilidades `divide-*` reparten el borde según el orden de los hijos, no según la fila o la columna. Con 2 columnas y 4 tiles, los tiles 2 y 3 llevan un borde pegado al borde exterior del contenedor. Pasa con la semántica de Tailwind 4 (`:not(:last-child)`) y con la de Tailwind 3, aunque con lados distintos. Son los bordes dobles que §5.3 prohíbe, y se verían por debajo de 1024 px en el Panel del área y en el consolidado del Reporte semanal.

**Corrección.** Usar separadores de hueco de 1 px en lugar de `divide-*`:

```tsx
// StatStrip
<section aria-label={label}
  className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
// StatTile
<div className="bg-card p-4">…</div>
```

Con un número impar de tiles en 2 columnas, el último lleva `col-span-2`. En `lg`, usar `lg:grid-cols-2`, `lg:grid-cols-3` o `lg:grid-cols-4` según el número de tiles (de 2 a 4), para no dejar una celda vacía con el fondo del borde.

### 9. NIT: en Auditoría, el id completo de un actor fuera de alcance solo queda en `title` (§11.19)

**Problema.** Hoy la columna Actor muestra el `actorUserId` completo (`auditoria-view.tsx`: `{event.actorUserId ?? 'Sistema'}`). §11.19 lo sustituye, para actores fuera de alcance, por «xxxxxxxx…» con el id completo en `title`.

- `title` en un `span` solo aparece al pasar el ratón, y los lectores de pantalla no lo leen de forma fiable.
- `VerCambioDialog` no muestra el actor.

El dato completo, que figura en el inventario («Actor (actorUserId o "Sistema")»), deja de estar disponible con teclado y con lector de pantalla.

**Corrección.** Mantener el id corto en la tabla y añadir a la cabecera de `VerCambioDialog` un `DescriptionList` con Fecha, Actor (nombre e id completo, o «Sistema»), Proceso, Acción y Objeto. El `title` se queda como ayuda para ratón.

### 10. NIT: hay specs que se escriben antes de la pantalla que comprueban (§21, pasos 3 y 4)

**Problema.** El paso 3 de §21 crea el «E2E de navegación» y añade a `date-display.spec.ts` la prueba de Mi trabajo, que «debe fallar antes de migrar Mi trabajo». Pero:

- El paso 8 de `shell-navigation.spec.ts` comprueba la tabla nueva de Solicitudes (la región «Tabla de solicitudes», `ResultCount`, la paginación y «Registro, ordenar»), que no existe hasta el paso 4 (b).
- Mi trabajo no se migra hasta el paso 4 (a).

Entre esos pasos, quien ejecute los specs del paso para validarlo verá fallos esperados que se confunden con regresiones, y los commits intermedios no pasan la suite.

**Corrección.**

- Añadir el paso 8 de `shell-navigation.spec.ts` en el mismo commit que Solicitudes (paso 4 b).
- Añadir la prueba de fecha de Mi trabajo al inicio del paso 4 (a): falla, se migra Mi trabajo y pasa, dentro del mismo incremento.
- Indicar que, al cerrar cada paso, pasan los specs que ese paso toca.

## Supuestos verificados

### Respuestas a la iteración 3 (§23)

| # | Estado | Comprobación |
|---|---|---|
| 1 | Atendido | §10.2 y §11.18 usan las mismas tres condiciones (`isWaived`, `showGc4Block`, `showActions`). En el contrato, `validationSummary` es `GateValidationSummaryDto \| null` y trae `approvable` y `blockingReasons: string[]`. El `GateCard` actual calcula `blockedReason` sin mirar el estado del control, y el id actual es `${gateCode}-block`. |
| 2 | Atendido | El fixture rellena todos los campos de `RequestResponseDto`, incluidos `mainProcessId: string` y `participants`. `Request` vive en `lib/api-client.ts`, que lanza un error al importarse sin `NEXT_PUBLIC_API_BASE_URL`, y por eso se importa con `import type`. Los ids del fixture son UUID válidos (12 dígitos en el último grupo). |
| 3 | Atendido | §8.3, `isRail` vale `false` en `variant === 'drawer'`, y el paso 4 del E2E lo comprueba. |
| 4 | Atendido | Cálculo por fila en §10.2 y precedencia en §10.3. `phase.service.ts` devuelve las fases por `order asc` y responde 409 si se reordena moviendo la fase inicial con tareas. |
| 5 | Atendido | `app-sidebar.tsx` lleva hoy `aria-label="Usuario actual"` en el `SelectTrigger`, y ningún spec lo usa. |
| 6 | Atendido | Hoy el selector es `disabled={!canReview \|\| busy}`; §11.18 lo oculta para quien no revisa. |
| 7 | Atendido | Respaldo `doneTitle ?? title` y `doneDescription ?? description` en §7.4 y §10.1. |
| 8 | Atendido | Paso 6 de §21. Hoy `docs/README.md` dice «Jest (solo apps/api)» y solo nombra `e2e/catalogs.spec.ts`. |

### Tooltips y `Slot` (autocorrección de esta iteración)

- `apps/web/node_modules/@radix-ui/react-slot` es la 1.4.0.
- Su `mergeProps` trata `aria-describedby` aparte: `concatAriaDescribedby(child, slot)`, sin duplicados, y devuelve `undefined` si no queda ningún id.
- Por tanto, el `<Slot {...props} aria-describedby={undefined} />` de `TooltipTarget` descarta la descripción que añade el disparador y conserva la del control. Funciona igual tanto si `TooltipTrigger` concatena como si sustituye.
- Los manejadores se fusionan (primero el del hijo y después el del slot) y la `ref` se compone con la del hijo. `DisabledHint` y `LabelTooltip` funcionan como describe §7.4.

### Rutas, menú y permisos

- Bajo `app/` hay 27 `page.tsx`: `/` y 26 rutas.
- No existen `not-found.tsx` ni `error.tsx`.
- `compose.prod.yaml` usa `fetch('http://localhost:3000/catalogs')` como healthcheck de la web.
- `navigation.ts` tiene hoy 24 ítems en 6 grupos, y `app-sidebar.tsx` usa `h2` para los grupos.
- `ModuleKey` coincide con las 21 claves de `MODULE_MATRIX`.
- `module-matrix.ts` solo importa el enum `RoleCode`, que es TS puro, así que se puede cargar desde el runner de Playwright.
- `INTEGRANTE` no tiene `demandOverview`, `triage`, `priority`, `plan`, `admin`, `review` ni `team`; el paso 2 de §20 es coherente.

### Autenticación (§8.7)

- `ActorProvider` arranca con `actorId = null` y lee la identidad en su efecto de montaje.
- El efecto de `RouteGuard` redirige si `!isAuthenticated`, y en `/login` siempre pinta el formulario.
- Existen `login()`, `logout()` y `reload()`.
- Las claves de `localStorage` son `authToken`, `authUser` y `actorId`.
- `MyPermissionsResponseDto.userId` existe.
- `LoginForm` usa `useSearchParams` dentro de un `Suspense` y hace `router.replace('/inicio')`.
- `seed.ts` define `DEV_PASSWORD` como constante.

### Planificación

- `handleMovePhase` espera a `refreshPlanData()` antes de `setBusy(false)`, así que el efecto de foco ya ve el nuevo orden.
- «+ Tarea» y «Eliminar» usan `disabled={busy || hasTasks}` (líneas 418 y 433).
- La fase inicial es la de menor `order`.
- «Solo mis tareas» compara `responsibleUserId` con `actorId`.
- En Prisma, `Task` solo tiene `@@index([phaseId])`.
- Los 8 códigos y las categorías de `plan-guide.service.ts` coinciden con §10.2.

### Contratos usados por las pantallas

- Existen los campos que se citan del resumen de capacidad: `estado`, `sobrecargado`, `cargaParcial` y `planSobreDisponible`.
- En el portafolio existen `priorityBand`, `blockedReason`, `responsibleName` y `currentScore`.
- `CoordinationPersonDto` trae `{ id, name, identifier }`, así que el `Select` de ejecutor puede usar ids de usuario.
- `GET /catalog-items` no tiene `@Roles`.
- Las acciones de auditoría son `CREATE`, `UPDATE`, `DELETE` y `REVOKE`, y los 26 tipos de objeto coinciden con §11.19.
- En auditoría, el tope de 500 y el filtro `objectType` existen y el wrapper ya los admite (base del hallazgo 2).
- El formulario de validación tiene hoy un único mensaje combinado (base del hallazgo 6).

### E2E e infraestructura de pruebas

- Playwright usa `Desktop Chrome` (1280 px), `workers: 1`, un `globalSetup` que escribe `actorId` y `webServer` que reutiliza los servidores fuera de CI.
- `listMyWork` llama a `GET /my-work` sin query, así que el patrón `**/my-work` coincide.
- `catalogs.spec.ts` tiene los tres usos de `Catalogo` y de `Codigo`, y busca el 409 con `page.getByText`; los cambios de §20 son exactos.
- `responsible-selector.spec.ts` usa `/Nuevo activo/i` y `dialog.getByLabel('Responsable')`.
- `lucide-react` y `react` están izados en la raíz del worktree (CJS resoluble desde `e2e/`).
- Existen los iconos `rotate-ccw-clock`, `panel-left-close`, `panel-left-open`, `chart-gantt`, `chart-no-axes-combined`, `notebook-pen` y `circle-minus`.
- `apps/web/tsconfig.json` tiene `strict`, `noUnusedLocals`, `noUnusedParameters` y lib ES2021, y no incluye `e2e/`.
- No hay configuración de ESLint.

### Next, sonner, estilos y lockfile

- Documentación de Next 16.4 en `node_modules/next/dist/docs`:
  - `retry` es estable desde la v16.3.0.
  - `global-error` debe pintar su propio `<html>` y `<body>`, importar los estilos y usar `<title>`, porque no admite `metadata`.
  - El `not-found.js` raíz atiende las URL sin ruta y admite `metadata`.
  - `devIndicators.position: 'bottom-right'` es válido.
- Los tipos de sonner 2.0.8 incluyen `containerAriaLabel`, `toastOptions.closeButtonAriaLabel`, `position`, `richColors` y `closeButton`.
- El `globals.css` actual tiene `--radius: 0.625rem`, y la paleta `neutral-*` no se usa en ningún `.tsx`.
- Lockfile:
  - En la raíz están izadas `react-primitive@2.1.3`, `react-slot@1.2.3`, `react-compose-refs@1.1.2` y `react-use-controllable-state@1.2.2`.
  - `react-dialog@1.2.0` fija `react-slot@1.4.0`, `react-primitive@2.1.11`, `primitive@1.1.7` y `portal@1.1.18`, el mismo tren que describe §4.
- Contrastes recalculados a mano desde el hex: `--input` sobre blanco da 3,65; `--muted-foreground` sobre blanco, 6,53; `--primary-foreground` sobre `--primary`, 6,67; `--warning` sobre `--warning-subtle`, 6,09. Coinciden con §5.1.

## Supuestos no verificados o incorrectos

- **Falta en el diseño.** §11.19 da por hecho que `listAuditEvents()` devuelve todos los eventos visibles, y devuelve como mucho los 500 más recientes (hallazgo 2).
- **Firma no definida.** §11.11 cita «useClientTable sin paginación», una opción que la API de §7.6 no tiene (hallazgo 1).
- **Inexacto, sin efecto.** §4 dice que las dependencias compartidas existen «solo anidadas», pero `@radix-ui/react-popper@1.3.8` y `@radix-ui/react-portal@1.1.18` están izadas en la raíz. El criterio de aceptación del paso 4 compara pares `nombre@versión`, así que no cambia.
- **No verificado por mí:**
  - El comportamiento interno de `@radix-ui/react-tooltip@1.3.0`: no está instalado y no lo descargué. `TooltipTarget` no depende de esos detalles.
  - Las versiones, `peerDependencies` y transitivas de los tres paquetes nuevos (requiere `npm view` o la instalación). Los pasos 4 y 5 de §4 detienen la instalación si no se cumplen.
  - Cómo resuelve Playwright el preflight CORS de un `GET` interceptado entre orígenes.
  - Que Tailwind 4.3.3 genere `text-neutral` y `bg-neutral-subtle` con el reinicio `--color-neutral-*: initial`. §5.4 tiene respaldo y §20 lo comprueba en el build.
  - El reparto exacto de `divide-*` en Tailwind 4.3.3 (no lo compilé). El hallazgo 8 se da con la semántica de la v3 y con la de la v4.
  - Que Chromium no marque `:focus-visible` en un foco por script después de un clic, que es en lo que se apoya la corrección del hallazgo 3. Se confirma en la QA manual.
  - El render real, el anuncio con lectores de pantalla y el build Docker con `next/font/google`. El diseño ya los deja para §20.

## Veredicto

El conteo es mecánico: 0 HIGH + 2 MEDIUM > 0, así que el veredicto es **CHANGES_REQUESTED**. Los dos MEDIUM tienen arreglos acotados y solo de frontend: una opción `paginate` en `useClientTable` (o `sortRows` directo) y una decisión sobre el tope de Auditoría (filtro de servidor con el parámetro existente y aviso del tope). Los 8 NIT no bloquean, pero conviene resolverlos en la misma iteración.
