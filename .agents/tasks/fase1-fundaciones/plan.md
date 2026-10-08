# Plan de implementación · Fase 1 · Fundaciones (control-phari)

Fuente de verdad: `design.md` (revisión 3, aprobado, 0 HIGH). Este plan lo ejecuta un coder al pie.
Steering obligatorio: NestJS dueño de lógica/validación/autorización/persistencia/API/OpenAPI; Prisma solo en `apps/api`; frontend consume solo `@plantilla-portales/api-client`; TypeScript estricto sin `any`; migraciones versionadas (`prisma migrate dev`, nunca `db push`); cada cambio de contrato → `npm run contracts:generate` + commit de `openapi.json` y `packages/api-client/src/generated`.

Todas las rutas son absolutas dentro del worktree `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase1-fundaciones`. Los comandos npm se ejecutan desde la raíz del worktree salvo que se indique `--workspace apps/api` o un `cwd` concreto. Git siempre con `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase1-fundaciones`.

## Decisiones ya tomadas en el diseño (no re-decidir)

- Reutilizar `CatalogItem`; añadir modelos Process/User/Role/Grant/AuditEvent (snake_case con `@map`/`@@map`, PK uuid `@db.Uuid`, timestamps como `CatalogItem`). §1.
- Una única migración `fase1_fundaciones` con `npx prisma migrate dev` desde `apps/api`. §1.3.
- Seed cableado con `migrations.seed` dentro de `defineConfig` en `prisma.config.ts` (NO `prisma.seed`), + script npm `prisma:seed`; idempotente por `upsert`. §1.4.
- Autorización: dos guards (`CurrentUserGuard`, `RolesGuard`) por módulo, NO `APP_GUARD` global. Exentas: `GET /health`, `GET /dev/actors`. NO `ProcessScopeGuard` en Fase 1. §2.3, §8.
- Dos planos: A (recursos por proceso, filtrado por `scopedProcessIds` en el `where` → 404 fuera de alcance) y B (administración de área = Process/User/Grant, exige `JEFE_AREA` → 403). §2.4.
- Header de dev `X-Actor-Id` → `identifier`; `AUTH_MODE=dev-header` configurable; `ActorResolver`/`DevActorResolver`. §3.
- AuditEvent escrito DENTRO de la misma transacción Prisma que cada mutación (atomicidad), vía `AuditService.record(tx, {...})`. §6.
- Algoritmo `POST /grants` único en §4.2.1 (reactivación de grant inactivo = `CREATE`; `DELETE` = soft `REVOKE`).
- SCR-22 "Equipo y permisos" va en grupo **Gobierno** (no Administración). §5.1.
- AC-031: los formularios conservan valores ante error; `reset` solo en éxito. §5.5.

## Orden de trabajo y verificación global

Build order: schema+migración+seed → auth → módulos/endpoints de dominio → audit integrado → catálogo endurecido → regenerar contrato → frontend → verificación de cierre. Comandos reales (de `package.json`): `npm run prisma:validate`, `npm run prisma:generate`, `npm run contracts:generate`, `npm run typecheck`, `npm run build`, `npm run test:unit`. Migración y seed desde `apps/api`: `npx prisma migrate dev --name fase1_fundaciones` y `npm run prisma:seed --workspace apps/api`.

---

- [ ] 1. Ampliar `schema.prisma` con los 5 modelos nuevos.
      Añadir `Process`, `User`, `Role`, `Grant`, `AuditEvent` exactamente como la §1.2 del diseño (campos, `@map`/`@@map` snake_case, PK `String @id @default(uuid()) @db.Uuid`, timestamps, uniques e índices nombrados, FKs con `onDelete: Restrict` en Grant y relaciones opcionales en AuditEvent). NO tocar `CatalogItem`.
      Files: `apps/api/prisma/schema.prisma`
      Verify: `npm run prisma:validate` (sin errores) y `npm run prisma:generate` (regenera el client en `apps/api/src/generated/prisma`).

- [ ] 2. Crear la migración versionada.
      Con PostgreSQL arriba (contenedor `plantilla-portales-postgres-1`, puerto 5433), ejecutar desde `apps/api`: `npx prisma migrate dev --name fase1_fundaciones`. Añadir script `"prisma:migrate:dev": "prisma migrate dev"` a `apps/api/package.json`. Debe generar `apps/api/prisma/migrations/<ts>_fase1_fundaciones/migration.sql` con las 5 tablas, FKs, uniques e índices.
      Files: `apps/api/prisma/migrations/<ts>_fase1_fundaciones/migration.sql`, `apps/api/package.json`
      Verify: la migración aplica sin error y queda en estado `up to date`; `migration_lock.toml` intacto.

- [ ] 3. Crear el seed sintético idempotente y cablearlo.
      Crear `apps/api/prisma/seed.ts` con el contenido de la §1.4 (3 roles, 4 procesos FIBI/FIID/FIAA/FMAA, 4 usuarios `demo.local`, grants que ejercitan controles negativos, maestras base en `CatalogItem` con valores confirmados del SDD — sin datos de ruido/aa ni personales). Idempotente con `upsert` por clave única. Registrar escrituras sin `actorUserId`. Cablear `migrations.seed: 'tsx prisma/seed.ts'` dentro de `defineConfig` en `apps/api/prisma.config.ts` (NO `prisma.seed`). Añadir script `"prisma:seed": "tsx prisma/seed.ts"` a `apps/api/package.json`.
      Files: `apps/api/prisma/seed.ts`, `apps/api/prisma.config.ts`, `apps/api/package.json`
      Verify: `npm run prisma:seed --workspace apps/api` dos veces seguidas; la segunda no duplica filas (idempotencia). Confirmar 3 roles, 4 procesos, 4 usuarios y los grants esperados.

- [ ] 4. Crear el módulo `auth` (constantes, resolver, guards, decorators).
      Bajo `apps/api/src/modules/auth/`: `RoleCode` (enum/constante TS: JEFE_AREA/LIDER_PROCESO/INTEGRANTE), `MODULE_MATRIX: Record<ModuleKey, RoleCode[]>` con las claves exactas de specs/10 (§3.3); interfaz `ActorResolver` + `DevActorResolver` (lee `X-Actor-Id`, resuelve `User` activo + grants activos con role/process, construye `CurrentActor` de §2.2; `AUTH_MODE` desde `.env`); `CurrentUserGuard` (401 si falta/invalid, adjunta `request.actor`); `RolesGuard` + `@Roles(...)` (403); `@CurrentActor()` param-decorator; `AuthModule` que exporta guards/resolver. NO crear `ProcessScopeGuard`.
      Files: `apps/api/src/modules/auth/*` (role-code.ts, module-matrix.ts, actor-resolver.interface.ts, dev-actor-resolver.ts, current-user.guard.ts, roles.guard.ts, roles.decorator.ts, current-actor.decorator.ts, auth.module.ts, current-actor.ts)
      Verify: `npm run typecheck:api`. Pruebas unit de este paso en el item 11.

- [ ] 5. Añadir `AUTH_MODE` a `.env` y `.env.example`.
      Añadir `AUTH_MODE=dev-header` a `apps/api`-leído `.env` de la raíz del worktree y a `.env.example` (nombre + valor seguro, sin secretos). Es configuración (puede cambiar por ambiente), no constante de dominio.
      Files: `.env`, `.env.example`
      Verify: `DevActorResolver`/`DevActorsController` leen `process.env.AUTH_MODE`; arranque local lo reconoce.

- [ ] 6. Crear `MeController` y `DevActorsController` en `auth`.
      `GET /me/permissions` (requiere actor, cualquier rol): devuelve `userId`, `name`, `identifier`, `grants[]` y `allowedModules` derivado de `MODULE_MATRIX` (§3.3). `GET /dev/actors` (público, exento de `CurrentUserGuard`; solo `AUTH_MODE=dev-header`, si no 404): devuelve `[{identifier,name}]` de usuarios activos ordenados por `name` (§3.4). DTOs de respuesta con `@ApiProperty` (`MyPermissionsResponseDto`, `DevActorResponseDto`). Swagger en todos los endpoints.
      Files: `apps/api/src/modules/auth/me.controller.ts`, `apps/api/src/modules/auth/dev-actors.controller.ts`, `apps/api/src/modules/auth/dto/*`
      Verify: `npm run typecheck:api`.

- [ ] 7. Crear el módulo `audit` (AuditService + AuditController).
      `apps/api/src/modules/audit/`: `AuditService.record(tx, { actorUserId, action, objectType, objectId, scopeProcessId, before, after })` que escribe `AuditEvent` con el cliente transaccional (§6). `AuditController` con `GET /audit-events` (todos; alcance por rol: integrante=propios, líder/jefe=sus procesos; `take ≤ 500`; orden `createdAt desc`). DTOs `ListAuditEventsDto` y `AuditEventResponseDto` (`before`/`after` como `object` nullable). `CurrentUserGuard` a nivel de controller. Registrar en `app.module.ts`.
      Files: `apps/api/src/modules/audit/audit.service.ts`, `audit.controller.ts`, `audit.module.ts`, `audit.service.spec.ts`, `dto/*`
      Verify: `npm run typecheck:api`.

- [ ] 8. Crear el módulo `process`.
      `apps/api/src/modules/process/`: controller fino + service + DTOs (`CreateProcessDto`, `UpdateProcessDto`, `ListProcessesDto`, `ProcessResponseDto`) con las reglas de §4.3. Endpoints de §4.2 (Plano B): `GET /processes` (jefe: todos; no-jefe: filtra `scopedProcessIds`), `GET /processes/:id` (no-jefe fuera de alcance → 404), `POST`/`PATCH` solo `JEFE_AREA`. Normalizar `code` a MAYÚSCULAS (patrón `normalizeKey`). P2002→409, findOne→404. Mutaciones dentro de `prisma.$transaction` llamando `AuditService.record` (objectType=PROCESS, scopeProcessId=su id). `CurrentUserGuard` + `@Roles` donde corresponda. Registrar en `app.module.ts`.
      Files: `apps/api/src/modules/process/*`, `apps/api/src/app.module.ts`
      Verify: `npm run typecheck:api`.

- [ ] 9. Crear el módulo `user`.
      `apps/api/src/modules/user/`: controller + service + DTOs (`CreateUserDto` con `@IsString`+`MaxLength` sin `@IsEmail`, `UpdateUserDto`, `UserResponseDto`). Endpoints Plano B, todos `JEFE_AREA`: `GET /users`, `GET /users/:id` (con grants), `POST`, `PATCH`. `identifier` duplicado → 409. Mutaciones en transacción con `AuditService.record` (objectType=USER, scopeProcessId=null). Registrar en `app.module.ts`.
      Files: `apps/api/src/modules/user/*`, `apps/api/src/app.module.ts`
      Verify: `npm run typecheck:api`.

- [ ] 10. Crear el módulo `grant`.
      `apps/api/src/modules/grant/`: controller + service + DTOs (`CreateGrantDto` con `roleCode` `@IsEnum(RoleCode)`, `userId`/`processId` `@IsUUID`; `ListGrantsDto`; `GrantResponseDto`). `GET /grants` (JEFE_AREA, filtrado por `scopedProcessIds` del jefe, filtros opcionales). `POST /grants` con el algoritmo exacto de §4.2.1 (resolver roleCode→Role o 500; verificar User/Process o 404; activo→409; inactivo→reactivar como CREATE; no existe→create). `DELETE /grants/:id` soft (active=false) + AuditEvent REVOKE; no existe→404. Todas las mutaciones en transacción con `AuditService.record` (objectType=GRANT, scopeProcessId=processId del grant). Registrar en `app.module.ts`.
      Files: `apps/api/src/modules/grant/*`, `apps/api/src/app.module.ts`
      Verify: `npm run typecheck:api`.

- [ ] 11. Pruebas unitarias Jest de backend (nuevas).
      Siguiendo el patrón de `catalog.service.spec.ts` (Prisma mockeado, sin PostgreSQL): `roles.guard.spec.ts` (permitir vs 403 con `ExecutionContext`/`Reflector` simulados); `process.service.spec.ts` (jefe no-filtra, no-jefe filtra por `scopedProcessIds`, 404 fuera de alcance, invoca `AuditService.record`); `user.service.spec.ts`; `grant.service.spec.ts` (P2002→409, findOne→404, roleCode sin fila→500, duplicado activo→409, reactivación inactivo→CREATE, revoke soft→REVOKE, invoca audit); `audit.service.spec.ts` (alcance por rol, take≤500, orden desc); `module-matrix.spec.ts` (allowedModules por rol); seed como función pura de construcción si se extrae.
      Files: specs nuevos en `apps/api/src/modules/{auth,audit,process,user,grant}/`
      Verify: `npm run test:unit` — todos los specs nuevos y existentes pasan.

- [ ] 12. Endurecer el módulo `catalog` sin romper `/catalogs`.
      Aplicar `CurrentUserGuard` + `@Roles(JEFE_AREA)` a `POST`/`PATCH` de `catalog.controller.ts`; mantener `GET` sin `@Roles` (lectura con actor). Mover las mutaciones del service a `prisma.$transaction` invocando `AuditService.record` (objectType=CATALOG_ITEM, scopeProcessId=null). Importar `AuthModule`/`AuditModule` en `catalog.module.ts`. No cambiar la forma de respuesta ni el GET.
      Files: `apps/api/src/modules/catalog/catalog.controller.ts`, `catalog.service.ts`, `catalog.module.ts`, `catalog.service.spec.ts` (ajustar mocks a la tx/audit)
      Verify: `npm run test:unit` (specs de catalog pasan) y `npm run typecheck:api`.

- [ ] 13. Añadir `DELETE` a CORS.
      En `apps/api/src/app.config.ts` cambiar `methods: ['GET','POST','PATCH']` a `['GET','POST','PATCH','DELETE']`.
      Files: `apps/api/src/app.config.ts`
      Verify: `npm run typecheck:api`.

- [ ] 14. Regenerar el contrato OpenAPI y el api-client, y committear artefactos.
      `npm run contracts:generate` (genera `apps/api/openapi/openapi.json` y `packages/api-client/src/generated/schema.d.ts`). Verificar que aparecen los nuevos endpoints/DTOs. Committear ambos artefactos.
      Files: `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts`
      Verify: `npm run typecheck:api-client` y `npm run build:api-client` pasan; `git status` muestra los artefactos actualizados.

- [ ] 15. Frontend: cliente de API con `X-Actor-Id` y contexto de actor.
      En `apps/web/src/lib/api-client.ts` añadir middleware `client.use({ onRequest })` que inyecta `X-Actor-Id` leyendo `actorId` de `localStorage` (§5.3). Crear wrappers tipados `apps/web/src/lib/me.ts`, `team.ts`, `audit.ts`, `dev-actors.ts` siguiendo el patrón de `catalog.ts` (traducción de status a mensajes, sin exponer JSON/Prisma). Proveedor/estado de actor en cliente.
      Files: `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/{me,team,audit,dev-actors}.ts`
      Verify: `npm run typecheck:web`.

- [ ] 16. Frontend: layout con sidebar agrupado + selector de usuario dev.
      Reescribir `apps/web/src/app/layout.tsx` con los 6 grupos (Inicio, Demanda, Seguimiento, Activos, Administración, Gobierno), cada ítem con su `moduleKey`; filtrar por `allowedModules` de `GET /me/permissions` (§5.2). Selector de usuario (shadcn `Select`) poblado desde `GET /dev/actors`, guarda `identifier` en `localStorage`. HTML semántico (`<nav aria-label>`, `aria-current`). `page.tsx` redirige a `/inicio`.
      Files: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
      Verify: `npm run typecheck:web`.

- [ ] 17. Frontend: pantallas funcionales + placeholders.
      Placeholders claros "En construcción" para Inicio/Demanda/Seguimiento/Activos (menú y gating reales). Funcionales: `gobierno/mis-permisos/page.tsx` (SCR-23, todos), `gobierno/equipo/page.tsx` (SCR-22, solo jefe: CRUD usuarios/grants), `gobierno/auditoria/page.tsx` (SCR-21, lectura con alcance), `administracion/maestras/page.tsx` (SCR-18, reutiliza `CatalogsView`). Mantener `apps/web/src/app/catalogs/page.tsx` operativo. Estados loading/vacío/error/éxito en todas (patrón `catalogs-view.tsx`); AC-031: formularios conservan valores ante error, `reset` solo en éxito. Labels accesibles.
      Files: `apps/web/src/app/{inicio,mi-trabajo,demanda,seguimiento,activos}/**/page.tsx`, `apps/web/src/app/gobierno/{mis-permisos,equipo,auditoria}/page.tsx`, `apps/web/src/app/administracion/maestras/page.tsx`
      Verify: `npm run typecheck:web` y `npm run build:web`.

- [ ] 18. Verificación de cierre.
      Ejecutar en orden: `npm run prisma:validate`; `npm run typecheck`; `npm run contracts:generate` (sin cambios pendientes sin committear); `npm run build` (api→api-client→web); `npm run test:unit`. Arrancar la API (`npm run dev:api`) con PostgreSQL arriba y verificar manualmente: `GET /health` 200; `GET /dev/actors` lista actores sin header; `GET /me/permissions` con `X-Actor-Id: jefe@demo.local`; control negativo (líder BI pide recurso de FIAA → 404; integrante → auditoría ajena denegada; no-jefe → `POST /processes` 403). Confirmar que `/catalogs` sigue operativo.
      Files: —
      Verify: todos los comandos anteriores pasan; verificación manual confirma los controles negativos y `/catalogs`.

## Fuera de alcance (no implementar)

Auth real/login/invitación/provisión; `ProcessScopeGuard`/entidad `Area`; reglas marcadas P en specs/28 (fórmula de prioridad, Excel, transiciones terminales, matriz de frameworks, permiso por campo); notificaciones/SLA/integración externa/firma/tareas programadas; retención/paginación real/exportación de auditoría. Resto de pantallas = placeholders. Ver §8 del diseño.
