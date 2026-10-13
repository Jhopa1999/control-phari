# Implementation Plan — Importar/Exportar plan (Planificación)

Design: `.agents/tasks/plan-import-export/design.md` (APPROVED per `design-review.json`).
Scope: backend `apps/api/src/modules/plan`, contract regen (`openapi` + `api-client`),
frontend `apps/web/src/lib` + `apps/web/src/app/seguimiento/plan/plan-view.tsx`.

## Commands (real scripts, single-run — NOT watch)

- Backend typecheck: `npm run typecheck:api` (root) — or `npm run typecheck -p tsconfig.json` in `apps/api`.
- Backend tests (all): `npm run test:unit` (root) → runs `jest --config jest.config.ts` in `apps/api`.
- Backend tests (one file): `npm run test --workspace apps/api -- plan.service.spec.ts` (append the spec name; Jest filters by path).
- Backend build: `npm run build:api` (root).
- Contract regen (after DTO/endpoint changes): `npm run contracts:generate` (root) → runs `openapi:generate` (writes `apps/api/openapi/openapi.json`) then `api-client:generate` (writes `packages/api-client/src/generated/schema.d.ts`).
- Rebuild api-client dist (so web typecheck sees new schemas): `npm run build:api-client` (root).
- Web typecheck: `npm run typecheck:web` (root).
- Web build: `npm run build:web` (root).
- Full typecheck (api + api-client + web): `npm run typecheck` (root).

Note: Do NOT use `test:watch`. Playwright (`npm run test:e2e`) requires a running stack; the UI import/export is validated by manual integration per design §8, so no new Playwright specs are added.

## Facts verified against the code (grounding)

- `ValidationPipe` global is strict (`whitelist: true` + `forbidNonWhitelisted: true`) → extra properties → 400 (design §5.6; verify in `apps/api/src/app.config.ts`).
- `PlanService` constructor: `(prisma, audit, requestState, planState, guide)`. Any new dependency changes this signature and the spec `createMocks()`.
- `applyMilestoneRule` is a private method of `TaskService` today — must be extracted to a pure module and imported back (design §6.3).
- `DependencyService.assertNoCycle` is a private per-edge reachability DFS (`dependent → [predecessors]`, DFS from `predecessorTaskId`). The pure core becomes `reaches`; the import needs a new `hasCycle` for the whole graph (design §6.2).
- `Task.responsibleUserId` and `Task.processId` are nullable (`@db.Uuid`, FK `onDelete: Restrict`) → null-out on import (design §5.3).
- `PlanPhase` has `@@unique([planId, order])`; `Task`/`PlanPhase`/`TaskDependency` cascade on parent delete; delete order child→parent anyway (design §5.5).
- `AuditService.record(tx, {...})` supports only CREATE/UPDATE/DELETE/REVOKE → export does NOT audit; import audits one `UPDATE PLAN` (design §6.1).
- `plan.ts` / `tasks.ts` / `documents.ts` patterns: `PlanError`, `messageForStatus`, `{ data, error, response }`, `downloadMarkdown` (Blob + `<a download>` + `revokeObjectURL`).
- `plan-view.tsx`: action bar lives in `renderPlan()` success branch; `canEdit = status BORRADOR|DEVUELTO`; `busy`, `refreshPlanData`, `ConfirmDialog`, `personNameById`, `phaseNameById`, `formatDateOnly`, `taskStatusLabel`, filtered `taskTable.pageRows`/`tasks` already available.

---

- [ ] 1. Extract the milestone rule to a pure shared module.
      Create `apps/api/src/modules/plan/task/milestone.ts` exporting `applyMilestoneRule(input: { isMilestone: boolean; estimateHours?: number | null; startDate?: Date | null; endDate?: Date | null }): { estimateHours: number | null; startDate: Date | null; endDate: Date | null }` with the EXACT body currently in `TaskService.applyMilestoneRule` (same two `BadRequestException` messages: `'Un hito debe tener estimacion 0.'`, `'Un hito usa una sola fecha.'`). Then edit `apps/api/src/modules/plan/task/task.service.ts` to delete the private method and import `applyMilestoneRule` from `./milestone`, calling it unchanged.
      Files: `apps/api/src/modules/plan/task/milestone.ts` (new), `apps/api/src/modules/plan/task/task.service.ts`
      Verify: `npm run test --workspace apps/api -- task.service.spec.ts` passes (behavior unchanged); `npm run typecheck:api` clean.

- [ ] 2. Extract the cycle DFS to a pure shared module with `reaches` + `hasCycle`.
      Create `apps/api/src/modules/plan/dependency/cycle.ts` exporting `type Edge = { dependentRef: string; predecessorRef: string }`, `reaches(edges: Edge[], from: string, to: string): boolean` (adjacency `dependent → [predecessors]`, DFS from `from`, true if it reaches `to` — the current `assertNoCycle` logic without the throw), and `hasCycle(edges: Edge[]): boolean` (white/gray/black DFS over all nodes, true if any back-edge). Edit `apps/api/src/modules/plan/dependency/dependency.service.ts` so `assertNoCycle` loads the plan edges as today, maps them to `{ dependentRef: dependentTaskId, predecessorRef: predecessorTaskId }`, and calls `reaches(edges, predecessorTaskId, dependentTaskId)`; on true throw the SAME `BadRequestException` message as today.
      Files: `apps/api/src/modules/plan/dependency/cycle.ts` (new), `apps/api/src/modules/plan/dependency/dependency.service.ts`
      Verify: `npm run test --workspace apps/api -- dependency.service.spec.ts` passes (direct + transitive cycle cases unchanged); `npm run typecheck:api` clean.

- [ ] 3. Add unit tests for the extracted pure helpers.
      Create `apps/api/src/modules/plan/task/milestone.spec.ts` (milestone with `estimateHours > 0` → throws; two distinct dates → throws; single date copied to both; forces `estimateHours = 0`; non-milestone passthrough) and `apps/api/src/modules/plan/dependency/cycle.spec.ts` (`hasCycle`: direct A→B→A, transitive A→B→C→A, accepts a DAG → false; `reaches`: reachable/unreachable per edge). Follow the existing `*.spec.ts` import/style (no NestJS Test module needed; call the pure functions).
      Files: `apps/api/src/modules/plan/task/milestone.spec.ts` (new), `apps/api/src/modules/plan/dependency/cycle.spec.ts` (new)
      Verify: `npm run test --workspace apps/api -- milestone.spec.ts cycle.spec.ts` — all new tests pass.

- [ ] 4. Create the plan document DTOs (export response + import input) with class-validator.
      Create `apps/api/src/modules/plan/dto/plan-document.dto.ts` with the nested classes (design §5.6), all decorated with `@ApiProperty`/`@ApiPropertyOptional` so OpenAPI exposes them, and a shared `trim` transform matching `create-plan.dto.ts`:
      - `PlanDocumentHeaderDto`: `periodStart`/`periodEnd`/`commitmentDate` `@IsOptional() @IsDateString()`; `risks`/`mitigations` `@IsOptional() @Transform(trim) @IsString() @MaxLength(4000)`.
      - `PlanDocumentTaskDto`: `ref` `@IsString() @MaxLength(128)` non-empty; `title` `@Transform(trim) @IsString() @MaxLength(255)`; `isMilestone` `@IsBoolean()`; `estimateHours` `@IsOptional() @IsInt() @Min(0)`; `startDate`/`endDate` `@IsOptional() @IsDateString()`; `description`/`acceptanceCriteria` `@IsOptional() @Transform(trim) @IsString() @MaxLength(4000)`; `frameworkPhaseRequired` `@MaxLength(255)`; `evidenceUrl` `@MaxLength(2048)` (match `create-task.dto.ts`).
      - `PlanDocumentPhaseDto`: `order` `@IsInt() @Min(0)`; `name` `@Transform(trim) @IsString() @MaxLength(255)`; `startDate`/`endDate` optional date; `deliverable` `@IsOptional() @Transform(trim) @IsString() @MaxLength(2000)`; `tasks` `@IsArray() @ValidateNested({ each: true }) @Type(() => PlanDocumentTaskDto)`.
      - `PlanDocumentDependencyDto`: `dependentRef`/`predecessorRef` `@IsString() @MaxLength(128)`.
      - `PlanDocumentDto`: `kind` `@Equals('control-phari-plan')`; `formatVersion` `@Equals('1.0')`; `plan` `@ValidateNested() @Type(() => PlanDocumentHeaderDto)`; `phases` array of `PlanDocumentPhaseDto`; `dependencies` array of `PlanDocumentDependencyDto`.
      Create `apps/api/src/modules/plan/dto/import-plan-result.dto.ts` — `ImportPlanResultDto` with `@ApiProperty`: `requestId: string`, `planId: string`, `replaced: boolean`, `phasesCreated: number`, `tasksCreated: number`, `dependenciesCreated: number`, `message: string`.
      Files: `apps/api/src/modules/plan/dto/plan-document.dto.ts` (new), `apps/api/src/modules/plan/dto/import-plan-result.dto.ts` (new)
      Verify: `npm run typecheck:api` clean (DTOs compile; `class-transformer`/`class-validator` already deps).

- [ ] 5. Implement `PlanService.exportPlan` and `PlanService.importPlan`.
      Edit `apps/api/src/modules/plan/plan.service.ts`:
      - `exportPlan(actor, requestId): Promise<PlanDocumentDto>`: `requirePlanInScope`; load phases `orderBy: { order: 'asc' }` with tasks `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]`; load all plan dependencies via `taskDependency.findMany({ where: { dependent: { phase: { planId } } } })`; assign deterministic `ref` (`t0, t1, …`) building `Map<taskId, ref>`; serialize header + nested `phases[].tasks[]` (NO ids/responsible/process/flow fields) + `dependencies[]` mapped to `{ dependentRef, predecessorRef }`. No transaction, no audit (design §5.4/§6.1).
      - `importPlan(actor, requestId, dto): Promise<ImportPlanResultDto>`: `requirePlanInScope` → `{ plan, mainProcessId }`; gate `plan.status` must be `BORRADOR`/`DEVUELTO` else `ConflictException` (409) `'Solo se puede importar sobre un plan en borrador o devuelto.'`; pre-persist validation → `BadRequestException` (400): `ref` non-empty + unique; every `dependentRef`/`predecessorRef` resolves to an existing `ref`; no self-dependency; no duplicate pairs; `hasCycle(edges)` on the document edges → `'El plan importado contiene dependencias cíclicas.'`; per-task `applyMilestoneRule` (persist NORMALIZED values). Then ONE `this.prisma.$transaction`: (a) delete deps → tasks → phases of the plan; (b) `plan.update` header with `periodStart/periodEnd/commitmentDate/risks/mitigations` set to `dto.plan.* ?? null` (full replace, review finding #1); NEVER touch `status/submitted*/authorized*/returnReason`; (c) create phases with recomputed 0-based contiguous `order` from array index; (d) create tasks per phase mapping the §5.5(d) field list using `normalized.*`, leaving `responsibleUserId`/`processId` unset (null); build `Map<ref, newTaskId>`; (e) create dependencies resolving refs; (f) `audit.record(tx, { action: 'UPDATE', objectType: 'PLAN', objectId: plan.id, scopeProcessId: mainProcessId, before, after })`. Return `ImportPlanResultDto` with counts, `replaced: true`, and `message` (single source of success text).
      Files: `apps/api/src/modules/plan/plan.service.ts`
      Verify: `npm run typecheck:api` clean; existing `plan.service.spec.ts` still passes (`npm run test --workspace apps/api -- plan.service.spec.ts`).

- [ ] 6. Add the export/import endpoints to `PlanController` with OpenAPI annotations.
      Edit `apps/api/src/modules/plan/plan.controller.ts`:
      - `GET :requestId/plan/export` → `exportPlan`, `@ApiOperation` + `@ApiParam({ name: 'requestId', format: 'uuid' })` + `@ApiResponse({ status: 200, type: PlanDocumentDto })` + 403 + 404. `requestId` via `ParseUUIDPipe`.
      - `POST :requestId/plan/import` → `importPlan`, `@ApiBody({ type: PlanDocumentDto })` + `@ApiResponse({ status: 200, type: ImportPlanResultDto })` + 400 + 403 + 404 + 409. Body `@Body() dto: PlanDocumentDto`.
      Keep static `export`/`import` routes under `:requestId/plan/...` (same pattern as `plan/submit`). No new providers needed (`cycle.ts`/`milestone.ts` are pure imports); `PlanModule` unchanged.
      Files: `apps/api/src/modules/plan/plan.controller.ts`
      Verify: `npm run test --workspace apps/api -- plan.module.spec.ts` passes (routing/module contract intact); `npm run build:api` succeeds.

- [ ] 7. Add backend tests for export/import in `plan.service.spec.ts` style.
      Edit `apps/api/src/modules/plan/plan.service.spec.ts` (extend `createMocks()` to add the Prisma delegates used: `planPhase.findMany/deleteMany/create`, `task.findMany/deleteMany/create`, `taskDependency.findMany/deleteMany/create`; keep the `$transaction` passthrough). Add `describe('exportPlan')`: serialized doc has `kind: 'control-phari-plan'`, `formatVersion: '1.0'`, unique `ref`s, dependencies resolved to document-local `{ dependentRef, predecessorRef }` (not UUIDs), and no transaction/audit call. Add `describe('importPlan')`: 409 when status is `AUTORIZADO` and `EN_AUTORIZACION` (editable-state gate); replace semantics (deleteMany for deps/tasks/phases called before creates); milestone rule enforced (invalid milestone task → 400); cycle in document graph → 400; dependency round-trip (export → import rebuilds the dependency pairs via the ref map); `responsibleUserId`/`processId` not written (stay null); flow fields untouched (`plan.update` data excludes `status/submitted*/authorized*/returnReason`); one `UPDATE PLAN` audit inside the tx.
      Files: `apps/api/src/modules/plan/plan.service.spec.ts`
      Verify: `npm run test --workspace apps/api -- plan.service.spec.ts` — all new + existing tests pass. Then run the whole backend suite once: `npm run test:unit`.

- [ ] 8. Regenerate the OpenAPI contract and the typed api-client, and reexport the aliases.
      Run `npm run contracts:generate` (root) so `PlanDocumentDto` and `ImportPlanResultDto` land in `components['schemas']`. Then edit `apps/web/src/lib/api-client.ts` to add, in the Fase 3 (plan) block: `export type PlanDocument = components['schemas']['PlanDocumentDto'];` and `export type ImportPlanResult = components['schemas']['ImportPlanResultDto'];` (review finding #3). Then `npm run build:api-client` so the dist the web imports is updated.
      Files: generated `apps/api/openapi/openapi.json`, generated `packages/api-client/src/generated/schema.d.ts`, `apps/web/src/lib/api-client.ts`
      Verify: `npm run typecheck:api-client` clean; `npm run typecheck:web` resolves `PlanDocument`/`ImportPlanResult`.

- [ ] 9. Add frontend plan helpers in `apps/web/src/lib/plan.ts`.
      Edit `apps/web/src/lib/plan.ts` (reuse `PlanError`/`messageForStatus`/`toPlanError`): `exportPlan(requestId): Promise<PlanDocument>` via `api.GET('/requests/{requestId}/plan/export', ...)`; `importPlan(requestId, doc): Promise<ImportPlanResult>` via `api.POST('/requests/{requestId}/plan/import', { params, body: doc })`; `downloadPlanDocument(requestId, doc): void` (Blob `application/json`, `plan-<requestId>.json`, same mechanics as `downloadMarkdown`); `parsePlanDocumentFile(file): Promise<unknown>` (`file.text()` + `JSON.parse`, throw `PlanError` with a clear message on invalid JSON). Import `PlanDocument`/`ImportPlanResult` types from `./api-client`.
      Files: `apps/web/src/lib/plan.ts`
      Verify: `npm run typecheck:web` clean.

- [ ] 10. Add `downloadTasksCsv` in `apps/web/src/lib/tasks.ts`.
      Edit `apps/web/src/lib/tasks.ts`: add `downloadTasksCsv(requestId, rows, lookups)` producing a UTF-8 CSV with BOM `\uFEFF`, columns Fase, Título, Responsable, Inicio, Fin, Estimación (h), Estado, Hito (design §7.2/FR-3.1). Responsible via a provided name lookup («Sin asignar» when `responsibleUserId === null`, «—» when unknown); dates via a formatter param (caller passes `formatDateOnly`); status via `taskStatusLabel`; hito as Sí/No. CSV-escape fields containing `,`, `"`, or newlines (wrap in quotes, double embedded quotes). Download `tareas-<requestId>.csv` with the Blob + `<a download>` pattern. No `xlsx`/`exceljs` dependency.
      Files: `apps/web/src/lib/tasks.ts`
      Verify: `npm run typecheck:web` clean.

- [ ] 11. Wire the three buttons + import flow into `plan-view.tsx`.
      Edit `apps/web/src/app/seguimiento/plan/plan-view.tsx`: in `renderPlan()` success branch (plan loaded, `planState === 'success'`) add a plan action bar with: «Exportar plan» (always enabled unless `busy`; calls `exportPlan(selectedId)` then `downloadPlanDocument`), «Exportar tareas (Excel)» (enabled when ≥1 task; `disabledReason` when 0; calls `downloadTasksCsv` with filtered `tasks`, `phaseNameById`→phase name, `personNameById`, `formatDateOnly`, `taskStatusLabel`), «Importar plan» (visible always, enabled only when `canEdit && !busy`; triggers a hidden `<input type="file" accept="application/json,.json">`). Import flow: on file pick → `parsePlanDocumentFile` → open a `danger` `ConfirmDialog` warning the replace is destructive → on confirm `importPlan(selectedId, doc)` → `toast.success(result.message)` + `await refreshPlanData()`; on error `toast.error(messageOf(err))`; clear the input value so the same file can be retried. Reuse `toast`, `ConfirmDialog`, `Button`, `DisabledReason`. Keyboard-operable (real button triggers the hidden input).
      Files: `apps/web/src/app/seguimiento/plan/plan-view.tsx`
      Verify: `npm run typecheck:web` clean; `npm run build:web` succeeds.

- [ ] 12. Final cross-cutting verification.
      Run the full typecheck and both app builds to confirm the feature integrates end to end.
      Files: none (verification only)
      Verify: `npm run typecheck` (api + api-client + web) clean; `npm run build:api` and `npm run build:web` succeed; `npm run test:unit` green. Remove any temporary files created during verification.

## Assumptions / gaps

- CSV reflects the currently-filtered task list the user sees (design SUP-4). If the whole plan is wanted instead, pass the unfiltered `tasks` array — a one-line change at the call site.
- `ref` strings are document-local and arbitrary; the export emits `t0, t1, …` and the import accepts any non-empty unique string (design SUP-5). Strict pipe (`forbidNonWhitelisted`) rejects any extra property with 400.
- No new Playwright specs: the UI import/export is validated by manual integration per design §8; backend behavior is covered by Jest.
