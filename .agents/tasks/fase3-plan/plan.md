# Plan de implementación · Fase 3 · Plan y Ejecución (control-phari)

> Derivado del diseño APROBADO (`design.md`, iteración 2; `design-review.md` → 0 HIGH / 0 MEDIUM / 3 NIT → APPROVED).
> Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase3-plan` (rama `feat/fase3-plan`). Rutas absolutas. Windows + PowerShell.
> Steering: Prisma solo en `apps/api`; frontend solo vía `@plantilla-portales/api-client`; TS estricto sin `any`; auditar dentro de la transacción; no duplicar la máquina de estados (reusar `RequestStateService`); usar comandos reales de `package.json`.
>
> **Comandos reales verificados** (raíz del repo salvo nota):
> - typecheck: `npm run typecheck` (api + api-client + web) · subset: `npm run typecheck:api`
> - build: `npm run build`
> - unit (Jest, backend): `npm run test:unit` (= `jest` en `apps/api`)
> - e2e (Playwright): `npm run test:e2e`
> - migración: `npm run prisma:migrate:dev -- --name fase3_plan --workspace apps/api`
> - generar cliente Prisma: `npm run prisma:generate`
> - regenerar contrato: `npm run contracts:generate` (= `openapi:generate` + `api-client:generate`)
>   - artefactos a committear: `apps/api/openapi/openapi.json` y `packages/api-client/src/generated/schema.d.ts`
>
> Patrones a imitar (código real leído): `apps/api/src/modules/request/approval/approval.service.ts` (acción + transición de Request + 2 auditorías en una `$transaction`), `request-state.service.ts` (helper validador, `scopeWhere`, `requireInScope`), `approval.service.spec.ts` (mock de Prisma con `$transaction` que ejecuta el callback con el mismo objeto mock), `request.module.ts` + `request.module.spec.ts` (orden estática-antes-de-paramétrica), `audit.service.ts` (`AuditObjectType`), `module-matrix.ts` (claves `plan`/`task`/`assigned`/`review`), `apps/web/src/lib/requests.ts` (wrapper tipado con `*Error`/`messageForStatus`), `apps/web/src/app/administracion/revision/revision-view.tsx` (loading/vacío/error/éxito, AC-031).

---

- [ ] 1. **Modelo de datos: añadir `Plan`, `PlanPhase`, `Task`, `TaskDependency` a Prisma + relaciones inversas.**
      Añadir los 4 modelos de §1.2 del diseño en `apps/api/prisma/schema.prisma` con columnas `@map` snake_case, PK `uuid @db.Uuid`, timestamps como los modelos existentes. `Plan.requestId` `@@unique([requestId], name: "plan_request_unique")` (1:1, D1); `PlanPhase` `@@unique([planId, order], name: "plan_phase_order_unique")`; `TaskDependency` `@@unique([dependentTaskId, predecessorTaskId], name: "task_dependency_unique")`. FKs: `Plan.request onDelete: Cascade`; `submittedBy`/`authorizedBy` User `onDelete: Restrict`; `Task.responsible`/`acceptedBy`/`process` `onDelete: Restrict`; `TaskDependency` ambas FK `onDelete: Cascade`. Añadir relaciones inversas en `Request` (`plan Plan?`), `Process` (`tasks Task[]`) y `User` (`plansSubmitted`/`plansAuthorized`/`tasksResponsible`/`tasksAccepted` con nombres `@relation`). Índices `@@index` de §1.2 y `@@map` a `plans`/`plan_phases`/`tasks`/`task_dependencies`.
      Files: `apps/api/prisma/schema.prisma`
      Verify: `npm run prisma:validate --workspace apps/api` sin errores; `npm run prisma:format --workspace apps/api` deja el schema estable.

- [ ] 2. **Migración versionada `fase3_plan` + regenerar cliente Prisma.**
      Generar la migración con el comando real (nunca `db push`) y regenerar el client tipado en `apps/api/src/generated/prisma`. Las tablas de Fases 1–2 no se tocan; no se añaden seeds obligatorios de fases (BR-011).
      Files: `apps/api/prisma/migrations/<timestamp>_fase3_plan/migration.sql` (generado)
      Verify: `npm run prisma:migrate:dev -- --name fase3_plan --workspace apps/api` crea la migración y la aplica; `npm run prisma:generate` regenera el client; `npm run typecheck:api` compila con los nuevos modelos disponibles.

- [ ] 3. **Extender `RequestState` (2 aristas) y `AuditObjectType` (4 tipos).**
      En `apps/api/src/modules/request/request-state.ts` añadir a `IMPLEMENTED_TRANSITIONS` las parejas `[COMPROMETIDA, EN_PLANIFICACION]` y `[EN_PLANIFICACION, EN_EJECUCION]` (§1.5). En `apps/api/src/modules/audit/audit.service.ts` ampliar el union `AuditObjectType` con `'PLAN' | 'PLAN_PHASE' | 'TASK' | 'TASK_DEPENDENCY'` (sin tocar `AuditAction`). No se duplica la máquina de Request: `RequestStateService.assertTransition` sigue siendo el único validador.
      Files: `apps/api/src/modules/request/request-state.ts`, `apps/api/src/modules/audit/audit.service.ts`
      Verify: `npm run typecheck:api` compila; se cubre con el test del paso 11.

- [ ] 4. **Enums y helpers de máquina de estados del plan/tarea (unit-testeables).**
      Crear `apps/api/src/modules/plan/task-status.ts` (enum `TaskStatus` de 5 estados + `isTaskTransitionAllowed(from,to)` con la tabla de §1.3) y `apps/api/src/modules/plan/plan-status.ts` (enum `PlanStatus` `BORRADOR|EN_AUTORIZACION|AUTORIZADO|DEVUELTO` + `assertPlanTransition(from,to)` con las transiciones de §1.4; lanza `ConflictException` para no permitidas). Sin dependencia de Prisma: lógica pura.
      Files: `apps/api/src/modules/plan/task-status.ts`, `apps/api/src/modules/plan/plan-status.ts`
      Verify: `npm run typecheck:api` compila; cubierto por tests del paso 11.

- [ ] 5. **DTOs request/response del módulo plan (class-validator + @nestjs/swagger).**
      Crear bajo `apps/api/src/modules/plan/dto/` y los submódulos: `CreatePlanDto`/`UpdatePlanDto`, `CreatePhaseDto`/`UpdatePhaseDto`/`ReorderPhasesDto`, `CreateTaskDto`/`UpdateTaskDto`/`UpdateTaskStatusDto`/`AcceptTaskDto`, `AddDependencyDto`, `SubmitPlanDto`/`AuthorizePlanDto`/`ReturnPlanDto`, `ListPlanTasksDto`, y los response DTOs (`PlanResponseDto`, `PlanPhaseResponseDto`, `TaskResponseDto` con `predecessors[]`, `TaskDependencyResponseDto`, `PlanGuideDto` + `PlanGuidePendingDto`, `MyWorkItemDto`). Reglas de validación de §3.4; `@ApiProperty` en todos los response (fechas `date-time`); TS estricto sin `any`.
      Files: `apps/api/src/modules/plan/dto/*.ts`, `apps/api/src/modules/plan/phase/dto/*.ts`, `apps/api/src/modules/plan/task/dto/*.ts`, `apps/api/src/modules/plan/dependency/dto/*.ts`
      Verify: `npm run typecheck:api` compila.

- [ ] 6. **`PlanStateService`: máquinas de tarea/plan + resolución de alcance task→plan→request.**
      Crear `apps/api/src/modules/plan/plan-state.service.ts` (D13): envuelve `isTaskTransitionAllowed`/`assertPlanTransition`; helpers `requirePlanInScope(actor, requestId)` (resuelve `Plan` por `findFirst({where:{requestId}})` — NO `findUnique`, §1.1 precaución Prisma 7 — y aplica `scopeWhere` por `request.mainProcessId`), `requireTaskInScope(actor, taskId)` (sube `task→phase→plan→request.mainProcessId`), y el gate de predecesoras `assertPredecessorsSatisfied(taskId)` (todas `TERMINADA` **y** `accepted`). 404 fuera de alcance; 409 gate incumplido nombrando la dependencia. Imita `scopeWhere`/`requireInScope` de `request-state.service.ts`.
      Files: `apps/api/src/modules/plan/plan-state.service.ts`
      Verify: `npm run typecheck:api` compila; cubierto por tests del paso 11.

- [ ] 7. **`PlanService` + `PlanController`: CRUD plan, guía, enviar, autorizar, devolver.**
      `plan.service.ts`: crear plan (solo Request `COMPROMETIDA` sin plan previo → `COMPROMETIDA→EN_PLANIFICACION` vía `RequestStateService`; 409 si no); `GET`/`PATCH` plan (no `status`); `submit()` recomputa guía en la `$transaction` y rechaza 409 enumerando pendientes; `authorize()` `EN_AUTORIZACION→AUTORIZADO` + Request `EN_PLANIFICACION→EN_EJECUCION` (dos auditorías UPDATE PLAN + UPDATE REQUEST, patrón `ApprovalService`); `return()` con `reason` (400 si falta) `EN_AUTORIZACION→DEVUELTO`. Toda mutación + `AuditService.record(tx,...)` con `scopeProcessId = request.mainProcessId` en una `$transaction`. `plan.controller.ts` con rutas de §3.3 (`/requests/:requestId/plan` + acciones), `@UseGuards(CurrentUserGuard, RolesGuard)`, `@Roles` (`plan`; autorizar/devolver `review`), swagger completo.
      Files: `apps/api/src/modules/plan/plan.service.ts`, `apps/api/src/modules/plan/plan.controller.ts`
      Verify: `npm run typecheck:api` compila; cubierto por tests del paso 11.

- [ ] 8. **`PlanGuideService`: guía de pendientes server-side (NÚCLEO BR-007/AC-007).**
      Crear `apps/api/src/modules/plan/plan-guide.service.ts` con `compute(planId): PlanGuideDto`. Categorías implementadas: `datesPhases` (fase sin `startDate`/`endDate`; `startDate>endDate`; cero fases) y `tasksResponsibles` (cero tareas; tarea sin `responsibleUserId`/fechas; hito con estimación≠0). Categorías gancho `capacity`/`evidenceGates`/`frameworkControls` en `futureCategories` → siempre 0 pendientes (§2.2, no inventar `P`). `canSubmit = pendings.length === 0`. **TODO documentado**: "encender frameworkControls en FEATURE-008" (NIT-1 de la revisión).
      Files: `apps/api/src/modules/plan/plan-guide.service.ts`
      Verify: `npm run typecheck:api` compila; cubierto por tests del paso 11.

- [ ] 9. **Submódulos `phase/`, `task/`, `dependency/`: services + controllers.**
      `phase/`: CRUD fase + `reorder` transaccional (recomputa `order` 0-based respetando `@@unique([planId,order])`); protección fase inicial (= `order` mínimo) con tareas → 409 (AC-009, D4); borrar cualquier fase con tareas → 409 (D12); audita.
      `task/`: CRUD tarea (título req.; regla hito BR-010/AC-011 → 400 si horas>0 o dos fechas distintas, §2.4); `DELETE` → 409 si es predecesora de otra (D15); `PATCH /tasks/:id/status` (permiso §2.7: `task`+ integrante solo su tarea; transición válida; gate predecesoras en `EN_CURSO`; progreso/evidencia opc.); `PATCH /tasks/:id/accept` (`plan`, precondición `TERMINADA`); `GET /my-work` (ruta propia estática para evitar colisión con `/tasks/:id`, §3.2; filtra `responsibleUserId=actor` + alcance). Audita cada mutación.
      `dependency/`: `GET`/`POST`/`DELETE` predecesora; validaciones auto-dependencia/mismo-plan/duplicado (400/409) + detección de ciclos DFS server-side antes de persistir (§2.3) → 400 nombrando las tareas; audita.
      Files: `apps/api/src/modules/plan/phase/{phase.service.ts,phase.controller.ts}`, `apps/api/src/modules/plan/task/{task.service.ts,task.controller.ts}`, `apps/api/src/modules/plan/dependency/{dependency.service.ts,dependency.controller.ts}`
      Verify: `npm run typecheck:api` compila; cubierto por tests del paso 11.

- [ ] 10. **`PlanModule` + registro en `app.module.ts` + test de orden de controllers.**
      `plan.module.ts` registra controllers y providers; `imports: [PrismaModule, AuthModule, AuditModule, RequestModule]` (RequestModule exporta `RequestStateService`). Orden de controllers: la ruta estática `GET /my-work` no colisiona con `/tasks/:id`, pero fijar el contrato con `plan.module.spec.ts` como `request.module.spec.ts`. Registrar `PlanModule` en `apps/api/src/app.module.ts` sin tocar los existentes.
      Files: `apps/api/src/modules/plan/plan.module.ts`, `apps/api/src/modules/plan/plan.module.spec.ts`, `apps/api/src/app.module.ts`
      Verify: `npm run typecheck:api` compila; `npm run test:unit` ejecuta `plan.module.spec.ts` y pasa.

- [ ] 11. **Pruebas unitarias nuevas (Jest, Prisma mockeado como en `approval.service.spec.ts`).**
      Crear specs que cubran: guía de pendientes (fases sin fecha / tareas sin responsable / sin tareas → enumera con `targetId`; plan completo → `canSubmit=true`, sin pendientes); gate de envío (`submit()` RECHAZA 409 con pendientes, AC-007); regla hito (fecha única / 0h, AC-011); protección fase inicial con tareas (AC-009) y borrar fase con tareas (D12); gate de dependencia (no `EN_CURSO` si predecesora no `TERMINADA` **y** `accepted`, AC-010/033); detección de dependencia circular (A→B existente, B→A → 400; cadena transitiva, specs/19); que AUTORIZAR el plan (no enviarlo) lleva la Request a `EN_EJECUCION`; alcance de proceso (líder A no ve plan de proceso B → 404); borrar tarea predecesora → 409 (D15); permisos (integrante gestiona/acepta → 403; integrante muta tarea ajena → 403, propia → 200); transiciones de tarea/plan (aristas permitidas y muestra de prohibidas → 409); acceso Prisma (`Plan` por `findFirst`, `TaskDependency` por `findUnique` compuesto); `AuditService.record` invocado en CADA mutación con `objectType`/`scopeProcessId=mainProcessId`/before-after correctos (autorizar → UPDATE PLAN + UPDATE REQUEST); `isTaskTransitionAllowed`/`assertPlanTransition`; `RequestStateService.assertTransition` acepta las 2 aristas nuevas.
      Files: `apps/api/src/modules/plan/plan.service.spec.ts`, `plan-guide.service.spec.ts`, `plan-state.service.spec.ts`, `task-status.spec.ts`, `plan-status.spec.ts`, `apps/api/src/modules/plan/phase/phase.service.spec.ts`, `task/task.service.spec.ts`, `dependency/dependency.service.spec.ts`, y ampliar `apps/api/src/modules/request/request-state.service.spec.ts`
      Verify: `npm run test:unit` — todas las specs nuevas y las existentes pasan.

- [ ] 12. **Regenerar OpenAPI + api-client y committear artefactos.**
      Tras definir endpoints/DTOs, regenerar el contrato y committear los artefactos (requisito de steering en cada cambio de contrato).
      Files: `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts`
      Verify: `npm run contracts:generate` regenera ambos; `npm run typecheck:api-client` compila; `git status` muestra los dos artefactos modificados; se committean.

- [ ] 13. **Wrappers tipados del frontend (patrón `requests.ts`).**
      Crear `apps/web/src/lib/plan.ts`, `plan-phases.ts`, `tasks.ts`, `task-dependencies.ts`, `my-work.ts` con clase `*Error`, `messageForStatus` (400/403/404/409) y funciones que consumen `api` de `api-client.ts`. Exponer los tipos nuevos vía `components['schemas'][...]` en `apps/web/src/lib/api-client.ts` (como los de Fase 2). Solo vía `@plantilla-portales/api-client`; nunca Prisma/SQL.
      Files: `apps/web/src/lib/plan.ts`, `plan-phases.ts`, `tasks.ts`, `task-dependencies.ts`, `my-work.ts`, `apps/web/src/lib/api-client.ts`
      Verify: `npm run typecheck:web` compila.

- [ ] 14. **SCR-06 Planificación (`/seguimiento/plan`).**
      Reemplazar el placeholder `UnderConstruction` por una vista cliente (`plan-view.tsx` + `page.tsx`) con: selector de Request `COMPROMETIDA/EN_PLANIFICACION/EN_EJECUCION`; carga/crea plan; gestión de fases (crear/editar/reordenar, inicial protegida con tareas deshabilitada con explicación UI-04); crear/editar tareas (hito fuerza una fecha + 0h; predecesoras multi-select sin la propia tarea); vista Lista (búsqueda `q`, `mine`, filtros estado/fase); guía "Resuelve el siguiente paso" (`futureCategories` como "fase posterior"; botón Enviar deshabilitado si `canSubmit=false`; 409 muestra pendientes). Estados loading/vacío/error/éxito y AC-031 (reset solo en éxito), patrón `revision-view.tsx`.
      Files: `apps/web/src/app/seguimiento/plan/page.tsx`, `apps/web/src/app/seguimiento/plan/plan-view.tsx` (+ diálogos/componentes necesarios)
      Verify: `npm run typecheck:web` compila; `npm run build:web` genera la ruta.

- [ ] 15. **SCR-09 Tareas (`/seguimiento/tareas`) + SCR-02 Mi trabajo (`/mi-trabajo`).**
      Tareas: detalle/edición de tarea; cambio de estado respetando transiciones (§1.3); 409 en `EN_CURSO` muestra la dependencia que bloquea (AC-010); progreso/evidencia; aceptación visible solo para jefe/líder. Mi trabajo: `GET /my-work` con contexto de plan (Request, fase, estado/progreso) y enlace a la tarea. Ambos con estados UI y AC-031.
      Files: `apps/web/src/app/seguimiento/tareas/page.tsx` (+ view), `apps/web/src/app/mi-trabajo/page.tsx` (+ view)
      Verify: `npm run typecheck:web` compila; `npm run build:web` genera las rutas.

- [ ] 16. **Autorización de plan en `/administracion/revision` (sin romper la cola de Fase 2).**
      Ampliar `revision-view.tsx` con una sección/pestaña de planes en `EN_AUTORIZACION` dentro del alcance; acciones Autorizar y Devolver (motivo requerido → 400 conserva valores, patrón `devolver-dialog.tsx`). No reemplazar la cola de aprobaciones de compromiso: añadir, no romper.
      Files: `apps/web/src/app/administracion/revision/revision-view.tsx` (+ wrapper `plan.ts` reutilizado)
      Verify: `npm run typecheck:web` compila; `npm run build:web` genera la ruta.

- [ ] 17. **Verificación integral de cierre + documentación.**
      Correr toda la cadena de steering y escribir `verification.md` (evidencia de comandos) y `docs/fase3-plan.md` (resumen de la fase: entidades, endpoints, gates, decisiones `P`, qué queda fuera de alcance). Confirmar que Fases 1–2, `/catalogs` y `/catalog-items` siguen operativas.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase3-plan\.agents\tasks\fase3-plan\verification.md`, `apps/api/docs/fase3-plan.md` (o `docs/fase3-plan.md` según exista `docs/`)
      Verify: `npm run typecheck`, `npm run build`, `npm run test:unit`, `npm run test:e2e` pasan; `npm run contracts:generate` sin diferencias pendientes (artefactos ya committeados); migración `fase3_plan` aplicada.

---

## Notas de decisión (del diseño aprobado, no re-decididas aquí)
- Plan 1:1 con Request (D1); resuelto por `findFirst` por precaución Prisma 7, `@@unique` garantiza integridad.
- Máquina de tarea/plan vive en `PlanStateService` propio (D13); `RequestStateService` solo valida `operationalState`.
- Categorías capacidad/evidencias/framework son ganchos (D5): existen en el contrato, no aportan pendientes en Fase 3; rama "control pendiente" de AC-007 DIFERIDA (NIT-1).
- Importación Excel: solo gancho documentado, nunca aprueba controles (D11).
- Borrar fase/tarea con dependencias → 409 conservador (D12/D15).
