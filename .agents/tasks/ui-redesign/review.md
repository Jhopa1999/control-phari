# Rediseño UI/UX de control-phari: integración de los 12 tramos y costuras finales

La rama `feat/ui-redesign` (25 commits sobre `main`, 177 archivos, solo `apps/web`, `e2e`, `docs/README.md`, `playwright.config.ts` y el lock) migra las 26 rutas al sistema de diseño nuevo: tokens, Inter, primitivas, componentes compartidos, shell con menú por flujo, riel y cajón, login y pantallas de error. No cambia ninguna URL ni toca `apps/api`, Prisma, OpenAPI ni `packages/api-client`. El último commit (`a14e1bc`) cierra los cinco hallazgos bajos de la revisión de cimientos. Juzgué el diff y la evidencia de `verification.md` y los `int-*.txt` sin volver a ejecutar las suites: typecheck, build, 434 pruebas unitarias, 57 E2E en dev-header más 6 en jwt, 208 + 12 capturas automáticas y build Docker, todo en verde. Además revisé a ojo 19 capturas de `review\`, lo que el implementador no pudo hacer.

Watch for: al cambiar «Objeto» en Auditoría, las respuestas no se cancelan y una petición lenta puede pisar a la más reciente (**likely**, baja). El aviso de tope sigue diciendo «Usa el filtro Objeto» aunque el filtro ya esté puesto (**confirmed**, baja). El §24.2 no tiene ninguna prueba automática de regresión (**confirmed**, baja). Ningún hallazgo es alto ni medio.

**Verdict**: APPROVED

## Visión de conjunto

El §24.2 de Auditoría se cumple en los cuatro puntos. «Objeto» se envía al servidor como `objectType` y recarga la lista. Sus opciones salen de `AuditEventsQuery['objectType']`, que deriva de `paths` del cliente generado, a través de un `Record` exhaustivo que rompe el typecheck si el contrato cambia. La unión de 4 valores escrita a mano ya no está en `lib/audit.ts`. «Acción» filtra solo en cliente y su ayuda dice «Acota lo que se muestra; no cambia la consulta.». Con 500 eventos, el conteo y la paginación hablan de «eventos más recientes» y aparece el aviso de tope. Con menos, el conteo es un total («61 eventos» para la integrante). El único resto es de API: el contrato declara 4 tipos de objeto aunque el DTO acepte 26, y queda como pendiente en `docs/README.md`.

Las costuras entre tramos encajan. Los enlaces encadenados (Solicitudes → Triage → Priorización → Planificación → Controles, Aprobaciones → «Ver plan», Mi trabajo y Planificación → detalle de tarea) usan `?requestId=` o `?taskId=` codificados, y cada vista de destino adopta el parámetro cuando termina de cargar. La invariante del §24.1 se respeta en todo el código: las 7 vistas con paginación pintan `DataTablePagination`, y Planificación · Tareas y Capacidad · Resumen pasan `pageSize: null` sin control de paginación. La invariante tiene su prueba en `web-lib.spec.ts`. El menú conserva los 21 módulos y el filtrado por `allowedModules`. Que «Tareas» salga del menú y quede activo «Mi trabajo» es una decisión cerrada del diseño, no una capacidad perdida.

El barrido visual es coherente en todas las pantallas que revisé (Panel, Solicitudes, Triage, Planificación, Bitácora, Documentos, Controles, Auditoría, Proyectos, login en los dos modos, Indicadores sin permiso, riel con sombra de scroll). Todas usan la misma cabecera, toolbar, tabla con cabecera atenuada, badges sutiles, `EmptyState` con icono y acento único. A 390 px no hay desbordes. Las cinco correcciones de `a14e1bc` se ven aplicadas en las capturas o en el código.

<details>
<summary>Issues (6)</summary>

1. **Carrera en la recarga de Auditoría** (baja, likely): si se cambia «Objeto» o se pulsa «Limpiar filtros» mientras hay una carga en curso, la respuesta que llega última sustituye a la otra aunque sea de la consulta anterior. Conviene descartar las respuestas obsoletas con un contador de petición o un `AbortController` dentro de `load`.
2. **Aviso de tope con Objeto ya filtrado** (baja, confirmed): con un tipo de objeto elegido y 500 resultados, el aviso sigue diciendo «Usa el filtro Objeto para acotar la búsqueda». Conviene ajustar el texto cuando `objectFilter !== ALL`, por ejemplo «Son los 500 más recientes de este tipo de objeto».
3. **Sin prueba de regresión del §24.2** (baja, confirmed): el envío de `objectType`, el `take=500` fijo y el texto «eventos más recientes» solo se comprobaron con un script temporal que ya se borró. Conviene añadir un caso E2E pequeño (dev-header) que intercepte `/audit-events` y compruebe el parámetro y el conteo.
4. **Recarga innecesaria de procesos y personas** (baja, confirmed): cada cambio de «Objeto» vuelve a pedir `listProcesses()` y `listCoordinationPeople()`, que no dependen del filtro. Conviene cargarlos una sola vez y recargar solo los eventos.
5. **Contrato de `objectType` con 4 valores** (baja, confirmed, pendiente de API): el filtro solo ofrece Proceso, Usuario, Asignación de rol y Elemento de maestra porque el `@ApiQuery` del controlador fija esos 4. Está documentado en «Decisiones pendientes». Al ampliar el enum en la API y regenerar el cliente, el typecheck obligará a completar `AUDIT_OBJECT_TYPE_FILTER`.
6. **`next-env.d.ts` modificado sin commitear en el worktree** (baja, confirmed): `next dev` reescribió las rutas de `.next/dev/types`. No está en ningún commit, pero hay que restaurarlo antes de integrar para que no entre por accidente.

</details>

<details>
<summary>Detalles</summary>

### Auditoría: el filtro de servidor y sus bordes

`AuditoriaView.load(objectType)` hace `setState('loading')` y espera a `Promise.all` de eventos, procesos y personas. No hay ningún identificador de petición. `handleObjectChange` y `clearFilters` llaman a `load` directamente. Si el usuario elige «Usuario» y enseguida «Elemento de maestra», y la primera respuesta llega más tarde, la tabla muestra eventos de Usuario con el selector en Elemento de maestra. Eso es justo el tipo de «filtro deshonesto» que quería evitar el §24.2 (**likely**: el código lo permite; con la API local las respuestas tardan pocos milisegundos y cuesta reproducirlo). Es un modo de fallo silencioso: no hay error, solo datos que no corresponden al filtro. En el mismo `Promise.all`, procesos y personas se piden de nuevo en cada cambio aunque no dependen de `objectType`.

El aviso de tope tiene un texto fijo:

```tsx
{state === 'success' && capped ? (
  <InlineNotice tone="info">
    Se muestran los 500 eventos más recientes de tu alcance. Usa el filtro Objeto para acotar
    la búsqueda.
  </InlineNotice>
) : null}
```

Con «Elemento de maestra» elegido (173 eventos hoy) no aparece. Pero si un tipo supera los 500, la sugerencia de usar Objeto ya no sirve. Tampoco hay otra forma de ver más eventos hasta que exista la paginación de API registrada en §22 (**confirmed**).

### Cobertura de pruebas

No probado: el filtro de servidor de Auditoría y su texto de tope, de forma automática. `global-error.tsx` con Inter, pintado en un navegador (solo build y Docker). Los flujos con escritura de cada pantalla (aprobar, autorizar, registrar triage, crear usuario, revocar rol, etc.), que se dejaron para la QA final porque mutan la base compartida. Lectores de pantalla, `forced-colors` y tema oscuro.

### Barrido visual

En las capturas de `INTEGRACION-1\barrido\review` y `jwt\review` la composición es la misma en todas las pantallas. La cabecera tiene `h1` y descripción a la izquierda y la acción principal a la derecha («Nueva solicitud», «Nuevo diario», «Nuevo documento»). El toolbar lleva etiquetas encima y el conteo alineado a la derecha. Las tablas tienen cabecera `muted`, ordenación con iconos y acciones en línea o en menú. Los maestro-detalle (Bitácora) muestran la lista seleccionada con la barra de acento. Los estados vacíos llevan icono y dos líneas (Triage, Planificación, Controles, Proyectos). El aviso de rol aparece en Indicadores para la integrante. El login en dev-header ya no sobrepasa el viewport ni dibuja el recuadro gris. En jwt ocupa la pantalla con `bg-muted`. El riel a 1100×800 muestra la sombra superior al final del scroll. Proyectos de la integrante dice «usa Portafolio.» con un solo enlace. En los datos de demostración siguen nombres de proceso sin tilde («Coordinacion multiproceso»). Son datos del seed, no texto de UI, y quedan fuera del alcance.

</details>

<details>
<summary>Mapa de archivos</summary>

Infraestructura web: `package.json` y `package-lock.json` (Radix tooltip, dropdown-menu y tabs con versión exacta), `next.config.ts`, `globals.css` (tokens, utilidad `nav-scroll-shadow`) y `layout.tsx` (Inter). Shell: `app-shell`, `app-sidebar`, `mobile-nav`, `brand`, `skip-link`, `route-guard`, `lib/navigation.ts` y `lib/use-sidebar-mode.ts`. Errores y login: `app/{error,global-error,not-found}.tsx` y `login/{page,login-form}.tsx`. Componentes compartidos: 23 en `components/` (data-table, data-view, master-detail, requirements-panel, row-actions, field, dialogs, etc.) y primitivas en `components/ui/`. Utilidades: `lib/{format,status-presentation,table-sort,use-client-table,plan-guide,task-filters,use-request-param,safe-redirect,status-labels}.ts` y los mensajes de los wrappers. Auditoría: `lib/audit.ts` y `lib/api-client.ts` (`AuditEventsQuery`). Vistas: las 26 rutas de `app/`. Pruebas: `e2e/{web-lib,shell-navigation,jwt-session,date-display}.spec.ts`, ajustes en `catalogs` y `responsible-selector`, y `playwright.config.ts` con URLs por entorno. `docs/README.md`.

Diff completo: `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\ui-redesign diff main`.

</details>
