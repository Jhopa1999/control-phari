# Implementation Plan · Fase 4 · Capacidad y asignaciones (control-phari)

> Plan derivado del diseño APROBADO en `.agents/tasks/fase4-capacidad/design.md` (2.ª iteración,
> design-review APPROVED). No reabre decisiones de diseño ni inventa reglas marcadas `P`.
> Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase4-capacidad` (todas las
> rutas abajo son relativas a esa raíz salvo que se indique absoluta). Para git usar
> `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase4-capacidad`.
>
> Comandos reales del repo (de `package.json`): `npm run typecheck`, `npm run build`,
> `npm run test:unit` (= jest en apps/api), `npm run test:e2e` (playwright),
> `npm run contracts:generate` (= `openapi:generate` + `api-client:generate`),
> migración desde `apps/api`: `npm run prisma:migrate:dev -- --name fase4_capacidad` y
> `npm run prisma:generate`. No inventar comandos.
>
> Patrones heredados confirmados en código: scope en el `where` del service +
> `findFirst({ where: { AND: [{ id }, scopeWhere(actor)] } })` → `NotFoundException` (404)
> (`apps/api/src/modules/request/request.service.ts`); mutación + `AuditService.record(tx, …)`
> dentro de `prisma.$transaction`; P2002 → `ConflictException` vía try/catch alrededor de la
> transacción (`user.service.ts`/`process.service.ts`/`catalog.service.ts`); contrato HTTP
> POST 201 / PATCH 200 + DTO / DELETE 204 `@HttpCode(204)` (`phase.controller.ts`); spec de orden
> de rutas del módulo (`request.module.spec.ts`); DTOs request/response separados con
> `@nestjs/swagger`; wrapper tipado en `apps/web/src/lib/*` con clase de error + `messageForStatus`
> y tipos derivados de `components['schemas'][...]` (`catalog.ts`, `team.ts`, `api-client.ts`).

---

- [ ] 1. Añadir los modelos `MonthlyAvailability` y `Assignment` al schema Prisma, con relaciones inversas en `User`, `Process` y `Request`, sin tocar modelos de Fases 1–3.
      Siguiendo design §1.2: PK `String @id @default(uuid()) @db.Uuid`; columnas `snake_case` vía `@map`; `month DateTime @db.Date`; `availableHours`/`committedHours` `Int`; FKs `onDelete: Restrict`; `description String?` en `Assignment`. Índices e índices únicos: `MonthlyAvailability` → `@@unique([userId, month], name: "monthly_availability_user_month_unique")`, `@@index([month])`, `@@map("monthly_availabilities")`; `Assignment` → `@@index([userId, month])`, `@@index([processId])`, `@@index([requestId])`, `@@map("assignments")` (SIN `@@unique` estricto, design §1.2/D3). Añadir las relaciones inversas: `User` (`monthlyAvailabilities`, `assignments` con `@relation("AssignmentUser")`), `Process` (`assignments`), `Request` (`assignments`).
      Files: `apps/api/prisma/schema.prisma`
      Verify: `cd apps/api && npm run prisma:format && npm run prisma:validate` — formatea sin errores y el schema valida.

- [ ] 2. Generar la migración versionada `fase4_capacidad` y regenerar el client Prisma.
      Depende de 1. Con la base de datos levantada (`npm run db:up` si hace falta), desde `apps/api` ejecutar `npm run prisma:migrate:dev -- --name fase4_capacidad` (NUNCA `db push`), que crea `apps/api/prisma/migrations/<ts>_fase4_capacidad/migration.sql` con las tablas `monthly_availabilities` y `assignments`, sus FKs, el `@@unique` compuesto y los índices; luego `npm run prisma:generate`. No se añaden seeds (no hay catálogo nuevo). Las tablas de Fases 1–3 no se modifican.
      Files: `apps/api/prisma/migrations/<ts>_fase4_capacidad/migration.sql` (generado), `apps/api/src/generated/prisma/*` (regenerado)
      Verify: la migración aplica sin error y `npm run typecheck:api` compila con los nuevos modelos del client generado.

- [ ] 3. Ampliar `AuditObjectType` con `MONTHLY_AVAILABILITY` y `ASSIGNMENT`.
      En `audit.service.ts` añadir ambos valores al union `AuditObjectType` (design §1.5). El set de `AuditAction` NO cambia. No tocar `record`/`findMany`.
      Files: `apps/api/src/modules/audit/audit.service.ts`
      Verify: `npm run typecheck:api` — compila; el union acepta los dos nuevos literales.

- [ ] 4. Crear el helper de mes `month.ts` (funciones puras) con sus pruebas unit.
      En `apps/api/src/modules/capacity/month.ts` implementar `monthStringToDate(m: string): Date` → `new Date(Date.UTC(yyyy, mm-1, 1))` y `dateToMonthString(d: Date): string` → `YYYY-MM` en UTC (design §1.3). La validación del patrón `^\d{4}-(0[1-9]|1[0-2])$` vive en el DTO (paso 7); `month.ts` asume formato válido pero el round-trip debe ser estable. Añadir `month.spec.ts` cubriendo: `monthStringToDate('2025-03')` → `2025-03-01T00:00:00.000Z`; `dateToMonthString` inverso; round-trip `date→string→date`.
      Files: `apps/api/src/modules/capacity/month.ts`, `apps/api/src/modules/capacity/month.spec.ts`
      Verify: `npm run test:unit` — las pruebas de `month` pasan.

- [ ] 5. Crear `CapacityScopeService` con el helper `scopedUserIds(tx, actor)` y la resolución de personas en alcance.
      En `apps/api/src/modules/capacity/capacity-scope.service.ts` implementar `scopedUserIds(tx, actor): Promise<'ALL' | string[]>` exactamente como design §2.6.1: jefe → `'ALL'`; resto → set con `actor.userId` + (si `actor.scopedProcessIds.size > 0`) los `userId` con grant `active:true` en `processId ∈ scopedProcessIds` (`tx.grant.findMany({ distinct: ['userId'] })`). Exponer también `listPeople(actor): Promise<CapacityPersonDto[]>` que resuelve con el mismo helper (integrante → él; líder → él + personas de sus procesos; jefe → `User.active = true`) y devuelve `{ id, name, identifier }`. El servicio recibe `PrismaService` y acepta un `tx` opcional para reutilizarse dentro de `$transaction`.
      Files: `apps/api/src/modules/capacity/capacity-scope.service.ts`
      Verify: compila con `npm run typecheck:api`; su comportamiento se prueba en el paso 11 (service spec).

- [ ] 6. Crear los DTOs de request del módulo capacity con `class-validator` + `@nestjs/swagger`.
      En `apps/api/src/modules/capacity/dto/` crear (design §3.4): `create-availability.dto.ts` (`userId @IsUUID`, `month @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)`, `availableHours @IsInt @Min(0)`); `update-availability.dto.ts` (`availableHours @IsInt @Min(0)`, único campo); `create-assignment.dto.ts` (`userId @IsUUID`, `month @Matches(...)`, `processId @IsUUID`, `requestId @IsUUID @IsOptional`, `committedHours @IsInt @Min(0)`, `description @IsString @MaxLength(2000) @IsOptional`); `update-assignment.dto.ts` (`processId? @IsUUID`, `requestId? @IsUUID`, `committedHours? @IsInt @Min(0)`, `description? @IsString @MaxLength(2000)`, todos `@IsOptional`; sin `userId`/`month`); `summary-query.dto.ts` y `list-availability.dto.ts` (`month @Matches(...)` requerido); `list-assignments.dto.ts` (`month @Matches(...)` req. + `processId?`/`userId?`/`requestId?` `@IsUUID @IsOptional`). Cada campo con `@ApiProperty`/`@ApiPropertyOptional`.
      Files: `apps/api/src/modules/capacity/dto/create-availability.dto.ts`, `update-availability.dto.ts`, `create-assignment.dto.ts`, `update-assignment.dto.ts`, `summary-query.dto.ts`, `list-availability.dto.ts`, `list-assignments.dto.ts`
      Verify: `npm run typecheck:api` — compila.

- [ ] 7. Crear los DTOs de response del módulo capacity.
      En `apps/api/src/modules/capacity/dto/` crear con `@ApiProperty` (design §3.4): `availability-response.dto.ts` (`{ id, userId, month: string 'YYYY-MM', availableHours, createdAt, updatedAt }`); `assignment-response.dto.ts` (`{ id, userId, month, processId, requestId: string|null, committedHours, description: string|null, createdAt, updatedAt }`); `capacity-person.dto.ts` (`{ id, name, identifier }`); `capacity-summary-row.dto.ts` (`{ userId, userName, month, disponible: number|null, comprometido: number, utilizacion: number|null, libre: number|null, estado: 'OK'|'SOBRECARGA'|'SIN_DISPONIBILIDAD'|'CARGA_PARCIAL', sobrecargado: boolean, cargaParcial: boolean }`). Usar `nullable: true` en los campos opcionales/`null`.
      Files: `apps/api/src/modules/capacity/dto/availability-response.dto.ts`, `assignment-response.dto.ts`, `capacity-person.dto.ts`, `capacity-summary-row.dto.ts`
      Verify: `npm run typecheck:api` — compila.

- [ ] 8. Implementar `CapacityService` con disponibilidad, asignaciones, resumen y auditoría.
      Depende de 3–7. En `apps/api/src/modules/capacity/capacity.service.ts` (patrón `request.service.ts`): inyectar `PrismaService`, `AuditService`, `CapacityScopeService`. Implementar:
      - `scopeWhereAvailability(scoped)` / helpers que arman el `where` con `month` + (`userId ∈ scopedUserIds` salvo `'ALL'`), design §2.4.
      - **Disponibilidad crear** (`create`): normaliza `month` con `monthStringToDate`; valida alcance de escritura sobre la persona (integrante con `userId` del body ≠ el suyo → `ForbiddenException` 403; persona fuera de `scopedUserIds` del líder → `NotFoundException` 404, design D8/FINDING 6); crea + `AuditService.record` (CREATE MONTHLY_AVAILABILITY, `scopeProcessId: null`) en `$transaction`; try/catch P2002 → `ConflictException` 409 (design §2.1/D7). Devuelve `AvailabilityResponseDto` con `dateToMonthString`.
      - **Disponibilidad editar** (`updateAvailability`): resuelve por `id` con `findFirst` + `scopedUserIds` → 404; valida `availableHours >= 0`; update + Audit UPDATE en `$transaction`. No cambia `userId`/`month`.
      - **Asignación crear/editar/borrar**: `create` valida `processId` requerido en alcance (404 si fuera), `requestId` opcional resuelto con `findFirst` aplicando el `scopeWhere` de Request (`{ AND: [{ id: requestId }, scopeWhere(actor)] }`) → 404 si no existe/fuera de alcance (NUNCA 400, design §2.2/FINDING 3), alcance de la persona (403 integrante ajeno / 404), sin gate de sobreasignación (design D5); `update` por `id` en alcance (404), permite `processId`/`requestId`/`committedHours`/`description`; `remove` por `id` en alcance (404), DELETE. Cada mutación + Audit (`scopeProcessId: processId`) en `$transaction`.
      - **Lecturas**: `listAvailability(actor, dto)`, `listAssignments(actor, dto)` (filtros `processId?`/`userId?`/`requestId?` intersectados con el alcance), ambas con el `where` de alcance.
      - **Resumen** (`summary(actor, month)`): design §1.4/§2.4 — por persona en alcance con disponibilidad o asignaciones ese mes: `disponible` (o `null`), `comprometido` = suma de `committedHours` visibles en alcance, `utilizacion` = `disponible>0 ? round(comprometido/disponible*100) : null`, `libre` = `disponible − comprometido` (puede ser negativo), `sobrecargado = libre<0`, `estado` ∈ `OK|SOBRECARGA|SIN_DISPONIBILIDAD|CARGA_PARCIAL`. `cargaParcial`: jefe siempre `false` (ve total agregado, AC-013); líder/integrante → `count(asignaciones de la persona/mes con processId ∉ scopedProcessIds) > 0` → `true`, y en ese caso `utilizacion`/`libre` = `null`, `estado = 'CARGA_PARCIAL'` (consulta de existencia, no revela horas/procesos ajenos).
      Files: `apps/api/src/modules/capacity/capacity.service.ts`
      Verify: `npm run typecheck:api` — compila; comportamiento cubierto por el paso 11.

- [ ] 9. Implementar `CapacityController` (controller fino) con todos los endpoints y Swagger.
      Depende de 6–8. En `apps/api/src/modules/capacity/capacity.controller.ts` (patrón `phase.controller.ts`): `@ApiTags('capacity')`, `@Controller('capacity')`, `@UseGuards(CurrentUserGuard, RolesGuard)`, `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)`, `@CurrentActor()`. Endpoints (design §3.3): `GET /capacity/summary` (SummaryQueryDto), `GET /capacity/people`, `GET /capacity/availability` (ListAvailabilityDto), `POST /capacity/availability` (201), `PATCH /capacity/availability/:id` (`ParseUUIDPipe`, 200 + DTO), `GET /capacity/assignments` (ListAssignmentsDto), `POST /capacity/assignments` (201), `PATCH /capacity/assignments/:id` (200 + DTO), `DELETE /capacity/assignments/:id` (`@HttpCode(204)`). Rutas estáticas (`summary`, `people`, `availability`, `assignments`) no colisionan con las paramétricas (`availability/:id`, `assignments/:id`); documentar con `@ApiOperation`/`@ApiResponse`/`@ApiBody`/`@ApiParam`/`@ApiQuery` igual que los controllers existentes.
      Files: `apps/api/src/modules/capacity/capacity.controller.ts`
      Verify: `npm run typecheck:api` — compila.

- [ ] 10. Crear `CapacityModule` y registrarlo en `AppModule`.
      Depende de 5, 8, 9. En `apps/api/src/modules/capacity/capacity.module.ts`: `imports: [PrismaModule, AuthModule, AuditModule]`, `controllers: [CapacityController]`, `providers: [CapacityService, CapacityScopeService]`. Registrar `CapacityModule` en `apps/api/src/app.module.ts` junto a los existentes (sin tocarlos). Añadir `apps/api/src/modules/capacity/capacity.module.spec.ts` que fije el contrato de rutas del módulo (patrón `request.module.spec.ts`): verifica que `CapacityController` está registrado (no hay colisión estática/paramétrica que requiera orden especial, pero el spec documenta el contrato).
      Files: `apps/api/src/modules/capacity/capacity.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/modules/capacity/capacity.module.spec.ts`
      Verify: `npm run test:unit` — el module spec pasa y la app arranca el módulo (compila con `npm run build:api`).

- [ ] 11. Escribir las pruebas unit de `CapacityService` (reglas, alcance, validaciones, auditoría, duplicado).
      Depende de 8. En `apps/api/src/modules/capacity/capacity.service.spec.ts` con `PrismaService` y `AuditService` mockeados (patrón `*.service.spec.ts` existente). Cubrir design §6: resumen (160/120 → util 75, libre 40, OK; comprometido>disponible → libre<0, SOBRECARGA, sobrecargado true sin lanzar; disponible 0/ausente → util null, SIN_DISPONIBILIDAD; dos procesos → jefe suma ambos cargaParcial false, líder parcial cargaParcial true util/libre null); validaciones (fracción → 400, negativa → 400, 0 permitido); duplicado (segundo POST disponibilidad persona/mes → 409 P2002; PATCH edita); alcance (integrante crea con `userId` ajeno → 403; integrante lee/edita/borra ajeno por `:id` → 404; líder asignación de proceso ajeno por `:id` → 404; crear asignación con `processId` fuera de alcance → 404; `requestId` de Request fuera de alcance → 404 no 400; `scopedUserIds` jefe = `'ALL'`; lectura nunca devuelve filas fuera de `scopedUserIds`); sobreasignación no bloquea (libre<0 → crea OK); auditoría (cada mutación invoca `record` con objectType y scopeProcessId correctos — null disponibilidad, processId asignación — dentro de `$transaction`); acceso Prisma (`MonthlyAvailability` por clave compuesta; `id`+alcance con `findFirst`).
      Files: `apps/api/src/modules/capacity/capacity.service.spec.ts`
      Verify: `npm run test:unit` — todas las pruebas nuevas de capacity pasan.

- [ ] 12. Regenerar el contrato OpenAPI + api-client y committear los artefactos generados.
      Depende de 9, 10. Desde la raíz: `npm run contracts:generate` (= `openapi:generate` → `apps/api/openapi/openapi.json` + `api-client:generate` → `packages/api-client/src/generated/schema.d.ts`). Verificar que aparecen los schemas nuevos (`CreateAvailabilityDto`, `AvailabilityResponseDto`, `CreateAssignmentDto`, `AssignmentResponseDto`, `CapacityPersonDto`, `CapacitySummaryRowDto`, etc.) y las rutas `/capacity/*`. Committear `apps/api/openapi/openapi.json` + `packages/api-client/src/generated/*`.
      Files: `apps/api/openapi/openapi.json` (regenerado), `packages/api-client/src/generated/schema.d.ts` (regenerado)
      Verify: `npm run typecheck:api-client` — compila con el schema regenerado; `grep` de `/capacity/summary` en `openapi.json` confirma la ruta (comprobación auxiliar, no sustituye el typecheck).

- [ ] 13. Añadir los tipos de capacity en `api-client.ts` y crear el wrapper tipado `capacity.ts`.
      Depende de 12. En `apps/web/src/lib/api-client.ts` añadir los `export type` derivados de `components['schemas'][...]` para los DTOs nuevos (Availability, CreateAvailability, UpdateAvailability, Assignment, CreateAssignment, UpdateAssignment, CapacityPerson, CapacitySummaryRow). Crear `apps/web/src/lib/capacity.ts` (patrón `catalog.ts`/`team.ts`): clase `CapacityError` + `messageForStatus` (traduce 400/403/404/409 a mensajes legibles sin exponer JSON/Prisma; 409 = "Ya hay disponibilidad para esa persona y mes; edítala") y funciones `listCapacitySummary(month)`, `listCapacityPeople()`, `listAvailability(month)`, `createAvailability(input): Promise<Availability>`, `updateAvailability(id, input): Promise<Availability>`, `listAssignments(filters)`, `createAssignment(input): Promise<Assignment>`, `updateAssignment(id, input): Promise<Assignment>`, `deleteAssignment(id): Promise<void>` (204 sin body).
      Files: `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/capacity.ts`
      Verify: `npm run typecheck:web` — compila con los tipos derivados del contrato.

- [ ] 14. Construir la pantalla SCR-17 real en `/activos/capacidad`.
      Depende de 13. Reemplazar `apps/web/src/app/activos/capacidad/page.tsx` (hoy `UnderConstruction`) por SCR-17 (design §4.1): selector de mes `YYYY-MM` (`<input type="month">` con `<label>`); tabla de resumen por persona (persona, disponible, comprometido, utilización %, libre) con badge accesible "Sobrecarga" (`sobrecargado`), "Sin disponibilidad" (`SIN_DISPONIBILIDAD`) y "Carga parcial" (`CARGA_PARCIAL`, muestra disponible/comprometido informativos, util/libre como "—", nota accesible); formulario de disponibilidad (mes, persona vía `/capacity/people` — fija al propio para integrante, horas `>=0`; ante 409 ofrece editar la existente); formulario de asignación (mes, proceso en alcance, persona, solicitud opcional en alcance, horas `>=0`, descripción) con lista editar/borrar; estados loading/vacío/error/éxito (Skeleton, bloque de error con "Reintentar", vacío con acción de crear, toast sonner); AC-031: el `reset` solo en éxito, ante error el formulario conserva valores y foco; explicación en lenguaje llano de utilización y sobrecarga; HTML semántico y `aria-*`. Usar solo componentes shadcn ya presentes (Select, Input, Table, Badge, Skeleton, toast); añadir solo los que falten. Mantener intactas Fases 1–3 y `/catalogs`.
      Files: `apps/web/src/app/activos/capacidad/page.tsx` (+ componentes auxiliares bajo esa ruta si hacen falta)
      Verify: `npm run typecheck:web` y `npm run build:web` — compilan sin errores.

- [ ] 15. Verificación de integración de cierre (steering) y confirmación de que Fases 1–3 siguen operativas.
      Depende de 1–14. Desde la raíz ejecutar en orden: `npm run typecheck`, `npm run build`, `npm run test:unit`, `npm run contracts:generate` (confirmar que no deja diffs sin committear). Si el entorno lo permite, `npm run test:e2e` para el flujo FLOW-007/UC-011/US-007 (verificar durante implementación: requiere API+web+DB levantados; si no se puede ejecutar aquí, dejarlo documentado como pendiente de ejecución y verificar los controles negativos del design §6 vía unit). Confirmar que la migración `fase4_capacidad` está aplicada y que `/catalogs`, `/catalog-items`, demanda (Fase 2) y plan/tareas (Fase 3) siguen operativas.
      Files: — (solo verificación; corregir en los pasos anteriores lo que falle)
      Verify: `npm run typecheck && npm run build && npm run test:unit` pasan en verde; `npm run contracts:generate` no produce cambios pendientes.

## Notas de verificación durante implementación (no bloqueantes para el plan)

- **E2E Playwright**: el flujo completo (FLOW-007, controles negativos 403/404/400, contrato 200/204)
  requiere servicios levantados; ejecutarlo en el paso 15 o documentar como pendiente si el entorno
  del loop no puede levantar API+web+DB. Los controles de reglas/alcance/validación están cubiertos
  por unit (paso 11), que es la red de seguridad principal (steering 30-pruebas: priorizar reglas,
  permisos, validaciones, errores, flujos críticos).
- **Visibilidad de auditoría de disponibilidad**: `scopeProcessId = null` implica que no aparece en la
  vista de auditoría por proceso de Fase 1 para líder/jefe (sí para el integrante por `actorUserId`).
  Es una consecuencia documentada y reversible (design §1.5); no se "arregla" en Fase 4.
