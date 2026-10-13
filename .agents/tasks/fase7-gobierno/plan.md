# Implementation Plan — Fase 7 · Gobierno de la demanda

> Worktree (rutas ABSOLUTAS): `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase7-gobierno`.
> Diseño aprobado: `.agents\tasks\fase7-gobierno\design.md`. Marco rector: `docs\marco-corporativo\FCGR-INS-008-v2.0.txt`.
> Comandos reales del repo (raíz del worktree salvo nota): `npm run prisma:validate`, `npm run prisma:migrate:dev --workspace apps/api -- --name fase7_gobierno`, `npm run prisma:seed --workspace apps/api`, `npm run contracts:generate`, `npm run build:api-client`, `npm run typecheck`, `npm run build`, `npm run test:unit`.
> Prisma 7: `@@unique` compuesto SÍ sirve para `findUnique`/`upsert`; estados/catálogos son `String` validados en service, no enums de Postgres. Único escritor de `operationalState` = `RequestStateService`.

Este plan está ordenado por dependencia. Cada ítem deja el repo compilable. La verificación usa los comandos reales del repo, no grep.

- [ ] 1. **Modelo Prisma + migración `fase7_gobierno`.**
      Añadir en `apps/api/prisma/schema.prisma` los modelos `GateCheck`, `GatePendingItem`, `ValidationRecord` (design §2.2–2.4, con las dos FK de evidencia `evidenceDocumentId`→`Document` y `evidenceDocumentVersionId`→`DocumentVersion` ambas `onDelete: Restrict`, y los campos de defecto bloqueante `blockingResolved`/`blockingResolvedAt`/`blockingResolvedByUserId` de D-C5). Ampliar `Request` (§2.5) con `governanceRoute String?` y el flag transversal de bloqueo (`blockedReason`/`blockedAt`/`blockedByUserId`/`blockedResolvedAt`/`blockedResolvedByUserId` + relaciones `RequestBlockedBy`/`RequestBlockedResolvedBy`), más las relaciones inversas `gateChecks`/`validationRecords` y los índices `@@index([governanceRoute])`/`@@index([blockedAt])`. Añadir relaciones inversas con `name` propio en `User` (`GateCheckDecider`, `GatePendingOwner`, `ValidationExecutor`, `ValidationBlockingResolver`, `RequestBlockedBy`, `RequestBlockedResolvedBy`), en `Document` (`ValidationEvidenceDocument`) y en `DocumentVersion` (`ValidationEvidenceVersion`). NINGÚN campo existente se elimina/renombra; el enum `operationalState` no se toca.
      Crear la migración versionada `fase7_gobierno` (aditiva).
      Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_fase7_gobierno/migration.sql`.
      Verify: `npm run prisma:validate` OK; `npm run prisma:migrate:dev --workspace apps/api -- --name fase7_gobierno` aplica sin error y `npm run prisma:generate` regenera el cliente.

- [ ] 2. **Catálogos nuevos + seed idempotente.**
      Añadir a `apps/api/prisma/seed.ts` (array `CATALOG_ITEMS`, upsert por `catalog+code`, datos ficticios) las familias del design §2.7: `GOVERNANCE_ROUTE` (COMPLETA/SIMPLIFICADA/EXPLORACION), `VALIDATION_TYPE` (FUNCIONAL_ACEPTACION, COMPONENTE_INTEGRACION, REGRESION, INFORMACION, ACCESO_SEGURIDAD, RENDIMIENTO_CONTINUIDAD), `VALIDATION_RESULT` (APROBADA, APROBADA_CON_OBSERVACIONES, FALLIDA, BLOQUEADA) y `PRIORITY_BAND` (P1–P4 con glosa). No tocar la familia `PRIORITY` existente.
      Files: `apps/api/prisma/seed.ts`.
      Verify: `npm run prisma:seed --workspace apps/api` corre dos veces sin duplicar filas (idempotente).

- [ ] 3. **Ajuste de la fórmula de prioridad al marco (sección 4).**
      En `apps/api/src/modules/request/request-state.service.ts`: cambiar `priorityLabel(score)` al vocabulario P1–P4 con corte inferior 50→45 (80/65/45) devolviendo la glosa del marco; añadir helper `priorityBand(score): 'P1'|'P2'|'P3'|'P4'`; corregir el JSDoc de `computeScore` ("20-100") y de `priorityLabel` (cortes 80/65/45). `computeScore` y `PRIORITY_WEIGHTS` NO cambian. Opcional aditivo: `priorityBand` en `RequestResponseDto`/`PriorityEvaluationResponseDto`.
      Actualizar TODAS las aserciones de etiqueta (literal "Muy alta/Alta/Media/Baja" → P1–P4) en los tres specs: `request-state.service.spec.ts` (incl. renombrar el describe a `cortes 80/65/45` y el caso 45–49 → P3), `priority/priority.service.spec.ts`, `request.service.spec.ts` (score=72 → P2); revisar `approval/approval.service.spec.ts`.
      Files: `apps/api/src/modules/request/request-state.service.ts`, `.../request-state.service.spec.ts`, `.../priority/priority.service.spec.ts`, `.../request.service.spec.ts`, `.../approval/approval.service.spec.ts` (y DTOs si se añade `priorityBand`).
      Verify: `npm run test:unit` — specs de prioridad en verde con el nuevo vocabulario; `computeScore` 20/100 intactos.

- [ ] 4. **Enum lógico de gates + extensión de transiciones de estado.**
      Crear `apps/api/src/modules/governance/gate.ts` con `GateCode`, `GateStatus`, `GATE_ORDER`, `GATE_DEFINITIONS` (texto literal del marco por gate), `STAGE_ADVANCE_TO_STATE` y el mapa de aprobación GC4/GC5→estado (design §2.1, §3.4). Añadir a `IMPLEMENTED_TRANSITIONS` en `apps/api/src/modules/request/request-state.ts` las 5 parejas de D-B4 (`EN_EJECUCION→EN_VALIDACION`, `EN_VALIDACION→LISTA_PARA_LIBERAR`, `LISTA_PARA_LIBERAR→EN_ESTABILIZACION`, `EN_ESTABILIZACION→OPERATIVA`, `OPERATIVA→CERRADA`). NO añadir transiciones de/hacia `BLOQUEADA`.
      Files: `apps/api/src/modules/governance/gate.ts`, `apps/api/src/modules/request/request-state.ts`.
      Verify: `npm run typecheck:api` compila; `npm run test:unit` existentes de request-state siguen en verde.

- [ ] 5. **Módulo API `governance/` (scope + state + gate-check + validation).**
      Crear el módulo completo (design §3.1–3.5): `governance.module.ts` (importa `PrismaModule`, `AuthModule`, `AuditModule`, `RequestModule`), `governance-scope.service.ts` (`requireInScope`, `requireRequestManager(actor, request)` sobre `request.mainProcessId`, `requireAreaLead`), `governance-state.service.ts` (precondiciones + delega en `RequestStateService.assertTransition`; único escritor del estado sigue siendo RequestStateService), `gate-check/` (controller + service + DTOs: endpoints GET gates, pending-items POST/PATCH, `GC4/request-validation`, `GC4/mark-ready` con recomputo server-side §1.5, `GC5/confirm-stabilization`, `:gateCode/approve` solo GC4/GC5, `:gateCode/waive`, `block`/`unblock`, `governance-route`), `validation/` (controller + service + DTOs: GET/POST validaciones, `resolve-blocking`). Materialización lazy de los 5 gates por `upsert` `(requestId, gateCode)` y derivación de GC1–GC3. Autorización con `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(...)` (review ≡ JEFE_AREA+LIDER_PROCESO; frameworks ≡ los 3 roles). Toda mutación audita en `$transaction`. Registrar el módulo en `app.module.ts`. NO añadir claves a `MODULE_MATRIX` (se mantienen las 21). Escribir los specs `gate-check.service.spec.ts`, `validation.service.spec.ts`, `governance-state.service.spec.ts` (casos de design §6).
      Sincronizar auditoría en los DOS lugares: `GATE_CHECK`/`GATE_PENDING_ITEM`/`VALIDATION_RECORD` en `audit.service.ts` (`AuditObjectType`) y en `audit/dto/list-audit-events.dto.ts` (`OBJECT_TYPES`).
      Files: `apps/api/src/modules/governance/**`, `apps/api/src/app.module.ts`, `apps/api/src/modules/audit/audit.service.ts`, `apps/api/src/modules/audit/dto/list-audit-events.dto.ts`.
      Verify: `npm run test:unit` — nuevos specs en verde (transiciones GC4/GC5, bloqueo transversal sin cambiar estado, GC4 bloqueado por bloqueante sin resolver / validación obligatoria faltante, registrar validación no mueve estado, resolve-blocking, aprobar GC1–GC3→409, waive/NO_APLICA); `npm run typecheck:api` OK.

- [ ] 6. **Regenerar contrato OpenAPI + api-client y versionarlo.**
      Tras los controllers/DTOs nuevos: `npm run contracts:generate` (regenera `apps/api/openapi/openapi.json` y `packages/api-client/src/generated/schema.d.ts`) y `npm run build:api-client` ANTES del typecheck de web. Commit de `openapi.json` + `packages/api-client/src/generated/*`.
      Files: `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts`.
      Verify: `git -C <worktree> diff --exit-code` limpio tras `contracts:generate` (sincronizado, como exige CI); `npm run build:api-client` OK.

- [ ] 7. **Pantalla de Gobierno/Cumplimiento (convertir el placeholder frameworks).**
      Reemplazar `apps/web/src/app/administracion/frameworks/page.tsx` (hoy `UnderConstruction`) por la pantalla real que consume `@plantilla-portales/api-client` (patrón `demanda/priorizacion`): selector de Request en alcance + ruta proporcional editable; tablero de los 5 gates (condición/autoridad del marco, status con badge no dependiente solo de color, pendientes, acciones por rol, GC4 con resumen de validaciones y "Aprobar" deshabilitado si hay defecto bloqueante); tabla + formulario de validaciones; badge de banda P1–P4. shadcn/ui, roles ARIA, foco visible. NO añadir ruta/ítem de menú ni tocar el grupo "Gobierno" ni `navigation.ts`.
      Files: `apps/web/src/app/administracion/frameworks/page.tsx` (+ componentes/`lib` auxiliares bajo `apps/web/src`).
      Verify: `npm run typecheck:web` OK; `npm run build:web` compila.

- [ ] 8. **Verificación integral (checklist obligatoria del design §9).**
      En orden: `npm run prisma:validate`; migración aplicada; `npm run prisma:seed --workspace apps/api` (idempotente); `npm run contracts:generate` + `npm run build:api-client`; `npm run typecheck` (api + api-client + web, TS estricto sin `any` injustificado); `npm run test:unit` (specs nuevos y de prioridad actualizados en verde); confirmar `AuditObjectType` y `OBJECT_TYPES` sincronizados; `npm run build` (api + api-client + web). Limpiar artefactos temporales.
      Files: —
      Verify: todos los comandos anteriores terminan sin error; `git diff --exit-code` limpio para artefactos generados.

## Notas / verificar durante la implementación
- Confirmar que `RequestModule` exporta `RequestStateService` (verificado) para inyectarlo en `governance.module.ts`.
- Confirmar en runtime que el orden de registro de controllers de governance pone rutas estáticas antes que paramétricas (patrón de `ApprovalController` antes de `RequestController`).
- Verificar que `module-matrix.spec.ts` sigue afirmando 21 claves tras el cambio (no se añade clave `governance`).
- Verificar que la obligatoriedad por ruta de §1.5 se evalúa server-side en `mark-ready` y `approve` (recompute, no flag persistido).
