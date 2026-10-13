# Plan de implementación · Fase 2 · Flujo de Demanda (control-phari)

> Fuente de verdad: `design.md` (Revisión 3, APPROVED en `design-review.md`) + SDD en
> `SDD_control-phari`. Todo el trabajo ocurre en el worktree
> `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase2-demanda` (rama
> `feat/fase2-demanda`). Usar SIEMPRE rutas absolutas; el cwd del agente es el workspace raíz.
> Para comandos de git usar `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase2-demanda`.
> Para comandos npm, ejecutar con `cwd` = worktree (o un subdir del worktree donde indique).
>
> Comandos reales del repo (verificados en package.json raíz y de apps/api):
> - `npm run prisma:validate` (raíz → apps/api)
> - `npm run prisma:migrate:dev -- --name fase2_demanda` (desde `apps/api`; equivale a `prisma migrate dev`)
> - `npm run prisma:generate` (raíz)
> - `npm run prisma:seed` (desde `apps/api`; `tsx prisma/seed.ts`, idempotente)
> - `npm run contracts:generate` (raíz = `openapi:generate` + `api-client:generate`)
> - `npm run typecheck` (raíz: api + api-client + web)
> - `npm run build` (raíz: api + api-client + web)
> - `npm run test:unit` (raíz → apps/api → `jest`)
> - `npm run test:e2e` (raíz → `playwright test`)
> - Postgres de dev escucha en el puerto **5433** (DATABASE_URL del .env del worktree).
>
> Patrones heredados de Fase 1 (verificados en código, a imitar tal cual):
> - Service: `$transaction` → mutación + `AuditService.record(tx, …)` en la MISMA tx; P2002 →
>   `ConflictException`; alcance en el `where` (fuera de alcance = 404 por `findFirst`); DTO
>   `class-validator` + `@nestjs/swagger`; DTOs request/response separados.
> - Spec: Prisma mockeado con `$transaction` que ejecuta el callback con el propio mock como `tx`;
>   `audit.record` como `jest.fn()`; actores de prueba `jefe()/noJefe()`.
> - Frontend: wrapper tipado por módulo (patrón `src/lib/catalog.ts`) con clase `*Error` que mapea
>   400/403/404/409 a mensajes; vistas con estados loading/vacío/error/éxito (patrón
>   `catalogs-view.tsx`); consumo exclusivo por la instancia `api` de `src/lib/api-client.ts`.

---

- [ ] 1. **Esquema Prisma: entidades de Fase 2 + relaciones inversas.**
      Añadir a `apps/api/prisma/schema.prisma` los modelos `Request`, `RequestParticipant`,
      `Triage`, `PriorityEvaluation`, `Approval` exactamente con los campos, columnas `@map`,
      tipos, defaults, FKs (`onDelete` según §1.2), `@@unique([requestId, processId], name:
      "request_participant_unique")`, índices y `@@map` especificados en design §1.2. Añadir las
      relaciones inversas en `Process` (`requests`, `requestParticipations`) y `User`
      (`triages`, `priorityEvaluations`, `approvals`) SIN alterar los campos existentes de Fase 1.
      `Request.operationalState` con `@default("REGISTRADA")` (default solo en schema).
      Files: `.worktrees/fase2-demanda/apps/api/prisma/schema.prisma`
      Verify: desde `.worktrees/fase2-demanda` ejecutar `npm run prisma:validate` → sale "The schema
      at prisma/schema.prisma is valid". (`npm run prisma:format` opcional para normalizar.)

- [ ] 2. **Migración versionada `fase2_demanda` + regenerar client.**
      Con Postgres de dev arriba en 5433 (`npm run db:up` si hace falta), desde
      `.worktrees/fase2-demanda/apps/api` ejecutar `npm run prisma:migrate:dev -- --name
      fase2_demanda`. Esto crea `apps/api/prisma/migrations/<ts>_fase2_demanda/migration.sql` con
      las 5 tablas, FKs, uniques e índices, y regenera el client en `apps/api/src/generated/prisma`.
      No tocar migraciones de Fase 1. Depende de 1.
      Files: `.worktrees/fase2-demanda/apps/api/prisma/migrations/<ts>_fase2_demanda/migration.sql`
      (generado), `apps/api/src/generated/prisma/*` (regenerado).
      Verify: la migración aplica sin error; `npm run prisma:validate` sigue en verde; el directorio
      de migración existe y `migration.sql` contiene `CREATE TABLE "requests"`, `"triages"`,
      `"priority_evaluations"`, `"approvals"`, `"request_participants"`.

- [ ] 3. **Extender el seed con `TRIAGE_ROUTE` y `TRIAGE_SIZE` (idempotente).**
      En `apps/api/prisma/seed.ts`, añadir a la constante `CATALOG_ITEMS` las familias
      `TRIAGE_ROUTE` (BI/"BI", INTEGRACIONES/"Integraciones", IA/"IA", MULTIPROCESO/"Multiproceso
      (FMAA)") y `TRIAGE_SIZE` (S/M/L/XL) según §1.5/§11 D8, respetando el patrón `upsert` por
      `catalog_code_unique`. No reescribir el resto del seed. Depende de 2.
      Files: `.worktrees/fase2-demanda/apps/api/prisma/seed.ts`
      Verify: desde `.worktrees/fase2-demanda/apps/api` ejecutar `npm run prisma:seed` dos veces
      seguidas → ambas terminan con "Seed OK" y el conteo de maestras no se duplica (idempotencia).

- [ ] 4. **Ampliar `AuditObjectType` con los 4 nuevos tipos.**
      En `apps/api/src/modules/audit/audit.service.ts`, extender el tipo
      `AuditObjectType` a `'PROCESS' | 'USER' | 'GRANT' | 'CATALOG_ITEM' | 'REQUEST' | 'TRIAGE' |
      'PRIORITY_EVALUATION' | 'APPROVAL'`. No cambiar `AuditAction` ni la firma de `record`.
      Files: `.worktrees/fase2-demanda/apps/api/src/modules/audit/audit.service.ts`
      Verify: `npm run typecheck` (api) en verde.

- [ ] 5. **Núcleo del módulo `request/`: enum de estados + `RequestStateService`.**
      Crear `apps/api/src/modules/request/request-state.ts` (enum `RequestState` con los 15 estados
      de §1.3) y `request-state.service.ts` con: helper de transición que SOLO admite las
      transiciones implementadas de §1.3 (lanza `ConflictException` para precondición de fase no
      cumplida y error interno para `from`/`to` imposible), lectura del triage vigente (única fila,
      1:1 efectivo) y de la última `PriorityEvaluation` por `evaluatedAt`, y cálculo del score
      (§1.4: `Math.round(Σ peso_i·(valor_i/5))`, pesos 25/15/15/10/10/10/10/5) + etiqueta
      `priorityLabel` (`>=80 'Muy alta'`, `>=65 'Alta'`, `>=50 'Media'`, `<50 'Baja'`, derivada,
      NO ligada a la familia PRIORITY del catálogo). La columna `operational_state` solo se escribe
      por este helper. Depende de 1/2 (tipos Prisma generados).
      Files: `.worktrees/fase2-demanda/apps/api/src/modules/request/request-state.ts`,
      `.worktrees/fase2-demanda/apps/api/src/modules/request/request-state.service.ts`
      Verify: `npm run typecheck` (api) en verde; se cubre con pruebas en el ítem 10.

- [ ] 6. **Módulo `request/`: CRUD de Request con scope + BR-001/017 + auditoría.**
      Crear `request.module.ts` (importa `PrismaModule`, `AuthModule`, `AuditModule`; provee
      `RequestStateService` y lo exporta a los submódulos), `request.controller.ts`
      (`@UseGuards(CurrentUserGuard, RolesGuard)`; GET `/requests`, GET `/requests/:id`, POST
      `/requests`, PATCH `/requests/:id`; sin `@Roles` extra = los 3 roles), `request.service.ts`
      (alcance por `mainProcessId ∈ scopedProcessIds` en el `where`, 404 fuera de alcance; crea
      estado `REGISTRADA`; materializa SIEMPRE el proceso principal como `RequestParticipant` y
      deduplica participantes §11 D2/D9; valida `participantProcessIds` como Process activo → 400 si
      no; en PATCH conserva `registeredAt`/`initialCommitmentDate` y exige `changeJustification`,
      BR-017; audita CREATE/UPDATE con `scopeProcessId = mainProcessId` en la misma `$transaction`),
      y DTOs en `request/dto/`: `CreateRequestDto`, `UpdateRequestDto` (sin `operationalState`),
      `ListRequestsDto` (`state?` `@IsEnum(RequestState)`, `mainProcessId?`), `RequestResponseDto`
      (incluye `operationalState`, `currentTriageDecision?`, `currentScore?`, `priorityLabel?`,
      `participants`). Registrar `RequestModule` en `app.module.ts` sin tocar los demás. Depende de
      4 y 5.
      Files: `.worktrees/fase2-demanda/apps/api/src/modules/request/request.module.ts`,
      `request.controller.ts`, `request.service.ts`, `dto/create-request.dto.ts`,
      `dto/update-request.dto.ts`, `dto/list-requests.dto.ts`, `dto/request-response.dto.ts`;
      editar `.worktrees/fase2-demanda/apps/api/src/app.module.ts`.
      Verify: `npm run typecheck` (api) y `npm run build` (api) en verde; pruebas en el ítem 10.

- [ ] 7. **Submódulo `triage/`: gate registro→triage (1:1 efectivo) + decisión.**
      Crear `request/triage/` (controller + service + dto + spec). Endpoints GET/POST
      `/requests/:id/triage` con `@Roles(JEFE_AREA, LIDER_PROCESO)` + alcance. Service: POST solo si
      `operationalState = REGISTRADA` (otro estado → 409, incluye 2º POST = HIGH-1); valida codes
      maestros (`routeCode`/`demandTypeCode`/`criticalityCode`/`sizeCode`/`dataAvailabilityCode`)
      contra `CatalogItem` activo → 400 si no; aplica gate §2.2 (`DEVOLVER`→DEVUELTA,
      `RECHAZAR`→RECHAZADA, `CONTINUAR` deja `EN_TRIAGE` y habilita prioridad); CREATE Triage +
      UPDATE Request + audita, todo en una `$transaction`. `CreateTriageDto` con `decision`
      `@IsEnum(['CONTINUAR','DEVOLVER','RECHAZAR'])` requerido y resto opcional. Depende de 6.
      Files: `.worktrees/fase2-demanda/apps/api/src/modules/request/triage/triage.controller.ts`,
      `triage.service.ts`, `triage.module.ts` (o declarado dentro de `request.module.ts`),
      `dto/create-triage.dto.ts`, `dto/triage-response.dto.ts`, `triage.service.spec.ts`.
      Verify: `npm run typecheck` + `npm run test:unit` en verde (incluye los specs del ítem 10).

- [ ] 8. **Submódulo `priority/`: gate priorización (triage=Continuar + precondición de estado).**
      Crear `request/priority/`. Endpoints GET/POST `/requests/:id/priority` con `@Roles(JEFE_AREA,
      LIDER_PROCESO)` + alcance. Service POST exige: triage vigente = `CONTINUAR` (si no → 409) Y
      `operationalState ∈ {EN_TRIAGE, BACKLOG_PRIORIZADO}` (si no → 409 sin mutación, HIGH-2);
      calcula `score` en backend (nunca del cliente), persiste la evaluación (histórico 1:N, la
      vigente pasa a ser esta), lleva estado a `BACKLOG_PRIORIZADO` (idempotente en estado si ya lo
      está) y audita en `$transaction`. `CreatePriorityEvaluationDto` con los 8 criterios int
      `@Min(1)@Max(5)` requeridos + `justification?`; `score` NO se acepta.
      `PriorityEvaluationResponseDto` con `score` y `thresholdLabel`. GET devuelve histórico
      (vigente = última por `evaluatedAt`). Depende de 6 (y usa el score de 5).
      Files: `.worktrees/fase2-demanda/apps/api/src/modules/request/priority/priority.controller.ts`,
      `priority.service.ts`, `dto/create-priority-evaluation.dto.ts`,
      `dto/priority-evaluation-response.dto.ts`, `priority.service.spec.ts`.
      Verify: `npm run typecheck` + `npm run test:unit` en verde.

- [ ] 9. **Submódulo `approval/`: aprobación SEPARADA + cola de revisión.**
      Crear `request/approval/`. Endpoints GET `/requests/pending-approval` (cola: Requests en
      `BACKLOG_PRIORIZADO` dentro del alcance, `@Roles(JEFE_AREA, LIDER_PROCESO)`), GET
      `/requests/:id/approval` (histórico), POST `/requests/:id/approval` (`@Roles(JEFE_AREA,
      LIDER_PROCESO)` = capacidad `review`). Service POST: precondición estado =
      `BACKLOG_PRIORIZADO` (si no → 409); `APROBAR`→`COMPROMETIDA`; `DEVOLVER`→`EN_TRIAGE`
      (destino determinista, `previousState=BACKLOG_PRIORIZADO`) con `reason` requerido (ausencia →
      `BadRequestException` 400, NO 409); registra `Approval` (append-only) + UPDATE Request +
      audita en `$transaction`. Sin `review` → 403 sin mutación (AC-006). `CreateApprovalDto` con
      `decision` `@IsEnum(['APROBAR','DEVOLVER'])` requerido + `reason?` (condicional en service).
      `ApprovalResponseDto`. Depende de 6/8.
      Files: `.worktrees/fase2-demanda/apps/api/src/modules/request/approval/approval.controller.ts`,
      `approval.service.ts`, `dto/create-approval.dto.ts`, `dto/approval-response.dto.ts`,
      `approval.service.spec.ts`.
      Verify: `npm run typecheck` + `npm run test:unit` en verde.

- [ ] 10. **Pruebas unitarias nuevas (Jest, Prisma mockeado) de gates/score/permisos/auditoría.**
      Añadir/completar specs (patrón `process.service.spec.ts`) que cubran design §5:
      (a) **score** — todos 5 → 100; todos 1 → 20; mezcla con `Math.round`; rechazo si falta un
      criterio (DTO lo exige); etiqueta por tramo. (b) **gate triage** — Continuar habilita
      priorización; Devolver→DEVUELTA y Rechazar→RECHAZADA bloquean; 2º POST triage → 409 sin
      mutación; triage sobre DEVUELTA → 409. (c) **BR-006** — guardar evaluación NO lleva a
      COMPROMETIDA (solo aprobación); re-POST priority sobre COMPROMETIDA → 409 sin mutación. (d)
      **AC-006** — rol sin `review` no puede aprobar (403 sin mutación). (e) **alcance** — Request
      de proceso B para líder de A → 404 (where por `mainProcessId`). (f) **auditoría** —
      `AuditService.record` invocado en cada mutación con `objectType` correcto y
      `scopeProcessId = mainProcessId`. (g) **BR-001** — crear/editar siempre deja
      `RequestParticipant` del proceso principal. (h) **DEVOLVER sin reason → 400**; code maestro
      inexistente → 400. Depende de 5–9.
      Files: specs bajo `.worktrees/fase2-demanda/apps/api/src/modules/request/**/*.spec.ts`.
      Verify: `npm run test:unit` en verde con las pruebas nuevas pasando.

- [ ] 11. **Regenerar contrato OpenAPI + api-client y commitear artefactos.**
      Desde `.worktrees/fase2-demanda` ejecutar `npm run contracts:generate`. Commitear
      `apps/api/openapi/openapi.json` y `packages/api-client/src/generated/*`. No cambiar el
      mecanismo de `X-Actor-Id`. Depende de 6–9 (endpoints/DTOs definidos).
      Files (regenerados): `.worktrees/fase2-demanda/apps/api/openapi/openapi.json`,
      `.worktrees/fase2-demanda/packages/api-client/src/generated/*`.
      Verify: `npm run typecheck` (incluye api-client y web) y `npm run build` en verde; el
      `openapi.json` contiene paths `/requests`, `/requests/{id}/triage`, `/requests/{id}/priority`,
      `/requests/{id}/approval`, `/requests/pending-approval`.

- [ ] 12. **Frontend: wrappers tipados + pantallas SCR-03/04/05/20.**
      Crear wrappers `src/lib/requests.ts`, `triage.ts`, `priority.ts`, `approval.ts` (patrón
      `catalog.ts`: clase `*Error`, mapeo 400/403/404/409, consumo por la instancia `api`).
      Reemplazar los placeholders `UnderConstruction` por vistas funcionales (patrón
      `catalogs-view.tsx`, estados loading/vacío/error/éxito, AC-030/031 conservar entrada ante
      error, accesibilidad): SCR-03 `demanda/solicitudes` (listado + alta/edición, proceso principal
      requerido y siempre en participantes, estado read-only, justificación en edición, pestañas con
      fases posteriores bloqueadas por precondición), SCR-04 `demanda/triage` (selects de maestras +
      decisión), SCR-05 `demanda/priorizacion` (8 criterios 1–5, score mostrado tras guardar,
      mensaje "guardar ≠ aprobar"), SCR-20 `administracion/revision` (cola de
      `/requests/pending-approval`, Aprobar/Devolver con motivo). Añadir `components/ui/textarea.tsx`
      (shadcn) solo si se necesita. No cambiar `navigation.ts`. Depende de 11 (tipos generados).
      Files: `.worktrees/fase2-demanda/apps/web/src/lib/{requests,triage,priority,approval}.ts`;
      `apps/web/src/app/demanda/solicitudes/{page.tsx,solicitudes-view.tsx}`;
      `apps/web/src/app/demanda/triage/{page.tsx,triage-view.tsx}`;
      `apps/web/src/app/demanda/priorizacion/{page.tsx,priorizacion-view.tsx}`;
      `apps/web/src/app/administracion/revision/{page.tsx,revision-view.tsx}`; opcional
      `apps/web/src/components/ui/textarea.tsx`.
      Verify: `npm run typecheck` (web) y `npm run build` (web) en verde.

- [ ] 13. **Verificación de cierre + verificación manual registrada.**
      Desde `.worktrees/fase2-demanda` ejecutar en verde, en orden: `npm run prisma:validate`,
      `npm run typecheck`, `npm run build`, `npm run test:unit`. Confirmar que Fase 1
      (`/catalogs`, `/catalog-items`, `/gobierno/*`) sigue operativa. Con la API arrancada contra
      Postgres 5433, recorrer manualmente el flujo feliz (crear solicitud → triage Continuar →
      priorizar → aprobar → Comprometida) y los gates negativos (priorizar sin Continuar → 409;
      aprobar sin backlog → 409; 2º triage → 409; devolver sin motivo → 400; aprobar sin review →
      403; Request de otro proceso → 404; re-priorizar tras Comprometida → 409). Registrar el
      recorrido en `verification.md`. Depende de todo lo anterior.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.agents\tasks\fase2-demanda\verification.md`
      Verify: los 4 comandos pasan; `verification.md` existe y documenta flujo feliz + gates
      negativos con el resultado observado.

---

## Supuestos y notas

- La migración y el seed requieren Postgres de dev en el puerto **5433** (DATABASE_URL del `.env`
  del worktree). Si no está arriba, `npm run db:up` desde el worktree lo levanta vía Docker Compose.
- `prisma:migrate:dev` genera el nombre de carpeta con timestamp; la ruta exacta
  `<ts>_fase2_demanda` la produce Prisma, no se escribe a mano.
- Las pruebas E2E (Playwright) del design §5 son deseables pero el entorno puede no tenerlas
  cableadas; la verificación OBLIGATORIA del encargo es unitaria + manual registrada en
  `verification.md`. Si `test:e2e` está disponible y arranca, ejecutarlo; si no, dejarlo
  documentado como no ejecutado en `verification.md`.
