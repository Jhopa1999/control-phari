# Implementation Plan · FASE 5 · Trabajo y coordinación (control-phari)

> Derivado del diseño APROBADO (`design.md`, 3ª iteración; `design-review.md` = APPROVED, 0 HIGH / 0 MEDIUM / 3 NIT).
> Rutas ABSOLUTAS. El código vive en el worktree `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase5-trabajo`.
> Comandos reales verificados en `package.json` raíz y `apps/api/package.json`:
> - typecheck total: `npm run typecheck` (api + api-client + web)
> - test unitario api: `npm run test:unit` (= `jest` en apps/api)
> - migración: desde `apps/api` → `npm run prisma:migrate:dev -- --name fase5_trabajo`; luego `npm run prisma:generate`
> - seed: `npm run prisma:seed` (apps/api); requiere Postgres arriba (`npm run db:up` en raíz)
> - contratos: `npm run contracts:generate` (= `openapi:generate` + `api-client:generate`), luego `npm run build:api-client`
> - build web: `npm run build:web`
> Los NIT del review (commitmentsText P reversible; rango consolidación `gte weekStart`/`lte weekStart+6` UTC; `activityStatus` = `@IsOptional @IsIn(RECORD_STATE)`) se resuelven en implementación según se indica abajo.

- [ ] 1. **Modelos Prisma de Fase 5 en `schema.prisma`.**
      Añadir los modelos `DailyLog`, `DailyLogActivity`, `WeeklyReport`, `Issue`, `Meeting`, `MeetingParticipant`, `Commitment` con los campos/columnas/índices del design §1.2, PK `String @id @default(uuid()) @db.Uuid`, columnas `snake_case` vía `@map`, timestamps `created_at`/`updated_at`. Uniques compuestos: `DailyLog([authorUserId, processId, date])`, `WeeklyReport([authorUserId, processId, weekStart])`, `MeetingParticipant([meetingId, userId])`. Defaults: `DailyLog.status`/`WeeklyReport.status` = `"BORRADOR"`; `Issue.state`/`Commitment.state` = `"EN_CURSO"`; `hours Int @default(0)`. Fechas de día/semana `DateTime @db.Date`; `meetingTime String?` (texto `HH:mm`). FKs opcionales a Request/Task/Issue/Meeting con `onDelete: Restrict`; hijas (`DailyLogActivity`, `MeetingParticipant`) con `onDelete: Cascade`. Agregar las relaciones inversas en `User`, `Process`, `Request`, `Task` sin tocar sus campos existentes.
      Files: `apps\api\prisma\schema.prisma`
      Verify: desde `apps\api` → `npm run prisma:format` y `npm run prisma:validate` terminan sin error.

- [ ] 2. **Migración versionada `fase5_trabajo` + regenerar client.**
      Con Postgres arriba (`npm run db:up` en raíz), desde `apps\api` ejecutar `npm run prisma:migrate:dev -- --name fase5_trabajo` (NUNCA `db push`); luego `npm run prisma:generate`. Depende del paso 1.
      Files: `apps\api\prisma\migrations\<timestamp>_fase5_trabajo\migration.sql` (generado), `apps\api\src\generated\prisma\*` (regenerado)
      Verify: la migración aplica sin error y crea las 7 tablas (`daily_logs`, `daily_log_activities`, `weekly_reports`, `issues`, `meetings`, `meeting_participants`, `commitments`); `npm run typecheck:api` pasa (el client tipado expone los nuevos modelos).

- [ ] 3. **Seed de 3 familias de catálogo nuevas (idempotente).**
      Añadir al array `CATALOG_ITEMS` de `seed.ts` SOLO los valores CONFIRMADOS del SDD (sin ruido): `ACTIVITY_CLASS` = `PLANIFICADA`/`SOPORTE`/`INTERNA`/`EXTRAORDINARIA`; `ISSUE_TYPE` = `BLOQUEO` (default confirmado) + `INCIDENTE`/`CALIDAD_DATOS`/`SOLICITUD_APOYO` (seed inicial P reversible, §1.7/NIT-2); `RECORD_STATE` = `BORRADOR`/`EN_CURSO`/`BLOQUEADO`/`COMPLETADO`/`ARCHIVADO`. Mismo patrón `upsert` por `catalog_code_unique` existente; no tocar familias previas.
      Files: `apps\api\prisma\seed.ts`
      Verify: `npm run prisma:seed` (apps/api) corre sin error e imprime el conteo de maestras actualizado; re-ejecutar es idempotente (no duplica).

- [ ] 4. **Ampliar `AuditObjectType` y el `OBJECT_TYPES` del filtro (ambos, lección 2).**
      Añadir los seis tipos `DAILY_LOG`, `DAILY_LOG_ACTIVITY`, `WEEKLY_REPORT`, `ISSUE`, `MEETING`, `COMMITMENT` al union `AuditObjectType` en `audit.service.ts` Y al array `OBJECT_TYPES` en `list-audit-events.dto.ts`, en el mismo orden. Sin esto el filtro `?objectType=` responde 400 pese a registrar el evento.
      Files: `apps\api\src\modules\audit\audit.service.ts`, `apps\api\src\modules\audit\dto\list-audit-events.dto.ts`
      Verify: `npm run typecheck:api` pasa; añadir/ejecutar un spec de contrato que afirma que cada nuevo `objectType` está en ambos lugares (ver paso 11).

- [ ] 5. **Helper puro de fecha `date.ts` + spec, generalizado de `month.ts`.**
      Crear `coordination/date.ts` con `DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/`, `dateStringToDate(s)` (`new Date(Date.UTC(y, m-1, d))` + **revalidación round-trip**: lanza 400 si `dateToString(dateStringToDate(x)) !== x`, cubriendo `2025-13-40`, `2025-02-30`, `2025-00-10`), `dateToString(date)` (UTC), `addDaysUTC(date, n)` y `mondayOf(date)` (lunes ISO de la semana, UTC). Spec espejo de `month.spec.ts`.
      Files: `apps\api\src\modules\coordination\date.ts`, `apps\api\src\modules\coordination\date.spec.ts`
      Verify: `npm run test:unit` — los tests de `date.spec.ts` pasan (round-trip ok; fechas irreales → error; `mondayOf` normaliza).

- [ ] 6. **`CoordinationScopeService` (alcance por rol, lección 1) + `GET /coordination/people`.**
      Crear el service en `coordination/` replicando `capacity-scope.service.ts`: `leaderProcessIds(actor)` = `actor.grants.filter(g => g.roleCode === RoleCode.LIDER_PROCESO).map(g => g.processId)` (NO `scopedProcessIds`); `scopeWhere<Entity>(actor)` por entidad (plano por proceso para líder/jefe en lectura; plano por persona para integrante y para escritura — §2.2); `requestVisibilityWhere(actor)` = jefe `{}` / no-jefe `{ mainProcessId: { in: Array.from(actor.scopedProcessIds) } }` (visibilidad REAL de Request de Fase 2, para validar FK a Request/Task — §1.2 HIGH-2); `listPeople(actor)` (análogo a capacity). Depende del paso 2 (tipos Prisma).
      Files: `apps\api\src\modules\coordination\coordination-scope.service.ts`
      Verify: `npm run typecheck:api` pasa.

- [ ] 7. **Submódulo worklog: `WorklogService` + `WorklogController` + DTOs.**
      Crear DTOs request/response separados (patrón capacity): `CreateDailyLogDto` (`processId` UUID, `date @Matches(DATE_PATTERN)`, `dayNotes?` ≤2000), `UpdateDailyLogDto`, `CreateActivityDto` (`classificationCode @IsIn(ACTIVITY_CLASS)`, `hours @IsOptional @IsInt @Min(0)`, FKs UUID opcionales, textos, `evidenceUrl @IsOptional @IsString @MaxLength(2000)` SIN `@IsUrl`, `activityStatus @IsOptional @IsIn(RECORD_STATE)` — NIT-3), `UpdateActivityDto`, `CreateWeeklyReportDto` (`weekStart @Matches(DATE_PATTERN)`, normalizado a lunes ISO en service), DTOs de respuesta y de listado. `WorklogService`: alcance §2.2, validación de clasificación server-side §2.3 (AC-014/015/016 → 400), validación de FK en visibilidad (`projectRequestId` vía `requestVisibilityWhere`; `taskId` vía traversal `phase.plan.request` replicando `requireTaskInScope`; `relatedIssueId` por `processId` del diario → 404 fuera), `submitDailyLog`/`submitWeeklyReport` (`BORRADOR→ENVIADO`, no mutan Task/Request/Approval — BR-013/023), consolidación semanal en `GET /weekly-reports/:id` (conteos por lectura de diarios `ENVIADO`/`REVISADO` del autor+proceso del WeeklyReport en `[weekStart, weekStart+6]` UTC con `gte/lte` — AC-017/018; sin endpoint `/consolidation`). Toda mutación audita dentro de `$transaction` con `scopeProcessId = proceso del registro` (actividad toma el del padre). P2002 → `ConflictException` (409 duplicado persona+proceso+fecha / autor+proceso+lunes). Rutas del design §3 Worklog. `WorklogController` NO expone `/worklog/daily/:id/review` (P, Finding 7).
      Files: `apps\api\src\modules\coordination\worklog\worklog.service.ts`, `worklog.controller.ts`, `apps\api\src\modules\coordination\worklog\dto\*.ts`
      Verify: `npm run typecheck:api` pasa.

- [ ] 8. **Submódulo issue: `IssueService` + `IssueController` + `WorkflowStateService` + DTOs.**
      Crear `WorkflowStateService` (análogo a `PlanStateService`) con el grafo mínimo reversible mapeado a `RECORD_STATE` (§4): `EN_CURSO↔BLOQUEADO`, `EN_CURSO→COMPLETADO`, `BLOQUEADO→COMPLETADO`, `COMPLETADO→ARCHIVADO`, reapertura `COMPLETADO→EN_CURSO`/`ARCHIVADO→EN_CURSO`; salto no permitido → 400. DTOs: `CreateIssueDto` (`typeCode? @IsIn(ISSUE_TYPE)` default `BLOQUEO`, `title` req., `date` req.), `UpdateIssueDto`, `TransitionDto` (`{ toState }`), respuesta/listado. `IssueService`: un registro por incidente (PATCH edita, AC-019), alcance §2.2 por persona (reportado/resuelto), transición vía helper, auditoría en `$transaction`.
      Files: `apps\api\src\modules\coordination\issue\issue.service.ts`, `issue.controller.ts`, `apps\api\src\modules\coordination\workflow-state.service.ts`, `apps\api\src\modules\coordination\issue\dto\*.ts`
      Verify: `npm run typecheck:api` pasa.

- [ ] 9. **Submódulo meeting: `MeetingService` + `MeetingController` + DTOs.**
      DTOs: `CreateMeetingDto` (`title` req., `meetingDate @Matches(DATE_PATTERN)` req., `meetingTime? @Matches(/^\d{2}:\d{2}$/)`, `participantUserIds?: string[]` UUID[], opcionales), `UpdateMeetingDto`, respuesta con participantes. `MeetingService`: estado inicial `BORRADOR`, set de participantes N:M (reemplazo en PATCH), participantes limitados al alcance (`CoordinationScopeService.listPeople`), alcance §2.2 (participación/responsable), auditoría en `$transaction`. Sin acta/notificación/compromiso-auto (P). Cascade de participantes al borrar.
      Files: `apps\api\src\modules\coordination\meeting\meeting.service.ts`, `meeting.controller.ts`, `apps\api\src\modules\coordination\meeting\dto\*.ts`
      Verify: `npm run typecheck:api` pasa.

- [ ] 10. **Submódulo commitment: `CommitmentService` + `CommitmentController` + DTOs; `CoordinationModule` + spec.**
      DTOs: `CreateCommitmentDto` (`title` req., `dueDate @Matches(DATE_PATTERN)` req., `sourceMeetingId?`/`assignedUserId?`/`responsibleUserId?` UUID, opcionales), `UpdateCommitmentDto`, `TransitionDto` reutilizado, respuesta/listado. `CommitmentService`: mismo grafo de `WorkflowStateService` que Issue, sin auto-creación desde reunión (`sourceMeetingId` solo relaciona), alcance §2.2 por persona (asignado/responsable), auditoría en `$transaction`. Crear `coordination.module.ts` (`@Module` con PrismaModule/AuthModule/AuditModule; providers: scope + workflow-state + 4 services; controllers en orden seguro por prefijos — regla D0/MEDIUM-2) y registrarlo en `app.module.ts`. Crear `coordination.module.spec.ts` (compila el módulo y afirma que los 4 controllers y sus services se inyectan).
      Files: `apps\api\src\modules\coordination\commitment\commitment.service.ts`, `commitment.controller.ts`, `apps\api\src\modules\coordination\commitment\dto\*.ts`, `apps\api\src\modules\coordination\coordination.module.ts`, `coordination.module.spec.ts`, `apps\api\src\app.module.ts`
      Verify: `npm run test:unit` — `coordination.module.spec.ts` pasa; `npm run build:api` compila.

- [ ] 11. **Pruebas unitarias de reglas de negocio (Jest, apps/api).**
      Specs al estilo `capacity.service.spec.ts` (mock de `PrismaService`/`AuditService`): clasificación AC-014 (planificada sin proyecto/tarea→400; con uno→ok), AC-015 (soporte sin assetRef→400), AC-016 (extraordinaria sin solicitante/justificación→400), `classificationCode` fuera de catálogo→400, borrador sin `hours`→`0` (Finding 4); FK: `projectRequestId` por `scopedProcessIds` (no `leaderProcessIds`) HIGH-2, `taskId` por traversal HIGH-1, `relatedIssueId` por proceso del diario MEDIUM-1 → 404 fuera; separación de conceptos: actividad con `taskId` no muta Task (BR-013), `submitDailyLog` no toca Request/Approval/Commitment, enviar semanal con `proposals`/`commitmentsText` no crea Commitment ni muta prioridad (AC-018); consolidación semanal solo elegibles del autor/proceso del WeeklyReport objetivo (AC-017) incl. caso líder; `weekStart` miércoles→lunes ISO y colisión 409 misma semana; alcance por rol (integrante por `authorUserId`, líder por `leaderProcessIds`, jefe `{}`, `:id` ajeno→404) AC-025/026; máquinas Issue/Commitment (transición ok / salto→400 / reapertura ok); DailyLog `BORRADOR→ENVIADO` ok, 2º submit→409, submit ajeno→404; auditoría: cada mutación llama `audit.record` con `objectType` y `scopeProcessId` correctos; contrato `AuditObjectType` ⊆ `OBJECT_TYPES` (paso 4).
      Files: `apps\api\src\modules\coordination\**\*.spec.ts`
      Verify: `npm run test:unit` — toda la suite pasa (incluye specs previos de Fases 1–4 sin regresión).

- [ ] 12. **Regenerar OpenAPI + api-client.**
      Desde la raíz: `npm run contracts:generate` (= `openapi:generate` + `api-client:generate`), luego `npm run build:api-client`. Depende de que el backend compile (paso 10). No cambia el contrato de endpoints previos.
      Files: `apps\api\openapi.json` (o salida configurada), `packages\api-client\src\generated\*` (regenerado)
      Verify: `npm run typecheck:api-client` pasa; el contrato generado incluye los nuevos schemas/paths de coordination.

- [ ] 13. **Wrappers frontend `lib/*.ts` (solo api-client).**
      Crear `apps/web/src/lib/worklog.ts`, `issues.ts`, `meetings.ts`, `commitments.ts` siguiendo el patrón `capacity.ts` (clase `*Error`, `messageForStatus`, funciones `GET/POST/PATCH/DELETE` tipadas desde `components['schemas']`). Añadir los `export type` nuevos en `api-client.ts`. Depende del paso 12.
      Files: `apps\web\src\lib\worklog.ts`, `issues.ts`, `meetings.ts`, `commitments.ts`, `apps\web\src\lib\api-client.ts`
      Verify: `npm run typecheck:web` pasa.

- [ ] 14. **Pantallas SCR-10/11/12/13/14 + navegación.**
      Convertir el placeholder `bitacora/page.tsx` (SCR-10: diarios + editor cabecera + líneas de actividad con campos condicionados por `classificationCode`; Guardar borrador / Enviar; total de horas rotuladas "dedicación", nota BR-013) y `reuniones/page.tsx` (SCR-13). Crear `semanal/page.tsx` (SCR-11: lunes+proceso, conteos consolidados, aviso "sin respaldo", enviar), `novedades/page.tsx` (SCR-12: lista+ficha, tipo default Bloqueo, transición de estado), `compromisos/page.tsx` (SCR-14: lista+formulario, vencimiento/asignado/reunión fuente, transición). Cada pantalla con estados loading/vacío/error/éxito y AC-031 (conserva la entrada ante error). Añadir a `navigation.ts` en el grupo Seguimiento, sin romper los existentes: `{ href:'/seguimiento/semanal', label:'Semanal', moduleKey:'log' }`, `{ href:'/seguimiento/novedades', label:'Novedades', moduleKey:'log' }`, `{ href:'/seguimiento/compromisos', label:'Compromisos', moduleKey:'meeting' }`.
      Files: `apps\web\src\app\seguimiento\bitacora\*`, `semanal\*`, `novedades\*`, `reuniones\*`, `compromisos\*`, `apps\web\src\lib\navigation.ts`
      Verify: `npm run build:web` compila sin error.

- [ ] 15. **Verificación integral final.**
      Desde la raíz: `npm run typecheck`, `npm run test:unit`, `npm run build`. Limpiar cualquier archivo temporal.
      Files: —
      Verify: los tres comandos terminan sin error (api + api-client + web compilan; toda la suite Jest pasa).
