# Gobierno de la demanda GC1-GC5 sobre el flujo existente (Fase 7)

La fase añade el ciclo de control corporativo (marco FCGR §4-§7) acotado al área analítica: un módulo `governance/` nuevo que modela los 5 gates por Request, las validaciones/evidencias, la ruta proporcional y el bloqueo transversal, más la extensión de la máquina de estados para que GC4/GC5 lleven la Request de `EN_EJECUCION` hasta `CERRADA`, y la conversión del placeholder `administracion/frameworks` en el tablero real. El cambio es aditivo sobre las Fases 1-6: no reescribe la máquina de estados, no toca `/catalogs`, y solo realinea el vocabulario de la etiqueta de prioridad. Watch for: nada bloqueante. La fórmula de prioridad y los pesos quedan intactos (solo cambian cortes/etiqueta), el bloqueo se modeló como flag y no como estado (fiel al marco §9), y los artefactos generados (OpenAPI + api-client) están sincronizados. **(confirmed)**

**Verdict**: APPROVED

## High-level view

La fórmula de prioridad no cambia: `computeScore` sigue produciendo 20-100 con los mismos pesos y la etiqueta pasa a las bandas P1-P4 del marco con cortes 80/65/45. El único corte que se mueve es el inferior (50→45), por lo que el tramo 45-49 reclasifica de "Baja" a P3. Todas las aserciones de etiqueta vieja ("Muy alta/Alta/Media/Baja") desaparecieron de los specs del worktree.

El ciclo de control se materializa de forma perezosa: GC1-GC3 derivan su `status` del `operationalState` real (triage/aprobación/plan ya ocurridos en Fases 2-3) y nunca se "aprueban" desde gobierno; intentarlo por `approve` devuelve 409. GC4/GC5 sí son actos de autoridad y mueven el estado, pero solo a través de `RequestStateService.assertTransition`, que sigue siendo el único escritor de `operationalState`. Las etapas de preparación (`request-validation`/`mark-ready`/`confirm-stabilization`) son endpoints propios con capacidad `review`, distintos de la aprobación, de modo que la Request alcanza las precondiciones de cada gate.

La barrera de autorización se impone con `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(...)` por endpoint (patrón `ApprovalController`), más el alcance por proceso en `GovernanceScopeService` (métodos nuevos sobre `request.mainProcessId`, no reutiliza el de knowledge que opera sobre Asset). `MODULE_MATRIX` no interviene como guard y conserva sus 21 claves.

La regla "registrar evidencia ≠ aprobar el gate" (BR-008) se respeta: crear validaciones no toca estado ni gate, y GC4 recomputa server-side su aprobabilidad (ningún defecto bloqueante sin resolver y la validación obligatoria de la ruta presente). El bloqueo es un flag transversal (`blockedAt`/`blockedResolvedAt`) que convive con el estado y no participa en `assertTransition`.

La auditoría cubre toda mutación dentro de la `$transaction`, con los tres `objectType` nuevos sincronizados en los dos lugares. La migración es puramente aditiva y los contratos generados regeneran byte a byte.

<details>
<summary>Issues (1)</summary>

1. **Validación sin enlace a gate (NIT)** — `ValidationService.create` nunca persiste `gateCheckId`, pese a que el modelo lo prevé para GC4. No afecta las reglas (el resumen de GC4 lee por `requestId`); es una mejora opcional de expediente para una fase futura.

</details>

<details>
<summary>Details</summary>

### Fórmula de prioridad: solo cambia el vocabulario

`computeScore` y `PRIORITY_WEIGHTS` quedan idénticos; el diff solo corrige el JSDoc ("0-100" → "20-100") y reemplaza `priorityLabel` por las glosas P1-P4, añadiendo un helper `priorityBand(score)` con cortes 80/65/45. El corte inferior 50→45 es el único cambio de comportamiento: 45-49 reclasifica de "Baja" a P3. Los tres specs del worktree (`request-state.service.spec.ts`, `priority.service.spec.ts`, `request.service.spec.ts`) migraron al vocabulario nuevo y el `describe` se renombró a "cortes 80/65/45"; no queda ningún literal viejo en el backend del worktree. **(confirmed)** Las glosas (`PRIORITY_BAND_LABELS`, constante privada) coinciden con el catálogo `PRIORITY_BAND` sembrado. La familia `PRIORITY` orientadora se dejó intacta.

### Máquina de estados: un solo escritor, transiciones aditivas

`IMPLEMENTED_TRANSITIONS` gana las 5 parejas de D-B4 (`EN_EJECUCION`→…→`CERRADA`) y ninguna de/hacia `BLOQUEADA`. `assertTransition` no cambia su lógica. `GovernanceStateService` valida que el `operationalState` actual sea el origen esperado (409 vía `assertTransition` si no) y escribe el destino con `applyTransition` dentro de la `$transaction` del servicio llamante — nunca inventa un estado. `block`/`unblock` no pasan por aquí. El spec afirma explícitamente que `assertTransition` no se invoca en block/unblock y que el recorrido completo hasta `CERRADA` es coherente. **(confirmed)**

### Materialización lazy y derivación de GC1-GC3

`GateCheckService.materialize` hace `upsert` de los 5 gates por el unique compuesto `(requestId, gateCode)`, fijando `conditionText`/`authorityText` desde `GATE_DEFINITIONS` (texto literal del marco §5, verificado contra `FCGR-INS-008-v2.0.txt`). `deriveStatus` resuelve GC1-GC3 por rango de estado (`STATE_RANK`) y fuerza GC4 a `NO_APLICA` en ruta `EXPLORACION`. Una decisión manual de `NO_APLICA` (waive) no se sobrescribe con la derivación salvo que la propia derivación imponga `NO_APLICA`. **(confirmed)**

### GC4: bloqueo recomputado server-side

`computeGc4Summary` marca `approvable=false` si hay alguna validación `blocking && !blockingResolved`, o si la ruta (COMPLETA/SIMPLIFICADA) exige `FUNCIONAL_ACEPTACION` aprobatoria y no existe. Se recomputa tanto en `mark-ready` como en `approve` (409 con la lista de motivos), no se confía en un flag persistido. El spec cubre: bloqueo por defecto sin resolver, desbloqueo tras `resolve-blocking`, rechazo de `mark-ready` por bloqueante y por obligatoria faltante, y GC1-GC3 → 409. **(confirmed)**

### Autorización y alcance

Los dos controllers aplican `@UseGuards(CurrentUserGuard, RolesGuard)`: lectura con los 3 roles (`frameworks`), mutaciones con `JEFE_AREA, LIDER_PROCESO` (`review`), registrar validaciones con los 3 roles. `GovernanceScopeService` escribe métodos nuevos (`requireInScope` 404 fuera de alcance, `requireRequestManager` sobre `request.mainProcessId` 403, `requireAreaLead`) y no reutiliza el de knowledge. Las rutas estáticas (`GC4/request-validation`, etc.) se declaran antes que las paramétricas (`:gateCode/approve`), evitando el shadowing. **(confirmed)**

### Validaciones, evidencia y BR-008

`ValidationService.create` valida `VALIDATION_TYPE`/`VALIDATION_RESULT` contra catálogo (400), la coherencia versión↔documento (400 si el `documentId` de la versión no coincide), y el alcance del documento de evidencia (404). No cambia estado ni gate. `resolveBlocking` setea los tres campos de D-C5, exige `blocking=true` (400 si no) y pertenencia a la Request (404), sin aprobar gate. El modelo prevé `gateCheckId` pero `create` no lo setea: la validación queda ligada solo a la Request. Como `computeGc4Summary` lee por `requestId`, el bloqueo de GC4 funciona igual; es una pérdida menor de asociación directa en el expediente, no un defecto. **(confirmed)**

### Auditoría sincronizada en los dos lugares

`GATE_CHECK`, `GATE_PENDING_ITEM` y `VALIDATION_RECORD` se añaden tanto en `AuditObjectType` (`audit.service.ts`) como en `OBJECT_TYPES` (`list-audit-events.dto.ts`), evitando el 400 del filtro `?objectType=`. La aprobación de gate audita `UPDATE GATE_CHECK` + `UPDATE REQUEST` (before/after `operationalState`), igual que `ApprovalService`. Toda mutación audita dentro de su `$transaction`. **(confirmed)**

### Migración aditiva y catálogos

`20261009141516_fase7_gobierno/migration.sql` crea `gate_checks`/`gate_pending_items`/`validation_records` y añade 6 columnas a `requests` con sus FK e índices; no toca columnas ni el enum existentes. El seed añade `GOVERNANCE_ROUTE`, `VALIDATION_TYPE` (6 tipos del marco), `VALIDATION_RESULT` y `PRIORITY_BAND`, idempotente por `catalog+code`. **(confirmed)**

### Frontend y contrato

`page.tsx` reemplaza `UnderConstruction` por `<FrameworksView/>` (Server→Client, patrón priorización) con wrapper tipado `lib/governance.ts` que reutiliza `ApiError`/`toApiError` y la instancia única del cliente; no importa Prisma ni accede a Postgres. `navigation.ts` y `module-matrix.ts` no aparecen en el diff (21 claves intactas, `module-matrix.spec` afirma las 21). `contracts:generate` regenera `openapi.json` + `schema.d.ts` sin diff (byte a byte), cumpliendo la verja de CI. **(confirmed)**

### Verificación independiente ejecutada

- `npm run test:unit`: 44 suites, 367/367 OK.
- `npm run typecheck` (api + api-client + web): exit 0.
- `npm run contracts:generate` + `git diff --exit-code`: sin diff pendiente.

</details>

<details>
<summary>Archivos cambiados</summary>

- `apps/api/prisma/schema.prisma` — 3 modelos nuevos + campos aditivos de Request.
- `apps/api/prisma/migrations/20261009141516_fase7_gobierno/migration.sql` — migración aditiva.
- `apps/api/prisma/seed.ts` — 4 catálogos nuevos idempotentes.
- `apps/api/src/modules/governance/**` — módulo nuevo (gate.ts, scope/state services, gate-check, validation, DTOs, specs).
- `apps/api/src/modules/request/request-state.ts` — 5 transiciones GC4/GC5.
- `apps/api/src/modules/request/request-state.service.ts` — priorityBand/priorityLabel P1-P4.
- `apps/api/src/modules/audit/{audit.service.ts,dto/list-audit-events.dto.ts}` — 3 objectType sincronizados.
- `apps/api/src/app.module.ts` — registra GovernanceModule.
- `apps/web/src/app/administracion/frameworks/{page.tsx,frameworks-view.tsx}` + `apps/web/src/lib/governance.ts` — pantalla real.
- `apps/api/openapi/openapi.json` + `packages/api-client/src/generated/schema.d.ts` — contrato regenerado.
- Specs de prioridad migrados a P1-P4.

Diff completo: `git -C .worktrees/fase7-gobierno diff main`.

</details>
