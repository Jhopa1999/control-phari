# Plan de implementación — Fase 8 · Portafolio y control del área

> Fuente: diseño APROBADO `.agents/tasks/fase8-portafolio/design.md` + revisión `design-review.md` (APPROVED, 3 NIT).
> Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase8-portafolio` (rama `feat/fase8-portafolio`). Todas las rutas de archivo son relativas a ese worktree.
> Comandos reales (de `package.json`): `npm run typecheck`, `npm run test:unit`, `npm run test:unit -- <patrón>` (jest acotado a un archivo), `npm run contracts:generate` (= `openapi:generate` + `api-client:generate`), `npm run build:api-client`, `npm run build`.
> Read-only: la fase NO crea migración (D-M1), NO escribe en BD, NO emite `AuditEvent`.

## Hallazgos de exploración que ajustan el diseño (aplicar)

- **`Issue` "bloqueo abierto" NO usa `TERMINADA`.** El diseño §2.4 asumió `Issue.state != 'TERMINADA'`, pero la maestra `RECORD_STATE` (`apps/api/src/modules/coordination/record-state.ts` + `prisma/seed.ts`) NO tiene `TERMINADA`. Los códigos reales son `BORRADOR, EN_CURSO, BLOQUEADO, COMPLETADO, ARCHIVADO`. Un bloqueo **abierto** = `state NOT IN ('COMPLETADO','ARCHIVADO')`. Importar `RecordState` desde `coordination/record-state.ts` en vez de hardcodear literales. (La revisión ya marcó esto como "a reconfirmar"; queda resuelto aquí.)
- **Fuente de la fecha de cierre:** no hay `Request.closedAt`; se usa `AuditEvent` con el filtro JSON `after: { path: ['operationalState'], equals: 'CERRADA' }` acotado por `objectId`, con fallback en memoria si el proveedor rechaza el filtro `path` (ver FEAT-002 paso de tiempo de entrega).
- **Helper de periodo es NUEVO** (`period.ts` en `portfolio/`): `month.ts` de capacidad solo convierte `YYYY-MM`↔`Date`, no calcula el rango semiabierto `[from, to)`.
- **`scopeWhere` es `private`** en request-state/request/approval → se **replica** el patrón en `PortfolioScopeService` (no se importa).
- **Contrato:** `openapi.json` se emite en `apps/api/openapi/openapi.json` (vía `tsx src/generate-openapi.ts`); el cliente se regenera en `packages/api-client/src/generated/schema.d.ts`. Ambos están trackeados por git y deben committearse.

---

## Backend

- [ ] 1. Fórmulas puras y helper de periodo (sin Prisma ni Nest).
      Crear `indicators.ts` con `median(nums: number[]): number | null` (vacío→null; orden asc; par→`Math.round` del promedio de los dos centrales), `percentage(num, den): { applicable: boolean; value: number | null }` (den=0→`{applicable:false, value:null}`; si no, `round(num/den*100)`), `daysBetween(a: Date, b: Date): number` (`Math.floor((b-a)/86_400_000)`). Crear `period.ts` con `resolvePeriod(from?: string, to?: string): { from: Date; to: Date }` (default: primer día del mes en curso UTC `00:00:00.000Z` inclusivo → primer día del mes siguiente UTC exclusivo; `from>to`→`BadRequestException`) y helpers de eco `YYYY-MM-DD`.
      Files: `apps/api/src/modules/portfolio/indicators.ts`, `apps/api/src/modules/portfolio/period.ts`
      Verify: con el spec del paso 8 presente, `npm run test:unit -- portfolio/indicators` y `npm run test:unit -- portfolio/period` pasan; `npm run typecheck:api` sin errores.

- [ ] 2. DTOs de respuesta y de query con `@nestjs/swagger` + `class-validator`.
      Crear los DTOs del diseño §5: `area-control-response.dto.ts` (`IndicatorStatusDto`, `EvaluationTimeIndicatorDto`, `MilestoneComplianceIndicatorDto`, `DeliveryTimeGroupDto`, `DeliveryTimeIndicatorDto`, `BlockCauseDto`, `BlocksIndicatorDto`, `FutureIndicatorDto`, `AreaIndicatorsResponseDto`, `StateCountDto`, `BandCountDto`, `DemandSummaryResponseDto`), `portfolio-item-response.dto.ts` (`PortfolioItemResponseDto` §5.3), `area-control-query.dto.ts` (`from`/`to` opcionales, `@IsOptional`+formato fecha), `list-portfolio.dto.ts` (`mainProcessId @IsUUID`, `state @IsEnum(RequestState)`, `band @IsIn(['P1','P2','P3','P4','SIN_PRIORIZAR'])`). Usar `@ApiProperty`/`@ApiPropertyOptional` con `nullable` como en `capacity/dto/*`.
      Files: `apps/api/src/modules/portfolio/dto/area-control-response.dto.ts`, `.../dto/portfolio-item-response.dto.ts`, `.../dto/area-control-query.dto.ts`, `.../dto/list-portfolio.dto.ts`
      Verify: `npm run typecheck:api` sin errores.

- [ ] 3. `PortfolioScopeService` (alcance de lectura replicado).
      Crear el service con método público `requestScope(actor): Prisma.RequestWhereInput` = `actor.isJefeArea ? {} : { mainProcessId: { in: Array.from(actor.scopedProcessIds) } }` (patrón de `request-state.service.ts:62`, sin filtrar por `roleCode`). Añadir helpers para alcance de hijos: `taskScope` (`phase: { plan: { request: <requestScope> } }`) e `issueScope` (`actor.isJefeArea ? {} : { processId: { in: [...] } }`).
      Files: `apps/api/src/modules/portfolio/portfolio-scope.service.ts`
      Verify: `npm run typecheck:api` sin errores.

- [ ] 4. `AreaControlService` — indicadores + conteos (depende de 1, 2, 3).
      Implementar `indicators(actor, query)` y `demandSummary(actor, query)`, inyectando `PrismaService`, `RequestStateService` y `PortfolioScopeService`. Cada indicador con su fórmula exacta del diseño §2:
      - **Tiempo de evaluación** (§2.1): mediana de `daysBetween(request.registeredAt, triage.decidedAt)` para Request cuyo triage vigente (`RequestStateService.currentTriage`) tiene `decidedAt` en `[from,to)`; descartar días negativos; `pendingCount` = Request en alcance con `currentTriage == null` (sin filtro de periodo). Muestra vacía→`applicable:false`; `pendingCount` siempre presente.
      - **Cumplimiento de hitos** (§2.2): denominador = `Task` con `isMilestone=true` y `endDate` en `[from,to)` dentro de `taskScope`; numerador = `status==='TERMINADA' && accepted===true && acceptedAt<=endDate`; `percentage(num,den)`; den=0→`applicable:false`, `reason="Sin hitos con vencimiento en el periodo"`.
      - **Tiempo de entrega** (§2.3): Request `CERRADA` (resueltas por `requestScope`), fecha de cierre vía `auditEvent.findFirst({ where:{ objectType:'REQUEST', objectId, action:'UPDATE', after:{ path:['operationalState'], equals:'CERRADA' } }, orderBy:{ createdAt:'desc' } })` (fallback en memoria si el proveedor rechaza `path`); compromiso = `initialCommitmentDate` ?? `Approval.decidedAt` del `resultingState='COMPROMETIDA'` más antiguo; Request sin compromiso/cierre→`unmeasurableClosed++` y excluida; mediana global + `byRoute[]` (`governanceRoute`) + `byComplexity[]` (`Triage.sizeCode`); muestra vacía→`applicable:false`.
      - **Bloqueos** (§2.4): `blockedRequests` = Request con `blockedAt!=null && blockedResolvedAt==null` (días = `daysBetween(blockedAt, now)`, causa=`blockedReason`); `openBlockingIssues` = `Issue` `typeCode='BLOQUEO'` con `state NOT IN ('COMPLETADO','ARCHIVADO')` (días = `daysBetween(issue.date, now)`, causa=`title`); `byCause[]` fusiona ambos con `origin: 'REQUEST_FLAG'|'ISSUE'`. SIEMPRE `applicable:true` (0 bloqueos es dato legítimo). Importar `RecordState` de `coordination/record-state.ts` para los códigos de cierre; NO hardcodear `TERMINADA`.
      - **Futuros** (§2.5–2.7): `failedChanges`, `recovery`, `adoptionValue` → `applicable:false` + `reason` + `futureDataNote` del diseño.
      - **Conteos** (§3): `byState` = todos los `RequestState` del enum (incl. `count=0`) por `groupBy`/conteo en alcance; `byPriorityBand` = `SIN_PRIORIZAR` cuando `currentPriorityEvaluation==null`, si no `RequestStateService.priorityBand(score)`; `blockedActive` y `total`.
      Files: `apps/api/src/modules/portfolio/area-control.service.ts`
      Verify: con el spec del paso 8, `npm run test:unit -- portfolio/area-control` pasa; `npm run typecheck:api` sin errores.

- [ ] 5. `PortfolioService` — listado agregado (depende de 2, 3).
      Implementar `list(actor, filters)`: `findMany` sobre Request con `requestScope` intersectado con filtros (`mainProcessId`/`state`/`band`); `band` se resuelve post-query sobre la evaluación vigente (no es columna). Mapear a `PortfolioItemResponseDto`: resolver `mainProcessCode/Name` (join a `Process`), `priorityBand`/`priorityLabel`/`currentScore` vía `RequestStateService` (null si `SIN_PRIORIZAR`), `responsibleName=functionalOwner`, fechas e indicadores de bloqueo. Orden `registeredAt desc, createdAt desc`. "Comprometida" solo por `operationalState` explícito (sin heurística).
      Files: `apps/api/src/modules/portfolio/portfolio.service.ts`
      Verify: con el spec del paso 8, `npm run test:unit -- portfolio/portfolio.service` pasa; `npm run typecheck:api` sin errores.

- [ ] 6. Controllers finos + módulo + registro en `AppModule` (depende de 4, 5).
      `area-control.controller.ts`: `@ApiTags('area-control')`, `@UseGuards(CurrentUserGuard, RolesGuard)`; `GET /area-control/indicators` con `@Roles(JEFE_AREA, LIDER_PROCESO)` (integrante→403); `GET /area-control/demand-summary` con `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)`. `portfolio.controller.ts`: `@ApiTags('portfolio')`, `GET /portfolio` con los 3 roles. `@ApiResponse`/`@ApiQuery` como `capacity.controller.ts`. `portfolio.module.ts`: `imports: [PrismaModule, AuthModule, RequestModule]` (o reexportar `RequestStateService`), `providers`: los 3 services, `controllers`: los 2. Añadir `PortfolioModule` a `imports` de `app.module.ts`.
      Files: `apps/api/src/modules/portfolio/area-control.controller.ts`, `.../portfolio.controller.ts`, `.../portfolio.module.ts`, `apps/api/src/app.module.ts`
      Verify: `npm run typecheck:api`; `npm run build:api` compila (resolución de DI del módulo).

- [ ] 7. Verificar que `RequestStateService` es inyectable desde `portfolio/`.
      Confirmar que `RequestModule` exporta `RequestStateService` (`exports`); si no, añadirlo a `exports` de `request.module.ts` (cambio mínimo, aditivo) o importar su provider. No modificar su lógica.
      Files: `apps/api/src/modules/request/request.module.ts` (solo si falta el `export`)
      Verify: `npm run build:api` arranca el grafo de DI sin error de dependencia no resuelta.

- [ ] 8. Pruebas unitarias nuevas (Jest, Prisma mockeado como los `*.spec.ts` existentes).
      - `indicators.spec.ts` / `period.spec.ts`: `median` (vacío→null, impar, par con redondeo), `percentage` (den=0→applicable:false, redondeo), `daysBetween`, `resolvePeriod` (default mes en curso; `to`=primer día mes siguiente; `from>to`→400).
      - `area-control.service.spec.ts` (patrón `capacity.service.spec.ts`: `createMocks` con `jest.fn()` por delegado, `jefe()/lider()/integrante()`): mediana + pendientes; hitos denominador 0→No aplica y cálculo con `acceptedAt<=endDate`; tiempo de entrega solo cerradas (vía AuditEvent) + sin cerradas→No aplica + desglose por ruta; bloqueos (conteo + días, fusión Request flag + Issue, cero bloqueos→`applicable:true` conteos 0); los 3 indicadores sin dato→`applicable:false` (No aplica, NO 0); conteos por estado (todos los estados incl. 0) y por banda (P1–P4 + `SIN_PRIORIZAR` separado). Alcance: jefe `where={}` vs no-jefe `mainProcessId ∈ scopedProcessIds`; actor mixto (líder en A + integrante en B) ve A y B; Request de proceso ajeno NO aparece en el agregado del líder.
      - `portfolio.service.spec.ts`: mapeo banda/label; filtros que intersectan (no amplían) el alcance; "comprometida" por estado explícito.
      - `area-control.controller.spec.ts` (o del guard, como Fase 7): integrante → 403 en `demandOverview` (`indicators`).
      Files: `apps/api/src/modules/portfolio/indicators.spec.ts`, `.../period.spec.ts`, `.../area-control.service.spec.ts`, `.../portfolio.service.spec.ts`, `.../area-control.controller.spec.ts`
      Verify: `npm run test:unit -- portfolio` pasa; luego `npm run test:unit` (suite completa) sin regresiones.

- [ ] 9. Regenerar y COMMITTEAR el contrato (depende de 2, 6).
      Ejecutar `npm run contracts:generate` (emite `apps/api/openapi/openapi.json` y regenera `packages/api-client/src/generated/schema.d.ts`) y `npm run build:api-client`. Confirmar que `components['schemas']` incluye `AreaIndicatorsResponseDto`, `DemandSummaryResponseDto`, `PortfolioItemResponseDto`. Committear ambos artefactos generados.
      Files: `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts`
      Verify: `npm run build:api-client` sin errores; los 3 schemas presentes en el `.d.ts` generado.

## Frontend (depende de 9 — solo vía `@plantilla-portales/api-client`)

- [ ] 10. Wrappers de `lib` tipados desde el contrato (patrón `governance.ts`).
      `area-control.ts`: tipos `AreaIndicators`/`DemandSummary` desde `components['schemas']`; `getAreaIndicators(from?, to?)`, `getDemandSummary(from?, to?)` con `api.GET`, `ApiError`, `toApiError`. `portfolio.ts`: tipo `PortfolioItem`; `listPortfolio(filters)`. Añadir los nuevos tipos a `apps/web/src/lib/api-client.ts` (sección Fase 8) si se consumen allí.
      Files: `apps/web/src/lib/area-control.ts`, `apps/web/src/lib/portfolio.ts`
      Verify: `npm run typecheck:web` sin errores.

- [ ] 11. Pantalla panorama de demanda — `/inicio` (`dashboard`, 3 roles) (depende de 10).
      Convertir `inicio/page.tsx` (de `UnderConstruction` a `page.tsx` fino + `<DashboardView />`); `inicio/dashboard-view.tsx` (`'use client'`) consume SOLO `getDemandSummary`. Tarjetas total/bloqueadas; tablas por estado (todos los `RequestState`, 0 como `0`) y por banda P1–P4 + `SIN_PRIORIZAR`; selector de periodo (default mes en curso, recarga al cambiar, patrón `capacidad-view.tsx`); estados loading/vacío/error/éxito; `aria-live`, `caption`/`scope`. NO renderiza indicadores del §9.
      Files: `apps/web/src/app/inicio/page.tsx`, `apps/web/src/app/inicio/dashboard-view.tsx`
      Verify: `npm run typecheck:web`; `npm run build:web` compila.

- [ ] 12. Pantalla SCR-01 indicadores — `/demanda/resumen` (`demandOverview`, jefe/líder) (depende de 10).
      Convertir `demanda/resumen/page.tsx` (fino + `<DemandOverviewView />`); `demanda/resumen/demand-overview-view.tsx` (`'use client'`) consume SOLO `getAreaIndicators`. Una tarjeta por indicador agrupadas por rótulos de las instancias del marco (etiquetado visual, sin scheduling); computables muestran valor (mediana días/%/conteos/desglose), los "No aplica" muestran `Badge "No aplica"` + `reason`/`futureDataNote`, NUNCA `0`. Gating cosmético con `useActor`; si el backend devuelve 403, mostrar aviso entendible (no datos). Selector de periodo; estados loading/error/éxito; accesibilidad.
      Files: `apps/web/src/app/demanda/resumen/page.tsx`, `apps/web/src/app/demanda/resumen/demand-overview-view.tsx`
      Verify: `npm run typecheck:web`; `npm run build:web` compila.

- [ ] 13. Pantalla SCR-07 portafolio — `/seguimiento/portafolio` (`portfolio`, 3 roles) (depende de 10).
      Convertir `seguimiento/portafolio/page.tsx` (fino + `<PortafolioView />`); `seguimiento/portafolio/portafolio-view.tsx` (`'use client'`) consume SOLO `listPortfolio`. Tabla con columnas §5.3 (`caption` sr-only, `scope="col"`, `Badge` para banda/estado/bloqueo; `SIN_PRIORIZAR` neutro; `blocked` `Badge destructive` con `aria-label`); nulos como "—"; filtros proceso/estado/prioridad con `Select` (proceso poblado con `listProcesses()` de `lib/team.ts`, intersecta el alcance); estados loading/vacío/error/éxito; navegable por teclado.
      Files: `apps/web/src/app/seguimiento/portafolio/page.tsx`, `apps/web/src/app/seguimiento/portafolio/portafolio-view.tsx`
      Verify: `npm run typecheck:web`; `npm run build:web` compila.

## Cierre (verificación integral)

- [ ] 14. Verificación de cierre de la fase (steering 00).
      Ejecutar en orden: `npm run typecheck`, `npm run test:unit`, `npm run contracts:generate` + `npm run build:api-client` (sin diff pendiente tras committear el paso 9), `npm run build`. No deben quedar placeholders `dashboard`/`demandOverview`/`portfolio` sin convertir ni regresiones en Fases 1–7.
      Files: —
      Verify: los cuatro comandos terminan con éxito.
