# Plan de implementación — Renovación integral de UI/UX del portal (control-phari)

Fuentes normativas, en orden de precedencia:

1. `design.md` §24 (resoluciones del orquestador; prevalece sobre todo lo demás).
2. `design.md` §0–§23 (diseño aprobado y cerrado; no se reabre).
3. `design-review.md` (iteración 4): sus 8 NIT se atienden al tocar cada archivo (§24.3); la asignación está en la tabla de abajo.
4. `inventario-capacidades.md`: contrato de «ninguna capacidad perdida».

Todos en `c:\Users\analistabi2\Desarrollo\control-phari\.agents\tasks\ui-redesign\`. Código en el worktree `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\ui-redesign` (rama `feat/ui-redesign`, base `main` = `0918f1b`). Entorno, comandos y protocolo detallado: `context.json` en la misma carpeta. Pasos ejecutables de cada tramo: `features\FEAT-NNN.json`.

## Cómo se ejecuta

- 12 tramos secuenciales (FEAT-001 … FEAT-012), uno por paso de implementación. Primero los cimientos (tramos 1–5: defecto de sesión, tokens y primitivas, utilidades, componentes compartidos, shell); después las pantallas agrupadas por patrón (tramos 6–12). Ningún tramo de pantallas necesita un componente que no exista ya.
- Por qué 12 y no menos: el diseño ocupa 2.017 líneas (270 KB) y el código a migrar suma unos 560 KB en 70 archivos de `apps/web/src/app`. Ningún paso de implementación puede leer y reescribir todo eso con calidad. Cada tramo cabe en un paso, deja el repo compilando y se verifica solo (typecheck, build, E2E que le afectan y capturas de sus rutas).
- Después de los tramos: bucle de integración y revisión (veredicto en `review.json`), QA final (veredicto en `qa-review.json`) y merge.
- Si el flujo no se reestructurara, el paso de implementación recorre estos mismos tramos en este orden.

## Protocolo de verificación común (todo tramo)

1. `npm run typecheck:web` tras cada ítem; `npm run typecheck` (api + api-client + web) al cerrar el tramo.
2. `npm run build:web` al cerrar el tramo, con el `next dev` del worktree detenido (Next 16 guarda el estado de dev en `apps/web/.next/dev` y `next build` reescribe `.next`); volver a arrancarlo después.
3. Servidores **del worktree**: API en 3301 y web en 3300 (scripts `start-api.cmd` / `start-web.cmd` de la carpeta `scripts` de artefactos). Nunca se tocan los del usuario en 3000/3001. Solo un `next dev` a la vez en el worktree.
4. E2E, en el mismo comando de PowerShell: `$env:E2E_WEB_URL='http://localhost:3300'; $env:E2E_API_URL='http://localhost:3301'; $env:WEB_ORIGIN='http://localhost:3300'; npm run test:e2e -- <specs>`. Modo jwt: API con `AUTH_MODE=jwt` y un `JWT_SECRET` de prueba, web con `NEXT_PUBLIC_AUTH_MODE=jwt`, más `E2E_AUTH_MODE=jwt` y `E2E_JWT_PASSWORD` (la `DEV_PASSWORD` del seed), y solo `e2e/jwt-session.spec.ts`.
5. Capturas con `scripts\capture-check.cjs` (lo crea el tramo 2) en `screenshots\FEAT-NNN\`: 1440×900, 1280×800, 768×1024 y 390×844, roles jefe e integrante BI como mínimo. Checks automáticos por captura: sin desbordamiento horizontal (`scrollWidth <= innerWidth`), sin errores de consola, exactamente un `h1`, foco visible al tabular. Los fallos en rutas del tramo se corrigen; los de rutas aún no migradas se anotan como preexistentes.
6. Comprobación de mojibake (Ã, Â, â€) en `apps/web/src`, `e2e` y `docs`: 0. Comando en `context.json`.
7. Verificar sin mutar datos de la base compartida: los diálogos se abren, se validan vacíos y se cancelan. Los únicos datos que se crean son los que ya gestionan los E2E existentes (catálogo reservado). Los flujos completos con alta de datos quedan para la QA final.
8. Evidencia: resultados reales en `findings` del FEAT y una sección `## FEAT-NNN` en `verification.md`.
9. Commits locales en `feat/ui-redesign` (`git add` de archivos concretos, mensajes estilo repo). Nunca push. Nunca se commitean artefactos, capturas, scripts, `.env*` ni `lock-pares-antes.json`.

## Decisiones del plan (huecos del diseño resueltos aquí)

- **D1. Agrupación por patrón.** Paneles F juntos (Panel del área, Indicadores y Capacidad; Capacidad pasa de §21(c) a este tramo). Maestro‑detalle B en dos tramos (registro diario; coordinación). Listados A de activos, documentos y maestras juntos. Las mesas de trabajo de demanda (Triage, Priorización) van con sus listados de origen (Solicitudes, Aprobaciones), para que los enlaces «Ir a…» y los toasts encadenados se prueben en el mismo tramo. Planificación (C) va con Tareas (D) y Portafolio (A). Gobierno (C + A + D) cierra, junto con la limpieza final.
- **D2. Pantallas piloto.** Mi trabajo (listado A) y Proyectos (vacío) se migran en el tramo 4 para validar en pantalla los componentes compartidos antes de usarlos en el resto. La prueba de fecha de Mi trabajo se añade en ese mismo tramo (NIT 10).
- **D3. E2E configurable también en `playwright.config.ts`.** Su `baseURL` y los `webServer.url` están fijados a 3000/3001 y, con `reuseExistingServer`, la suite reutilizaría los servidores del usuario (ya ocurrió: `web-login/verification.md`). Se leen `E2E_WEB_URL` y `E2E_API_URL`. `global-setup.ts` y `responsible-selector.spec.ts` leen `WEB_ORIGIN`. Los valores por defecto son idénticos a los actuales, así que la CI no cambia.
- **D4. `useClientTable` (§24.1).** `pageSize` es obligatorio en las opciones, de tipo `25 | 50 | 100 | null`, para que cada vista lo declare de forma explícita (§24.1.1). La invariante vive en una función pura `buildTableView` de `lib/table-sort.ts` (filtrar → ordenar → paginar), que el hook usa y `e2e/web-lib.spec.ts` prueba sin navegador.
- **D5. Paginación «siempre» (§24.1.4).** `DataTablePagination` se pinta siempre que la tabla está en estado `ready`, haya o no más filas que el tamaño de página. En `empty` o `no-results` no se pinta, porque `DataView` sustituye la tabla por el estado vacío.
- **D6. Auditoría: opciones de «Objeto» (§24.2).** El contrato generado declara solo 4 valores de `objectType` (`PROCESS`, `USER`, `GRANT`, `CATALOG_ITEM`), porque `apps/api/src/modules/audit/audit.controller.ts` los fija en `@ApiQuery`, aunque `ListAuditEventsDto` acepta 26 en ejecución. Esta tarea no toca la API ni el contrato. Por tanto, el filtro ofrece esos 4 valores, derivados del tipo generado con un `Record` exhaustivo (el typecheck falla si el contrato cambia). Las 26 etiquetas de §11.19 se usan para mostrar la columna Objeto. El pendiente (alinear `@ApiQuery` con `OBJECT_TYPES` y regenerar contratos) se documenta en `docs/README.md` y en el resumen final.
- **D7. NIT 5.** «Aprobar», «Autorizar» y «Devolver» son `RowActions` `ghost sm`; no se añade variante nueva. En Capacidad, `<Badge variant="warning">Plan supera lo disponible</Badge>` lleva un `span` `sr-only` hermano con la explicación.
- **D8. NIT 6.**
  - (a) La validación de Controles muestra cinco mensajes por campo: «Elige el tipo de validación.», «Escribe el caso de prueba.», «Elige el resultado.», «Indica quién ejecutó la validación.» e «Indica la fecha y hora de ejecución.».
  - (b) `aria-invalid`, y el `aria-describedby` hacia `FormError`, solo en los campos implicados que incumplen la regla.
  - (c) `ReasonDialog` recibe `requiredMessage`: «El motivo es obligatorio para devolver.» al devolver y «Escribe por qué este control no aplica.» en «No aplica».
- **D9. NIT 4 (foco que se pierde).** «Limpiar filtros» lleva el foco a la búsqueda del toolbar (`#sol-buscar`, `#mt-buscar`, `#portafolio-buscar`, `#filtro-busqueda`, `#doc-filtro-busqueda`) o, en Auditoría, a `#aud-filtro-objeto`. «Ver validaciones» enfoca el `TabsContent` de Validaciones en el siguiente `requestAnimationFrame`. `ConfirmDialog` y `ReasonDialog` aceptan `returnFocusTo` para cuando el disparador desaparece.
- **D10. Maestras y su E2E juntos.** El texto 409 de `lib/catalog.ts` y los textos de Maestras se corrigen en el tramo 11, en el mismo commit que `e2e/catalogs.spec.ts`, para que la suite siga en verde en cada tramo.
- **D11. Diálogos de pantallas aún no migradas.** Desde el tramo 2, `DialogContent` no lleva padding propio (lo llevan `DialogHeader`, `DialogBody` y `DialogFooter`). Los diálogos que todavía no se han migrado se verán sin margen interior hasta su tramo. Es transitorio y esperado. La limpieza final comprueba que ningún diálogo queda fuera del patrón.
- **D12. Documentación incremental.** Cada tramo documenta en `docs/README.md` lo que introduce; el tramo 12 hace la revisión final.
- **D13. Build Docker** (§20) en la iteración 1 del bucle de integración, con la imagen de verificación que se borra después.

## Asignación de hallazgos de la revisión 4 (§24.3)

| Hallazgo | Tema | Tramo |
|---|---|---|
| MEDIUM 1 → §24.1 | `useClientTable` sin truncar filas | 3 (utilidad y prueba), 4 (paginación), 6 (Capacidad `null`), 8 (Tareas `null`) |
| MEDIUM 2 → §24.2 | Auditoría con tope de 500 | 12 |
| NIT 3 | El foco por script abre tooltips | 2 (`LabelTooltip`), 4 (`DisabledHint`) |
| NIT 4 | Foco perdido al retirar el control | 4 (`returnFocusTo`), cada listado en su tramo, 12 («Ver validaciones») |
| NIT 5 | Variantes en Aprobaciones; `srDescription` en Badge | 7, 6 |
| NIT 6 | Mensajes de validación | 4 (b, base de c), 7 (c devolver), 11 (b Maestras), 12 (a, b Equipo, c no aplica) |
| NIT 7 | Regla de `ResultCount`; vacío frente a sin resultados | 4, 8 (Portafolio con filtros de servidor) |
| NIT 8 | Bordes dobles en `StatStrip` | 4 |
| NIT 9 | Id completo del actor en Auditoría | 12 |
| NIT 10 | Specs antes que su pantalla | 4 (fecha de Mi trabajo), 7 (paso 8 de navegación) |

---

## Tramo 1 — FEAT-001 · Sesión jwt estable y E2E configurable (fix)

Toca: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/responsible-selector.spec.ts`, `e2e/jwt-session.spec.ts` (nuevo), `e2e/web-lib.spec.ts` (nuevo), `apps/web/src/lib/safe-redirect.ts` (nuevo), `apps/web/src/lib/actor-context.tsx`, `apps/web/src/components/route-guard.tsx`, `apps/web/src/app/login/login-form.tsx`, `docs/README.md`. Diseño: §8.7, §17, §20 (jwt-session y safe-redirect), §21 paso 0.

Capacidades a preservar (inventario «Shell global» y «/login»):

- dev-header: el guard es passthrough y siempre monta el shell.
- jwt:
  - `/login` sin shell.
  - Ruta protegida sin sesión → `/login`.
  - 401 en `/me/permissions` → `/login?expired=1`.
  - «Cargando tu sesión…» mientras cargan los permisos.
- Login:
  - ids `identifier` y `password`, `autocomplete`, `noValidate`.
  - Errores por campo con `role=alert`, `aria-describedby` y `aria-invalid`.
  - 401 genérico, mensaje del backend y genérico de red.
  - Botón deshabilitado con spinner durante el envío.

- [ ] 1. Hacer configurables por entorno las URLs de la suite E2E con valores por defecto idénticos (D3).
      Files: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/responsible-selector.spec.ts`
      Verify: con los servidores del worktree y las variables `E2E_*`, `npm run test:e2e -- e2e/catalogs.spec.ts e2e/responsible-selector.spec.ts` → 4 passed.
- [ ] 2. Escribir `e2e/jwt-session.spec.ts` (§20: 6 casos, selectores del baseline, primero el contenido y después la URL, se salta sin `E2E_AUTH_MODE=jwt`) y reproducir el defecto.
      Files: `e2e/jwt-session.spec.ts`
      Verify: en modo jwt, `npm run test:e2e -- e2e/jwt-session.spec.ts` → el caso 1 **falla** antes del arreglo (anotar en findings).
- [ ] 3. Crear `lib/safe-redirect.ts` (puro, §8.7.5) y `e2e/web-lib.spec.ts` con su bloque de §20.
      Files: `apps/web/src/lib/safe-redirect.ts`, `e2e/web-lib.spec.ts`
      Verify: `npm run test:e2e -- e2e/web-lib.spec.ts` → verde.
- [ ] 4. Corregir el defecto (§8.7.2–4): `identityReady` y `signedOut` en `ActorProvider`; espera de la identidad, `next`, `expired=1` y `/login` con sesión en `RouteGuard`; `postLoginPath` en `LoginForm`. Los mensajes de pantalla completa pasan a `role="status"` con tilde. El rediseño visual del guard llega en el tramo 5.
      Files: `apps/web/src/lib/actor-context.tsx`, `apps/web/src/components/route-guard.tsx`, `apps/web/src/app/login/login-form.tsx`
      Verify: `npm run typecheck:web`; en jwt, `jwt-session.spec.ts` → 6 passed.
- [ ] 5. Documentar las variables E2E y cómo ejecutar `jwt-session.spec.ts` (sin copiar la contraseña); regresión completa; dos commits (`test(e2e): …` y `fix(web): …`).
      Files: `docs/README.md`
      Verify: `npm run typecheck`, `npm run build:web`; en dev-header, `web-lib`, `catalogs` y `responsible-selector` en verde.

## Tramo 2 — FEAT-002 · Fundaciones: dependencias, tokens, tipografía y primitivas (feat)

Toca: `apps/web/package.json`, `package-lock.json`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/next.config.ts`, los 26 `page.tsx` (solo `metadata.title`), `apps/web/src/components/ui/*` y el script de capturas (artefacto, no se commitea). Diseño: §4, §5.1–5.4, §6, §8.1 (layout), §11.1 (títulos); NIT 3.

Capacidades a preservar: ninguna capacidad cambia. Las vistas actuales siguen compilando y funcionando gracias a los alias de `Badge` y a que se conservan los nombres de variantes de `Button`. Los toasts globales siguen funcionando.

- [ ] 6. Instalar `@radix-ui/react-tooltip@1.3.0`, `@radix-ui/react-dropdown-menu@2.1.25` y `@radix-ui/react-tabs@1.1.22` con el control del lockfile de §4 (foto previa, `npm install --save-exact --workspace apps/web …`, comparación). Aceptar solo los 6 pares nuevos de §4.4, sin desaparecidos ni `hasInstallScript`. Sin `npm dedupe`. Borrar la foto. Commit propio (`build(web): …`).
      Files: `apps/web/package.json`, `package-lock.json`
      Verify: la salida del script de comparación cumple §4.4; `npm run typecheck:web`.
- [ ] 7. Reescribir `globals.css` con la estructura exacta de §5.4: tokens claro y oscuro de §5.1, variante `rail`, `@theme` con `--color-neutral-*: initial` y `--text-meta`, `@theme inline`, `@layer base` con movimiento reducido y `scroll-padding-top`.
      Files: `apps/web/src/app/globals.css`
      Verify: `npm run build:web`; el CSS generado contiene `.text-meta`, `.bg-neutral-subtle` y `.text-neutral`, que ya usan `label.tsx` y `badge.tsx` (si no, aplicar el respaldo de §5.4 paso 6).
- [ ] 8. Configurar Inter con `next/font/google` y la `metadata` con plantilla `'%s · Portal del área'`; añadir `TooltipProvider`; poner los títulos cortos de §11.1 en los 26 `page.tsx`; `devIndicators: { position: 'bottom-right' }`. Si la fuente no se puede descargar, aplicar el respaldo de §4.
      Files: `apps/web/src/app/layout.tsx`, `apps/web/next.config.ts`, `apps/web/src/app/**/page.tsx`
      Verify: `npm run build:web` OK; el `<title>` de `/catalogs` es «Maestras · Portal del área».
- [ ] 9. Rehacer las primitivas existentes según §6: `button` (`ghost-destructive`, `icon-sm`, `loading`, `unavailable` y `onUnavailableClick`), `badge` (tonos y alias), `input`, `textarea`, `select` (`SelectLabel`, `SelectSeparator`, ítems de dos líneas), `label`, `card` (`as`), `dialog` (`size`, `DialogBody`), `table` (`density`, `scrollLabel`, `TableCaption`), `skeleton`, `switch` y `sonner` (etiquetas en español).
      Files: `apps/web/src/components/ui/{button,badge,input,textarea,select,label,card,dialog,table,skeleton,switch,sonner}.tsx`
      Verify: `npm run typecheck:web`; `catalogs.spec.ts` y `responsible-selector.spec.ts` en verde.
- [ ] 10. Crear las primitivas nuevas de §6: `tooltip` (`TooltipTarget` y `LabelTooltip` con la guarda de `:focus-visible` del NIT 3), `dropdown-menu`, `tabs`, `sheet`, `checkbox`, `radio-cards` y `segmented-radio`.
      Files: `apps/web/src/components/ui/{tooltip,dropdown-menu,tabs,sheet,checkbox,radio-cards,segmented-radio}.tsx`
      Verify: `npm run typecheck:web`; `npm run build:web`.
- [ ] 11. Crear `scripts\capture-check.cjs` (interfaz en `context.json`) y documentar en `docs/README.md` las dependencias, el cambio de acento, Inter y su respaldo, y el tema oscuro preparado. Commit `feat(web): …`.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.agents\tasks\ui-redesign\scripts\capture-check.cjs` (artefacto), `docs/README.md`
      Verify: capturas de `/inicio`, `/demanda/solicitudes`, `/catalogs`, `/seguimiento/plan` y `/login` en `screenshots\FEAT-002\` con su `manifest.json`.

## Tramo 3 — FEAT-003 · Utilidades puras, tabla en cliente y fechas locales (feat)

Toca: `apps/web/src/lib/{format,status-labels,status-presentation,table-sort,use-client-table,plan-guide,task-filters,use-request-param}.ts` (nuevos), `request-state.ts`, `record-state.ts`, `tasks.ts`, `plan.ts`, los wrappers con `messageForStatus` (todos salvo `catalog.ts`, D10), los 8 archivos de la tabla de §7.9, `e2e/web-lib.spec.ts`, `e2e/date-display.spec.ts` (nuevo) y `docs/README.md`. Diseño: §7.3, §7.6 (`table-sort`, `use-client-table`), §7.9, §7.9.1, §7.9.2, §13.1, §19.2, §20 y §24.1.

Capacidades a preservar:

- Ids y formato enviado a la API de `diario-date`, `nov-date`, `reu-date`, `com-due`, `sem-week`, `capacidad-month`, `dashboard-from/to` e `indicadores-from/to`. Solo cambia el valor propuesto: calendario local en lugar de UTC.
- Semántica de cada mensaje por estado HTTP.
- Imports de `TASK_STATUS_LABELS` y `PLAN_STATUS_LABELS`, que siguen saliendo de `tasks.ts` y `plan.ts` mediante reexport.

- [ ] 12. Crear `lib/format.ts` exactamente como §7.9: bloque de reglas, `local*`, `formatDate*`, `formatMonth` en UTC, `formatHours` con U+2212 y U+00A0, `formatPercent`, `orDash` y `formatCount`. Módulo puro.
      Files: `apps/web/src/lib/format.ts`
      Verify: bloque `format.ts` de `web-lib.spec.ts` (ítem 18).
- [ ] 13. Crear `status-labels.ts` (traslado con reexport desde `tasks.ts` y `plan.ts`) y `status-presentation.ts` (tabla completa de §7.3, `routeLabel`, `PRIORITY_BAND_COPY`, `parseBand`); ampliar `request-state.ts` (`PLANNABLE_STATES`, `isTriageable`, `isPrioritizable`, `isPlannable`); tildes en `record-state.ts`.
      Files: `apps/web/src/lib/{status-labels,status-presentation,request-state,record-state,tasks,plan}.ts`
      Verify: `npm run typecheck:web`; bloques `status-presentation` y `request-state` de `web-lib.spec.ts`.
- [ ] 14. Crear `lib/table-sort.ts` (comparadores, `sortRows`, `nextSort`, `matchesSearch`, `paginate(rows, page, pageSize | null)` y `buildTableView`, D4) y `lib/use-client-table.ts` con `pageSize` obligatorio `25 | 50 | 100 | null` (§24.1).
      Files: `apps/web/src/lib/table-sort.ts`, `apps/web/src/lib/use-client-table.ts`
      Verify: bloque `table-sort` de `web-lib.spec.ts`, con la invariante de §24.1 (con `null`, ninguna fila se trunca).
- [ ] 15. Crear `lib/plan-guide.ts` (8 códigos, textos y acciones de §10.2), `lib/task-filters.ts` y `lib/use-request-param.ts` (§7.9.1).
      Files: `apps/web/src/lib/{plan-guide,task-filters,use-request-param}.ts`
      Verify: bloques `plan-guide` y `task-filters` de `web-lib.spec.ts`; `npm run typecheck:web`.
- [ ] 16. Corregir la ortografía de los mensajes de los wrappers (§13.1) y unificar solo el de red y el genérico. `lib/catalog.ts` queda para el tramo 11.
      Files: `apps/web/src/lib/{api-error,approval,assets,capacity,commitments,documents,issues,meetings,my-work,plan,plan-phases,priority,requests,task-dependencies,tasks,team,triage,worklog,…}.ts` (todo `lib/*.ts` con `messageForStatus`, `toXError` o textos de error)
      Verify: `npm run typecheck:web`; el mojibake da 0.
- [ ] 17. Escribir **primero** `e2e/date-display.spec.ts` con la prueba de «Nuevo diario» de §20 (debe fallar). Después aplicar la regla 2 de fechas en los 8 campos de §7.9, con el patrón posterior al montaje y `Skeleton` en Panel del área, Indicadores y Capacidad.
      Files: `e2e/date-display.spec.ts`, `apps/web/src/app/seguimiento/bitacora/diario-form-dialog.tsx`, `seguimiento/novedades/novedad-form-dialog.tsx`, `seguimiento/reuniones/reunion-form-dialog.tsx`, `seguimiento/compromisos/compromiso-form-dialog.tsx`, `seguimiento/semanal/semanal-form-dialog.tsx`, `activos/capacidad/capacidad-view.tsx`, `inicio/dashboard-view.tsx`, `demanda/resumen/demand-overview-view.tsx`
      Verify: `npm run test:e2e -- e2e/date-display.spec.ts`: falla antes del cambio y pasa después.
- [ ] 18. Completar `web-lib.spec.ts` con los bloques de §20 (`TZ` `America/Bogota` en `beforeAll` y restaurada en `afterAll`) y la invariante de §24.1; documentar en `docs/README.md` `web-lib.spec.ts` (excepción a `30-pruebas.md`) y `date-display.spec.ts`. Commits.
      Files: `e2e/web-lib.spec.ts`, `docs/README.md`
      Verify: `npm run typecheck`, `npm run build:web`; `web-lib`, `date-display`, `catalogs` y `responsible-selector` en verde.

## Tramo 4 — FEAT-004 · Componentes compartidos y pantallas piloto (feat)

Toca: `apps/web/src/components/{page-layout,page-header,section,toolbar,empty-state,error-state,inline-notice,data-view,description-list,page-fallback,status-badge,stat-tile,utilization-bar,disabled-reason,requirements-panel,confirm-dialog,reason-dialog,row-actions,data-table,master-detail,field,request-context-bar}.tsx` (nuevos); las rutas `/mi-trabajo` y `/seguimiento/proyectos`; `components/under-construction.tsx` (se elimina); `e2e/date-display.spec.ts`. Diseño: §7.1–§7.8 (salvo marca, skip link y shell), §9, §10.1, §11.4, §11.14 y §24.1; NIT 3, 4, 6b, 6c, 7 y 8.

Capacidades a preservar:

- `/mi-trabajo`:
  - «Actualizar» y recarga al cambiar `actorId`.
  - Columnas Tarea (con «Hito») | Solicitud | Fase | Vence | Estado (con progreso).
  - Acceso al detalle `/seguimiento/tareas?taskId=…`, ahora por el título.
  - Estados: carga, error «No fue posible cargar tu trabajo.» con Reintentar, y vacío «No tienes tareas asignadas.» con guía.
- `/seguimiento/proyectos`: título «Proyectos», descripción «Seguimiento de proyectos en curso.» y aviso de que aún no está disponible.

- [ ] 19. Crear los componentes de estructura y estados (§7.1, §7.2): `PageLayout`, `PageHeader`, `Section`, `Toolbar` con `SearchInput`, `EmptyState`, `ErrorState`, `InlineNotice`, `DataView` con `TableSkeleton`, `DescriptionList` y `PageFallback`. Respetar qué componentes son seguros para servidor.
      Files: los 10 `.tsx` correspondientes de `apps/web/src/components/`
      Verify: `npm run typecheck:web`.
- [ ] 20. Crear `StatusBadge`, `PriorityBadge` («84 P1») y `PriorityLegend`, `StatStrip` y `StatTile` (con `gap-px`, NIT 8) y `UtilizationBar`.
      Files: `apps/web/src/components/{status-badge,stat-tile,utilization-bar}.tsx`
      Verify: `npm run typecheck:web`.
- [ ] 21. Crear `DisabledReason` y `DisabledHint` (§7.4, NIT 3), `RequirementsPanel` (§10.1), `ConfirmDialog` y `ReasonDialog` (§7.5, `returnFocusTo` del NIT 4 y `requiredMessage` del NIT 6c).
      Files: `apps/web/src/components/{disabled-reason,requirements-panel,confirm-dialog,reason-dialog}.tsx`
      Verify: `npm run typecheck:web`.
- [ ] 22. Crear `RowActions` y `RowActionsCell`; `SortableTableHead`, `ResultCount` (NIT 7), `DataTablePagination` (siempre en `ready`, D5) y `CellTitle`; `MasterDetail` y `SelectableList`.
      Files: `apps/web/src/components/{row-actions,data-table,master-detail}.tsx`
      Verify: `npm run typecheck:web`.
- [ ] 23. Crear `Field`, `FieldSet`, `FormError` y `RequiredHint` (NIT 6b); `RequestContextBar`, `RequestSummary` y `RequestFacts`.
      Files: `apps/web/src/components/{field,request-context-bar}.tsx`
      Verify: `npm run typecheck:web`; `npm run build:web`.
- [ ] 24. Piloto Mi trabajo (§11.4). **Primero** añadir a `date-display.spec.ts` la prueba de fecha mostrada (debe fallar). Después migrar la vista a patrón A: toolbar con `mt-buscar`, `mt-filtro-estado`, conteo y «Limpiar filtros» con foco a `#mt-buscar`; tabla ordenable y paginada de 25 en 25; título como enlace.
      Files: `e2e/date-display.spec.ts`, `apps/web/src/app/mi-trabajo/mi-trabajo-view.tsx`
      Verify: `date-display.spec.ts` falla antes y pasa después; capturas de `/mi-trabajo`.
- [ ] 25. Piloto Proyectos (§11.14): `EmptyState` con enlaces filtrados por `allowedModules`; eliminar `under-construction.tsx`. Commit.
      Files: `apps/web/src/app/seguimiento/proyectos/page.tsx`, `apps/web/src/app/seguimiento/proyectos/proyectos-view.tsx` (nuevo), `apps/web/src/components/under-construction.tsx` (se elimina)
      Verify: `npm run typecheck`, `npm run build:web`; E2E `web-lib`, `date-display`, `catalogs` y `responsible-selector`; capturas de las dos rutas sin fallos.

## Tramo 5 — FEAT-005 · Shell, navegación, login y pantallas de error (feat)

Toca: `apps/web/src/lib/navigation.ts`, `apps/web/src/lib/use-sidebar-mode.ts` (nuevo), `apps/web/src/components/{brand,skip-link,app-shell,mobile-nav}.tsx` (nuevos), `app-sidebar.tsx`, `route-guard.tsx`, `apps/web/src/app/login/{page,login-form}.tsx`, `apps/web/src/app/{not-found,error,global-error}.tsx` (nuevos), `e2e/shell-navigation.spec.ts` (nuevo, pasos 1–7), `e2e/jwt-session.spec.ts`, `e2e/web-lib.spec.ts` y `docs/README.md`. Diseño: §7.8 (marca, skip link), §8.1–§8.6, §11.2, §14 y §20 (shell-navigation, jwt-session endurecido).

Capacidades a preservar (inventario «Shell global» y «/login»):

- Marca «Portal del área».
- dev-header:
  - Selector `#actor-select` con opciones de `GET /dev/actors` (nombre; valor = identifier) y persistencia en `localStorage.actorId`.
  - Estados del selector: carga y error «No fue posible cargar los usuarios.».
- jwt: nombre, identificador y «Cerrar sesión» (`logout` y vuelta a `/login`), sin llamar a `/dev/actors`.
- Menú:
  - `nav` «Navegación principal», filtrado por `allowedModules`, sin grupos vacíos.
  - `aria-current` por igualdad o por prefijo.
  - Estados: sin actor, cargando, error y sin módulos.
- Rutas:
  - Las 24 rutas del menú actual siguen accesibles: 23 desde el menú, y Tareas desde Mi trabajo y Planificación.
  - `/catalogs` sigue fuera del menú y `/` redirige a `/inicio`.
- `/login`: todo lo del tramo 1, ahora con el nuevo aspecto.

- [ ] 26. Reescribir `lib/navigation.ts` (§8.5): 7 grupos y 23 ítems con iconos, `activeFor` y el badge «Próximamente», `MODULE_LABELS`, `MODULE_ORDER`, `getVisibleNavGroups` e `isNavItemActive`. `ModuleKey` no cambia. Añadir su bloque a `web-lib.spec.ts` (con `MODULE_KEYS` del backend importado por ruta relativa).
      Files: `apps/web/src/lib/navigation.ts`, `e2e/web-lib.spec.ts`
      Verify: `npm run test:e2e -- e2e/web-lib.spec.ts` → los 23 `href` coinciden y las claves son las del backend.
- [ ] 27. Crear `use-sidebar-mode.ts` (§8.3), `brand.tsx` y `skip-link.tsx` (§7.8).
      Files: `apps/web/src/lib/use-sidebar-mode.ts`, `apps/web/src/components/{brand,skip-link}.tsx`
      Verify: `npm run typecheck:web`.
- [ ] 28. Reescribir `app-sidebar.tsx` (§8.4 completo):
      - Variantes desktop y drawer, con ids por variante.
      - Menú sin `h2` y con `LabelTooltip` solo en riel.
      - Botones de riel alternados por CSS, con el foco al que queda visible.
      - Bloque de usuario en jwt; selector dev con `Label` y sin `aria-label`.
      - Estados del menú con «Reintentar» → `reload()`.
      Files: `apps/web/src/components/app-sidebar.tsx`
      Verify: `npm run typecheck:web`.
- [ ] 29. Crear `mobile-nav.tsx` (cajón `Sheet`) y `app-shell.tsx` (skip link, sidebar, barra móvil y `main#contenido`). En `route-guard.tsx`, usar `AppShell` y la pantalla completa de estado (§8.1), sin tocar la lógica del tramo 1.
      Files: `apps/web/src/components/{mobile-nav,app-shell,route-guard}.tsx`
      Verify: `npm run build:web`; el CSS generado contiene los selectores de la variante `rail` (`data-sidebar`).
- [ ] 30. Rehacer el login según §11.2 (`CardTitle as="h1"`, `InlineNotice` de expiración, `Field`, botón `lg` con `loading`). En el mismo commit, endurecer `jwt-session.spec.ts` (caso 4 con el texto exacto; casos 2 y 6 con el `h1` «Iniciar sesión»).
      Files: `apps/web/src/app/login/{page,login-form}.tsx`, `e2e/jwt-session.spec.ts`
      Verify: en jwt, `jwt-session.spec.ts` → 6 passed.
- [ ] 31. Crear `not-found.tsx`, `error.tsx` (`retry`) y `global-error.tsx` exactamente como §8.6.
      Files: `apps/web/src/app/{not-found,error,global-error}.tsx`
      Verify: `/ruta-inexistente` responde 404 con el `h1` «Página no encontrada».
- [ ] 32. Escribir `e2e/shell-navigation.spec.ts` con los pasos 1–7 de §20 (el paso 8 llega en el tramo 7, NIT 10); documentarlo en `docs/README.md` junto con cómo cambiar el logo. Commit.
      Files: `e2e/shell-navigation.spec.ts`, `docs/README.md`
      Verify: `npm run typecheck`; en dev-header, `shell-navigation` (1–7), `web-lib`, `catalogs`, `responsible-selector` y `date-display` en verde; en jwt, `jwt-session` 6/6. Capturas en 1440, 1280, 1100 (riel), 768 y 390 de las rutas representativas, y de las 26 rutas en 1440 y 390.

## Tramo 6 — FEAT-006 · Paneles: Panel del área, Indicadores y Capacidad (patrón F)

Toca: `apps/web/src/app/inicio/dashboard-view.tsx`, `apps/web/src/app/demanda/resumen/demand-overview-view.tsx`, `apps/web/src/app/activos/capacidad/{capacidad-view,disponibilidad-form-dialog,asignacion-form-dialog}.tsx` y `e2e/jwt-session.spec.ts`. Diseño: §9 F, §11.3, §11.11, §11.13 y §24.1; NIT 5 (Badge con `sr-only` hermano).

Capacidades a preservar:

- `/inicio`:
  - Periodo con «Desde» (`dashboard-from`, `max=to`) y «Hasta» (`dashboard-to`, `min=from`), recarga automática que ignora el valor vacío y periodo del mes por defecto.
  - `getDemandSummary`; indicadores `total` y `blockedActive`.
  - Tablas por estado y por banda (P1–P4 y «Sin priorizar»).
  - Estados de carga, error con Reintentar y vacío con guía.
- `/demanda/resumen`:
  - Estado `forbidden` sin llamar al backend cuando falta `demandOverview`; un 403 lleva al mismo estado.
  - En `forbidden`, el periodo se oculta.
  - Periodo con `indicadores-from` e `indicadores-to`.
  - Los 5 grupos de indicadores. Un indicador que no aplica muestra «No aplica» con el motivo (`reason` o `futureDataNote`), nunca 0.
  - Subtablas por ruta, por complejidad y de bloqueos por causa, ocultas si están vacías.
- `/activos/capacidad`:
  - `capacidad-month` con recarga.
  - Las 6 llamadas de datos.
  - `lockPerson`, que fija la persona y muestra «Solo puedes registrar tu propia disponibilidad.».
  - Columnas y señales del resumen de carga.
  - Disponibilidad: «Registrar disponibilidad» y «Editar».
  - Asignaciones: «Nueva asignación», «Editar» y «Eliminar» (antes «Borrar»), con estado de ocupado.
  - Diálogos con `disp-*` y `asig-*`, sus validaciones y solo lectura.
  - 409 al registrar disponibilidad → toast con la acción «Editar la existente».

- [ ] 33. Migrar Panel del área (§11.3): `StatStrip` con 4 valores leídos de la API sin cálculo, dos tablas `compact` con barra de distribución y periodo en `fieldset`. En el mismo commit, `jwt-session.spec.ts` pasa a `h1` «Panel del área» en los casos 1, 3 y 5.
      Files: `apps/web/src/app/inicio/dashboard-view.tsx`, `e2e/jwt-session.spec.ts`
      Verify: `npm run typecheck:web`; en jwt, `jwt-session.spec.ts` 6/6; capturas de `/inicio`.
- [ ] 34. Migrar Indicadores (§11.13): una `Section` por grupo con filas de indicador, «No aplica» con su motivo, subtablas `compact` y `InlineNotice` en `forbidden`.
      Files: `apps/web/src/app/demanda/resumen/demand-overview-view.tsx`
      Verify: capturas de `/demanda/resumen` con jefe y con integrante (`forbidden`).
- [ ] 35. Migrar Capacidad (§11.11):
      - `<details>` «¿Cómo se calcula?».
      - Resumen de carga con `UtilizationBar`, horas con `formatHours` y señal con `StatusBadge`.
      - `useClientTable` con `pageSize: null`, ordenable por Persona, Utilización y Utilización plan (§24.1).
      - Secciones Disponibilidad y Asignaciones con `RowActionsCell`; eliminar con `ConfirmDialog`.
      - Diálogos `sm` y `md` con `Field` y `FormError`.
      Files: `apps/web/src/app/activos/capacidad/{capacidad-view,disponibilidad-form-dialog,asignacion-form-dialog}.tsx`
      Verify: `npm run typecheck`, `npm run build:web`; suite dev-header en verde; capturas de las 3 rutas con jefe, integrante y `lideria`; los dos diálogos se abren, muestran todos los errores a la vez y se cancelan.

## Tramo 7 — FEAT-007 · Demanda: Solicitudes, Triage, Priorización y Aprobaciones (A + C)

Toca: `apps/web/src/app/demanda/solicitudes/{solicitudes-view,solicitud-form-dialog}.tsx`, `demanda/triage/{page,triage-view}.tsx`, `demanda/priorizacion/{page,priorizacion-view}.tsx`, `administracion/revision/{revision-view,plan-authorization-section,devolver-dialog}.tsx` y `e2e/shell-navigation.spec.ts` (paso 8). Diseño: §7.9.1, §9 A y C, §10.2 (Triage, Priorización), §11.5–§11.8, §13.3 y §20 (paso 8); NIT 4, 5 y 6c.

Capacidades a preservar:

- `/demanda/solicitudes`:
  - `listRequests` y `listProcesses` (este degrada a `[]`).
  - «Nueva solicitud» en la cabecera y en el vacío; la edición se abre desde el título y desde «Editar ficha».
  - Diálogo, campos:
    - Ids `sol-title` (`autofocus`), `sol-main-process` (Select al crear; `input` deshabilitado al editar), `sol-participant-<id>` (con el principal marcado y bloqueado), `sol-area`, `sol-requester`, `sol-owner`, `sol-target`, `sol-url` y `sol-result`.
    - Solo al editar: compromiso inicial de solo lectura y `sol-justification`.
  - Diálogo, comportamiento:
    - Registro y estado en solo lectura; indicador «Fases del flujo» con `aria-current="step"`.
    - Validaciones de título y proceso principal.
    - Ante un error del backend: mensaje en línea y toast, con el diálogo abierto y los valores intactos.
    - Al crear se envía `mainProcessId`; al editar, `changeJustification` y no `mainProcessId`.
  - Estados.
- `/demanda/triage`:
  - Catálogos `TRIAGE_ROUTE`, `DEMAND_TYPE`, `CRITICALITY`, `TRIAGE_SIZE` y `DATA_AVAILABILITY`, que degradan a vacío.
  - Selector `triage-request`, que reinicia el formulario al cambiar.
  - Bloqueo si la solicitud no está `REGISTRADA`.
  - Campos `triage-route`, `triage-type`, `triage-criticality`, `triage-size`, `triage-data` (con «Sin especificar»), `triage-effort` (≥0), `triage-responsible`, `triage-dependencies` y `triage-notes`; decisión obligatoria (`triage-decision`) con su ayuda.
  - Toast «Triage registrado.», reinicio y recarga; error en línea y toast.
- `/demanda/priorizacion`:
  - Selector `priority-request` y «Score vigente».
  - Bloqueo salvo triage `CONTINUAR` con estado `EN_TRIAGE` o `BACKLOG_PRIORIZADO`.
  - 8 criterios `priority-<key>` de 1 a 5 (3 por defecto) con su peso; `priority-justification`.
  - Aviso de que guardar no aprueba.
  - Toast con el score que calcula el backend, se limpia la justificación y se recarga.
- `/administracion/revision`:
  - «Actualizar» y el aviso.
  - Cola: Aprobar (toast) y Devolver, deshabilitados por fila mientras se actúa sobre ella.
  - Sección de planes solo con `review`: derivada de `EN_PLANIFICACION` con plan `EN_AUTORIZACION`; Autorizar y Devolver con sus toasts; recarga al cambiar de actor.
  - `devolver-reason` obligatorio, con el error del backend en línea; «Devolviendo…».

- [ ] 36. Migrar Solicitudes (§11.5):
      - Toolbar con `sol-buscar`, `sol-filtro-estado`, `sol-filtro-proceso` y `sol-filtro-banda`, `ResultCount` y «Limpiar filtros» con foco a `#sol-buscar`; `PriorityLegend`.
      - Tabla de 25 en 25, ordenada por Registro descendente y con `scrollLabel` «Tabla de solicitudes».
      - Menú «Más acciones» con «Editar ficha» e «Ir a…», cada uno según su predicado y su módulo.
      - Diálogo `lg` por grupos; toast con la acción «Ir a triage».
      En el mismo commit, el paso 8 de `shell-navigation.spec.ts` (fixture de 30 solicitudes).
      Files: `apps/web/src/app/demanda/solicitudes/{solicitudes-view,solicitud-form-dialog}.tsx`, `e2e/shell-navigation.spec.ts`
      Verify: `npm run test:e2e -- e2e/shell-navigation.spec.ts` → pasos 1–8 en verde.
- [ ] 37. Migrar Triage (§11.6, §10.2):
      - `RequestContextBar` agrupada con `helper` mediante `formatCount`.
      - Formulario por grupos; decisión con `FieldSet` y `RadioCards`.
      - `RequirementsPanel` `triage-block` en sus dos variantes.
      - «Ficha de la solicitud»; acción del toast «Ir a priorización».
      - `?requestId=` (§7.9.1); `Suspense` con `PageFallback` en `page.tsx`.
      Files: `apps/web/src/app/demanda/triage/{page,triage-view}.tsx`
      Verify: `npm run typecheck:web`; captura de `/demanda/triage?requestId=<id de una solicitud REGISTRADA>` con la solicitud preseleccionada.
- [ ] 38. Migrar Priorización (§11.7, §10.2): `SegmentedRadio` por criterio, `RequirementsPanel` `priority-block`, `InlineNotice` con enlace a Aprobaciones, toast con banda y glosa más «Ir a aprobaciones», y `?requestId=` con `Suspense`.
      Files: `apps/web/src/app/demanda/priorizacion/{page,priorizacion-view}.tsx`
      Verify: `npm run typecheck:web`; capturas, también a 390 px (la fila del criterio se apila).
- [ ] 39. Migrar Aprobaciones (§11.8):
      - Dos `Section` con su «Actualizar».
      - `RowActions` `ghost sm` (D7); «Ver plan» en el menú.
      - `DevolverDialog` como envoltorio de `ReasonDialog` con `kind` `solicitud` o `plan` (§13.3; mensaje del NIT 6c).
      Commit.
      Files: `apps/web/src/app/administracion/revision/{revision-view,plan-authorization-section,devolver-dialog}.tsx`
      Verify: `npm run typecheck`, `npm run build:web`; suite dev-header en verde; capturas de las 4 rutas con jefe e integrante; el diálogo de devolución valida el motivo vacío y se cancela.

## Tramo 8 — FEAT-008 · Ejecución: Planificación, Tareas y Portafolio (C + D + A)

Toca: `apps/web/src/app/seguimiento/plan/{page,plan-view,phase-dialog,task-dialog}.tsx`, `seguimiento/tareas/{page,tareas-view}.tsx` y `seguimiento/portafolio/portafolio-view.tsx`. Diseño: §7.9.1, §9 A, C y D, §10.2 (Planificación, fase y Tareas), §10.3, §11.9, §11.10, §11.12, §19.1, §19.13 y §24.1; NIT 4 y 7.

Capacidades a preservar:

- `/seguimiento/plan`, solicitudes y plan:
  - Solicitudes `COMPROMETIDA`, `EN_PLANIFICACION` y `EN_EJECUCION`, con una llamada por estado y recarga al cambiar de actor.
  - Plan en carga y en error con Reintentar.
  - Sin plan: «Crear plan», con su toast.
  - Estado del plan, y motivo si está `DEVUELTO`.
  - `canEdit` = `BORRADOR` o `DEVUELTO`.
- `/seguimiento/plan`, guía:
  - Pendientes por categoría con su destino, y `futureCategories`.
  - «Enviar a autorización» según `canSubmit`; un 409 muestra el toast y refresca la guía.
- `/seguimiento/plan`, fases:
  - «Nueva fase»; badge «Fase inicial» y rango de fechas.
  - Subir y bajar con esos `aria-label`, deshabilitados en los extremos o en la fase inicial con tareas.
  - «Editar».
  - «Agregar tarea», que ahora también funciona en fases que ya tienen tareas (§19.1).
  - «Eliminar», deshabilitado si la fase tiene tareas, y el aviso de la fase inicial con tareas.
- `/seguimiento/plan`, tareas:
  - Filtros `task-q`, `task-status`, `task-phase` y «Solo mis tareas», que ahora compara con `permissions.userId` (§19.13).
  - Columnas actuales más Responsable.
  - Abrir la tarea (desde el título); «Editar» y «Eliminar» con `canEdit`.
- `/seguimiento/plan`, diálogos:
  - `PhaseDialog`: `phase-name`, `phase-start`, `phase-end` y `phase-deliverable`.
  - `TaskDialog`, campos: `task-title`, `task-responsible` («Sin asignar»), hito (fuerza 0 h), `task-start` (o «Fecha del hito»), `task-end` y `task-hours` (ocultos en hito), `task-desc` y `task-criteria`.
  - `TaskDialog`, predecesoras: solo al editar, sincronizando lo que se añade y lo que se quita; al crear se muestra la nota.
  - Validaciones de ambos diálogos.
- `/seguimiento/tareas`:
  - Parámetro `?taskId=`, texto cuando falta y error con Reintentar.
  - Ficha completa; predecesoras con su aviso de bloqueo.
  - `task-next-status` solo con las transiciones permitidas (o «Sin transiciones disponibles»); `task-progress` de 0 a 100; `task-evidence`.
  - Un 409 se muestra en línea y en toast, con los valores intactos.
  - Aceptación solo con `plan`.
- `/seguimiento/portafolio`:
  - Filtros de servidor automáticos `portafolio-proceso`, `portafolio-estado` y `portafolio-banda`.
  - Las 10 columnas, con el bloqueo y su motivo ahora visible; nulos como «—».
  - Solo lectura; estados.

- [ ] 40. Migrar Planificación (§11.9):
      - `RequestContextBar` por estados.
      - Avisos de `DEVUELTO` y de `!canEdit`; la guía se oculta si no es editable, pero `getPlanGuide` se sigue llamando.
      - `RequirementsPanel` `plan-guide` con `presentGuidePending`, `liveUpdates` y el pie «Enviar a autorización» con `ConfirmDialog`.
      - Fases en tabla `compact` con la lógica por fila de §10.2, «Agregar tarea» con `disabled={busy}` y el foco tras reordenar.
      - Tareas con `matchesTaskFilters` y `pageSize: null`; nueva columna Responsable.
      - Diálogos `sm` y `md`; `?requestId=` con el texto propio de Planificación; `Suspense` en `page.tsx`.
      Files: `apps/web/src/app/seguimiento/plan/{page,plan-view,phase-dialog,task-dialog}.tsx`
      Verify: `npm run typecheck:web`; capturas de `/seguimiento/plan?requestId=<plan editable>` y `?requestId=<plan autorizado>`. El enlace «Ir a planificación» de Solicitudes preselecciona la solicitud. Con teclado, el foco recorre «Bajar fase» no disponible y se lee su motivo, sin reordenar.
- [ ] 41. Migrar Tareas (§11.10): migas, `meta`, predecesoras con `RequirementsPanel` `task-predecessors`, formulario de estado con `DisabledReason`, lateral con evidencia y aceptación, vacío sin `taskId` y `PageFallback variant="detail"`.
      Files: `apps/web/src/app/seguimiento/tareas/{page,tareas-view}.tsx`
      Verify: capturas de `/seguimiento/tareas` sin parámetro y con el `taskId` de una tarea de Mi trabajo.
- [ ] 42. Migrar Portafolio (§11.12):
      - Filtros de servidor y búsqueda en cliente (`portafolio-buscar`); «Limpiar filtros» recarga y lleva el foco a la búsqueda.
      - `ResultCount` y vacío frente a sin resultados según el NIT 7.
      - `routeLabel` con la maestra `GOVERNANCE_ROUTE`, que degrada a `[]`.
      Commit.
      Files: `apps/web/src/app/seguimiento/portafolio/portafolio-view.tsx`
      Verify: `npm run typecheck`, `npm run build:web`; suite dev-header en verde; capturas de las 3 rutas con jefe e integrante.

## Tramo 9 — FEAT-009 · Registro diario: Bitácora y Reporte semanal (patrón B)

Toca: `apps/web/src/app/seguimiento/bitacora/{bitacora-view,diario-form-dialog,actividad-form-dialog}.tsx` y `seguimiento/semanal/{semanal-view,semanal-form-dialog}.tsx`. Diseño: §9 B y E, §11.15, §12, §13.3 (enviar y eliminar diario, actividad y reporte), §14 y §24.3 (NIT 4).

Capacidades a preservar:

- `/seguimiento/bitacora`, carga y lista:
  - Datos: `listDailyLogs`; `listProcesses`, `listRequests` y `listMyWork`, que degradan a vacío.
  - Detalle con `getDailyLog` y las `listIssues` del proceso.
  - «Nuevo diario», deshabilitado mientras carga y repetido en el vacío.
  - Lista «Mis diarios» con autoselección del primero o la selección que había, y `aria-current`.
- `/seguimiento/bitacora`, detalle:
  - Sin selección, cargando, y error con Reintentar.
  - Acciones solo en borrador: «Enviar a revisión», «Editar notas» y «Eliminar» (antes «Borrar»).
  - Notas; «Dedicación del día: N h» con `aria-live` y su nota.
- `/seguimiento/bitacora`, actividades:
  - «Agregar actividad», solo en borrador y repetida en el vacío.
  - Texto cuando el diario ya se envió.
  - Tabla con «Editar» y «Eliminar» (con estado de ocupado).
- `/seguimiento/bitacora`, diálogos:
  - `DiarioFormDialog`: `diario-process` y `diario-date` al crear; en edición, solo notas.
  - `ActividadFormDialog`: `act-class` con ayuda por opción y campos condicionales (`act-project` y `act-task` en planificada, `act-asset` en soporte, `act-requester` y `act-justification` en extraordinaria).
  - `ActividadFormDialog`, campos comunes: `act-hours` (entero ≥0), `act-description`, `act-result`, `act-issue`, `act-next`, `act-next-date` y `act-evidence`.
  - Validaciones de ambos diálogos; ante un error, los valores se conservan.
- `/seguimiento/semanal`:
  - Datos: `listWeeklyReports` y `listProcesses`; detalle con `getWeeklyReport`.
  - «Nuevo reporte semanal» (antes «Nuevo semanal») y la lista con autoselección.
  - «Enviar reporte», solo en borrador.
  - Consolidado (diarios, actividades, dedicación y extraordinarias) o su texto vacío.
  - Las 5 secciones (`sem-results`, `sem-proposals` con su ayuda, `sem-blockers`, `sem-commitments` y `sem-decisions`), deshabilitadas fuera de borrador.
  - «Guardar secciones», que conserva lo escrito si hay error.
  - Diálogo: `sem-process`, `sem-week` (lunes local) y su ayuda; validaciones.
  - Estados.

- [ ] 43. Migrar Bitácora:
      - `MasterDetail` y `SelectableList`.
      - Detalle en `Card` con «Enviar a revisión» (`ConfirmDialog tone="default"`), «Editar notas» (outline) y «Eliminar» (`ghost-destructive` con `ConfirmDialog` y `returnFocusTo`).
      - Dedicación destacada; tabla de actividades con `RowActionsCell`; `InlineNotice` cuando el diario se envió.
      - Diálogos `sm` y `md` con `Field` y `FormError`, que muestran todos los errores a la vez.
      Files: `apps/web/src/app/seguimiento/bitacora/{bitacora-view,diario-form-dialog,actividad-form-dialog}.tsx`
      Verify: `npm run typecheck:web`; `date-display.spec.ts` («Nuevo diario») en verde; capturas, y a 390 px el foco pasa al detalle al elegir un diario.
- [ ] 44. Migrar Reporte semanal: lista «Mis reportes» («Semana del {lunes}»), «Enviar reporte» con confirmación, consolidado en `StatStrip`, secciones en columna de 720 px e `InlineNotice` cuando el reporte se envió; diálogo «Nuevo reporte semanal». Commit.
      Files: `apps/web/src/app/seguimiento/semanal/{semanal-view,semanal-form-dialog}.tsx`
      Verify: `npm run typecheck`, `npm run build:web`; suite dev-header en verde; capturas de las 2 rutas con jefe e integrante.

## Tramo 10 — FEAT-010 · Coordinación: Novedades, Reuniones y Compromisos (patrón B)

Toca: `apps/web/src/app/seguimiento/novedades/{novedades-view,novedad-form-dialog}.tsx`, `seguimiento/reuniones/{reuniones-view,reunion-form-dialog}.tsx` y `seguimiento/compromisos/{compromisos-view,compromiso-form-dialog}.tsx`. Diseño: §9 B y E, §11.15, §13.3 (eliminar reunión) y §24.3.

Capacidades a preservar:

- `/seguimiento/novedades`:
  - Datos: `listIssues`, `listProcesses` y `listCoordinationPeople`.
  - «Nueva novedad»; lista con autoselección.
  - Ficha: Responsable, Fecha objetivo, Detalle, Impacto y Resolución, con «—» si falta; «Editar».
  - Un botón por cada estado destino de `nextStates`, con el toast «Novedad movida a X.»; texto si no hay transiciones.
  - Diálogo, campos: `nov-process` y `nov-date` (deshabilitados al editar), `nov-type` (Bloqueo por defecto), `nov-title`, `nov-detail`, `nov-impact`, `nov-resolver`, `nov-target` y `nov-resolution`.
  - Diálogo, comportamiento: validaciones; al editar no se envían proceso ni fecha.
- `/seguimiento/reuniones`:
  - Datos: `listMeetings`, `listProcesses` y `listCoordinationPeople`.
  - «Nueva reunión»; lista con «fecha · hora · proceso».
  - Detalle con «Editar» y «Eliminar» (con estado de ocupado), participantes (o «Sin participantes registrados.»), agenda, decisiones y observaciones.
  - Diálogo, campos: `reu-process` (deshabilitado al editar), `reu-title`, `reu-date`, `reu-time` (HH:mm), `reu-responsible`, participantes (con el texto vacío), `reu-agenda`, `reu-decisions` y `reu-notes`.
  - Diálogo, comportamiento: descripción «La reunión inicia en estado Borrador.» y validaciones.
- `/seguimiento/compromisos`:
  - Datos: `listCommitments`, `listProcesses`, `listCoordinationPeople` y `listMeetings`.
  - «Nuevo compromiso»; lista con «Vence {fecha} · proceso».
  - Detalle (Asignado, Responsable, Reunión de origen, Resultado esperado y Bloqueos) con «Editar».
  - Transiciones de `nextStates` con el toast «Compromiso movido a X.».
  - Diálogo, campos: `com-process` (deshabilitado al editar), `com-title`, `com-due`, `com-assigned`, `com-responsible`, `com-meeting` («título (fecha)»), `com-result` y `com-blockers`.
  - Diálogo, comportamiento: validaciones.

- [ ] 45. Migrar Novedades: `MasterDetail`, `DescriptionList`, grupo «Cambiar estado a:» con un botón `outline sm` por destino y diálogo `md` con `Field` y `FormError`.
      Files: `apps/web/src/app/seguimiento/novedades/{novedades-view,novedad-form-dialog}.tsx`
      Verify: `npm run typecheck:web`; capturas.
- [ ] 46. Migrar Reuniones: detalle con «Editar» y «Eliminar» (`ConfirmDialog` con `returnFocusTo`), participantes como `Badge outline` y diálogo `md` con la lista de `Checkbox` desplazable.
      Files: `apps/web/src/app/seguimiento/reuniones/{reuniones-view,reunion-form-dialog}.tsx`
      Verify: `npm run typecheck:web`; capturas.
- [ ] 47. Migrar Compromisos: detalle con `DescriptionList`, «Cambiar estado a:» y diálogo `md`. Commit.
      Files: `apps/web/src/app/seguimiento/compromisos/{compromisos-view,compromiso-form-dialog}.tsx`
      Verify: `npm run typecheck`, `npm run build:web`; suite dev-header en verde; capturas de las 3 rutas con jefe e integrante.

## Tramo 11 — FEAT-011 · Activos, Documentos y Maestras (patrón A)

Toca: `apps/web/src/app/activos/catalogo/{activos-view,activo-form-dialog}.tsx`, `activos/documentos/{documentos-view,documento-editor-dialog,historial-dialog}.tsx`, `catalogs/{catalogs-view,catalog-form-dialog}.tsx`, `apps/web/src/lib/catalog.ts` y `e2e/catalogs.spec.ts`. Diseño: §9 A, §10.2 (Documentos), §11.16, §11.17, §11.22, §13.4 y §20 (`catalogs.spec.ts`); NIT 6b.

Capacidades a preservar:

- `/activos/catalogo`:
  - Datos: `listAssets` y 4 maestras, que degradan a vacío.
  - «Nuevo activo»; filtros en cliente `filtro-proceso`, `filtro-solicitud` y `filtro-estado`.
  - Las 7 columnas; «Editar».
  - Transición permitida por los roles asignados (jefe o líder del proceso del activo): Activar, Retirar o Recuperar, con su toast.
  - Diálogo `activo-*`: proceso deshabilitado al editar y con su nota; etiqueta exacta «Responsable».
  - Al editar, vaciar la solicitud o el responsable envía `null`.
  - Validaciones; estados.
- `/activos/documentos`, listado:
  - Datos: los 6 orígenes.
  - «Nuevo documento», deshabilitado mientras carga o sin activos no retirados, con su vacío.
  - Los 5 filtros `doc-filtro-*`; las 6 columnas.
  - Acciones de fila: «Editar» (carga el contenido vigente), «Historial» y descargar `.md` (deshabilitada sin versión; ocupada mientras descarga).
  - Transiciones permitidas por los roles asignados: Publicar, Archivar, Pasar a borrador y Reactivar.
- `/activos/documentos`, editor e historial:
  - Editor: `doc-asset`, `doc-title`, `doc-category` y `doc-content`; pestañas Editor y Vista previa; contador de 200.000 y aviso al superarlo; Ctrl/Cmd+S.
  - Al editar, se guardan los metadatos y se crea una versión nueva.
  - Historial: tabla, «Ver contenido», «Descargar .md» y sus estados.
- `/administracion/maestras` y `/catalogs`:
  - El mismo componente.
  - Filtros `#filter-catalog` y `#filter-active` que solo se aplican con «Aplicar».
  - Tabla y, por fila, «Editar» y «Activar»/«Desactivar» con estado de ocupado.
  - Diálogo: catálogo y código en solo lectura al editar; al editar se envían solo etiqueta, activo y orden.
  - Validaciones; estados; textos fijados por E2E (§13.4).

- [ ] 48. Migrar Activos (§11.16):
      - Búsqueda nueva `filtro-busqueda`, `ResultCount` y «Limpiar filtros» con foco a la búsqueda.
      - Tabla de 25 en 25 ordenada por Nombre; `StatusBadge asset` con la etiqueta, no el código.
      - `RowActions` en línea; toast con la etiqueta; diálogo `md`.
      Files: `apps/web/src/app/activos/catalogo/{activos-view,activo-form-dialog}.tsx`
      Verify: `npm run test:e2e -- e2e/responsible-selector.spec.ts` en verde; capturas.
- [ ] 49. Migrar Documentos (§11.17):
      - «Nuevo documento» con `DisabledReason` y el enlace «Ir a Activos».
      - En línea, «Editar» e «Historial»; en el menú, «Descargar .md» (no disponible con su motivo, u ocupada con el spinner en el disparador) y las transiciones.
      - Editor `xl` con `Tabs`; historial `xl`.
      Files: `apps/web/src/app/activos/documentos/{documentos-view,documento-editor-dialog,historial-dialog}.tsx`
      Verify: `npm run typecheck:web`; capturas; el editor se abre, cambia de pestaña y se cancela.
- [ ] 50. Migrar Maestras (§11.22):
      - `form` alrededor del `Toolbar`; tabla `compact` de 25 en 25.
      - `FormError` también para el 409 dentro del diálogo; textos con tilde en `catalog.ts`.
      - En el mismo commit, los cambios exactos de `e2e/catalogs.spec.ts` (§20) y nada más.
      Commit.
      Files: `apps/web/src/app/catalogs/{catalogs-view,catalog-form-dialog}.tsx`, `apps/web/src/lib/catalog.ts`, `e2e/catalogs.spec.ts`
      Verify: `npm run typecheck`, `npm run build:web`; `catalogs.spec.ts` 3/3 y suite dev-header en verde; capturas de `/activos/catalogo`, `/activos/documentos`, `/administracion/maestras` y `/catalogs`.

## Tramo 12 — FEAT-012 · Gobierno: Controles, Auditoría, Mis permisos y Equipo; cierre (C + A + D)

Toca: `apps/web/src/app/administracion/frameworks/{page,frameworks-view}.tsx` (puede dividirse en archivos del mismo directorio), `gobierno/auditoria/{auditoria-view,ver-cambio-dialog}.tsx`, `apps/web/src/lib/audit.ts`, `apps/web/src/lib/api-client.ts` (solo tipos), `gobierno/mis-permisos/mis-permisos-view.tsx`, `gobierno/equipo/{equipo-view,create-user-dialog,create-grant-dialog}.tsx`, `apps/web/src/components/ui/badge.tsx` (se quitan los alias) y `docs/README.md`. Diseño: §10.2 (GC4, rol, Equipo), §10.3, §11.18–§11.21, §13.3, §19 y §24.2; NIT 4, 6a, 6b, 6c y 9.

Capacidades a preservar:

- `/administracion/frameworks`, carga y contexto:
  - `canReview` (jefe o líder de proceso) y el aviso de rol.
  - Datos: `listRequests` y las maestras `GOVERNANCE_ROUTE`, `VALIDATION_TYPE` y `VALIDATION_RESULT`; tablero con `getGovernanceBoard` y `listValidations`.
  - Selector `governance-request` con su estado y su banda (de la API, ya no se calcula por score); texto sin selección.
  - Alerta de solicitud bloqueada.
- `/administracion/frameworks`, ruta y etapas:
  - Ruta proporcional: `governance-route` y «Guardar ruta» solo con `canReview`; «Actual: …» o «Sin ruta asignada.».
  - Avance de etapas: 3 botones con sus toasts, solo con `canReview`.
- `/administracion/frameworks`, controles:
  - GC1–GC5 con estado, Condición, Autoridad, «No aplica: motivo», faltantes y resumen de GC4.
  - Motivos de no aprobable enlazados al botón.
  - «Aprobar GCn» y «Marcar como no aplica» (`ReasonDialog`, ya no `window.prompt`), solo GC4/GC5 con `canReview`.
  - Texto de GC1–GC3.
- `/administracion/frameworks`, validaciones:
  - Tabla de 9 columnas con la evidencia según su tipo; «Resolver bloqueo» con `canReview`; vacío.
  - Formulario `val-*`, con ejecutor por `Select` más entrada manual, y la casilla «Defecto bloqueante».
  - Validaciones, toast y resumen de GC4; estados.
- `/gobierno/auditoria`:
  - Tabla Fecha, Actor (o «Sistema»), Proceso, Acción y Objeto, con «Ver cambio» (antes y después, o «Sin datos»).
  - Estados de error con Reintentar y vacío.
- `/gobierno/mis-permisos`:
  - Usa el contexto (`permissions`, `state`, `reload`).
  - Sin actor, cargando, y error con Reintentar.
  - Identidad; roles y alcance con su vacío; módulos con «Permitido» o «No permitido»; nota de control en el servidor.
- `/gobierno/equipo`:
  - Datos: `listUsers`, `listGrants` y `listProcesses`; si falla cualquiera, error global.
  - «Nuevo usuario» y «Asignar rol» (antes «Asignar grant»), este deshabilitado sin usuarios o sin procesos.
  - Tablas Usuarios y Roles asignados con «Revocar» y su toast.
  - Diálogos `user-*` (con el foco de vuelta al identificador) y `grant-*`; validaciones; estados.

- [ ] 51. Migrar Controles de gobierno (§11.18):
      - `RequestContextBar` y `?requestId=` con `Suspense`; aviso de rol.
      - `Tabs` «Controles» y «Validaciones (n)»; lateral con «Ruta proporcional» (oculta sin `canReview`) y «Avance de etapas».
      - Condiciones `isWaived`, `showGc4Block` y `showActions`; `RequirementsPanel compact` `GC4-block` con «Ver validaciones» y el foco al panel (NIT 4).
      - «Aprobar GCn» `unavailable` con `DisabledReason` `GC4-block-reason`.
      - `ReasonDialog` `waive-reason` (NIT 6c); ejecutor por `Select` con entrada manual; 5 mensajes por campo (NIT 6a).
      - Se elimina `priorityBand(score)`.
      Files: `apps/web/src/app/administracion/frameworks/{page,frameworks-view}.tsx` (y archivos auxiliares en la misma carpeta si se divide)
      Verify: `npm run typecheck:web`; capturas de `/administracion/frameworks?requestId=<solicitud con plan>` con jefe e integrante. El enlace «Ir a controles de gobierno» de Solicitudes preselecciona la solicitud.
- [ ] 52. Migrar Auditoría (§11.19 + §24.2 + D6):
      - `AuditObjectType` derivado del tipo generado; se elimina la unión a mano. `AUDIT_TAKE = 500`.
      - «Objeto» como filtro de servidor y «Acción» solo en cliente, con su ayuda.
      - Aviso y sustantivo «eventos más recientes» cuando llegan 500.
      - Tabla `compact` de 25 en 25 por Fecha descendente; actor por nombre o id corto.
      - `VerCambioDialog` `xl` con la cabecera `DescriptionList` (NIT 9).
      Files: `apps/web/src/lib/audit.ts`, `apps/web/src/lib/api-client.ts`, `apps/web/src/app/gobierno/auditoria/{auditoria-view,ver-cambio-dialog}.tsx`
      Verify: `npm run typecheck:web`; captura con filtro de Objeto: la petición lleva `objectType` y `take=500`.
- [ ] 53. Migrar Mis permisos (§11.20): secciones Identidad, Roles y alcance y Módulos (`MODULE_ORDER`, `MODULE_LABELS`, `StatusBadge permission`); 0 errores de consola.
      Files: `apps/web/src/app/gobierno/mis-permisos/mis-permisos-view.tsx`
      Verify: `capture-check` de `/gobierno/mis-permisos` con `consoleErrors` 0 (hoy 3).
- [ ] 54. Migrar Equipo y permisos (§11.21): glosario («rol asignado»), «Asignar rol» con `DisabledReason`, «Revocar» con `ConfirmDialog` (oculto si ya está revocado), diálogos `sm` con los mensajes combinados y `aria-invalid` solo en los campos que fallan (NIT 6b).
      Files: `apps/web/src/app/gobierno/equipo/{equipo-view,create-user-dialog,create-grant-dialog}.tsx`
      Verify: `npm run typecheck:web`; capturas con jefe (el integrante no tiene `team`).
- [ ] 55. Limpieza final (§21 paso 6):
      - Quitar los alias de `Badge`, tras comprobar que no se usan.
      - Comprobar que no quedan `formatDate` locales, `aria-live` en secciones, colores sueltos (`text-red-*`, `bg-amber-*`…) ni diálogos fuera del patrón de D11.
      - Títulos de §11.1 y mojibake 0.
      - Revisión final de `docs/README.md`: lista de los 6 specs, excepción de `web-lib`, intercepciones, `jwt-session`, seed y CI (§22), y pendientes de API (D6, columna Rol, textos sin tilde, paginación de auditoría).
      Commit.
      Files: `apps/web/src/components/ui/badge.tsx`, `docs/README.md` y lo que aparezca en las búsquedas
      Verify: `npm run typecheck`, `npm run build`; suite dev-header completa en verde; en jwt, `jwt-session` 6/6; capturas de las 4 rutas del tramo en los 4 tamaños y de las 26 rutas en 1440 y 390 con jefe.

## Después de los tramos

- **Integración y revisión** (bucle; para cuando `review.json` tiene `"verdict": "APPROVED"`).
  - Iteración 1: verificación cruzada completa, con corrección de las costuras entre tramos.
    - `npm run typecheck`, `npm run build` y `npm run test:unit`.
    - E2E completa en dev-header y `jwt-session` en jwt.
    - Barrido de las 26 rutas × 4 tamaños × jefe e integrante.
    - Build Docker de §20 (o constancia de por qué no se pudo).
    - `/catalogs` responde 200 y `/` redirige.
  - Iteraciones siguientes: corrección de los hallazgos de `review.md`.
  - El revisor escribe `review.md` y `review.json` en cada iteración.
- **QA final** (bucle con `qa-review.json`): barrido de 26 rutas × 4 tamaños × 3 roles, jwt completo, contraste medido en el navegador, estados vacío, extenso y de error, y suites completas.
- **Merge**: rebase sobre `main` y `merge --ff-only` desde el checkout principal.

## Riesgos y supuestos no verificados

- Descarga de Inter en `build:web` y en Docker: hay respaldo con la pila de sistema (§4); se comprueba en el tramo 2 y en la integración.
- Que Tailwind 4.3.3 genere `text-neutral` y `bg-neutral-subtle` con el reinicio de la paleta: se comprueba en el tramo 2, con el respaldo de §5.4 paso 6.
- Preflight CORS del `GET` interceptado en `date-display` y `shell-navigation`: se confirma al ejecutar los specs (tramos 3, 4 y 7).
- Anuncio real con lectores de pantalla, táctil y alto contraste: solo QA manual. Se informará como no verificado si no se puede probar.
- Los datos de demo de la base compartida (`.agents/tasks/demo-data/manifest.json` en el checkout principal) sirven para las capturas. Ningún tramo los modifica.
- La CI no ejecuta el seed (§22): no se cambia; se documenta.
